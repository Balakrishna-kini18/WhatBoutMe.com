import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  sanitizeReturnUrl,
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

// Robust in-memory mock for localStorage
class MockLocalStorage {
  private store = new Map<string, string>();
  public shouldThrowOnSet = false;
  public shouldThrowOnGet = false;

  getItem(key: string): string | null {
    if (this.shouldThrowOnGet) throw new DOMException("Storage restricted", "SecurityError");
    return this.store.has(key) ? this.store.get(key)! : null;
  }
  setItem(key: string, value: string): void {
    if (this.shouldThrowOnSet) throw new DOMException("Quota exceeded", "QuotaExceededError");
    this.store.set(key, String(value));
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  clear(): void {
    this.store.clear();
  }
}

describe("Marketing & Post-Auth Redirect Engine (Senior Dev Comprehensive Audit)", () => {
  let mockStorage: MockLocalStorage;

  beforeEach(() => {
    mockStorage = new MockLocalStorage();
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

  // =========================================================================
  // 1. SECURITY & OPEN-REDIRECT MITIGATION
  // =========================================================================
  describe("1. Security: Open Redirect & Malicious Payload Mitigation", () => {
    it("neutralizes standard external URLs", () => {
      expect(sanitizeReturnUrl("https://attacker.com")).toBe("/courses");
      expect(sanitizeReturnUrl("http://evil.example.org/phish")).toBe("/courses");
      expect(sanitizeReturnUrl("ftp://files.evil.com")).toBe("/courses");
    });

    it("neutralizes protocol-relative and scheme-relative URLs", () => {
      expect(sanitizeReturnUrl("//attacker.com")).toBe("/courses");
      expect(sanitizeReturnUrl("///attacker.com")).toBe("/courses");
      expect(sanitizeReturnUrl("////attacker.com/steal")).toBe("/courses");
    });

    it("neutralizes Windows backslash evasion tricks (e.g. /\\attacker.com)", () => {
      expect(sanitizeReturnUrl("/\\attacker.com")).toBe("/courses");
      expect(sanitizeReturnUrl("\\/attacker.com")).toBe("/courses");
      expect(sanitizeReturnUrl("\\\\attacker.com")).toBe("/courses");
      expect(sanitizeReturnUrl("/path\\to\\danger")).toBe("/courses");
    });

    it("neutralizes javascript: and data: URI XSS vectors", () => {
      expect(sanitizeReturnUrl("javascript:alert(document.cookie)")).toBe("/courses");
      expect(sanitizeReturnUrl("JAVASCRIPT:alert(1)")).toBe("/courses");
      expect(sanitizeReturnUrl("data:text/html,<script>alert(1)</script>")).toBe("/courses");
      expect(sanitizeReturnUrl("vbscript:msgbox(1)")).toBe("/courses");
    });

    it("neutralizes URL-encoded bypasses and double-encoded exploits", () => {
      expect(sanitizeReturnUrl("%2f%2fattacker.com")).toBe("/courses");
      expect(sanitizeReturnUrl("%2f%5cattacker.com")).toBe("/courses");
      expect(sanitizeReturnUrl("https%3A%2F%2Fattacker.com")).toBe("/courses");
    });

    it("neutralizes control characters and null bytes", () => {
      expect(sanitizeReturnUrl("/programs/test\0evil")).toBe("/courses");
      expect(sanitizeReturnUrl("/programs/test\r\nevil")).toBe("/courses");
      expect(sanitizeReturnUrl("/programs/test\x1fevil")).toBe("/courses");
    });

    it("strictly preserves valid safe internal LMS routes with complex query parameters", () => {
      const validPath =
        "/programs/c8539415-d2b1-48b0-a314-b665c23691ff?autoEnroll=true&batchId=batch-apr-2026&coupon=EARLYBIRD#curriculum";
      expect(sanitizeReturnUrl(validPath)).toBe(validPath);

      const validAgreementPath =
        "/agreement?programId=prog-uuid-42&enrolmentId=enrol-99&batchId=b-1";
      expect(sanitizeReturnUrl(validAgreementPath)).toBe(validAgreementPath);

      const validStepsPath = "/programs/prog-1/steps?welcomeBack=1";
      expect(sanitizeReturnUrl(validStepsPath)).toBe(validStepsPath);
    });

    it("accepts custom safe fallback when provided, and supports empty string fallback for existence checks", () => {
      expect(sanitizeReturnUrl("https://evil.com", "/dashboard")).toBe("/dashboard");
      expect(sanitizeReturnUrl("https://evil.com", "")).toBe("");
      expect(sanitizeReturnUrl("/programs/1", "")).toBe("/programs/1");
    });
  });

  // =========================================================================
  // 2. INFINITE AUTH-LOOP PREVENTION
  // =========================================================================
  describe("2. Security: Infinite Post-Auth Loop Rejection", () => {
    it("rejects all authentication routes from being return targets", () => {
      const authRoutes = [
        "/login",
        "/signup",
        "/register",
        "/verify",
        "/verify-email",
        "/forgot-password",
        "/reset-password",
        "/logout",
        "/sso",
      ];

      for (const route of authRoutes) {
        expect(sanitizeReturnUrl(route)).toBe("/courses");
        expect(sanitizeReturnUrl(`${route}?redirect=/programs/123`)).toBe("/courses");
        expect(sanitizeReturnUrl(`${route}/sub-path`)).toBe("/courses");
        expect(sanitizeReturnUrl(route.toUpperCase())).toBe("/courses");
      }
    });
  });

  // =========================================================================
  // 3. ENROLLMENT INTENT PRESERVATION & 30-MINUTE TTL LIFECYCLE
  // =========================================================================
  describe("3. Lifecycle: 30-Minute Intent Storage & Fallback Recovery", () => {
    it("saves and retrieves full enrollment intent before expiration", () => {
      const startTime = 1_700_000_000_000;
      const intent = saveEnrollmentIntent(
        {
          returnUrl: "/agreement?programId=prog-master-1&batchId=batch-10&coupon=SPECIAL20",
          programId: "prog-master-1",
          slug: "11-steps-to-u",
          batchId: "batch-10",
          couponCode: "SPECIAL20",
          autoEnroll: true,
        },
        startTime,
      );

      expect(intent).not.toBeNull();
      expect(intent?.programId).toBe("prog-master-1");
      expect(intent?.couponCode).toBe("SPECIAL20");
      expect(intent?.expiresAt).toBe(startTime + ENROLLMENT_INTENT_TTL_MS);

      // Peek 15 minutes later
      const peeked = peekEnrollmentIntent(startTime + 15 * 60 * 1000);
      expect(peeked).not.toBeNull();
      expect(peeked?.slug).toBe("11-steps-to-u");
      expect(peeked?.batchId).toBe("batch-10");
    });

    it("automatically cleans up expired intent after 30 minutes", () => {
      const startTime = 1_700_000_000_000;
      saveEnrollmentIntent(
        {
          returnUrl: "/programs/prog-expired",
          programId: "prog-expired",
        },
        startTime,
      );

      // Exactly at expiry + 1ms
      const afterExpiry = startTime + ENROLLMENT_INTENT_TTL_MS + 1;
      expect(peekEnrollmentIntent(afterExpiry)).toBeNull();
      expect(mockStorage.getItem(ENROLLMENT_INTENT_STORAGE_KEY)).toBeNull();
    });

    it("peeking does NOT clear intent, but consuming clears it immediately (one-time use)", () => {
      const startTime = 1_700_000_000_000;
      saveEnrollmentIntent(
        {
          returnUrl: "/agreement?programId=prog-test",
          programId: "prog-test",
        },
        startTime,
      );

      // Multiple peeks don't destroy data
      expect(peekEnrollmentIntent(startTime + 1000)).not.toBeNull();
      expect(peekEnrollmentIntent(startTime + 2000)).not.toBeNull();

      // Consumption in a new tab without query params
      const destination = consumeEnrollmentIntent(null, "/courses", startTime + 3000);
      expect(destination).toBe("/agreement?programId=prog-test");

      // Storage is now blank
      expect(mockStorage.getItem(ENROLLMENT_INTENT_STORAGE_KEY)).toBeNull();
      expect(peekEnrollmentIntent(startTime + 4000)).toBeNull();

      // Subsequent login gets safe default fallback
      const secondLoginDest = consumeEnrollmentIntent(null, "/courses", startTime + 5000);
      expect(secondLoginDest).toBe("/courses");
    });

    it("query redirect parameter takes precedence over stored intent", () => {
      const startTime = 1_700_000_000_000;
      saveEnrollmentIntent(
        {
          returnUrl: "/programs/from-stored",
          programId: "from-stored",
        },
        startTime,
      );

      const chosen = consumeEnrollmentIntent(
        "/programs/from-query-override?autoEnroll=true",
        "/courses",
        startTime + 1000,
      );
      expect(chosen).toBe("/programs/from-query-override?autoEnroll=true");
      // And the stored intent was still purged
      expect(peekEnrollmentIntent(startTime + 2000)).toBeNull();
    });

    it("gracefully degrades when localStorage throws QuotaExceeded or SecurityError", () => {
      mockStorage.shouldThrowOnSet = true;
      // Should not throw exception
      const res = saveEnrollmentIntent({
        returnUrl: "/programs/prog-1",
      });
      expect(res).not.toBeNull();

      mockStorage.shouldThrowOnGet = true;
      expect(peekEnrollmentIntent()).toBeNull();
    });
  });

  // =========================================================================
  // 4. AUTH PAGE THREADING & LINK BUILDERS
  // =========================================================================
  describe("4. Integration: Auth Flow Dynamic Link Threading", () => {
    it("dynamically carries ?redirect=... and ?portal=... across /signup <-> /login transitions", () => {
      const destination =
        "/programs/c8539415-d2b1-48b0-a314-b665c23691ff?autoEnroll=true&batchId=b-1&coupon=SAVE50";

      const loginHref = buildAuthHref("/login", destination);
      expect(loginHref).toBe(
        `/login?redirect=${encodeURIComponent(destination)}&portal=${encodeURIComponent(destination)}`,
      );

      const signupHref = buildAuthHref("/signup", destination);
      expect(signupHref).toBe(
        `/signup?redirect=${encodeURIComponent(destination)}&portal=${encodeURIComponent(destination)}`,
      );

      const verifyEmailHref = buildAuthHref("/verify-email", destination, {
        email: "test@whatboutme.com",
      });
      expect(verifyEmailHref).toContain("/verify-email?");
      expect(verifyEmailHref).toContain(`redirect=${encodeURIComponent(destination)}`);
      expect(verifyEmailHref).toContain("email=test%40whatboutme.com");
    });

    it("strips malicious redirect URLs from auth link builder", () => {
      expect(buildAuthHref("/login", "https://evil.com")).toBe("/login");
      expect(buildAuthHref("/signup", "//phishing.com/steal")).toBe("/signup");
      expect(buildAuthHref("/forgot-password", "/login")).toBe("/forgot-password");
    });

    it("extracts redirect param from various query string formats", () => {
      expect(extractRedirectParam("?redirect=%2Fprograms%2F123")).toBe("/programs/123");
      expect(extractRedirectParam("?returnTo=%2Fcheckout%3FprogramId%3D123")).toBe(
        "/checkout?programId=123",
      );
      expect(extractRedirectParam("?portal=%2Fagreement")).toBe("/agreement");
      expect(extractRedirectParam("?redirect=https%3A%2F%2Fevil.com")).toBeNull();
      expect(extractRedirectParam(null)).toBeNull();
    });

    it("builds canonical course enrollment return URLs", () => {
      const agreementReturnUrl = buildCourseEnrollmentReturnUrl({
        programId: "prog-abc",
        batchId: "batch-xyz",
        couponCode: "DISCOUNT",
        autoEnroll: true,
      });
      expect(agreementReturnUrl).toBe(
        "/agreement?programId=prog-abc&autoEnroll=true&batchId=batch-xyz&coupon=DISCOUNT",
      );

      const programReturnUrl = buildCourseEnrollmentReturnUrl({
        programId: "prog-abc",
        batchId: "batch-xyz",
        couponCode: "DISCOUNT",
        autoEnroll: true,
        basePath: "/programs",
      });
      expect(programReturnUrl).toBe(
        "/programs/prog-abc?autoEnroll=true&batchId=batch-xyz&coupon=DISCOUNT",
      );
    });
  });
});
