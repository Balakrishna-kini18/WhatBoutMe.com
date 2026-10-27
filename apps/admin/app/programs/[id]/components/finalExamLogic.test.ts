import { describe, it, expect } from "vitest";
import {
  generate70QuestionPoolTemplate,
  validateQuestionInput,
  filterAndSearchQuestions,
  calculateExamReadiness,
  EXAM_TOPICS,
  FinalExamQuestionDraft,
} from "./finalExamLogic";

describe("Admin Final Exam Question Bank Logic", () => {
  it("generates exactly the needed number of template questions up to 70 across 11 modules", () => {
    const questions = generate70QuestionPoolTemplate("11 Steps to U", 0, 70);

    expect(questions).toHaveLength(70);

    // Verify first question
    expect(questions[0]?.text).toContain("[Final Exam Q1]");
    expect(questions[0]?.text).toContain(EXAM_TOPICS[0]);
    expect(questions[0]?.points).toBe(1);
    expect(questions[0]?.type).toBe("MULTIPLE_CHOICE");
    expect(questions[0]?.options).toHaveLength(4);
    expect(questions[0]?.options?.[0]?.isCorrect).toBe(true);

    // Verify last question
    expect(questions[69]?.text).toContain("[Final Exam Q70]");
    expect(questions[69]?.options).toHaveLength(4);

    // Verify only needed count is generated if 50 already exist
    const additional = generate70QuestionPoolTemplate("11 Steps to U", 50, 70);
    expect(additional).toHaveLength(20);
    expect(additional[0]?.text).toContain("[Final Exam Q51]");
  });

  it("returns empty array if target count is already met or exceeded", () => {
    const res = generate70QuestionPoolTemplate("11 Steps to U", 70, 70);
    expect(res).toEqual([]);

    const resOver = generate70QuestionPoolTemplate("11 Steps to U", 75, 70);
    expect(resOver).toEqual([]);
  });

  it("validates question inputs and catches errors", () => {
    // 1. Missing prompt
    expect(validateQuestionInput({ text: "" })).toEqual({
      isValid: false,
      error: "Question prompt is required",
    });

    // 2. Less than 2 options
    expect(
      validateQuestionInput({
        text: "Valid prompt",
        type: "MULTIPLE_CHOICE",
        options: [{ text: "Only one option", isCorrect: true, order: 1 }],
      }),
    ).toEqual({
      isValid: false,
      error: "Objective questions require at least 2 non-empty options",
    });

    // 3. No correct option
    expect(
      validateQuestionInput({
        text: "Valid prompt",
        type: "MULTIPLE_CHOICE",
        options: [
          { text: "Wrong A", isCorrect: false, order: 1 },
          { text: "Wrong B", isCorrect: false, order: 2 },
        ],
      }),
    ).toEqual({
      isValid: false,
      error: "At least one option must be marked as correct",
    });

    // 4. Invalid points
    expect(
      validateQuestionInput({
        text: "Valid prompt",
        type: "MULTIPLE_CHOICE",
        points: -5,
        options: [
          { text: "Right A", isCorrect: true, order: 1 },
          { text: "Wrong B", isCorrect: false, order: 2 },
        ],
      }),
    ).toEqual({
      isValid: false,
      error: "Question points must be greater than 0",
    });

    // 5. Valid question
    expect(
      validateQuestionInput({
        text: "Valid prompt",
        type: "MULTIPLE_CHOICE",
        points: 1,
        options: [
          { text: "Right A", isCorrect: true, order: 1 },
          { text: "Wrong B", isCorrect: false, order: 2 },
        ],
      }),
    ).toEqual({ isValid: true });

    // 6. Valid SHORT_ANSWER without options
    expect(
      validateQuestionInput({
        text: "Write your reflections on core identity",
        type: "SHORT_ANSWER",
        points: 2,
      }),
    ).toEqual({ isValid: true });
  });

  it("filters questions by type and keyword search query", () => {
    const list: FinalExamQuestionDraft[] = [
      {
        text: "Question about Emotional Regulation and triggers",
        type: "MULTIPLE_CHOICE",
        points: 1,
        explanation: "Regulation framework",
      },
      {
        text: "Question about Boundary Architecture",
        type: "MULTI_SELECT",
        points: 1,
        explanation: "Boundary limits",
      },
      {
        text: "Write your mission statement essay",
        type: "SHORT_ANSWER",
        points: 5,
        explanation: "Reflective essay",
      },
    ];

    // Filter by type
    const mcOnly = filterAndSearchQuestions(list, "MULTIPLE_CHOICE", "");
    expect(mcOnly).toHaveLength(1);
    expect(mcOnly[0]?.text).toContain("Emotional Regulation");

    // Filter by search query
    const boundarySearch = filterAndSearchQuestions(list, "ALL", "boundary");
    expect(boundarySearch).toHaveLength(1);
    expect(boundarySearch[0]?.type).toBe("MULTI_SELECT");

    // Filter by explanation keyword
    const essaySearch = filterAndSearchQuestions(list, "ALL", "Reflective");
    expect(essaySearch).toHaveLength(1);
    expect(essaySearch[0]?.type).toBe("SHORT_ANSWER");
  });

  it("evaluates exam readiness based on question pool size", () => {
    const ready = calculateExamReadiness(70, 50);
    expect(ready.isReady).toBe(true);
    expect(ready.deficit).toBe(0);

    const deficit = calculateExamReadiness(40, 50);
    expect(deficit.isReady).toBe(false);
    expect(deficit.deficit).toBe(10);
    expect(deficit.message).toContain("Need 10 more questions");
  });
});
