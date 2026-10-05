import { generateDeterministicJobId } from './queue.util.js';

describe('Queue Utilities', () => {
  describe('generateDeterministicJobId', () => {
    it('should combine jobType and uniqueEntityId without idempotencyKey', () => {
      const jobId = generateDeterministicJobId('cert-gen', 'user-123');
      expect(jobId).toBe('cert-gen:user-123');
    });

    it('should include idempotencyKey when provided', () => {
      const jobId = generateDeterministicJobId('payment-process', 456, 'invoice-789');
      expect(jobId).toBe('payment-process:456:invoice-789');
    });

    it('should generate identical IDs for identical inputs (Deterministic)', () => {
      const id1 = generateDeterministicJobId('email', 'student-99', 'welcome');
      const id2 = generateDeterministicJobId('email', 'student-99', 'welcome');
      expect(id1).toBe(id2);
    });

    it('should generate different IDs for different idempotency keys (Edge Case: Same user, different action)', () => {
      const id1 = generateDeterministicJobId('email', 'student-99', 'welcome');
      const id2 = generateDeterministicJobId('email', 'student-99', 'receipt');
      expect(id1).not.toBe(id2);
    });
  });
});
