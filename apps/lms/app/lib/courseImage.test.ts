import { describe, it, expect } from "vitest";
import { courseImageFor, DEFAULT_COURSE_IMAGE } from "./courseImage";

describe("courseImageFor", () => {
  it("prioritizes coverImage over title matching when coverImage is provided", () => {
    const customCover = "https://res.cloudinary.com/ze1jhwgz/image/upload/v1793852424/mbxhratproksfnnu98hz.png";
    expect(courseImageFor("Sigma 1", customCover)).toBe(customCover);
    expect(courseImageFor("DELTA", customCover)).toBe(customCover);
    expect(courseImageFor("Unknown Random Program", customCover)).toBe(customCover);
  });

  it("trims whitespace from coverImage", () => {
    const customCover = "  https://res.cloudinary.com/ze1jhwgz/image/upload/test.png  ";
    expect(courseImageFor("DELTA", customCover)).toBe(
      "https://res.cloudinary.com/ze1jhwgz/image/upload/test.png"
    );
  });

  it("falls back to title matching when coverImage is null, undefined, or empty", () => {
    expect(courseImageFor("Sigma 1", null)).toBe("/brand/course-celebrate.webp");
    expect(courseImageFor("First Step Course", undefined)).toBe("/brand/course-learning.webp");
    expect(courseImageFor("First Step Course", "   ")).toBe("/brand/course-learning.webp");
  });

  it("falls back to DEFAULT_COURSE_IMAGE when title does not match and no coverImage exists", () => {
    expect(courseImageFor("Random New Course", null)).toBe(DEFAULT_COURSE_IMAGE);
    expect(courseImageFor(null, null)).toBe(DEFAULT_COURSE_IMAGE);
    expect(courseImageFor("", "")).toBe(DEFAULT_COURSE_IMAGE);
  });
});
