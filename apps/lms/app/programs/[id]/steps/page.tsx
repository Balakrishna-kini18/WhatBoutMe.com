"use client";

import React, { useEffect, useState, use, useCallback } from "react";
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

const ExamIcon = (
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
    <path d="M9 11l3 3L22 4" />
    <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
  </svg>
);

const CoachingIcon = (
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
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);

const MissionIcon = (
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
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
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

interface ExamConfigSummary {
  id: string;
  programId: string;
  title: string;
  description?: string | null;
  questionCount: number;
  passMark: number;
  timeLimitMin: number;
  maxAttempts: number;
  cooldownHours: number;
  status: string;
}

interface ExamAttemptSummary {
  attemptId: string;
  attemptNumber: number;
  status: "IN_PROGRESS" | "PASSED" | "FAILED";
  score?: number | null;
  passed?: boolean | null;
  attemptsUsed?: number;
  maxAttempts?: number;
  attemptsRemaining?: number;
  isCooldownActive?: boolean;
}

interface CoachingRequestItem {
  id: string;
  enrolmentId: string;
  requestedStart: string;
  requestedEnd: string;
  notes?: string | null;
  status: "PENDING_APPROVAL" | "APPROVED" | "REJECTED" | "CANCELLED" | "EXPIRED";
  decisionReason?: string | null;
  session?: {
    id: string;
    title: string;
    startTime: string;
    endTime: string;
    joinUrl?: string | null;
    status?: string;
  } | null;
  createdAt: string;
}

interface MissionSubmissionItem {
  id: string;
  enrolmentId: string;
  version: number;
  fileUrl: string;
  fileName: string;
  status: "SUBMITTED" | "APPROVED" | "REJECTED";
  feedback?: string | null;
  reviewedAt?: string | null;
  createdAt: string;
}

/**
 * Server-driven curriculum timeline for a program.
 * Renders verified learning steps + Final Examination (50 Marks / 70-Q Shuffled Pool)
 * + 1-on-1 Coaching + Mission Statement + Certificate of Completion in one unified page.
 */
export default function ProgramStepsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();

  const [progression, setProgression] = useState<EnrolmentProgressionResponse | null>(null);
  const [stagesEval, setStagesEval] = useState<any | null>(null);
  const [examConfig, setExamConfig] = useState<ExamConfigSummary | null>(null);
  const [examAttempt, setExamAttempt] = useState<ExamAttemptSummary | null>(null);
  const [coachingRequests, setCoachingRequests] = useState<CoachingRequestItem[]>([]);
  const [missionSubmissions, setMissionSubmissions] = useState<MissionSubmissionItem[]>([]);

  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Inline Interactive Drawers for 1-on-1 Coaching & Mission Statement
  const [showCoachingPanel, setShowCoachingPanel] = useState(false);
  const [preferredDate, setPreferredDate] = useState("");
  const [preferredTime, setPreferredTime] = useState("10:00");
  const [durationMin, setDurationMin] = useState(45);
  const [coachingNotes, setCoachingNotes] = useState("");
  const [submittingCoaching, setSubmittingCoaching] = useState(false);
  const [coachingFeedbackMsg, setCoachingFeedbackMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const [showMissionPanel, setShowMissionPanel] = useState(false);
  const [selectedMissionFile, setSelectedMissionFile] = useState<File | null>(null);
  const [submittingMission, setSubmittingMission] = useState(false);
  const [missionFeedbackMsg, setMissionFeedbackMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

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
        const headers = getAuthHeaders();
        const res = await fetch(`${API_URL}/progression/me/${id}`, { headers });

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

        // Fetch post-curriculum milestone statuses in parallel
        const enrolmentId = data.enrolmentId;
        const [stagesRes, examRes, coachingRes, missionRes] = await Promise.all([
          enrolmentId
            ? fetch(`${API_URL}/progression/enrolments/${enrolmentId}/stages`, { headers }).catch(() => null)
            : Promise.resolve(null),
          fetch(`${API_URL}/programs/${id}/exam`, { headers }).catch(() => null),
          fetch(`${API_URL}/one-on-one/my-requests`, { headers }).catch(() => null),
          fetch(`${API_URL}/mission-statements/my-submissions`, { headers }).catch(() => null),
        ]);

        if (stagesRes && stagesRes.ok) {
          const sData = await stagesRes.json();
          setStagesEval(sData);
        }

        if (examRes && examRes.ok) {
          const eConfig: ExamConfigSummary = await examRes.json();
          setExamConfig(eConfig);
          if (eConfig?.id) {
            const attRes = await fetch(`${API_URL}/exams/${eConfig.id}/attempt`, { headers }).catch(() => null);
            if (attRes && attRes.ok) {
              const attText = await attRes.text();
              if (attText) {
                try {
                  setExamAttempt(JSON.parse(attText));
                } catch {
                  // ignore empty JSON
                }
              }
            }
          }
        }

        if (coachingRes && coachingRes.ok) {
          const cList = await coachingRes.json();
          if (Array.isArray(cList)) {
            setCoachingRequests(
              enrolmentId ? cList.filter((r: any) => !r.enrolmentId || r.enrolmentId === enrolmentId) : cList
            );
          }
        }

        if (missionRes && missionRes.ok) {
          const mList = await missionRes.json();
          if (Array.isArray(mList)) {
            setMissionSubmissions(
              enrolmentId ? mList.filter((m: any) => !m.enrolmentId || m.enrolmentId === enrolmentId) : mList
            );
          }
        }
      } catch (err: any) {
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

  const handleBookCoaching = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!progression?.enrolmentId) return;
    if (!preferredDate || !preferredTime) {
      setCoachingFeedbackMsg({ type: "err", text: "Please select your preferred date and time." });
      return;
    }

    const startDate = new Date(`${preferredDate}T${preferredTime}:00`);
    if (isNaN(startDate.getTime()) || startDate <= new Date()) {
      setCoachingFeedbackMsg({ type: "err", text: "Please choose a future date and time." });
      return;
    }
    const endDate = new Date(startDate.getTime() + durationMin * 60 * 1000);

    setSubmittingCoaching(true);
    setCoachingFeedbackMsg(null);
    try {
      const res = await fetch(`${API_URL}/one-on-one/requests`, {
        method: "POST",
        headers: {
          ...getAuthHeaders(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          enrolmentId: progression.enrolmentId,
          requestedStart: startDate.toISOString(),
          requestedEnd: endDate.toISOString(),
          learnerTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          notes: coachingNotes.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const err = await parseApiError(res, "Could not submit 1-on-1 coaching request");
        throw new Error(err.message);
      }
      const created = await res.json();
      setCoachingRequests((prev) => [created, ...prev]);
      setPreferredDate("");
      setCoachingNotes("");
      setCoachingFeedbackMsg({
        type: "ok",
        text: "1-on-1 Coaching request submitted! You will receive a meeting link once approved.",
      });
    } catch (err: any) {
      setCoachingFeedbackMsg({ type: "err", text: err.message || "Failed to submit coaching request." });
    } finally {
      setSubmittingCoaching(false);
    }
  };

  const handleUploadMissionStatement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!progression?.enrolmentId || !selectedMissionFile) {
      setMissionFeedbackMsg({ type: "err", text: "Please select a PDF, JPG, or PNG file to upload." });
      return;
    }

    setSubmittingMission(true);
    setMissionFeedbackMsg(null);
    try {
      const formData = new FormData();
      formData.append("file", selectedMissionFile);
      formData.append("enrolmentId", progression.enrolmentId);

      const token = getAuthToken();
      const res = await fetch(`${API_URL}/mission-statements/upload`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });

      if (!res.ok) {
        const err = await parseApiError(res, "Failed to upload Mission Statement");
        throw new Error(err.message);
      }

      const uploaded = await res.json();
      setMissionSubmissions((prev) => [uploaded, ...prev]);
      setSelectedMissionFile(null);
      setMissionFeedbackMsg({
        type: "ok",
        text: "Mission Statement uploaded! Our team will review and approve your submission shortly.",
      });
    } catch (err: any) {
      setMissionFeedbackMsg({ type: "err", text: err.message || "Upload failed." });
    } finally {
      setSubmittingMission(false);
    }
  };

  const steps = progression?.steps || [];
  const total = steps.length;
  const done = steps.filter((s) => s.isCompleted).length;
  const percent = progression ? Math.round(progression.overallProgressPercent) : 0;
  const current = steps.find((s) => s.isUnlocked && !s.isCompleted) || steps.find((s) => s.isUnlocked);

  // Post-Curriculum Milestones Evaluation (Strictly Sequential unless Staff Overridden)
  const allStepsCompleted = total > 0 && done === total;

  const stage2State = stagesEval?.stages?.STAGE_2_EXAM;
  const isExamUnlocked = Boolean(allStepsCompleted || stage2State?.isOverridden === true);
  const isExamPassed = Boolean(
    examAttempt?.status === "PASSED" ||
      examAttempt?.passed === true ||
      stage2State?.details?.examPassed === true ||
      stage2State?.isOverridden === true
  );
  const examBestScore = examAttempt?.score ?? stage2State?.details?.examScore ?? null;

  const stage4State = stagesEval?.stages?.STAGE_4_ONE_ON_ONE;
  const isCoachingUnlocked = Boolean(
    (isExamUnlocked && isExamPassed) || stage4State?.isOverridden === true
  );
  const activeCoachingReq = coachingRequests.find(
    (r) => r.status === "PENDING_APPROVAL" || r.status === "APPROVED"
  );
  const isCoachingCompleted = Boolean(
    stage4State?.isOverridden === true ||
      Boolean(stage4State?.details?.completedSessionId) ||
      coachingRequests.some((r) => r.session?.status === "COMPLETED")
  );

  const stage5State = stagesEval?.stages?.STAGE_5_MISSION_STATEMENT;
  const isMissionUnlocked = Boolean(
    (isCoachingUnlocked && isCoachingCompleted) || stage5State?.isOverridden === true
  );
  const latestMission = missionSubmissions[0] || null;
  const isMissionApproved = Boolean(
    stage5State?.isOverridden === true ||
      missionSubmissions.some((m) => m.status === "APPROVED")
  );

  const isCertificateUnlocked = Boolean(
    allStepsCompleted && isExamPassed && isCoachingCompleted && isMissionApproved
  );

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
          {progression?.programTitle ? `${progression.programTitle} — Learning Path` : "Course Learning Path"}
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
          {/* Main Column: Steps + Exam + 1-on-1 Coaching + Mission Statement + Certificate Timeline */}
          <main className={styles.mainCol}>
            <section className={styles.card} aria-labelledby="steps-heading">
              <div className={styles.cardHead}>
                <h2 id="steps-heading" className={styles.cardTitle}>Steps &amp; Certification Milestones</h2>
                {!loading && total > 0 && (
                  <span className={styles.cardMetaBadge}>
                    <span className={styles.cardMetaDot} aria-hidden="true" />
                    {done} of {total} steps completed
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
                  {/* =========================================================
                      1. CURRICULUM MODULES (Step 1 .. Step N)
                      ========================================================= */}
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

                  {/* =========================================================
                      2. SEPARATE FINAL EXAM SECTION (50 Marks · 50 Q Shuffled from 70 Q Pool)
                      ========================================================= */}
                  <li
                    className={`${styles.step} ${
                      isExamPassed
                        ? styles.stepDone
                        : isExamUnlocked
                        ? styles.stepCurrent
                        : styles.stepLocked
                    }`}
                  >
                    <span className={styles.marker} aria-hidden="true">
                      {isExamPassed ? Check : isExamUnlocked ? ExamIcon : Lock}
                    </span>

                    <div className={styles.stepBody}>
                      <p className={styles.kicker}>
                        <span>Final Examination · {examConfig?.questionCount ?? 50} Marks</span>
                        {stage2State?.isOverridden && (
                          <span className={styles.overrideBadge}>Staff Override</span>
                        )}
                        {isExamPassed && (
                          <span className={styles.quizPassedBadge}>
                            ✓ Passed{examBestScore !== null ? ` (${examBestScore}%)` : ""}
                          </span>
                        )}
                      </p>

                      <h3 className={styles.stepTitle}>
                        {examConfig?.title || "Final Comprehensive Examination (50 Marks)"}
                      </h3>

                      <p style={{ margin: "4px 0 0", fontSize: "0.84rem", color: "var(--text-secondary, #4a443d)" }}>
                        <strong>{examConfig?.questionCount ?? 50} Questions ({examConfig?.questionCount ?? 50} Marks)</strong>{" "}
                        randomly shuffled from the 70-question examination pool · Pass Mark:{" "}
                        <strong>{examConfig?.passMark ?? 75}%</strong> · Time Limit:{" "}
                        <strong>{examConfig?.timeLimitMin ?? 90} mins</strong>
                      </p>

                      {!isExamUnlocked && (
                        <div className={styles.lockMessage}>
                          {InfoCircle}
                          <span>Requires completing all {total} curriculum steps</span>
                        </div>
                      )}

                      {isExamUnlocked && !isExamPassed && examAttempt?.status === "FAILED" && (
                        <div className={styles.quizNoteWrap}>
                          <span className={styles.quizRequiredBadge}>
                            Last Score: {examAttempt.score ?? 0}% · {examAttempt.attemptsRemaining ?? 0} attempts remaining
                          </span>
                        </div>
                      )}
                    </div>

                    <div className={styles.stepActionCol}>
                      {isExamPassed ? (
                        <Link href={`/programs/${id}/exam`} className={styles.reviewBtn}>
                          View Result
                        </Link>
                      ) : isExamUnlocked ? (
                        <Link href={`/programs/${id}/exam`} className={styles.startBtn}>
                          {examAttempt?.status === "IN_PROGRESS"
                            ? "Resume Exam"
                            : examAttempt?.status === "FAILED"
                            ? "Retake Exam"
                            : "Start Exam"}
                        </Link>
                      ) : (
                        <span
                          className={styles.lockedPill}
                          title={`Requires completing all ${total} curriculum steps`}
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

                  {/* =========================================================
                      3. 1-ON-1 COACHING SESSION (In-Page Section)
                      ========================================================= */}
                  <li
                    className={`${styles.step} ${
                      isCoachingCompleted
                        ? styles.stepDone
                        : isCoachingUnlocked
                        ? styles.stepCurrent
                        : styles.stepLocked
                    }`}
                  >
                    <span className={styles.marker} aria-hidden="true">
                      {isCoachingCompleted ? Check : isCoachingUnlocked ? CoachingIcon : Lock}
                    </span>

                    <div className={styles.stepBody}>
                      <p className={styles.kicker}>
                        <span>Post-Exam Milestone · 1-on-1 Coaching</span>
                        {stage4State?.isOverridden && (
                          <span className={styles.overrideBadge}>Staff Override</span>
                        )}
                        {isCoachingCompleted ? (
                          <span className={styles.quizPassedBadge}>✓ Session Completed</span>
                        ) : activeCoachingReq?.status === "APPROVED" ? (
                          <span className={styles.quizPassedBadge}>✓ Scheduled</span>
                        ) : activeCoachingReq?.status === "PENDING_APPROVAL" ? (
                          <span className={styles.quizRequiredBadge}>Pending Approval</span>
                        ) : null}
                      </p>

                      <h3 className={styles.stepTitle}>1-on-1 Coaching Session</h3>

                      <p style={{ margin: "4px 0 0", fontSize: "0.84rem", color: "var(--text-secondary, #4a443d)" }}>
                        Dedicated 1-on-1 coaching session with Roweena or your batch trainer to review your breakthroughs and prepare for your Mission Statement.
                      </p>

                      {!isCoachingUnlocked && (
                        <div className={styles.lockMessage}>
                          {InfoCircle}
                          <span>Requires passing the {examConfig?.questionCount ?? 50}-Mark Final Examination</span>
                        </div>
                      )}

                      {/* Inline 1-on-1 Coaching Booking & Status Panel */}
                      {isCoachingUnlocked && showCoachingPanel && (
                        <div
                          style={{
                            marginTop: "0.95rem",
                            padding: "1rem 1.15rem",
                            borderRadius: 12,
                            background: "#faf6f0",
                            border: "1px solid #ece4d7",
                          }}
                        >
                          {activeCoachingReq ? (
                            <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem" }}>
                                <strong style={{ fontSize: "0.9rem", color: "#14110f" }}>
                                  {activeCoachingReq.status === "APPROVED"
                                    ? "Your 1-on-1 Coaching Call is Scheduled"
                                    : "Your Booking Request is Pending Instructor Confirmation"}
                                </strong>
                                <span
                                  style={{
                                    fontSize: "0.75rem",
                                    fontWeight: 700,
                                    padding: "2px 8px",
                                    borderRadius: 6,
                                    background: activeCoachingReq.status === "APPROVED" ? "#dcfce7" : "#fef3c7",
                                    color: activeCoachingReq.status === "APPROVED" ? "#166534" : "#92400e",
                                  }}
                                >
                                  {activeCoachingReq.status.replace("_", " ")}
                                </span>
                              </div>
                              <div style={{ fontSize: "0.84rem", color: "#4a443d" }}>
                                <strong>Slot:</strong>{" "}
                                {new Date(
                                  activeCoachingReq.session?.startTime || activeCoachingReq.requestedStart
                                ).toLocaleString(undefined, {
                                  dateStyle: "medium",
                                  timeStyle: "short",
                                })}
                              </div>
                              {activeCoachingReq.session?.joinUrl && (
                                <div>
                                  <a
                                    href={activeCoachingReq.session.joinUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className={styles.startBtn}
                                    style={{ display: "inline-flex", marginTop: "0.25rem" }}
                                  >
                                    Join 1-on-1 Video Session &rarr;
                                  </a>
                                </div>
                              )}
                            </div>
                          ) : (
                            <form onSubmit={handleBookCoaching} style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                              <div style={{ fontWeight: 700, fontSize: "0.9rem", color: "#14110f" }}>
                                Request Your 1-on-1 Coaching Slot
                              </div>
                              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "0.65rem" }}>
                                <div>
                                  <label style={{ display: "block", fontSize: "0.76rem", fontWeight: 700, marginBottom: 4, color: "#4a443d" }}>
                                    Preferred Date *
                                  </label>
                                  <input
                                    type="date"
                                    required
                                    min={new Date().toISOString().split("T")[0]}
                                    value={preferredDate}
                                    onChange={(e) => setPreferredDate(e.target.value)}
                                    style={{
                                      width: "100%",
                                      padding: "0.48rem 0.65rem",
                                      borderRadius: 8,
                                      border: "1px solid #dcd5cb",
                                      background: "#ffffff",
                                      fontSize: "0.84rem",
                                    }}
                                  />
                                </div>
                                <div>
                                  <label style={{ display: "block", fontSize: "0.76rem", fontWeight: 700, marginBottom: 4, color: "#4a443d" }}>
                                    Preferred Time *
                                  </label>
                                  <input
                                    type="time"
                                    required
                                    value={preferredTime}
                                    onChange={(e) => setPreferredTime(e.target.value)}
                                    style={{
                                      width: "100%",
                                      padding: "0.48rem 0.65rem",
                                      borderRadius: 8,
                                      border: "1px solid #dcd5cb",
                                      background: "#ffffff",
                                      fontSize: "0.84rem",
                                    }}
                                  />
                                </div>
                                <div>
                                  <label style={{ display: "block", fontSize: "0.76rem", fontWeight: 700, marginBottom: 4, color: "#4a443d" }}>
                                    Duration
                                  </label>
                                  <select
                                    value={durationMin}
                                    onChange={(e) => setDurationMin(Number(e.target.value))}
                                    style={{
                                      width: "100%",
                                      padding: "0.48rem 0.65rem",
                                      borderRadius: 8,
                                      border: "1px solid #dcd5cb",
                                      background: "#ffffff",
                                      fontSize: "0.84rem",
                                    }}
                                  >
                                    <option value={30}>30 Minutes</option>
                                    <option value={45}>45 Minutes</option>
                                    <option value={60}>60 Minutes</option>
                                  </select>
                                </div>
                              </div>
                              <div>
                                <label style={{ display: "block", fontSize: "0.76rem", fontWeight: 700, marginBottom: 4, color: "#4a443d" }}>
                                  Key Breakthroughs &amp; Questions for Roweena
                                </label>
                                <textarea
                                  rows={2}
                                  value={coachingNotes}
                                  onChange={(e) => setCoachingNotes(e.target.value)}
                                  placeholder="Share any reflections or questions you'd like to discuss..."
                                  style={{
                                    width: "100%",
                                    padding: "0.5rem 0.65rem",
                                    borderRadius: 8,
                                    border: "1px solid #dcd5cb",
                                    background: "#ffffff",
                                    fontSize: "0.84rem",
                                  }}
                                />
                              </div>
                              {coachingFeedbackMsg && (
                                <div
                                  style={{
                                    fontSize: "0.8rem",
                                    fontWeight: 600,
                                    color: coachingFeedbackMsg.type === "ok" ? "#15803d" : "#b91c1c",
                                  }}
                                >
                                  {coachingFeedbackMsg.text}
                                </div>
                              )}
                              <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
                                <button
                                  type="button"
                                  onClick={() => setShowCoachingPanel(false)}
                                  className={styles.reviewBtn}
                                  style={{ cursor: "pointer" }}
                                >
                                  Close
                                </button>
                                <button
                                  type="submit"
                                  disabled={submittingCoaching}
                                  className={styles.startBtn}
                                  style={{ cursor: "pointer" }}
                                >
                                  {submittingCoaching ? "Submitting..." : "Submit Booking Request"}
                                </button>
                              </div>
                            </form>
                          )}
                        </div>
                      )}
                    </div>

                    <div className={styles.stepActionCol}>
                      {isCoachingUnlocked ? (
                        <button
                          type="button"
                          onClick={() => setShowCoachingPanel((prev) => !prev)}
                          className={isCoachingCompleted ? styles.reviewBtn : styles.startBtn}
                          style={{ cursor: "pointer" }}
                        >
                          {showCoachingPanel
                            ? "Hide Panel"
                            : isCoachingCompleted
                            ? "View Details"
                            : activeCoachingReq
                            ? "Manage Session"
                            : "Book Session"}
                        </button>
                      ) : (
                        <span
                          className={styles.lockedPill}
                          title="Requires passing the Final Examination"
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

                  {/* =========================================================
                      4. MISSION STATEMENT (In-Page Section)
                      ========================================================= */}
                  <li
                    className={`${styles.step} ${
                      isMissionApproved
                        ? styles.stepDone
                        : isMissionUnlocked
                        ? styles.stepCurrent
                        : styles.stepLocked
                    }`}
                  >
                    <span className={styles.marker} aria-hidden="true">
                      {isMissionApproved ? Check : isMissionUnlocked ? MissionIcon : Lock}
                    </span>

                    <div className={styles.stepBody}>
                      <p className={styles.kicker}>
                        <span>Final Requirement · Personal Commitment</span>
                        {stage5State?.isOverridden && (
                          <span className={styles.overrideBadge}>Staff Override</span>
                        )}
                        {isMissionApproved ? (
                          <span className={styles.quizPassedBadge}>✓ Approved</span>
                        ) : latestMission?.status === "SUBMITTED" ? (
                          <span className={styles.quizRequiredBadge}>Pending Review</span>
                        ) : latestMission?.status === "REJECTED" ? (
                          <span className={styles.quizRequiredBadge}>Revision Requested</span>
                        ) : null}
                      </p>

                      <h3 className={styles.stepTitle}>Mission Statement</h3>

                      <p style={{ margin: "4px 0 0", fontSize: "0.84rem", color: "var(--text-secondary, #4a443d)" }}>
                        Upload your handwritten &amp; signed personal Mission Statement (PDF, JPG, or PNG) to complete your transformation journey.
                      </p>

                      {!isMissionUnlocked && (
                        <div className={styles.lockMessage}>
                          {InfoCircle}
                          <span>Requires completing the 1-on-1 Coaching Session</span>
                        </div>
                      )}

                      {/* Inline Mission Statement Upload & History Panel */}
                      {isMissionUnlocked && showMissionPanel && (
                        <div
                          style={{
                            marginTop: "0.95rem",
                            padding: "1rem 1.15rem",
                            borderRadius: 12,
                            background: "#faf6f0",
                            border: "1px solid #ece4d7",
                            display: "flex",
                            flexDirection: "column",
                            gap: "0.85rem",
                          }}
                        >
                          {latestMission && (
                            <div
                              style={{
                                padding: "0.75rem 0.9rem",
                                borderRadius: 10,
                                background: "#ffffff",
                                border: "1px solid #ece4d7",
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                                flexWrap: "wrap",
                                gap: "0.5rem",
                              }}
                            >
                              <div>
                                <div style={{ fontWeight: 700, fontSize: "0.86rem", color: "#14110f" }}>
                                  Version #{latestMission.version} — {latestMission.fileName}
                                </div>
                                {latestMission.feedback && (
                                  <div style={{ fontSize: "0.8rem", color: "#4a443d", marginTop: 2 }}>
                                    <strong>Reviewer Note:</strong> {latestMission.feedback}
                                  </div>
                                )}
                              </div>
                              <a
                                href={latestMission.fileUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={styles.reviewBtn}
                                style={{ padding: "0.35rem 0.75rem", fontSize: "0.78rem" }}
                              >
                                View Uploaded File
                              </a>
                            </div>
                          )}

                          {!isMissionApproved && latestMission?.status !== "SUBMITTED" && (
                            <form onSubmit={handleUploadMissionStatement} style={{ display: "flex", flexDirection: "column", gap: "0.65rem" }}>
                              <label style={{ fontWeight: 700, fontSize: "0.84rem", color: "#14110f" }}>
                                Upload Handwritten Mission Statement (PDF, JPG, PNG — Max 15MB)
                              </label>
                              <input
                                type="file"
                                accept=".pdf,image/jpeg,image/png"
                                onChange={(e) => setSelectedMissionFile(e.target.files?.[0] || null)}
                                style={{
                                  padding: "0.5rem",
                                  borderRadius: 8,
                                  border: "1px dashed #c97a1e",
                                  background: "#ffffff",
                                  fontSize: "0.82rem",
                                }}
                              />
                              {missionFeedbackMsg && (
                                <div
                                  style={{
                                    fontSize: "0.8rem",
                                    fontWeight: 600,
                                    color: missionFeedbackMsg.type === "ok" ? "#15803d" : "#b91c1c",
                                  }}
                                >
                                  {missionFeedbackMsg.text}
                                </div>
                              )}
                              <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
                                <button
                                  type="button"
                                  onClick={() => setShowMissionPanel(false)}
                                  className={styles.reviewBtn}
                                  style={{ cursor: "pointer" }}
                                >
                                  Close
                                </button>
                                <button
                                  type="submit"
                                  disabled={submittingMission || !selectedMissionFile}
                                  className={styles.startBtn}
                                  style={{ cursor: "pointer" }}
                                >
                                  {submittingMission ? "Uploading..." : "Submit Mission Statement"}
                                </button>
                              </div>
                            </form>
                          )}
                        </div>
                      )}
                    </div>

                    <div className={styles.stepActionCol}>
                      {isMissionUnlocked ? (
                        <button
                          type="button"
                          onClick={() => setShowMissionPanel((prev) => !prev)}
                          className={isMissionApproved ? styles.reviewBtn : styles.startBtn}
                          style={{ cursor: "pointer" }}
                        >
                          {showMissionPanel
                            ? "Hide Panel"
                            : isMissionApproved
                            ? "View Approved"
                            : latestMission?.status === "SUBMITTED"
                            ? "View Submission"
                            : "Submit Statement"}
                        </button>
                      ) : (
                        <span
                          className={styles.lockedPill}
                          title="Requires completing the 1-on-1 Coaching Session"
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

                  {/* =========================================================
                      5. FINAL MILESTONE: CERTIFICATE OF COMPLETION
                      ========================================================= */}
                  <li
                    className={`${styles.step} ${
                      isCertificateUnlocked
                        ? styles.stepDone
                        : current && current.sequence === total
                        ? styles.stepCurrent
                        : styles.stepLocked
                    }`}
                    style={{
                      borderLeftColor: isCertificateUnlocked ? "#eab308" : undefined,
                    }}
                  >
                    <span
                      className={styles.marker}
                      style={{
                        background: isCertificateUnlocked ? "linear-gradient(135deg, #eab308, #ca8a04)" : undefined,
                        color: isCertificateUnlocked ? "#ffffff" : undefined,
                        borderColor: isCertificateUnlocked ? "#ca8a04" : undefined,
                      }}
                      aria-hidden="true"
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="8" r="6" />
                        <path d="M15.4 13.8L18 22l-6-3-6 3 2.6-8.2" />
                      </svg>
                    </span>

                    <div className={styles.stepBody}>
                      <p className={styles.kicker} style={{ color: isCertificateUnlocked ? "#854d0e" : undefined }}>
                        Final Milestone
                      </p>
                      <h3 className={styles.stepTitle} style={{ color: isCertificateUnlocked ? "#854d0e" : undefined }}>
                        Certificate of Completion
                      </h3>
                      <p style={{ margin: "4px 0 0", fontSize: "0.85rem", color: "var(--text-muted)" }}>
                        {isCertificateUnlocked
                          ? "✓ All curriculum steps, Final Exam, 1-on-1 Coaching, and Mission Statement completed! Your verified certificate is ready."
                          : `Complete all ${total} steps, the 50-Mark Final Examination, 1-on-1 Coaching, and Mission Statement to unlock your official credential.`}
                      </p>
                    </div>

                    <div className={styles.stepActionCol}>
                      <Link
                        href={`/programs/${id}/certificate`}
                        className={isCertificateUnlocked ? styles.startBtn : styles.reviewBtn}
                        style={{
                          background: isCertificateUnlocked ? "linear-gradient(135deg, #eab308, #ca8a04)" : undefined,
                          borderColor: isCertificateUnlocked ? "#ca8a04" : undefined,
                          color: isCertificateUnlocked ? "#ffffff" : undefined,
                        }}
                      >
                        {isCertificateUnlocked ? "Claim Certificate" : "Check Status"}
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
