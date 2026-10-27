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

export interface CoachingTimeSlotOption {
  value: string;
  label: string;
  period: "Morning" | "Afternoon" | "Evening";
}

export const COACHING_TIME_SLOTS: CoachingTimeSlotOption[] = [
  { value: "09:00", label: "09:00 AM", period: "Morning" },
  { value: "10:00", label: "10:00 AM", period: "Morning" },
  { value: "11:00", label: "11:00 AM", period: "Morning" },
  { value: "12:00", label: "12:00 PM", period: "Afternoon" },
  { value: "14:00", label: "02:00 PM", period: "Afternoon" },
  { value: "15:00", label: "03:00 PM", period: "Afternoon" },
  { value: "16:00", label: "04:00 PM", period: "Afternoon" },
  { value: "17:00", label: "05:00 PM", period: "Evening" },
  { value: "18:00", label: "06:00 PM", period: "Evening" },
  { value: "19:00", label: "07:00 PM", period: "Evening" },
];

export interface CoachingDateCardOption {
  isoDate: string;
  dayShort: string;
  dayNumber: string;
  monthShort: string;
  fullLabel: string;
  isToday: boolean;
  isTomorrow: boolean;
}

export function formatLocalIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function isCoachingSlotInFuture(
  isoDate: string,
  time24: string,
  now: Date = new Date(),
): boolean {
  if (!isoDate || !time24) return false;
  const candidate = new Date(`${isoDate}T${time24}:00`);
  if (isNaN(candidate.getTime())) return false;
  return candidate.getTime() > now.getTime();
}

export function getUpcomingCoachingDateCards(
  baseDate: Date = new Date(),
  count = 7,
): CoachingDateCardOption[] {
  const cards: CoachingDateCardOption[] = [];
  const todayIso = formatLocalIsoDate(baseDate);
  // Start from today if at least one evening slot (19:00) is still in the future; otherwise start tomorrow
  const hasSlotToday = isCoachingSlotInFuture(todayIso, "19:00", baseDate);
  const startOffset = hasSlotToday ? 0 : 1;

  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const monthNames = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];

  for (let i = 0; i < count; i++) {
    const d = new Date(
      baseDate.getFullYear(),
      baseDate.getMonth(),
      baseDate.getDate() + startOffset + i,
    );
    const isoDate = formatLocalIsoDate(d);
    const dayShort = dayNames[d.getDay()] ?? "Day";
    const dayNumber = String(d.getDate()).padStart(2, "0");
    const monthShort = monthNames[d.getMonth()] ?? "Jan";
    const fullLabel = `${dayShort}, ${d.getDate()} ${monthShort} ${d.getFullYear()}`;

    cards.push({
      isoDate,
      dayShort,
      dayNumber,
      monthShort,
      fullLabel,
      isToday: startOffset + i === 0,
      isTomorrow: startOffset + i === 1,
    });
  }

  return cards;
}

