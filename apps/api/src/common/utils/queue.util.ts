/**
 * Generates a deterministic BullMQ jobId to enforce queue idempotency.
 * By explicitly setting a `jobId` in job options, BullMQ guarantees that
 * multiple attempts to add the same job (e.g. from rapid repeated clicks or
 * server crashes and retries) will be ignored if the job is already waiting
 * or active.
 *
 * @param jobType A string representing the type/action of the job (e.g., 'certificate-gen')
 * @param uniqueEntityId A unique identifier for the payload (e.g., userId, enrollmentId)
 * @param idempotencyKey Optional key for additional uniqueness per action
 * @returns A deterministic string to be used as `jobId` in BullMQ
 */
export function generateDeterministicJobId(
  jobType: string,
  uniqueEntityId: string | number,
  idempotencyKey?: string
): string {
  const baseId = `${jobType}:${uniqueEntityId}`;
  return idempotencyKey ? `${baseId}:${idempotencyKey}` : baseId;
}
