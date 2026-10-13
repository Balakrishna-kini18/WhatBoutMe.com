"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowRight, ArrowLeft, ShieldCheck, CheckCircle2, RefreshCw, Edit3 } from "lucide-react";
import AuthShell from "@/components/site/AuthShell";
import PasswordField from "@/components/site/PasswordField";
import SearchableSelect from "@/components/site/SearchableSelect";
import { COUNTRIES, getTimezones, canonicalizeTimezone } from "@/lib/geo-data";
import { signUp, sendSignupOtp, portalUrl, continueToPortal } from "@/lib/auth";

export default function SignupPage() {
  const [step, setStep] = useState<"details" | "otp" | "success">("details");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [mobile, setMobile] = useState("");
  const [country, setCountry] = useState("India");
  const [timezone, setTimezone] = useState("Asia/Kolkata");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [resendCountdown, setResendCountdown] = useState(0);
  const [resendMessage, setResendMessage] = useState("");

  const timezones = useMemo(() => getTimezones(), []);

  useEffect(() => {
    try {
      const userTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (userTz) {
        setTimezone(canonicalizeTimezone(userTz));
      }
    } catch {
      // Fall back to default
    }
  }, []);

  // Countdown timer for OTP resend
  useEffect(() => {
    if (resendCountdown <= 0) return;
    const timer = setInterval(() => {
      setResendCountdown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCountdown]);

  const onDetailsSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setResendMessage("");

    if (!name.trim()) {
      setError("Full Name is required.");
      return;
    }
    if (!email.trim() || !email.includes("@")) {
      setError("A valid Email Address is required.");
      return;
    }
    if (!country.trim()) {
      setError("Country is required.");
      return;
    }
    if (!timezone.trim()) {
      setError("Timezone is required.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters long.");
      return;
    }

    setBusy(true);
    try {
      await sendSignupOtp({
        name: name.trim(),
        email: email.trim(),
        phone: mobile.trim() || undefined,
      });
      setStep("otp");
      setResendCountdown(30);
      setOtp("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send verification code.");
    } finally {
      setBusy(false);
    }
  };

  const onResendOtp = async () => {
    if (resendCountdown > 0 || busy) return;
    setError("");
    setResendMessage("");
    setBusy(true);
    try {
      await sendSignupOtp({
        name: name.trim(),
        email: email.trim(),
        phone: mobile.trim() || undefined,
      });
      setResendCountdown(30);
      setResendMessage("A new verification code has been sent to your email.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not resend verification code.");
    } finally {
      setBusy(false);
    }
  };

  const onOtpSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setResendMessage("");

    const cleanOtp = otp.trim();
    if (cleanOtp.length !== 6) {
      setError("Please enter the complete 6-digit code.");
      return;
    }

    setBusy(true);
    try {
      await signUp({
        name: name.trim(),
        email: email.trim(),
        phone: mobile.trim() || undefined,
        country: country.trim() || undefined,
        timezone: timezone.trim() || undefined,
        password,
        otp: cleanOtp,
      });

      // Try automatic portal continuation if portal parameter was supplied in URL
      if (!continueToPortal()) {
        setStep("success");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not complete account creation.");
    } finally {
      setBusy(false);
    }
  };

  if (step === "success") {
    return (
      <AuthShell
        headline="Account Created"
        subtitle="Your email has been verified and your account is ready."
      >
        <div className="py-4 text-center">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-600">
            <CheckCircle2 className="h-8 w-8" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
            Welcome, {name.trim().split(" ")[0]}!
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-ink-soft">
            Your account (<strong className="font-semibold text-ink">{email.trim()}</strong>) is verified and active.
          </p>
          <div className="mt-8 space-y-3">
            <a
              href={portalUrl()}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-ink py-4 font-semibold text-cream transition-colors duration-200 hover:bg-gold hover:text-ink"
            >
              Continue to Learning Portal
              <ArrowRight className="h-4 w-4" />
            </a>
            <Link
              href="/courses"
              className="block w-full py-2.5 text-center text-xs font-semibold text-ink-soft hover:text-ink"
            >
              Browse Courses
            </Link>
          </div>
        </div>
      </AuthShell>
    );
  }

  if (step === "otp") {
    return (
      <AuthShell
        headline="Verify Your Email"
        subtitle="Enter the 6-digit verification code sent to your email."
        maxWidth="max-w-md"
      >
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gold/15 text-gold-deep">
            <ShieldCheck className="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
            Enter Verification Code
          </h1>
          <p className="mt-2 text-xs leading-relaxed text-ink-soft">
            We sent a 6-digit security code to your email address:
          </p>
          <div className="mt-3 flex items-center justify-center gap-2">
            <span className="rounded-lg bg-sand px-3 py-1 font-mono text-xs font-semibold text-ink">
              {email}
            </span>
            <button
              type="button"
              onClick={() => {
                setStep("details");
                setError("");
                setResendMessage("");
              }}
              className="flex items-center gap-1 text-xs font-medium text-gold-deep hover:underline"
            >
              <Edit3 className="h-3 w-3" /> Edit
            </button>
          </div>
        </div>

        <form onSubmit={onOtpSubmit} className="mt-6 space-y-4">
          <div>
            <label htmlFor="otp" className="mb-1 block text-center text-xs font-medium text-ink">
              6-Digit Code
            </label>
            <input
              id="otp"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              autoComplete="one-time-code"
              autoFocus
              required
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="••••••"
              className="h-14 w-full rounded-xl border border-sand bg-sand px-4 text-center font-mono text-2xl font-bold tracking-[0.4em] text-ink outline-none transition-colors placeholder:font-sans placeholder:tracking-widest placeholder:text-ink-soft/40 focus:border-gold-deep focus:bg-white"
            />
          </div>

          {resendMessage && (
            <p className="rounded-xl bg-emerald-50 px-3.5 py-2 text-center text-xs font-medium text-emerald-800">
              {resendMessage}
            </p>
          )}

          {error && (
            <p role="alert" className="rounded-xl bg-red-50 px-3.5 py-2 text-center text-xs text-red-700">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy || otp.trim().length !== 6}
            className="group flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-ink py-2.5 font-semibold text-cream transition-colors duration-200 hover:bg-gold hover:text-ink disabled:opacity-60"
          >
            {busy ? "Verifying & Creating Account…" : "Verify & Create Account"}
            <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
          </button>

          <div className="flex items-center justify-between pt-2 text-xs">
            <button
              type="button"
              onClick={() => {
                setStep("details");
                setError("");
                setResendMessage("");
              }}
              className="flex items-center gap-1 text-ink-soft hover:text-ink"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Back
            </button>

            {resendCountdown > 0 ? (
              <span className="text-ink-soft">
                Resend code in <strong className="font-semibold text-ink">{resendCountdown}s</strong>
              </span>
            ) : (
              <button
                type="button"
                onClick={onResendOtp}
                disabled={busy}
                className="flex items-center gap-1 font-semibold text-gold-deep hover:underline disabled:opacity-50"
              >
                <RefreshCw className="h-3 w-3" /> Resend Code
              </button>
            )}
          </div>
        </form>
      </AuthShell>
    );
  }

  const INPUT_FIELD =
    "h-11 w-full rounded-xl border border-transparent bg-sand px-3.5 py-2.5 text-sm text-ink outline-none transition-colors placeholder:text-ink-soft/60 focus:border-gold-deep focus:bg-white";

  return (
    <AuthShell
      headline="Start Your Journey"
      subtitle="Create your account, choose a course and start learning."
      maxWidth="max-w-md lg:max-w-lg"
    >
      <div className="text-center">
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
          Join Us
        </h1>
        <p className="mt-1 text-xs text-ink-soft">
          Create your account to start learning
        </p>
      </div>

      <form onSubmit={onDetailsSubmit} className="mt-4 space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {/* Full Name */}
          <div>
            <label htmlFor="name" className="mb-1 block text-xs font-medium text-ink">
              Full Name
            </label>
            <input
              id="name"
              autoComplete="name"
              required
              maxLength={120}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Roweena S."
              className={INPUT_FIELD}
            />
          </div>

          {/* Email Address */}
          <div>
            <label htmlFor="email" className="mb-1 block text-xs font-medium text-ink">
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
              className={INPUT_FIELD}
            />
          </div>

          {/* Phone Number */}
          <div>
            <label htmlFor="mobile" className="mb-1 block text-xs font-medium text-ink">
              Phone <span className="text-ink-soft">(optional)</span>
            </label>
            <input
              id="mobile"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              pattern="[+0-9][0-9 ()\-]{6,}"
              title="Enter your mobile number with country code, for example +91 9876543210"
              value={mobile}
              onChange={(e) => setMobile(e.target.value)}
              placeholder="+91 9876543210"
              className={INPUT_FIELD}
            />
          </div>

          {/* Country */}
          <div>
            <label htmlFor="country" className="mb-1 block text-xs font-medium text-ink">
              Country
            </label>
            <SearchableSelect
              id="country"
              value={country}
              onChange={setCountry}
              options={COUNTRIES}
              placeholder="Select Country"
              searchPlaceholder="Search country..."
              required
            />
          </div>

          {/* Timezone */}
          <div>
            <label htmlFor="timezone" className="mb-1 block text-xs font-medium text-ink">
              Timezone
            </label>
            <SearchableSelect
              id="timezone"
              value={timezone}
              onChange={setTimezone}
              options={timezones}
              placeholder="Select Timezone"
              searchPlaceholder="Search city or timezone..."
              required
            />
          </div>

          {/* Password */}
          <div>
            <label htmlFor="password" className="mb-1 block text-xs font-medium text-ink">
              Password
            </label>
            <PasswordField
              value={password}
              onChange={setPassword}
              autoComplete="new-password"
              minLength={8}
              className="h-11 py-2.5 text-sm"
            />
          </div>
        </div>

        {error && (
          <p role="alert" className="rounded-xl bg-red-50 px-3.5 py-2 text-xs text-red-700">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="group flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-ink py-2.5 font-semibold text-cream transition-colors duration-200 hover:bg-gold hover:text-ink disabled:opacity-60"
        >
          {busy ? "Sending Verification Code…" : "Continue & Send Code"}
          <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
        </button>
      </form>

      <p className="mt-3 text-center text-xs text-ink-soft">
        Already have an account?{" "}
        <Link href="/login" className="font-semibold text-gold-deep hover:underline">
          Log in
        </Link>
      </p>
    </AuthShell>
  );
}
