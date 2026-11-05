// Each course's own photo, by words in its title. If a program has an explicit
// cover banner image saved in the admin portal, that image is prioritized.
// Courses without a custom cover image fall back to title-matched photos or default.
const PHOTOS: [string[], string][] = [
  [["first", "step"], "/brand/course-learning.webp"],
  [["sigma"], "/brand/course-celebrate.webp"],
];

export const DEFAULT_COURSE_IMAGE = "/brand/course-photo.webp";

export function courseImageFor(
  title?: string | null,
  coverImage?: string | null
): string {
  if (coverImage && typeof coverImage === "string" && coverImage.trim().length > 0) {
    return coverImage.trim();
  }
  const text = (title || "").toLowerCase();
  return (
    PHOTOS.find(([words]) => words.every((w) => text.includes(w)))?.[1] ??
    DEFAULT_COURSE_IMAGE
  );
}
