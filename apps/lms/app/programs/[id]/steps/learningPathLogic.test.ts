import { describe, it, expect } from "vitest";
import {
  computeMilestoneProgression,
  isStageUnlocked,
  formatCooldownTimer,
  getExamBadgeStatus,
  StepSummary,
} from "./learningPathLogic";

describe("LMS Learning Path Progression Logic", () => {
  const mock11Steps: StepSummary[] = Array.from({ length: 11 }, (_, i) => ({
    id: `step-${i + 1}`,
    sequence: i + 1,
    title: `Module ${i + 1}`,
    isCompleted: false,
  }));

  it("evaluates incomplete curriculum when some steps are unfinished", () => {
    const stepsWith4Done = mock11Steps.map((s, idx) => ({
      ...s,
      isCompleted: idx < 4,
    }));

    const state = computeMilestoneProgression({
      steps: stepsWith4Done,
      examAttempt: null,
      coachingSession: null,
      missionStatement: null,
    });

    expect(state.totalSteps).toBe(11);
    expect(state.completedSteps).toBe(4);
    expect(state.curriculumCompleted).toBe(false);
    expect(state.certificateUnlocked).toBe(false);

    expect(isStageUnlocked(1, state)).toBe(true);
    expect(isStageUnlocked(2, state)).toBe(false); // Exam locked
    expect(isStageUnlocked(4, state)).toBe(false); // Coaching locked
    expect(isStageUnlocked(5, state)).toBe(false); // Mission statement locked
    expect(isStageUnlocked(6, state)).toBe(false); // Certificate locked
  });

  it("unlocks Stage 2 Final Exam once all 11 steps are completed", () => {
    const stepsWithAllDone = mock11Steps.map((s) => ({
      ...s,
      isCompleted: true,
    }));

    const state = computeMilestoneProgression({
      steps: stepsWithAllDone,
      examAttempt: null,
      coachingSession: null,
      missionStatement: null,
    });

    expect(state.completedSteps).toBe(11);
    expect(state.curriculumCompleted).toBe(true);
    expect(isStageUnlocked(2, state)).toBe(true); // Exam now unlocked!
    expect(isStageUnlocked(4, state)).toBe(false); // Coaching still locked until exam passed
  });

  it("unlocks Stage 4 (1-on-1 Coaching) once Final Exam is passed (score >= 75%)", () => {
    const stepsWithAllDone = mock11Steps.map((s) => ({
      ...s,
      isCompleted: true,
    }));

    // Passing exam
    const state = computeMilestoneProgression({
      steps: stepsWithAllDone,
      examAttempt: { passed: true, score: 84, status: "PASSED" },
      coachingSession: null,
      missionStatement: null,
    });

    expect(state.examPassed).toBe(true);
    expect(isStageUnlocked(2, state)).toBe(true);
    expect(isStageUnlocked(4, state)).toBe(true); // Coaching unlocked!
    expect(isStageUnlocked(5, state)).toBe(false); // Mission statement still locked
  });

  it("unlocks Stage 5 (Mission Statement) once 1-on-1 Coaching is attended/completed", () => {
    const stepsWithAllDone = mock11Steps.map((s) => ({
      ...s,
      isCompleted: true,
    }));

    const state = computeMilestoneProgression({
      steps: stepsWithAllDone,
      examAttempt: { passed: true, score: 92, status: "PASSED" },
      coachingSession: { status: "COMPLETED", attended: true },
      missionStatement: null,
    });

    expect(state.coachingCompleted).toBe(true);
    expect(isStageUnlocked(5, state)).toBe(true); // Mission statement unlocked!
    expect(state.certificateUnlocked).toBe(false);
  });

  it("unlocks Certificate of Completion only when all 5 milestones are satisfied", () => {
    const stepsWithAllDone = mock11Steps.map((s) => ({
      ...s,
      isCompleted: true,
    }));

    const state = computeMilestoneProgression({
      steps: stepsWithAllDone,
      examAttempt: { passed: true, score: 92, status: "PASSED" },
      coachingSession: { status: "COMPLETED", attended: true },
      missionStatement: { status: "APPROVED" },
    });

    expect(state.certificateUnlocked).toBe(true);
    expect(isStageUnlocked(6, state)).toBe(true);
  });

  it("formats cooldown timers accurately", () => {
    expect(formatCooldownTimer(0)).toBe("Ready for retake");
    expect(formatCooldownTimer(-100)).toBe("Ready for retake");
    expect(formatCooldownTimer(3600)).toBe("1h 0m cooldown");
    expect(formatCooldownTimer(86400)).toBe("24h 0m cooldown");
    expect(formatCooldownTimer(1800)).toBe("30m cooldown");
  });

  it("formats exam score badges accurately", () => {
    expect(getExamBadgeStatus(undefined)).toEqual({
      label: "Not Attempted",
      color: "warning",
    });
    expect(getExamBadgeStatus(60, 75)).toEqual({
      label: "Failed (60%)",
      color: "danger",
    });
    expect(getExamBadgeStatus(75, 75)).toEqual({
      label: "Passed (75%)",
      color: "success",
    });
    expect(getExamBadgeStatus(94, 75)).toEqual({
      label: "Passed (94%)",
      color: "success",
    });
  });
});
