import { describe, it, expect } from "vitest";
import {
  computeMilestoneProgression,
  computeUnifiedJourneyProgress,
  isStageUnlocked,
  formatCooldownTimer,
  getExamBadgeStatus,
  COACHING_TIME_SLOTS,
  formatLocalIsoDate,
  isCoachingSlotInFuture,
  getUpcomingCoachingDateCards,
  formatCoachingSlotSummary,
  buildCoachingRequestPayload,
  STANDARD_COACHING_SLOT_MINUTES,
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

  describe("1-on-1 Coaching Slot Selection & Duration-Free Booking Engine", () => {
    it("provides curated Morning, Afternoon, and Evening coaching time slots without requiring a duration dropdown", () => {
      expect(COACHING_TIME_SLOTS.length).toBeGreaterThanOrEqual(8);
      expect(COACHING_TIME_SLOTS.some((s) => s.period === "Morning")).toBe(true);
      expect(COACHING_TIME_SLOTS.some((s) => s.period === "Afternoon")).toBe(true);
      expect(COACHING_TIME_SLOTS.some((s) => s.period === "Evening")).toBe(true);
      expect(COACHING_TIME_SLOTS[0]).toEqual({
        value: "09:00",
        label: "09:00 AM",
        period: "Morning",
      });
    });

    it("formats local ISO dates accurately without UTC off-by-one shift", () => {
      const localDate = new Date(2026, 9, 27, 0, 15, 0); // Oct 27, 2026 00:15 local
      expect(formatLocalIsoDate(localDate)).toBe("2026-10-27");
    });

    it("generates 7 upcoming date cards starting today if evening slots remain, or tomorrow if past 7 PM", () => {
      const morningNow = new Date(2026, 9, 26, 9, 0, 0); // Oct 26, 2026 09:00 AM
      const morningCards = getUpcomingCoachingDateCards(morningNow, 7);
      expect(morningCards).toHaveLength(7);
      expect(morningCards[0]?.isoDate).toBe("2026-10-26");
      expect(morningCards[0]?.isToday).toBe(true);
      expect(morningCards[1]?.isTomorrow).toBe(true);

      const lateNightNow = new Date(2026, 9, 26, 21, 30, 0); // Oct 26, 2026 09:30 PM
      const lateNightCards = getUpcomingCoachingDateCards(lateNightNow, 7);
      expect(lateNightCards).toHaveLength(7);
      expect(lateNightCards[0]?.isoDate).toBe("2026-10-27");
      expect(lateNightCards[0]?.isTomorrow).toBe(true);
    });

    it("disables past time slots on today's date while keeping future slots enabled", () => {
      const now = new Date("2026-10-26T13:30:00");
      expect(isCoachingSlotInFuture("2026-10-26", "10:00", now)).toBe(false);
      expect(isCoachingSlotInFuture("2026-10-26", "12:00", now)).toBe(false);
      expect(isCoachingSlotInFuture("2026-10-26", "14:00", now)).toBe(true);
      expect(isCoachingSlotInFuture("2026-10-27", "09:00", now)).toBe(true);
    });

    it("builds a valid coaching request payload with automatic 45-min window and no duration input", () => {
      const now = new Date("2026-10-26T10:00:00");
      const res = buildCoachingRequestPayload({
        enrolmentId: "enrol-uuid-123",
        preferredDate: "2026-10-28",
        preferredTime: "10:00",
        notes: "  Breakthrough on Step 4 & Mission Statement prep  ",
        learnerTimezone: "Asia/Calcutta",
        now,
      });

      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.payload.enrolmentId).toBe("enrol-uuid-123");
        expect(res.payload.learnerTimezone).toBe("Asia/Calcutta");
        expect(res.payload.notes).toBe("Breakthrough on Step 4 & Mission Statement prep");
        const startMs = new Date(res.payload.requestedStart).getTime();
        const endMs = new Date(res.payload.requestedEnd).getTime();
        expect((endMs - startMs) / 60000).toBe(STANDARD_COACHING_SLOT_MINUTES);
      }
    });

    it("rejects past dates, missing fields, or missing enrolmentId gracefully", () => {
      const now = new Date("2026-10-26T15:00:00");

      const noEnrol = buildCoachingRequestPayload({
        enrolmentId: "",
        preferredDate: "2026-10-28",
        preferredTime: "10:00",
        now,
      });
      expect(noEnrol.ok).toBe(false);

      const pastSlot = buildCoachingRequestPayload({
        enrolmentId: "enrol-1",
        preferredDate: "2026-10-26",
        preferredTime: "10:00",
        now,
      });
      expect(pastSlot.ok).toBe(false);
      if (!pastSlot.ok) {
        expect(pastSlot.error).toContain("future date and time");
      }
    });

    it("formats human-readable slot summary for confirmation bar", () => {
      const summary = formatCoachingSlotSummary("2026-10-28", "14:00");
      expect(summary).toContain("2026");
      expect(summary).toContain("02:00 PM");
    });

    it("high-scale real-world simulation: 10,000 concurrent learner slot selections across global timezones", () => {
      const baseNow = new Date("2026-10-26T12:00:00Z");
      const timezones = ["Asia/Dubai", "Asia/Calcutta", "America/New_York", "Europe/London", "UTC"];

      for (let i = 0; i < 10000; i++) {
        const slot = COACHING_TIME_SLOTS[i % COACHING_TIME_SLOTS.length]!;
        const dayOffset = (i % 14) + 1;
        const targetDate = new Date(baseNow.getTime() + dayOffset * 86400000);
        const isoDate = formatLocalIsoDate(targetDate);
        const tz = timezones[i % timezones.length]!;

        const built = buildCoachingRequestPayload({
          enrolmentId: `enrolment-${i}`,
          preferredDate: isoDate,
          preferredTime: slot.value,
          learnerTimezone: tz,
          notes: i % 2 === 0 ? `Learner ${i} reflection` : "   ",
          now: baseNow,
        });

        expect(built.ok).toBe(true);
        if (built.ok) {
          expect(built.payload.enrolmentId).toBe(`enrolment-${i}`);
          expect(built.payload.learnerTimezone).toBe(tz);
          expect(new Date(built.payload.requestedEnd).getTime()).toBeGreaterThan(
            new Date(built.payload.requestedStart).getTime()
          );
        }
      }
    });
  });
  describe("computeUnifiedJourneyProgress - Unified Learning Path Milestones", () => {
    it("accurately evaluates user screenshot scenario: 2 steps done, exam passed, coaching pending, mission locked (3/5 = 60%)", () => {
      const progress = computeUnifiedJourneyProgress({
        totalSteps: 2,
        completedSteps: 2,
        examPassed: true,
        examScore: 98,
        coachingCompleted: false,
        coachingStatus: "PENDING_APPROVAL",
        missionApproved: false,
        missionStatus: null,
      });

      expect(progress.totalSteps).toBe(2);
      expect(progress.completedSteps).toBe(2);
      expect(progress.curriculumPercent).toBe(100);
      expect(progress.totalMilestones).toBe(5); // 2 steps + exam + coaching + mission
      expect(progress.completedMilestones).toBe(3); // 2 steps + 1 exam
      expect(progress.overallJourneyPercent).toBe(60); // 3 / 5 = 60%
      expect(progress.summaryLabel).toBe("3 of 5 milestones completed");

      const [curriculumM, examM, coachingM, missionM] = progress.milestones;
      expect(curriculumM?.isCompleted).toBe(true);
      expect(curriculumM?.statusLabel).toBe("Completed");

      expect(examM?.isCompleted).toBe(true);
      expect(examM?.statusLabel).toBe("Passed (98%)");

      expect(coachingM?.isCompleted).toBe(false);
      expect(coachingM?.statusLabel).toBe("Pending Approval");

      expect(missionM?.isCompleted).toBe(false);
      expect(missionM?.statusLabel).toBe("Locked");
    });

    it("evaluates 100% journey completion when all curriculum steps and certification gates are completed", () => {
      const progress = computeUnifiedJourneyProgress({
        totalSteps: 2,
        completedSteps: 2,
        examPassed: true,
        examScore: 100,
        coachingCompleted: true,
        coachingStatus: "COMPLETED",
        missionApproved: true,
        missionStatus: "APPROVED",
      });

      expect(progress.completedMilestones).toBe(5);
      expect(progress.totalMilestones).toBe(5);
      expect(progress.overallJourneyPercent).toBe(100);
      expect(progress.milestones.every((m) => m.isCompleted)).toBe(true);
    });

    it("evaluates early progress for beginner with 1 of 2 steps done and gates locked", () => {
      const progress = computeUnifiedJourneyProgress({
        totalSteps: 2,
        completedSteps: 1,
        examPassed: false,
        coachingCompleted: false,
        missionApproved: false,
      });

      expect(progress.completedMilestones).toBe(1);
      expect(progress.totalMilestones).toBe(5);
      expect(progress.overallJourneyPercent).toBe(20);
      expect(progress.curriculumPercent).toBe(50);
      expect(progress.summaryLabel).toBe("1 of 5 milestones completed");
    });

    it("evaluates coaching milestone as Declined (Reapply Available) when latest request is rejected", () => {
      const progress = computeUnifiedJourneyProgress({
        totalSteps: 2,
        completedSteps: 2,
        examPassed: true,
        examScore: 90,
        coachingCompleted: false,
        coachingStatus: "REJECTED",
        missionApproved: false,
      });

      const coachingM = progress.milestones.find((m) => m.id === "coaching");
      expect(coachingM?.isCompleted).toBe(false);
      expect(coachingM?.statusLabel).toBe("Declined (Reapply Available)");
    });
  });

});
