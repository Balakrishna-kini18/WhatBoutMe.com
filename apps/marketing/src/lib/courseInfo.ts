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
];

const POINTS_HEADING = "What it covers:";
const FAQS_HEADING = "Course FAQs:";
const ALT_FAQS_HEADING = "FAQs:";

export function parseCourseInfo(description?: string | null): CourseInfo {
  const info: CourseInfo = {
    summary: "",
    type: "",
    duration: "",
    audience: "",
    inPerson: "",
    online: "",
    image: "",
    points: [],
    faqs: [],
  };
  const summary: string[] = [];
  let inFaqSection = false;
  let currentFaq: CourseFaq | null = null;

  for (const raw of (description ?? "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;

    if (
      line.toLowerCase() === FAQS_HEADING.toLowerCase() ||
      line.toLowerCase() === ALT_FAQS_HEADING.toLowerCase()
    ) {
      inFaqSection = true;
      continue;
    }

    if (line.toLowerCase() === POINTS_HEADING.toLowerCase()) {
      inFaqSection = false;
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

    if (/^[-•]\s+/.test(line)) {
      info.points.push(line.replace(/^[-•]\s+/, ""));
      continue;
    }

    const field = FIELDS.find(([label]) =>
      line.toLowerCase().startsWith(`${label.toLowerCase()}:`),
    );
    if (field) {
      info[field[1]] = line.slice(field[0].length + 1).trim();
      continue;
    }

    if (!inFaqSection) {
      summary.push(line);
    }
  }

  if (currentFaq && currentFaq.question.trim() && currentFaq.answer.trim()) {
    info.faqs!.push(currentFaq);
  }

  info.summary = summary.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  return info;
}

export function formatCourseInfo(info: CourseInfo): string {
  const fields = FIELDS.filter(([, key]) => info[key].trim()).map(
    ([label, key]) => `${label}: ${info[key].trim()}`,
  );
  const points = info.points.map((p) => p.trim()).filter(Boolean);
  const validFaqs = (info.faqs || [])
    .filter((f) => f && f.question?.trim() && f.answer?.trim())
    .map((f, i) => `Q: ${f.question.trim()}\nA: ${f.answer.trim()}`)
    .join("\n\n");

  return [
    info.summary.trim(),
    fields.join("\n"),
    points.length ? [POINTS_HEADING, ...points.map((p) => `- ${p}`)].join("\n") : "",
    validFaqs ? [FAQS_HEADING, validFaqs].join("\n") : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}
