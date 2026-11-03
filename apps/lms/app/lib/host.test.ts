import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { matchesDomainFamily, getApiBaseUrl, getMarketingUrl, getAdminUrl, getLmsUrl } from "./host";
import { siteLoginUrl, siteSignupUrl } from "./site";

describe("Host and Domain Family Isolation Suite", () => {
  const originalWindow = globalThis.window;
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    globalThis.window = originalWindow;
    process.env = originalEnv;
  });

  describe("1. matchesDomainFamily isolates environments cleanly", () => {
    it("allows URLs belonging to the staging testfox.in family", () => {
      expect(matchesDomainFamily("https://marketing.testfox.in", "lms.testfox.in")).toBe(true);
      expect(matchesDomainFamily("https://whatboutme.testfox.in", "lms.testfox.in")).toBe(true);
      expect(matchesDomainFamily("https://admin.testfox.in", "lms.testfox.in")).toBe(true);
      expect(matchesDomainFamily("https://lms.testfox.in", "marketing.testfox.in")).toBe(true);
    });

    it("STRICTLY REJECTS production/preview Vercel URLs when on staging testfox.in", () => {
      // THIS IS THE EXACT BUG GUARD: inlined NEXT_PUBLIC_LMS_URL from Vercel must not leak to testfox.in
      expect(
        matchesDomainFamily("https://what-bout-me-com-lms.vercel.app", "lms.testfox.in"),
      ).toBe(false);
      expect(
        matchesDomainFamily("https://what-bout-me-com-lms.vercel.app", "marketing.testfox.in"),
      ).toBe(false);
      expect(
        matchesDomainFamily("https://what-bout-me-com-atyb.vercel.app", "lms.testfox.in"),
      ).toBe(false);
    });

    it("STRICTLY REJECTS production custom domain URLs when on staging testfox.in", () => {
      expect(matchesDomainFamily("https://whatboutme.com", "lms.testfox.in")).toBe(false);
      expect(matchesDomainFamily("https://learn.whatboutme.com", "lms.testfox.in")).toBe(false);
      expect(matchesDomainFamily("https://api.whatboutme.com", "lms.testfox.in")).toBe(false);
    });

    it("allows production Vercel URLs when on vercel.app preview deployments", () => {
      expect(
        matchesDomainFamily(
          "https://what-bout-me-com-lms.vercel.app",
          "what-bout-me-com-atyb.vercel.app",
        ),
      ).toBe(true);
      expect(
        matchesDomainFamily("https://lms.testfox.in", "what-bout-me-com-atyb.vercel.app"),
      ).toBe(false);
    });

    it("preserves localhost isolation in local development", () => {
      expect(matchesDomainFamily("http://localhost:3000", "localhost")).toBe(true);
      expect(matchesDomainFamily("http://127.0.0.1:4000", "127.0.0.1")).toBe(true);
      expect(matchesDomainFamily("https://lms.testfox.in", "localhost")).toBe(false);
      expect(matchesDomainFamily("https://what-bout-me-com-lms.vercel.app", "localhost")).toBe(
        false,
      );
    });
  });

  describe("2. Client runtime URL resolution per environment", () => {
    it("resolves exact Staging URLs when on lms.testfox.in", () => {
      Object.defineProperty(globalThis, "window", {
        value: {
          location: {
            hostname: "lms.testfox.in",
            origin: "https://lms.testfox.in",
          },
        },
        writable: true,
        configurable: true,
      });

      // Even if NEXT_PUBLIC_LMS_URL was inlined with production Vercel URL, it must be ignored on staging!
      process.env.NEXT_PUBLIC_LMS_URL = "https://what-bout-me-com-lms.vercel.app";
      process.env.NEXT_PUBLIC_SITE_URL = "https://what-bout-me-com-atyb.vercel.app";
      process.env.NEXT_PUBLIC_API_URL = "https://what-bout-me-com.vercel.app";

      expect(getLmsUrl()).toBe("https://lms.testfox.in");
      expect(getMarketingUrl()).toBe("https://marketing.testfox.in");
      expect(getApiBaseUrl()).toBe("https://whatboutme.testfox.in");
      expect(getAdminUrl()).toBe("https://admin.testfox.in");
    });

    it("resolves exact Production Vercel URLs when on vercel.app preview", () => {
      Object.defineProperty(globalThis, "window", {
        value: {
          location: {
            hostname: "what-bout-me-com-lms.vercel.app",
            origin: "https://what-bout-me-com-lms.vercel.app",
          },
        },
        writable: true,
        configurable: true,
      });

      delete process.env.NEXT_PUBLIC_LMS_URL;
      delete process.env.NEXT_PUBLIC_SITE_URL;
      delete process.env.NEXT_PUBLIC_API_URL;

      expect(getLmsUrl()).toBe("https://what-bout-me-com-lms.vercel.app");
      expect(getMarketingUrl()).toBe("https://what-bout-me-com-atyb.vercel.app");
      expect(getApiBaseUrl()).toBe("https://what-bout-me-com.vercel.app");
      expect(getAdminUrl()).toBe("https://what-bout-me-com-admin.vercel.app");
    });

    it("resolves local development ports on localhost", () => {
      Object.defineProperty(globalThis, "window", {
        value: {
          location: {
            hostname: "localhost",
            origin: "http://localhost:3003",
          },
        },
        writable: true,
        configurable: true,
      });

      delete process.env.NEXT_PUBLIC_LMS_URL;
      delete process.env.NEXT_PUBLIC_SITE_URL;
      delete process.env.NEXT_PUBLIC_API_URL;

      expect(getLmsUrl()).toBe("http://localhost:3003");
      expect(getMarketingUrl()).toBe("http://localhost:3000");
      expect(getApiBaseUrl()).toBe("http://localhost:4000");
      expect(getAdminUrl()).toBe("http://localhost:3002");
    });
  });

  describe("3. siteLoginUrl and siteSignupUrl include lms_origin parameter", () => {
    it("attaches lms_origin when running on staging lms.testfox.in", () => {
      Object.defineProperty(globalThis, "window", {
        value: {
          location: {
            hostname: "lms.testfox.in",
            origin: "https://lms.testfox.in",
          },
        },
        writable: true,
        configurable: true,
      });

      const loginTarget = siteLoginUrl("/programs/prog-1?batchId=b1");
      expect(loginTarget).toContain("https://marketing.testfox.in/login?");
      expect(loginTarget).toContain("portal=%2Fprograms%2Fprog-1%3FbatchId%3Db1");
      expect(loginTarget).toContain("lms_origin=https%3A%2F%2Flms.testfox.in");

      const signupTarget = siteSignupUrl("/agreement");
      expect(signupTarget).toContain("https://marketing.testfox.in/signup?");
      expect(signupTarget).toContain("lms_origin=https%3A%2F%2Flms.testfox.in");
    });
  });
});

