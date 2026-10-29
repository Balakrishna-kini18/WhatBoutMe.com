import { describe, it, expect } from 'vitest';
import { WatchIntervalTracker, TimeRange } from './watch-interval-tracker.js';

describe('WatchIntervalTracker', () => {
  describe('mergeIntervals', () => {
    it('returns empty array for empty or null ranges', () => {
      expect(WatchIntervalTracker.mergeIntervals([])).toEqual([]);
      expect(WatchIntervalTracker.mergeIntervals(null as any)).toEqual([]);
    });

    it('merges overlapping intervals correctly', () => {
      const input: TimeRange[] = [
        [0, 15],
        [10, 25],
        [30, 45],
      ];
      const merged = WatchIntervalTracker.mergeIntervals(input);
      expect(merged).toEqual([
        [0, 25],
        [30, 45],
      ]);
    });

    it('merges contiguous intervals within tolerance (<= 1.0s gap)', () => {
      const input: TimeRange[] = [
        [0, 10],
        [10.5, 20],
      ];
      const merged = WatchIntervalTracker.mergeIntervals(input, 1.0);
      expect(merged).toEqual([[0, 20]]);
    });

    it('preserves disjoint non-overlapping intervals', () => {
      const input: TimeRange[] = [
        [0, 10],
        [20, 30],
        [40, 50],
      ];
      const merged = WatchIntervalTracker.mergeIntervals(input);
      expect(merged).toEqual([
        [0, 10],
        [20, 30],
        [40, 50],
      ]);
    });

    it('handles out-of-order and duplicate intervals', () => {
      const input: TimeRange[] = [
        [20, 30],
        [0, 10],
        [5, 12],
        [0, 10],
      ];
      const merged = WatchIntervalTracker.mergeIntervals(input);
      expect(merged).toEqual([
        [0, 12],
        [20, 30],
      ]);
    });
  });

  describe('calculateTotalCoverage', () => {
    it('sums disjoint durations correctly without double counting overlaps', () => {
      const ranges: TimeRange[] = [
        [0, 10],
        [5, 15], // merges with [0, 10] -> [0, 15] (15s)
        [20, 35], // 15s
      ];
      expect(WatchIntervalTracker.calculateTotalCoverage(ranges)).toBe(30);
    });
  });

  describe('validateAndCreditHeartbeat', () => {
    const durationSec = 300; // 5 minute video

    it('credits legitimate first watch interval at 1x speed', () => {
      const result = WatchIntervalTracker.validateAndCreditHeartbeat({
        existingRanges: [],
        positionSec: 15,
        fromSec: 0,
        toSec: 15,
        durationSec,
        minWatchPercent: 90,
      });

      expect(result.accepted).toBe(true);
      expect(result.creditedDeltaSec).toBe(15);
      expect(result.coveredSec).toBe(15);
      expect(result.progressPercent).toBe(5.0);
      expect(result.furthestWatchedSec).toBe(15);
      expect(result.earnedCompletion).toBe(false);
    });

    it('credits 2x speed playback when elapsed server time matches', () => {
      const lastHeartbeatAt = new Date('2026-10-23T12:00:00Z');
      const serverNow = new Date('2026-10-23T12:00:10Z'); // 10s elapsed on server

      const result = WatchIntervalTracker.validateAndCreditHeartbeat({
        existingRanges: [[0, 20]],
        lastHeartbeatAt,
        serverNow,
        fromSec: 20,
        toSec: 40, // 20s watched in 10s server time = 2.0x speed
        positionSec: 40,
        furthestWatchedSec: 20,
        durationSec,
        maxRate: 2.0,
        toleranceSec: 3.0,
      });

      expect(result.accepted).toBe(true);
      expect(result.creditedDeltaSec).toBe(20);
      expect(result.coveredSec).toBe(40);
      expect(result.furthestWatchedSec).toBe(40);
    });

    it('throttles impossible playback rate (> 2x speed) to server elapsed time * maxRate + tolerance', () => {
      const lastHeartbeatAt = new Date('2026-10-23T12:00:00Z');
      const serverNow = new Date('2026-10-23T12:00:05Z'); // 5s elapsed

      // Client claims it played 60s in 5s!
      const result = WatchIntervalTracker.validateAndCreditHeartbeat({
        existingRanges: [[0, 10]],
        lastHeartbeatAt,
        serverNow,
        fromSec: 10,
        toSec: 70, // 60s requested
        positionSec: 70,
        furthestWatchedSec: 10,
        durationSec,
        maxRate: 2.0,
        toleranceSec: 3.0,
      });

      expect(result.accepted).toBe(true);
      // max credit = 5s * 2.0 + 3.0 = 13s
      expect(result.creditedDeltaSec).toBe(13);
      expect(result.furthestWatchedSec).toBe(23);
      expect(result.updatedRanges).toEqual([[0, 23]]);
    });

    it('BLOCKS forward seek into unwatched territory on first watch', () => {
      // Learner has watched [0, 15]s. Then attempts to claim [120, 135]s.
      const result = WatchIntervalTracker.validateAndCreditHeartbeat({
        existingRanges: [[0, 15]],
        furthestWatchedSec: 15,
        fromSec: 120,
        toSec: 135,
        positionSec: 135,
        durationSec,
        isAlreadyCompleted: false,
      });

      expect(result.accepted).toBe(false);
      expect(result.rejectReason).toBe('FORWARD_SEEK_UNWATCHED');
      expect(result.creditedDeltaSec).toBe(0);
      expect(result.coveredSec).toBe(15);
      expect(result.furthestWatchedSec).toBe(15);
      expect(result.earnedCompletion).toBe(false);
    });

    it('ALLOWS jumping around if video is already completed', () => {
      // Completed learner rewatching at 120s
      const result = WatchIntervalTracker.validateAndCreditHeartbeat({
        existingRanges: [[0, 270]],
        furthestWatchedSec: 300,
        fromSec: 120,
        toSec: 130,
        positionSec: 130,
        durationSec,
        isAlreadyCompleted: true,
      });

      expect(result.accepted).toBe(true);
      expect(result.earnedCompletion).toBe(true);
    });

    it('does NOT award completion when coverage is strictly below 90% (e.g. 89.9%)', () => {
      // 300s video: 89.9% = 269.7s
      const result = WatchIntervalTracker.validateAndCreditHeartbeat({
        existingRanges: [[0, 260]],
        furthestWatchedSec: 260,
        fromSec: 260,
        toSec: 269.7,
        positionSec: 269.7,
        durationSec,
        minWatchPercent: 90,
      });

      expect(result.progressPercent).toBeCloseTo(89.9, 1);
      expect(result.earnedCompletion).toBe(false);
    });

    it('awards completion when coverage reaches 90.0% threshold', () => {
      // 300s video: 90.0% = 270s
      const result = WatchIntervalTracker.validateAndCreditHeartbeat({
        existingRanges: [[0, 260]],
        furthestWatchedSec: 260,
        fromSec: 260,
        toSec: 270,
        positionSec: 270,
        durationSec,
        minWatchPercent: 90,
      });

      expect(result.progressPercent).toBe(90.0);
      expect(result.earnedCompletion).toBe(true);
    });

    it('does NOT award completion if authoritative durationSec is null or 0', () => {
      const result = WatchIntervalTracker.validateAndCreditHeartbeat({
        existingRanges: [],
        positionSec: 300,
        fromSec: 0,
        toSec: 300,
        durationSec: null, // unknown server duration
      });

      expect(result.progressPercent).toBe(0);
      expect(result.earnedCompletion).toBe(false);
    });

    it('safely handles rewinds and rewatches without duplicating coverage', () => {
      // Already watched [0, 100]
      const result = WatchIntervalTracker.validateAndCreditHeartbeat({
        existingRanges: [[0, 100]],
        furthestWatchedSec: 100,
        fromSec: 20,
        toSec: 35, // rewound and rewatching part of [0, 100]
        positionSec: 35,
        durationSec,
      });

      expect(result.accepted).toBe(true);
      // Merged ranges remain [0, 100]
      expect(result.updatedRanges).toEqual([[0, 100]]);
      expect(result.coveredSec).toBe(100);
      expect(result.furthestWatchedSec).toBe(100);
    });
    it('handles 5-to-6 hour marathon video (21,600s) and awards completion at 90% (19,440s)', () => {
      const sixHoursSec = 21600;
      let ranges: TimeRange[] = [];
      let furthest = 0;
      let lastHeartbeat = new Date('2026-10-23T00:00:00Z');

      // Simulate 162 batches of 120 seconds (19,440s = exactly 90%)
      for (let step = 0; step < 162; step++) {
        const fromSec = step * 120;
        const toSec = (step + 1) * 120;
        const serverNow = new Date(lastHeartbeat.getTime() + 120000); // exactly 120s elapsed

        const result = WatchIntervalTracker.validateAndCreditHeartbeat({
          existingRanges: ranges,
          lastHeartbeatAt: lastHeartbeat,
          serverNow,
          fromSec,
          toSec,
          positionSec: toSec,
          furthestWatchedSec: furthest,
          durationSec: sixHoursSec,
          minWatchPercent: 90,
          maxRate: 2.0,
          toleranceSec: 3.0,
        });

        expect(result.accepted).toBe(true);
        ranges = result.updatedRanges;
        furthest = result.furthestWatchedSec;
        lastHeartbeat = serverNow;

        if (step === 161) {
          expect(result.earnedCompletion).toBe(true);
          expect(result.progressPercent).toBe(90.0);
          expect(result.coveredSec).toBe(19440);
        }
      }

      // Compacted range should be contiguous [[0, 19440]]
      expect(ranges).toEqual([[0, 19440]]);
    });

    it('clamps spoofed 6-hour jump (claims 21,600s in 5 wall-clock seconds) to max plausible delta', () => {
      const sixHoursSec = 21600;
      const lastHeartbeatAt = new Date('2026-10-23T12:00:00Z');
      const serverNow = new Date('2026-10-23T12:00:05Z'); // only 5 seconds elapsed

      const result = WatchIntervalTracker.validateAndCreditHeartbeat({
        existingRanges: [[0, 10]],
        lastHeartbeatAt,
        serverNow,
        fromSec: 10,
        toSec: 21600, // malicious jump
        positionSec: 21600,
        furthestWatchedSec: 10,
        durationSec: sixHoursSec,
        minWatchPercent: 90,
        maxRate: 2.0,
        toleranceSec: 3.0,
      });

      // Wall-clock rate limiter clamps credited delta to: 5s * 2.0 + 3.0 = 13.0s
      expect(result.accepted).toBe(true);
      expect(result.creditedDeltaSec).toBe(13);
      expect(result.coveredSec).toBe(23); // 10 + 13 = 23s
      expect(result.earnedCompletion).toBe(false);
      expect(result.progressPercent).toBeLessThan(1.0);
    });

    it('rejects forward seek into unwatched territory (fromSec > knownFurthest + tolerance)', () => {
      const sixHoursSec = 21600;
      const result = WatchIntervalTracker.validateAndCreditHeartbeat({
        existingRanges: [[0, 10]],
        fromSec: 5000, // skipped forward by 5000s
        toSec: 5015,
        positionSec: 5015,
        furthestWatchedSec: 10,
        durationSec: sixHoursSec,
        minWatchPercent: 90,
      });

      expect(result.accepted).toBe(false);
      expect(result.rejectReason).toBe('FORWARD_SEEK_UNWATCHED');
      expect(result.earnedCompletion).toBe(false);
      expect(result.creditedDeltaSec).toBe(0);
    });

    it('prevents replay loops: watching [0, 120] 50 times never inflates coverage beyond 120s', () => {
      const fiveHoursSec = 18000;
      let ranges: TimeRange[] = [[0, 120]];

      for (let i = 0; i < 50; i++) {
        const result = WatchIntervalTracker.validateAndCreditHeartbeat({
          existingRanges: ranges,
          fromSec: 0,
          toSec: 120,
          positionSec: 120,
          furthestWatchedSec: 120,
          durationSec: fiveHoursSec,
          minWatchPercent: 90,
        });

        expect(result.accepted).toBe(true);
        expect(result.coveredSec).toBe(120);
        ranges = result.updatedRanges;
      }

      expect(ranges).toEqual([[0, 120]]);
      expect(WatchIntervalTracker.calculateTotalCoverage(ranges)).toBe(120);
    });

    it('maintains sticky completion invariance when rewinding a completed lesson to start', () => {
      const duration = 18000;
      const result = WatchIntervalTracker.validateAndCreditHeartbeat({
        existingRanges: [[0, 18000]],
        furthestWatchedSec: 18000,
        fromSec: 0,
        toSec: 30, // user rewinds to 0:30
        positionSec: 30,
        durationSec: duration,
        isAlreadyCompleted: true,
      });

      expect(result.accepted).toBe(true);
      expect(result.earnedCompletion).toBe(true);
      expect(result.progressPercent).toBe(100);
      expect(result.coveredSec).toBe(18000);
    });

    it('sanitizes inverted ranges (fromSec > toSec)', () => {
      const result = WatchIntervalTracker.validateAndCreditHeartbeat({
        existingRanges: [],
        fromSec: 50,
        toSec: 20, // inverted
        positionSec: 20,
        durationSec: 300,
      });

      expect(result.accepted).toBe(false);
      expect(result.creditedDeltaSec).toBe(0);
    });
  });
});

