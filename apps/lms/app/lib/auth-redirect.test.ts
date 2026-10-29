import { describe, it, expect, beforeEach } from "vitest";
import {
  sanitizeReturnUrl,
  sanitizeExternalUrl,
  extractRedirectParam,
  buildCourseEnrollmentReturnUrl,
  saveEnrollmentIntent,
  peekEnrollmentIntent,
  clearEnrollmentIntent,
  consumeEnrollmentIntent,
  buildAuthHref,
  ENROLLMENT_INTENT_STORAGE_KEY,
  ENROLLMENT_INTENT_TTL_MS,
} from "./auth-redirect";

// Minimal localStorage mock for node/vitest environment
class MemoryStorage {
  private store = new Map<string, string>();
  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }
  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  clear(): void {
    this.store.clear();
  }
}

describe("Post-Signup & Post-Login Course Enrollment Redirect Suite", () => {
  const mockStorage = new MemoryStorage();

  beforeEach(() => {
    mockStorage.clear();
    Object.defineProperty(globalThis, "window", {
      value: { localStorage: mockStorage },
      writable: true,
      configurable: true,
    });
    Object.defineProperty(globalThis, "localStorage", {
      value: mockStorage,
      writable: true,
      configurable: true,
    });
  });

  describe("1. Security: sanitizeReturnUrl blocks Open Redirects & Auth-Loop paths", () => {
    it("rejects external URLs, protocol-relative URLs, backslash bypasses, and javascript: URIs", () => {
      expect(sanitizeReturnUrl("https://evil.com")).toBe("/courses");
      expect(sanitizeReturnUrl("http://evil.com/phish")).toBe("/courses");
      expect(sanitizeReturnUrl("//evil.com")).toBe("/courses");
      expect(sanitizeReturnUrl("///evil.com")).toBe("/courses");
      expect(sanitizeReturnUrl("/\\evil.com")).toBe("/courses");
      expect(sanitizeReturnUrl("javascript:alert(1)")).toBe("/courses");
      expect(sanitizeReturnUrl("data:text/html,<script>alert(1)</script>")).toBe("/courses");
      expect(sanitizeReturnUrl("%2f%2fevil.com")).toBe("/courses");
      expect(sanitizeReturnUrl("%2f%5cevil.com")).toBe("/courses");
      expect(sanitizeReturnUrl("https%3A%2F%2Fevil.com")).toBe("/courses");
    });

    it("rejects auth routes to prevent infinite post-auth redirect loops", () => {
      expect(sanitizeReturnUrl("/login")).toBe("/courses");
      expect(sanitizeReturnUrl("/login?redirect=/programs/123")).toBe("/courses");
      expect(sanitizeReturnUrl("/signup")).toBe("/courses");
      expect(sanitizeReturnUrl("/signup?redirect=/programs/123")).toBe("/courses");
      expect(sanitizeReturnUrl("/register")).toBe("/courses");
      expect(sanitizeReturnUrl("/verify")).toBe("/courses");
      expect(sanitizeReturnUrl("/verify-email?email=a@b.com")).toBe("/courses");
      expect(sanitizeReturnUrl("/forgot-password")).toBe("/courses");
      expect(sanitizeReturnUrl("/reset-password")).toBe("/courses");
      expect(sanitizeReturnUrl("/logout")).toBe("/courses");
      expect(sanitizeReturnUrl("/sso")).toBe("/courses");
    });

    it("allows valid internal course, agreement, checkout, and learning path URLs with query params", () => {
      expect(
        sanitizeReturnUrl("/programs/c8539415-d2b1-48b0-a314-b665c23691ff?autoEnroll=true&batchId=batch-1&coupon=SAVE20"),
      ).toBe("/programs/c8539415-d2b1-48b0-a314-b665c23691ff?autoEnroll=true&batchId=batch-1&coupon=SAVE20");

      expect(
        sanitizeReturnUrl("/agreement?programId=prog-1&autoEnroll=true&batchId=b2"),
      ).toBe("/agreement?programId=prog-1&autoEnroll=true&batchId=b2");

      expect(sanitizeReturnUrl("/programs/prog-1/steps")).toBe("/programs/prog-1/steps");
      expect(sanitizeReturnUrl("/checkout?programId=prog-1&coupon=VIP")).toBe(
        "/checkout?programId=prog-1&coupon=VIP",
      );
    });

    it("handles URL-encoded valid internal paths cleanly", () => {
      const encoded = encodeURIComponent("/programs/prog-123?autoEnroll=true&batchId=b-99");
      expect(sanitizeReturnUrl(encoded)).toBe("/programs/prog-123?autoEnroll=true&batchId=b-99");
    });
  });

  describe("2. Preserving Course Sub-Selections (programId, batchId, coupon, autoEnroll)", () => {
    it("builds a deterministic course enrollment return URL with all sub-selections", () => {
      const agreementUrl = buildCourseEnrollmentReturnUrl({
        programId: "prog-uuid-1",
        batchId: "batch-uuid-9",
        couponCode: "EARLYBIRD",
        autoEnroll: true,
      });
      expect(agreementUrl).toBe(
        "/agreement?programId=prog-uuid-1&autoEnroll=true&batchId=batch-uuid-9&coupon=EARLYBIRD",
      );

      const programEntryUrl = buildCourseEnrollmentReturnUrl({
        programId: "prog-uuid-1",
        batchId: "batch-uuid-9",
        couponCode: "EARLYBIRD",
        autoEnroll: true,
        basePath: "/programs",
      });
      expect(programEntryUrl).toBe(
        "/programs/prog-uuid-1?autoEnroll=true&batchId=batch-uuid-9&coupon=EARLYBIRD",
      );
    });

    it("extracts redirect parameter from URLSearchParams or query object", () => {
      const sp = new URLSearchParams(
        "redirect=%2Fprograms%2Fprog-1%3FautoEnroll%3Dtrue%26batchId%3Db1",
      );
      expect(extractRedirectParam(sp)).toBe("/programs/prog-1?autoEnroll=true&batchId=b1");
    });
  });

  describe("3. Cross-Tab Storage Fallback with 30-Minute TTL & Stale Intent Prevention", () => {
    it("saves and retrieves valid enrollment intent within the 30-minute TTL", () => {
      const baseNow = 1_700_000_000_000;
      const saved = saveEnrollmentIntent(
        {
          returnUrl: "/programs/prog-1?autoEnroll=true&batchId=b1&coupon=WELCOME",
          programId: "prog-1",
          batchId: "b1",
          couponCode: "WELCOME",
          autoEnroll: true,
        },
        baseNow,
      );

      expect(saved).not.toBeNull();
      expect(saved?.returnUrl).toBe("/programs/prog-1?autoEnroll=true&batchId=b1&coupon=WELCOME");
      expect(saved?.expiresAt).toBe(baseNow + ENROLLMENT_INTENT_TTL_MS);

      // Peek 10 minutes later (still valid)
      const peeked = peekEnrollmentIntent(baseNow + 10 * 60 * 1000);
      expect(peeked).not.toBeNull();
      expect(peeked?.programId).toBe("prog-1");
      expect(peeked?.batchId).toBe("b1");
      expect(peeked?.couponCode).toBe("WELCOME");
    });

    it("expires and purges stale enrollment intent after 30 minutes (Scenario #6)", () => {
      const baseNow = 1_700_000_000_000;
      saveEnrollmentIntent(
        {
          returnUrl: "/programs/prog-1?autoEnroll=true",
          programId: "prog-1",
        },
        baseNow,
      );

      // 31 minutes later -> expired!
      const afterExpiry = baseNow + 31 * 60 * 1000;
      expect(peekEnrollmentIntent(afterExpiry)).toBeNull();
      expect(mockStorage.getItem(ENROLLMENT_INTENT_STORAGE_KEY)).toBeNull();
    });

    it("consumes enrollment intent once and immediately clears storage so future logins are unaffected", () => {
      const baseNow = 1_700_000_000_000;
      saveEnrollmentIntent(
        {
          returnUrl: "/programs/prog-77?autoEnroll=true",
          programId: "prog-77",
        },
        baseNow,
      );

      // First consumption (e.g., after OTP verification in a new tab without URL query param)
      const dest1 = consumeEnrollmentIntent(null, "/courses", baseNow + 60_000);
      expect(dest1).toBe("/programs/prog-77?autoEnroll=true");

      // Second consumption -> storage was cleared, returns default fallback
      const dest2 = consumeEnrollmentIntent(null, "/courses", baseNow + 65_000);
      expect(dest2).toBe("/courses");
    });

    it("explicitly clears stored intent when user clicks top-nav Login directly", () => {
      saveEnrollmentIntent({
        returnUrl: "/programs/prog-77?autoEnroll=true",
        programId: "prog-77",
      });
      clearEnrollmentIntent();
      expect(peekEnrollmentIntent()).toBeNull();
    });
  });

  describe("4. Auth-Page Link Threading (/signup <-> /login <-> /verify-email <-> /forgot-password)", () => {
    it("preserves redirect query parameter when switching between /signup and /login (Scenario #1)", () => {
      const target = "/programs/prog-99?autoEnroll=true&batchId=b5";
      const loginHref = buildAuthHref("/login", target, { email: "learner@example.com" });
      expect(loginHref).toContain("/login?");
      expect(loginHref).toContain(encodeURIComponent(target));
      expect(loginHref).toContain("email=learner%40example.com");

      const signupHref = buildAuthHref("/signup", target);
      expect(signupHref).toContain("/signup?");
      expect(signupHref).toContain(encodeURIComponent(target));
    });

    it("omits redirect query parameter if rawRedirect is malicious or points to an auth page", () => {
      expect(buildAuthHref("/login", "https://evil.com")).toBe("/login");
      expect(buildAuthHref("/signup", "//evil.com")).toBe("/signup");
      expect(buildAuthHref("/login", "/signup")).toBe("/login");
    });
  });

  describe("5. External URL Sanitization (Zoom/Meet Links & External Resources)", () => {
    it("accepts valid HTTPS and HTTP meeting URLs", () => {
      expect(sanitizeExternalUrl("https://zoom.us/j/123456789")).toBe("https://zoom.us/j/123456789");
      expect(sanitizeExternalUrl("https://meet.google.com/abc-defg-hij")).toBe("https://meet.google.com/abc-defg-hij");
      expect(sanitizeExternalUrl("http://localhost:4000/media/doc.pdf")).toBe("http://localhost:4000/media/doc.pdf");
      expect(sanitizeExternalUrl("/media/document/doc-1")).toBe("/media/document/doc-1");
    });

    it("strictly rejects dangerous pseudo-protocols like javascript:, data:, and file:", () => {
      expect(sanitizeExternalUrl("javascript:alert(1)")).toBeNull();
      expect(sanitizeExternalUrl("JAVASCRIPT:alert(document.cookie)")).toBeNull();
      expect(sanitizeExternalUrl("data:text/html,<script>alert(1)</script>")).toBeNull();
      expect(sanitizeExternalUrl("vbscript:msgbox(1)")).toBeNull();
      expect(sanitizeExternalUrl("file:///etc/passwd")).toBeNull();
    });

    it("strictly rejects null, empty string, control chars, and malformed inputs", () => {
      expect(sanitizeExternalUrl(null)).toBeNull();
      expect(sanitizeExternalUrl(undefined)).toBeNull();
      expect(sanitizeExternalUrl("")).toBeNull();
      expect(sanitizeExternalUrl("   ")).toBeNull();
      expect(sanitizeExternalUrl("https://zoom.us/\x00evil")).toBeNull();
    });
  });
});
