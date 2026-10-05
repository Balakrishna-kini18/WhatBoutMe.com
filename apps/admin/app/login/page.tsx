"use client";

import styles from "./login.module.css";
import { useEffect, useState, FormEvent } from "react";
import { useRouter } from "next/navigation";

// demo logins come from the environment, never from the source
const QUICK = [
  { label: "Super Admin", email: process.env.NEXT_PUBLIC_DEMO_SUPER_EMAIL || "" },
  { label: "Admin", email: process.env.NEXT_PUBLIC_DEMO_ADMIN_EMAIL || "" },
  { label: "Manager", email: process.env.NEXT_PUBLIC_DEMO_MANAGER_EMAIL || "" },
];

export default function AdminLogin() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Hide sidebar for login page
    document.body.classList.add("login-page-active");
    return () => {
      document.body.classList.remove("login-page-active");
    };
  }, []);

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || `${process.env.NEXT_PUBLIC_API_URL || `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}`}`}/auth/admin-login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json().catch(() => null);

      if (res.ok) {
        localStorage.setItem("token", data.access_token);
        // without this the session cannot be renewed and ends after 15 minutes
        if (data.refresh_token) localStorage.setItem("refresh_token", data.refresh_token);
        localStorage.setItem("user", JSON.stringify(data.user));
        router.push("/");
      } else {
        // the API wraps errors as { error: { message } }
        setError(data?.error?.message || data?.message || "Invalid credentials");
      }
    } catch {
      setError("Failed to connect to server");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className={styles.page}>
      <div className={styles.card}>
        {/* left: gradient panel (hidden on small screens) */}
        <section className={styles.panel}>
          <span aria-hidden className={styles.glowTop} />
          <span aria-hidden className={styles.glowBottom} />

          <div className={styles.panelTop}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/logo-light.png" alt="whatboutme" className={styles.logo} />
          </div>

          <div className={styles.panelBody}>
            <p className={styles.chip}>Admin portal</p>
            <h2 className={styles.headline}>Run the Programme</h2>
            <p className={styles.subtitle}>
              Sign in to manage courses, batches, learners and revenue.
            </p>
          </div>
        </section>

        {/* right: the form */}
        <section className={styles.formSide}>
          <div className={styles.formInner}>
            <div className={styles.mobileLogo}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/brand/logo-dark.png" alt="whatboutme" className={styles.logo} />
            </div>

            <h1 className={styles.title}>Admin Sign In</h1>
            <p className={styles.lead}>Enter your admin credentials to open the dashboard.</p>

            <form className={styles.form} onSubmit={handleLogin}>
              <div>
                <label htmlFor="email" className={styles.label}>
                  Email Address
                </label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  placeholder="admin@whatboutme.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={styles.field}
                />
              </div>
              <div>
                <label htmlFor="password" className={styles.label}>
                  Password
                </label>
                <div className={styles.passwordWrap}>
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={styles.field}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    aria-pressed={showPassword}
                    className={styles.toggle}
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
                      <circle cx="12" cy="12" r="3" />
                      {showPassword && <line x1="3" y1="3" x2="21" y2="21" />}
                    </svg>
                  </button>
                </div>
              </div>

              {error && (
                <p role="alert" className={styles.error}>
                  {error}
                </p>
              )}

              <button type="submit" className={styles.submit} disabled={loading}>
                {loading ? "Signing In…" : "Sign In"}
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M5 12h14" />
                  <path d="m12 5 7 7-7 7" />
                </svg>
              </button>
            </form>

            {/* demo accounts: fills the form with a seeded login */}
            <div className={styles.divider}>Demo accounts</div>
            <div className={styles.quick}>
              {QUICK.map((q) => (
                <button
                  key={q.label}
                  type="button"
                  onClick={() => {
                    setEmail(q.email);
                    setPassword(process.env.NEXT_PUBLIC_DEMO_PASSWORD || "");
                  }}
                  className={styles.quickBtn}
                >
                  {q.label}
                </button>
              ))}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
