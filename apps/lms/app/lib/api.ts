import { onThisHost } from "./host";

export const API_URL = onThisHost(process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000");

export function getAuthToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("token");
}

export function getAuthHeaders(): Record<string, string> {
  const token = getAuthToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  return headers;
}

export async function parseApiError(
  res: Response,
  fallback: string = "Request failed"
): Promise<{ message: string; status: number; data?: any }> {
  const data = await res.json().catch(() => null);
  const msg = data?.error?.message ?? data?.message ?? fallback;
  const message = Array.isArray(msg) ? msg.join(", ") : (typeof msg === "string" ? msg : fallback);
  return {
    message: message || `${fallback} (Status ${res.status})`,
    status: res.status,
    data,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// PROGRESSION TYPES (D1-033, D1-034, D1-041)
// ─────────────────────────────────────────────────────────────────────────────

export type LockReason =
  | "AGREEMENT_REQUIRED"
  | "ENROLMENT_NOT_ACTIVE"
  | "PREVIOUS_STEP_INCOMPLETE"
  | "QUIZ_NOT_PASSED"
  | "SCHEDULED_DATE_NOT_REACHED"
  | "MANUAL_LOCKED"
  | "LOCKED";

export type StepOverrideState = "AUTOMATIC" | "MANUAL_UNLOCKED" | "MANUAL_LOCKED";

export function getLockMessage(reason: LockReason | null | undefined): string {
  switch (reason) {
    case "AGREEMENT_REQUIRED":
      return "You must read and sign the Program Agreement before accessing this step.";
    case "ENROLMENT_NOT_ACTIVE":
      return "Enrolment is not active. Access to course steps is restricted.";
    case "PREVIOUS_STEP_INCOMPLETE":
      return "Please complete the previous step before accessing this step.";
    case "QUIZ_NOT_PASSED":
      return "You must pass the quiz in the previous step to unlock this step.";
    case "SCHEDULED_DATE_NOT_REACHED":
      return "This step is scheduled for release at a future date.";
    case "MANUAL_LOCKED":
      return "This step has been locked by instructor override.";
    default:
      return "This step is currently locked.";
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// AGREEMENT TYPES (D1-039, D1-040, D1-041)
// ─────────────────────────────────────────────────────────────────────────────

export interface ActiveAgreementResponse {
  templateId: string;
  templateTitle: string;
  templateDescription?: string | null;
  programId: string;
  programTitle: string;
  versionId: string;
  version: string;
  content: string;
  publishedAt: string;
}

export interface SignAgreementPayload {
  enrolmentId: string;
  versionId?: string;
  consentGiven: boolean;
  typedName: string;
  drawnSignature: string;
}

export interface SignedAgreementResponse {
  id: string;
  enrolmentId: string;
  programId: string;
  templateId: string;
  versionId: string;
  templateVersion: string;
  consentGiven: boolean;
  typedName: string;
  drawnSignature: string;
  signerIp: string;
  userAgent: string;
  status: string;
  signedAt: string;
  signedPdfUrl?: string | null;
}

export interface LessonProgressItem {
  lessonId: string;
  order: number;
  title: string;
  type: string;
  durationSec: number | null;
  isCompleted: boolean;
  progressPercent?: number;
  lastPositionSec?: number | null;
  completedAt?: string | null;
}

export interface QuizProgressItem {
  quizId: string;
  questionCount: number;
  passMark: number;
  isPassed: boolean;
  bestScore: number | null;
  attemptsCount: number;
}

export interface StepProgressionItem {
  stepId: string;
  sequence: number;
  title: string;
  releaseSchedule: "IMMEDIATE" | "COHORT_START_RELATIVE" | "SPECIFIC_DATE";
  unlockDelayDays: number | null;
  scheduledUnlockDate: string | null;
  isUnlocked: boolean;
  unlockedAt: string | null;
  overrideState: StepOverrideState;
  overrideReason: string | null;
  overriddenAt: string | null;
  overriddenById: string | null;
  isCompleted: boolean;
  completedAt: string | null;
  lockReason: LockReason | null;
  lessons: LessonProgressItem[];
  quiz: QuizProgressItem | null;
  progressPercent?: number;
  completedItems?: number;
  totalItems?: number;
}

export interface EnrolmentProgressionResponse {
  enrolmentId: string;
  programId: string;
  programTitle: string;
  batchId: string;
  batchName: string;
  batchStartDate: string;
  enrolmentStatus:
    | "ACTIVE"
    | "PENDING_PAYMENT"
    | "PENDING_AGREEMENT"
    | "WAITLIST"
    | "REVOKED"
    | "COMPLETED"
    | "CANCELLED"
    | "NOT_ENROLLED";
  overallProgressPercent: number;
  currentStepSequence: number;
  steps: StepProgressionItem[];
  totalItems?: number;
  completedItems?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// QUIZ ENGINE TYPES (D1-036, D1-037)
// ─────────────────────────────────────────────────────────────────────────────

export interface QuizOption {
  id: string;
  text: string;
  order: number;
}

export interface QuizQuestion {
  id: string;
  text: string;
  type: string;
  points: number;
  options: QuizOption[];
}

export interface ActiveQuizAttempt {
  attemptId: string;
  attemptNumber: number;
  quizId: string;
  stepId?: string;
  status: "IN_PROGRESS" | "PASSED" | "FAILED";
  passMark: number;
  questionCount: number;
  timeLimitMin?: number | null;
  startedAt: string;
  completedAt?: string | null;
  score?: number | null;
  passed?: boolean;
  questions?: QuizQuestion[];
  // Retry metadata present when previous attempt completed
  attemptsUsed?: number;
  maxAttempts?: number;
  attemptsRemaining?: number;
  isCooldownActive?: boolean;
  cooldownHours?: number;
  cooldownUntil?: string | null;
  cooldownSecondsRemaining?: number | null;
  canRetry?: boolean;
  retryGuidance?: string | null;
  stepToRevisit?: {
    id: string;
    sequence: number;
    title: string;
  } | null;
}

export interface QuizSubmissionResult {
  attemptId: string;
  attemptNumber: number;
  quizId: string;
  score: number;
  passed: boolean;
  status: "PASSED" | "FAILED";
  passMark: number;
  totalQuestions: number;
  correctCount: number;
  completedAt: string;
  retryGuidance: string | null;
  attemptsUsed: number;
  maxAttempts: number;
  attemptsRemaining: number;
  isCooldownActive: boolean;
  cooldownHours: number;
  cooldownUntil: string | null;
  cooldownSecondsRemaining: number | null;
  canRetry: boolean;
  stepToRevisit: {
    id: string;
    sequence: number;
    title: string;
  } | null;
}
