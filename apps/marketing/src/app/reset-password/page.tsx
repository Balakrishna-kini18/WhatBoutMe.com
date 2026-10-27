"use client";

import { Suspense, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ArrowRight,
  Check,
  CheckCircle2,
  KeyRound,
  ShieldAlert,
  ShieldCheck,
  X,
} from "lucide-react";
import AuthShell from "@/components/site/AuthShell";
import PasswordField from "@/components/site/PasswordField";
import { confirmPasswordResetUser } from "@/lib/api";
import {
  buildAuthHref,
  extractRedirectParam,
  peekEnrollmentIntent,
} from "@/lib/auth-redirect";

function ResetPasswordContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const activeRedirect =
    extractRedirectParam(searchParams) ?? peekEnrollmentIntent()?.returnUrl ?? null;

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState(false);

  // Password validation rules
  const hasMinLength = password.length >= 8;
  const hasUpperAndLower = /[a-z]/.test(password) && /[A-Z]/.test(password);
  const hasNumberOrSymbol = /[\d!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password);
  const passwordsMatch = confirmPassword.length > 0 && password === confirmPassword;

  // Strength score: 0 to 3
  const strengthScore = useMemo(() => {
    let score = 0;
    if (hasMinLength) score++;
    if (hasUpperAndLower) score++;
    if (hasNumberOrSymbol) score++;
    return score;
  }, [hasMinLength, hasUpperAndLower, hasNumberOrSymbol]);

  const strengthLabel = useMemo(() => {
    if (!password) return "";
    if (strengthScore === 1) return "Weak";
    if (strengthScore === 2) return "Good";
    if (strengthScore === 3) return "Strong";
    return "Very Weak";
  }, [password, strengthScore]);

  const isTokenExpiredOrInvalid =
    error.toLowerCase().includes("invalid") ||
    error.toLowerCase().includes("expired");

  if (!token) {
    return (
      <div className="py-4 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-100 text-amber-600">
          <KeyRound className="h-7 w-7" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
          Missing Reset Link
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-ink-soft">
          No password reset token was provided in the URL. Please use the reset link sent to your email or request a new one.
        </p>
        <div className="mt-8 space-y-3">
          <Link
            href={buildAuthHref("/forgot-password", activeRedirect)}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-ink py-4 font-semibold text-cream transition-colors duration-200 hover:bg-gold hover:text-ink"
          >
            Request Reset Link
          </Link>
          <Link
            href={buildAuthHref("/login", activeRedirect)}
            className="block text-center text-sm font-semibold text-gold-deep hover:underline"
          >
            Back to Sign In
          </Link>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="py-4 text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-600">
          <CheckCircle2 className="h-8 w-8" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
          Password Reset Complete
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-ink-soft">
          Your password has been securely updated. All previous active sessions have been safely signed out. You can now sign in with your new password.
        </p>
        <div className="mt-8">
          <Link
            href={buildAuthHref("/login", activeRedirect)}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-ink py-4 font-semibold text-cream transition-colors duration-200 hover:bg-gold hover:text-ink"
          >
            Proceed to Sign In
          </Link>
        </div>
      </div>
    );
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");

    if (!hasMinLength) {
      setError("Password must be at least 8 characters long.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setBusy(true);
    try {
      await confirmPasswordResetUser(token, password);
      setSuccess(true);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Invalid or expired password reset link. Please request a new one.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gold/15 text-gold-deep">
          <KeyRound className="h-7 w-7" />
        </div>
        <h1 className="text-3xl font-bold tracking-tight">Set New Password</h1>
        <p className="mt-2 text-sm text-ink-soft">
          Choose a secure password for your WhatBoutMe account.
        </p>
      </div>

      <form onSubmit={onSubmit} className="mt-8 space-y-5">
        {/* New Password */}
        <div>
          <label htmlFor="password" className="mb-2 block text-sm font-medium">
            New Password
          </label>
          <PasswordField
            id="password"
            value={password}
            onChange={setPassword}
            autoComplete="new-password"
            minLength={8}
            placeholder="At least 8 characters"
            disabled={busy}
          />

          {/* Password Strength Meter */}
          {password && (
            <div className="mt-2 space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-ink-soft">Password strength:</span>
                <span
                  className={`font-semibold ${
                    strengthScore === 3
                      ? "text-emerald-600"
                      : strengthScore === 2
                        ? "text-amber-600"
                        : "text-red-500"
                  }`}
                >
                  {strengthLabel}
                </span>
              </div>
              <div className="flex h-1.5 w-full gap-1.5 overflow-hidden rounded-full bg-sand">
                <div
                  className={`h-full flex-1 rounded-full transition-all duration-300 ${
                    strengthScore >= 1
                      ? strengthScore === 3
                        ? "bg-emerald-500"
                        : strengthScore === 2
                          ? "bg-amber-500"
                          : "bg-red-500"
                      : "bg-transparent"
                  }`}
                />
                <div
                  className={`h-full flex-1 rounded-full transition-all duration-300 ${
                    strengthScore >= 2
                      ? strengthScore === 3
                        ? "bg-emerald-500"
                        : "bg-amber-500"
                      : "bg-transparent"
                  }`}
                />
                <div
                  className={`h-full flex-1 rounded-full transition-all duration-300 ${
                    strengthScore >= 3 ? "bg-emerald-500" : "bg-transparent"
                  }`}
                />
              </div>
            </div>
          )}
        </div>

        {/* Confirm Password */}
        <div>
          <label
            htmlFor="confirmPassword"
            className="mb-2 block text-sm font-medium"
          >
            Confirm New Password
          </label>
          <PasswordField
            id="confirmPassword"
            value={confirmPassword}
            onChange={setConfirmPassword}
            autoComplete="new-password"
            minLength={8}
            placeholder="Re-enter your new password"
            disabled={busy}
          />

          {/* Passwords match indicator */}
          {confirmPassword && (
            <div className="mt-2 flex items-center gap-1.5 text-xs">
              {passwordsMatch ? (
                <>
                  <Check className="h-3.5 w-3.5 text-emerald-600" />
                  <span className="font-medium text-emerald-600">
                    Passwords match
                  </span>
                </>
              ) : (
                <>
                  <X className="h-3.5 w-3.5 text-red-500" />
                  <span className="font-medium text-red-500">
                    Passwords do not match
                  </span>
                </>
              )}
            </div>
          )}
        </div>

        {/* Password Requirements Checklist */}
        <div className="rounded-xl border border-sand bg-sand/40 p-3.5 text-xs text-ink-soft space-y-1.5">
          <p className="font-semibold text-ink">Password must contain:</p>
          <div className="flex items-center gap-2">
            {hasMinLength ? (
              <Check className="h-3.5 w-3.5 text-emerald-600" />
            ) : (
              <span className="h-1.5 w-1.5 rounded-full bg-ink-soft/40 ml-1 mr-1" />
            )}
            <span className={hasMinLength ? "text-ink font-medium" : ""}>
              At least 8 characters
            </span>
          </div>
          <div className="flex items-center gap-2">
            {hasUpperAndLower ? (
              <Check className="h-3.5 w-3.5 text-emerald-600" />
            ) : (
              <span className="h-1.5 w-1.5 rounded-full bg-ink-soft/40 ml-1 mr-1" />
            )}
            <span className={hasUpperAndLower ? "text-ink font-medium" : ""}>
              Uppercase and lowercase letters
            </span>
          </div>
          <div className="flex items-center gap-2">
            {hasNumberOrSymbol ? (
              <Check className="h-3.5 w-3.5 text-emerald-600" />
            ) : (
              <span className="h-1.5 w-1.5 rounded-full bg-ink-soft/40 ml-1 mr-1" />
            )}
            <span className={hasNumberOrSymbol ? "text-ink font-medium" : ""}>
              At least one number or special symbol
            </span>
          </div>
        </div>

        {error && (
          <div
            role="alert"
            className="rounded-xl bg-red-50 p-4 text-sm text-red-700 space-y-2 border border-red-100"
          >
            <div className="flex items-start gap-2">
              <ShieldAlert className="h-4 w-4 shrink-0 text-red-600 mt-0.5" />
              <span>{error}</span>
            </div>
            {isTokenExpiredOrInvalid && (
              <div className="pt-2">
                <Link
                  href="/forgot-password"
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-800 underline hover:text-red-950"
                >
                  Request a new password reset link <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
            )}
          </div>
        )}

        <button
          type="submit"
          disabled={busy || !hasMinLength || !passwordsMatch}
          className="group flex w-full items-center justify-center gap-2 rounded-xl bg-ink py-4 font-semibold text-cream transition-colors duration-200 hover:bg-gold hover:text-ink disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {busy ? "Updating Password…" : "Update Password"}
          <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
        </button>
      </form>

      <div className="mt-6 flex items-center justify-center gap-2 text-center text-xs text-ink-soft">
        <ShieldCheck className="h-4 w-4 text-gold-deep" />
        <span>Protected with end-to-end cryptographic hashing</span>
      </div>

      <p className="mt-4 text-center text-sm text-ink-soft">
        <Link
          href="/login"
          className="font-semibold text-gold-deep hover:underline"
        >
          Back to Sign In
        </Link>
      </p>
    </>
  );
}

export default function ResetPasswordPage() {
  return (
    <AuthShell
      headline="Password Recovery"
      subtitle="Create a new secure password for your account."
    >
      <Suspense
        fallback={
          <div className="py-4 text-center">
            <h1 className="text-2xl font-bold tracking-tight">Loading…</h1>
          </div>
        }
      >
        <ResetPasswordContent />
      </Suspense>
    </AuthShell>
  );
}

