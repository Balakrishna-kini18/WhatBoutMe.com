"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowRight, MailCheck } from "lucide-react";
import AuthShell from "@/components/site/AuthShell";
import PasswordField from "@/components/site/PasswordField";
import SearchableSelect from "@/components/site/SearchableSelect";
import { COUNTRIES, getTimezones, canonicalizeTimezone } from "@/lib/geo-data";
import { signUp } from "@/lib/auth";

export default function SignupPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [mobile, setMobile] = useState("");
  const [country, setCountry] = useState("United Arab Emirates");
  const [timezone, setTimezone] = useState("Asia/Dubai");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [submittedEmail, setSubmittedEmail] = useState("");

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

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");

    if (!name.trim()) {
      setError("Full Name is required.");
      return;
    }
    if (!email.trim()) {
      setError("Email Address is required.");
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
      await signUp({
        name: name.trim(),
        email: email.trim(),
        ...(mobile.trim() ? { phone: mobile.trim() } : {}),
        country: country.trim() || undefined,
        timezone: timezone.trim() || undefined,
        password,
      });
      setSubmittedEmail(email.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the account.");
      setBusy(false);
    }
  };

  if (submittedEmail) {
    return (
      <AuthShell
        headline="Verify Your Email"
        subtitle="We've sent an activation link to your inbox."
      >
        <div className="py-4 text-center">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-gold/15 text-gold-deep">
            <MailCheck className="h-8 w-8" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
            Check Your Inbox
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-ink-soft">
            We&apos;ve sent a verification link to{" "}
            <strong className="font-semibold text-ink">{submittedEmail}</strong>.
            Please click the link in your email to verify your account before logging in.
          </p>
          <div className="mt-8 space-y-3">
            <Link
              href="/login"
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-ink py-4 font-semibold text-cream transition-colors duration-200 hover:bg-gold hover:text-ink"
            >
              Proceed to Sign In
            </Link>
          </div>
        </div>
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

      <form onSubmit={onSubmit} className="mt-4 space-y-3">
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
              title="Enter your mobile number with country code, for example +971 56 546 4014"
              value={mobile}
              onChange={(e) => setMobile(e.target.value)}
              placeholder="+971 50 000 0000"
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
          {busy ? "Creating Account…" : "Create Account"}
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
