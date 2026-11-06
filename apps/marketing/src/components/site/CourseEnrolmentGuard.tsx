"use client";

import { useEffect, useState } from "react";
import { portalUrl, useEnrolmentStatus } from "@/lib/auth";

interface CourseEnrolmentGuardProps {
  programId: string;
  slug?: string;
  title?: string;
}

/**
 * Client-side guard for course detail page.
 * Strictly verifies that the learner is already enrolled and their payment is confirmed (status: ACTIVE / COMPLETED).
 * If verified, automatically redirects to the LMS learning path:
 *   /programs/[programId]/steps?welcomeBack=1
 *
 * Security & UX Rules:
 * - If user is NOT enrolled or signed out: NO redirect.
 * - If payment is pending: NO redirect to curriculum steps.
 * - If ?stay=1 or ?noredirect=1 is present: respects user intent and suppresses auto-redirect.
 */
export default function CourseEnrolmentGuard({
  programId,
  slug,
  title,
}: CourseEnrolmentGuardProps) {
  const { isFullyActive, isEnrolled } = useEnrolmentStatus(programId, slug);
  const [redirecting, setRedirecting] = useState(false);

  useEffect(() => {
    // Only proceed if payment is verified & enrollment is fully active
    if (!isFullyActive) return;

    if (typeof window === "undefined") return;

    // Check if user requested to stay on marketing page (e.g. ?stay=1 or ?preview=1)
    const url = new URL(window.location.href);
    if (
      url.searchParams.get("stay") === "1" ||
      url.searchParams.get("noredirect") === "1" ||
      url.searchParams.get("preview") === "1"
    ) {
      return;
    }

    setRedirecting(true);

    const lmsStepsPath = `/programs/${programId}/steps?welcomeBack=1`;
    const destination = portalUrl(lmsStepsPath);

    // Brief timeout allows any pending state update to settle, then seamlessly redirects
    const timer = setTimeout(() => {
      window.location.assign(destination);
    }, 450);

    return () => clearTimeout(timer);
  }, [isFullyActive, programId]);

  if (!redirecting) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-4 top-20 z-50 mx-auto max-w-lg rounded-2xl border border-amber-300 bg-amber-50/95 p-4 shadow-xl backdrop-blur-md transition-all sm:top-24"
    >
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-500 text-white shadow-sm">
          <svg
            className="h-5 w-5 animate-spin"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8v8H4z"
            />
          </svg>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-amber-950">
            Welcome back! You are already enrolled.
          </p>
          <p className="truncate text-xs text-amber-800">
            Redirecting to {title || "your learning path"}...
          </p>
        </div>
        <a
          href={portalUrl(`/programs/${programId}/steps?welcomeBack=1`)}
          className="shrink-0 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-amber-700"
        >
          Go Now &rarr;
        </a>
      </div>
    </div>
  );
}
