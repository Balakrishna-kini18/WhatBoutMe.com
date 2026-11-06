"use client";

import React, { useEffect, useState, use, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import styles from "./path.module.css";
import {
  computeUnifiedJourneyProgress,
  COACHING_TIME_SLOTS,
  getUpcomingCoachingDateCards,
  formatLocalIsoDate,
  isCoachingSlotInFuture,
  formatCoachingSlotSummary,
  buildCoachingRequestPayload,
} from "./learningPathLogic";
import {
  API_URL,
  cachedFetch,
  invalidateCache,
  getAuthHeaders,
  getAuthToken,
  parseApiError,
  type EnrolmentProgressionResponse,
  type StepProgressionItem,
} from "../../../lib/api";
import { sanitizeExternalUrl } from "../../../lib/auth-redirect";

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

function getMilestoneGlyph(id: string) {
  if (id === "exam") {
    return (
      <svg
        width="13"
        height="13"
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
  }
  if (id === "coaching") {
    return (
      <svg
        width="13"
        height="13"
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
  }
  if (id === "mission") {
    return (
      <svg
        width="13"
        height="13"
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
  }
  // curriculum modules
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  );
}

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
    return "Step 1 will unlock once you are assigned to a batch. Currently on waitlist.";
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
  learnerTimezone?: string | null;
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
    hostTrainer?: { id: string; name?: string | null; email?: string | null } | null;
  } | null;
  enrolment?: {
    id: string;
    programId?: string;
    program?: { id: string; title: string } | null;
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
  const [claimedCertificate, setClaimedCertificate] = useState<any | null>(null);

  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Inline Interactive Drawers for 1-on-1 Coaching & Mission Statement
  const [showCoachingPanel, setShowCoachingPanel] = useState(false);
  const [preferredDate, setPreferredDate] = useState(
    () => getUpcomingCoachingDateCards()[0]?.isoDate || ""
  );
  const [preferredTime, setPreferredTime] = useState("10:00");
  const [coachingNotes, setCoachingNotes] = useState("");
  const [submittingCoaching, setSubmittingCoaching] = useState(false);
  const [cancellingCoaching, setCancellingCoaching] = useState(false);
  const [coachingFeedbackMsg, setCoachingFeedbackMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [showRescheduleForm, setShowRescheduleForm] = useState(false);
  const [showReapplyForm, setShowReapplyForm] = useState(false);

  const [showMissionPanel, setShowMissionPanel] = useState(false);
  const [showMissionReplaceForm, setShowMissionReplaceForm] = useState(false);
  const [selectedMissionFile, setSelectedMissionFile] = useState<File | null>(null);
  const [submittingMission, setSubmittingMission] = useState(false);
  const [missionFeedbackMsg, setMissionFeedbackMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [showWelcomeBackBanner, setShowWelcomeBackBanner] = useState(false);

  const loadProgression = useCallback(
    async (isRetry = false) => {
      const token = getAuthToken();
      if (!token) {
        router.push(`/login?portal=${encodeURIComponent(`/programs/${id}/steps`)}`);
        return;
      }

      setErrorMessage(null);

      try {
        const headers = getAuthHeaders();

        // 1. Fetch unified progression endpoint first to avoid firing multiple redundant queries
        const res = await cachedFetch(`${API_URL}/progression/me/${id}`, {
          headers,
          ttlMs: 15_000,
          skipCache: isRetry,
        });

        if (res.status === 401) {
          router.push(`/login?portal=${encodeURIComponent(`/programs/${id}/steps`)}`);
          throw new Error("Unauthorized session. Please log in again.");
        }

        if (!res.ok) {
          const err = await parseApiError(res, "Failed to load learning progression");
          throw new Error(err.message);
        }

        const data: EnrolmentProgressionResponse = await res.json();
        const enrolmentId = data.enrolmentId;

        // Extract unified milestone data provided directly by the server
        let resolvedStages: any = data.stages || null;
        let resolvedExamConfig: ExamConfigSummary | null = (data.examConfig as any) || null;
        let resolvedAttempt: ExamAttemptSummary | null = (data.examAttempt as any) || null;
        let resolvedCoaching: CoachingRequestItem[] = Array.isArray(data.coachingRequests)
          ? data.coachingRequests
          : [];
        let resolvedMissions: MissionSubmissionItem[] = Array.isArray(data.missionSubmissions)
          ? data.missionSubmissions
          : [];
        let resolvedCertificate: any = data.certificate || null;

        // Secondary fallback queries only for fields not yet included in the response
        const fallbackTasks: Promise<any>[] = [];

        if (!resolvedStages && enrolmentId) {
          fallbackTasks.push(
            cachedFetch(`${API_URL}/progression/enrolments/${enrolmentId}/stages`, {
              headers,
              ttlMs: 15_000,
              skipCache: isRetry,
            })
              .then((r) => (r && r.ok ? r.json() : null))
              .then((s) => {
                if (s) resolvedStages = s;
              })
              .catch(() => null)
          );
        }

        if (!resolvedExamConfig) {
          fallbackTasks.push(
            cachedFetch(`${API_URL}/programs/${id}/exam`, {
              headers,
              ttlMs: 30_000,
              skipCache: isRetry,
            })
              .then(async (er) => {
                if (er && er.ok) {
                  const conf = await er.json().catch(() => null);
                  if (conf) {
                    resolvedExamConfig = conf;
                    if (conf.id && !resolvedAttempt) {
                      return cachedFetch(`${API_URL}/exams/${conf.id}/attempt`, {
                        headers,
                        ttlMs: 15_000,
                        skipCache: isRetry,
                      })
                        .then((ar) => (ar && ar.ok ? ar.json() : null))
                        .then((att) => {
                          if (att) resolvedAttempt = att;
                        })
                        .catch(() => null);
                    }
                  }
                }
              })
              .catch(() => null)
          );
        } else if (resolvedExamConfig?.id && !resolvedAttempt) {
          fallbackTasks.push(
            cachedFetch(`${API_URL}/exams/${resolvedExamConfig.id}/attempt`, {
              headers,
              ttlMs: 15_000,
              skipCache: isRetry,
            })
              .then((ar) => (ar && ar.ok ? ar.json() : null))
              .then((att) => {
                if (att) resolvedAttempt = att;
              })
              .catch(() => null)
          );
        }

        if (resolvedCoaching.length === 0) {
          fallbackTasks.push(
            cachedFetch(`${API_URL}/one-on-one/my-requests`, {
              headers,
              ttlMs: 15_000,
              skipCache: isRetry,
            })
              .then((cr) => (cr && cr.ok ? cr.json() : []))
              .then((cList) => {
                if (Array.isArray(cList) && cList.length > 0) {
                  resolvedCoaching = enrolmentId
                    ? cList.filter(
                        (r: any) =>
                          r.enrolmentId === enrolmentId ||
                          r.enrolment?.id === enrolmentId ||
                          r.enrolment?.programId === id ||
                          r.enrolment?.program?.id === id
                      )
                    : cList;
                }
              })
              .catch(() => null)
          );
        }

        if (resolvedMissions.length === 0) {
          fallbackTasks.push(
            cachedFetch(`${API_URL}/mission-statements/my-submissions`, {
              headers,
              ttlMs: 15_000,
              skipCache: isRetry,
            })
              .then((mr) => (mr && mr.ok ? mr.json() : []))
              .then((mList) => {
                if (Array.isArray(mList) && mList.length > 0) {
                  resolvedMissions = enrolmentId
                    ? mList.filter((m: any) => m.enrolmentId === enrolmentId)
                    : mList;
                }
              })
              .catch(() => null)
          );
        }

        if (!resolvedCertificate) {
          fallbackTasks.push(
            cachedFetch(`${API_URL}/certificates/mine`, {
              headers,
              ttlMs: 15_000,
              skipCache: isRetry,
            })
              .then((cr) => (cr && cr.ok ? cr.json() : []))
              .then((cList) => {
                if (Array.isArray(cList) && cList.length > 0) {
                  const match = cList.find(
                    (c: any) =>
                      (enrolmentId && c.enrolmentId === enrolmentId) ||
                      c.programId === id ||
                      c.enrolment?.programId === id ||
                      c.enrolment?.id === enrolmentId
                  );
                  if (match) resolvedCertificate = match;
                }
              })
              .catch(() => null)
          );
        }

        if (fallbackTasks.length > 0) {
          await Promise.all(fallbackTasks);
        }

        // Atomically commit all unified learning journey states together before lifting loading
        setProgression(data);
        if (resolvedStages) setStagesEval(resolvedStages);
        if (resolvedExamConfig) setExamConfig(resolvedExamConfig);
        if (resolvedAttempt) setExamAttempt(resolvedAttempt);
        setCoachingRequests(resolvedCoaching);
        setMissionSubmissions(resolvedMissions);
        if (resolvedCertificate) setClaimedCertificate(resolvedCertificate);
        setLoading(false);
      } catch (err: any) {
        if (!isRetry && (err.name === "TypeError" || err.message?.includes("fetch"))) {
          setTimeout(() => {
            loadProgression(true);
          }, 600);
          return;
        }
        console.error("Progression fetch error:", err);
        setErrorMessage(err.message || "Could not load learning progression.");
        setLoading(false);
      }
    },
    [id, router]
  );

  useEffect(() => {
    let isWelcomeBack = false;
    if (typeof window !== "undefined") {
      try {
        const url = new URL(window.location.href);
        if (url.searchParams.get("welcomeBack") === "1" || url.searchParams.get("welcomeBack") === "true") {
          isWelcomeBack = true;
          setShowWelcomeBackBanner(true);
          invalidateCache("/progression");
          invalidateCache("/exams");
          invalidateCache("/stages");
          invalidateCache("/certificates");
          url.searchParams.delete("welcomeBack");
          window.history.replaceState({}, "", url.pathname + url.search);
        }
      } catch {
        // ignore
      }
    }
    loadProgression(isWelcomeBack);
  }, [loadProgression]);

  const handleBookCoaching = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submittingCoaching) return;

    const built = buildCoachingRequestPayload({
      enrolmentId: progression?.enrolmentId,
      preferredDate,
      preferredTime,
      notes: coachingNotes,
      reschedule: showRescheduleForm,
    });

    if (!built.ok) {
      setCoachingFeedbackMsg({ type: "err", text: built.error });
      return;
    }

    setSubmittingCoaching(true);
    setCoachingFeedbackMsg(null);
    try {
      const res = await fetch(`${API_URL}/one-on-one/requests`, {
        method: "POST",
        headers: {
          ...getAuthHeaders(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify(built.payload),
      });
      if (!res.ok) {
        const err = await parseApiError(res, "Could not submit 1-on-1 coaching request");
        throw new Error(err.message);
      }
      const created = await res.json();
      invalidateCache("/one-on-one");
      invalidateCache("/progression");
      setCoachingRequests((prev) => [created, ...prev.filter((r) => r.id !== created.id)]);
      setCoachingNotes("");
      setShowRescheduleForm(false);
      setShowReapplyForm(false);
      setCoachingFeedbackMsg({
        type: "ok",
        text: "1-on-1 Coaching request submitted! You will receive a meeting link once approved.",
      });
      await loadProgression(true);
    } catch (err: any) {
      const errMsg = err?.message || "Failed to submit coaching request.";
      const isConflict =
        errMsg.toLowerCase().includes("already pending review") ||
        errMsg.toLowerCase().includes("conflict");

      if (isConflict) {
        invalidateCache("/one-on-one");
        let foundExisting = false;
        try {
          const freshRes = await cachedFetch(
            `${API_URL}/one-on-one/my-requests${progression?.enrolmentId ? `?enrolmentId=${progression.enrolmentId}` : ""}`,
            { headers: getAuthHeaders(), skipCache: true }
          );
          if (freshRes.ok) {
            const freshList = await freshRes.json();
            if (Array.isArray(freshList) && freshList.length > 0) {
              const matched = progression?.enrolmentId
                ? freshList.filter(
                    (r: any) =>
                      r.enrolmentId === progression.enrolmentId ||
                      r.enrolment?.id === progression.enrolmentId ||
                      r.enrolment?.programId === id ||
                      r.enrolment?.program?.id === id
                  )
                : freshList;
              if (matched.length > 0) {
                setCoachingRequests(matched);
                foundExisting = true;
              }
            }
          }
        } catch {
          // ignore background re-fetch failure
        }

        if (!foundExisting) {
          const tz = typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "UTC";
          const reqStart = `${preferredDate}T${preferredTime}:00`;
          const reqEnd = new Date(new Date(reqStart).getTime() + 45 * 60000).toISOString();
          setCoachingRequests((prev) => [
            {
              id: `pending-${Date.now()}`,
              enrolmentId: progression?.enrolmentId || "",
              status: "PENDING_APPROVAL",
              requestedStart: reqStart,
              requestedEnd: reqEnd,
              learnerTimezone: tz,
              notes: coachingNotes,
              createdAt: new Date().toISOString(),
            },
            ...prev,
          ]);
        }

        setShowRescheduleForm(false);
        setShowReapplyForm(false);
        setCoachingFeedbackMsg({
          type: "err",
          text: "A 1-on-1 coaching call request is already pending review for this enrolment. Showing your current request below.",
        });
        await loadProgression(true);
      } else {
        setCoachingFeedbackMsg({ type: "err", text: errMsg });
      }
    } finally {
      setSubmittingCoaching(false);
    }
  };

  const handleCancelCoaching = async (requestId: string) => {
    if (
      !confirm(
        "Are you sure you want to cancel this coaching session request? You will be able to select a new date and time."
      )
    ) {
      return;
    }
    setCancellingCoaching(true);
    try {
      const res = await fetch(`${API_URL}/one-on-one/requests/${requestId}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
      });
      if (!res.ok) {
        const err = await parseApiError(res, "Failed to cancel coaching request");
        throw new Error(err.message);
      }
      invalidateCache("/one-on-one");
      invalidateCache("/progression");
      setCoachingRequests((prev) => prev.filter((r) => r.id !== requestId));
      setShowRescheduleForm(false);
      setShowReapplyForm(false);
      setCoachingFeedbackMsg({
        type: "ok",
        text: "Coaching session request cancelled. You can now choose a new slot whenever ready.",
      });
      await loadProgression(true);
    } catch (err: any) {
      setCoachingFeedbackMsg({
        type: "err",
        text: err?.message || "Failed to cancel coaching request.",
      });
    } finally {
      setCancellingCoaching(false);
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
      invalidateCache("/mission-statements");
      invalidateCache("/progression");
      setMissionSubmissions((prev) => [uploaded, ...prev]);
      setSelectedMissionFile(null);
      setShowMissionReplaceForm(false);
      setMissionFeedbackMsg({
        type: "ok",
        text: "Mission Statement uploaded! Our team will review and approve your submission shortly.",
      });
      await loadProgression(true);
    } catch (err: any) {
      setMissionFeedbackMsg({ type: "err", text: err.message || "Upload failed." });
    } finally {
      setSubmittingMission(false);
    }
  };

  const steps = progression?.steps || [];
  const total = steps.length;
  const done = steps.filter((s) => s.isCompleted).length;

  // Robust calculation of curriculum progress with fallbacks for partial-step items & edge cases
  const calculatedItemsTotal = steps.reduce(
    (sum, s) => sum + (s.totalItems ?? (s.lessons?.length || 0) + (s.quiz ? 1 : 0)),
    0
  );
  const calculatedItemsDone = steps.reduce(
    (sum, s) =>
      sum +
      (s.completedItems ??
        (s.lessons?.filter((l) => l.isCompleted).length || 0) + (s.quiz?.isPassed ? 1 : 0)),
    0
  );

  const rawPercent =
    typeof progression?.overallProgressPercent === "number" && progression.overallProgressPercent > 0
      ? progression.overallProgressPercent
      : typeof (progression as any)?.overallPercent === "number" && (progression as any).overallPercent > 0
      ? (progression as any).overallPercent
      : typeof progression?.totalItems === "number" &&
        progression.totalItems > 0 &&
        typeof progression.completedItems === "number" &&
        progression.completedItems > 0
      ? Math.floor((progression.completedItems / progression.totalItems) * 100)
      : calculatedItemsTotal > 0 && calculatedItemsDone > 0
      ? Math.floor((calculatedItemsDone / calculatedItemsTotal) * 100)
      : typeof progression?.overallProgressPercent === "number"
      ? progression.overallProgressPercent
      : total > 0
      ? Math.round((done / total) * 100)
      : 0;

  const percent = Math.max(0, Math.min(100, Math.round(rawPercent || 0)));
  const current = steps.find((s) => s.isUnlocked && !s.isCompleted) || steps.find((s) => s.isUnlocked);

  // Post-Curriculum Milestones Evaluation (Strictly Sequential unless Staff Overridden)
  const allStepsCompleted = total > 0 && done === total;

  const stage2State = stagesEval?.stages?.STAGE_2_EXAM;
  const stage3State = stagesEval?.stages?.STAGE_3_ATTENDANCE;
  const stage3Details = (stage3State?.details || stage2State?.details || {}) as any;

  const isExamPassed = Boolean(
    examAttempt?.status === "PASSED" ||
      examAttempt?.passed === true ||
      stage2State?.details?.examPassed === true ||
      stage2State?.isOverridden === true
  );
  const examBestScore = examAttempt?.score ?? stage2State?.details?.examScore ?? null;

  const isAttendanceRequired = stage3Details?.attendanceRequired !== false;
  const attendanceThreshold = Number(
    stage3Details?.thresholdPercent ?? stage3Details?.attendanceThreshold ?? 80
  );
  const attendedLiveSessions = Number(stage3Details?.attendedSessions ?? 0);
  const requiredLiveSessions = Number(stage3Details?.requiredSessions ?? 0);
  const liveAttendancePercent =
    requiredLiveSessions === 0
      ? 0
      : Math.round(Number(stage3Details?.attendancePercentage ?? 0));

  const isAttendanceMetForExam = Boolean(
    !isAttendanceRequired ||
      stage2State?.isOverridden === true ||
      stage3State?.isOverridden === true ||
      isExamPassed ||
      examAttempt?.status === "IN_PROGRESS" ||
      stage3Details?.attendanceMetForExam === true ||
      (requiredLiveSessions > 0 &&
        (stage3Details?.complianceStatus === "COMPLIANT" ||
          liveAttendancePercent >= attendanceThreshold))
  );

  const isAttendanceSatisfied = Boolean(
    !isAttendanceRequired ||
      stage3State?.isOverridden === true ||
      isAttendanceMetForExam ||
      (isExamPassed &&
        (stage3State?.isCompleted ||
          stage3Details?.complianceStatus === "COMPLIANT" ||
          stage3Details?.complianceStatus === "NOT_APPLICABLE"))
  );

  const isExamUnlocked = Boolean(
    (allStepsCompleted && isAttendanceMetForExam) ||
      stage2State?.isOverridden === true ||
      isExamPassed
  );

  const stage4State = stagesEval?.stages?.STAGE_4_ONE_ON_ONE;
  const stage4Details = stage4State?.details as any;
  const isCoachingRequired = stage4Details?.isRequired !== false;
  const isCoachingUnlocked = Boolean(
    stage4State?.isUnlocked ||
    stage4State?.isOverridden === true ||
    (isExamUnlocked && isExamPassed && isAttendanceSatisfied)
  );
  const coachingRequestsSorted = [...coachingRequests].sort(
    (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
  );
  const activeCoachingReq = coachingRequestsSorted.find(
    (r) => r.status === "PENDING_APPROVAL" || r.status === "APPROVED"
  );
  const latestCoachingReq = coachingRequestsSorted[0] || null;
  const isLatestRejected = !activeCoachingReq && latestCoachingReq?.status === "REJECTED";

  // Ground-truth session attendance or explicit staff audit override
  const hasRealCompletedCoaching = Boolean(
    (stage4Details?.completedSessionId && stage4Details?.isAttended) ||
    stage4Details?.isGenuinelyCompleted === true ||
    coachingRequests.some((r) => r.session?.status === "COMPLETED" || (r as any).status === "COMPLETED")
  );
  const isCoachingCompleted = Boolean(
    stage4State?.isOverridden === true ||
    (isCoachingUnlocked && hasRealCompletedCoaching)
  );
  const isCoachingRequirementMet =
    !isCoachingRequired || isCoachingCompleted || stage4State?.isOverridden === true;

  const stage5State = stagesEval?.stages?.STAGE_5_MISSION_STATEMENT;
  const stage5Details = stage5State?.details as any;
  const isMissionRequired = stage5Details?.isRequired !== false;
  const isMissionUnlocked = Boolean(
    stage5State?.isUnlocked ||
    stage5State?.isOverridden === true ||
    (isCoachingUnlocked && isCoachingRequirementMet)
  );
  const latestMission = missionSubmissions[0] || null;

  // Ground-truth approved submission or explicit staff audit override
  const hasRealApprovedMission = Boolean(
    stage5Details?.isGenuinelyCompleted === true ||
    missionSubmissions.some((m) => m.status === "APPROVED")
  );
  const isMissionApproved = Boolean(
    stage5State?.isOverridden === true ||
    (isMissionUnlocked && hasRealApprovedMission)
  );
  const isMissionRequirementMet =
    !isMissionRequired || isMissionApproved || stage5State?.isOverridden === true;

  const cert = claimedCertificate || progression?.certificate || null;
  const isCertificateClaimed = Boolean(
    cert && (cert.status === "ISSUED" || cert.status === "APPROVED" || cert.certificateCode || cert.id)
  );
  const certificateCode = cert?.certificateCode || cert?.certificateNumber || null;

  const isCertificateUnlocked = Boolean(
    isCertificateClaimed ||
    (allStepsCompleted &&
      isExamPassed &&
      isAttendanceSatisfied &&
      isCoachingRequirementMet &&
      isMissionRequirementMet)
  );

  const journeyProgress = computeUnifiedJourneyProgress({
    totalSteps: total,
    completedSteps: done,
    examPassed: isExamPassed,
    examScore: examBestScore,
    attendanceRequired: isAttendanceRequired,
    attendanceMetForExam: isAttendanceMetForExam,
    attendancePercentage: liveAttendancePercent,
    attendanceThreshold: attendanceThreshold,
    coachingCompleted: isCoachingCompleted,
    coachingStatus: activeCoachingReq?.status ?? latestCoachingReq?.status ?? null,
    coachingRequired: isCoachingRequired,
    missionApproved: isMissionApproved,
    missionStatus: latestMission?.status ?? null,
    missionRequired: isMissionRequired,
    curriculumPercent: percent,
  });

  const displayPercent = percent;

  // SVG Ring calculation: Radius = 50, Circumference = 2 * pi * 50 = ~314.16
  const RING_RADIUS = 50;
  const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;
  const ringOffset = RING_CIRCUMFERENCE * (1 - Math.min(100, Math.max(0, displayPercent)) / 100);

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
              <h3 className={styles.statusBannerTitle}>Batch Assignment Pending</h3>
              <p className={styles.statusBannerText}>
                Step 1 will unlock once you are assigned to a batch. You are currently on the waitlist for the next upcoming batch.
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

      {showWelcomeBackBanner && (
        <div
          role="status"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "12px",
            padding: "14px 18px",
            marginBottom: "18px",
            borderRadius: "12px",
            background: "rgba(31, 122, 76, 0.08)",
            border: "1px solid rgba(31, 122, 76, 0.25)",
            color: "#155736",
            fontSize: "0.92rem",
            fontWeight: 500,
          }}
        >
          <span>
            <strong>Welcome back!</strong> You are already enrolled in this program — continue from where you left off.
          </span>
          <button
            type="button"
            onClick={() => setShowWelcomeBackBanner(false)}
            aria-label="Dismiss welcome message"
            style={{
              background: "transparent",
              border: "none",
              color: "#155736",
              cursor: "pointer",
              fontWeight: 700,
              fontSize: "0.85rem",
              padding: "4px 8px",
            }}
          >
            Dismiss
          </button>
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
                    {journeyProgress.summaryLabel}
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
                          style={{ width: 140, height: 38, borderRadius: 8, flexShrink: 0 }}
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
                      {(stage2State?.isOverridden || isExamPassed) && (
                        <p className={styles.kicker}>
                          {stage2State?.isOverridden && (
                            <span className={styles.overrideBadge}>Staff Override</span>
                          )}
                          {isExamPassed && (
                            <span className={styles.quizPassedBadge}>
                              ✓ Passed{examBestScore !== null ? ` (${examBestScore}%)` : ""}
                            </span>
                          )}
                        </p>
                      )}

                      <h3 className={styles.stepTitle}>
                        <strong>Final Examination{examConfig?.questionCount ? ` · ${examConfig.questionCount} Questions` : ""}</strong>
                      </h3>

                      <p style={{ margin: "4px 0 0", fontSize: "0.84rem", color: "var(--text-secondary, #4a443d)" }}>
                        {isExamPassed
                          ? `Passed with ${examBestScore !== null ? `${examBestScore}%` : "success"}. Examination completed.`
                          : `${examConfig?.questionCount ? `${examConfig.questionCount} Questions · ` : ""}Pass Mark: ${examConfig?.passMark ?? 80}% · Time Limit: ${examConfig?.timeLimitMin ?? 90} mins${isAttendanceRequired ? ` · Required Batch Attendance: ${attendanceThreshold}%` : ""}`}
                      </p>

                      {isAttendanceRequired && !isExamPassed && (
                        <div
                          style={{
                            marginTop: "8px",
                            display: "inline-flex",
                            alignItems: "center",
                            flexWrap: "wrap",
                            gap: "8px",
                            padding: "5px 10px",
                            borderRadius: "8px",
                            fontSize: "0.78rem",
                            fontWeight: 600,
                            background: isAttendanceMetForExam
                              ? "rgba(22, 163, 74, 0.1)"
                              : "rgba(217, 119, 6, 0.12)",
                            color: isAttendanceMetForExam ? "#15803d" : "#b45309",
                            border: isAttendanceMetForExam
                              ? "1px solid rgba(22, 163, 74, 0.25)"
                              : "1px solid rgba(217, 119, 6, 0.3)",
                          }}
                        >
                          <span>
                            {isAttendanceMetForExam ? "✓" : "⚠️"} Live Attendance
                            {progression?.batchName ? ` (${progression.batchName})` : ""}:{" "}
                            <strong>{liveAttendancePercent}%</strong> ({attendedLiveSessions}/{requiredLiveSessions} live sessions) • Required: <strong>{attendanceThreshold}%</strong>
                          </span>
                          <Link
                            href="/attendance"
                            style={{
                              color: "inherit",
                              textDecoration: "underline",
                              fontWeight: 700,
                              marginLeft: "4px",
                            }}
                          >
                            View Attendance →
                          </Link>
                        </div>
                      )}

                      {!isExamUnlocked && (
                        <div className={styles.lockMessage}>
                          {InfoCircle}
                          <span>
                            {!allStepsCompleted
                              ? `Requires completing all ${total} curriculum steps${
                                  isAttendanceRequired
                                    ? ` and at least ${attendanceThreshold}% live session attendance`
                                    : ""
                                }`
                              : requiredLiveSessions === 0
                              ? `Requires at least ${attendanceThreshold}% live session attendance in ${
                                  progression?.batchName || "your batch"
                                } to unlock the Final Exam. No live sessions have been conducted yet (Current: 0% / Required: ${attendanceThreshold}%).`
                              : `Requires at least ${attendanceThreshold}% live session attendance in ${
                                  progression?.batchName || "your batch"
                                } to unlock the Final Exam. Your current attendance is ${liveAttendancePercent}% (${attendedLiveSessions} of ${requiredLiveSessions} live sessions attended).`}
                          </span>
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
                          title={
                            !allStepsCompleted
                              ? `Requires completing all ${total} curriculum steps`
                              : `Requires ${attendanceThreshold}% live session attendance (Current: ${liveAttendancePercent}%)`
                          }
                          aria-disabled="true"
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ opacity: 0.7 }}>
                            <rect x="4" y="11" width="16" height="10" rx="2" />
                            <path d="M8 11V7a4 4 0 0 1 8 0v4" />
                          </svg>
                          {allStepsCompleted && !isAttendanceMetForExam
                            ? `Locked (<${attendanceThreshold}% Attendance)`
                            : "Locked"}
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
                      {(stage4State?.isOverridden || isCoachingCompleted || activeCoachingReq || !isCoachingRequired) && (
                        <p className={styles.kicker}>
                          {stage4State?.isOverridden && (
                            <span className={styles.overrideBadge}>Staff Override</span>
                          )}
                          {isCoachingCompleted ? (
                            <span className={styles.quizPassedBadge}>✓ Session Completed</span>
                          ) : activeCoachingReq?.status === "APPROVED" ? (
                            <span className={styles.quizPassedBadge}>✓ Scheduled</span>
                          ) : activeCoachingReq?.status === "PENDING_APPROVAL" ? (
                            <span className={styles.quizRequiredBadge}>Pending Approval</span>
                          ) : isLatestRejected ? (
                            <span
                              className={styles.quizRequiredBadge}
                              style={{ background: "#fee2e2", color: "#991b1b", borderColor: "#fca5a5" }}
                            >
                              Declined · Reapply Available
                            </span>
                          ) : !isCoachingRequired ? (
                            <span
                              className={styles.quizRequiredBadge}
                              style={{ background: "#f3f4f6", color: "#4b5563", borderColor: "#e5e7eb" }}
                            >
                              Optional Milestone
                            </span>
                          ) : null}
                        </p>
                      )}

                      <h3 className={styles.stepTitle}>Book 1-on-1 Call</h3>

                      <p style={{ margin: "4px 0 0", fontSize: "0.84rem", color: "var(--text-secondary, #4a443d)" }}>
                        {isCoachingCompleted
                          ? "Coaching session completed with your trainer."
                          : activeCoachingReq?.status === "APPROVED"
                          ? "Session scheduled. Join at your confirmed time."
                          : activeCoachingReq?.status === "PENDING_APPROVAL"
                          ? "Booking request submitted. Awaiting confirmation."
                          : "1-on-1 coaching session with your trainer."}
                      </p>

                      {!isCoachingUnlocked && (
                        <div className={styles.lockMessage}>
                          {InfoCircle}
                          <span>
                            {stage4State?.unmetPrerequisites?.[0] ||
                              stage4State?.unmetRequirements?.[0] ||
                              "Requires completing previous milestones (Curriculum, Exam & Live Attendance)"}
                          </span>
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
                          {isCoachingCompleted ? (
                            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem" }}>
                                <strong style={{ fontSize: "0.98rem", color: "#166534" }}>
                                  ✓ 1-on-1 Coaching Session Completed!
                                </strong>
                                <span
                                  style={{
                                    fontSize: "0.75rem",
                                    fontWeight: 700,
                                    padding: "3px 8px",
                                    borderRadius: 6,
                                    background: "#dcfce7",
                                    color: "#166534",
                                    border: "1px solid #86efac",
                                  }}
                                >
                                  COMPLETED
                                </span>
                              </div>
                              <div style={{ fontSize: "0.85rem", color: "#166534", lineHeight: 1.5, background: "#f0fdf4", border: "1px solid #bbf7d0", padding: "0.75rem 0.95rem", borderRadius: 8 }}>
                                Coaching session completed. Mission Statement is now unlocked.
                              </div>
                            </div>
                          ) : activeCoachingReq && !showRescheduleForm ? (
                            <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
                              <div
                                style={{
                                  display: "flex",
                                  justifyContent: "space-between",
                                  alignItems: "center",
                                  flexWrap: "wrap",
                                  gap: "0.5rem",
                                  paddingBottom: "0.45rem",
                                  borderBottom: "1px solid #e7dfd3",
                                }}
                              >
                                <div>
                                  <div
                                    style={{
                                      fontSize: "0.74rem",
                                      fontWeight: 700,
                                      textTransform: "uppercase",
                                      letterSpacing: "0.05em",
                                      color: activeCoachingReq.status === "APPROVED" ? "#166534" : "#92400e",
                                    }}
                                  >
                                    {activeCoachingReq.status === "APPROVED" ? "Confirmed Milestone" : "Stage 4 Milestone"}
                                  </div>
                                  <strong style={{ fontSize: "1.02rem", color: "#14110f", fontWeight: 800 }}>
                                    {activeCoachingReq.status === "APPROVED"
                                      ? "Your 1-on-1 Coaching Session is Scheduled"
                                      : "Your 1-on-1 Coaching Request is Under Review"}
                                  </strong>
                                </div>
                                <span
                                  style={{
                                    fontSize: "0.76rem",
                                    fontWeight: 700,
                                    padding: "3px 9px",
                                    borderRadius: 6,
                                    background: activeCoachingReq.status === "APPROVED" ? "#dcfce7" : "#fef3c7",
                                    color: activeCoachingReq.status === "APPROVED" ? "#166534" : "#92400e",
                                    border: `1px solid ${activeCoachingReq.status === "APPROVED" ? "#86efac" : "#fde68a"}`,
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: "0.3rem",
                                  }}
                                >
                                  {activeCoachingReq.status === "APPROVED" ? (
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                      <polyline points="20 6 9 17 4 12" />
                                    </svg>
                                  ) : (
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                      <circle cx="12" cy="12" r="10" />
                                      <polyline points="12 6 12 12 16 14" />
                                    </svg>
                                  )}
                                  <span>{activeCoachingReq.status.replace("_", " ")}</span>
                                </span>
                              </div>

                              <div
                                style={{
                                  background: activeCoachingReq.status === "APPROVED" ? "#f0fdf4" : "#ffffff",
                                  border: `1px solid ${activeCoachingReq.status === "APPROVED" ? "#bbf7d0" : "#e6ded2"}`,
                                  borderRadius: 10,
                                  padding: "0.85rem 1rem",
                                  display: "flex",
                                  flexDirection: "column",
                                  gap: "0.5rem",
                                }}
                              >
                                <div style={{ fontSize: "0.86rem", color: "#14110f" }}>
                                  <strong style={{ color: "#7c7267", fontWeight: 600 }}>
                                    {activeCoachingReq.status === "APPROVED" ? "Confirmed Slot:" : "Requested Slot:"}
                                  </strong>{" "}
                                  <span style={{ fontWeight: 700 }}>
                                    {new Date(
                                      activeCoachingReq.session?.startTime || activeCoachingReq.requestedStart
                                    ).toLocaleString(undefined, {
                                      dateStyle: "full",
                                      timeStyle: "short",
                                    })}
                                  </span>
                                  {activeCoachingReq.learnerTimezone && (
                                    <span style={{ fontSize: "0.76rem", color: "#6c6359", marginLeft: "0.35rem" }}>
                                      ({activeCoachingReq.learnerTimezone})
                                    </span>
                                  )}
                                </div>

                                {activeCoachingReq.session?.hostTrainer?.name && (
                                  <div style={{ fontSize: "0.84rem", color: "#14110f" }}>
                                    <strong style={{ color: "#7c7267", fontWeight: 600 }}>Coach:</strong>{" "}
                                    <span style={{ fontWeight: 600 }}>{activeCoachingReq.session.hostTrainer.name}</span>
                                  </div>
                                )}

                                {activeCoachingReq.notes && (
                                  <div
                                    style={{
                                      fontSize: "0.83rem",
                                      color: "#4a443d",
                                      background: "#faf6f0",
                                      padding: "0.55rem 0.75rem",
                                      borderRadius: 8,
                                      border: "1px solid #ede5d8",
                                    }}
                                  >
                                    <div
                                      style={{
                                        fontSize: "0.72rem",
                                        fontWeight: 700,
                                        color: "#7c7267",
                                        textTransform: "uppercase",
                                        marginBottom: "0.2rem",
                                      }}
                                    >
                                      Your Reflections &amp; Questions:
                                    </div>
                                    <div style={{ fontStyle: "italic", color: "#2d2823", lineHeight: 1.45 }}>
                                      &ldquo;{activeCoachingReq.notes}&rdquo;
                                    </div>
                                  </div>
                                )}

                                {activeCoachingReq.status === "PENDING_APPROVAL" && (
                                  <div
                                    style={{
                                      fontSize: "0.82rem",
                                      color: "#78350f",
                                      lineHeight: 1.45,
                                      background: "#fffbeb",
                                      padding: "0.55rem 0.75rem",
                                      borderRadius: 8,
                                      border: "1px solid #fef3c7",
                                    }}
                                  >
                                    Roweena and our coaching team are reviewing your requested slot against availability. You will receive an email once approved with your Zoom invite.
                                  </div>
                                )}

                                {activeCoachingReq.status === "APPROVED" && (
                                  <div style={{ fontSize: "0.82rem", color: "#166534", lineHeight: 1.45 }}>
                                    Tip: Please join 5 minutes early with your camera and microphone tested.
                                  </div>
                                )}
                              </div>

                              {/* Alert when requested slot has already passed while pending */}
                              {activeCoachingReq.status === "PENDING_APPROVAL" &&
                                new Date(activeCoachingReq.requestedStart).getTime() < Date.now() && (
                                  <div
                                    style={{
                                      marginTop: "0.35rem",
                                      padding: "0.75rem 0.95rem",
                                      borderRadius: 8,
                                      background: "#fffbeb",
                                      border: "1px solid #fde68a",
                                      color: "#92400e",
                                      fontSize: "0.83rem",
                                      display: "flex",
                                      flexDirection: "column",
                                      gap: "0.45rem",
                                    }}
                                  >
                                    <div style={{ fontWeight: 700, display: "flex", alignItems: "center", gap: "0.35rem" }}>
                                      <span>⚠️ Requested Slot Has Elapsed</span>
                                    </div>
                                    <div style={{ lineHeight: 1.45, color: "#78350f" }}>
                                      The slot you selected has already passed without confirmation. Because past sessions cannot be accepted, please pick a new upcoming date and time.
                                    </div>
                                    <div style={{ marginTop: "0.15rem" }}>
                                      <button
                                        type="button"
                                        onClick={() => setShowRescheduleForm(true)}
                                        className={styles.startBtn}
                                        style={{
                                          display: "inline-flex",
                                          alignItems: "center",
                                          gap: "0.35rem",
                                          padding: "0.45rem 0.9rem",
                                          fontSize: "0.82rem",
                                        }}
                                      >
                                        Pick a New Upcoming Slot &rarr;
                                      </button>
                                    </div>
                                  </div>
                                )}

                              {/* Actions */}
                              {sanitizeExternalUrl(activeCoachingReq.session?.joinUrl) ? (
                                <div>
                                  <a
                                    href={sanitizeExternalUrl(activeCoachingReq.session!.joinUrl)!}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className={styles.startBtn}
                                    style={{ display: "inline-flex", marginTop: "0.25rem", padding: "0.55rem 1.1rem" }}
                                  >
                                    Join 1-on-1 Video Session &rarr;
                                  </a>
                                </div>
                              ) : activeCoachingReq.status === "PENDING_APPROVAL" &&
                                new Date(activeCoachingReq.requestedStart).getTime() >= Date.now() ? (
                                <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", flexWrap: "wrap", marginTop: "0.25rem" }}>
                                  <button
                                    type="button"
                                    onClick={() => handleCancelCoaching(activeCoachingReq.id)}
                                    disabled={cancellingCoaching}
                                    style={{
                                      padding: "0.45rem 0.9rem",
                                      borderRadius: 8,
                                      border: "1px solid #fca5a5",
                                      background: "#ffffff",
                                      color: "#b91c1c",
                                      fontSize: "0.8rem",
                                      fontWeight: 600,
                                      cursor: cancellingCoaching ? "not-allowed" : "pointer",
                                      transition: "all 0.15s ease",
                                    }}
                                  >
                                    {cancellingCoaching ? "Cancelling..." : "✕ Cancel Request"}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (
                                        confirm(
                                          "To choose a new slot, we will cancel your current pending request first. Would you like to proceed?"
                                        )
                                      ) {
                                        handleCancelCoaching(activeCoachingReq.id);
                                      }
                                    }}
                                    disabled={cancellingCoaching}
                                    style={{
                                      padding: "0.45rem 0.9rem",
                                      borderRadius: 8,
                                      border: "1px solid #dcd5cb",
                                      background: "#faf6f0",
                                      color: "#14110f",
                                      fontSize: "0.8rem",
                                      fontWeight: 600,
                                      cursor: cancellingCoaching ? "not-allowed" : "pointer",
                                      transition: "all 0.15s ease",
                                    }}
                                  >
                                    Change Slot / Reschedule
                                  </button>
                                </div>
                              ) : null}

                              {coachingFeedbackMsg && (
                                <div
                                  role="alert"
                                  style={{
                                    fontSize: "0.82rem",
                                    fontWeight: 600,
                                    padding: "0.55rem 0.75rem",
                                    borderRadius: 8,
                                    background: coachingFeedbackMsg.type === "ok" ? "#ecfdf5" : "#fef2f2",
                                    border: coachingFeedbackMsg.type === "ok" ? "1px solid #a7f3d0" : "1px solid #fecaca",
                                    color: coachingFeedbackMsg.type === "ok" ? "#15803d" : "#b91c1c",
                                  }}
                                >
                                  {coachingFeedbackMsg.text}
                                </div>
                              )}
                            </div>
                          ) : isLatestRejected && !showReapplyForm ? (
                            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem" }}>
                                <strong style={{ fontSize: "0.92rem", color: "#991b1b" }}>
                                  Your Previous Coaching Request Was Declined
                                </strong>
                                <span
                                  style={{
                                    fontSize: "0.75rem",
                                    fontWeight: 700,
                                    padding: "2px 8px",
                                    borderRadius: 6,
                                    background: "#fee2e2",
                                    color: "#991b1b",
                                    border: "1px solid #fca5a5",
                                  }}
                                >
                                  DECLINED
                                </span>
                              </div>

                              <div style={{ fontSize: "0.84rem", color: "#4a443d" }}>
                                <strong>Previous Requested Slot:</strong>{" "}
                                {new Date(latestCoachingReq.requestedStart).toLocaleString(undefined, {
                                  dateStyle: "medium",
                                  timeStyle: "short",
                                })}
                              </div>

                              <div
                                style={{
                                  padding: "0.75rem 0.95rem",
                                  borderRadius: 8,
                                  background: "#fff1f2",
                                  border: "1px solid #fecdd3",
                                  color: "#9f1239",
                                  fontSize: "0.83rem",
                                  display: "flex",
                                  flexDirection: "column",
                                  gap: "0.35rem",
                                }}
                              >
                                <div style={{ fontWeight: 700 }}>Note from Instructor:</div>
                                <div style={{ fontStyle: "italic", color: "#881337" }}>
                                  &ldquo;{latestCoachingReq.decisionReason || "Instructor is unavailable during this time slot. Please choose another date or time."}&rdquo;
                                </div>
                              </div>

                              <p style={{ margin: 0, fontSize: "0.82rem", color: "#6c6359", lineHeight: 1.4 }}>
                                You are eligible to choose another upcoming slot and reapply immediately so your session can be scheduled.
                              </p>

                              <div style={{ marginTop: "0.2rem" }}>
                                <button
                                  type="button"
                                  onClick={() => setShowReapplyForm(true)}
                                  className={styles.startBtn}
                                  style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: "0.4rem",
                                    padding: "0.5rem 1rem",
                                    fontSize: "0.84rem",
                                  }}
                                >
                                  Choose a New Slot &amp; Reapply &rarr;
                                </button>
                              </div>
                            </div>
                          ) : (
                            <form
                              onSubmit={handleBookCoaching}
                              style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
                            >
                              {showRescheduleForm && (
                                <div
                                  style={{
                                    display: "flex",
                                    justifyContent: "space-between",
                                    alignItems: "center",
                                    padding: "0.5rem 0.75rem",
                                    borderRadius: 8,
                                    background: "#fef3c7",
                                    border: "1px solid #fde68a",
                                  }}
                                >
                                  <span style={{ fontSize: "0.82rem", fontWeight: 700, color: "#92400e" }}>
                                    Select a New Upcoming Slot for Your Coaching Session
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => setShowRescheduleForm(false)}
                                    style={{
                                      background: "#ffffff",
                                      border: "1px solid #d97706",
                                      borderRadius: 6,
                                      padding: "3px 8px",
                                      fontSize: "0.75rem",
                                      fontWeight: 600,
                                      color: "#92400e",
                                      cursor: "pointer",
                                    }}
                                  >
                                    ✕ Cancel
                                  </button>
                                </div>
                              )}

                              {showReapplyForm && isLatestRejected && (
                                <div
                                  style={{
                                    display: "flex",
                                    justifyContent: "space-between",
                                    alignItems: "center",
                                    padding: "0.55rem 0.8rem",
                                    borderRadius: 8,
                                    background: "#fff1f2",
                                    border: "1px solid #fecdd3",
                                  }}
                                >
                                  <div>
                                    <div style={{ fontSize: "0.83rem", fontWeight: 700, color: "#9f1239" }}>
                                      Reapplying for 1-on-1 Coaching
                                    </div>
                                    <div style={{ fontSize: "0.75rem", color: "#be123c", marginTop: 1 }}>
                                      Pick an alternative date &amp; time slot. Your new request will be submitted directly to your instructor.
                                    </div>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => setShowReapplyForm(false)}
                                    style={{
                                      background: "#ffffff",
                                      border: "1px solid #fda4af",
                                      borderRadius: 6,
                                      padding: "3px 8px",
                                      fontSize: "0.75rem",
                                      fontWeight: 600,
                                      color: "#9f1239",
                                      cursor: "pointer",
                                    }}
                                  >
                                    ✕ Back
                                  </button>
                                </div>
                              )}
                              {/* Header & Timezone Pill */}
                              <div
                                style={{
                                  display: "flex",
                                  justifyContent: "space-between",
                                  alignItems: "center",
                                  flexWrap: "wrap",
                                  gap: "0.5rem",
                                }}
                              >
                                <div>
                                  <div style={{ fontWeight: 700, fontSize: "0.95rem", color: "#14110f" }}>
                                    Request Your 1-on-1 Coaching Slot
                                  </div>
                                  <div style={{ fontSize: "0.78rem", color: "#6c6359", marginTop: 2 }}>
                                    Pick a preferred day and time slot below for your private session.
                                  </div>
                                </div>
                                <span
                                  style={{
                                    fontSize: "0.72rem",
                                    fontWeight: 600,
                                    color: "#574f45",
                                    background: "#f2ece1",
                                    border: "1px solid #e3dacb",
                                    padding: "4px 10px",
                                    borderRadius: 999,
                                  }}
                                >
                                  Timezone:{" "}
                                  {typeof Intl !== "undefined"
                                    ? Intl.DateTimeFormat().resolvedOptions().timeZone || "Local"
                                    : "Local"}
                                </span>
                              </div>

                              {/* 1. Interactive Date Strip + Custom Calendar Option */}
                              <div
                                style={{
                                  background: "#ffffff",
                                  border: "1px solid #e7dfd3",
                                  borderRadius: 10,
                                  padding: "0.85rem",
                                }}
                              >
                                <div
                                  style={{
                                    display: "flex",
                                    justifyContent: "space-between",
                                    alignItems: "center",
                                    flexWrap: "wrap",
                                    gap: "0.5rem",
                                    marginBottom: "0.65rem",
                                  }}
                                >
                                  <label
                                    style={{
                                      fontSize: "0.78rem",
                                      fontWeight: 700,
                                      color: "#14110f",
                                      letterSpacing: "0.01em",
                                    }}
                                  >
                                    1. Preferred Date *
                                  </label>
                                  <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                                    <span style={{ fontSize: "0.73rem", color: "#6c6359", fontWeight: 600 }}>
                                      Other date:
                                    </span>
                                    <input
                                      type="date"
                                      aria-label="Preferred Date"
                                      min={formatLocalIsoDate(new Date())}
                                      value={preferredDate}
                                      onChange={(e) => {
                                        setPreferredDate(e.target.value);
                                        setCoachingFeedbackMsg(null);
                                      }}
                                      style={{
                                        padding: "0.28rem 0.5rem",
                                        borderRadius: 6,
                                        border: "1px solid #dcd5cb",
                                        background: "#faf6f0",
                                        fontSize: "0.76rem",
                                        color: "#14110f",
                                        fontWeight: 600,
                                        cursor: "pointer",
                                      }}
                                    />
                                  </div>
                                </div>

                                <div
                                  style={{
                                    display: "grid",
                                    gridTemplateColumns: "repeat(auto-fit, minmax(74px, 1fr))",
                                    gap: "0.45rem",
                                  }}
                                >
                                  {getUpcomingCoachingDateCards().map((card) => {
                                    const isSelected = preferredDate === card.isoDate;
                                    return (
                                      <button
                                        key={card.isoDate}
                                        type="button"
                                        onClick={() => {
                                          setPreferredDate(card.isoDate);
                                          setCoachingFeedbackMsg(null);
                                        }}
                                        style={{
                                          display: "flex",
                                          flexDirection: "column",
                                          alignItems: "center",
                                          justifyContent: "center",
                                          padding: "0.55rem 0.35rem",
                                          borderRadius: 9,
                                          border: isSelected
                                            ? "1.5px solid #c97a1e"
                                            : "1px solid #e6ded2",
                                          background: isSelected ? "#14110f" : "#fcfaf7",
                                          color: isSelected ? "#ffffff" : "#14110f",
                                          cursor: "pointer",
                                          transition: "all 0.15s ease",
                                          boxShadow: isSelected
                                            ? "0 4px 10px rgba(20, 17, 15, 0.14)"
                                            : "none",
                                        }}
                                      >
                                        <span
                                          style={{
                                            fontSize: "0.66rem",
                                            fontWeight: 700,
                                            textTransform: "uppercase",
                                            letterSpacing: "0.05em",
                                            color: isSelected ? "#f5b864" : "#7c7267",
                                          }}
                                        >
                                          {card.isToday
                                            ? "Today"
                                            : card.isTomorrow
                                            ? "Tmrw"
                                            : card.dayShort}
                                        </span>
                                        <span
                                          style={{
                                            fontSize: "1.02rem",
                                            fontWeight: 800,
                                            lineHeight: 1.25,
                                            marginTop: 2,
                                          }}
                                        >
                                          {card.dayNumber}
                                        </span>
                                        <span
                                          style={{
                                            fontSize: "0.68rem",
                                            fontWeight: 600,
                                            color: isSelected ? "#d6cec2" : "#6c6359",
                                          }}
                                        >
                                          {card.monthShort}
                                        </span>
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>

                              {/* 2. Interactive Time Slot Pills (Replaces native browser time popup) */}
                              <div
                                style={{
                                  background: "#ffffff",
                                  border: "1px solid #e7dfd3",
                                  borderRadius: 10,
                                  padding: "0.85rem",
                                }}
                              >
                                <label
                                  style={{
                                    display: "block",
                                    fontSize: "0.78rem",
                                    fontWeight: 700,
                                    color: "#14110f",
                                    marginBottom: "0.6rem",
                                    letterSpacing: "0.01em",
                                  }}
                                >
                                  2. Preferred Time Slot *
                                </label>

                                <div
                                  style={{
                                    display: "grid",
                                    gridTemplateColumns: "repeat(auto-fill, minmax(102px, 1fr))",
                                    gap: "0.45rem",
                                  }}
                                >
                                  {COACHING_TIME_SLOTS.map((slot) => {
                                    const isSelected = preferredTime === slot.value;
                                    const isAvailable = preferredDate
                                      ? isCoachingSlotInFuture(preferredDate, slot.value)
                                      : true;

                                    return (
                                      <button
                                        key={slot.value}
                                        type="button"
                                        disabled={!isAvailable}
                                        onClick={() => {
                                          setPreferredTime(slot.value);
                                          setCoachingFeedbackMsg(null);
                                        }}
                                        style={{
                                          display: "flex",
                                          alignItems: "center",
                                          justifyContent: "center",
                                          gap: "0.35rem",
                                          padding: "0.52rem 0.5rem",
                                          borderRadius: 8,
                                          border: isSelected
                                            ? "1.5px solid #c97a1e"
                                            : "1px solid #e6ded2",
                                          background: !isAvailable
                                            ? "#f5f2ed"
                                            : isSelected
                                            ? "#fff7ed"
                                            : "#fcfaf7",
                                          color: !isAvailable
                                            ? "#b3aba0"
                                            : isSelected
                                            ? "#9a5209"
                                            : "#2d2823",
                                          fontWeight: isSelected ? 700 : 600,
                                          fontSize: "0.8rem",
                                          cursor: isAvailable ? "pointer" : "not-allowed",
                                          transition: "all 0.15s ease",
                                        }}
                                      >
                                        <span
                                          style={{
                                            width: 6,
                                            height: 6,
                                            borderRadius: "50%",
                                            background: !isAvailable
                                              ? "#d4cdc3"
                                              : isSelected
                                              ? "#c97a1e"
                                              : "#cbbba6",
                                          }}
                                        />
                                        {slot.label}
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>

                              {/* 3. Reflection & Questions Textarea */}
                              <div>
                                <label
                                  style={{
                                    display: "block",
                                    fontSize: "0.78rem",
                                    fontWeight: 700,
                                    marginBottom: 6,
                                    color: "#14110f",
                                  }}
                                >
                                  3. Key Breakthroughs &amp; Questions for Roweena{" "}
                                  <span style={{ fontWeight: 500, color: "#7c7267" }}>(Optional)</span>
                                </label>
                                <textarea
                                  rows={2}
                                  value={coachingNotes}
                                  onChange={(e) => setCoachingNotes(e.target.value)}
                                  placeholder="Share any reflections, breakthroughs, or questions you'd like to discuss..."
                                  style={{
                                    width: "100%",
                                    padding: "0.6rem 0.75rem",
                                    borderRadius: 8,
                                    border: "1px solid #dcd5cb",
                                    background: "#ffffff",
                                    fontSize: "0.84rem",
                                    color: "#14110f",
                                    resize: "vertical",
                                  }}
                                />
                              </div>

                              {coachingFeedbackMsg && (
                                <div
                                  role="alert"
                                  style={{
                                    fontSize: "0.82rem",
                                    fontWeight: 600,
                                    padding: "0.55rem 0.75rem",
                                    borderRadius: 8,
                                    background:
                                      coachingFeedbackMsg.type === "ok" ? "#ecfdf5" : "#fef2f2",
                                    border:
                                      coachingFeedbackMsg.type === "ok"
                                        ? "1px solid #a7f3d0"
                                        : "1px solid #fecaca",
                                    color: coachingFeedbackMsg.type === "ok" ? "#15803d" : "#b91c1c",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "space-between",
                                    flexWrap: "wrap",
                                    gap: "0.5rem",
                                  }}
                                >
                                  <span>{coachingFeedbackMsg.text}</span>
                                  {coachingFeedbackMsg.text.toLowerCase().includes("already pending review") && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        invalidateCache("/one-on-one");
                                        loadProgression(true);
                                      }}
                                      style={{
                                        fontSize: "0.75rem",
                                        fontWeight: 700,
                                        padding: "3px 8px",
                                        borderRadius: 6,
                                        background: "#ffffff",
                                        border: "1px solid #fca5a5",
                                        color: "#b91c1c",
                                        cursor: "pointer",
                                      }}
                                    >
                                      View Pending Request &rarr;
                                    </button>
                                  )}
                                </div>
                              )}

                              {/* Summary Bar + Action Buttons */}
                              <div
                                style={{
                                  display: "flex",
                                  justifyContent: "space-between",
                                  alignItems: "center",
                                  flexWrap: "wrap",
                                  gap: "0.75rem",
                                  paddingTop: "0.25rem",
                                }}
                              >
                                <div style={{ fontSize: "0.8rem", color: "#4a443d" }}>
                                  {preferredDate && preferredTime ? (
                                    <>
                                      <span style={{ color: "#7c7267", fontWeight: 600 }}>
                                        Selected Slot:{" "}
                                      </span>
                                      <strong style={{ color: "#14110f" }}>
                                        {formatCoachingSlotSummary(preferredDate, preferredTime)}
                                      </strong>
                                    </>
                                  ) : (
                                    <span style={{ color: "#7c7267" }}>
                                      Select a date and time slot above
                                    </span>
                                  )}
                                </div>

                                <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: "0.65rem", flexWrap: "wrap" }}>
                                  <button
                                    type="button"
                                    onClick={() => setShowCoachingPanel(false)}
                                    style={{
                                      padding: "0.55rem 1.25rem",
                                      borderRadius: 8,
                                      border: "1px solid #dcd5cb",
                                      background: "#ffffff",
                                      color: "#4a443d",
                                      fontWeight: 600,
                                      fontSize: "0.85rem",
                                      cursor: "pointer",
                                      display: "inline-flex",
                                      alignItems: "center",
                                      justifyContent: "center",
                                      transition: "all 0.15s ease",
                                    }}
                                  >
                                    Close
                                  </button>
                                  <button
                                    type="submit"
                                    disabled={submittingCoaching || Boolean(activeCoachingReq && !showRescheduleForm) || !preferredDate || !preferredTime}
                                    style={{
                                      padding: "0.55rem 1.4rem",
                                      borderRadius: 8,
                                      border: "none",
                                      background: "linear-gradient(135deg, #d97706, #c26904)",
                                      color: "#ffffff",
                                      fontWeight: 700,
                                      fontSize: "0.85rem",
                                      display: "inline-flex",
                                      alignItems: "center",
                                      justifyContent: "center",
                                      whiteSpace: "nowrap",
                                      boxShadow: "0 2px 8px rgba(217, 119, 6, 0.25)",
                                      cursor: submittingCoaching || Boolean(activeCoachingReq && !showRescheduleForm) || !preferredDate || !preferredTime ? "not-allowed" : "pointer",
                                      opacity: submittingCoaching || Boolean(activeCoachingReq && !showRescheduleForm) || !preferredDate || !preferredTime ? 0.65 : 1,
                                      transition: "all 0.15s ease",
                                    }}
                                  >
                                    {submittingCoaching
                                      ? "Submitting Booking Request..."
                                      : Boolean(activeCoachingReq && !showRescheduleForm)
                                      ? "Request Already Pending"
                                      : showRescheduleForm
                                      ? "Confirm Reschedule Slot"
                                      : "Submit Booking Request"}
                                  </button>
                                </div>
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
                      {(stage5State?.isOverridden || isMissionApproved || latestMission || !isMissionRequired) && (
                        <p className={styles.kicker}>
                          {stage5State?.isOverridden && (
                            <span className={styles.overrideBadge}>Staff Override</span>
                          )}
                          {isMissionApproved ? (
                            <span className={styles.quizPassedBadge}>✓ Approved</span>
                          ) : latestMission?.status === "SUBMITTED" ? (
                            <span className={styles.quizRequiredBadge}>Pending Review</span>
                          ) : latestMission?.status === "REJECTED" ? (
                            <span className={styles.quizRequiredBadge}>Revision Requested</span>
                          ) : !isMissionRequired ? (
                            <span
                              className={styles.quizRequiredBadge}
                              style={{ background: "#f3f4f6", color: "#4b5563", borderColor: "#e5e7eb" }}
                            >
                              Optional Milestone
                            </span>
                          ) : null}
                        </p>
                      )}

                      <h3 className={styles.stepTitle}>Mission Statement</h3>

                      <p style={{ margin: "4px 0 0", fontSize: "0.84rem", color: "var(--text-secondary, #4a443d)" }}>
                        {isMissionApproved
                          ? "Mission Statement verified and approved."
                          : latestMission?.status === "SUBMITTED"
                          ? "Under review by your coach."
                          : "Upload your signed personal Mission Statement."}
                      </p>

                      {!isMissionUnlocked && (
                        <div className={styles.lockMessage}>
                          {InfoCircle}
                          <span>Requires completing the 1-on-1 Call</span>
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
                              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                                <a
                                  href={
                                    sanitizeExternalUrl(
                                      latestMission.fileUrl?.startsWith("data:")
                                        ? latestMission.fileUrl
                                        : `${API_URL}/mission-statements/${encodeURIComponent(latestMission.id)}/file`
                                    ) || "#"
                                  }
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className={styles.reviewBtn}
                                  style={{ padding: "0.35rem 0.75rem", fontSize: "0.78rem" }}
                                >
                                  View Uploaded File
                                </a>
                                {!isMissionApproved && (
                                  <button
                                    type="button"
                                    onClick={() => setShowMissionReplaceForm((prev) => !prev)}
                                    className={styles.reviewBtn}
                                    style={{
                                      padding: "0.35rem 0.75rem",
                                      fontSize: "0.78rem",
                                      cursor: "pointer",
                                      background: showMissionReplaceForm ? "#f5efe6" : undefined,
                                    }}
                                  >
                                    {showMissionReplaceForm ? "Cancel Replacement" : "Upload Replacement Copy"}
                                  </button>
                                )}
                              </div>
                            </div>
                          )}

                          {!isMissionApproved && (!latestMission || latestMission.status !== "SUBMITTED" || showMissionReplaceForm) && (
                            <form onSubmit={handleUploadMissionStatement} style={{ display: "flex", flexDirection: "column", gap: "0.65rem" }}>
                              <label style={{ fontWeight: 700, fontSize: "0.84rem", color: "#14110f" }}>
                                {showMissionReplaceForm
                                  ? `Upload Replacement Mission Statement (Will become Version #${(latestMission?.version ?? 0) + 1})`
                                  : "Upload Handwritten Mission Statement (PDF, JPG, PNG — Max 15MB)"}
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
                                  onClick={() => {
                                    setShowMissionPanel(false);
                                    setShowMissionReplaceForm(false);
                                  }}
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
                                  {submittingMission
                                    ? "Uploading..."
                                    : showMissionReplaceForm
                                    ? "Submit Replacement Copy"
                                    : "Submit Mission Statement"}
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
                      isCertificateClaimed
                        ? styles.stepDone
                        : isCertificateUnlocked
                        ? styles.stepCurrent
                        : current && current.sequence === total
                        ? styles.stepCurrent
                        : styles.stepLocked
                    }`}
                    style={{
                      borderLeftColor: isCertificateClaimed
                        ? "#16a34a"
                        : isCertificateUnlocked
                        ? "#eab308"
                        : undefined,
                    }}
                  >
                    <span
                      className={styles.marker}
                      style={{
                        background: isCertificateClaimed
                          ? "#16a34a"
                          : isCertificateUnlocked
                          ? "linear-gradient(135deg, #eab308, #ca8a04)"
                          : undefined,
                        color: isCertificateClaimed || isCertificateUnlocked ? "#ffffff" : undefined,
                        borderColor: isCertificateClaimed
                          ? "#16a34a"
                          : isCertificateUnlocked
                          ? "#ca8a04"
                          : undefined,
                      }}
                      aria-hidden="true"
                    >
                      {isCertificateClaimed ? (
                        Check
                      ) : (
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="12" cy="8" r="6" />
                          <path d="M15.4 13.8L18 22l-6-3-6 3 2.6-8.2" />
                        </svg>
                      )}
                    </span>

                    <div className={styles.stepBody}>
                      {isCertificateClaimed && (
                        <p className={styles.kicker} style={{ color: "#16a34a" }}>
                          <span className={styles.quizPassedBadge}>✓ Issued</span>
                        </p>
                      )}
                      <h3 className={styles.stepTitle} style={{ color: isCertificateClaimed ? undefined : isCertificateUnlocked ? "#854d0e" : undefined }}>
                        Certificate of Completion
                      </h3>
                      <p style={{ margin: "4px 0 0", fontSize: "0.85rem", color: "var(--text-muted)" }}>
                        {isCertificateClaimed
                          ? `Certificate #${certificateCode || "Issued"} awarded.`
                          : isCertificateUnlocked
                          ? "All requirements completed. Your certificate is ready to claim."
                          : "Unlocks after completing all modules and milestones."}
                      </p>
                    </div>

                    <div className={styles.stepActionCol}>
                      {isCertificateClaimed ? (
                        <Link
                          href="/certificates"
                          className={styles.reviewBtn}
                        >
                          View Certificate
                        </Link>
                      ) : isCertificateUnlocked ? (
                        <Link
                          href="/certificates"
                          className={styles.startBtn}
                          style={{
                            background: "linear-gradient(135deg, #eab308, #ca8a04)",
                            borderColor: "#ca8a04",
                            color: "#ffffff",
                          }}
                        >
                          Claim Certificate
                        </Link>
                      ) : (
                        <span
                          className={styles.lockedPill}
                          title={`Complete all ${total} steps, Final Exam, 1-on-1 Coaching, and Mission Statement to unlock your certificate`}
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
                    aria-label={`${displayPercent}% overall learning path completion`}
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
                      {displayPercent}%
                    </text>
                  </svg>
                  <p className={styles.progressCount} style={{ fontWeight: 700, fontSize: "0.95rem", color: "var(--text-primary)", margin: "0.5rem 0 0.15rem" }}>
                    {journeyProgress.completedMilestones} of {journeyProgress.totalMilestones} milestones completed
                  </p>
                  <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", margin: "0 0 0.85rem" }}>
                    {done} of {total} curriculum modules completed
                  </p>

                  <div style={{ width: "100%", borderTop: "1px solid rgba(0,0,0,0.08)", paddingTop: "0.65rem", display: "flex", flexDirection: "column", gap: "0.4rem", textAlign: "left", fontSize: "0.8rem" }}>
                    {journeyProgress.milestones.map((m) => (
                      <div key={m.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "6px" }}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: "8px", color: m.isCompleted ? "#166534" : "var(--text-secondary)" }}>
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              justifyContent: "center",
                              width: "20px",
                              height: "20px",
                              borderRadius: "5px",
                              background: m.isCompleted ? "#dcfce7" : m.isUnlocked ? "#fef3c7" : "#f1f5f9",
                              color: m.isCompleted ? "#166534" : m.isUnlocked ? "#d97706" : "#94a3b8",
                              flexShrink: 0,
                            }}
                            aria-hidden="true"
                          >
                            {m.isCompleted ? (
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="20 6 9 17 4 12" />
                              </svg>
                            ) : (
                              getMilestoneGlyph(m.id)
                            )}
                          </span>
                          <span style={{ fontSize: "0.78rem", fontWeight: m.isUnlocked ? 600 : 500 }}>{m.title}</span>
                        </span>
                        <span style={{
                          fontSize: "0.72rem",
                          fontWeight: 600,
                          padding: "2px 6px",
                          borderRadius: "4px",
                          background: m.isCompleted ? "#dcfce7" : m.isUnlocked ? "#fef9c3" : "#f3f4f6",
                          color: m.isCompleted ? "#166534" : m.isUnlocked ? "#854d0e" : "#64748b",
                        }}>
                          {m.statusLabel}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </section>
          </aside>
        </div>
      )}
    </div>
  );
}
