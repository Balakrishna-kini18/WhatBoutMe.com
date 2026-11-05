import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  detectUserCurrency,
  formatPriceWithCurrency,
  setUserCurrencyPreference,
} from "./currency";

describe("currency.ts - detectUserCurrency", () => {
  const originalLocalStorage = globalThis.localStorage;
  let mockStore: Record<string, string> = {};

  beforeEach(() => {
    mockStore = {};
    const mockStorage = {
      getItem: (key: string) => mockStore[key] || null,
      setItem: (key: string, val: string) => {
        mockStore[key] = val;
      },
      removeItem: (key: string) => {
        delete mockStore[key];
      },
      clear: () => {
        mockStore = {};
      },
    };
    Object.defineProperty(globalThis, "localStorage", {
      value: mockStorage,
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(globalThis, "localStorage", {
      value: originalLocalStorage,
      writable: true,
      configurable: true,
    });
  });

  it("prioritizes manual override (wbm_currency) even if user has a different profile country", () => {
    localStorage.setItem("wbm_currency", "AED");
    // Even if user is from India, manual selection of AED MUST win
    expect(detectUserCurrency("India")).toBe("AED");

    localStorage.setItem("wbm_currency", "USD");
    expect(detectUserCurrency("India")).toBe("USD");

    localStorage.setItem("wbm_currency", "INR");
    expect(detectUserCurrency("United Arab Emirates")).toBe("INR");
  });

  it("falls back to userCountry when no manual override exists", () => {
    expect(detectUserCurrency("India")).toBe("INR");
    expect(detectUserCurrency("IN")).toBe("INR");
    expect(detectUserCurrency("UAE")).toBe("AED");
    expect(detectUserCurrency("United Arab Emirates")).toBe("AED");
    expect(detectUserCurrency("Dubai")).toBe("AED");
    expect(detectUserCurrency("United States")).toBe("USD");
  });

  it("falls back to stored wbm_user country when no explicit userCountry is provided", () => {
    localStorage.setItem("wbm_user", JSON.stringify({ country: "India" }));
    expect(detectUserCurrency(null)).toBe("INR");

    localStorage.setItem("wbm_user", JSON.stringify({ country: "UAE" }));
    expect(detectUserCurrency(null)).toBe("AED");
  });
});

describe("currency.ts - formatPriceWithCurrency", () => {
  it("formats USD correctly without conversion", () => {
    const res = formatPriceWithCurrency(6000, "USD");
    expect(res.primaryFormatted).toBe("$6,000.00");
    expect(res.usdFormatted).toBe("$6,000.00");
    expect(res.isConverted).toBe(false);
  });

  it("converts USD to INR using live rate (94.60) when no custom INR price is set", () => {
    const res = formatPriceWithCurrency(6000, "INR");
    // 6000 * 94.60 = 567600
    expect(res.primaryFormatted).toBe("₹5,67,600");
    expect(res.usdFormatted).toBe("$6,000.00");
    expect(res.isConverted).toBe(true);
  });

  it("converts USD to AED using live rate (3.6725) when no custom AED price is set", () => {
    const res = formatPriceWithCurrency(6000, "AED");
    // 6000 * 3.6725 = 22035
    expect(res.primaryFormatted).toBe("AED 22,035");
    expect(res.usdFormatted).toBe("$6,000.00");
    expect(res.isConverted).toBe(true);
  });

  it("prioritizes explicit admin custom price (priceINR) when set", () => {
    const res = formatPriceWithCurrency(6000, "INR", {
      priceINR: 499999,
      priceAED: 21000,
    });
    expect(res.primaryFormatted).toBe("₹4,99,999");
    expect(res.usdFormatted).toBe("$6,000.00");
  });

  it("prioritizes explicit admin custom price (priceAED) when set", () => {
    const res = formatPriceWithCurrency(6000, "AED", {
      priceINR: 499999,
      priceAED: 21500,
    });
    expect(res.primaryFormatted).toBe("AED 21,500");
    expect(res.usdFormatted).toBe("$6,000.00");
  });
});

