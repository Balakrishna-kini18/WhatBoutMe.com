import { describe, it, expect } from 'vitest';
import {
  isRegistrationDeadlinePassed,
  getRegistrationDeadlineCutoff,
} from './deadline.util.js';

describe('deadline.util', () => {
  describe('isRegistrationDeadlinePassed', () => {
    it('returns false for null or undefined deadlines', () => {
      expect(isRegistrationDeadlinePassed(null)).toBe(false);
      expect(isRegistrationDeadlinePassed(undefined)).toBe(false);
    });

    it('returns false for an invalid date string', () => {
      expect(isRegistrationDeadlinePassed('invalid-date')).toBe(false);
    });

    it('keeps a date-only (midnight UTC) deadline valid throughout that entire day', () => {
      const deadline = new Date('2026-10-30T00:00:00.000Z');

      // Earlier that day
      const morning = new Date('2026-10-30T08:30:00.000Z');
      expect(isRegistrationDeadlinePassed(deadline, morning)).toBe(false);

      // Late that day
      const evening = new Date('2026-10-30T23:59:58.000Z');
      expect(isRegistrationDeadlinePassed(deadline, evening)).toBe(false);

      // Next day starts: now expired
      const nextDay = new Date('2026-10-31T00:00:01.000Z');
      expect(isRegistrationDeadlinePassed(deadline, nextDay)).toBe(true);
    });

    it('handles explicit timestamp deadlines with sub-day precision', () => {
      const explicitDeadline = new Date('2026-10-30T14:00:00.000Z');

      // Before cutoff
      const before = new Date('2026-10-30T13:59:59.000Z');
      expect(isRegistrationDeadlinePassed(explicitDeadline, before)).toBe(false);

      // After cutoff
      const after = new Date('2026-10-30T14:00:01.000Z');
      expect(isRegistrationDeadlinePassed(explicitDeadline, after)).toBe(true);
    });
  });

  describe('getRegistrationDeadlineCutoff', () => {
    it('returns the UTC start of the current day', () => {
      const now = new Date('2026-10-30T17:45:12.345Z');
      const cutoff = getRegistrationDeadlineCutoff(now);

      expect(cutoff.toISOString()).toBe('2026-10-30T00:00:00.000Z');
    });
  });
});

