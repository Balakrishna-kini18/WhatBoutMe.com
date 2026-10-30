import { describe, it, expect, beforeEach } from "vitest";
import {
  formatTime,
  validateSeek,
  calculateRewindTarget,
  calculateTimelineSeekTime,
  determineResumePosition,
  isEligibleToAdvance,
  getQualityTransformedUrl,
  VIDEO_QUALITY_OPTIONS,
  saveLocalVideoAudioPreferences,
  getLocalVideoAudioPreferences,
} from "./videoPlayerLogic";

class MemoryStorage {
  private store = new Map<string, string>();
  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  clear(): void {
    this.store.clear();
  }
}

describe("CompulsoryVideoPlayer Logic & Edge Cases", () => {
  const mockStorage = new MemoryStorage();

  beforeEach(() => {
    mockStorage.clear();
    Object.defineProperty(globalThis, "window", {
      value: { localStorage: mockStorage },
      writable: true,
      configurable: true,
    });
    Object.defineProperty(globalThis, "localStorage", {
      value: mockStorage,
      writable: true,
      configurable: true,
    });
  });
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

  describe("isEligibleToAdvance (Advance when 30 seconds left)", () => {
    it("returns true when lesson is already marked isCompleted", () => {
      expect(
        isEligibleToAdvance({
          currentTime: 10,
          durationSec: 542,
          isCompleted: true,
        })
      ).toBe(true);
    });

    it("returns false when more than 30 seconds remain", () => {
      // 542s total (9:02) - 500s = 42s remaining
      expect(
        isEligibleToAdvance({
          currentTime: 500,
          durationSec: 542,
          isCompleted: false,
        })
      ).toBe(false);
    });

    it("returns true when 30 seconds or less remain", () => {
      // 542s total - 512s = exactly 30s remaining
      expect(
        isEligibleToAdvance({
          currentTime: 512,
          durationSec: 542,
          isCompleted: false,
        })
      ).toBe(true);

      // 542s total - 525s = 17s remaining
      expect(
        isEligibleToAdvance({
          currentTime: 525,
          durationSec: 542,
          isCompleted: false,
        })
      ).toBe(true);
    });

    it("handles short clips <= 30s correctly", () => {
      expect(
        isEligibleToAdvance({
          currentTime: 5,
          durationSec: 20,
          isCompleted: false,
        })
      ).toBe(false);

      expect(
        isEligibleToAdvance({
          currentTime: 19,
          durationSec: 20,
          isCompleted: false,
        })
      ).toBe(true);
    });
  });

  describe("getQualityTransformedUrl and Video Quality Settings", () => {
    it("has exact quality levels specified in design (Auto, 1080p, 720p, 540p, 360p, 224p)", () => {
      expect(VIDEO_QUALITY_OPTIONS).toEqual([
        "Auto",
        "1080p",
        "720p",
        "540p",
        "360p",
        "224p",
      ]);
    });

    it("returns original URL when quality is Auto", () => {
      const url = "https://res.cloudinary.com/demo/video/upload/v1234/sample.mp4";
      expect(getQualityTransformedUrl(url, "Auto")).toBe(url);
    });

    it("transforms Cloudinary URLs with target resolution", () => {
      const url = "https://res.cloudinary.com/demo/video/upload/v1234/sample.mp4";
      expect(getQualityTransformedUrl(url, "1080p")).toBe(
        "https://res.cloudinary.com/demo/video/upload/c_limit,h_1080,q_auto/v1234/sample.mp4"
      );
      expect(getQualityTransformedUrl(url, "720p")).toBe(
        "https://res.cloudinary.com/demo/video/upload/c_limit,h_720,q_auto/v1234/sample.mp4"
      );
      expect(getQualityTransformedUrl(url, "540p")).toBe(
        "https://res.cloudinary.com/demo/video/upload/c_limit,h_540,q_auto/v1234/sample.mp4"
      );
      expect(getQualityTransformedUrl(url, "360p")).toBe(
        "https://res.cloudinary.com/demo/video/upload/c_limit,h_360,q_auto/v1234/sample.mp4"
      );
      expect(getQualityTransformedUrl(url, "224p")).toBe(
        "https://res.cloudinary.com/demo/video/upload/c_limit,h_224,q_auto/v1234/sample.mp4"
      );
    });

    it("replaces existing Cloudinary transformation parameter smoothly", () => {
      const existingTransformedUrl =
        "https://res.cloudinary.com/demo/video/upload/q_auto/v1234/sample.mp4";
      expect(getQualityTransformedUrl(existingTransformedUrl, "720p")).toBe(
        "https://res.cloudinary.com/demo/video/upload/c_limit,h_720,q_auto/v1234/sample.mp4"
      );
    });

    it("appends quality query parameters for local / media stream endpoints", () => {
      const streamUrl = "http://localhost:4000/media/stream/video-123.mp4?token=abc";
      const transformed = getQualityTransformedUrl(streamUrl, "720p");
      expect(transformed).toContain("quality=720p");
      expect(transformed).toContain("h=720");
      expect(transformed).toContain("token=abc");
    });
  });

  describe("saveLocalVideoAudioPreferences and getLocalVideoAudioPreferences", () => {
    it("returns default preferences when nothing is stored", () => {
      localStorage.clear();
      expect(getLocalVideoAudioPreferences()).toEqual({
        isMuted: false,
        volume: 1,
        playbackSpeed: 1,
      });
    });

    it("persists and retrieves mute, volume, and speed across lessons", () => {
      localStorage.clear();
      saveLocalVideoAudioPreferences({ isMuted: true, volume: 0 });
      const prefs = getLocalVideoAudioPreferences();
      expect(prefs.isMuted).toBe(true);
      expect(prefs.volume).toBe(0);
      expect(prefs.playbackSpeed).toBe(1);

      saveLocalVideoAudioPreferences({ playbackSpeed: 2 });
      const updatedPrefs = getLocalVideoAudioPreferences();
      expect(updatedPrefs.isMuted).toBe(true);
      expect(updatedPrefs.volume).toBe(0);
      expect(updatedPrefs.playbackSpeed).toBe(2);
    });

    it("clamps volume safely between 0 and 1", () => {
      saveLocalVideoAudioPreferences({ volume: 1.5 });
      expect(getLocalVideoAudioPreferences().volume).toBe(1);

      saveLocalVideoAudioPreferences({ volume: -0.2 });
      expect(getLocalVideoAudioPreferences().volume).toBe(0);
    });
  });
});

