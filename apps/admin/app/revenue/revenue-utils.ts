/**
 * Formats large financial revenue numbers with adaptive scaling and compact notation
 * to guarantee 100% responsiveness on mobile, tablet, and desktop viewports.
 */
export function formatRevenueMetric(amount: number): {
  displayValue: string;
  fullValue: string;
  isCompact: boolean;
  fontSize: string;
} {
  const rounded = Math.round(amount);
  const fullValue = `$${rounded.toLocaleString("en-US")}`;

  // If number exceeds 12 digits (100 Billion+), format with clean compact notation ($123.46B, $12.5T)
  // to ensure absolute responsive safety on small screens, while providing exact full figure in tooltip.
  if (Math.abs(amount) >= 100_000_000_000) {
    const compact = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      notation: "compact",
      maximumFractionDigits: 2,
    }).format(amount);

    return {
      displayValue: compact,
      fullValue,
      isCompact: true,
      fontSize: "1.15rem",
    };
  }

  // Adaptive font scaling based on character length
  let fontSize = "1.15rem";
  if (fullValue.length >= 14) {
    fontSize = "0.92rem";
  } else if (fullValue.length >= 10) {
    fontSize = "1.05rem";
  }

  return {
    displayValue: fullValue,
    fullValue,
    isCompact: false,
    fontSize,
  };
}

export interface CurrencyParts {
  symbol: string;
  value: string;
  isRtlSymbol: boolean;
}

/**
 * Returns structured currency symbol and numeric value parts.
 * Enables explicit BiDi layout control in HTML so Arabic symbols (د.إ)
 * are guaranteed to render before the digits in Left-To-Right text.
 */
export function getCurrencyParts(
  amount: number | string | undefined | null,
  currency: string = "USD"
): CurrencyParts {
  const curr = (currency || "USD").toUpperCase();

  let num = 0;
  if (typeof amount === "number") {
    num = amount;
  } else if (typeof amount === "string") {
    const cleanStr = amount.replace(/[^0-9.-]/g, "");
    num = parseFloat(cleanStr);
  }

  const formattedNum = isNaN(num) ? "0" : Math.round(num).toLocaleString("en-US");

  if (curr === "INR") {
    return { symbol: "₹", value: formattedNum, isRtlSymbol: false };
  }
  if (curr === "AED") {
    return { symbol: "د.إ", value: formattedNum, isRtlSymbol: true };
  }
  return { symbol: "$", value: formattedNum, isRtlSymbol: false };
}

/**
 * Formats multi-currency transaction amounts with official symbols:
 * - USD: $2,000
 * - INR: ₹166,000
 * - AED: د.إ 3,670 (UAE Dirham symbol before the amount)
 */
export function formatCurrencyAmount(
  amount: number | string | undefined | null,
  currency: string = "USD"
): string {
  const { symbol, value, isRtlSymbol } = getCurrencyParts(amount, currency);
  if (isRtlSymbol) {
    return `${symbol} ${value}`;
  }
  return `${symbol}${value}`;
}
