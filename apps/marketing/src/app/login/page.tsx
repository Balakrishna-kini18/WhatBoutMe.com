"use client";

import { useEffect, useState, useSyncExternalStore, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import AuthShell from "@/components/site/AuthShell";
import PasswordField, { FIELD } from "@/components/site/PasswordField";
import { continueToPortal, signIn, signOut } from "@/lib/auth";

type Method = "email" | "mobile";

// whether the visitor was sent here on the way to the LMS portal (?portal=...)
const subscribe = () => () => {};
const headingForPortal = () => new URLSearchParams(window.location.search).has("portal");
const notForPortal = () => false;

export default function LoginPage() {
  const router = useRouter();
  const [method, setMethod] = useState<Method>("email");
  const [email, setEmail] = useState("");
  const [mobile, setMobile] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const forPortal = useSyncExternalStore(subscribe, headingForPortal, notForPortal);

  // The learner portal has no sign-in of its own and sends people here.
  // "signout" finishes a sign-out started there; "portal" returns a learner
  // who is already signed in on this site straight back.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.has("signout")) {
      signOut();
      window.history.replaceState(null, "", "/login");
    } else if (localStorage.getItem("wbm_user")) {
      continueToPortal();
    }
  }, []);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await signIn(method === "email" ? email : mobile, password);
      // sent here by the learner portal: go back to it, now signed in
      if (!continueToPortal()) router.push("/");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not sign in.";
      // the API words its rejection for email; say "mobile number" on that tab
      setError(
        method === "mobile"
          ? message.replace("Invalid email", "Invalid mobile number")
          : message,
      );
      setBusy(false);
    }
  };

  const tab = (value: Method, label: string) => (
    <button
      type="button"
      role="tab"
      aria-selected={method === value}
      onClick={() => {
        setMethod(value);
        setError("");
      }}
      className={`flex-1 rounded-full py-2.5 text-sm font-medium transition-colors duration-200 ${
        method === value ? "bg-ink text-cream" : "text-ink-soft hover:text-ink"
      }`}
    >
      {label}
    </button>
  );

  return (
    <AuthShell
      headline="Continue Your Journey"
      subtitle="Sign in to reach your courses, live sessions and certificates."
    >
      <h1 className="text-center text-3xl font-bold tracking-tight md:text-4xl">
        Welcome Back
      </h1>

      {forPortal && (
        <p role="status" className="mt-5 rounded-xl bg-cream-deep px-4 py-3 text-center text-sm text-ink">
          Sign in to see your courses and profile. No course yet? You can
          explore and pick one after signing in.
        </p>
      )}

      {/* sign in with email or with mobile number */}
      <div
        role="tablist"
        aria-label="Sign in with"
        className="mt-8 flex rounded-full bg-sand p-1"
      >
        {tab("email", "Email")}
        {tab("mobile", "Mobile Number")}
      </div>

      <form onSubmit={onSubmit} className="mt-6 space-y-5">
        {method === "email" ? (
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
        ) : (
          <div>
            <label htmlFor="mobile" className="mb-2 block text-sm font-medium">
              Mobile Number
            </label>
            <input
              id="mobile"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              required
              pattern="[+0-9][0-9 ()\-]{6,}"
              title="Enter your mobile number with country code, for example +971 56 546 4014"
              value={mobile}
              onChange={(e) => setMobile(e.target.value)}
              placeholder="+971 56 546 4014"
              className={FIELD}
            />
          </div>
        )}

        <div>
          <label htmlFor="password" className="mb-2 block text-sm font-medium">
            Password
          </label>
          <PasswordField
            value={password}
            onChange={setPassword}
            autoComplete="current-password"
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
          {busy ? "Signing In…" : "Sign In"}
          <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
        </button>
      </form>

      <p className="mt-4 text-center text-sm text-ink-soft">
        Don&apos;t have an account?{" "}
        <Link href="/signup" className="font-semibold text-gold-deep hover:underline">
          Sign up
        </Link>
      </p>

      <div className="my-6 flex items-center gap-4 text-sm text-ink-soft">
        <span className="h-px flex-1 bg-line" />
        Or
        <span className="h-px flex-1 bg-line" />
      </div>

      <Link
        href="/signup"
        className="flex w-full items-center justify-center rounded-xl border border-line bg-white py-4 font-semibold text-ink transition-colors duration-200 hover:border-ink"
      >
        Create Account
      </Link>
    </AuthShell>
  );
}
