"use client";

import { use, useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import styles from "./checkin.module.css";
import { API_URL, getAuthHeaders, parseApiError, getAuthToken } from "../../lib/api";

interface CheckInResult {
  message: string;
  attendance: {
    id: string;
    sessionId: string;
    userId: string;
    status: string;
    source: string;
    joinTime: string;
    minutesPresent?: number;
  };
}

function CheckInContent({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tokenFromUrl = searchParams.get("token") || "";

  const [token, setToken] = useState(tokenFromUrl);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successResult, setSuccessResult] = useState<CheckInResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [userChecked, setUserChecked] = useState(false);

  useEffect(() => {
    const authToken = getAuthToken();
    if (!authToken) {
      const returnUrl = `/check-in/${sessionId}${tokenFromUrl ? `?token=${encodeURIComponent(tokenFromUrl)}` : ""}`;
      localStorage.setItem("redirect_after_login", returnUrl);
      router.push(`/login?redirect=${encodeURIComponent(returnUrl)}`);
      return;
    }
    setUserChecked(true);

    // Auto-attempt check-in if token is provided in the QR URL
    if (tokenFromUrl && !successResult && !errorMsg) {
      handleCheckIn(tokenFromUrl);
    }
  }, [sessionId, tokenFromUrl]);

  const handleCheckIn = async (checkInToken: string) => {
    const cleanToken = checkInToken.trim();
    if (!cleanToken) {
      setErrorMsg("Please enter or scan a valid check-in token.");
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      const res = await fetch(`${API_URL}/sessions/${encodeURIComponent(sessionId)}/check-in`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ token: cleanToken }),
      });

      if (res.ok) {
        const data = await res.json();
        setSuccessResult(data);
      } else {
        const err = await parseApiError(res, "Failed to complete check-in");
        setErrorMsg(err.message);
      }
    } catch {
      setErrorMsg("Unable to reach the check-in server. Please check your internet connection.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!userChecked) {
    return (
      <div className={styles.wrapper}>
        <div className={styles.card}>
          <div className={`${styles.iconWrapper} ${styles.iconNeutral}`}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          </div>
          <h1 className={styles.title}>Checking Authentication...</h1>
          <p className={styles.subtitle}>Verifying your learner login credentials.</p>
        </div>
      </div>
    );
  }

  if (successResult) {
    const localTime = successResult.attendance?.joinTime
      ? new Date(successResult.attendance.joinTime).toLocaleTimeString(undefined, {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        })
      : "Just now";

    const localDate = successResult.attendance?.joinTime
      ? new Date(successResult.attendance.joinTime).toLocaleDateString(undefined, {
          weekday: "long",
          year: "numeric",
          month: "short",
          day: "numeric",
        })
      : "";

    return (
      <div className={styles.wrapper}>
        <div className={styles.card}>
          <div className={`${styles.iconWrapper} ${styles.iconSuccess}`}>
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <h1 className={styles.title}>Checked In!</h1>
          <p className={styles.subtitle}>
            Your attendance has been recorded successfully for this session.
          </p>

          <div className={styles.infoBox}>
            <div className={styles.infoRow}>
              <span className={styles.infoLabel}>Status:</span>
              <span className={styles.badgeSuccess}>PRESENT</span>
            </div>
            <div className={styles.infoRow}>
              <span className={styles.infoLabel}>Method:</span>
              <span className={styles.infoValue}>QR Check-In</span>
            </div>
            <div className={styles.infoRow}>
              <span className={styles.infoLabel}>Recorded Time:</span>
              <span className={styles.infoValue}>{localTime}</span>
            </div>
            {localDate && (
              <div className={styles.infoRow}>
                <span className={styles.infoLabel}>Date:</span>
                <span className={styles.infoValue}>{localDate}</span>
              </div>
            )}
          </div>

          <Link href="/attendance" className={styles.btnPrimary}>
            View My Attendance
          </Link>
          <Link href="/" className={styles.btnSecondary}>
            Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.wrapper}>
      <div className={styles.card}>
        <div className={`${styles.iconWrapper} ${errorMsg ? styles.iconError : styles.iconNeutral}`}>
          {errorMsg ? (
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          ) : (
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="7" />
              <rect x="14" y="3" width="7" height="7" />
              <rect x="14" y="14" width="7" height="7" />
              <rect x="3" y="14" width="7" height="7" />
            </svg>
          )}
        </div>

        <h1 className={styles.title}>Session Check-In</h1>
        <p className={styles.subtitle}>
          In-Person Workshop &amp; Live Training Attendance Verification
        </p>

        {errorMsg && (
          <div className={styles.errorMessage}>
            <strong>Check-In Notice:</strong> {errorMsg}
          </div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleCheckIn(token);
          }}
        >
          <div className={styles.inputGroup}>
            <label htmlFor="token-input" className={styles.label}>
              Check-In Secret Token
            </label>
            <input
              id="token-input"
              type="text"
              className={styles.input}
              placeholder="e.g. 7f9b2c4e8a..."
              value={token}
              onChange={(e) => setToken(e.target.value)}
              disabled={isSubmitting}
              autoFocus={!tokenFromUrl}
            />
          </div>

          <button
            type="submit"
            className={styles.btnPrimary}
            disabled={isSubmitting || !token.trim()}
          >
            {isSubmitting ? (
              <>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ animation: "spin 1s linear infinite" }}>
                  <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                </svg>
                <span>Verifying Check-In...</span>
              </>
            ) : (
              "Confirm Attendance"
            )}
          </button>
        </form>

        <Link href="/" className={styles.btnSecondary}>
          Cancel &amp; Return to Dashboard
        </Link>
      </div>

      <style jsx global>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

export default function SessionCheckInPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const resolvedParams = use(params);
  const sessionId = resolvedParams.sessionId;

  return (
    <Suspense
      fallback={
        <div className={styles.wrapper}>
          <div className={styles.card}>
            <p>Loading check-in page...</p>
          </div>
        </div>
      }
    >
      <CheckInContent sessionId={sessionId} />
    </Suspense>
  );
}
