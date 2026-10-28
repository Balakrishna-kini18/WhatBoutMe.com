import { describe, it, expect } from "vitest";
import {
  getTimeOfDayGreeting,
  formatLearnerFirstName,
  formatSupportingCourseText,
} from "./heroLogic";

describe("Hero logic functions", () => {
  describe("getTimeOfDayGreeting", () => {
    it("returns 'Good Morning' before 12:00", () => {
      const d1 = new Date("2026-10-28T08:30:00");
      expect(getTimeOfDayGreeting(d1)).toBe("Good Morning");

      const d2 = new Date("2026-10-28T11:59:59");
      expect(getTimeOfDayGreeting(d2)).toBe("Good Morning");
    });

    it("returns 'Good Afternoon' between 12:00 and 16:59", () => {
      const d1 = new Date("2026-10-28T12:00:00");
      expect(getTimeOfDayGreeting(d1)).toBe("Good Afternoon");

      const d2 = new Date("2026-10-28T14:45:00");
      expect(getTimeOfDayGreeting(d2)).toBe("Good Afternoon");

      const d3 = new Date("2026-10-28T16:59:59");
      expect(getTimeOfDayGreeting(d3)).toBe("Good Afternoon");
    });

    it("returns 'Good Evening' from 17:00 onwards", () => {
      const d1 = new Date("2026-10-28T17:00:00");
      expect(getTimeOfDayGreeting(d1)).toBe("Good Evening");

      const d2 = new Date("2026-10-28T21:30:00");
      expect(getTimeOfDayGreeting(d2)).toBe("Good Evening");

      const d3 = new Date("2026-10-28T23:59:59");
      expect(getTimeOfDayGreeting(d3)).toBe("Good Evening");
    });
  });

  describe("formatLearnerFirstName", () => {
    it("extracts the first name from single-word or multi-word string", () => {
      expect(formatLearnerFirstName("sahyadri")).toBe("sahyadri");
      expect(formatLearnerFirstName("Sahyadri Patil")).toBe("Sahyadri");
      expect(formatLearnerFirstName("  Roweena   Sachdev  ")).toBe("Roweena");
    });

    it("falls back to default when name is empty or undefined", () => {
      expect(formatLearnerFirstName("")).toBe("sahyadri");
      expect(formatLearnerFirstName(undefined)).toBe("sahyadri");
      expect(formatLearnerFirstName("   ", "Learner")).toBe("Learner");
    });
  });

  describe("formatSupportingCourseText", () => {
    it("formats message for 0 courses", () => {
      expect(formatSupportingCourseText(0)).toContain("0 active courses");
      expect(formatSupportingCourseText(0)).toContain("explore your curriculum");
    });

    it("formats singular message for 1 course", () => {
      expect(formatSupportingCourseText(1)).toBe(
        "You have 1 active course in progress — keep learning and build a better version of yourself every day."
      );
    });

    it("formats plural message for multiple courses", () => {
      expect(formatSupportingCourseText(4)).toBe(
        "You have 4 active courses in progress — keep learning and build a better version of yourself every day."
      );
      expect(formatSupportingCourseText(7)).toBe(
        "You have 7 active courses in progress — keep learning and build a better version of yourself every day."
      );
    });
  });
});
