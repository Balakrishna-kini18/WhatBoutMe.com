"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import AuthShell from "@/components/site/AuthShell";
import PasswordField, { FIELD } from "@/components/site/PasswordField";
import { continueToPortal, signUp } from "@/lib/auth";

export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [mobile, setMobile] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await signUp({
        name: name.trim(),
        email: email.trim(),
        ...(mobile.trim() ? { phone: mobile.trim() } : {}),
        password,
      });
      // sent here from a portal checkout: carry on to it. Otherwise a new
      // learner has no course yet, so send them to choose one
      if (!continueToPortal()) router.push("/courses");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the account.");
      setBusy(false);
    }
  };

  return (
    <AuthShell
      headline="Start Your Journey"
      subtitle="Create your account, choose a course and start learning."
    >
      <h1 className="text-center text-3xl font-bold tracking-tight md:text-4xl">
        Join Us
      </h1>

      <form onSubmit={onSubmit} className="mt-8 space-y-5">
        <div>
          <label htmlFor="mobile" className="mb-2 block text-sm font-medium">
            Phone Number <span className="text-ink-soft">(optional)</span>
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
            placeholder="+971 00 000 0000"
            className={FIELD}
          />
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label htmlFor="name" className="mb-2 block text-sm font-medium">
              Full Name
            </label>
            <input
              id="name"
              autoComplete="name"
              required
              maxLength={120}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={FIELD}
            />
          </div>
          <div>
            <label htmlFor="email" className="mb-2 block text-sm font-medium">
              Email
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
        </div>
        <div>
          <label htmlFor="password" className="mb-2 block text-sm font-medium">
            Password
          </label>
          <PasswordField
            value={password}
            onChange={setPassword}
            autoComplete="new-password"
            minLength={8}
          />
          <p className="mt-2 text-xs text-ink-soft">At least 8 characters.</p>
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
          {busy ? "Creating Account…" : "Continue"}
          <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
        </button>
      </form>

      <p className="mt-4 text-center text-sm text-ink-soft">
        Already have an account?{" "}
        <Link href="/login" className="font-semibold text-gold-deep hover:underline">
          Log in
        </Link>
      </p>

      <div className="my-6 flex items-center gap-4 text-sm text-ink-soft">
        <span className="h-px flex-1 bg-line" />
        Or
        <span className="h-px flex-1 bg-line" />
      </div>

      <Link
        href="/login"
        className="flex w-full items-center justify-center rounded-xl border border-line bg-white py-4 font-semibold text-ink transition-colors duration-200 hover:border-ink"
      >
        Sign In With Email or Mobile
      </Link>
    </AuthShell>
  );
}
