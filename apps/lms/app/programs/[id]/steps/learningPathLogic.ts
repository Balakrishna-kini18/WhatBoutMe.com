/**
 * Core business and progression logic for the LMS Unified Learning Path.
 * Senior-developer testable pure functions.
 */

export interface StepSummary {
  id: string;
  sequence: number;
  title: string;
  isCompleted?: boolean;
}

export interface MilestoneProgressState {
  totalSteps: number;
  completedSteps: number;
  curriculumCompleted: boolean;
  examPassed: boolean;
  attendanceSatisfied: boolean;
  coachingCompleted: boolean;
  missionStatementApproved: boolean;
  certificateUnlocked: boolean;
}

export function computeMilestoneProgression(params: {
  steps: StepSummary[];
  userStepProgress?: Record<string, { isCompleted: boolean }>;
  examAttempt?: { passed?: boolean; score?: number; status?: string } | null;
  attendanceCompliance?: { status?: string } | null;
  coachingSession?: { status?: string; attended?: boolean } | null;
  missionStatement?: { status?: string } | null;
}): MilestoneProgressState {
  const steps = params.steps || [];
  const progressMap = params.userStepProgress || {};

  const totalSteps = steps.length;
  const completedSteps = steps.filter(
    (s) => s.isCompleted || progressMap[s.id]?.isCompleted,
  ).length;

  const curriculumCompleted = totalSteps > 0 && completedSteps >= totalSteps;
  const examPassed = Boolean(params.examAttempt?.passed);
  const attendanceSatisfied = params.attendanceCompliance?.status === "COMPLIANT";
  const coachingCompleted =
    Boolean(params.coachingSession?.attended) ||
    params.coachingSession?.status === "COMPLETED";
  const missionStatementApproved =
    params.missionStatement?.status === "APPROVED";

  const certificateUnlocked =
    curriculumCompleted &&
    examPassed &&
    coachingCompleted &&
    missionStatementApproved;

  return {
    totalSteps,
    completedSteps,
    curriculumCompleted,
    examPassed,
    attendanceSatisfied,
    coachingCompleted,
    missionStatementApproved,
    certificateUnlocked,
  };
}

export function isStageUnlocked(
  stageNumber: number,
  state: MilestoneProgressState,
): boolean {
  switch (stageNumber) {
    case 1:
      return true; // Curriculum is always open
    case 2:
      return state.curriculumCompleted; // Exam requires step 11 done
    case 3:
      return state.examPassed; // Attendance requirement
    case 4:
      return state.examPassed; // 1-on-1 Coaching unlocks after passing exam
    case 5:
      return state.coachingCompleted; // Mission statement unlocks after coaching
    case 6:
      return state.certificateUnlocked; // Certificate of completion
    default:
      return false;
  }
}

export function formatCooldownTimer(secondsRemaining: number): string {
  if (secondsRemaining <= 0) return "Ready for retake";
  const hrs = Math.floor(secondsRemaining / 3600);
  const mins = Math.floor((secondsRemaining % 3600) / 60);
  if (hrs > 0) {
    return `${hrs}h ${mins}m cooldown`;
  }
  return `${mins}m cooldown`;
}

export function getExamBadgeStatus(score?: number, passMark = 75): {
  label: string;
  color: "success" | "danger" | "warning";
} {
  if (typeof score !== "number") {
    return { label: "Not Attempted", color: "warning" };
  }
  if (score >= passMark) {
    return { label: `Passed (${score}%)`, color: "success" };
  }
  return { label: `Failed (${score}%)`, color: "danger" };
}
