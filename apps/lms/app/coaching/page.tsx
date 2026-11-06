"use client";

import { useEffect, useState, FormEvent } from "react";
import Link from "next/link";
import styles from "./coaching.module.css";
import CoachingLoading from "./loading";
import {
  API_URL,
  getAuthHeaders,
  fetchMyOneOnOneRequests,
  createOneOnOneRequest,
  cancelOneOnOneRequest,
  type MyOneOnOneRequest,
} from "../lib/api";
import { sanitizeExternalUrl } from "../lib/auth-redirect";

interface UserProfile {
  id: string;
  name: string;
  email: string;
  timezone?: string;
  enrolments?: Array<{
    id: string;
    programId: string;
    status: string;
    oneOnOneCompletedAt?: string | null;
    program?: { id: string; title: string };
  }>;
}

interface StageEvalResponse {
  stages: {
    STAGE_1_CURRICULUM: { isCompleted: boolean; isUnlocked: boolean };
    STAGE_2_EXAM: { isCompleted: boolean; isUnlocked: boolean };
    STAGE_3_ATTENDANCE: { isCompleted: boolean; isUnlocked: boolean };
    STAGE_4_ONE_ON_ONE: { isCompleted: boolean; isUnlocked: boolean; unmetRequirements?: string[] };
    STAGE_5_MISSION_STATEMENT: { isCompleted: boolean; isUnlocked: boolean };
  };
}

