import { ExamQuestionItem, ExamQuestionOption } from "./api";

export interface ParsedMarkdownQuestion {
  index: number;
  text: string;
  type: "MULTIPLE_CHOICE" | "MULTI_SELECT" | "SHORT_ANSWER";
  points: number;
  explanation?: string | null;
  imageUrl?: string | null;
  minCharacters?: number;
  options: ExamQuestionOption[];
}

export interface MarkdownQuestionBlockError {
  blockNumber: number;
  heading: string;
  reason: string;
}

export interface MarkdownParseResult {
  questions: ParsedMarkdownQuestion[];
  errors: MarkdownQuestionBlockError[];
  totalBlocksFound: number;
}

/**
 * Strips HTML comments (`<!-- ... -->`) and normalizes line endings to LF.
 */
function preprocessMarkdown(raw: string): string {
  return (raw || "")
    .replace(/\r\n/g, "\n")
    .replace(/<!--[\s\S]*?-->/g, "")
    .trim();
}

/**
 * Splits a Markdown document into individual question blocks.
 * Supports:
 * - Markdown headings: `## Q1: ...`, `### 1. ...`, `## Question 1: ...`
 * - Horizontal dividers: `---` between blocks
 */
function splitIntoQuestionBlocks(cleaned: string): string[] {
  if (!cleaned) return [];

  const lines = cleaned.split("\n");
  const blocks: string[] = [];
  let currentLines: string[] = [];
  let seenFirstQuestion = false;

  const isQuestionHeader = (line: string): boolean => {
    const trimmed = line.trim();
    // Matches `## Q1: ...`, `### Question 1 - ...`, `## 1. ...`, `Q1: ...`, `Question 1: ...`
    if (/^#{2,4}\s*(?:Q(?:uestion)?\s*\d+|\d+[\.\):])/i.test(trimmed)) {
      return true;
    }
    if (/^(?:Q(?:uestion)?\s*\d+)\s*[\.\):\-]\s+\S+/i.test(trimmed)) {
      return true;
    }
    return false;
  };

  for (const line of lines) {
    const trimmed = line.trim();

    // Ignore top-level document title `# ...` (single hash) before first question
    if (/^#\s+[^#]/.test(trimmed) && !seenFirstQuestion) {
      continue;
    }

    // Horizontal rule `---` or `***`
    if (/^(?:-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      if (currentLines.some((l) => l.trim().length > 0)) {
        blocks.push(currentLines.join("\n").trim());
        currentLines = [];
      }
      continue;
    }

    if (isQuestionHeader(trimmed)) {
      if (seenFirstQuestion && currentLines.some((l) => l.trim().length > 0)) {
        blocks.push(currentLines.join("\n").trim());
        currentLines = [];
      }
      seenFirstQuestion = true;
      currentLines.push(line);
      continue;
    }

    if (seenFirstQuestion) {
      currentLines.push(line);
    } else if (
      // Also allow blocks separated by `---` even if they don't start with `## Q1`
      trimmed.length > 0 &&
      !/^>\s/.test(trimmed)
    ) {
      currentLines.push(line);
    }
  }

  if (currentLines.some((l) => l.trim().length > 0)) {
    blocks.push(currentLines.join("\n").trim());
  }

  // Filter out pure instruction/preamble blocks that have no question prompt or options
  return blocks.filter((b) => {
    const nonEmpty = b
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    if (nonEmpty.length === 0) return false;
    return true;
  });
}

/**
 * Parses a single question block into a validated `ParsedMarkdownQuestion` or error.
 */
