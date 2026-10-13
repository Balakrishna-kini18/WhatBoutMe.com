"use client";

import { useEffect, useState, use } from "react";
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

  // SVG Ring calculation: Radius = 50, Circumference = 2 * pi * 50 = ~314.16
  const RING_RADIUS = 50;
  const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;
  const ringOffset = RING_CIRCUMFERENCE * (1 - Math.min(100, Math.max(0, percent)) / 100);

  const isEnrolmentActive = progression?.enrolmentStatus === "ACTIVE";

  return (
    <div className={styles.container}>
      {/* Page Header */}
      <header className={styles.header}>
        <Link href="/" className={styles.backLink}>
          {ArrowLeft}
          <span>Back to Dashboard</span>
        </Link>
        <h1 className={styles.title}>
          {progression?.programTitle ? `${progression.programTitle} — Learning Path` : "Your Learning Path"}
        </h1>
        <p className={styles.subtitle}>
          {progression?.batchName
            ? `Cohort: ${progression.batchName} • Complete each step to advance and unlock your certificate.`
            : "Complete each step to advance and unlock your certificate."}
        </p>
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
            onClick={() => window.location.reload()}
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
                <span className={styles.cardMeta}>
                  {loading ? "" : `${done} of ${total} completed`}
                </span>
              </div>

              {loading ? (
                <p className={styles.emptyState}>Loading your verified learning path from server...</p>
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
                            STEP {step.sequence}
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
                              <span className={styles.stepProgressText}>
                                {step.completedItems ?? 0} of {step.totalItems ?? 0} completed ({step.progressPercent}%)
                              </span>
                            </div>
                          )}

                          {/* Quiz Note */}
                          {!isLocked && step.quiz && (
                            <p className={styles.quizNote}>
                              {step.quiz.isPassed
                                ? `Quiz Passed (${step.quiz.bestScore}%)`
                                : `Includes knowledge check (Pass mark: ${step.quiz.passMark}%)`}
                            </p>
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
                              Locked
                            </span>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}
            </section>
          </main>

          {/* Right Column: Progress Ring, Up Next, and How It Works */}
          <aside className={styles.sideCol} aria-label="Learning Progress and Guidance">
            {/* Progress Card */}
            <section className={`${styles.card} ${styles.progressCard}`} aria-labelledby="progress-heading">
              <div className={styles.cardHead} style={{ justifyContent: "flex-start" }}>
                <h2 id="progress-heading" className={styles.cardTitle}>Progress</h2>
              </div>
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
            </section>

            {/* Up Next Card */}
            <section className={styles.upNextCard} aria-labelledby="upnext-heading">
              <p id="upnext-heading" className={styles.upNextKicker}>UP NEXT</p>
              {current ? (
                <>
                  <h3 className={styles.upNextTitle}>{current.title}</h3>
                  <p className={styles.upNextSub}>Step {current.sequence} of {total}</p>
                  <Link href={`/steps/${current.stepId}`} className={styles.upNextBtn}>
                    {current.isCompleted
                      ? "Review Step"
                      : typeof current.progressPercent === "number" && current.progressPercent > 0
                      ? "Continue Step"
                      : "Start Step"}
                  </Link>
                </>
              ) : done > 0 && done === total ? (
                <>
                  <h3 className={styles.upNextTitle}>Final Certification Examination</h3>
                  <p className={styles.upNextSub}>Comprehensive 50-Question Assessment</p>
                  <Link href={`/programs/${id}/exam`} className={styles.upNextBtn}>
                    Take Final Exam &rarr;
                  </Link>
                </>
              ) : (
                <>
                  <h3 className={styles.upNextTitle}>
                    {loading ? "Loading..." : total === 0 ? "No steps yet" : "All Steps Completed"}
                  </h3>
                  <p className={styles.upNextSub}>
                    {loading
                      ? "Retrieving curriculum..."
                      : total === 0
                      ? "Steps will appear here once added."
                      : "You have completed every step in this course."}
                  </p>
                </>
              )}
            </section>

            {/* How It Works Card */}
            <section className={`${styles.card} ${styles.howItWorksCard}`} aria-labelledby="how-it-works-heading">
              <div className={styles.cardHead} style={{ justifyContent: "flex-start" }}>
                <h2 id="how-it-works-heading" className={styles.cardTitle}>How It Works</h2>
              </div>
              <ul className={styles.notesList}>
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
