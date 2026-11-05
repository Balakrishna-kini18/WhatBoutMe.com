import { describe, it, expect } from "vitest";
import {
  computeRemainingSeconds,
  formatExamTimer,
  tallyAnswersProgress,
  toggleMultiSelectOption,
  isAnswerComplete,
  safeParseResponseJson,
  buildExamAnswersPayload,
} from "./examRunnerLogic";

describe("LMS Exam Runner Logic", () => {
  it("calculates remaining seconds based on start time and 90-minute limit", () => {
    const startedAt = new Date("2026-10-26T12:00:00Z");
    const halfWay = new Date("2026-10-26T12:45:00Z"); // 45 mins later

    const remaining = computeRemainingSeconds(startedAt, 90, halfWay);
    expect(remaining).toBe(45 * 60); // 2700 seconds
  });

  it("clamps to 0 when elapsed time exceeds time limit", () => {
    const startedAt = new Date("2026-10-26T12:00:00Z");
    const pastLimit = new Date("2026-10-26T13:40:00Z"); // 100 mins later (> 90)

    const remaining = computeRemainingSeconds(startedAt, 90, pastLimit);
    expect(remaining).toBe(0);
  });

  it("formats seconds to MM:SS string", () => {
    expect(formatExamTimer(5400)).toBe("90:00");
    expect(formatExamTimer(65)).toBe("01:05");
    expect(formatExamTimer(9)).toBe("00:09");
    expect(formatExamTimer(0)).toBe("00:00");
  });

  it("tallies answered vs unanswered questions across 50 questions", () => {
    const answersMap = {
      "q-1": { questionId: "q-1", selectedOptionId: "opt-1-1" },
      "q-2": { questionId: "q-2", selectedOptionIds: ["opt-2-1", "opt-2-2"] },
      "q-3": { questionId: "q-3", textResponse: "My reflection answer" },
      "q-4": { questionId: "q-4", textResponse: "   " }, // Empty whitespace not counted
    };

    const result = tallyAnswersProgress(answersMap, 50);
    expect(result.answeredCount).toBe(3);
    expect(result.unansweredCount).toBe(47);
    expect(result.progressPercent).toBe(6); // 3 / 50 = 6%
  });

  it("toggles multi-select options cleanly without duplicates", () => {
    let selected: string[] = [];
    selected = toggleMultiSelectOption(selected, "opt-1");
    expect(selected).toEqual(["opt-1"]);

    selected = toggleMultiSelectOption(selected, "opt-2");
    expect(selected).toEqual(["opt-1", "opt-2"]);

    // Unselect opt-1
    selected = toggleMultiSelectOption(selected, "opt-1");
    expect(selected).toEqual(["opt-2"]);
  });

  it("checks whether an individual answer is complete", () => {
    expect(isAnswerComplete(undefined)).toBe(false);
    expect(isAnswerComplete({ questionId: "q-1" })).toBe(false);
    expect(
      isAnswerComplete({ questionId: "q-1", selectedOptionId: "opt-1" }),
    ).toBe(true);
    expect(
      isAnswerComplete({ questionId: "q-2", selectedOptionIds: ["opt-2"] }),
    ).toBe(true);
    expect(
      isAnswerComplete({ questionId: "q-3", textResponse: "valid text" }),
    ).toBe(true);
    expect(
      isAnswerComplete({ questionId: "q-4", textResponse: "   " }),
    ).toBe(false);
  });

  it("safely parses empty 200 OK response bodies without throwing Unexpected end of JSON input", async () => {
    const emptyResponse = new Response("", { status: 200 });
    await expect(safeParseResponseJson(emptyResponse)).resolves.toBeNull();

    const whitespaceResponse = new Response("   \n  ", { status: 200 });
    await expect(safeParseResponseJson(whitespaceResponse)).resolves.toBeNull();

    const validAttemptResponse = new Response(
      JSON.stringify({ status: "IN_PROGRESS", questionCount: 50, questions: [] }),
      { status: 200 },
    );
    await expect(safeParseResponseJson(validAttemptResponse)).resolves.toEqual({
      status: "IN_PROGRESS",
      questionCount: 50,
      questions: [],
    });
  });

  it("emits both singular and plural option ID fields for MULTIPLE_CHOICE and SINGLE_CHOICE questions in buildExamAnswersPayload", () => {
    const questions = [
      { id: "q-mc", type: "MULTIPLE_CHOICE" },
      { id: "q-sc", type: "SINGLE_CHOICE" },
      { id: "q-ms", type: "MULTI_SELECT" },
      { id: "q-sa", type: "SHORT_ANSWER" },
    ];
    const selectedAnswers = {
      "q-mc": "opt-mc-1",
      "q-sc": "opt-sc-1",
      "q-ms": "opt-ms-1,opt-ms-2",
      "q-sa": "Detailed reflection response",
    };

    const payload = buildExamAnswersPayload(questions, selectedAnswers);
    expect(payload).toEqual([
      {
        questionId: "q-mc",
        optionId: "opt-mc-1",
        selectedOptionId: "opt-mc-1",
        selectedOptionIds: ["opt-mc-1"],
        optionIds: ["opt-mc-1"],
      },
      {
        questionId: "q-sc",
        optionId: "opt-sc-1",
        selectedOptionId: "opt-sc-1",
        selectedOptionIds: ["opt-sc-1"],
        optionIds: ["opt-sc-1"],
      },
      {
        questionId: "q-ms",
        selectedOptionIds: ["opt-ms-1", "opt-ms-2"],
        optionIds: ["opt-ms-1", "opt-ms-2"],
      },
      {
        questionId: "q-sa",
        textResponse: "Detailed reflection response",
        textAnswer: "Detailed reflection response",
      },
    ]);
  });
});
