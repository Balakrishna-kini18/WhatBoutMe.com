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
 * Keep this file identical in the marketing site and the admin app.
 */
export type CourseInfo = {
  summary: string;
  type: string;
  duration: string;
  audience: string;
  inPerson: string;
  online: string;
  image: string;
  points: string[];
};

const FIELDS: [label: string, key: Exclude<keyof CourseInfo, "summary" | "points">][] = [
  ["Type", "type"],
  ["Duration", "duration"],
  ["For", "audience"],
  ["In person", "inPerson"],
  ["Online", "online"],
  ["Image", "image"],
];

const POINTS_HEADING = "What it covers:";

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
  };
  const summary: string[] = [];

  for (const raw of (description ?? "").split(/\r?\n/)) {
    const line = raw.trim();
    if (line.toLowerCase() === POINTS_HEADING.toLowerCase()) continue;
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
    summary.push(line);
  }

  info.summary = summary.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  return info;
}

export function formatCourseInfo(info: CourseInfo): string {
  const fields = FIELDS.filter(([, key]) => info[key].trim()).map(
    ([label, key]) => `${label}: ${info[key].trim()}`,
  );
  const points = info.points.map((p) => p.trim()).filter(Boolean);

  return [
    info.summary.trim(),
    fields.join("\n"),
    points.length ? [POINTS_HEADING, ...points.map((p) => `- ${p}`)].join("\n") : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}
