import { describe, it, expect, beforeEach } from "vitest";
import { resolveProgramEntry } from "./programEntryLogic";
import { peekEnrollmentIntent, clearEnrollmentIntent } from "../../lib/auth-redirect";

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

describe("Program Entry & Smart Enrollment State Machine (resolveProgramEntry)", () => {
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
    clearEnrollmentIntent();
  });

  it("returns fallback courses URL when programId is empty or whitespace", () => {
    const res1 = resolveProgramEntry({
      programId: "",
      token: "valid-jwt",
      autoEnroll: true,
    });
    expect(res1.action).toBe("FALLBACK_COURSES");
    expect(res1.url).toBe("/courses");

    const res2 = resolveProgramEntry({
      programId: "   ",
      token: null,
      autoEnroll: false,
    });
    expect(res2.action).toBe("FALLBACK_COURSES");
  });

  it("handles unauthenticated guest with autoEnroll=true by saving intent and directing to signup", () => {
    const res = resolveProgramEntry({
      programId: "prog-101",
      token: null,
      autoEnroll: true,
      batchId: "batch-summer-2026",
      coupon: "SAVE25",
    });

    expect(res.action).toBe("REDIRECT_AUTH");
    if (res.action === "REDIRECT_AUTH") {
      expect(res.mode).toBe("SIGNUP");
      expect(res.url).toContain("/signup?");
      expect(res.url).toContain("redirect=");
      const decodedUrl = decodeURIComponent(res.url);
      expect(decodedUrl).toContain("batchId=batch-summer-2026");
      expect(decodedUrl).toContain("coupon=SAVE25");
    }

    // Verify localStorage intent was written with TTL
    const stored = peekEnrollmentIntent();
    expect(stored).not.toBeNull();
    expect(stored?.programId).toBe("prog-101");
    expect(stored?.batchId).toBe("batch-summer-2026");
    expect(stored?.couponCode).toBe("SAVE25");
  });

  it("handles unauthenticated guest with autoEnroll=false by routing to login", () => {
    const res = resolveProgramEntry({
      programId: "prog-101",
      token: null,
      autoEnroll: false,
    });

    expect(res.action).toBe("REDIRECT_AUTH");
    if (res.action === "REDIRECT_AUTH") {
      expect(res.mode).toBe("LOGIN");
      expect(res.url).toContain("/login?");
    }
  });

  it("skips duplicate checkout/agreement and routes already ACTIVE learner to steps with welcome-back flag", () => {
    const res = resolveProgramEntry({
      programId: "prog-101",
      token: "valid-session",
      autoEnroll: true,
      userEnrolments: [
        {
          id: "enrol-active-1",
          programId: "prog-101",
          status: "ACTIVE",
        },
      ],
    });

    expect(res.action).toBe("REDIRECT_STEPS");
    expect(res.url).toBe("/programs/prog-101/steps?welcomeBack=1");
    if (res.action === "REDIRECT_STEPS") {
      expect(res.isWelcomeBack).toBe(true);
    }
  });

  it("skips duplicate checkout/agreement when matched via course slug", () => {
    const res = resolveProgramEntry({
      programId: "11-steps-to-u",
      token: "valid-session",
      autoEnroll: true,
      userEnrolments: [
        {
          id: "enrol-active-slug",
          programId: "prog-real-uuid",
          status: "COMPLETED",
          program: { slug: "11-steps-to-u" },
        },
      ],
    });

    expect(res.action).toBe("REDIRECT_STEPS");
    expect(res.url).toBe("/programs/prog-real-uuid/steps?welcomeBack=1");
    if (res.action === "REDIRECT_STEPS") {
      expect(res.isWelcomeBack).toBe(true);
    }
  });

  it("routes learner with PENDING_PAYMENT directly to /checkout preserving batch and coupon", () => {
    const res = resolveProgramEntry({
      programId: "prog-101",
      token: "valid-session",
      autoEnroll: true,
      batchId: "batch-weekend",
      coupon: "SPECIAL10",
      userEnrolments: [
        {
          id: "enrol-pending-pay",
          programId: "prog-101",
          status: "PENDING_PAYMENT",
        },
      ],
    });

    expect(res.action).toBe("REDIRECT_CHECKOUT");
    expect(res.url).toContain("/checkout?");
    expect(res.url).toContain("programId=prog-101");
    expect(res.url).toContain("enrolmentId=enrol-pending-pay");
    expect(res.url).toContain("batchId=batch-weekend");
    expect(res.url).toContain("coupon=SPECIAL10");
  });

  it("routes authenticated visitor without existing enrolment to /agreement when autoEnroll=true", () => {
    const res = resolveProgramEntry({
      programId: "prog-new-user",
      token: "valid-session",
      autoEnroll: true,
      batchId: "batch-1",
      coupon: "VIP",
      userEnrolments: [],
    });

    expect(res.action).toBe("REDIRECT_AGREEMENT");
    expect(res.url).toBe(
      "/agreement?programId=prog-new-user&autoEnroll=true&batchId=batch-1&coupon=VIP",
    );
  });

  it("routes authenticated visitor to /steps overview when autoEnroll=false", () => {
    const res = resolveProgramEntry({
      programId: "prog-view-only",
      token: "valid-session",
      autoEnroll: false,
      userEnrolments: [],
    });

    expect(res.action).toBe("REDIRECT_STEPS");
    expect(res.url).toBe("/programs/prog-view-only/steps");
    if (res.action === "REDIRECT_STEPS") {
      expect(res.isWelcomeBack).toBe(false);
    }
  });
});