function parseSingleBlock(
  block: string,
  blockNumber: number
): { question?: ParsedMarkdownQuestion; error?: MarkdownQuestionBlockError } {
  const lines = block
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) {
    return {};
  }

  let promptParts: string[] = [];
  let explicitType: "MULTIPLE_CHOICE" | "MULTI_SELECT" | "SHORT_ANSWER" | null = null;
  let points = 1;
  let explanation: string | null = null;
  let imageUrl: string | null = null;
  let minCharacters = 10;
  let answerLetters: string[] = [];

  const options: Array<{ letter?: string; text: string; isCorrect: boolean }> = [];
  let hasStartedOptionsOrMeta = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;

    // 1. Check first line header `## Q1: Prompt` or `Q1. Prompt`
    if (i === 0) {
      const cleanedHeader = line
        .replace(/^#{1,6}\s*/, "")
        .replace(/^(?:Q(?:uestion)?\s*\d+|\d+)\s*[\.\):\-]\s*/i, "")
        .replace(/^\*\*Prompt:\*\*\s*/i, "")
        .replace(/^Prompt:\s*/i, "")
        .trim();
      if (cleanedHeader) {
        promptParts.push(cleanedHeader);
      }
      continue;
    }

    // 2. Metadata fields: Type, Points/Marks, Explanation, Image, MinCharacters, Answer/Correct
    const typeMatch = line.match(/^(?:\*\*?)?Type(?:\*\*?)?\s*:\s*(.+)$/i);
    if (typeMatch) {
      hasStartedOptionsOrMeta = true;
      const rawType = typeMatch[1]!.trim().toUpperCase().replace(/[\s\-]+/g, "_");
      if (rawType.includes("MULTI_SELECT") || rawType.includes("CHECKBOX") || rawType === "MULTIPLE_SELECT") {
        explicitType = "MULTI_SELECT";
      } else if (
        rawType.includes("SHORT_ANSWER") ||
        rawType.includes("TEXT") ||
        rawType.includes("REFLECTION") ||
        rawType.includes("OPEN")
      ) {
        explicitType = "SHORT_ANSWER";
      } else {
        explicitType = "MULTIPLE_CHOICE";
      }
      continue;
    }

    const pointsMatch = line.match(/^(?:\*\*?)?(?:Points|Marks)(?:\*\*?)?\s*:\s*(\d+)$/i);
    if (pointsMatch) {
      hasStartedOptionsOrMeta = true;
      points = Math.max(1, Math.min(100, parseInt(pointsMatch[1]!, 10) || 1));
      continue;
    }

    const explanationMatch = line.match(/^(?:\*\*?)?(?:Explanation|Rationale|Feedback)(?:\*\*?)?\s*:\s*(.+)$/i);
    if (explanationMatch) {
      hasStartedOptionsOrMeta = true;
      explanation = explanationMatch[1]!.trim();
      continue;
    }

    const imageMatch = line.match(/^(?:\*\*?)?(?:Image|ImageUrl)(?:\*\*?)?\s*:\s*(\S+)$/i);
    if (imageMatch) {
      hasStartedOptionsOrMeta = true;
      imageUrl = imageMatch[1]!.trim();
      continue;
    }

    const minCharsMatch = line.match(/^(?:\*\*?)?MinCharacters(?:\*\*?)?\s*:\s*(\d+)$/i);
    if (minCharsMatch) {
      hasStartedOptionsOrMeta = true;
      minCharacters = Math.max(1, parseInt(minCharsMatch[1]!, 10) || 10);
      continue;
    }

    const answerLineMatch = line.match(/^(?:\*\*?)?(?:Answer|Correct(?:\s+Answer)?)(?:\*\*?)?\s*:\s*(.+)$/i);
    if (answerLineMatch) {
      hasStartedOptionsOrMeta = true;
      const rawAns = answerLineMatch[1]!.trim();
      // Extract letter tokens like "A", "A, C", "B & D"
      const tokens = rawAns
        .split(/[\s,&/]+/)
        .map((t) => t.replace(/[\.\)\]]/g, "").trim().toUpperCase())
        .filter((t) => /^[A-H]$/.test(t));
      if (tokens.length > 0) {
        answerLetters.push(...tokens);
      }
      continue;
    }

    // 3. Checkbox Option Syntax: `- [x] Option text` or `- [ ] Option text` or `* [X] Option text`
    const checkboxMatch = line.match(/^[-*+]\s*\[([ xX✓✔])\]\s*(.+)$/);
    if (checkboxMatch) {
      hasStartedOptionsOrMeta = true;
      const isChecked = checkboxMatch[1]!.trim().length > 0;
      // Strip optional leading `A) ` or `A. ` inside checkbox text
      const rawOptText = checkboxMatch[2]!.trim();
      const letterPrefix = rawOptText.match(/^([A-H])[\.\)]\s+(.+)$/i);
      options.push({
        letter: letterPrefix ? letterPrefix[1]!.toUpperCase() : undefined,
        text: letterPrefix ? letterPrefix[2]!.trim() : rawOptText,
        isCorrect: isChecked,
      });
      continue;
    }

    // 4. Lettered Option Syntax: `A) Option text`, `A. Option text`, `- A) Option text`, `- A. Option text`
    const letteredMatch = line.match(/^(?:[-*+]\s*)?([A-H])[\.\)]\s+(.+)$/);
    if (letteredMatch) {
      hasStartedOptionsOrMeta = true;
      const letter = letteredMatch[1]!.toUpperCase();
      let optText = letteredMatch[2]!.trim();
      let inlineCorrect = false;

      if (/\((?:correct|right|true)\)\s*$/i.test(optText) || /\[(?:correct|x)\]\s*$/i.test(optText) || /\*\*\s*✅\s*$/.test(optText) || /✅\s*$/.test(optText)) {
        inlineCorrect = true;
        optText = optText
          .replace(/\((?:correct|right|true)\)\s*$/i, "")
          .replace(/\[(?:correct|x)\]\s*$/i, "")
          .replace(/✅\s*$/, "")
          .trim();
      }

      options.push({
        letter,
        text: optText,
        isCorrect: inlineCorrect,
      });
      continue;
    }

    // 5. Plain bullet option with `(Correct)` or `[Correct]` marker: `- Option text (Correct)`
    const bulletMatch = line.match(/^[-*+]\s+(.+)$/);
    if (bulletMatch) {
      hasStartedOptionsOrMeta = true;
      let optText = bulletMatch[1]!.trim();
      let inlineCorrect = false;
      if (/\((?:correct|right|true)\)\s*$/i.test(optText) || /\[(?:correct|x)\]\s*$/i.test(optText) || /✅\s*$/.test(optText)) {
        inlineCorrect = true;
        optText = optText
          .replace(/\((?:correct|right|true)\)\s*$/i, "")
          .replace(/\[(?:correct|x)\]\s*$/i, "")
          .replace(/✅\s*$/, "")
          .trim();
      }
      options.push({
        text: optText,
        isCorrect: inlineCorrect,
      });
      continue;
    }

    // Continuation of multi-line prompt if before options/meta
    if (!hasStartedOptionsOrMeta) {
      promptParts.push(line.replace(/^\*\*Prompt:\*\*\s*/i, "").replace(/^Prompt:\s*/i, ""));
    }
  }

  const promptText = promptParts.join(" ").trim();
  const headingPreview = promptText ? promptText.slice(0, 65) : `Block #${blockNumber}`;

  if (!promptText || promptText.length < 3) {
    return {
      error: {
        blockNumber,
        heading: headingPreview,
        reason: "Question prompt text is missing or too short (minimum 3 characters).",
      },
    };
  }

  // Apply `Answer: A` / `Answer: A, C` letter matches if provided
  if (answerLetters.length > 0) {
    const answerSet = new Set(answerLetters);
    options.forEach((opt, idx) => {
      const inferredLetter = opt.letter || String.fromCharCode(65 + idx);
      if (answerSet.has(inferredLetter)) {
        opt.isCorrect = true;
      }
    });
  }

  const correctCount = options.filter((o) => o.isCorrect).length;

  let resolvedType: "MULTIPLE_CHOICE" | "MULTI_SELECT" | "SHORT_ANSWER" =
    explicitType || (correctCount > 1 ? "MULTI_SELECT" : "MULTIPLE_CHOICE");

  if (resolvedType === "SHORT_ANSWER") {
    return {
      question: {
        index: blockNumber,
        text: promptText,
        type: "SHORT_ANSWER",
        points,
        explanation,
        imageUrl,
        minCharacters,
        options: [],
      },
    };
  }

  if (options.length < 2) {
    return {
      error: {
        blockNumber,
        heading: headingPreview,
        reason: `Objective question requires at least 2 options (found ${options.length}). Use "- [x] Correct option" and "- [ ] Wrong option", or set "Type: SHORT_ANSWER".`,
      },
    };
  }

  if (correctCount === 0) {
    return {
      error: {
        blockNumber,
        heading: headingPreview,
        reason: `No correct answer marked for "${headingPreview}". Mark the correct option with "- [x] ..." or add "Answer: A".`,
      },
    };
  }

  // If multiple options are marked correct, upgrade MULTIPLE_CHOICE to MULTI_SELECT automatically
  if (correctCount > 1 && resolvedType === "MULTIPLE_CHOICE") {
    resolvedType = "MULTI_SELECT";
  }

  return {
    question: {
      index: blockNumber,
      text: promptText,
      type: resolvedType,
      points,
      explanation,
      imageUrl,
      options: options.map((o, idx) => ({
        text: o.text,
        isCorrect: o.isCorrect,
        order: idx + 1,
      })),
    },
  };
}

