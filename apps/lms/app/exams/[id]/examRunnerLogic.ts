/**
 * Core pure business logic for the LMS Final Exam Runner.
 * Senior-developer testable pure functions.
 */

export interface ExamAnswerRecord {
  questionId: string;
  selectedOptionId?: string;
  selectedOptionIds?: string[];
  textResponse?: string;
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
