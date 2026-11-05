"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useUser } from "@/lib/auth";
import {
  detectUserCurrency,
  formatPriceWithCurrency,
  setUserCurrencyPreference,
  CURRENCY_CONFIGS,
  type SupportedDisplayCurrency,
} from "@/lib/currency";
import { Globe, ChevronDown } from "lucide-react";

interface LocalizedCoursePriceProps {
  amountUSD: number;
  variant?: "card" | "inline";
  showDisclaimer?: boolean;
}

const subscribeCurrency = (callback: () => void) => {
  window.addEventListener("wbm-currency-change", callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener("wbm-currency-change", callback);
    window.removeEventListener("storage", callback);
  };
};

export default function LocalizedCoursePrice({
  amountUSD,
  variant = "card",
  showDisclaimer = true,
}: LocalizedCoursePriceProps) {
  const user = useUser();
  const [mounted, setMounted] = useState(false);
  const [isOpenMenu, setIsOpenMenu] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const currentCurrency = useSyncExternalStore(
    subscribeCurrency,
    () => detectUserCurrency(user?.country),
    () => "USD" as SupportedDisplayCurrency
  );

  const priceData = formatPriceWithCurrency(
    amountUSD,
    mounted ? currentCurrency : "USD"
  );

  const handleCurrencySelect = (code: SupportedDisplayCurrency) => {
    setUserCurrencyPreference(code);
    setIsOpenMenu(false);
  };

  if (variant === "inline") {
    return (
      <span className="inline-flex items-center gap-1.5 font-medium">
        <span>{priceData.primaryFormatted}</span>
        {priceData.isConverted && (
          <span className="text-xs text-ink-soft font-normal">
            ({priceData.usdFormatted})
          </span>
        )}
      </span>
    );
  }

  return (
    <div className="relative">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-2xl font-bold tracking-tight text-ink md:text-3xl">
          {priceData.primaryFormatted}
        </span>

        {/* Currency Switcher Pill */}
        <div className="relative inline-block text-left">
          <button
            type="button"
            onClick={() => setIsOpenMenu((prev) => !prev)}
            className="inline-flex items-center gap-1 rounded-full border border-line bg-cream/70 px-2.5 py-1 text-xs font-semibold text-ink-soft transition-colors hover:border-gold hover:text-ink"
            title="Change display currency"
          >
            <span>{CURRENCY_CONFIGS[currentCurrency].flag}</span>
            <span>{currentCurrency}</span>
            <ChevronDown className="h-3 w-3 opacity-60" />
          </button>

          {isOpenMenu && (
            <div className="absolute right-0 top-full z-50 mt-1.5 w-36 rounded-xl border border-line bg-white p-1 shadow-lg ring-1 ring-black/5">
              {(["INR", "AED", "USD"] as SupportedDisplayCurrency[]).map((code) => {
                const conf = CURRENCY_CONFIGS[code];
                const isActive = code === currentCurrency;
                return (
                  <button
                    key={code}
                    type="button"
                    onClick={() => handleCurrencySelect(code)}
                    className={`flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-xs text-left transition ${
                      isActive
                        ? "bg-gold/15 font-bold text-ink"
                        : "text-ink-soft hover:bg-cream-deep hover:text-ink"
                    }`}
                  >
                    <span className="flex items-center gap-1.5">
                      <span>{conf.flag}</span>
                      <span>{code}</span>
                    </span>
                    <span className="text-[11px] opacity-70">{conf.symbol}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {priceData.isConverted ? (
        <div className="mt-1 flex flex-col gap-0.5">
          <span className="text-xs text-ink-soft">
            Base price: <strong className="font-semibold text-ink">{priceData.usdFormatted} USD</strong>
          </span>
          {showDisclaimer && (
            <span className="text-[11px] text-[#A6631E] leading-tight">
              {currentCurrency === "INR"
                ? "⚡ Auto-converts to INR at live Stripe rate (UPI & Cards supported)."
                : "⚡ Converted at live foreign exchange rate via Stripe at checkout."}
            </span>
          )}
        </div>
      ) : (
        <span className="mt-0.5 block text-xs text-ink-soft">
          Global base price in US Dollars (USD)
        </span>
      )}
    </div>
  );
}
