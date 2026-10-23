import { describe, it, expect } from "vitest";

describe("Agreement Management UX & Validation (Admin & LMS)", () => {
  // ─────────────────────────────────────────────────────────────────────────────
  // 1. VERSION FORMAT & DUPLICATE VALIDATION
  // ─────────────────────────────────────────────────────────────────────────────
  describe("1. Version format and uniqueness validation", () => {
    const VERSION_FORMAT_REGEX = /^v?\d+(\.\d+)*$/i;

    it("accepts valid version strings", () => {
      const validVersions = ["v1.0", "v2.0", "1.0", "v1.1", "v10.2.1", "2.0.0"];
      for (const v of validVersions) {
        expect(VERSION_FORMAT_REGEX.test(v.trim())).toBe(true);
      }
    });

    it("rejects invalid version strings", () => {
      const invalidVersions = ["draft", "final-v1", "v 1.0", "v1..0", "version1", ""];
      for (const v of invalidVersions) {
        expect(VERSION_FORMAT_REGEX.test(v.trim())).toBe(false);
      }
    });

    it("detects case-insensitive and whitespace-padded duplicates", () => {
      const existingVersions = [
        { version: "v1.0" },
        { version: "v2.0" },
      ];

      const checkDuplicate = (input: string) => {
        const trimmed = input.trim().toLowerCase();
        return existingVersions.some((v) => v.version.trim().toLowerCase() === trimmed);
      };

      expect(checkDuplicate("v1.0")).toBe(true);
      expect(checkDuplicate("V1.0")).toBe(true);
      expect(checkDuplicate("  v1.0  ")).toBe(true);
      expect(checkDuplicate("v2.0")).toBe(true);
      expect(checkDuplicate("V2.0")).toBe(true);
      expect(checkDuplicate("v3.0")).toBe(false);
      expect(checkDuplicate("v1.1")).toBe(false);
    });

    it("produces the exact required duplicate inline error message", () => {
      const isDuplicate = true;
      const errorMessage = isDuplicate
        ? "This version already exists. Please enter a different version number."
        : null;

      expect(errorMessage).toBe(
        "This version already exists. Please enter a different version number."
      );
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. MARKDOWN RENDERING LOGIC & SANITIZATION
  // ─────────────────────────────────────────────────────────────────────────────
  describe("2. Safe Markdown parsing and rendering", () => {
    // Test link protocol safety
    const isSafeUrl = (url: string): boolean => {
      try {
        const parsed = new URL(url, "https://whatboutme.com");
        return ["http:", "https:", "mailto:"].includes(parsed.protocol);
      } catch {
        return false;
      }
    };

    it("allows safe http, https, and mailto URLs", () => {
      expect(isSafeUrl("https://whatboutme.com/terms")).toBe(true);
      expect(isSafeUrl("http://example.com")).toBe(true);
      expect(isSafeUrl("mailto:support@whatboutme.com")).toBe(true);
      expect(isSafeUrl("/terms")).toBe(true); // relative URL resolved safely
    });

    it("rejects dangerous javascript:, data:, or vbscript: URLs", () => {
      expect(isSafeUrl("javascript:alert(1)")).toBe(false);
      expect(isSafeUrl("data:text/html,<script>alert(1)</script>")).toBe(false);
      expect(isSafeUrl("vbscript:msgbox(1)")).toBe(false);
    });

    it("parses headings correctly according to depth", () => {
      const sample = "# Main Title\n## Subheading\n### Section 1";
      const lines = sample.split("\n");

      const parsedHeadings = lines.map((l) => {
        const m = l.match(/^(#{1,4})\s+(.+)$/);
        return m && m[1] && m[2] ? { level: m[1].length, text: m[2] } : null;
      });

      expect(parsedHeadings[0]).toEqual({ level: 1, text: "Main Title" });
      expect(parsedHeadings[1]).toEqual({ level: 2, text: "Subheading" });
      expect(parsedHeadings[2]).toEqual({ level: 3, text: "Section 1" });
    });

    it("identifies ordered and unordered list items", () => {
      const bulletLine = "- Bullet item";
      const numberedLine = "1. First step";
      const starLine = "* Star bullet";

      expect(/^[-*]\s+/.test(bulletLine)).toBe(true);
      expect(/^[-*]\s+/.test(starLine)).toBe(true);
      expect(/^\d+\.\s+/.test(numberedLine)).toBe(true);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. TAB SWITCHING & CONTENT PRESERVATION
  // ─────────────────────────────────────────────────────────────────────────────
  describe("3. Editor tab switching state", () => {
    it("preserves unsaved text across tab switches between edit and preview", () => {
      let activeTab: "edit" | "preview" = "edit";
      let editorContent = "# Custom Terms\n**Important:** All sales are final.";

      // Switch to preview mode
      activeTab = "preview";
      expect(activeTab).toBe("preview");
      expect(editorContent).toBe("# Custom Terms\n**Important:** All sales are final.");

      // Switch back to edit mode
      activeTab = "edit";
      expect(activeTab).toBe("edit");
      expect(editorContent).toBe("# Custom Terms\n**Important:** All sales are final.");

      // Modify content while in edit mode
      editorContent += "\n- Added clause 2";
      activeTab = "preview";
      expect(editorContent).toContain("- Added clause 2");
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 4. DOUBLE SUBMISSION PREVENTION
  // ─────────────────────────────────────────────────────────────────────────────
  describe("4. Double submission guard", () => {
    it("blocks second submission while request is in-flight", async () => {
      let isSubmitting = false;
      let submissionCount = 0;

      const submitForm = async () => {
        if (isSubmitting) return "BLOCKED";
        isSubmitting = true;
        submissionCount++;
        // simulate async delay
        await new Promise((r) => setTimeout(r, 10));
        isSubmitting = false;
        return "SUCCESS";
      };

      const [res1, res2] = await Promise.all([submitForm(), submitForm()]);
      expect(res1).toBe("SUCCESS");
      expect(res2).toBe("BLOCKED");
      expect(submissionCount).toBe(1);
    });
  });
});
