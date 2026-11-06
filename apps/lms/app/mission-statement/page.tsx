"use client";

import { useEffect, useState, useRef, FormEvent, DragEvent } from "react";
import Link from "next/link";
import styles from "./mission-statement.module.css";
import {
  API_URL,
  getAuthHeaders,
  fetchMyMissionStatements,
  submitMissionStatement,
  type MissionStatementSubmission,
} from "../lib/api";
import { sanitizeExternalUrl } from "../lib/auth-redirect";

interface UserProfile {
  id: string;
  name: string;
  email: string;
  enrolments?: Array<{
    id: string;
    programId: string;
    status: string;
    missionStatementApprovedAt?: string | null;
    program?: { id: string; title: string };
  }>;
}

interface StageEvalResponse {
  stages: {
    STAGE_1_CURRICULUM: { isCompleted: boolean; isUnlocked: boolean };
    STAGE_2_EXAM: { isCompleted: boolean; isUnlocked: boolean };
    STAGE_3_ATTENDANCE: { isCompleted: boolean; isUnlocked: boolean };
    STAGE_4_ONE_ON_ONE: { isCompleted: boolean; isUnlocked: boolean };
    STAGE_5_MISSION_STATEMENT: {
      isCompleted: boolean;
      isUnlocked: boolean;
      unmetRequirements?: string[];
    };
  };
}

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/jpg",
]);

