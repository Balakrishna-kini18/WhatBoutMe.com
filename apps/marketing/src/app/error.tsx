"use client";

import React, { useEffect } from "react";
import Link from "next/link";
import { AlertCircle, RotateCcw, Home } from "lucide-react";

export default function GlobalErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Unhandled application error:", error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-cream px-5 py-16 text-center text-ink selection:bg-gold/30">
      <div className="relative mx-auto w-full max-w-md rounded-3xl border border-sand bg-white/90 p-8 shadow-xl backdrop-blur-md sm:p-10">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-600">
          <AlertCircle className="h-8 w-8" />
        </div>

        <span className="text-xs font-semibold uppercase tracking-widest text-gold-deep">
          Temporary Glitch
        </span>

        <h1 className="mt-2 text-2xl font-bold tracking-tight text-ink sm:text-3xl">
          Something went wrong
        </h1>

        <p className="mt-3 text-sm leading-relaxed text-ink-soft">
          We encountered an unexpected issue while loading this page. Our team has been notified.
        </p>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-center">
          <button
            type="button"
            onClick={() => reset()}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-ink px-6 py-3 text-xs font-semibold uppercase tracking-wider text-cream shadow-sm transition hover:bg-gold-deep hover:text-white"
          >
            <RotateCcw className="h-4 w-4" />
            <span>Try Again</span>
          </button>

          <Link
            href="/"
            className="inline-flex items-center justify-center gap-2 rounded-full border border-sand bg-cream-deep/60 px-6 py-3 text-xs font-semibold uppercase tracking-wider text-ink transition hover:bg-cream-deep hover:text-gold-deep"
          >
            <Home className="h-4 w-4" />
            <span>Go Home</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
