"use client";

import styles from "./login.module.css";
import { useEffect, useState, FormEvent } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import { useAuth } from "../AuthProvider";
import { API_URL } from "../lib/api";

// demo logins come from the environment or default to canonical seeded development accounts
const QUICK_STAFF = [
  { label: "Super Admin", email: process.env.NEXT_PUBLIC_DEMO_SUPER_EMAIL || "super@whatboutme.com" },
  { label: "Admin", email: process.env.NEXT_PUBLIC_DEMO_ADMIN_EMAIL || "admin@whatboutme.com" },
  { label: "Manager", email: process.env.NEXT_PUBLIC_DEMO_MANAGER_EMAIL || "manager@whatboutme.com" },
];

type ViewMode = "login" | "verify_2fa" | "setup_2fa" | "forgot_password";

interface PendingSession {
  access_token: string;
  refresh_token?: string;
  user: {
    id: string;
    email: string;
    name?: string;
    role: string;
    permissions?: string[];
  };
}

interface SetupData {
  secret: string;
  otpauthUrl: string;
  qrDataUrl: string;
}

export default function AdminLogin() {
  const router = useRouter();
  const { login } = useAuth();

  // Login form state
  const [loginType, setLoginType] = useState<"staff" | "organization">("staff");
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

  // Forgot / Reset password state
  const [resetEmail, setResetEmail] = useState("");
  const [resetLoading, setResetLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [resetError, setResetError] = useState("");

  useEffect(() => {
    // Hide sidebar for login page
    document.body.classList.add("login-page-active");

    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const emailParam = params.get("email");
      const typeParam = params.get("type");
      if (emailParam) {
        setEmail(emailParam);
      }
      if (
        typeParam === "organization" ||
        (emailParam &&
          !emailParam.endsWith("@whatboutme.com") &&
          !emailParam.endsWith("@foxwel.ai"))
      ) {
        setLoginType("organization");
      }
    }

    return () => {
      document.body.classList.remove("login-page-active");
    };
  }, []);

  // Commit session securely to localStorage and synchronously update AuthProvider state
  const commitSession = (session: PendingSession) => {
    if (!session.access_token) return;
    login({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      user: session.user as any,
    });
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
          const orgId = data.user?.organizationId || data.user?.organization?.id;
          if (data.user?.isOrgUser || orgId) {
            router.push(`/users/organizations/${orgId}`);
          } else {
            router.push("/");
          }
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
        const orgId = data.user?.organizationId || data.user?.organization?.id;
        if (data.user?.isOrgUser || orgId) {
          router.push(`/users/organizations/${orgId}`);
        } else {
          router.push("/");
        }
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
    setResetError("");
    setResetSent(false);
  };

  const handleOpenForgotPassword = () => {
    setResetEmail(email.trim());
    setResetError("");
    setResetSent(false);
    setViewMode("forgot_password");
  };

  const handleRequestReset = async (e: FormEvent) => {
    e.preventDefault();
    if (!resetEmail.trim()) {
      setResetError("Please enter your email address.");
      return;
    }
    setResetError("");
    setResetLoading(true);
    try {
      const res = await fetch(`${API_URL}/auth/password-reset/request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: resetEmail.trim() }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok) {
        setResetSent(true);
      } else {
        setResetError(data?.error?.message || data?.message || "Failed to send reset email. Please try again.");
      }
    } catch {
      setResetError("Failed to connect to server. Please try again later.");
    } finally {
      setResetLoading(false);
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
            <Image
              src="/brand/logo-dark.png"
              alt="whatboutme"
              width={168}
              height={24}
              priority
              quality={80}
              className={styles.logo}
            />
          </div>

          <div className={styles.panelBody}>
            <p className={styles.chip}>
              {loginType === "organization" ? "Partner Portal" : "Admin portal"}
            </p>
            <h2 className={styles.headline}>
              {viewMode === "forgot_password"
                ? (loginType === "organization" ? "Password Recovery" : "Account Recovery")
                : (loginType === "organization" ? "Empower Your Learners" : "Run the Programme")}
            </h2>
            <p className={styles.subtitle}>
              {viewMode === "forgot_password"
                ? "Request a secure single-use link to configure your password and enter your workspace."
                : (loginType === "organization"
                    ? "Manage batch seats, track live 6-gate student progress, and view billing invoices."
                    : "Sign in to manage courses, batches, learners and revenue.")}
            </p>
          </div>
        </section>

        {/* right: view modes */}
        <section className={styles.formSide}>
          <div className={styles.formInner}>
            <div className={styles.mobileLogo}>
              <Image
                src="/brand/logo-dark.png"
                alt="whatboutme"
                width={168}
                height={24}
                priority
                quality={80}
                className={styles.logo}
              />
            </div>

            {/* Mode 1: Initial Email & Password Login */}
            {viewMode === "login" && (
              <div className={styles.typeSwitcher} role="tablist" aria-label="Sign-in role">
                <button
                  type="button"
                  role="tab"
                  aria-selected={loginType === "staff"}
                  className={`${styles.typeTab} ${loginType === "staff" ? styles.typeTabActive : ""}`}
                  onClick={() => {
                    setLoginType("staff");
                    setEmail("");
                    setPassword("");
                    setError("");
                  }}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                  </svg>
                  Staff & Admin
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={loginType === "organization"}
                  className={`${styles.typeTab} ${loginType === "organization" ? styles.typeTabActive : ""}`}
                  onClick={() => {
                    setLoginType("organization");
                    setEmail("");
                    setPassword("");
                    setError("");
                  }}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z" />
                    <path d="M6 12H4a2 2 0 0 0-2 2v8h4" />
                    <path d="M18 9h2a2 2 0 0 1 2 2v11h-4" />
                    <path d="M10 6h4" />
                    <path d="M10 10h4" />
                    <path d="M10 14h4" />
                    <path d="M10 18h4" />
                  </svg>
                  Organization Partner
                </button>
              </div>
            )}

            {/* Mode 1: Initial Email & Password Login */}
            {viewMode === "login" && (
              <>
                <h1 className={styles.title}>
                  {loginType === "organization" ? "Partner Sign In" : "Admin Sign In"}
                </h1>
                <p className={styles.lead}>
                  {loginType === "organization"
                    ? "Enter your partner credentials to manage your seats & students."
                    : "Enter your admin credentials to open the dashboard."}
                </p>

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
                      placeholder={loginType === "organization" ? "partner@organization.com" : "admin@whatboutme.com"}
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className={styles.field}
                    />
                  </div>
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                      <label htmlFor="password" className={styles.label} style={{ marginBottom: 0 }}>
                        Password
                      </label>
                      <button
                        type="button"
                        onClick={handleOpenForgotPassword}
                        style={{
                          background: "none",
                          border: "none",
                          padding: 0,
                          color: "var(--accent-primary, #b46b1a)",
                          fontSize: "0.8125rem",
                          fontWeight: 600,
                          cursor: "pointer",
                          textDecoration: "underline",
                        }}
                      >
                        Forgot password?
                      </button>
                    </div>
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

                  {loginType === "organization" && (
                    <div style={{ marginTop: "1.25rem", textAlign: "center", borderTop: "1px solid #f1ede6", paddingTop: "1rem" }}>
                      <p style={{ margin: "0 0 0.5rem", fontSize: "0.8125rem", color: "var(--text-secondary)" }}>
                        Need to set or reset your organization password?
                      </p>
                      <button
                        type="button"
                        onClick={handleOpenForgotPassword}
                        style={{
                          background: "transparent",
                          border: "1px solid #e5dfd5",
                          borderRadius: "0.5rem",
                          padding: "0.5rem 0.875rem",
                          color: "var(--text-primary)",
                          fontSize: "0.8125rem",
                          fontWeight: 600,
                          cursor: "pointer",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "6px",
                          transition: "all 0.2s ease",
                        }}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <rect width="18" height="11" x="3" y="11" rx="2" ry="2"/>
                          <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                        </svg>
                        Reset Organization Password &rarr;
                      </button>
                    </div>
                  )}
                </form>

                {/* demo accounts for staff only */}
                {loginType === "staff" && (
                  <>
                    <div className={styles.divider}>Demo accounts</div>
                    <div className={styles.quick}>
                      {QUICK_STAFF.map((q) => (
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
                  <Image
                    src={setupData.qrDataUrl}
                    alt="2FA QR Code"
                    width={180}
                    height={180}
                    unoptimized
                    quality={80}
                    loading="lazy"
                    className={styles.qrImage}
                  />
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

            {/* Mode 4: Forgot / Reset Password */}
            {viewMode === "forgot_password" && (
              <>
                {resetSent ? (
                  <div style={{ textAlign: "center", padding: "1.5rem 0" }}>
                    <div
                      style={{
                        width: "56px",
                        height: "56px",
                        borderRadius: "50%",
                        background: "#ecfdf5",
                        color: "#059669",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        margin: "0 auto 1.25rem",
                      }}
                    >
                      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </div>
                    <h1 className={styles.title} style={{ fontSize: "1.6rem" }}>
                      Reset Link Dispatched
                    </h1>
                    <p className={styles.lead} style={{ marginTop: "0.625rem", fontSize: "0.9rem", lineHeight: 1.5 }}>
                      We’ve sent password reset instructions to <strong>{resetEmail}</strong>.
                      Please check your inbox (and spam folder) to choose a new password.
                    </p>

                    <div style={{ marginTop: "2rem" }}>
                      <button
                        type="button"
                        onClick={handleCancelToLogin}
                        className={styles.submit}
                      >
                        &larr; Back to Sign In
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <h1 className={styles.title}>
                      {loginType === "organization" ? "Reset Partner Password" : "Reset Password"}
                    </h1>
                    <p className={styles.lead}>
                      {loginType === "organization"
                        ? "Enter your registered organization email address to receive a secure password setup link."
                        : "Enter your staff email address to receive password reset instructions."}
                    </p>

                    <form className={styles.form} onSubmit={handleRequestReset}>
                      <div>
                        <label htmlFor="resetEmail" className={styles.label}>
                          Registered Email Address
                        </label>
                        <input
                          id="resetEmail"
                          type="email"
                          autoComplete="email"
                          required
                          autoFocus
                          placeholder={loginType === "organization" ? "partner@organization.com" : "admin@whatboutme.com"}
                          value={resetEmail}
                          onChange={(e) => setResetEmail(e.target.value)}
                          className={styles.field}
                        />
                      </div>

                      {resetError && (
                        <p role="alert" className={styles.error}>
                          {resetError}
                        </p>
                      )}

                      <button
                        type="submit"
                        className={styles.submit}
                        disabled={resetLoading || !resetEmail.trim()}
                      >
                        {resetLoading ? "Sending Link…" : "Send Reset Link"}
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M5 12h14" />
                          <path d="m12 5 7 7-7 7" />
                        </svg>
                      </button>

                      <button
                        type="button"
                        onClick={handleCancelToLogin}
                        disabled={resetLoading}
                        className={styles.secondaryBtn}
                      >
                        &larr; Back to Sign In
                      </button>
                    </form>
                  </>
                )}
              </>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
