"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowRight, KeyRound, MailCheck } from "lucide-react";
import AuthShell from "@/components/site/AuthShell";
import { FIELD } from "@/components/site/PasswordField";
import { requestPasswordResetUser } from "@/lib/api";
import {
  buildAuthHref,
  extractRedirectParam,
  extractLmsOriginParam,
  getStoredLmsOrigin,
  peekEnrollmentIntent,
  saveEnrollmentIntent,
  saveLmsOrigin,
} from "@/lib/auth-redirect";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [activeRedirect, setActiveRedirect] = useState<string | null>(null);
  const [activeLmsOrigin, setActiveLmsOrigin] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const redirectFromUrl = extractRedirectParam(params);
    const lmsOriginFromUrl = extractLmsOriginParam(params);
    const origin = lmsOriginFromUrl || getStoredLmsOrigin();

    if (origin) {
      saveLmsOrigin(origin);
      setActiveLmsOrigin(origin);
    }

    if (redirectFromUrl) {
      saveEnrollmentIntent({ returnUrl: redirectFromUrl, lmsOrigin: origin || undefined });
      setActiveRedirect(redirectFromUrl);
    } else {
      const stored = peekEnrollmentIntent();
      if (stored?.returnUrl) {
        setActiveRedirect(stored.returnUrl);
      }
    }
  }, []);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await requestPasswordResetUser(email, activeLmsOrigin || undefined);
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not request password reset.");
    } finally {
      setBusy(false);
    }
  };

  if (submitted) {
    return (
      <AuthShell
        headline="Password Recovery"
        subtitle="We'll help you securely recover access to your account."
      >
        <div className="py-4 text-center">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-gold/15 text-gold-deep">
            <MailCheck className="h-8 w-8" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
            Check Your Inbox
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-ink-soft">
            If an account with <strong className="font-semibold text-ink">{email}</strong> exists, a password reset link has been sent. The link expires in 1 hour.
          </p>
          <div className="mt-8 space-y-3">
            <Link
              href={buildAuthHref("/login", activeRedirect, undefined, activeLmsOrigin)}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-ink py-4 font-semibold text-cream transition-colors duration-200 hover:bg-gold hover:text-ink"
            >
              Back to Sign In
            </Link>
          </div>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      headline="Password Recovery"
      subtitle="Enter your email to receive a secure password reset link."
    >
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gold/15 text-gold-deep">
          <KeyRound className="h-7 w-7" />
        </div>
        <h1 className="text-3xl font-bold tracking-tight">Forgot Password</h1>
        <p className="mt-2 text-sm text-ink-soft">
          Enter the email associated with your account and we will send you a link to reset your password.
        </p>
      </div>

      <form onSubmit={onSubmit} className="mt-8 space-y-5">
        <div>
          <label htmlFor="email" className="mb-2 block text-sm font-medium">
            Email Address
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className={FIELD}
          />
        </div>

        {error && (
          <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="group flex w-full items-center justify-center gap-2 rounded-xl bg-ink py-4 font-semibold text-cream transition-colors duration-200 hover:bg-gold hover:text-ink disabled:opacity-60"
        >
          {busy ? "Sending Link…" : "Send Reset Link"}
          <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-ink-soft">
        Remember your password?{" "}
        <Link
          href={buildAuthHref("/login", activeRedirect, undefined, activeLmsOrigin)}
          className="font-semibold text-gold-deep hover:underline"
        >
          Sign In
        </Link>
      </p>
    </AuthShell>
  );
}
