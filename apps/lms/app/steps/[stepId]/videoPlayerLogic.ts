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
    isCompleted || (dur > 0 && maxWatchedSec >= dur * 0.95);

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
