/**
 * Pure helper functions for CompulsoryVideoPlayer:
 * - Anti-skip boundary validation
 * - Rewind and Rewatch calculation
 * - Timestamp formatting
 */

export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || isNaN(seconds) || seconds < 0) {
    return "00:00";
  }
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);

  if (h > 0) {
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

export interface SeekValidationResult {
  allowed: boolean;
  effectiveTime: number;
  reason?: string;
}

/**
 * Validates a requested seek position against compulsory anti-skip rules:
 * - Rewinding (backward seek) is ALWAYS allowed up to 0s.
 * - Rewatching (seek to 0s) is ALWAYS allowed without losing watched credit.
 * - Seeking within previously watched territory (target <= maxWatched + 1.0s) is ALLOWED.
 * - Seeking ahead into unwatched territory is STRICTLY BLOCKED unless already completed.
 */
export function validateSeek(
  targetTime: number,
  lastValidTime: number,
  maxWatchedSec: number,
  durationSec: number,
  isCompleted: boolean
): SeekValidationResult {
  const safeTarget = Math.max(0, Number.isFinite(targetTime) ? targetTime : 0);
  const dur = Number.isFinite(durationSec) && durationSec > 0 ? durationSec : 0;
  const isEffectivelyCompleted =
    isCompleted ||
    (dur > 0 && (dur - maxWatchedSec <= 30 || maxWatchedSec >= dur * 0.95));

  if (isEffectivelyCompleted) {
    const clamped = dur > 0 ? Math.min(dur, safeTarget) : safeTarget;
    return { allowed: true, effectiveTime: clamped };
  }

  // Seeking backward (rewind or rewatch)
  if (safeTarget <= lastValidTime) {
    return { allowed: true, effectiveTime: safeTarget };
  }

  // Seeking forward within watched territory (allowed buffer: +1.0s)
  if (safeTarget <= maxWatchedSec + 1.0) {
    return { allowed: true, effectiveTime: safeTarget };
  }

  // Seeking ahead into unwatched content: BLOCKED
  return {
    allowed: false,
    effectiveTime: lastValidTime,
    reason: "Fast-forwarding is locked. You can rewind or rewatch viewed sections.",
  };
}

/**
 * Determines whether the user is eligible to advance to the next part:
 * - When the lesson is already marked completed
 * - OR when the video is left for 30 seconds or less (duration - current <= 30)
 */
export function isEligibleToAdvance({
  currentTime,
  durationSec,
  isCompleted = false,
}: {
  currentTime: number;
  durationSec: number;
  isCompleted?: boolean;
}): boolean {
  if (isCompleted) return true;
  const dur = Number.isFinite(durationSec) && durationSec > 0 ? durationSec : 0;
  const cur = Number.isFinite(currentTime) && currentTime > 0 ? currentTime : 0;
  if (dur <= 0) return false;
  if (dur <= 30) {
    return cur >= dur - 1.0 || cur >= dur * 0.9;
  }
  return dur - cur <= 30;
}

/**
 * Computes rewind target time safely clamped to 0.
 */
export function calculateRewindTarget(currentTime: number, rewindSeconds = 10): number {
  const current = Number.isFinite(currentTime) && currentTime > 0 ? currentTime : 0;
  return Math.max(0, current - rewindSeconds);
}

/**
 * Computes timeline click position from client coordinate.
 */
export function calculateTimelineSeekTime(
  clickX: number,
  trackWidth: number,
  durationSec: number
): number {
  if (!Number.isFinite(trackWidth) || trackWidth <= 0 || !Number.isFinite(durationSec) || durationSec <= 0) {
    return 0;
  }
  const ratio = Math.max(0, Math.min(1, clickX / trackWidth));
  return ratio * durationSec;
}

export interface VideoResumeData {
  positionSec: number;
  durationSec: number;
  updatedAt: number;
}

/**
 * Persists current video watch position to localStorage for 0ms instant resume
 */
export function saveLocalVideoResume(
  lessonId: string,
  positionSec: number,
  durationSec?: number
): void {
  if (typeof window === "undefined" || !lessonId) return;
  try {
    const safePos = Math.floor(Math.max(0, positionSec));
    if (safePos <= 0) return;
    const payload: VideoResumeData = {
      positionSec: safePos,
      durationSec: Math.floor(durationSec || 0),
      updatedAt: Date.now(),
    };
    localStorage.setItem(`wbm_video_resume_${lessonId}`, JSON.stringify(payload));
  } catch (e) {
    // quota or privacy mode safe
  }
}

/**
 * Retrieves persisted video watch position from localStorage
 */
export function getLocalVideoResume(lessonId: string): VideoResumeData | null {
  if (typeof window === "undefined" || !lessonId) return null;
  try {
    const raw = localStorage.getItem(`wbm_video_resume_${lessonId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.positionSec === "number" && parsed.positionSec > 0) {
      return parsed;
    }
  } catch (e) {
    // ignore corrupt data
  }
  return null;
}

/**
 * Clears local resume marker once video is fully completed
 */
export function clearLocalVideoResume(lessonId: string): void {
  if (typeof window === "undefined" || !lessonId) return;
  try {
    localStorage.removeItem(`wbm_video_resume_${lessonId}`);
  } catch (e) {}
}

/**
 * Immediately marks a lesson as completed locally so next parts unlock with 0ms lag
 */
export function saveLocalLessonCompletion(lessonId: string): void {
  if (typeof window === "undefined" || !lessonId) return;
  try {
    localStorage.setItem(`wbm_lesson_completed_${lessonId}`, "true");
  } catch (e) {}
}

export function isLocalLessonCompleted(lessonId: string): boolean {
  if (typeof window === "undefined" || !lessonId) return false;
  try {
    return localStorage.getItem(`wbm_lesson_completed_${lessonId}`) === "true";
  } catch (e) {
    return false;
  }
}

/**
 * Computes optimal resume timestamp combining server snapshot and local tracker
 */
export function determineResumePosition({
  initialPositionSec = 0,
  localResumeSec = 0,
  durationSec = 0,
  isCompleted = false,
}: {
  initialPositionSec?: number;
  localResumeSec?: number;
  durationSec?: number;
  isCompleted?: boolean;
}): { resumeSec: number; shouldResume: boolean } {
  // If video is already completed, allow starting fresh or rewatching
  if (isCompleted) {
    return { resumeSec: 0, shouldResume: false };
  }

  const effectivePos = Math.max(
    Number.isFinite(initialPositionSec) ? Math.floor(initialPositionSec) : 0,
    Number.isFinite(localResumeSec) ? Math.floor(localResumeSec) : 0
  );

  const dur = Number.isFinite(durationSec) && durationSec > 0 ? durationSec : 0;

  // Only resume if learner watched more than 5s and has not reached the very end (within 5s)
  if (effectivePos > 5 && (dur === 0 || effectivePos < dur - 5)) {
    return { resumeSec: effectivePos, shouldResume: true };
  }

  return { resumeSec: 0, shouldResume: false };
}
