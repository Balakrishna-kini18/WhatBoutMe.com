// Each course's own photo, by words in its title. The website keeps the same
// list (apps/marketing/src/lib/courses.ts, PHOTOS) so a course shows the same
// picture on both. Courses not listed fall back to the general workshop photo.
const PHOTOS: [string[], string][] = [
  [["first", "step"], "/brand/course-learning.webp"],
  [["sigma"], "/brand/course-celebrate.webp"],
];

export const DEFAULT_COURSE_IMAGE = "/brand/course-photo.webp";

export function courseImageFor(title?: string | null): string {
  const text = (title || "").toLowerCase();
  return PHOTOS.find(([words]) => words.every((w) => text.includes(w)))?.[1] ?? DEFAULT_COURSE_IMAGE;
}
