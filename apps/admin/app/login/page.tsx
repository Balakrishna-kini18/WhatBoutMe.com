"use client";

import styles from "./login.module.css";
import { useEffect, useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";

// demo logins come from the environment or default to canonical seeded development accounts
const QUICK = [
  { label: "Super Admin", email: process.env.NEXT_PUBLIC_DEMO_SUPER_EMAIL || "super@whatboutme.com" },
  { label: "Admin", email: process.env.NEXT_PUBLIC_DEMO_ADMIN_EMAIL || "admin@whatboutme.com" },
  { label: "Manager", email: process.env.NEXT_PUBLIC_DEMO_MANAGER_EMAIL || "manager@whatboutme.com" },
];

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

type ViewMode = "login" | "verify_2fa" | "setup_2fa";

interface PendingSession {
  access_token: string;
  refresh_token?: string;
  user: {
    id: string;
    email: string;
    name?: string;
    role: string;
  };
}

interface SetupData {
  secret: string;
  otpauthUrl: string;
  qrDataUrl: string;
}

export default function AdminLogin() {
  const router = useRouter();

  // Login form state
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // 2FA state machine
  const [viewMode, setViewMode] = useState<ViewMode>("login");
  const [tempToken, setTempToken] = useState("");
  const [code, setCode] = useState("");

  // Setup state
  const [pendingSession, setPendingSession] = useState<PendingSession | null>(null);
  const [setupData, setSetupData] = useState<SetupData | null>(null);
  const [copiedSecret, setCopiedSecret] = useState(false);

  useEffect(() => {
    // Hide sidebar for login page
    document.body.classList.add("login-page-active");
    return () => {
      document.body.classList.remove("login-page-active");
    };
  }, []);

  // Commit session securely to localStorage without exposing sensitive 2FA artifacts
  const commitSession = (session: PendingSession) => {
    if (!session.access_token) return;
    localStorage.setItem("token", session.access_token);
    if (session.refresh_token) {
      localStorage.setItem("refresh_token", session.refresh_token);
    }
    if (session.user) {
      localStorage.setItem("user", JSON.stringify(session.user));
    }
  };

  // Step 1: Handle initial admin login
  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/auth/admin-login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json().catch(() => null);

      if (res.ok && data) {
        // Case A: 2FA required (admin with 2FA already configured)
        if (data.requires2fa === true && data.tempToken) {
          setTempToken(data.tempToken);
          setViewMode("verify_2fa");
          setCode("");
          return;
        }

        // Case B: First-time 2FA setup required (admin without 2FA configured)
        if (data.requires2faSetup === true && data.access_token) {
          const session: PendingSession = {
            access_token: data.access_token,
            refresh_token: data.refresh_token,
            user: data.user,
          };
          setPendingSession(session);
          await initiate2faSetup(data.access_token);
          return;
        }

        // Case C: Normal login (e.g. MANAGER without 2FA requirement)
        if (data.access_token) {
          commitSession({
            access_token: data.access_token,
            refresh_token: data.refresh_token,
            user: data.user,
          });
          router.push("/");
        } else {
          setError("Authentication response missing access token");
        }
      } else {
        setError(data?.error?.message || data?.message || "Invalid credentials");
      }
    } catch {
      setError("Failed to connect to server");
    } finally {
      setLoading(false);
    }
  };

  // Helper: Request 2FA secret and generate QR code
  const initiate2faSetup = async (accessToken: string) => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API_URL}/auth/2fa/generate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
      });
      const data = await res.json().catch(() => null);

      if (res.ok && data?.secret && data?.otpauthUrl) {
        const qrDataUrl = await QRCode.toDataURL(data.otpauthUrl, {
          width: 180,
          margin: 1,
        });
        setSetupData({
          secret: data.secret,
          otpauthUrl: data.otpauthUrl,
          qrDataUrl,
        });
        setViewMode("setup_2fa");
        setCode("");
      } else {
        setError(data?.error?.message || data?.message || "Failed to generate 2FA setup information");
      }
    } catch {
      setError("Failed to connect to server for 2FA setup");
    } finally {
      setLoading(false);
    }
  };

  // Step 2: Handle 2FA verification during login
  const handleVerify2fa = async (e: FormEvent) => {
    e.preventDefault();
    if (!tempToken) {
      setError("Session expired. Please sign in again.");
      setViewMode("login");
      return;
    }
    const cleanCode = code.trim().replace(/\D/g, "");
    if (cleanCode.length !== 6) {
      setError("Please enter the 6-digit code from your authenticator app.");
      return;
    }

    setError("");
    setLoading(true);
    try {
      const payload = {
        tempToken,
        code: cleanCode,
      };

      const res = await fetch(`${API_URL}/auth/2fa/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => null);

      if (res.ok && data?.access_token) {
        commitSession({
          access_token: data.access_token,
          refresh_token: data.refresh_token,
          user: data.user,
        });
        router.push("/");
      } else {
        setError(data?.error?.message || data?.message || "Invalid two-factor code");
      }
    } catch {
      setError("Failed to connect to server");
    } finally {
      setLoading(false);
    }
  };

  // Step 3: Handle enabling 2FA after scanning QR
  const handleEnable2fa = async (e: FormEvent) => {
    e.preventDefault();
    if (!pendingSession?.access_token || !setupData?.secret) {
      setError("Setup session expired. Please sign in again.");
      setViewMode("login");
      return;
    }
    const cleanCode = code.trim().replace(/\D/g, "");
    if (cleanCode.length !== 6) {
      setError("Authenticator code must be exactly 6 digits");
      return;
    }

    setError("");
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/auth/2fa/enable`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${pendingSession.access_token}`,
        },
        body: JSON.stringify({
          code: cleanCode,
          secret: setupData.secret,
        }),
      });
      const data = await res.json().catch(() => null);

      if (res.ok) {
        commitSession(pendingSession);
        router.push("/");
      } else {
        setError(data?.error?.message || data?.message || "Invalid verification code. Please check your authenticator app.");
      }
    } catch {
      setError("Failed to verify and enable 2FA");
    } finally {
      setLoading(false);
    }
  };

  // Clipboard copy helper
  const handleCopySecret = async () => {
    if (!setupData?.secret) return;
    try {
      await navigator.clipboard.writeText(setupData.secret);
      setCopiedSecret(true);
      setTimeout(() => setCopiedSecret(false), 2000);
    } catch {}
  };

  const handleCancelToLogin = () => {
    setViewMode("login");
    setTempToken("");
    setPendingSession(null);
    setSetupData(null);
    setCode("");
    setError("");
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

        {/* right: view modes */}
        <section className={styles.formSide}>
          <div className={styles.formInner}>
            <div className={styles.mobileLogo}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/brand/logo-dark.png" alt="whatboutme" className={styles.logo} />
            </div>

            {/* Mode 1: Initial Email & Password Login */}
            {viewMode === "login" && (
              <>
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
                        setPassword(process.env.NEXT_PUBLIC_DEMO_PASSWORD || "Learner@2026");
                      }}
                      className={styles.quickBtn}
                    >
                      {q.label}
                    </button>
                  ))}
                </div>
              </>
            )}

            {/* Mode 2: 2FA Verification (Enabled Admin) */}
            {viewMode === "verify_2fa" && (
              <>
                <h1 className={styles.title}>Two-Step Verification</h1>
                <p className={styles.lead}>
                  Enter the 6-digit verification code from your authenticator app.
                </p>

                <form className={styles.form} onSubmit={handleVerify2fa}>
                  <div>
                    <label htmlFor="totpCode" className={styles.label}>
                      Authenticator Code
                    </label>
                    <input
                      id="totpCode"
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      autoComplete="one-time-code"
                      autoFocus
                      required
                      placeholder="123456"
                      maxLength={6}
                      value={code}
                      onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                      className={styles.field}
                    />
                  </div>

                  {error && (
                    <p role="alert" className={styles.error}>
                      {error}
                    </p>
                  )}

                  <button type="submit" className={styles.submit} disabled={loading || !code.trim()}>
                    {loading ? "Verifying…" : "Verify & Sign In"}
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M5 12h14" />
                      <path d="m12 5 7 7-7 7" />
                    </svg>
                  </button>

                  <button
                    type="button"
                    onClick={handleCancelToLogin}
                    disabled={loading}
                    className={styles.secondaryBtn}
                  >
                    ← Back to Sign In
                  </button>
                </form>
              </>
            )}

            {/* Mode 3: First-Time 2FA Setup */}
            {viewMode === "setup_2fa" && setupData && (
              <>
                <h1 className={styles.title}>Set Up Authenticator</h1>
                <p className={styles.lead} style={{ fontSize: '0.875rem', margin: '0.25rem 0' }}>
                  Scan with Google or Microsoft Authenticator
                </p>

                <div className={styles.qrWrapper}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={setupData.qrDataUrl} alt="2FA QR Code" className={styles.qrImage} />
                </div>

                <div className={styles.secretBox}>
                  <span>Key: {setupData.secret}</span>
                  <button
                    type="button"
                    onClick={handleCopySecret}
                    className={styles.copyBtn}
                    aria-label="Copy secret key"
                  >
                    {copiedSecret ? "Copied!" : "Copy"}
                  </button>
                </div>

                <form className={styles.form} onSubmit={handleEnable2fa} style={{ marginTop: '0.5rem', gap: '0.625rem' }}>
                  <div>
                    <label htmlFor="setupCode" className={styles.label} style={{ marginBottom: '0.25rem', fontSize: '0.8125rem' }}>
                      Enter 6-digit code from your app
                    </label>
                    <input
                      id="setupCode"
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      autoComplete="one-time-code"
                      required
                      placeholder="123456"
                      maxLength={6}
                      value={code}
                      onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                      className={styles.field}
                      style={{ padding: '0.625rem 0.875rem' }}
                    />
                  </div>

                  {error && (
                    <p role="alert" className={styles.error}>
                      {error}
                    </p>
                  )}

                  <button type="submit" className={styles.submit} disabled={loading || code.trim().length !== 6}>
                    {loading ? "Enabling…" : "Enable Two-Factor Authentication"}
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M5 12h14" />
                      <path d="m12 5 7 7-7 7" />
                    </svg>
                  </button>

                  <button
                    type="button"
                    onClick={handleCancelToLogin}
                    disabled={loading}
                    className={styles.secondaryBtn}
                  >
                    Cancel
                  </button>
                </form>
              </>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