export default function CoachingPage() {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [enrolmentId, setEnrolmentId] = useState<string>("");
  const [isStage4Unlocked, setIsStage4Unlocked] = useState(false);
  const [isStage4Completed, setIsStage4Completed] = useState(false);
  const [unmetPrereqs, setUnmetPrereqs] = useState<string[]>([]);

  // Requests state
  const [requests, setRequests] = useState<MyOneOnOneRequest[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);

  // Form input state
  const [bookingDate, setBookingDate] = useState("");
  const [bookingTime, setBookingTime] = useState("10:00");
  const [bookingDuration, setBookingDuration] = useState("30");
  const [learnerNotes, setLearnerNotes] = useState("");
  const [userTimezone, setUserTimezone] = useState(
    Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Dubai"
  );

  const loadData = async () => {
    setLoading(true);
    try {
      const authHeaders = getAuthHeaders();
      const meRes = await fetch(`${API_URL}/auth/me`, { headers: authHeaders });
      if (!meRes.ok) return;
      const me: UserProfile = await meRes.json();
      setUser(me);
      if (me.timezone) setUserTimezone(me.timezone);

      const activeEnrolment = me.enrolments?.find(
        (e) => e.status === "ACTIVE" || e.status === "COMPLETED"
      );

      if (activeEnrolment) {
        setEnrolmentId(activeEnrolment.id);

        // Fetch progression tree evaluation
        const progRes = await fetch(
          `${API_URL}/progression/tree/${activeEnrolment.id}`,
          { headers: authHeaders }
        ).catch(() => null);

        if (progRes && progRes.ok) {
          const progData: StageEvalResponse = await progRes.json();
          const s4 = progData.stages?.STAGE_4_ONE_ON_ONE;
          setIsStage4Unlocked(Boolean(s4?.isUnlocked));
          setIsStage4Completed(Boolean(s4?.isCompleted));
          const prereqs = (s4 as any)?.unmetPrerequisites ?? s4?.unmetRequirements;
          if (Array.isArray(prereqs) && prereqs.length > 0) {
            setUnmetPrereqs(prereqs);
          }
        } else {
          // Fallback if progression tree fails: if oneOnOneCompletedAt is set
          setIsStage4Completed(Boolean(activeEnrolment.oneOnOneCompletedAt));
          setIsStage4Unlocked(true);
        }
      }

      // Fetch existing 1-on-1 requests
      const reqs = await fetchMyOneOnOneRequests().catch(() => []);
      setRequests(reqs);
    } catch (err) {
      console.error("Failed to load coaching data", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const activeRequest = requests.find(
    (r) => r.status === "PENDING_APPROVAL" || r.status === "APPROVED"
  );

  const isPastPending = Boolean(
    activeRequest &&
      activeRequest.status === "PENDING_APPROVAL" &&
      activeRequest.requestedStart &&
      new Date(activeRequest.requestedStart).getTime() < Date.now()
  );

  const handleBookingSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!enrolmentId) return;
    setFormError(null);
    setFormSuccess(null);

    if (!bookingDate) {
      setFormError("Please select a session date.");
      return;
    }

    const start = new Date(`${bookingDate}T${bookingTime}:00`);
    const end = new Date(start.getTime() + Number(bookingDuration) * 60 * 1000);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      setFormError("Invalid session time selected.");
      return;
    }

    if (start.getTime() <= Date.now() + 60 * 60 * 1000) {
      setFormError("Coaching sessions must be requested at least 1 hour in advance.");
      return;
    }

    setIsSubmitting(true);
    try {
      await createOneOnOneRequest({
        enrolmentId,
        requestedStart: start.toISOString(),
        requestedEnd: end.toISOString(),
        learnerTimezone: userTimezone,
        notes: learnerNotes,
        reschedule: isPastPending,
      } as any);

      setFormSuccess(
        "Your 1-on-1 coaching request has been submitted! Roweena and the coaching team will review your slot."
      );
      setLearnerNotes("");
      await loadData();
    } catch (err: any) {
      setFormError(err?.message || "Failed to submit coaching request");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancelRequest = async (id: string) => {
    if (!confirm("Are you sure you want to cancel this coaching session request?")) return;
    try {
      await cancelOneOnOneRequest(id);
      await loadData();
    } catch (err: any) {
      alert(err?.message || "Failed to cancel request");
    }
  };

  if (loading) {
    return <CoachingLoading />;
  }

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.stepBadge}>STAGE 4 OF 5</div>
        <h1 className={styles.title}>1-on-1 Coaching Session</h1>
        <p className={styles.subtitle}>
          Dedicated 1-on-1 milestone with Roweena or your batch trainer. Deep dive into curriculum insights, personal breakthroughs, and prepare for your Stage 5 Mission Statement.
        </p>
      </div>

      {/* ── STAGE 4 LOCKED STATE ── */}
      {!isStage4Unlocked && !isStage4Completed && (
        <div className={styles.lockedCard}>
          <div className={styles.lockIconWrap}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </div>
          <h2 className={styles.lockedTitle}>Stage 4 is Currently Locked</h2>
          <p className={styles.lockedDesc}>
            To unlock your 1-on-1 coaching call with Roweena, you must first complete the foundational curriculum, pass your comprehensive final exam, and satisfy live attendance requirements.
          </p>

          <div className={styles.prerequisitesList}>
            <div className={styles.prereqItem}>
              <span>&bull;</span>
              <span><strong>Stage 1:</strong> Complete all 11 curriculum steps and step quizzes</span>
            </div>
            <div className={styles.prereqItem}>
              <span>&bull;</span>
              <span><strong>Stage 2:</strong> Pass the 50-Question Final Assessment (and Oral Assessment if required)</span>
            </div>
            <div className={styles.prereqItem}>
              <span>&bull;</span>
              <span><strong>Stage 3:</strong> Reach cumulative hybrid live attendance compliance</span>
            </div>
          </div>

          <div style={{ marginTop: "0.5rem" }}>
            <Link href="/courses" className={styles.primaryBtn}>
              Continue Curriculum &rarr;
            </Link>
          </div>
        </div>
      )}

      {/* ── STAGE 4 UNLOCKED OR COMPLETED ── */}
      {(isStage4Unlocked || isStage4Completed) && (
        <>
          {/* Completed Notice */}
          {isStage4Completed && (
            <div className={styles.bannerSuccess}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", fontWeight: 700, color: "#15803d" }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                  <polyline points="22 4 12 14.01 9 11.01" />
                </svg>
                <span>Stage 4 Completed! 1-on-1 Coaching Satisfied</span>
              </div>
              <p style={{ margin: 0, fontSize: "0.9rem", color: "#166534" }}>
                Congratulations! You have completed your dedicated 1-on-1 coaching session. Stage 5 (Mission Statement) is now unlocked.
              </p>
              <div>
                <Link href="/" className={styles.primaryBtn} style={{ background: "#15803d" }}>
                  Proceed to Stage 5: Mission Statement &rarr;
                </Link>
              </div>
            </div>
          )}

          {/* Active Request: APPROVED */}
          {activeRequest && activeRequest.status === "APPROVED" && activeRequest.session && (
            <div className={styles.bannerSuccess}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "10px" }}>
                <div>
                  <div style={{ fontSize: "0.8rem", fontWeight: 700, color: "#166534", textTransform: "uppercase" }}>
                    Confirmed Session
                  </div>
                  <h3 style={{ margin: "4px 0 0", fontSize: "1.25rem", color: "#14532d", fontWeight: 800 }}>
                    {activeRequest.session.title}
                  </h3>
                  <p style={{ margin: "6px 0 0", fontSize: "0.9rem", color: "#166534" }}>
                    <strong>Time:</strong> {new Date(activeRequest.session.startTime).toLocaleString()} ({activeRequest.learnerTimezone || userTimezone})
                  </p>
                  {activeRequest.session.hostTrainer && (
                    <p style={{ margin: "4px 0 0", fontSize: "0.88rem", color: "#166534" }}>
                      <strong>Coach:</strong> {activeRequest.session.hostTrainer.name || activeRequest.session.hostTrainer.email}
                    </p>
                  )}
                </div>
                {sanitizeExternalUrl(activeRequest.session.joinUrl) && (
                  <a
                    href={sanitizeExternalUrl(activeRequest.session.joinUrl)!}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.primaryBtn}
                    style={{ background: "#2563eb" }}
                  >
                    Join Zoom Meeting &rarr;
                  </a>
                )}
              </div>
              <p style={{ fontSize: "0.82rem", color: "#166534", margin: "8px 0 0" }}>
                Tip: Please join 5 minutes early with your microphone and camera tested.
              </p>
            </div>
          )}

          {/* Active Request: PENDING_APPROVAL and slot passed (EXPIRED) */}
          {activeRequest && activeRequest.status === "PENDING_APPROVAL" && isPastPending && (
            <div className={styles.bannerPending} style={{ borderLeftColor: "#dc2626", background: "#fef2f2" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "10px" }}>
                <div>
                  <div style={{ fontSize: "0.8rem", fontWeight: 700, color: "#991b1b", textTransform: "uppercase" }}>
                    ⚠️ Requested Slot Expired
                  </div>
                  <h3 style={{ margin: "4px 0 0", fontSize: "1.15rem", color: "#7f1d1d", fontWeight: 800 }}>
                    Slot for {new Date(activeRequest.requestedStart).toLocaleDateString()} at {new Date(activeRequest.requestedStart).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} has passed
                  </h3>
                  <p style={{ margin: "6px 0 0", fontSize: "0.85rem", color: "#991b1b" }}>
                    This requested slot passed without instructor confirmation. Please select a new upcoming date and time below to reschedule your session.
                  </p>
                </div>
                <button
                  type="button"
                  className={styles.dangerBtn}
                  onClick={() => handleCancelRequest(activeRequest.id)}
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}

          {/* Active Request: PENDING_APPROVAL and slot is upcoming */}
          {activeRequest && activeRequest.status === "PENDING_APPROVAL" && !isPastPending && (
            <div className={styles.bannerPending}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "10px" }}>
                <div>
                  <div style={{ fontSize: "0.8rem", fontWeight: 700, color: "#92400e", textTransform: "uppercase" }}>
                    Request Pending Review
                  </div>
                  <h3 style={{ margin: "4px 0 0", fontSize: "1.15rem", color: "#78350f", fontWeight: 800 }}>
                    Requested: {new Date(activeRequest.requestedStart).toLocaleDateString()} at {new Date(activeRequest.requestedStart).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </h3>
                  <p style={{ margin: "4px 0 0", fontSize: "0.88rem", color: "#92400e" }}>
                    Timezone: {activeRequest.learnerTimezone || userTimezone}
                  </p>
                  {activeRequest.notes && (
                    <p style={{ margin: "4px 0 0", fontSize: "0.85rem", color: "#92400e" }}>
                      Notes: {activeRequest.notes}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  className={styles.dangerBtn}
                  onClick={() => handleCancelRequest(activeRequest.id)}
                >
                  Cancel Request
                </button>
              </div>
              <p style={{ margin: "6px 0 0", fontSize: "0.82rem", color: "#b45309" }}>
                Our team is reviewing your requested slot against Roweena’s availability. You will receive an email once approved with your Zoom invite.
              </p>
            </div>
          )}

          {/* Booking Form (If no active pending/approved request, OR previous pending request has expired) */}
          {(!activeRequest || isPastPending) && !isStage4Completed && (
            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <div>
                  <h2 className={styles.cardTitle}>Schedule Your 1-on-1 Coaching Call</h2>
                  <p className={styles.cardDesc}>
                    Pick a convenient date and time. Roweena or your assigned trainer will meet with you over Zoom.
                  </p>
                </div>
              </div>

              {formError && (
                <div style={{ padding: "0.75rem 1rem", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "8px", color: "#dc2626", fontSize: "0.88rem", marginBottom: "1rem" }}>
                  {formError}
                </div>
              )}
              {formSuccess && (
                <div style={{ padding: "0.75rem 1rem", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: "8px", color: "#166534", fontSize: "0.88rem", marginBottom: "1rem" }}>
                  {formSuccess}
                </div>
              )}

              <form onSubmit={handleBookingSubmit}>
                <div className={styles.formGrid}>
                  <div className={styles.field}>
                    <label className={styles.label}>Session Date *</label>
                    <input
                      type="date"
                      required
                      min={new Date().toISOString().split("T")[0]}
                      value={bookingDate}
                      onChange={(e) => setBookingDate(e.target.value)}
                      className={styles.input}
                    />
                  </div>

                  <div className={styles.field}>
                    <label className={styles.label}>Start Time *</label>
                    <input
                      type="time"
                      required
                      value={bookingTime}
                      onChange={(e) => setBookingTime(e.target.value)}
                      className={styles.input}
                    />
                  </div>

                  <div className={styles.field}>
                    <label className={styles.label}>Duration</label>
                    <select
                      value={bookingDuration}
                      onChange={(e) => setBookingDuration(e.target.value)}
                      className={styles.input}
                    >
                      <option value="30">30 Minutes (Recommended)</option>
                      <option value="45">45 Minutes</option>
                      <option value="60">60 Minutes</option>
                    </select>
                  </div>

                  <div className={styles.field}>
                    <label className={styles.label}>Your Timezone</label>
                    <input
                      type="text"
                      disabled
                      value={userTimezone}
                      className={styles.input}
                      style={{ opacity: 0.8 }}
                    />
                  </div>
                </div>

                <div className={styles.field} style={{ marginBottom: "1.25rem" }}>
                  <label className={styles.label}>Discussion Topics &amp; Questions (Optional)</label>
                  <textarea
                    rows={3}
                    value={learnerNotes}
                    onChange={(e) => setLearnerNotes(e.target.value)}
                    placeholder="Share any key breakthroughs from the 11 steps, specific questions for Roweena, or milestones you want to review..."
                    className={styles.textarea}
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className={styles.primaryBtn}
                >
                  {isSubmitting ? "Submitting Request..." : "Request Coaching Session"}
                </button>
              </form>
            </div>
          )}

          {/* Past Request History */}
          {requests.length > 0 && (
            <div className={styles.card} style={{ marginTop: "1rem" }}>
              <h3 style={{ fontSize: "1.05rem", fontWeight: 700, margin: "0 0 1rem", color: "#18181b" }}>
                Request History
              </h3>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                {requests.map((r) => (
                  <div
                    key={r.id}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "0.75rem 1rem",
                      background: "#fafafa",
                      border: "1px solid #e4e4e7",
                      borderRadius: "8px",
                      fontSize: "0.88rem",
                      flexWrap: "wrap",
                      gap: "8px",
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 600 }}>
                        {new Date(r.requestedStart).toLocaleDateString()} at {new Date(r.requestedStart).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </div>
                      <div style={{ fontSize: "0.78rem", color: "#71717a" }}>
                        Submitted {new Date(r.createdAt).toLocaleDateString()} &bull; Timezone: {r.learnerTimezone || "UTC"}
                      </div>
                      {r.decisionReason && (
                        <div style={{ fontSize: "0.8rem", color: "#dc2626", marginTop: "2px" }}>
                          Note: {r.decisionReason}
                        </div>
                      )}
                    </div>
                    <div>
                      <span
                        style={{
                          padding: "2px 8px",
                          borderRadius: "6px",
                          fontSize: "0.75rem",
                          fontWeight: 700,
                          background:
                            r.status === "APPROVED"
                              ? "#dcfce7"
                              : r.status === "PENDING_APPROVAL"
                              ? "#fef3c7"
                              : "#fee2e2",
                          color:
                            r.status === "APPROVED"
                              ? "#15803d"
                              : r.status === "PENDING_APPROVAL"
                              ? "#b45309"
                              : "#dc2626",
                        }}
                      >
                        {r.status.replace(/_/g, " ")}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
