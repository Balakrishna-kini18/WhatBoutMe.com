import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { matchesDomainFamily, getApiBaseUrl, getMarketingUrl, getAdminUrl, getLmsUrl, deriveVercelUrl } from "./host";

describe("Admin Host and Domain Family Isolation Suite", () => {
  const originalWindow = globalThis.window;
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    globalThis.window = originalWindow;
    process.env = originalEnv;
  });

  describe("1. deriveVercelUrl handles dynamic Vercel project naming", () => {
    it("handles active WhatBoutMe Vercel family: admin-whataboutme.vercel.app & lms-whatboutme.vercel.app", () => {
      expect(deriveVercelUrl("admin-whataboutme.vercel.app", "admin")).toBe("https://admin-whataboutme.vercel.app");
      expect(deriveVercelUrl("admin-whataboutme.vercel.app", "api")).toBe("https://what-bout-me-com-backend.vercel.app");
      expect(deriveVercelUrl("admin-whataboutme.vercel.app", "lms")).toBe("https://lms-whatboutme.vercel.app");
      expect(deriveVercelUrl("admin-whataboutme.vercel.app", "marketing")).toBe("https://marketing-whatboutme.vercel.app");
    });

    it("handles generic prefix-based naming: admin-acme.vercel.app", () => {
      expect(deriveVercelUrl("admin-acme.vercel.app", "admin")).toBe("https://admin-acme.vercel.app");
      expect(deriveVercelUrl("admin-acme.vercel.app", "api")).toBe("https://api-acme.vercel.app");
      expect(deriveVercelUrl("admin-acme.vercel.app", "lms")).toBe("https://lms-acme.vercel.app");
      expect(deriveVercelUrl("admin-acme.vercel.app", "marketing")).toBe("https://acme.vercel.app");
    });

    it("handles suffix-based naming: whataboutme-admin.vercel.app", () => {
      expect(deriveVercelUrl("whataboutme-admin.vercel.app", "admin")).toBe("https://whataboutme-admin.vercel.app");
      expect(deriveVercelUrl("whataboutme-admin.vercel.app", "api")).toBe("https://whataboutme-api.vercel.app");
      expect(deriveVercelUrl("whataboutme-admin.vercel.app", "lms")).toBe("https://whataboutme-lms.vercel.app");
      expect(deriveVercelUrl("whataboutme-admin.vercel.app", "marketing")).toBe("https://whataboutme.vercel.app");
    });

    it("preserves legacy what-bout-me-com deployments", () => {
      expect(deriveVercelUrl("what-bout-me-com-admin.vercel.app", "api")).toBe("https://what-bout-me-com.vercel.app");
      expect(deriveVercelUrl("what-bout-me-com-admin.vercel.app", "marketing")).toBe("https://what-bout-me-com-atyb.vercel.app");
    });
  });

  describe("2. matchesDomainFamily isolates environments cleanly", () => {
    it("allows URLs belonging to the staging testfox.in family", () => {
      expect(matchesDomainFamily("https://marketing.testfox.in", "admin.testfox.in")).toBe(true);
      expect(matchesDomainFamily("https://whatboutme.testfox.in", "admin.testfox.in")).toBe(true);
      expect(matchesDomainFamily("https://admin.testfox.in", "admin.testfox.in")).toBe(true);
    });

    it("strictly rejects Vercel URLs when on staging testfox.in", () => {
      expect(matchesDomainFamily("https://what-bout-me-com-admin.vercel.app", "admin.testfox.in")).toBe(false);
      expect(matchesDomainFamily("https://admin-whataboutme.vercel.app", "admin.testfox.in")).toBe(false);
    });

    it("preserves localhost isolation in local development", () => {
      expect(matchesDomainFamily("http://localhost:4000", "localhost")).toBe(true);
      expect(matchesDomainFamily("http://127.0.0.1:4000", "127.0.0.1")).toBe(true);
      expect(matchesDomainFamily("https://what-bout-me-com.vercel.app", "localhost")).toBe(false);
    });

    it("allows configured target URLs when deployed on Vercel", () => {
      expect(matchesDomainFamily("https://api-whataboutme.vercel.app", "admin-whataboutme.vercel.app")).toBe(true);
      expect(matchesDomainFamily("https://api.whatboutme.com", "admin-whataboutme.vercel.app")).toBe(true);
    });
  });

  describe("3. Client runtime URL resolution per environment", () => {
    it("dynamically resolves sibling Vercel URLs when on admin-whataboutme.vercel.app without env vars", () => {
      Object.defineProperty(globalThis, "window", {
        value: {
          location: {
            hostname: "admin-whataboutme.vercel.app",
            origin: "https://admin-whataboutme.vercel.app",
          },
        },
        writable: true,
        configurable: true,
      });

      delete process.env.NEXT_PUBLIC_ADMIN_URL;
      delete process.env.NEXT_PUBLIC_LMS_URL;
      delete process.env.NEXT_PUBLIC_MARKETING_URL;
      delete process.env.NEXT_PUBLIC_API_URL;

      expect(getAdminUrl()).toBe("https://admin-whataboutme.vercel.app");
      expect(getApiBaseUrl()).toBe("https://what-bout-me-com-backend.vercel.app");
      expect(getLmsUrl()).toBe("https://lms-whatboutme.vercel.app");
      expect(getMarketingUrl()).toBe("https://marketing-whatboutme.vercel.app");
    });

    it("honors explicitly configured NEXT_PUBLIC_API_URL when on vercel.app", () => {
      Object.defineProperty(globalThis, "window", {
        value: {
          location: {
            hostname: "admin-whataboutme.vercel.app",
            origin: "https://admin-whataboutme.vercel.app",
          },
        },
        writable: true,
        configurable: true,
      });

      process.env.NEXT_PUBLIC_API_URL = "https://custom-api.whatboutme.com";
      expect(getApiBaseUrl()).toBe("https://custom-api.whatboutme.com");
    });
  });
});

