"use client";

import { Suspense, useState, useMemo, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { API_URL } from "../lib/api";
import styles from "../login/auth.module.css";

export default function SetupAccountPage() {
  return (
    <Suspense
      fallback={
        <div className={styles.authContainer}>
          <div className={styles.authCard}>
            <p>Loading account setup...</p>
          </div>
        </div>
      }
    >
      <SetupAccountContent />
    </Suspense>
  );
}

function SetupAccountContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";
  const emailParam = searchParams.get("email") || "";

  const [email] = useState(emailParam);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);

  // Password strength checks
  const hasMinLength = password.length >= 8;
  const hasUpper = /[A-Z]/.test(password);
  const hasLower = /[a-z]/.test(password);
  const hasNumberOrSymbol = /[\d!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password);
  const passwordsMatch = confirmPassword.length > 0 && password === confirmPassword;

  const strengthScore = useMemo(() => {
    let score = 0;
    if (hasMinLength) score++;
    if (hasUpper && hasLower) score++;
    if (hasNumberOrSymbol) score++;
    return score;
  }, [hasMinLength, hasUpper, hasLower, hasNumberOrSymbol]);

  const strengthColor =
    strengthScore === 3 ? "#16a34a" : strengthScore === 2 ? "#d97706" : "#dc2626";
  const strengthLabel =
    strengthScore === 3 ? "Strong" : strengthScore === 2 ? "Moderate" : "Weak";

  if (!token) {
    return (
      <div className={styles.authContainer}>
        <div className={styles.authCard}>
          <div className={styles.logo}>
            whatboutme<span style={{ color: "#e11d48" }}>♥</span>
          </div>
          <h2>Missing Setup Link</h2>
          <p>
            No account setup token was detected in your link. Please open the link directly
            from the invitation email sent by your organization.
          </p>
          <div style={{ marginTop: "1.5rem" }}>
            <Link href="/login" className={styles.submitBtn} style={{ display: "block", textDecoration: "none" }}>
              Go to Sign In
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (isSuccess) {
    return (
      <div className={styles.authContainer}>
        <div className={styles.authCard}>
          <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>🎉</div>
          <h2>Account Activated!</h2>
          <p>
            Your password has been successfully established and your sponsored seat is ready.
            Taking you to your courses...
          </p>
          <div style={{ marginTop: "1.5rem" }}>
            <Link href="/agreement" className={styles.submitBtn} style={{ display: "block", textDecoration: "none" }}>
              Proceed to Digital Agreement &rarr;
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!hasMinLength) {
      setError("Password must be at least 8 characters long.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    try {
      setIsSubmitting(true);

      // 1. Confirm and consume password reset / setup token
      const resetRes = await fetch(`${API_URL}/auth/password-reset/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: token.trim(),
          newPassword: password,
        }),
      });

      if (!resetRes.ok) {
        const errData = await resetRes.json().catch(() => ({}));
        throw new Error(
          errData.message ||
            "This setup link has expired or has already been used. Please request a new one or sign in."
        );
      }

      // 2. Automatically sign in with the new password
      if (email) {
        try {
          const loginRes = await fetch(`${API_URL}/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              email: email.trim().toLowerCase(),
              password,
            }),
          });

          if (loginRes.ok) {
            const loginData = await loginRes.json();
            const tokenToStore = loginData.access_token || loginData.accessToken || loginData.token;
            if (tokenToStore) {
              localStorage.setItem("token", tokenToStore);
              if (loginData.refresh_token) {
                localStorage.setItem("refresh_token", loginData.refresh_token);
              }
              if (loginData.user) {
                localStorage.setItem("user", JSON.stringify(loginData.user));
              }

              setIsSuccess(true);
              setTimeout(() => {
                router.push("/agreement");
              }, 1200);
              return;
            }
          }
        } catch {
          // If auto-login fails, show manual login button
        }
      }

      setIsSuccess(true);
      setTimeout(() => {
        router.push("/login");
      }, 1500);
    } catch (err: any) {
      setError(err?.message || "Failed to set up account. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className={styles.authContainer}>
      <div className={styles.authCard} style={{ maxWidth: "480px", textAlign: "left" }}>
        <div style={{ textAlign: "center", marginBottom: "1.5rem" }}>
          <div className={styles.logo}>
            whatboutme<span style={{ color: "#e11d48" }}>♥</span>
          </div>
          <span
            style={{
              display: "inline-block",
              fontSize: "0.75rem",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              color: "#c97a1e",
              background: "#fef3c7",
              padding: "4px 12px",
              borderRadius: "9999px",
              marginBottom: "8px",
            }}
          >
            Sponsored Learner Activation
          </span>
          <h2 style={{ fontSize: "1.35rem", fontWeight: 700, margin: "4px 0" }}>
            Set Up Your Account
          </h2>
          <p style={{ fontSize: "0.88rem", color: "#64748b", margin: 0 }}>
            Create your password to activate your sponsored enrollment and access your lessons.
          </p>
        </div>

        {error && (
          <div
            style={{
              padding: "12px 14px",
              borderRadius: "8px",
              background: "#fef2f2",
              border: "1px solid #fecaca",
              color: "#b91c1c",
              fontSize: "0.85rem",
              lineHeight: 1.4,
              marginBottom: "1.2rem",
            }}
          >
            ⚠️ {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className={styles.form}>
          {email && (
            <div className={styles.inputGroup}>
              <label>Your Registered Email</label>
              <input
                type="email"
                value={email}
                disabled
                style={{
                  background: "#f1f5f9",
                  color: "#475569",
                  cursor: "not-allowed",
                  borderColor: "#e2e8f0",
                }}
              />
            </div>
          )}

          <div className={styles.inputGroup}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <label>Choose a Secure Password *</label>
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  background: "none",
                  border: "none",
                  color: "#c97a1e",
                  fontSize: "0.78rem",
                  fontWeight: 600,
                  cursor: "pointer",
                  padding: 0,
                }}
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
            <input
              type={showPassword ? "text" : "password"}
              required
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
            />
          </div>

          {password.length > 0 && (
            <div style={{ fontSize: "0.78rem", marginTop: "-6px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                <span style={{ color: "#64748b" }}>Strength:</span>
                <span style={{ fontWeight: 700, color: strengthColor }}>{strengthLabel}</span>
              </div>
              <div
                style={{
                  height: "4px",
                  borderRadius: "2px",
                  background: "#e2e8f0",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: `${(strengthScore / 3) * 100}%`,
                    background: strengthColor,
                    transition: "all 0.3s ease",
                  }}
                />
              </div>
            </div>
          )}

          <div className={styles.inputGroup}>
            <label>Confirm Password *</label>
            <input
              type={showPassword ? "text" : "password"}
              required
              placeholder="••••••••"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
            />
          </div>

          {confirmPassword.length > 0 && !passwordsMatch && (
            <div style={{ fontSize: "0.78rem", color: "#dc2626", marginTop: "-6px" }}>
              ✕ Passwords do not match
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting || !hasMinLength || !passwordsMatch}
            className={styles.submitBtn}
            style={{
              opacity: isSubmitting || !hasMinLength || !passwordsMatch ? 0.6 : 1,
              cursor: isSubmitting || !hasMinLength || !passwordsMatch ? "not-allowed" : "pointer",
            }}
          >
            {isSubmitting ? "Setting Up Account..." : "Complete Setup & Access Courses \u2192"}
          </button>
        </form>

        <div style={{ textAlign: "center", marginTop: "1.5rem", fontSize: "0.82rem", color: "#64748b" }}>
          Already activated?{" "}
          <Link href="/login" style={{ color: "#c97a1e", fontWeight: 600, textDecoration: "none" }}>
            Sign In Here
          </Link>
        </div>
      </div>
    </div>
  );
}

