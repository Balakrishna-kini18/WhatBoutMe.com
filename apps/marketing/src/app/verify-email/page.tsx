"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, XCircle, Loader2, Mail } from "lucide-react";
import AuthShell from "@/components/site/AuthShell";
import { verifyEmailUser } from "@/lib/api";
import {
  buildAuthHref,
  extractRedirectParam,
  peekEnrollmentIntent,
  saveEnrollmentIntent,
} from "@/lib/auth-redirect";

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const redirectFromUrl = extractRedirectParam(searchParams);

  const [loading, setLoading] = useState(true);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");
  const [activeRedirect, setActiveRedirect] = useState<string | null>(redirectFromUrl);

  useEffect(() => {
    if (redirectFromUrl) {
      saveEnrollmentIntent({ returnUrl: redirectFromUrl });
      setActiveRedirect(redirectFromUrl);
    } else {
      const stored = peekEnrollmentIntent();
      if (stored?.returnUrl) {
        setActiveRedirect(stored.returnUrl);
      }
    }
  }, [redirectFromUrl]);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      setError("No verification token was provided in the link.");
      return;
    }

    let isMounted = true;
    verifyEmailUser(token)
      .then(() => {
        if (isMounted) {
          setSuccess(true);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          setError(err instanceof Error ? err.message : "Invalid or expired verification token.");
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [token]);

  return (
    <div className="py-4 text-center">
      {loading ? (
        <>
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-gold/15 text-gold-deep animate-spin">
            <Loader2 className="h-8 w-8" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
            Verifying Your Email…
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-ink-soft">
            Please wait while we verify your account credentials.
          </p>
        </>
      ) : success ? (
        <>
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-600">
            <CheckCircle2 className="h-8 w-8" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
            Email Verified!
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-ink-soft">
            Your email address has been verified successfully. You can now sign in to access your courses and learning dashboard.
          </p>
          <div className="mt-8">
            <Link
              href={buildAuthHref("/login", activeRedirect)}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-ink py-4 font-semibold text-cream transition-colors duration-200 hover:bg-gold hover:text-ink"
            >
              Proceed to Sign In
            </Link>
          </div>
        </>
      ) : (
        <>
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-red-100 text-red-600">
            <XCircle className="h-8 w-8" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
            Verification Failed
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-ink-soft">
            {error || "This verification link is invalid or has expired."}
          </p>
          <div className="mt-8 space-y-3">
            <Link
              href={buildAuthHref("/login", activeRedirect)}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-ink py-4 font-semibold text-cream transition-colors duration-200 hover:bg-gold hover:text-ink"
            >
              Back to Sign In
            </Link>
          </div>
        </>
      )}
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <AuthShell
      headline="Account Verification"
      subtitle="Confirm your email to unlock your learning journey."
    >
      <Suspense
        fallback={
          <div className="py-4 text-center">
            <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-gold/15 text-gold-deep">
              <Mail className="h-8 w-8" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
              Loading…
            </h1>
          </div>
        }
      >
        <VerifyEmailContent />
      </Suspense>
    </AuthShell>
  );
}
