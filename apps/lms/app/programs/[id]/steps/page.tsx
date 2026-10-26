"use client";

import { useEffect, useState, use, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import styles from "./path.module.css";
import {
  API_URL,
  getAuthHeaders,
  getAuthToken,
  parseApiError,
  type EnrolmentProgressionResponse,
  type StepProgressionItem,
} from "../../../lib/api";

const Check = (
  <svg
    width="15"
    height="15"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="3"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const Lock = (
  <svg
    width="15"
    height="15"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <rect x="4" y="11" width="16" height="10" rx="2" />
    <path d="M8 11V7a4 4 0 0 1 8 0v4" />
  </svg>
);

const ArrowLeft = (
  <svg
    width="15"
    height="15"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <line x1="19" y1="12" x2="5" y2="12" />
    <polyline points="12 19 5 12 12 5" />
  </svg>
);

const InfoCircle = (
  <svg
    width="13"
    height="13"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="16" x2="12" y2="12" />
    <line x1="12" y1="8" x2="12.01" y2="8" />
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

  if (step.lockReason === "AGREEMENT_REQUIRED") {
    return "Requires signing the Program Agreement before unlocking";
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
 * Server-driven curriculum timeline for a program.
 * Renders verified learning steps with timeline connectors, progress ring, and up-next guidance.
 */
export default function ProgramStepsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();

  const [progression, setProgression] = useState<EnrolmentProgressionResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadProgression = useCallback(
    async (isRetry = false) => {
      const token = getAuthToken();
      if (!token) {
        router.push("/login");
        return;
      }

      setLoading(true);
      setErrorMessage(null);

      try {
        const res = await fetch(`${API_URL}/progression/me/${id}`, {
          headers: getAuthHeaders(),
        });

        if (res.status === 401) {
          router.push("/login");
          throw new Error("Unauthorized session. Please log in again.");
        }

        if (!res.ok) {
          const err = await parseApiError(res, "Failed to load learning progression");
          throw new Error(err.message);
        }

        const data: EnrolmentProgressionResponse = await res.json();
        setProgression(data);
      } catch (err: any) {
        // Auto-retry once on transient network/fetch failure
        if (!isRetry && (err.name === "TypeError" || err.message?.includes("fetch"))) {
          setTimeout(() => {
            loadProgression(true);
          }, 600);
          return;
        }
        console.error("Progression fetch error:", err);
        setErrorMessage(err.message || "Could not load learning progression.");
      } finally {
        setLoading(false);
      }
    },
    [id, router]
  );

  useEffect(() => {
    loadProgression();
  }, [loadProgression]);

  const steps = progression?.steps || [];
  const total = steps.length;
  const done = steps.filter((s) => s.isCompleted).length;
  const percent = progression ? Math.round(progression.overallProgressPercent) : 0;
  const current = steps.find((s) => s.isUnlocked && !s.isCompleted) || steps.find((s) => s.isUnlocked);

  // SVG Ring calculation: Radius = 50, Circumference = 2 * pi * 50 = ~314.16
  const RING_RADIUS = 50;
  const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;
  const ringOffset = RING_CIRCUMFERENCE * (1 - Math.min(100, Math.max(0, percent)) / 100);

  const isEnrolmentActive = progression?.enrolmentStatus === "ACTIVE";

  return (
    <div className={styles.container}>
      {/* Page Header */}
      <header className={styles.header}>
        <Link href="/" className={styles.backLink} title="Back">
          <span className={styles.backIconWrap}>{ArrowLeft}</span>
          <span className={styles.backText}>Back</span>
        </Link>
        <span className={styles.headerDivider} aria-hidden="true" />
        <h1 className={styles.title}>
          {progression?.programTitle ? `${progression.programTitle} — Learning Path` : "Sigma 1 — Learning Path"}
        </h1>
      </header>

      {/* ENROLMENT STATUS ALERT (When Inactive / Pending) */}
      {!loading && progression && !isEnrolmentActive && (
        <div
          className={`${styles.statusBanner} ${
            progression.enrolmentStatus === "REVOKED" || progression.enrolmentStatus === "CANCELLED"
              ? styles.statusBannerDanger
              : styles.statusBannerWarning
          }`}
          role="alert"
        >
          {(progression.enrolmentStatus === "PENDING_AGREEMENT" ||
            progression.steps?.some((s) => s.lockReason === "AGREEMENT_REQUIRED")) && (
            <>
              <h3 className={styles.statusBannerTitle}>Agreement Required</h3>
              <p className={styles.statusBannerText}>
                Your enrolment in this program requires a signed program agreement before step content unlocks.
              </p>
              <div>
                <Link
                  href={`/agreement?programId=${id}${progression.enrolmentId ? `&enrolmentId=${progression.enrolmentId}` : ""}`}
                  className={styles.agreementBtn}
                >
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
              <div>
                <Link
                  href={`/checkout?programId=${id}${progression.enrolmentId ? `&enrolmentId=${progression.enrolmentId}` : ""}`}
                  className={styles.agreementBtn}
                >
                  Complete Payment &amp; Unlock Step 1 &rarr;
                </Link>
              </div>
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
            className={styles.retryBtn}
            onClick={() => loadProgression()}
          >
            Retry Loading
          </button>
        </div>
      )}

      {!errorMessage && (
        <div className={styles.layoutGrid}>
          {/* Main Column: Steps Timeline */}
          <main className={styles.mainCol}>
            <section className={styles.card} aria-labelledby="steps-heading">
              <div className={styles.cardHead}>
                <h2 id="steps-heading" className={styles.cardTitle}>Steps</h2>
                {!loading && total > 0 && (
                  <span className={styles.cardMetaBadge}>
                    <span className={styles.cardMetaDot} aria-hidden="true" />
                    {done} of {total} completed
                  </span>
                )}
              </div>

              {loading ? (
                <ol className={styles.timeline} aria-hidden="true">
                  {[1, 2, 3, 4, 5, 6].map((idx) => (
                    <li key={idx} className={styles.step} style={{ opacity: 1 }}>
                      <div
                        className="skeleton"
                        style={{ width: 36, height: 36, borderRadius: "50%", flexShrink: 0 }}
                      />
                      <div className={styles.stepBody}>
                        <div
                          className="skeleton"
                          style={{ width: 52, height: 12, marginBottom: 8, borderRadius: 4 }}
                        />
                        <div
                          className="skeleton"
                          style={{
                            width: idx % 2 === 0 ? "55%" : "42%",
                            height: 18,
                            marginBottom: 8,
                            borderRadius: 5,
                          }}
                        />
                        <div
                          className="skeleton"
                          style={{
                            width: idx % 2 === 0 ? "75%" : "65%",
                            height: 13,
                            borderRadius: 4,
                          }}
                        />
                      </div>
                      <div className={styles.stepActionCol}>
                        <div
                          className="skeleton"
                          style={{ width: 92, height: 34, borderRadius: 8, flexShrink: 0 }}
                        />
                      </div>
                    </li>
                  ))}
                </ol>
              ) : total === 0 ? (
                <p className={styles.emptyState}>The curriculum for this course is being built. Check back soon.</p>
              ) : (
                <ol className={styles.timeline}>
                  {steps.map((step) => {
                    const isDone = step.isCompleted;
                    const isCurrent = step.isUnlocked && !step.isCompleted;
                    const isLocked = !step.isUnlocked;
                    const isOverride = step.overrideState === "MANUAL_UNLOCKED";

                    const stateClass = isDone
                      ? styles.stepDone
                      : isCurrent
                      ? styles.stepCurrent
                      : styles.stepLocked;

                    const hasPartialProgress =
                      !isLocked && !isDone && typeof step.progressPercent === "number" && step.progressPercent > 0;

                    return (
                      <li key={step.stepId} className={`${styles.step} ${stateClass}`}>
                        {/* Step Marker */}
                        <span className={styles.marker} aria-hidden="true">
                          {isDone ? Check : isCurrent ? step.sequence : Lock}
                        </span>

                        {/* Step Details */}
                        <div className={styles.stepBody}>
                          <p className={styles.kicker}>
                            Step {step.sequence}
                            {isOverride && (
                              <span
                                className={styles.overrideBadge}
                                title={step.overrideReason || "Unlocked by instructor"}
                              >
                                Staff Override
                              </span>
                            )}
                          </p>

                          <h3 className={styles.stepTitle}>{step.title}</h3>

                          {/* Lock reason message if locked */}
                          {isLocked && (
                            <div className={styles.lockMessage}>
                              {InfoCircle}
                              <span>{formatLockReason(step)}</span>
                            </div>
                          )}

                          {/* Progress bar inside in-progress step */}
                          {!isLocked && !isDone && typeof step.progressPercent === "number" && (
                            <div className={styles.stepProgressBarWrap}>
                              <div className={styles.stepProgressBarTrack}>
                                <div
                                  className={styles.stepProgressBarFill}
                                  style={{ width: `${Math.min(100, Math.max(0, step.progressPercent))}%` }}
                                />
                              </div>
                              <div className={styles.stepProgressMetaRow}>
                                <span className={styles.stepProgressText}>
                                  {step.completedItems ?? 0} of {step.totalItems ?? 0} completed
                                </span>
                                <span className={styles.stepProgressPercentText}>
                                  {step.progressPercent}%
                                </span>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Action Buttons */}
                        <div className={styles.stepActionCol}>
                          {isCurrent ? (
                            <Link href={`/steps/${step.stepId}`} className={styles.startBtn}>
                              {hasPartialProgress ? "Continue Step" : "Start Step"}
                            </Link>
                          ) : isDone ? (
                            <Link href={`/steps/${step.stepId}`} className={styles.reviewBtn}>
                              Review
                            </Link>
                          ) : (
                            <span
                              className={styles.lockedPill}
                              title={formatLockReason(step)}
                              aria-disabled="true"
                            >
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ opacity: 0.7 }}>
                                <rect x="4" y="11" width="16" height="10" rx="2" />
                                <path d="M8 11V7a4 4 0 0 1 8 0v4" />
                              </svg>
                              Locked
                            </span>
                          )}
                        </div>
                      </li>
                    );
                  })}

                  {/* Final Milestone: Certificate of Completion (Apna College Flow) */}
                  <li
                    className={`${styles.step} ${
                      percent >= 100
                        ? styles.stepDone
                        : current && current.sequence === total
                        ? styles.stepCurrent
                        : styles.stepLocked
                    }`}
                    style={{
                      borderLeftColor: percent >= 100 ? "#eab308" : undefined,
                    }}
                  >
                    <span
                      className={styles.marker}
                      style={{
                        background: percent >= 100 ? "linear-gradient(135deg, #eab308, #ca8a04)" : undefined,
                        color: percent >= 100 ? "#ffffff" : undefined,
                        borderColor: percent >= 100 ? "#ca8a04" : undefined,
                      }}
                      aria-hidden="true"
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="8" r="6" />
                        <path d="M15.4 13.8L18 22l-6-3-6 3 2.6-8.2" />
                      </svg>
                    </span>

                    <div className={styles.stepBody}>
                      <p className={styles.kicker} style={{ color: percent >= 100 ? "#854d0e" : undefined }}>
                        Final Milestone
                      </p>
                      <h3 className={styles.stepTitle} style={{ color: percent >= 100 ? "#854d0e" : undefined }}>
                        Certificate of Completion
                      </h3>
                      <p style={{ margin: "4px 0 0", fontSize: "0.85rem", color: "var(--text-muted)" }}>
                        {percent >= 100
                          ? "✓ All activities completed! Your verified certificate is ready to view and download."
                          : `Complete all ${total} steps and knowledge checks to unlock your official credential.`}
                      </p>
                    </div>

                    <div className={styles.stepActionCol}>
                      <Link
                        href={`/programs/${id}/certificate`}
                        className={percent >= 100 ? styles.startBtn : styles.reviewBtn}
                        style={{
                          background: percent >= 100 ? "linear-gradient(135deg, #eab308, #ca8a04)" : undefined,
                          borderColor: percent >= 100 ? "#ca8a04" : undefined,
                          color: percent >= 100 ? "#ffffff" : undefined,
                        }}
                      >
                        {percent >= 100 ? "Claim Certificate" : "Check Status"}
                      </Link>
                    </div>
                  </li>
                </ol>
              )}
            </section>
          </main>

          {/* Right Column: Progress Ring */}
          <aside className={styles.sideCol} aria-label="Learning Progress">
            {/* Progress Card */}
            <section className={`${styles.card} ${styles.progressCard}`} aria-labelledby="progress-heading">
              <div className={styles.cardHead} style={{ justifyContent: "flex-start" }}>
                <h2 id="progress-heading" className={styles.cardTitle}>Progress</h2>
              </div>
              {loading ? (
                <div className={styles.ringWrap} style={{ padding: "16px 0" }} aria-hidden="true">
                  <div
                    className="skeleton"
                    style={{ width: 120, height: 120, borderRadius: "50%", margin: "0 auto 14px" }}
                  />
                  <div
                    className="skeleton"
                    style={{ width: 110, height: 14, borderRadius: 4, margin: "0 auto" }}
                  />
                </div>
              ) : (
                <div className={styles.ringWrap}>
                  <svg
                    className={styles.ringSvg}
                    width="128"
                    height="128"
                    viewBox="0 0 120 120"
                    role="img"
                    aria-label={`${percent}% overall course completion`}
                  >
                    <circle
                      className={styles.ringTrack}
                      cx="60"
                      cy="60"
                      r={RING_RADIUS}
                      fill="none"
                      strokeWidth="9"
                    />
                    <circle
                      className={styles.ringProgress}
                      cx="60"
                      cy="60"
                      r={RING_RADIUS}
                      fill="none"
                      strokeWidth="9"
                      strokeLinecap="round"
                      strokeDasharray={RING_CIRCUMFERENCE}
                      strokeDashoffset={ringOffset}
                      transform="rotate(-90 60 60)"
                    />
                    <text
                      className={styles.ringValue}
                      x="60"
                      y="67"
                      textAnchor="middle"
                    >
                      {percent}%
                    </text>
                  </svg>
                  <p className={styles.progressCount}>
                    {done} of {total} steps completed
                  </p>
                </div>
              )}
            </section>
          </aside>
        </div>
      )}
    </div>
  );
}
