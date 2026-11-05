import { findCountryByTimezone } from "./geo-data";

export type SupportedDisplayCurrency = "INR" | "AED" | "USD";

export interface CurrencyConfig {
  code: SupportedDisplayCurrency;
  symbol: string;
  name: string;
  fxRateToUSD: number;
  flag: string;
}

export const CURRENCY_CONFIGS: Record<SupportedDisplayCurrency, CurrencyConfig> = {
  INR: {
    code: "INR",
    symbol: "₹",
    name: "Indian Rupee",
    fxRateToUSD: 86.50,
    flag: "🇮🇳",
  },
  AED: {
    code: "AED",
    symbol: "AED ",
    name: "UAE Dirham",
    fxRateToUSD: 3.6725,
    flag: "🇦🇪",
  },
  USD: {
    code: "USD",
    symbol: "$",
    name: "US Dollar",
    fxRateToUSD: 1.0,
    flag: "🇺🇸",
  },
};

export interface PriceOverrides {
  priceAED?: number | null;
  priceINR?: number | null;
  priceUSD?: number | null;
}

/**
 * Automatically detects the user's country and preferred currency:
 * 1. User manual override in localStorage ("wbm_currency") - HIGHEST PRIORITY
 * 2. Signed-in user's profile country (stored in database / localStorage at signup)
 * 3. Browser system timezone (e.g. Asia/Kolkata or Asia/Calcutta -> India / INR, Asia/Dubai -> UAE / AED)
 * 4. Default: USD
 */
export function detectUserCurrency(userCountry?: string | null): SupportedDisplayCurrency {
  const hasStorage = typeof localStorage !== "undefined";

  // 1. User manual override in localStorage ("wbm_currency") - HIGHEST PRIORITY
  if (hasStorage) {
    try {
      const saved = localStorage.getItem("wbm_currency");
      if (saved && (saved === "INR" || saved === "AED" || saved === "USD")) {
        return saved as SupportedDisplayCurrency;
      }
    } catch {}
  }

  // 2. If explicit userCountry is provided (e.g. from user session or profile at signup)
  if (userCountry) {
    const normalized = userCountry.trim().toLowerCase();
    if (normalized === "india" || normalized === "in") return "INR";
    if (
      normalized === "united arab emirates" ||
      normalized === "uae" ||
      normalized === "ae" ||
      normalized === "dubai"
    ) {
      return "AED";
    }
    if (normalized === "united states" || normalized === "us" || normalized === "usa") {
      return "USD";
    }
  }

  // 3. Check signed-in user's country from localStorage
  const effectiveCountry = getStoredUserCountry();
  if (effectiveCountry) {
    const normalized = effectiveCountry.trim().toLowerCase();
    if (normalized === "india" || normalized === "in") return "INR";
    if (
      normalized === "united arab emirates" ||
      normalized === "uae" ||
      normalized === "ae" ||
      normalized === "dubai"
    ) {
      return "AED";
    }
    if (normalized === "united states" || normalized === "us" || normalized === "usa") {
      return "USD";
    }
  }

  // 4. Auto-detect from visitor's browser timezone
  try {
    const systemTz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
    const detectedCountry = findCountryByTimezone(systemTz);
    if (
      detectedCountry === "India" ||
      systemTz.startsWith("Asia/Kolkata") ||
      systemTz === "Asia/Calcutta"
    ) {
      return "INR";
    }
    if (detectedCountry === "United Arab Emirates" || systemTz === "Asia/Dubai") {
      return "AED";
    }
  } catch {}

  return "USD";
}

export function setUserCurrencyPreference(currency: SupportedDisplayCurrency) {
  if (typeof localStorage !== "undefined") {
    try {
      localStorage.setItem("wbm_currency", currency);
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("wbm-currency-change", { detail: currency }));
      }
    } catch {}
  }
}

export function getStoredUserCountry(): string | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const userRaw = localStorage.getItem("wbm_user");
    if (userRaw) {
      const parsed = JSON.parse(userRaw);
      return parsed.country || null;
    }
  } catch {}
  return null;
}

/**
 * Formats a base USD price into the target currency.
 * If specific custom currency prices (priceAED or priceINR) were set by Admin,
 * they take priority over exchange-rate conversions.
 */
export function formatPriceWithCurrency(
  amountInUSD: number,
  currency: SupportedDisplayCurrency,
  overrides?: PriceOverrides
): {
  primaryFormatted: string;
  usdFormatted: string;
  currency: SupportedDisplayCurrency;
  symbol: string;
  isConverted: boolean;
} {
  const effectiveUSD =
    typeof overrides?.priceUSD === "number" && !isNaN(overrides.priceUSD) && overrides.priceUSD > 0
      ? overrides.priceUSD
      : amountInUSD;

  const usdFormatted = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(effectiveUSD);

  if (currency === "USD") {
    return {
      primaryFormatted: usdFormatted,
      usdFormatted,
      currency: "USD",
      symbol: "$",
      isConverted: false,
    };
  }

  const config = CURRENCY_CONFIGS[currency];

  // If the admin explicitly provided a custom price for INR or AED, prioritize it
  let convertedAmount: number;
  if (
    currency === "INR" &&
    typeof overrides?.priceINR === "number" &&
    !isNaN(overrides.priceINR) &&
    overrides.priceINR > 0
  ) {
    convertedAmount = Math.round(overrides.priceINR);
  } else if (
    currency === "AED" &&
    typeof overrides?.priceAED === "number" &&
    !isNaN(overrides.priceAED) &&
    overrides.priceAED > 0
  ) {
    convertedAmount = Math.round(overrides.priceAED);
  } else {
    convertedAmount = Math.round(effectiveUSD * config.fxRateToUSD);
  }

  let primaryFormatted: string;
  if (currency === "INR") {
    primaryFormatted = `₹${convertedAmount.toLocaleString("en-IN")}`;
  } else {
    primaryFormatted = `AED ${convertedAmount.toLocaleString("en-AE")}`;
  }

  return {
    primaryFormatted,
    usdFormatted,
    currency,
    symbol: config.symbol,
    isConverted: true,
  };
}
