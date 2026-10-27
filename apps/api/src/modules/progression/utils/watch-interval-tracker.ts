/**
 * WatchIntervalTracker
 * 
 * Pure utility for tamper-resistant media progress tracking.
 * - Merges watched time intervals [startSec, endSec]
 * - Enforces server elapsed time constraints (defeats scripted pings, multi-tab play)
 * - Blocks forward seek crediting on unwatched territory
 * - Computes total coverage and completion eligibility against server-authoritative duration
 * 
 * Reused across:
 * - Lesson video/audio progress (Phase 1)
 * - Session recorded video attendance (Phase 3)
 */

export type TimeRange = [number, number];

export interface ValidateHeartbeatOptions {
  existingRanges: TimeRange[] | null | undefined;
  lastHeartbeatAt?: Date | null;
  serverNow?: Date;
  fromSec?: number;
  toSec?: number;
  positionSec: number;
  furthestWatchedSec?: number;
  durationSec?: number | null;
  minWatchPercent?: number; // default 90%
  maxRate?: number; // default 2.0 (2x speed)
  toleranceSec?: number; // default 3.0s
  isAlreadyCompleted?: boolean;
}

export interface HeartbeatValidationResult {
  updatedRanges: TimeRange[];
  coveredSec: number;
  progressPercent: number;
  furthestWatchedSec: number;
  earnedCompletion: boolean;
  accepted: boolean;
  rejectReason?: string;
  creditedDeltaSec: number;
}

export class WatchIntervalTracker {
  /**
   * Merges a list of [start, end] intervals into disjoint, non-overlapping sorted intervals.
   * Also merges contiguous intervals within mergeToleranceSec (default 1.0s).
   */
  static mergeIntervals(ranges: TimeRange[], mergeToleranceSec: number = 1.0): TimeRange[] {
    if (!ranges || ranges.length === 0) return [];

    // Filter valid positive ranges where start <= end
    const valid = ranges
      .filter(([start, end]) => Number.isFinite(start) && Number.isFinite(end) && end >= start && start >= 0)
      .map(([start, end]) => [Math.max(0, start), Math.max(0, end)] as TimeRange);

    if (valid.length === 0) return [];

    // Sort by startSec ascending, then endSec ascending
    valid.sort((a, b) => a[0] - b[0] || a[1] - b[1]);

    const merged: TimeRange[] = [valid[0]];

    for (let i = 1; i < valid.length; i++) {
      const current = valid[i];
      const prev = merged[merged.length - 1];

      // If current interval overlaps or is contiguous within tolerance
      if (current[0] <= prev[1] + mergeToleranceSec) {
        prev[1] = Math.max(prev[1], current[1]);
      } else {
        merged.push([current[0], current[1]]);
      }
    }

    return merged;
  }

  /**
   * Computes the total covered duration in seconds across all disjoint intervals.
   */
  static calculateTotalCoverage(ranges: TimeRange[]): number {
    const merged = this.mergeIntervals(ranges);
    let totalSec = 0;
    for (const [start, end] of merged) {
      totalSec += Math.max(0, end - start);
    }
    return totalSec;
  }

  /**
   * Computes furthest watched position from ranges.
   */
  static getFurthestWatchedSec(ranges: TimeRange[]): number {
    let max = 0;
    for (const [, end] of ranges) {
      if (end > max) max = end;
    }
    return max;
  }

