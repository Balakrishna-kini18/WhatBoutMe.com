import { describe, it, expect } from "vitest";
import {
  formatTime,
  validateSeek,
  calculateRewindTarget,
  calculateTimelineSeekTime,
  determineResumePosition,
} from "./videoPlayerLogic";

describe("CompulsoryVideoPlayer Logic & Edge Cases", () => {
  describe("formatTime", () => {
    it("handles zero and positive seconds correctly", () => {
      expect(formatTime(0)).toBe("00:00");
      expect(formatTime(8)).toBe("00:08");
      expect(formatTime(65)).toBe("01:05");
      expect(formatTime(3665)).toBe("1:01:05");
    });

    it("gracefully handles invalid and edge inputs", () => {
      expect(formatTime(NaN)).toBe("00:00");
      expect(formatTime(-10)).toBe("00:00");
      expect(formatTime(Infinity)).toBe("00:00");
    });
  });

  describe("calculateRewindTarget", () => {
    it("rewinds by requested seconds", () => {
      expect(calculateRewindTarget(45, 10)).toBe(35);
      expect(calculateRewindTarget(15, 10)).toBe(5);
    });

    it("clamps safely to 0 without going negative", () => {
      expect(calculateRewindTarget(5, 10)).toBe(0);
      expect(calculateRewindTarget(0, 10)).toBe(0);
      expect(calculateRewindTarget(-5, 10)).toBe(0);
    });
  });

  describe("calculateTimelineSeekTime", () => {
    it("maps click X ratio to total duration", () => {
      expect(calculateTimelineSeekTime(500, 1000, 120)).toBe(60);
      expect(calculateTimelineSeekTime(250, 1000, 100)).toBe(25);
    });

    it("clamps out-of-bounds clicks", () => {
      expect(calculateTimelineSeekTime(-50, 1000, 100)).toBe(0);
      expect(calculateTimelineSeekTime(1500, 1000, 100)).toBe(100);
    });

    it("handles 0 track width or 0 duration safely", () => {
      expect(calculateTimelineSeekTime(10, 0, 100)).toBe(0);
      expect(calculateTimelineSeekTime(10, 500, 0)).toBe(0);
    });
  });

  describe("validateSeek (Anti-Skip vs Rewind / Rewatch)", () => {
    it("ALLOWS rewinding to any earlier position", () => {
      // Current at 80s, maxWatched at 80s, user rewinds to 20s
      const result = validateSeek(20, 80, 80, 120, false);
      expect(result.allowed).toBe(true);
      expect(result.effectiveTime).toBe(20);
    });

    it("ALLOWS rewatching from 0s at any point", () => {
      // User is at 90s, rewatches from 0s
      const result = validateSeek(0, 90, 90, 120, false);
      expect(result.allowed).toBe(true);
      expect(result.effectiveTime).toBe(0);
    });

    it("ALLOWS seeking forward within previously watched territory", () => {
      // Learner rewound to 10s earlier, now jumps forward to 40s (maxWatched is 60s)
      const result = validateSeek(40, 10, 60, 120, false);
      expect(result.allowed).toBe(true);
      expect(result.effectiveTime).toBe(40);
    });

    it("BLOCKS fast-forwarding into unwatched territory", () => {
      // Learner is at 30s, maxWatched is 30s, attempts to seek to 90s
      const result = validateSeek(90, 30, 30, 120, false);
      expect(result.allowed).toBe(false);
      expect(result.effectiveTime).toBe(30); // Reverted to lastValidTime
      expect(result.reason).toContain("Fast-forwarding is locked");
    });

    it("ALLOWS seeking anywhere when lesson is already COMPLETED", () => {
      // Completed lesson: learner can freely jump anywhere
      const result1 = validateSeek(110, 10, 120, 120, true);
      expect(result1.allowed).toBe(true);
      expect(result1.effectiveTime).toBe(110);

      // Even if flag is false, if maxWatchedSec >= duration * 0.95 it is effectively completed
      const result2 = validateSeek(115, 20, 118, 120, false);
      expect(result2.allowed).toBe(true);
      expect(result2.effectiveTime).toBe(115);
    });

    it("tolerates minor 1-second drift buffer", () => {
      // Normal playback small jump (31s when maxWatched is 30.5s)
      const result = validateSeek(31, 30.5, 30.5, 120, false);
      expect(result.allowed).toBe(true);
    });
  });

  describe("determineResumePosition (Video Tracker / Resume Logic)", () => {
    it("resumes from half hour (1800s) on a 1-hour video (3600s)", () => {
      const res = determineResumePosition({
        initialPositionSec: 1800,
        localResumeSec: 1800,
        durationSec: 3600,
        isCompleted: false,
      });
      expect(res.shouldResume).toBe(true);
      expect(res.resumeSec).toBe(1800);
    });

    it("prioritizes the furthest position between server snapshot and local storage", () => {
      const res = determineResumePosition({
        initialPositionSec: 1200,
        localResumeSec: 1850,
        durationSec: 3600,
        isCompleted: false,
      });
      expect(res.shouldResume).toBe(true);
      expect(res.resumeSec).toBe(1850);
    });

    it("does not force resume if video is already completed (allows starting fresh or rewatching)", () => {
      const res = determineResumePosition({
        initialPositionSec: 3600,
        durationSec: 3600,
        isCompleted: true,
      });
      expect(res.shouldResume).toBe(false);
      expect(res.resumeSec).toBe(0);
    });

    it("does not force resume if learner only watched less than 5 seconds", () => {
      const res = determineResumePosition({
        initialPositionSec: 3,
        durationSec: 3600,
        isCompleted: false,
      });
      expect(res.shouldResume).toBe(false);
      expect(res.resumeSec).toBe(0);
    });

    it("does not force resume if learner is at the very end of the video (within 5 seconds of duration)", () => {
      const res = determineResumePosition({
        initialPositionSec: 3598,
        durationSec: 3600,
        isCompleted: false,
      });
      expect(res.shouldResume).toBe(false);
    });
  });
});

