"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import styles from "./certificate-view.module.css";
import {
  API_URL,
  getAuthHeaders,
  getAuthToken,
  parseApiError,
  type EnrolmentProgressionResponse,
} from "../../../lib/api";

const Certificate = dynamic(() => import("../../../certificates/Certificate"), {
  ssr: false,
  loading: () => (
    <div style={{ padding: "40px", textAlign: "center", color: "var(--text-muted)" }}>
      Loading certificate...
    </div>
  ),
});

interface UncompletedActivity {
  id: string;
  title: string;
  stepId: string;
  stepSequence: number;
  stepTitle: string;
  type: "LESSON" | "QUIZ";
}

export default function CourseCertificatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();

  const [progression, setProgression] = useState<EnrolmentProgressionResponse | null>(null);
  const [userName, setUserName] = useState<string>("Learner");
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [certificateData, setCertificateData] = useState<any>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  useEffect(() => {
    const token = getAuthToken();
    if (!token) {
      router.push("/login");
      return;
    }

    setLoading(true);
    setErrorMsg(null);

    Promise.all([
      // 1. Fetch learning progression
      fetch(`${API_URL}/progression/me/${id}`, { headers: getAuthHeaders() }).then(
        async (res) => {
          if (res.status === 401) {
            router.push("/login");
            throw new Error("Session expired. Please log in again.");
          }
          if (!res.ok) {
            const err = await parseApiError(res, "Could not load curriculum progression");
            throw new Error(err.message);
          }
          return res.json();
        }
      ),
      // 2. Fetch authenticated user profile for name
      fetch(`${API_URL}/auth/me`, { headers: getAuthHeaders() }).then(async (res) => {
        if (res.ok) return res.json();
        return null;
      }),
      // 3. Fetch certificates for this learner
      fetch(`${API_URL}/certificates/mine`, { headers: getAuthHeaders() }).then(
        async (res) => {
          if (res.ok) return res.json();
          return [];
        }
      ),
    ])
      .then(([prog, profile, certs]) => {
        setProgression(prog);
        if (profile?.name) setUserName(profile.name);

        const foundCert = Array.isArray(certs)
          ? certs.find((c: any) => c.enrolmentId === prog.enrolmentId || c.programId === id)
          : null;
        if (foundCert) {
          setCertificateData(foundCert);
        } else if (prog.certificate) {
          setCertificateData(prog.certificate);
        }

        // Auto-request certificate if completed 100% and no certificate exists yet
        const total = prog.totalItems ?? 0;
        const completed = prog.completedItems ?? 0;
        if (total > 0 && completed >= total && !foundCert && !prog.certificate && prog.enrolmentId) {
          fetch(`${API_URL}/certificates/request/${prog.enrolmentId}`, {
            method: "POST",
            headers: getAuthHeaders(),
          })
            .then((res) => (res.ok ? res.json() : null))
            .then((newCert) => {
              if (newCert) setCertificateData(newCert);
            })
            .catch(() => null);
        }
      })
      .catch((err: any) => {
        console.error("Certificate view error:", err);
        setErrorMsg(err.message || "Failed to load course certificate information.");
      })
      .finally(() => {
        setLoading(false);
      });
  }, [id, router]);

  // Compute remaining activities
  const steps = progression?.steps || [];
  const totalItems = progression?.totalItems ?? 0;
  const completedItems = progression?.completedItems ?? 0;
  const activitiesLeft = Math.max(0, totalItems - completedItems);
  const progressPercent = progression ? Math.round(progression.overallProgressPercent) : 0;
  const isCompleted = totalItems > 0 && activitiesLeft === 0;

  // Uncompleted items list for checklist
  const uncompletedActivities: UncompletedActivity[] = [];
  steps.forEach((step) => {
    (step.lessons || []).forEach((l) => {
      if (!l.isCompleted) {
        uncompletedActivities.push({
          id: l.lessonId,
          title: l.title,
          stepId: step.stepId,
          stepSequence: step.sequence,
          stepTitle: step.title,
          type: "LESSON",
        });
      }
    });

    if (step.quiz && !step.quiz.isPassed) {
      uncompletedActivities.push({
        id: step.quiz.quizId,
        title: `Step ${step.sequence} Knowledge Check (Pass mark: ${step.quiz.passMark}%)`,
        stepId: step.stepId,
        stepSequence: step.sequence,
        stepTitle: step.title,
        type: "QUIZ",
      });
    }
  });

  // Current step to resume
  const firstIncompleteStep = steps.find((s) => !s.isCompleted) || steps[0];

  const handleCopyLink = () => {
    const certCode = certificateData?.certificateCode || certificateData?.certificateNumber || "WBM-2026";
    const shareUrl = `${window.location.origin}/verify/${certCode}`;
    navigator.clipboard.writeText(shareUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.loadingBox}>
          <div className={styles.spinner} />
          <p>Verifying curriculum activities and credentials...</p>
        </div>
      </div>
    );
  }

  if (errorMsg) {
    return (
      <div className={styles.container}>
        <div className={styles.centerHero}>
          <h2>Could not load certificate status</h2>
          <p className={styles.lockedSub}>{errorMsg}</p>
          <Link href={`/programs/${id}/steps`} className={styles.actionBtnPrimary}>
            &larr; Back to Curriculum
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {/* Explicit A4 landscape page setup and layout resets for Chrome/Brave/Edge/Safari print */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
            @page {
              size: 297mm 210mm;
              size: landscape;
              margin: 0mm !important;
            }
            @page :left {
              margin: 0mm !important;
            }
            @page :right {
              margin: 0mm !important;
            }
            @media print {
              html, body {
                width: 297mm !important;
                height: 210mm !important;
                margin: 0 !important;
                padding: 0 !important;
                overflow: hidden !important;
                background: #ffffff !important;
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
                color-adjust: exact !important;
              }
              aside,
              nav,
              header:not(article header),
              footer:not(article footer):not([class*="footerRow"]),
              [class*="sidebar"],
              [class*="topbar"],
              [class*="topBar"],
              [class*="LmsSidebar"],
              [class*="PushNotification"] {
                display: none !important;
              }
              body > div[class*="appContainer"],
              div[class*="appContainer"] > main[class*="mainContent"] {
                margin: 0 !important;
                margin-left: 0 !important;
                padding: 0 !important;
                width: 297mm !important;
                height: 210mm !important;
                max-width: 297mm !important;
                max-height: 210mm !important;
                overflow: hidden !important;
                border: none !important;
                box-shadow: none !important;
                background: transparent !important;
              }
            }
          `,
        }}
      />

      {/* Top Header Bar with Progress */}
      <header className={styles.topBar}>
        <div className={styles.topNavRow}>
          <Link href={`/programs/${id}/steps`} className={styles.backLink}>
            <svg
              width="16"
              height="16"
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
            <span>Back to course page</span>
          </Link>

          <div className={styles.courseHeaderMeta}>
            <h1 className={styles.courseTitle}>
              {progression?.programTitle || "Course Curriculum"}
            </h1>

            <div className={styles.progressWrap}>
              <div className={styles.progressTrack}>
                <div
                  className={`${styles.progressFill} ${isCompleted ? styles.progressFillGold : ""}`}
                  style={{ width: `${Math.min(100, Math.max(0, progressPercent))}%` }}
                />
              </div>
              <span className={styles.percentLabel}>{progressPercent}%</span>
            </div>
          </div>
        </div>
      </header>

      {/* ===================================================================
          STATE A: INCOMPLETE (APNA COLLEGE DESIGN - SCREENSHOT 2)
          =================================================================== */}
      {!isCompleted ? (
        <main className={styles.centerHero}>
          {/* Expressive Sad Face Bubble */}
          <div className={styles.sadFaceCircle} aria-hidden="true">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={styles.sadFaceIcon}
            >
              <circle cx="12" cy="12" r="10" />
              <path d="M8 15s1.5-2 4-2 4 2 4 2" />
              <line x1="9" y1="9" x2="9.01" y2="9" />
              <line x1="15" y1="9" x2="15.01" y2="9" />
              {/* Tear drop */}
              <path d="M16 11c0 1-.8 1.8-1.5 1.8S13 12 13 11s1.5-2.2 1.5-2.2S16 10 16 11z" fill="currentColor" />
            </svg>
          </div>

          {/* Bold Header Matching Apna College */}
          <h2 className={styles.lockedTitle}>
            YOU HAVE TO COMPLETE {activitiesLeft} MORE ACTIVITIES
          </h2>

          <p className={styles.lockedSub}>
            Complete all lessons, video materials, and step knowledge checks in this
            curriculum to unlock your verified Certificate of Completion.
          </p>

          {firstIncompleteStep && (
            <Link
              href={`/steps/${firstIncompleteStep.stepId}`}
              className={styles.actionBtnPrimary}
            >
              <span>Resume Course: Step {firstIncompleteStep.sequence}</span>
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            </Link>
          )}

          {/* Interactive Remaining Activities Checklist */}
          {uncompletedActivities.length > 0 && (
            <section className={styles.checklistCard} aria-labelledby="checklist-heading">
              <div className={styles.checklistHeader}>
                <h3 id="checklist-heading" className={styles.checklistTitle}>
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#dc2626"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                  <span>Remaining Activities Checklist</span>
                </h3>
                <span className={styles.activitiesBadge}>
                  {activitiesLeft} {activitiesLeft === 1 ? "Item" : "Items"} Left
                </span>
              </div>

              <ul className={styles.remainingList}>
                {uncompletedActivities.slice(0, 10).map((act) => (
                  <li key={`${act.type}-${act.id}`} className={styles.remainingItem}>
                    <div className={styles.itemInfo}>
                      <div className={styles.itemTypeIcon}>
                        {act.type === "LESSON" ? (
                          <svg
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <polygon points="5 3 19 12 5 21 5 3" />
                          </svg>
                        ) : (
                          <svg
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <circle cx="12" cy="12" r="10" />
                            <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                            <line x1="12" y1="17" x2="12.01" y2="17" />
                          </svg>
                        )}
                      </div>
                      <div className={styles.itemText}>
                        <span className={styles.itemTitle}>{act.title}</span>
                        <span className={styles.itemStepContext}>
                          Module {act.stepSequence}: {act.stepTitle} &bull;{" "}
                          {act.type === "LESSON" ? "Video/Reading Material" : "Knowledge Check"}
                        </span>
                      </div>
                    </div>

                    <Link href={`/steps/${act.stepId}`} className={styles.itemJumpBtn}>
                      {act.type === "LESSON" ? "Start Lesson →" : "Take Quiz →"}
                    </Link>
                  </li>
                ))}
              </ul>

              {uncompletedActivities.length > 10 && (
                <p style={{ margin: "14px 0 0", fontSize: "0.82rem", color: "#64748b", textAlign: "center" }}>
                  + {uncompletedActivities.length - 10} more pending curriculum items across other modules.
                </p>
              )}
            </section>
          )}
        </main>
      ) : (
        /* ===================================================================
           STATE B: COMPLETED (OFFICIAL CERTIFICATE DISPLAY & DOWNLOAD)
           =================================================================== */
        <main className={styles.celebrationHero}>
          {/* Gold Gleaming Medal Icon */}
          <div className={styles.goldMedalCircle} aria-hidden="true">
            <svg
              width="44"
              height="44"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="8" r="6" />
              <path d="M15.4 13.8L18 22l-6-3-6 3 2.6-8.2" />
            </svg>
          </div>

          <h2 className={styles.celebrationTitle}>
            Congratulations, {userName}!
          </h2>

          <p className={styles.celebrationSub}>
            You have successfully completed 100% of the course curriculum and passed all
            evaluations. Here is your official Certificate of Completion.
          </p>

          {/* Action Toolbar */}
          <div className={styles.toolbar}>
            <button
              type="button"
              className={styles.downloadBtn}
              onClick={() => window.print()}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              <span>Download / Print PDF</span>
            </button>

            <button
              type="button"
              className={styles.secondaryBtn}
              onClick={handleCopyLink}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
              </svg>
              <span>{copiedLink ? "✓ Link Copied!" : "Copy Verification Link"}</span>
            </button>

            <Link href="/certificates" className={styles.secondaryBtn}>
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
              </svg>
              <span>All My Certificates</span>
            </Link>
          </div>

          {/* Live Rendered High-Resolution Certificate */}
          <div className={styles.certSheetWrapper}>
            <Certificate
              recipientName={userName}
              courseName={progression?.programTitle || "11 Steps to You Programme"}
              issueDate={
                certificateData?.issuedAt ||
                certificateData?.issueDate ||
                certificateData?.createdAt ||
                new Date().toISOString()
              }
              certificateNo={
                certificateData?.certificateCode ||
                certificateData?.certificateNumber ||
                "CERT-WBM-11S-2026-001"
              }
              issuerName="Roweena Britto"
              issuerTitle="Founder & Lead Facilitator"
              brandName="whatboutme"
            />
          </div>
        </main>
      )}
    </div>
  );
}