export default function MissionStatementPage() {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [enrolmentId, setEnrolmentId] = useState<string>("");
  const [programTitle, setProgramTitle] = useState<string>("");
  const [isStage5Unlocked, setIsStage5Unlocked] = useState(false);
  const [isStage5Completed, setIsStage5Completed] = useState(false);
  const [unmetPrereqs, setUnmetPrereqs] = useState<string[]>([]);

  // Submissions state
  const [submissions, setSubmissions] = useState<MissionStatementSubmission[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadData = async () => {
    setLoading(true);
    setFormError(null);
    try {
      const authHeaders = getAuthHeaders();
      const meRes = await fetch(`${API_URL}/auth/me`, { headers: authHeaders });
      if (!meRes.ok) return;
      const me: UserProfile = await meRes.json();
      setUser(me);

      const activeEnrolment = me.enrolments?.find(
        (e) => e.status === "ACTIVE" || e.status === "COMPLETED"
      );

      if (activeEnrolment) {
        setEnrolmentId(activeEnrolment.id);
        setProgramTitle(activeEnrolment.program?.title || "Leadership Coaching Program");

        // Fetch progression tree evaluation
        const progRes = await fetch(
          `${API_URL}/progression/tree/${activeEnrolment.id}`,
          { headers: authHeaders }
        ).catch(() => null);

        if (progRes && progRes.ok) {
          const progData: StageEvalResponse = await progRes.json();
          const s5 = progData.stages?.STAGE_5_MISSION_STATEMENT;
          setIsStage5Unlocked(Boolean(s5?.isUnlocked));
          setIsStage5Completed(Boolean(s5?.isCompleted));
          const prereqs = (s5 as any)?.unmetPrerequisites ?? s5?.unmetRequirements;
          if (Array.isArray(prereqs) && prereqs.length > 0) {
            setUnmetPrereqs(prereqs);
          }
        } else {
          setIsStage5Completed(Boolean(activeEnrolment.missionStatementApprovedAt));
          setIsStage5Unlocked(true);
        }

        // Fetch learner's mission statement submissions
        try {
          const list = await fetchMyMissionStatements(activeEnrolment.id);
          setSubmissions(list);
        } catch (subErr) {
          console.warn("Could not load submissions:", subErr);
        }
      }
    } catch (err: any) {
      console.error("Error loading mission statement page:", err);
      setFormError("Could not load progression data. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // File validation
  const handleFileSelection = (file: File) => {
    setFormError(null);
    setFormSuccess(null);

    if (file.size > MAX_FILE_SIZE_BYTES) {
      setFormError("File size must not exceed 10MB");
      return;
    }

    if (!ALLOWED_MIME_TYPES.has(file.type.toLowerCase())) {
      setFormError("Invalid format. Please upload a PDF, PNG, or JPEG file.");
      return;
    }

    setSelectedFile(file);
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFileSelection(e.target.files[0]);
    }
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelection(e.dataTransfer.files[0]);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedFile) {
      setFormError("Please select a file to upload");
      return;
    }
    if (!enrolmentId) {
      setFormError("No active enrolment found");
      return;
    }

    setIsSubmitting(true);
    setFormError(null);
    setFormSuccess(null);

    try {
      await submitMissionStatement(enrolmentId, selectedFile);
      setFormSuccess("Mission Statement submitted successfully! Your lead coach will review it shortly.");
      setSelectedFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      // Refresh list
      const updated = await fetchMyMissionStatements(enrolmentId);
      setSubmissions(updated);
    } catch (err: any) {
      setFormError(err.message || "Failed to submit mission statement");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className={styles.container}>
        <div style={{ textAlign: "center", padding: "4rem 0", color: "var(--text-muted, #71717a)" }}>
          Checking stage progression and capstone status...
        </div>
      </div>
    );
  }

  const latestSubmission = submissions.length > 0 ? submissions[0] : null;
  const isApproved = latestSubmission?.status === "APPROVED" || isStage5Completed;
  const nextVersion = (latestSubmission?.version ?? 0) + 1;

  return (
    <div className={styles.container}>
      {/* ─────────────────────────────────────────────────────────────────────────────
          PAGE HEADER
         ───────────────────────────────────────────────────────────────────────────── */}
      <div className={styles.header}>
        <span className={styles.stepBadge}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"></path>
          </svg>
          STAGE 5 OF 5 · FINAL CAPSTONE
        </span>
        <h1 className={styles.title}>Final Mission Statement</h1>
        <p className={styles.subtitle}>
          Articulate your personal purpose and leadership manifesto for {programTitle}. Upon coach verification, your official graduation certificate is unlocked and issued automatically.
        </p>
      </div>

      {/* Global Alerts */}
      {formError && (
        <div className={styles.alertError} role="alert">
          {formError}
        </div>
      )}
      {formSuccess && (
        <div className={styles.alertSuccess} role="status">
          {formSuccess}
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────────────────
          LOCKED VIEW (STAGE 5 NOT YET REACHED)
         ───────────────────────────────────────────────────────────────────────────── */}
      {!isStage5Unlocked ? (
        <div className={styles.lockedCard}>
          <div className={styles.lockIconWrap} aria-hidden="true">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
            </svg>
          </div>
          <h2 className={styles.lockedTitle}>Mission Statement Submission is Locked</h2>
          <p className={styles.lockedDesc}>
            To uphold the integrity of your graduation credential, Stage 5 requires full completion of all previous curriculum stages before your final statement can be submitted.
          </p>

          <div className={styles.prerequisitesList}>
            <div className={styles.prereqItem}>
              <span style={{ color: "#16a34a", fontWeight: 700 }}>1.</span>
              <span>Steps 1–11 Video Lessons &amp; Checkpoint Quizzes</span>
            </div>
            <div className={styles.prereqItem}>
              <span style={{ color: "#16a34a", fontWeight: 700 }}>2.</span>
              <span>50-Question Comprehensive Final Assessment</span>
            </div>
            <div className={styles.prereqItem}>
              <span style={{ color: "#16a34a", fontWeight: 700 }}>3.</span>
              <span>Live &amp; Recorded Workshop Attendance Threshold</span>
            </div>
            <div className={styles.prereqItem}>
              <span style={{ color: "#ea580c", fontWeight: 700 }}>4.</span>
              <span>1-on-1 Executive Coaching Call Completion</span>
            </div>
          </div>

          {unmetPrereqs.length > 0 && (
            <div style={{ marginTop: "1rem", fontSize: "0.85rem", color: "#b91c1c" }}>
              Blocking: {unmetPrereqs.join(", ")}
            </div>
          )}

          <div style={{ display: "flex", gap: "12px", marginTop: "1.25rem", flexWrap: "wrap", justifyContent: "center" }}>
            <Link
              href="/coaching"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "0.75rem 1.4rem",
                borderRadius: "10px",
                background: "#b8860b",
                color: "#ffffff",
                fontWeight: 700,
                fontSize: "0.9rem",
                textDecoration: "none",
              }}
            >
              Go to 1-on-1 Coaching
            </Link>
            <Link
              href="/courses"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "0.75rem 1.4rem",
                borderRadius: "10px",
                background: "#f1f5f9",
                color: "#334155",
                fontWeight: 600,
                fontSize: "0.9rem",
                textDecoration: "none",
              }}
            >
              Resume Coursework
            </Link>
          </div>
        </div>
      ) : (
        <>
          {/* ─────────────────────────────────────────────────────────────────────────────
              APPROVED & GRADUATION STATE
             ───────────────────────────────────────────────────────────────────────────── */}
          {isApproved ? (
            <div className={styles.celebrationCard}>
              <div className={styles.celebrationHeader}>
                <div className={styles.celebrationBadge} aria-hidden="true">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                </div>
                <div>
                  <h2 className={styles.celebrationTitle}>Congratulations! You Have Graduated!</h2>
                  <p className={styles.celebrationDesc}>
                    Your Mission Statement has been officially verified and approved. All 5 stages of the WhatBoutMe leadership pipeline are complete!
                  </p>
                </div>
              </div>

              {latestSubmission?.feedback && (
                <div style={{
                  background: "rgba(255, 255, 255, 0.7)",
                  border: "1px solid #86efac",
                  padding: "1rem 1.25rem",
                  borderRadius: "10px",
                  fontSize: "0.9rem",
                  color: "#166534",
                  fontStyle: "italic",
                }}>
                  "{latestSubmission.feedback}"
                  {latestSubmission.reviewer?.name && (
                    <div style={{ marginTop: "4px", fontStyle: "normal", fontWeight: 700, fontSize: "0.82rem" }}>
                      — {latestSubmission.reviewer.name}, Lead Evaluator
                    </div>
                  )}
                </div>
              )}

              <div style={{ marginTop: "0.5rem" }}>
                <Link href="/certificates" className={styles.certBtn}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <circle cx="12" cy="8" r="7"></circle>
                    <polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"></polyline>
                  </svg>
                  <span>View &amp; Download Graduation Certificate</span>
                </Link>
              </div>
            </div>
          ) : latestSubmission?.status === "SUBMITTED" ? (
            /* ─────────────────────────────────────────────────────────────────────────────
                UNDER REVIEW STATE
               ───────────────────────────────────────────────────────────────────────────── */
            <div className={styles.underReviewCard}>
              <div className={styles.statusIconWrap} style={{ background: "#dbeafe", color: "#1d4ed8" }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="10"></circle>
                  <polyline points="12 6 12 12 16 14"></polyline>
                </svg>
              </div>
              <div>
                <strong style={{ fontSize: "1.05rem", display: "block", marginBottom: "4px" }}>
                  Submission Under Review (Version {latestSubmission.version})
                </strong>
                <p style={{ margin: 0, fontSize: "0.9rem", lineHeight: 1.5, color: "#1e40af" }}>
                  Your document <code>{latestSubmission.fileName}</code> was uploaded on {new Date(latestSubmission.createdAt).toLocaleDateString()} and is currently undergoing review. Once verified, your graduation certificate will be issued automatically.
                </p>
              </div>
            </div>
          ) : latestSubmission?.status === "REJECTED" ? (
            /* ─────────────────────────────────────────────────────────────────────────────
                REVISIONS REQUESTED STATE
               ───────────────────────────────────────────────────────────────────────────── */
            <div className={styles.revisionCard}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                <div className={styles.statusIconWrap} style={{ background: "#fef3c7", color: "#b45309" }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="12" y1="8" x2="12" y2="12"></line>
                    <line x1="12" y1="16" x2="12.01" y2="16"></line>
                  </svg>
                </div>
                <div>
                  <strong style={{ fontSize: "1rem" }}>Revision Requested by Coach</strong>
                  <div style={{ fontSize: "0.82rem", color: "#78350f" }}>
                    Please review the feedback below and submit a revised version.
                  </div>
                </div>
              </div>

              {latestSubmission.feedback && (
                <div style={{
                  background: "#ffffff",
                  padding: "0.85rem 1.15rem",
                  borderRadius: "8px",
                  border: "1px solid #fde68a",
                  fontSize: "0.88rem",
                  color: "#92400e",
                  lineHeight: 1.5,
                }}>
                  <strong>Coach Notes:</strong> {latestSubmission.feedback}
                </div>
              )}
            </div>
          ) : null}

          {/* ─────────────────────────────────────────────────────────────────────────────
              UPLOAD FORM (Active when not approved)
             ───────────────────────────────────────────────────────────────────────────── */}
          {!isApproved && (
            <div className={styles.uploadCard}>
              <div>
                <h3 className={styles.cardTitle}>
                  {submissions.length === 0
                    ? "Upload Your Mission Statement"
                    : `Upload Revised Version (v${nextVersion})`}
                </h3>
                <p className={styles.cardDesc}>
                  Accepted formats: PDF document, PNG, or JPEG image (maximum size: 10MB).
                </p>
              </div>

              <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,image/png,image/jpeg,image/jpg"
                  style={{ display: "none" }}
                  onChange={handleFileInputChange}
                />

                {!selectedFile ? (
                  <div
                    className={`${styles.dropzone} ${isDragging ? styles.active : ""}`}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    role="button"
                    tabIndex={0}
                    aria-label="Click or drag and drop to upload mission statement"
                  >
                    <div className={styles.dropzoneIcon}>
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                        <polyline points="17 8 12 3 7 8"></polyline>
                        <line x1="12" y1="3" x2="12" y2="15"></line>
                      </svg>
                    </div>
                    <p className={styles.dropzoneText}>
                      Drag and drop your file here, or <span style={{ color: "#b8860b", textDecoration: "underline" }}>browse files</span>
                    </p>
                    <p className={styles.dropzoneHint}>PDF, PNG, or JPEG · Maximum 10MB</p>
                  </div>
                ) : (
                  <div className={styles.filePreview}>
                    <div className={styles.fileInfo}>
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#b8860b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                        <polyline points="14 2 14 8 20 8"></polyline>
                      </svg>
                      <div>
                        <div className={styles.fileName}>{selectedFile.name}</div>
                        <div className={styles.fileSize}>
                          {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB · Ready to submit
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      className={styles.clearFileBtn}
                      onClick={() => {
                        setSelectedFile(null);
                        if (fileInputRef.current) fileInputRef.current.value = "";
                      }}
                      title="Remove selected file"
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                      </svg>
                    </button>
                  </div>
                )}

                <div>
                  <button
                    type="submit"
                    className={styles.submitBtn}
                    disabled={isSubmitting || !selectedFile}
                  >
                    {isSubmitting ? (
                      <>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ animation: "spin 1s linear infinite" }}>
                          <line x1="12" y1="2" x2="12" y2="6"></line>
                          <line x1="12" y1="18" x2="12" y2="22"></line>
                          <line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line>
                          <line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line>
                          <line x1="2" y1="12" x2="6" y2="12"></line>
                          <line x1="18" y1="12" x2="22" y2="12"></line>
                          <line x1="4.93" y1="19.07" x2="7.76" y2="16.24"></line>
                          <line x1="16.24" y1="7.76" x2="19.07" y2="4.93"></line>
                        </svg>
                        <span>Uploading &amp; Verifying...</span>
                      </>
                    ) : (
                      <span>Submit Version {nextVersion} for Review</span>
                    )}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* ─────────────────────────────────────────────────────────────────────────────
              SUBMISSION HISTORY
             ───────────────────────────────────────────────────────────────────────────── */}
          {submissions.length > 0 && (
            <div className={styles.historyCard}>
              <h3 className={styles.cardTitle}>Submission History</h3>
              <div className={styles.historyList}>
                {submissions.map((sub) => {
                  const rawFileUrl = sub.fileUrl?.startsWith("data:")
                    ? sub.fileUrl
                    : `${API_URL}/mission-statements/${encodeURIComponent(sub.id)}/file`;
                  const fileUrl = sanitizeExternalUrl(rawFileUrl) || "#";
                  const sizeMb = (sub.sizeBytes / (1024 * 1024)).toFixed(2);

                  return (
                    <div key={sub.id} className={styles.historyItem}>
                      <div className={styles.historyLeft}>
                        <span className={styles.versionBadge}>v{sub.version}</span>
                        <div>
                          <a
                            href={fileUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={styles.downloadLink}
                            title="Download document"
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                              <polyline points="14 2 14 8 20 8"></polyline>
                              <line x1="12" y1="18" x2="12" y2="12"></line>
                              <line x1="9" y1="15" x2="15" y2="15"></line>
                            </svg>
                            <span>{sub.fileName}</span>
                          </a>
                          <div style={{ fontSize: "0.78rem", color: "#64748b", marginTop: "2px" }}>
                            {sizeMb} MB · Uploaded {new Date(sub.createdAt).toLocaleDateString()} at {new Date(sub.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </div>
                        </div>
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        <span className={`${styles.statusPill} ${styles[sub.status]}`}>
                          {sub.status === "SUBMITTED" ? "In Review" : sub.status}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
