/**
 * Core pure business logic for the LMS Final Exam & Step Quiz Runners.
 * Includes Dual-Layer (Instant localStorage + Server DB) Progress Persistence & Reconciliation.
 */

export interface ExamAnswerRecord {
  questionId: string;
  selectedOptionId?: string;
  selectedOptionIds?: string[];
  textResponse?: string;
}

export interface PersistedExamProgress {
  attemptId: string;
  examId: string;
  selectedAnswers: Record<string, string>;
  currentQuestionIndex: number;
  updatedAt: number;
}

export interface ExamQuestionDescriptor {
  id: string;
  type: string;
}

export interface ExamAnswerSubmissionPayload {
  questionId: string;
  optionId?: string;
  selectedOptionId?: string;
  optionIds?: string[];
  selectedOptionIds?: string[];
  textResponse?: string;
  textAnswer?: string;
}

export function computeRemainingSeconds(
  startedAt: string | Date,
  timeLimitMin: number,
  now: Date = new Date(),
): number {
  const startMs = new Date(startedAt).getTime();
  if (isNaN(startMs)) return 0;
  const totalAllowedMs = timeLimitMin * 60 * 1000;
  const elapsedMs = now.getTime() - startMs;
  const remainingMs = totalAllowedMs - elapsedMs;
  return Math.max(0, Math.floor(remainingMs / 1000));
}

