"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import dash from "../../../page.module.css";
import styles from "./path.module.css";
import {
  API_URL,
  getAuthHeaders,
  getAuthToken,
  parseApiError,
  type EnrolmentProgressionResponse,
  type StepProgressionItem,
} from "../../../lib/api";

const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

const Check = (
  <svg width="14" height="14" viewBox="0 0 24 24" {...stroke}>
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const Lock = (
  <svg width="14" height="14" viewBox="0 0 24 24" {...stroke}>
    <rect x="4" y="11" width="16" height="10" rx="2" />
    <path d="M8 11V7a4 4 0 0 1 8 0v4" />
  </svg>
);

function formatLockReason(step: StepProgressionItem): string {
  if (step.overrideState === "MANUAL_LOCKED" || step.lockReason === "MANUAL_LOCKED") {
    return step.overrideReason
      ? `Locked by instructor: ${step.overrideReason}`
      : "Locked by instructor";
  }

  if (step.lockReason === "SCHEDULED_DATE_NOT_REACHED" && step.scheduledUnlockDate) {
    const d = new Date(step.scheduledUnlockDate);
    const dateStr = !isNaN(d.getTime())
      ? d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
      : "a future date";
    return `Releases on ${dateStr}`;
  }

  if (step.lockReason === "QUIZ_NOT_PASSED") {
    return `Requires passing the quiz in Step ${step.sequence - 1}`;
  }

  if (step.lockReason === "PREVIOUS_STEP_INCOMPLETE") {
    return `Requires completing Step ${step.sequence - 1}`;
  }

  if (step.lockReason === "ENROLMENT_NOT_ACTIVE") {
    return "Enrolment is inactive. Access requires an active enrolment.";
  }

  return "Complete previous step requirements to unlock";
}

/**
 * Server-driven curriculum timeline for a program (D1-033, D1-034).
 * Completely replaces client-side localStorage progression with GET /progression/me/:programId.
 */
export default function ProgramStepsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();

  const [progression, setProgression] = useState<EnrolmentProgressionResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const token = getAuthToken();
    if (!token) {
      router.push("/login");
      return;
    }

    setLoading(true);
    setErrorMessage(null);

    fetch(`${API_URL}/progression/me/${id}`, {
      headers: getAuthHeaders(),
    })
      .then(async (res) => {
        if (res.status === 401) {
          router.push("/login");
          throw new Error("Unauthorized session. Please log in again.");
        }
        if (!res.ok) {
          const err = await parseApiError(res, "Failed to load learning progression");
          throw new Error(err.message);
        }
        return res.json();
      })
      .then((data: EnrolmentProgressionResponse) => {
        setProgression(data);
      })
      .catch((err: any) => {
        console.error("Progression fetch error:", err);
        setErrorMessage(err.message || "Could not load learning progression.");
      })
      .finally(() => {
        setLoading(false);
      });
  }, [id, router]);

  const steps = progression?.steps || [];
  const total = steps.length;
  const done = steps.filter((s) => s.isCompleted).length;
  const percent = progression ? Math.round(progression.overallProgressPercent) : 0;
  const current = steps.find((s) => s.isUnlocked && !s.isCompleted) || steps.find((s) => s.isUnlocked);
  const RING = 2 * Math.PI * 52;

  const isEnrolmentActive = progression?.enrolmentStatus === "ACTIVE";

  return (
    <div className={dash.dashboard}>
      <header className={dash.pageHeader}>
        <div>
          <Link href="/" className={styles.back}>
            &larr; Back to Dashboard
          </Link>
          <h1 className={dash.pageTitle}>
            {progression?.programTitle ? `${progression.programTitle} — Learning Path` : "Your Learning Path"}
          </h1>
          <p className={dash.pageSubtitle}>
            {progression?.batchName
              ? `Cohort: ${progression.batchName} • Complete each step to advance and unlock your certificate.`
              : "Complete the steps in order to unlock your certificate."}
          </p>
        </div>
      </header>

      {/* ENROLMENT STATUS ALERT (D1-032) */}
      {!loading && progression && !isEnrolmentActive && (
        <div
          className={`${styles.statusBanner} ${
            progression.enrolmentStatus === "REVOKED" || progression.enrolmentStatus === "CANCELLED"
              ? styles.statusBannerDanger
              : styles.statusBannerWarning
          }`}
          role="alert"
        >
          {progression.enrolmentStatus === "PENDING_AGREEMENT" && (
            <>
              <h3 className={styles.statusBannerTitle}>Agreement Required</h3>
              <p className={styles.statusBannerText}>
                Your enrolment in this program requires a signed program agreement before step content unlocks.
              </p>
              <div>
                <Link href={`/agreement?programId=${id}`} className={dash.goldBtn}>
                  Review &amp; Sign Agreement
                </Link>
              </div>
            </>
          )}

          {progression.enrolmentStatus === "PENDING_PAYMENT" && (
            <>
              <h3 className={styles.statusBannerTitle}>Payment Pending Confirmation</h3>
              <p className={styles.statusBannerText}>
                Your enrolment is currently awaiting payment verification. Access to learning modules will unlock once payment has been confirmed.
              </p>
            </>
          )}

          {progression.enrolmentStatus === "WAITLIST" && (
            <>
              <h3 className={styles.statusBannerTitle}>Cohort Waitlisted</h3>
              <p className={styles.statusBannerText}>
                You are on the waitlist for {progression.batchName}. You will be notified and given immediate access when a seat becomes available.
              </p>
            </>
          )}

          {progression.enrolmentStatus === "REVOKED" && (
            <>
              <h3 className={styles.statusBannerTitle}>Access Revoked</h3>
              <p className={styles.statusBannerText}>
                Access to this program has been revoked. Please contact administration for assistance.
              </p>
            </>
          )}

          {progression.enrolmentStatus === "CANCELLED" && (
            <>
              <h3 className={styles.statusBannerTitle}>Enrolment Cancelled</h3>
              <p className={styles.statusBannerText}>
                This enrolment has been cancelled. Browse our catalogue if you wish to re-enrol.
              </p>
            </>
          )}
        </div>
      )}

      {/* ERROR STATE */}
      {errorMessage && (
        <div className={styles.errorCard} role="alert">
          <h2>Could not load curriculum</h2>
          <p style={{ color: "var(--text-secondary)", margin: "0.5rem 0 1.5rem" }}>{errorMessage}</p>
          <button
            type="button"
            className={dash.darkBtn}
            onClick={() => window.location.reload()}
          >
            Retry Loading
          </button>
        </div>
      )}

      {!errorMessage && (
        <div className={dash.board}>
          <div className={dash.boardMain}>
            <section className={`${dash.panel} ${dash.grow}`}>
              <div className={dash.panelHead}>
                <h2>Steps</h2>
                <span className={styles.count}>
                  {loading ? "" : `${done} of ${total} completed`}
                </span>
              </div>

              {loading ? (
                <p className={dash.empty}>Loading your verified learning path from server...</p>
              ) : total === 0 ? (
                <p className={dash.empty}>The curriculum for this course is being built. Check back soon.</p>
              ) : (
                <ol className={styles.timeline}>
                  {steps.map((step) => {
                    const isDone = step.isCompleted;
                    const isCurrent = step.isUnlocked && !step.isCompleted;
                    const isLocked = !step.isUnlocked;
                    const isOverride = step.overrideState === "MANUAL_UNLOCKED";

                    const state = isDone ? styles.done : isCurrent ? styles.current : styles.locked;

                    return (
                      <li key={step.stepId} className={`${styles.step} ${state}`}>
                        <span className={styles.marker}>
                          {isDone ? Check : isCurrent ? step.sequence : Lock}
                        </span>

                        <div className={styles.stepBody}>
                          <p className={styles.kicker}>
                            Step {step.sequence}
                            {isOverride && (
                              <span className={styles.overrideBadge} title={step.overrideReason || "Unlocked by instructor"}>
                                Staff Override
                              </span>
                            )}
                          </p>
                          <h3>{step.title}</h3>

                          {/* Reason or Status Messaging */}
                          {isLocked && (
                            <div className={styles.lockMessage}>
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                <circle cx="12" cy="12" r="10" />
                                <line x1="12" y1="8" x2="12" y2="12" />
                                <line x1="12" y1="16" x2="12.01" y2="16" />
                              </svg>
                              <span>{formatLockReason(step)}</span>
                            </div>
                          )}

                          {!isLocked && step.quiz && (
                            <p className={dash.muted} style={{ fontSize: "0.8rem", margin: "0.2rem 0 0" }}>
                              {step.quiz.isPassed
                                ? `Quiz Passed (${step.quiz.bestScore}%)`
                                : `Includes knowledge check (Pass mark: ${step.quiz.passMark}%)`}
                            </p>
                          )}
                        </div>

                        {/* Interactive Action Controls */}
                        {isCurrent ? (
                          <Link href={`/steps/${step.stepId}`} className={dash.darkBtn}>
                            Start Step
                          </Link>
                        ) : isDone ? (
                          <Link href={`/steps/${step.stepId}`} className={dash.secondaryBtn}>
                            Review
                          </Link>
                        ) : (
                          <span className={`${dash.pill} ${dash.pillOff}`} title={formatLockReason(step)}>
                            Locked
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ol>
              )}
            </section>
          </div>

          <aside className={dash.boardSide}>
            <section className={dash.panel}>
              <div className={dash.panelHead}>
                <h2>Progress</h2>
              </div>
              <div className={dash.ringWrap}>
                <svg
                  width="132"
                  height="132"
                  viewBox="0 0 120 120"
                  role="img"
                  aria-label={`${percent}% complete`}
                >
                  <circle cx="60" cy="60" r="52" fill="none" stroke="var(--border-light)" strokeWidth="10" />
                  <circle
                    cx="60"
                    cy="60"
                    r="52"
                    fill="none"
                    stroke="var(--accent-secondary)"
                    strokeWidth="10"
                    strokeLinecap="round"
                    strokeDasharray={RING}
                    strokeDashoffset={RING * (1 - percent / 100)}
                    transform="rotate(-90 60 60)"
                  />
                  <text
                    x="60"
                    y="67"
                    textAnchor="middle"
                    fontSize="24"
                    fontWeight="800"
                    fill="var(--text-primary)"
                  >
                    {percent}%
                  </text>
                </svg>
                <p className={dash.muted}>{done} of {total} steps completed</p>
              </div>
            </section>

            <section className={`${dash.panel} ${dash.nextPanel}`}>
              <p className={dash.kicker}>Up Next</p>
              {current ? (
                <>
                  <h3>{current.title}</h3>
                  <p>Step {current.sequence} of {total}</p>
                  <Link href={`/steps/${current.stepId}`} className={dash.goldBtn}>
                    {current.isCompleted ? "Review Step" : "Start Step"}
                  </Link>
                </>
              ) : (
                <p>
                  {loading
                    ? "Loading..."
                    : total === 0
                    ? "Steps will appear here once added."
                    : "You have completed every step."}
                </p>
              )}
            </section>

            <section className={`${dash.panel} ${dash.grow}`}>
              <div className={dash.panelHead}>
                <h2>How It Works</h2>
              </div>
              <ul className={styles.notes}>
                <li>Steps unlock sequentially based on completion and cohort schedule.</li>
                <li>Each step closes with a knowledge-check quiz.</li>
                <li>Staff overrides and cohort schedules update automatically.</li>
                <li>You can review completed steps at any time.</li>
              </ul>
            </section>
          </aside>
        </div>
      )}
    </div>
  );
}
