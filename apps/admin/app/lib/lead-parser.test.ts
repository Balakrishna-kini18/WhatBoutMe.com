import { describe, it, expect } from "vitest";
import { parseLeadMessage } from "./lead-parser";

describe("lead-parser", () => {
  it("parses WhatsApp general enquiry correctly", () => {
    const raw = "[General Enquiry - WhatsApp]\n\nHello, I would like to know if Roweena speaks at corporate events in Dubai.";
    const parsed = parseLeadMessage(raw);

    expect(parsed.isWhatsAppGeneral).toBe(true);
    expect(parsed.isCourseInquiry).toBe(false);
    expect(parsed.originalMessage).toBe("Hello, I would like to know if Roweena speaks at corporate events in Dubai.");
  });

  it("parses Course Inquiry with ID and discovery scheduling info", () => {
    const raw =
      "Course Inquiry: Bipolar Management & Brain Health (ID: prog-123)\n\n" +
      "📅 Discovery Call Scheduled: 2026-11-20T08:00:00.000Z | Zoom: https://zoom.us/j/123456789\n\n" +
      "I have been struggling for 2 years and want to join the next cohort.";

    const parsed = parseLeadMessage(raw);

    expect(parsed.isCourseInquiry).toBe(true);
    expect(parsed.isWhatsAppGeneral).toBe(false);
    expect(parsed.courseInquiry?.title).toBe("Bipolar Management & Brain Health");
    expect(parsed.courseInquiry?.id).toBe("prog-123");
    expect(parsed.discovery?.scheduledAt).toBe("2026-11-20T08:00:00.000Z");
    expect(parsed.discovery?.zoomUrl).toBe("https://zoom.us/j/123456789");
    expect(parsed.originalMessage).toBe("I have been struggling for 2 years and want to join the next cohort.");
  });

  it("parses converted lead notification with enrolment details", () => {
    const raw =
      "Course Inquiry: Neuroplasticity Masterclass (ID: prog-456)\n\n" +
      "Looking forward to speaking.\n\n" +
      "[Converted to Enrolment: enrol-999 | Course: Neuroplasticity Masterclass | Link: https://whatboutme.com/checkout/lead/token123]";

    const parsed = parseLeadMessage(raw);

    expect(parsed.isCourseInquiry).toBe(true);
    expect(parsed.conversion?.enrolmentId).toBe("enrol-999");
    expect(parsed.conversion?.courseTitle).toBe("Neuroplasticity Masterclass");
    expect(parsed.conversion?.checkoutUrl).toBe("https://whatboutme.com/checkout/lead/token123");
    expect(parsed.originalMessage).toBe("Looking forward to speaking.");
  });

  it("strips Join Discovery Call markdown links from customer message", () => {
    const raw =
      "Course Inquiry: Sigma 1 (ID: c8539415-d2b1-48b0-a314-b665c23691ff)\n\n" +
      "fsdfs fsdf\n\n" +
      "[Join Discovery Call &nearr;](https://us05web.zoom.us/j/84651822996?pwd=APKEhqAw8uFf4t8wuwyIGr5fKbUDrK.1)";

    const parsed = parseLeadMessage(raw);

    expect(parsed.originalMessage).toBe("fsdfs fsdf");
    expect(parsed.discovery?.zoomUrl).toBe(
      "https://us05web.zoom.us/j/84651822996?pwd=APKEhqAw8uFf4t8wuwyIGr5fKbUDrK.1"
    );
  });

  it("handles empty or null messages gracefully", () => {
    expect(parseLeadMessage(null)).toEqual({
      originalMessage: "",
      isCourseInquiry: false,
      isWhatsAppGeneral: false,
    });
    expect(parseLeadMessage("   ")).toEqual({
      originalMessage: "",
      isCourseInquiry: false,
      isWhatsAppGeneral: false,
    });
  });
});
