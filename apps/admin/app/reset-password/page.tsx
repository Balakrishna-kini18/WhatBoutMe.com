"use client";

import { Suspense, useState, useEffect, FormEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import styles from "../login/login.module.css";
import { API_URL } from "../lib/api";

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";
  const emailParam = searchParams.get("email") || "";
  const initialEmail = emailParam ? decodeURIComponent(emailParam).trim() : "";

  // Token verification state
  const [resolvedEmail, setResolvedEmail] = useState(initialEmail);
  const [isVerifying, setIsVerifying] = useState(Boolean(token));
  const [tokenStatus, setTokenStatus] = useState<"checking" | "valid" | "invalid">("checking");
  const [tokenError, setTokenError] = useState<string | null>(null);

  // Form input state
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Resend fresh link state
  const [resending, setResending] = useState(false);
  const [resendSent, setResendSent] = useState(false);
  const [resendError, setResendError] = useState("");

  // Validation
  const hasMinLength = password.length >= 8;
  const passwordsMatch = password.length > 0 && password === confirmPassword;

  // On mount: verify token with backend server
  useEffect(() => {
    if (!token) {
      setTokenStatus("invalid");
      setTokenError("No reset token detected in the link. Please check your welcome email.");
      setIsVerifying(false);
      return;
    }

    let isMounted = true;
    (async () => {
      try {
        const res = await fetch(`${API_URL}/auth/password-reset/verify?token=${encodeURIComponent(token)}`);
        const data = await res.json().catch(() => null);
        if (!isMounted) return;

        if (res.ok && data?.valid) {
          setTokenStatus("valid");
          if (data.email) {
            setResolvedEmail(data.email);
          }
        } else {
          setTokenStatus("invalid");
          setTokenError(data?.error || "This password setup link has already been used or has expired.");
          if (data?.email) {
            setResolvedEmail(data.email);
          }
        }
      } catch {
        if (!isMounted) return;
        // Network fallback: permit form submission so client isn't blocked by transient network issues
        setTokenStatus("valid");
      } finally {
        if (isMounted) setIsVerifying(false);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [token]);

  // Handle re-requesting a fresh link if the current token is expired / used
  const handleRequestFreshLink = async () => {
    const targetEmail = resolvedEmail.trim();
    if (!targetEmail) return;

    setResending(true);
    setResendError("");
    try {
      const res = await fetch(`${API_URL}/auth/password-reset/request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: targetEmail }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok) {
        setResendSent(true);
      } else {
        setResendError(data?.message || "Failed to send reset link. Please try again.");
      }
    } catch {
      setResendError("Failed to connect to server. Please try again.");
    } finally {
      setResending(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!token) {
      setError("Password reset token is missing or invalid. Please click the full link in your welcome email.");
      return;
    }

    if (!hasMinLength) {
      setError("Password must be at least 8 characters long.");
      return;
    }

    if (!passwordsMatch) {
      setError("Passwords do not match.");
      return;
    }

    try {
      setLoading(true);
      const res = await fetch(`${API_URL}/auth/password-reset/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          newPassword: password,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const rawMsg = Array.isArray(body?.message) ? body.message[0] : body?.message;
        if (rawMsg?.toLowerCase().includes("invalid or expired") || rawMsg?.toLowerCase().includes("expired")) {
          throw new Error("This password setup link has already been used or has expired. Each link is single-use for security.");
        }
        throw new Error(rawMsg || "Failed to set password. The link may have expired.");
      }

      setSuccess(true);
      const targetEmail = resolvedEmail || initialEmail || emailParam;
      setTimeout(() => {
        router.push(targetEmail ? `/login?email=${encodeURIComponent(targetEmail)}&type=organization` : "/login");
      }, 2200);
    } catch (err: any) {
      setError(err?.message || "Failed to set password.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className={styles.page}>
      <div className={styles.card}>
        {/* Left: Golden gradient panel matching login exactly */}
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
            <p className={styles.chip}>Partner Portal</p>
            <h2 className={styles.headline}>Empower Your Learners</h2>
            <p className={styles.subtitle}>
              Manage batch seats, track live 6-gate student progress, and view billing invoices.
            </p>
          </div>
        </section>

        {/* Right: Clean form side matching login */}
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

            {success ? (
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
                <h1 className={styles.title} style={{ fontSize: "1.6rem" }}>Password Set!</h1>
                <p className={styles.lead} style={{ marginTop: "0.5rem" }}>
                  Your new credentials have been saved. Redirecting to the sign-in page…
                </p>
                <div style={{ marginTop: "2rem" }}>
                  <Link href="/login" className={styles.submit} style={{ textDecoration: "none" }}>
                    Sign In to Partner Portal &rarr;
                  </Link>
                </div>
              </div>
            ) : (
              <>
                <h1 className={styles.title}>Set Partner Password</h1>
                <p className={styles.lead}>
                  Enter your new credentials to activate your partner account.
                </p>

                {/* Token Checking or Expiration Banner */}
                {isVerifying ? (
                  <div style={{ margin: "1rem 0", padding: "10px 14px", background: "#f8fafc", borderRadius: "10px", border: "1px solid #e2e8f0", textAlign: "center" }}>
                    <p style={{ margin: 0, fontSize: "0.82rem", color: "#64748b" }}>
                      Verifying secure setup link…
                    </p>
                  </div>
                ) : tokenStatus === "invalid" ? (
                  <div style={{ margin: "1.25rem 0", padding: "14px 16px", background: "#fef2f2", borderRadius: "12px", border: "1px solid #fecaca" }}>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
                      <span style={{ fontSize: "1.1rem" }}>⚠️</span>
                      <div style={{ flex: 1 }}>
                        <p style={{ margin: "0 0 4px", fontSize: "0.85rem", color: "#991b1b", fontWeight: 700 }}>
                          Link Expired or Already Used
                        </p>
                        <p style={{ margin: 0, fontSize: "0.8rem", color: "#7f1d1d", lineHeight: 1.45 }}>
                          {tokenError || "This password setup link is invalid or has already been consumed. For security, each link can only be used once."}
                        </p>

                        {resolvedEmail && (
                          <div style={{ marginTop: "10px" }}>
                            {resendSent ? (
                              <p style={{ margin: 0, fontSize: "0.8rem", color: "#059669", fontWeight: 600 }}>
                                ✓ Fresh password setup link has been dispatched to {resolvedEmail}! Please check your email.
                              </p>
                            ) : (
                              <button
                                type="button"
                                onClick={handleRequestFreshLink}
                                disabled={resending}
                                style={{
                                  background: "#ffffff",
                                  border: "1px solid #dc2626",
                                  color: "#dc2626",
                                  padding: "6px 12px",
                                  borderRadius: "6px",
                                  fontSize: "0.8rem",
                                  fontWeight: 600,
                                  cursor: "pointer",
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: "6px",
                                }}
                              >
                                {resending ? "Sending New Link…" : `✉️ Send New Link to ${resolvedEmail}`}
                              </button>
                            )}
                            {resendError && (
                              <p style={{ margin: "4px 0 0", fontSize: "0.75rem", color: "#b91c1c" }}>
                                {resendError}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ) : null}

                <form className={styles.form} onSubmit={handleSubmit}>
                  {/* Email Address (Pre-filled for the partner) */}
                  {resolvedEmail && (
                    <div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                        <label className={styles.label} htmlFor="email" style={{ marginBottom: 0 }}>
                          Email Address
                        </label>
                        {tokenStatus === "valid" && (
                          <span style={{ fontSize: "0.75rem", color: "#16a34a", fontWeight: 600 }}>
                            ✓ Verified Partner
                          </span>
                        )}
                      </div>
                      <input
                        id="email"
                        type="email"
                        readOnly
                        disabled
                        value={resolvedEmail}
                        className={styles.field}
                        style={{
                          cursor: "not-allowed",
                          background: "#f1ede6",
                          color: "var(--text-primary)",
                          opacity: 0.95,
                          fontWeight: 500,
                        }}
                      />
                    </div>
                  )}

                  <div>
                    <label className={styles.label} htmlFor="password">
                      New Password *
                    </label>
                    <div className={styles.passwordWrap}>
                      <input
                        id="password"
                        type={showPassword ? "text" : "password"}
                        required
                        minLength={8}
                        disabled={tokenStatus === "invalid"}
                        autoFocus={tokenStatus === "valid"}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="At least 8 characters"
                        className={styles.field}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className={styles.toggle}
                        aria-label={showPassword ? "Hide password" : "Show password"}
                      >
                        {showPassword ? (
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                            <line x1="1" y1="1" x2="23" y2="23" />
                          </svg>
                        ) : (
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                            <circle cx="12" cy="12" r="3" />
                          </svg>
                        )}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className={styles.label} htmlFor="confirmPassword">
                      Confirm New Password *
                    </label>
                    <div className={styles.passwordWrap}>
                      <input
                        id="confirmPassword"
                        type={showPassword ? "text" : "password"}
                        required
                        minLength={8}
                        disabled={tokenStatus === "invalid"}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Repeat your new password"
                        className={styles.field}
                      />
                    </div>
                  </div>

                  {/* Password helper status */}
                  <div style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "0.8rem", padding: "2px 4px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px", color: hasMinLength ? "#16a34a" : "#78716c" }}>
                      <span>{hasMinLength ? "✓" : "○"}</span>
                      <span>At least 8 characters</span>
                    </div>
                    {confirmPassword.length > 0 && (
                      <div style={{ display: "flex", alignItems: "center", gap: "6px", color: passwordsMatch ? "#16a34a" : "#dc2626" }}>
                        <span>{passwordsMatch ? "✓" : "×"}</span>
                        <span>{passwordsMatch ? "Passwords match" : "Passwords do not match"}</span>
                      </div>
                    )}
                  </div>

                  {error && (
                    <p role="alert" className={styles.error}>
                      {error}
                    </p>
                  )}

                  <button
                    type="submit"
                    className={styles.submit}
                    disabled={loading || tokenStatus === "invalid" || !token || !hasMinLength || !passwordsMatch}
                    style={{
                      opacity: loading || tokenStatus === "invalid" || !token || !hasMinLength || !passwordsMatch ? 0.6 : 1,
                      cursor: loading || tokenStatus === "invalid" || !token || !hasMinLength || !passwordsMatch ? "not-allowed" : "pointer",
                    }}
                  >
                    {loading ? "Saving Password…" : "Save Password & Enter Workspace"}
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M5 12h14" />
                      <path d="m12 5 7 7-7 7" />
                    </svg>
                  </button>

                  <Link
                    href="/login"
                    className={styles.secondaryBtn}
                    style={{ textDecoration: "none" }}
                  >
                    &larr; Back to Sign In
                  </Link>
                </form>
              </>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <main className={styles.page}>
          <div className={styles.card} style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "400px" }}>
            <p style={{ color: "var(--text-secondary)", fontSize: "0.95rem" }}>Loading password setup…</p>
          </div>
        </main>
      }
    >
      <ResetPasswordForm />
    </Suspense>
  );
}