export function formatExamTimer(secondsRemaining: number): string {
  const mins = Math.floor(secondsRemaining / 60);
  const secs = secondsRemaining % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

export function tallyAnswersProgress(
  answersMap: Record<string, ExamAnswerRecord>,
  totalQuestions: number,
): {
  answeredCount: number;
  unansweredCount: number;
  progressPercent: number;
} {
  const answeredCount = Object.values(answersMap).filter((ans) => {
    if (ans.selectedOptionId) return true;
    if (Array.isArray(ans.selectedOptionIds) && ans.selectedOptionIds.length > 0)
      return true;
    if (ans.textResponse && ans.textResponse.trim().length > 0) return true;
    return false;
  }).length;

  const unansweredCount = Math.max(0, totalQuestions - answeredCount);
  const progressPercent =
    totalQuestions > 0 ? Math.round((answeredCount / totalQuestions) * 100) : 0;

  return {
    answeredCount,
    unansweredCount,
    progressPercent,
  };
}

export function toggleMultiSelectOption(
  currentSelected: string[] = [],
  optionId: string,
): string[] {
  if (currentSelected.includes(optionId)) {
    return currentSelected.filter((id) => id !== optionId);
  }
  return [...currentSelected, optionId];
}

export function isAnswerComplete(answer?: ExamAnswerRecord): boolean {
  if (!answer) return false;
  if (answer.selectedOptionId) return true;
  if (Array.isArray(answer.selectedOptionIds) && answer.selectedOptionIds.length > 0)
    return true;
  if (answer.textResponse && answer.textResponse.trim().length > 0) return true;
  return false;
}

/**
 * Safely parses a fetch Response whose body may be empty (e.g., when NestJS returns `null`
 * for `GET /exams/:id/attempt` when no attempt exists yet, resulting in a 200 OK with `""`).
 * Prevents `SyntaxError: Failed to execute 'json' on 'Response': Unexpected end of JSON input`.
 */
export async function safeParseResponseJson<T = any>(
  res: Pick<Response, "text">,
): Promise<T | null> {
  try {
    const text = await res.text();
    if (!text || !text.trim()) return null;
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

/**
 * Extracts saved answers from any backend exam attempt payload shape
 * (supports top-level `data.savedAnswers` as well as nested `data.answers.savedAnswers`).
 */
export function extractServerSavedAnswers(attemptData: any): Record<string, string> {
  const restored: Record<string, string> = {};
  if (!attemptData || typeof attemptData !== "object") return restored;

  const rawList = Array.isArray(attemptData.savedAnswers)
    ? attemptData.savedAnswers
    : Array.isArray(attemptData.answers?.savedAnswers)
      ? attemptData.answers.savedAnswers
      : [];

  for (const ans of rawList) {
    if (!ans || typeof ans.questionId !== "string" || !ans.questionId.trim()) continue;
    const qId = ans.questionId.trim();

    if (Array.isArray(ans.selectedOptionIds) && ans.selectedOptionIds.length > 0) {
      const validIds = ans.selectedOptionIds.map((id: any) => String(id).trim()).filter(Boolean);
      if (validIds.length > 0) restored[qId] = validIds.join(",");
    } else if (Array.isArray(ans.optionIds) && ans.optionIds.length > 0) {
      const validIds = ans.optionIds.map((id: any) => String(id).trim()).filter(Boolean);
      if (validIds.length > 0) restored[qId] = validIds.join(",");
    } else if (typeof ans.selectedOptionId === "string" && ans.selectedOptionId.trim()) {
      restored[qId] = ans.selectedOptionId.trim();
    } else if (typeof ans.optionId === "string" && ans.optionId.trim()) {
      restored[qId] = ans.optionId.trim();
    } else if (typeof ans.textAnswer === "string" && ans.textAnswer.trim()) {
      restored[qId] = ans.textAnswer;
    } else if (typeof ans.textResponse === "string" && ans.textResponse.trim()) {
      restored[qId] = ans.textResponse;
    }
  }

  return restored;
}

/**
 * Extracts the server-saved question index from an attempt payload if present.
 */
export function extractServerQuestionIndex(
  attemptData: any,
  totalQuestions: number,
): number | null {
  if (!attemptData || typeof attemptData !== "object") return null;
  const rawIdx =
    typeof attemptData.currentQuestionIndex === "number"
      ? attemptData.currentQuestionIndex
      : typeof attemptData.answers?.currentQuestionIndex === "number"
        ? attemptData.answers.currentQuestionIndex
        : null;

  if (rawIdx === null || !Number.isFinite(rawIdx) || rawIdx < 0) return null;
  if (totalQuestions <= 0) return 0;
  return Math.min(Math.max(0, Math.floor(rawIdx)), totalQuestions - 1);
}

/**
 * Builds a clean, DTO-compliant array of answered questions for `PATCH /exams/:id/attempt/answers`
 * and `POST /exams/:id/submit`. Never emits empty strings for UUID fields.
 */
export function buildExamAnswersPayload(
  questions: ExamQuestionDescriptor[],
  selectedAnswers: Record<string, string>,
): ExamAnswerSubmissionPayload[] {
  const payload: ExamAnswerSubmissionPayload[] = [];
  if (!Array.isArray(questions)) return payload;

  for (const q of questions) {
    if (!q?.id) continue;
    const rawAns = selectedAnswers[q.id];
    if (typeof rawAns !== "string" || !rawAns.trim()) continue;

    const rawType = String(q.type || "").toUpperCase();
    const isText = rawType === "SHORT_ANSWER" || rawType === "TEXT_BOX";
    const isMulti = !isText && (rawType === "MULTI_SELECT" || rawType === "MULTIPLE_CHOICE");

    if (isMulti) {
      const ids = rawAns
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (ids.length === 0) continue;
      payload.push({
        questionId: q.id,
        selectedOptionIds: ids,
        optionIds: ids,
      });
    } else if (isText) {
      payload.push({
        questionId: q.id,
        textResponse: rawAns,
        textAnswer: rawAns,
      });
    } else {
      const optId = rawAns.trim();
      if (!optId) continue;
      payload.push({
        questionId: q.id,
        optionId: optId,
        selectedOptionId: optId,
      });
    }
  }

  return payload;
}

/**
 * Reconciles server-persisted exam progress with browser localStorage snapshot so that
 * refreshing the page (even within milliseconds of clicking an option or changing questions)
 * never loses a single answer or resets the current question position.
 */
export function reconcileExamProgress(params: {
  attemptData: any;
  localSnapshot: PersistedExamProgress | null;
}): {
  selectedAnswers: Record<string, string>;
  currentQuestionIndex: number;
  needsServerSync: boolean;
} {
  const { attemptData, localSnapshot } = params;
  const questions: Array<{ id: string }> = Array.isArray(attemptData?.questions)
    ? attemptData.questions
    : [];
  const validQuestionIds = new Set(questions.map((q) => q.id));
  const totalQuestions = questions.length;

  const serverAnswers = extractServerSavedAnswers(attemptData);
  const serverQuestionIndex = extractServerQuestionIndex(attemptData, totalQuestions);
  const serverUpdatedAtRaw =
    attemptData?.lastSavedAt ?? attemptData?.answers?.lastSavedAt ?? null;
  const serverUpdatedAt = serverUpdatedAtRaw ? new Date(serverUpdatedAtRaw).getTime() : 0;

  const attemptId = attemptData?.attemptId || attemptData?.id;
  const isMatchingLocal =
    Boolean(localSnapshot) &&
    Boolean(attemptId) &&
    localSnapshot!.attemptId === attemptId;

  const localAnswers: Record<string, string> = {};
  if (isMatchingLocal && localSnapshot?.selectedAnswers) {
    for (const [qId, val] of Object.entries(localSnapshot.selectedAnswers)) {
      if (
        (validQuestionIds.size === 0 || validQuestionIds.has(qId)) &&
        typeof val === "string" &&
        val.trim()
      ) {
        localAnswers[qId] = val;
      }
    }
  }

  const filteredServerAnswers: Record<string, string> = {};
  for (const [qId, val] of Object.entries(serverAnswers)) {
    if (
      (validQuestionIds.size === 0 || validQuestionIds.has(qId)) &&
      typeof val === "string" &&
      val.trim()
    ) {
      filteredServerAnswers[qId] = val;
    }
  }

  const localIsNewer =
    isMatchingLocal &&
    (localSnapshot!.updatedAt >= serverUpdatedAt || !serverUpdatedAt);

  // Merge answers: keep all answered questions from both sources; most recent source wins on conflict
  const mergedAnswers: Record<string, string> = localIsNewer
    ? { ...filteredServerAnswers, ...localAnswers }
    : { ...localAnswers, ...filteredServerAnswers };

  // Determine exact question index where the learner left off
  let resolvedIndex = 0;
  const localIndex =
    isMatchingLocal &&
    typeof localSnapshot!.currentQuestionIndex === "number" &&
    Number.isFinite(localSnapshot!.currentQuestionIndex) &&
    localSnapshot!.currentQuestionIndex >= 0
      ? Math.min(
          Math.max(0, Math.floor(localSnapshot!.currentQuestionIndex)),
          Math.max(0, totalQuestions - 1),
        )
      : null;

  if (localIsNewer && localIndex !== null) {
    resolvedIndex = localIndex;
  } else if (serverQuestionIndex !== null && serverQuestionIndex > 0) {
    resolvedIndex = serverQuestionIndex;
  } else if (localIndex !== null && localIndex > 0) {
    resolvedIndex = localIndex;
  } else if (serverQuestionIndex !== null) {
    resolvedIndex = serverQuestionIndex;
  } else if (totalQuestions > 0 && Object.keys(mergedAnswers).length > 0) {
    // Fallback: jump to the first unanswered question after answered ones
    const firstUnanswered = questions.findIndex((q) => !mergedAnswers[q.id]?.trim());
    resolvedIndex = firstUnanswered >= 0 ? firstUnanswered : totalQuestions - 1;
  }

  // Check if local state has unsynced answers or position compared to server
  const serverKeys = Object.keys(filteredServerAnswers);
  const mergedKeys = Object.keys(mergedAnswers);
  const answersDiffer =
    serverKeys.length !== mergedKeys.length ||
    mergedKeys.some((k) => filteredServerAnswers[k] !== mergedAnswers[k]);
  const indexDiffers = (serverQuestionIndex ?? 0) !== resolvedIndex;

  return {
    selectedAnswers: mergedAnswers,
    currentQuestionIndex: resolvedIndex,
    needsServerSync:
      (answersDiffer || indexDiffers) &&
      (mergedKeys.length > 0 || resolvedIndex > 0),
  };
}

const EXAM_STORAGE_PREFIX = "wbm_exam_attempt_";
const EXAM_LATEST_PREFIX = "wbm_exam_latest_";

export function saveLocalExamProgress(
  attemptId: string,
  examId: string,
  selectedAnswers: Record<string, string>,
  currentQuestionIndex: number,
  storage: Pick<Storage, "setItem"> | null = typeof window !== "undefined" ? window.localStorage : null,
): void {
  if (!storage || !attemptId) return;
  try {
    const snapshot: PersistedExamProgress = {
      attemptId,
      examId: examId || attemptId,
      selectedAnswers,
      currentQuestionIndex: Math.max(0, Math.floor(currentQuestionIndex || 0)),
      updatedAt: Date.now(),
    };
    const serialized = JSON.stringify(snapshot);
    storage.setItem(`${EXAM_STORAGE_PREFIX}${attemptId}`, serialized);
    if (examId) {
      storage.setItem(`${EXAM_LATEST_PREFIX}${examId}`, serialized);
    }
  } catch {
    // Ignore storage quota or private mode errors
  }
}

export function loadLocalExamProgress(
  attemptId: string,
  examId?: string,
  storage: Pick<Storage, "getItem"> | null = typeof window !== "undefined" ? window.localStorage : null,
): PersistedExamProgress | null {
  if (!storage) return null;
  try {
    const raw =
      (attemptId ? storage.getItem(`${EXAM_STORAGE_PREFIX}${attemptId}`) : null) ||
      (examId ? storage.getItem(`${EXAM_LATEST_PREFIX}${examId}`) : null);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedExamProgress;
    if (!parsed || typeof parsed !== "object") return null;
    if (attemptId && parsed.attemptId && parsed.attemptId !== attemptId) return null;
    return {
      attemptId: parsed.attemptId || attemptId,
      examId: parsed.examId || examId || "",
      selectedAnswers:
        parsed.selectedAnswers && typeof parsed.selectedAnswers === "object"
          ? parsed.selectedAnswers
          : {},
      currentQuestionIndex:
        typeof parsed.currentQuestionIndex === "number" &&
        Number.isFinite(parsed.currentQuestionIndex)
          ? Math.max(0, Math.floor(parsed.currentQuestionIndex))
          : 0,
      updatedAt: typeof parsed.updatedAt === "number" ? parsed.updatedAt : 0,
    };
  } catch {
    return null;
  }
}

export function clearLocalExamProgress(
  attemptId?: string,
  examId?: string,
  storage: Pick<Storage, "removeItem"> | null = typeof window !== "undefined" ? window.localStorage : null,
): void {
  if (!storage) return;
  try {
    if (attemptId) storage.removeItem(`${EXAM_STORAGE_PREFIX}${attemptId}`);
    if (examId) storage.removeItem(`${EXAM_LATEST_PREFIX}${examId}`);
  } catch {
    // Ignore storage errors
  }
}