/**
 * Parses a Markdown string containing exam/quiz questions into structured question payloads.
 */
export function parseQuestionsFromMarkdown(markdown: string): MarkdownParseResult {
  const cleaned = preprocessMarkdown(markdown);
  const rawBlocks = splitIntoQuestionBlocks(cleaned);

  const questions: ParsedMarkdownQuestion[] = [];
  const errors: MarkdownQuestionBlockError[] = [];

  rawBlocks.forEach((block, idx) => {
    const { question, error } = parseSingleBlock(block, idx + 1);
    if (question) {
      questions.push({
        ...question,
        index: questions.length + 1,
      });
    } else if (error) {
      errors.push(error);
    }
  });

  return {
    questions,
    errors,
    totalBlocksFound: rawBlocks.length,
  };
}

/**
 * Generates a ready-to-upload `.md` template file (either a compact sample or full 70-question pool).
 */
export function generateSampleQuestionsMarkdown(
  count: number = 70,
  programTitle: string = "11 Steps to U"
): string {
  const header = `<!--
================================================================================
WHATBOUTME LMS — OFFICIAL MARKDOWN QUESTION BANK FORMAT (.md)
================================================================================
HOW TO FORMAT QUESTIONS:
1. Start each question with \`## Q1: Your question prompt here\` (or separate with \`---\`).
2. Mark the correct answer option(s) with \`- [x]\` and incorrect options with \`- [ ]\`.
   - Alternatively, use \`A) ...\`, \`B) ...\` and add \`Answer: A\` on a new line.
3. Optional metadata lines per question:
   - \`Type: MULTIPLE_CHOICE\` (single correct), \`Type: MULTI_SELECT\` (multiple correct), or \`Type: SHORT_ANSWER\`
   - \`Points: 1\`
   - \`Explanation: Optional rationale shown in instructor review\`
4. Upload this .md file in the Admin Portal to automatically populate all questions!
================================================================================
-->

# ${programTitle} — Final Certification Exam Question Pool (${count} Questions)

`;

  const topics = [
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

  const blocks: string[] = [];

  for (let i = 1; i <= count; i++) {
    const topic = topics[(i - 1) % topics.length]!;
    if (i === 2 && count <= 10) {
      blocks.push(`## Q${i}: Which of the following practices support sustainable ${topic}? (Select all that apply)
Type: MULTI_SELECT
Points: 1
Explanation: Both conscious reflection and consistent boundary communication reinforce ${topic}.
- [x] Practicing daily self-observation before reacting to external triggers
- [x] Aligning personal commitments with core values and energetic capacity
- [ ] Suppressing emotions to avoid short-term discomfort
- [ ] Relying exclusively on external approval for decision-making`);
    } else {
      blocks.push(`## Q${i}: In the context of ${topic}, which practice best demonstrates mastery of the core principle taught in "${programTitle}"?
Type: MULTIPLE_CHOICE
Points: 1
Explanation: Review the ${topic} module for the foundational framework behind this assessment item.
- [x] Consciously applying the structured reflection and action protocol for ${topic}
- [ ] Reacting automatically without pausing to evaluate underlying triggers
- [ ] Avoiding self-reflection until external circumstances change on their own
- [ ] Suppressing feedback and bypassing the daily integration exercises`);
    }
  }

  return header + blocks.join("\n\n---\n\n") + "\n";
}

/**
 * Exports an existing array of questions into the canonical `.md` format so instructors
 * can download, edit in any text/markdown editor, and re-upload.
 */
export function exportQuestionsToMarkdown(
  questions: Array<Partial<ExamQuestionItem>>,
  title: string = "Final Exam Question Pool"
): string {
  if (!questions || questions.length === 0) {
    return generateSampleQuestionsMarkdown(5, title);
  }

  const header = `# ${title} (${questions.length} Questions)\n\n`;
  const blocks = questions.map((q, idx) => {
    const qType =
      q.type === "MULTI_SELECT"
        ? "MULTI_SELECT"
        : q.type === "SHORT_ANSWER" || q.type === "TEXT_BOX"
          ? "SHORT_ANSWER"
          : "MULTIPLE_CHOICE";
    const lines: string[] = [
      `## Q${idx + 1}: ${(q.text || "").trim()}`,
      `Type: ${qType}`,
      `Points: ${q.points || 1}`,
    ];
    if (q.explanation) {
      lines.push(`Explanation: ${q.explanation.trim()}`);
    }
    if (qType !== "SHORT_ANSWER" && Array.isArray(q.options)) {
      for (const opt of q.options) {
        const mark = opt.isCorrect ? "x" : " ";
        lines.push(`- [${mark}] ${(opt.text || "").trim()}`);
      }
    }
    return lines.join("\n");
  });

  return header + blocks.join("\n\n---\n\n") + "\n";
}
