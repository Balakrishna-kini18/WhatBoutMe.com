/**
 * Course details are stored inside a program's plain-text description, so the
 * admin portal can manage them without any change to the API or database.
 *
 *   Summary paragraph.
 *
 *   Type: Certification
 *   Duration: 12 classes
 *   For: Individuals · Teams
 *   In person: 2 hours · Speaker 60 min
 *   Online: 12 live classes · 2 hours each
 *   Image: https://...
 *   Short: Brief overview for catalog cards
 *
 *   What it covers:
 *   - First point
 *   - Second point
 *
 *   Course FAQs:
 *   Q: First question?
 *   A: First answer.
 *
 * Keep this file identical in the marketing site and the admin app.
 */
export type CourseFaq = {
  id?: string;
  question: string;
  answer: string;
  sortOrder?: number;
};

export type CourseInfo = {
  summary: string;
  type: string;
  duration: string;
  audience: string;
  inPerson: string;
  online: string;
  image: string;
  short?: string;
  points: string[];
  faqs?: CourseFaq[];
};

const FIELDS: [label: string, key: Exclude<keyof CourseInfo, "summary" | "points" | "faqs">][] = [
  ["Type", "type"],
  ["Duration", "duration"],
  ["For", "audience"],
  ["In person", "inPerson"],
  ["Online", "online"],
  ["Image", "image"],
  ["Short", "short"],
];

const POINTS_HEADING = "What it covers:";
const FAQS_HEADING = "Course FAQs:";
const ALT_FAQS_HEADING = "FAQs:";

export function sanitizeCleanSummary(text?: string | null): string {
  if (!text) return "";
  const lines = text.split(/\r?\n/);
  const clean: string[] = [];
  let inFaq = false;
  let inPoints = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (
      line.toLowerCase().startsWith(FAQS_HEADING.toLowerCase()) ||
      line.toLowerCase() === ALT_FAQS_HEADING.toLowerCase()
    ) {
      inFaq = true;
      inPoints = false;
      continue;
    }
    if (line.toLowerCase().startsWith(POINTS_HEADING.toLowerCase())) {
      inFaq = false;
      inPoints = true;
      continue;
    }
    if (inFaq) continue;
    if (inPoints) {
      if (/^[-•]\s+/.test(line)) continue;
      inPoints = false;
    }
    if (
      FIELDS.some(([label]) => line.toLowerCase().startsWith(`${label.toLowerCase()}:`)) ||
      line.toLowerCase().startsWith("short description:") ||
      line.toLowerCase().startsWith("cover:")
    ) {
      continue;
    }
    clean.push(raw);
  }
  return clean.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

export function parseCourseInfo(description?: string | null): CourseInfo {
  const info: CourseInfo = {
    summary: "",
    type: "",
    duration: "",
    audience: "",
    inPerson: "",
    online: "",
    image: "",
    short: "",
    points: [],
    faqs: [],
  };
  const summary: string[] = [];
  let inFaqSection = false;
  let inPointsSection = false;
  let currentFaq: CourseFaq | null = null;

  for (const raw of (description ?? "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;

    if (
      line.toLowerCase() === FAQS_HEADING.toLowerCase() ||
      line.toLowerCase() === ALT_FAQS_HEADING.toLowerCase()
    ) {
      inFaqSection = true;
      inPointsSection = false;
      continue;
    }

    if (line.toLowerCase() === POINTS_HEADING.toLowerCase()) {
      inFaqSection = false;
      inPointsSection = true;
      continue;
    }

    if (inFaqSection) {
      if (/^q(?:uestion)?[:.]\s*/i.test(line)) {
        if (currentFaq && currentFaq.question.trim() && currentFaq.answer.trim()) {
          info.faqs!.push(currentFaq);
        }
        currentFaq = {
          question: line.replace(/^q(?:uestion)?[:.]\s*/i, "").trim(),
          answer: "",
          sortOrder: info.faqs!.length,
        };
        continue;
      }
      if (/^a(?:nswer)?[:.]\s*/i.test(line)) {
        if (currentFaq) {
          currentFaq.answer = line.replace(/^a(?:nswer)?[:.]\s*/i, "").trim();
        }
        continue;
      }
      if (currentFaq) {
        currentFaq.answer = currentFaq.answer
          ? `${currentFaq.answer}\n${line}`
          : line;
        continue;
      }
    }

    if (inPointsSection && /^[-•]\s+/.test(line)) {
      info.points.push(line.replace(/^[-•]\s+/, ""));
      continue;
    }

    if (line.toLowerCase().startsWith("short description:")) {
      info.short = line.slice("short description:".length).trim();
      inPointsSection = false;
      inFaqSection = false;
      continue;
    }

    if (line.toLowerCase().startsWith("cover:")) {
      info.image = line.slice("cover:".length).trim();
      inPointsSection = false;
      inFaqSection = false;
      continue;
    }

    const field = FIELDS.find(([label]) =>
      line.toLowerCase().startsWith(`${label.toLowerCase()}:`),
    );
    if (field) {
      info[field[1]] = line.slice(field[0].length + 1).trim();
      inPointsSection = false;
      inFaqSection = false;
      continue;
    }

    if (!inFaqSection && !inPointsSection) {
      summary.push(line);
    }
  }

  if (currentFaq && currentFaq.question.trim() && currentFaq.answer.trim()) {
    info.faqs!.push(currentFaq);
  }

  info.summary = sanitizeCleanSummary(summary.join("\n"));
  return info;
}

export function formatCourseInfo(info: CourseInfo): string {
  const fields = FIELDS.filter(([, key]) => (info[key] ?? "").trim()).map(
    ([label, key]) => `${label}: ${(info[key] ?? "").trim()}`,
  );
  const points = info.points.map((p) => p.trim()).filter(Boolean);
  const validFaqs = (info.faqs || [])
    .filter((f) => f && f.question?.trim() && f.answer?.trim())
    .map((f, i) => `Q: ${f.question.trim()}\nA: ${f.answer.trim()}`)
    .join("\n\n");

  return [
    sanitizeCleanSummary(info.summary),
    fields.join("\n"),
    points.length ? [POINTS_HEADING, ...points.map((p) => `- ${p}`)].join("\n") : "",
    validFaqs ? [FAQS_HEADING, validFaqs].join("\n") : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}


/**
 * Strips basic markdown and HTML tags so plain text previews (like card summaries)
 * do not show raw markup syntax.
 */
export function stripFormatting(text?: string | null): string {
  if (!text) return "";
  return text
    .replace(/<[^>]*>/g, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    .replace(/~~([^~]+)~~/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}
