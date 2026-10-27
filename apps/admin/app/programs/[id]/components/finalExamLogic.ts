/**
 * Pure business and validation logic for the Admin Final Exam 70-Question Pool Manager.
 * Senior-developer testable pure functions.
 */

export interface FinalExamQuestionDraft {
  id?: string;
  text: string;
  type: "MULTIPLE_CHOICE" | "MULTI_SELECT" | "SHORT_ANSWER";
  points: number;
  imageUrl?: string | null;
  explanation?: string | null;
  options?: Array<{
    id?: string;
    text: string;
    isCorrect: boolean;
    order: number;
  }>;
}

export const EXAM_TOPICS = [
  "Self-Awareness & Core Identity Foundations",
  "Emotional Regulation & Trigger Mapping",
  "Limiting Beliefs & Cognitive Reframing",
  "Boundary Architecture & Assertive Communication",
  "Inner Child Healing & Forgiveness Practice",
  "Values Alignment & Decision Frameworks",
  "Resilience Under Pressure & Mindfulness",
  "Authentic Relationships & Empathy",
  "Purpose Discovery & Vision Crafting",
  "Habit Loops & Behavioral Transformation",
  "Personal Leadership & Mission Integration",
];

export function generate70QuestionPoolTemplate(
  programTitle: string,
  existingCount: number,
  targetCount = 70,
): FinalExamQuestionDraft[] {
  const needed = Math.max(0, targetCount - existingCount);
  if (needed === 0) return [];

  const startIdx = existingCount + 1;
  return Array.from({ length: needed }, (_, i) => {
    const num = startIdx + i;
    const topic = EXAM_TOPICS[i % EXAM_TOPICS.length];
    return {
      text: `[Final Exam Q${num}] In the context of ${topic}, which practice best demonstrates mastery of the core principle taught in "${programTitle || "this program"}"?`,
      type: "MULTIPLE_CHOICE" as const,
      points: 1,
      explanation: `Review the ${topic} module for the foundational framework behind this assessment item.`,
      options: [
        {
          text: `Consciously applying the structured reflection and action protocol for ${topic}`,
          isCorrect: true,
          order: 1,
        },
        {
          text: "Reacting automatically without pausing to evaluate underlying triggers",
          isCorrect: false,
          order: 2,
        },
        {
          text: "Avoiding self-reflection until external circumstances change on their own",
          isCorrect: false,
          order: 3,
        },
        {
          text: "Suppressing feedback and bypassing the daily integration exercises",
          isCorrect: false,
          order: 4,
        },
      ],
    };
  });
}

export function validateQuestionInput(draft: Partial<FinalExamQuestionDraft>): {
  isValid: boolean;
  error?: string;
} {
  const text = (draft.text || "").trim();
  if (!text) {
    return { isValid: false, error: "Question prompt is required" };
  }

  const type = draft.type || "MULTIPLE_CHOICE";
  if (type !== "SHORT_ANSWER") {
    const rawOptions = Array.isArray(draft.options) ? draft.options : [];
    const validOptions = rawOptions.filter((o) => (o.text || "").trim().length > 0);

    if (validOptions.length < 2) {
      return {
        isValid: false,
        error: "Objective questions require at least 2 non-empty options",
      };
    }

    if (!validOptions.some((o) => o.isCorrect)) {
      return {
        isValid: false,
        error: "At least one option must be marked as correct",
      };
    }
  }

  const points = Number(draft.points);
  if (isNaN(points) || points <= 0) {
    return { isValid: false, error: "Question points must be greater than 0" };
  }

  return { isValid: true };
}

export function filterAndSearchQuestions(
  questions: FinalExamQuestionDraft[],
  typeFilter: string,
  searchQuery: string,
): FinalExamQuestionDraft[] {
  let filtered = [...questions];

  if (typeFilter && typeFilter !== "ALL") {
    filtered = filtered.filter((q) => q.type === typeFilter);
  }

  const query = (searchQuery || "").trim().toLowerCase();
  if (query) {
    filtered = filtered.filter(
      (q) =>
        (q.text && q.text.toLowerCase().includes(query)) ||
        (q.explanation && q.explanation.toLowerCase().includes(query)),
    );
  }

  return filtered;
}

export function calculateExamReadiness(
  poolSize: number,
  requiredQuestions = 50,
): {
  isReady: boolean;
  deficit: number;
  message: string;
} {
  const deficit = Math.max(0, requiredQuestions - poolSize);
  const isReady = deficit === 0;

  if (isReady) {
    return {
      isReady: true,
      deficit: 0,
      message: `Question pool is fully ready (${poolSize} questions available for 50-mark exam).`,
    };
  }

  return {
    isReady: false,
    deficit,
    message: `Need ${deficit} more questions to satisfy the 50-question per exam requirement.`,
  };
}