  /**
   * Validates and credits an incoming media playback heartbeat.
   * 
   * Server validation rules:
   * 1. Credited seconds <= (serverNow - lastHeartbeatAt) * maxRate + toleranceSec.
   * 2. On first watch (not already completed), fromSec <= furthestWatched + tolerance;
   *    otherwise reject crediting the segment (unwatched forward scrub).
   * 3. Authoritative duration must be known and > 0 to earn completion.
   * 4. Completion = coveredSec / durationSec >= minWatchPercent. (isEnded is ignored).
   */
  static validateAndCreditHeartbeat(options: ValidateHeartbeatOptions): HeartbeatValidationResult {
    const {
      existingRanges = [],
      lastHeartbeatAt,
      serverNow = new Date(),
      fromSec,
      toSec,
      positionSec,
      durationSec,
      minWatchPercent = 90,
      maxRate = 2.0,
      toleranceSec = 3.0,
      isAlreadyCompleted = false,
    } = options;

    const currentRanges = this.mergeIntervals(existingRanges || []);
    const knownFurthest = Math.max(
      options.furthestWatchedSec ?? 0,
      this.getFurthestWatchedSec(currentRanges)
    );

    // Determine candidate playback segment
    let segStart: number;
    let segEnd: number;

    if (fromSec !== undefined && toSec !== undefined) {
      if (!Number.isFinite(fromSec) || !Number.isFinite(toSec) || fromSec < 0 || toSec < fromSec) {
        const coveredSec = this.calculateTotalCoverage(currentRanges);
        const progressPercent = durationSec && durationSec > 0
          ? Math.min(100, (coveredSec / durationSec) * 100)
          : 0;

        return {
          updatedRanges: currentRanges,
          coveredSec,
          progressPercent,
          furthestWatchedSec: knownFurthest,
          earnedCompletion: isAlreadyCompleted,
          accepted: false,
          rejectReason: 'INVALID_SEGMENT_BOUNDS',
          creditedDeltaSec: 0,
        };
      }
      segStart = Math.max(0, fromSec);
      segEnd = Math.max(segStart, toSec);
    } else {
      // Fallback for legacy heartbeat: infer from positionSec and furthest watched
      const pos = Math.max(0, positionSec);
      segStart = Math.min(pos, knownFurthest);
      segEnd = pos;
    }

    // Clamp segEnd to authoritative duration if known
    if (durationSec && durationSec > 0) {
      segEnd = Math.min(segEnd, durationSec);
    }

    // Unwatched Forward Seek Gate:
    // If learner is not completed and attempts to start crediting past what they've watched + tolerance:
    if (!isAlreadyCompleted && segStart > knownFurthest + toleranceSec) {
      const coveredSec = this.calculateTotalCoverage(currentRanges);
      const progressPercent = durationSec && durationSec > 0
        ? Math.min(100, (coveredSec / durationSec) * 100)
        : 0;

      return {
        updatedRanges: currentRanges,
        coveredSec,
        progressPercent,
        furthestWatchedSec: knownFurthest,
        earnedCompletion: isAlreadyCompleted,
        accepted: false,
        rejectReason: 'FORWARD_SEEK_UNWATCHED',
        creditedDeltaSec: 0,
      };
    }

    // Server Elapsed Time Rate Limiter:
    // How many seconds elapsed on server since lastHeartbeatAt?
    const requestedDelta = Math.max(0, segEnd - segStart);

    let maxAllowedCredit: number;
    if (lastHeartbeatAt) {
      const elapsedServerMs = Math.max(0, serverNow.getTime() - new Date(lastHeartbeatAt).getTime());
      const elapsedServerSec = elapsedServerMs / 1000;
      maxAllowedCredit = elapsedServerSec * maxRate + toleranceSec;
    } else {
      // First heartbeat in session: allow up to reasonable initial segment (e.g. 15s * maxRate + tolerance)
      maxAllowedCredit = 15.0 * maxRate + toleranceSec;
    }

    // Clamp credited end to what could physically have been played
    if (requestedDelta > maxAllowedCredit) {
      segEnd = segStart + maxAllowedCredit;
      if (durationSec && durationSec > 0) {
        segEnd = Math.min(segEnd, durationSec);
      }
    }

    const creditedDeltaSec = Math.max(0, segEnd - segStart);

    let updatedRanges = currentRanges;
    let newFurthest = knownFurthest;

    if (creditedDeltaSec > 0) {
      updatedRanges = this.mergeIntervals([...currentRanges, [segStart, segEnd]]);
      newFurthest = Math.max(knownFurthest, segEnd);
    }

    const coveredSec = this.calculateTotalCoverage(updatedRanges);

    let progressPercent = 0;
    let earnedCompletion = isAlreadyCompleted;

    if (durationSec && durationSec > 0) {
      progressPercent = Math.min(100, Math.round((coveredSec / durationSec) * 10000) / 100);
      if (progressPercent >= minWatchPercent) {
        earnedCompletion = true;
      }
    }

    return {
      updatedRanges,
      coveredSec,
      progressPercent,
      furthestWatchedSec: newFurthest,
      earnedCompletion,
      accepted: true,
      creditedDeltaSec,
    };
  }
}
