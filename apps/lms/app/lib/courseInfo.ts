/**
 * Course details parser for LMS
 *
 * Course details are stored inside a program's plain-text description:
 *
 *   Summary paragraph.
 *
 *   Type: Certification
 *   Duration: 12 classes
 *   For: Individuals · Teams
 *   In person: 2 hours · Speaker 60 min
 *   Online: 12 live classes · 2 hours each
 *   Image: https://res.cloudinary.com/...
 *
 *   What it covers:
 *   - First point
 *   - Second point
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

  if (!description) return info;

  const text = description.trim();

  // Extract Image URL if present (URLs don't contain whitespace or newlines)
  const imageMatch = text.match(/\bImage:\s*([^\s\n\r]+)/i);
  if (imageMatch && imageMatch[1]) {
    info.image = imageMatch[1].replace(/[.,;)]+$/, "").trim();
  }

  // Next field or newline lookahead pattern
  const nextFieldOrEnd = "(?=\\s*(?:Duration:|For:|In person:|Online:|Image:|What it covers:|$|\\r?\\n))";

  // Extract Type if present
  const typeMatch = text.match(new RegExp(`\\bType:\\s*([^:\\n\\r]+?)${nextFieldOrEnd}`, "i"));
  if (typeMatch && typeMatch[1]) {
    info.type = typeMatch[1].trim();
  }

  // Extract Duration if present
  const nextFieldForDuration = "(?=\\s*(?:Type:|For:|In person:|Online:|Image:|What it covers:|$|\\r?\\n))";
  const durationMatch = text.match(new RegExp(`\\bDuration:\\s*([^:\\n\\r]+?)${nextFieldForDuration}`, "i"));
  if (durationMatch && durationMatch[1]) {
    info.duration = durationMatch[1].trim();
  }

  // Extract Audience (For:)
  const nextFieldForAudience = "(?=\\s*(?:Type:|Duration:|In person:|Online:|Image:|What it covers:|$|\\r?\\n))";
  const audienceMatch = text.match(new RegExp(`\\bFor:\\s*([^:\\n\\r]+?)${nextFieldForAudience}`, "i"));
  if (audienceMatch && audienceMatch[1]) {
    info.audience = audienceMatch[1].trim();
  }

  // Extract In person
  const nextFieldForInPerson = "(?=\\s*(?:Type:|Duration:|For:|Online:|Image:|What it covers:|$|\\r?\\n))";
  const inPersonMatch = text.match(new RegExp(`\\bIn person:\\s*([^:\\n\\r]+?)${nextFieldForInPerson}`, "i"));
  if (inPersonMatch && inPersonMatch[1]) {
    info.inPerson = inPersonMatch[1].trim();
  }

  // Extract Online
  const nextFieldForOnline = "(?=\\s*(?:Type:|Duration:|For:|In person:|Image:|What it covers:|$|\\r?\\n))";
  const onlineMatch = text.match(new RegExp(`\\bOnline:\\s*([^:\\n\\r]+?)${nextFieldForOnline}`, "i"));
  if (onlineMatch && onlineMatch[1]) {
    info.online = onlineMatch[1].trim();
  }

  // Extract What it covers points
  const pointsMatch = text.match(/What it covers:\s*([\s\S]*)/i);
  if (pointsMatch && pointsMatch[1]) {
    const rawPoints = pointsMatch[1];
    // Split by newlines or bullet markers
    const items = rawPoints.split(/(?:\r?\n|[-•])+/);
    for (const item of items) {
      const clean = item.replace(/^[-•]\s*/, "").trim();
      if (clean && clean.length > 1) {
        info.points.push(clean);
      }
    }
  }

  // Clean summary: everything before the first metadata field
  const firstFieldMatch = text.search(
    /\b(?:Type:|Duration:|For:|In person:|Online:|Image:|What it covers:)/i
  );
  if (firstFieldMatch !== -1) {
    info.summary = text.slice(0, firstFieldMatch).trim();
  } else {
    info.summary = text;
  }

  // If summary ended up empty (e.g. metadata started first), fall back to text without fields
  if (!info.summary) {
    info.summary = text
      .replace(/\b(?:Type|Duration|For|In person|Online|Image):\s*[^\n\r]+/gi, "")
      .replace(/What it covers:[\s\S]*/gi, "")
      .trim();
  }

  return info;
}