export function formatCoachingSlotSummary(
  isoDate: string,
  time24: string,
): string {
  if (!isoDate || !time24) return "";
  const dt = new Date(`${isoDate}T${time24}:00`);
  if (isNaN(dt.getTime())) return "";
  const slotObj = COACHING_TIME_SLOTS.find((s) => s.value === time24);
  const timeLabel =
    slotObj?.label ||
    dt.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  const dateLabel = dt.toLocaleDateString("en-US", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  return `${dateLabel} at ${timeLabel}`;
}

export const STANDARD_COACHING_SLOT_MINUTES = 45;

export function buildCoachingRequestPayload(params: {
  enrolmentId?: string | null;
  preferredDate: string;
  preferredTime: string;
  notes?: string;
  learnerTimezone?: string;
  reschedule?: boolean;
  now?: Date;
}):
  | {
      ok: true;
      payload: {
        enrolmentId: string;
        requestedStart: string;
        requestedEnd: string;
        learnerTimezone: string;
        notes?: string;
        reschedule?: boolean;
      };
    }
  | {
      ok: false;
      error: string;
    } {
  const now = params.now || new Date();
  if (!params.enrolmentId || !params.enrolmentId.trim()) {
    return { ok: false, error: "Active enrolment is required to book a session." };
  }
  if (!params.preferredDate || !params.preferredTime) {
    return {
      ok: false,
      error: "Please select your preferred date and time slot.",
    };
  }

  const startDate = new Date(`${params.preferredDate}T${params.preferredTime}:00`);
  if (isNaN(startDate.getTime()) || startDate.getTime() <= now.getTime()) {
    return {
      ok: false,
      error: "Please choose a future date and time slot.",
    };
  }

  const endDate = new Date(
    startDate.getTime() + STANDARD_COACHING_SLOT_MINUTES * 60 * 1000,
  );
  const tz =
    params.learnerTimezone ||
    (typeof Intl !== "undefined"
      ? Intl.DateTimeFormat().resolvedOptions().timeZone
      : "UTC") ||
    "UTC";

  const trimmedNotes = params.notes?.trim();

  return {
    ok: true,
    payload: {
      enrolmentId: params.enrolmentId.trim(),
      requestedStart: startDate.toISOString(),
      requestedEnd: endDate.toISOString(),
      learnerTimezone: tz,
      ...(params.reschedule ? { reschedule: true } : {}),
      ...(trimmedNotes ? { notes: trimmedNotes } : {}),
    },
  };
}


export interface UnifiedJourneyMilestoneItem {
  id: "curriculum" | "exam" | "coaching" | "mission";
  title: string;
  isCompleted: boolean;
  isUnlocked: boolean;
  statusLabel: string;
  detail: string;
}

export interface UnifiedJourneyProgress {
  totalSteps: number;
  completedSteps: number;
  curriculumPercent: number;
  totalMilestones: number;
  completedMilestones: number;
  overallJourneyPercent: number;
  summaryLabel: string;
  milestones: UnifiedJourneyMilestoneItem[];
}

export function computeUnifiedJourneyProgress(params: {
  totalSteps: number;
  completedSteps: number;
  examPassed: boolean;
  examScore?: number | null;
  coachingCompleted: boolean;
  coachingStatus?: string | null;
  missionApproved: boolean;
  missionStatus?: string | null;
  curriculumPercent?: number;
}): UnifiedJourneyProgress {
  const totalSteps = Math.max(0, params.totalSteps || 0);
  const completedSteps = Math.min(totalSteps, Math.max(0, params.completedSteps || 0));
  const allStepsDone = totalSteps > 0 && completedSteps >= totalSteps;

  const examPassed = Boolean(params.examPassed);
  const coachingCompleted = Boolean(params.coachingCompleted);
  const missionApproved = Boolean(params.missionApproved);

  const totalMilestones = totalSteps + 3;
  let completedMilestones = completedSteps;
  if (examPassed) completedMilestones += 1;
  if (coachingCompleted) completedMilestones += 1;
  if (missionApproved) completedMilestones += 1;

  const overallJourneyPercent =
    totalMilestones > 0
      ? Math.round((completedMilestones / totalMilestones) * 100)
      : 0;

  const curriculumPercent =
    typeof params.curriculumPercent === "number"
      ? params.curriculumPercent
      : totalSteps > 0
      ? Math.round((completedSteps / totalSteps) * 100)
      : 0;

  const milestones: UnifiedJourneyMilestoneItem[] = [
    {
      id: "curriculum",
      title: "Curriculum Modules",
      isCompleted: allStepsDone,
      isUnlocked: true,
      statusLabel: allStepsDone ? "Completed" : `${completedSteps}/${totalSteps} Done`,
      detail: `${completedSteps} of ${totalSteps} modules completed`,
    },
    {
      id: "exam",
      title: "Final Examination",
      isCompleted: examPassed,
      isUnlocked: allStepsDone,
      statusLabel: examPassed
        ? `Passed${typeof params.examScore === "number" ? ` (${params.examScore}%)` : ""}`
        : allStepsDone
        ? "Ready for Exam"
        : "Locked",
      detail: examPassed ? "Passed with certificate qualification" : "50-question comprehensive exam",
    },
    {
      id: "coaching",
      title: "1-on-1 Coaching Session",
      isCompleted: coachingCompleted,
      isUnlocked: examPassed,
      statusLabel: coachingCompleted
        ? "Completed"
        : !examPassed
        ? "Locked"
        : params.coachingStatus === "APPROVED"
        ? "Scheduled"
        : params.coachingStatus === "PENDING_APPROVAL"
        ? "Pending Approval"
        : params.coachingStatus === "REJECTED"
        ? "Declined (Reapply Available)"
        : "Ready to Book",
      detail: coachingCompleted ? "1-on-1 session conducted with trainer" : "Dedicated session with Roweena / trainer",
    },
    {
      id: "mission",
      title: "Mission Statement",
      isCompleted: missionApproved,
      isUnlocked: coachingCompleted,
      statusLabel: missionApproved
        ? "Approved"
        : !coachingCompleted
        ? "Locked"
        : params.missionStatus === "SUBMITTED"
        ? "Under Review"
        : "Ready to Upload",
      detail: missionApproved ? "Personal mission statement approved" : "Signed transformation commitment",
    },
  ];

  return {
    totalSteps,
    completedSteps,
    curriculumPercent,
    totalMilestones,
    completedMilestones,
    overallJourneyPercent,
    summaryLabel: `${completedMilestones} of ${totalMilestones} milestones completed`,
    milestones,
  };
}
