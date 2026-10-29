"use client";

import { useEffect, useState, use, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import CompulsoryVideoPlayer from "../../../steps/[stepId]/CompulsoryVideoPlayer";
import { API_URL, getAuthHeaders, parseApiError } from "../../../lib/api";

interface SessionData {
  id: string;
  title: string;
  description?: string | null;
  startTime: string;
  endTime: string;
  durationMinutes?: number | null;
  minAttendanceMinutes?: number | null;
  recordingUrl?: string | null;
  recordingLink?: string | null;
  batch?: {
    id: string;
    name: string;
    program?: { id: string; title: string; minAttendancePercentage?: number | null };
  } | null;
}

interface RecordingProgressState {
  liveMinutes: number;
  recordedMinutes: number;
  totalMinutes: number;
  requiredMinutes: number;
  isCompliant: boolean;
  status: string;
  progressPercent: number;
}

export default function SessionRecordingPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const unwrappedParams = use(params);
  const sessionId = unwrappedParams.id;

  const [session, setSession] = useState<SessionData | null>(null);
  const [currentUser, setCurrentUser] = useState<{ name?: string; email?: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [progressState, setProgressState] = useState<RecordingProgressState>({
    liveMinutes: 0,
    recordedMinutes: 0,
    totalMinutes: 0,
    requiredMinutes: 45,
    isCompliant: false,
    status: "ABSENT",
    progressPercent: 0,
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const headers = getAuthHeaders();

      // 1. Fetch user profile for watermark
      const meRes = await fetch(`${API_URL}/auth/me`, { headers });
      if (meRes.ok) {
        const meData = await meRes.json();
        setCurrentUser(meData);
      }

      // 2. Fetch session details
      const sessionRes = await fetch(`${API_URL}/sessions/${encodeURIComponent(sessionId)}`, { headers });
      if (!sessionRes.ok) {
        const err = await parseApiError(sessionRes);
        throw new Error(err.message || `Session not found (${sessionRes.status})`);
      }
      const sessionData: SessionData = await sessionRes.json();
      setSession(sessionData);

      // 3. Fetch user's current attendance record
      const attRes = await fetch(`${API_URL}/me/attendance`, { headers });
      if (attRes.ok) {
        const attData = await attRes.json();
        const currentSessionAtt = (attData?.history || []).find(
          (h: any) => h.sessionId === sessionId
        );

        if (currentSessionAtt) {
          const liveMin = currentSessionAtt.liveMinutes ?? currentSessionAtt.minutesPresent ?? 0;
          const recMin = currentSessionAtt.recordedMinutes ?? 0;
          const totMin = liveMin + recMin;
          const reqMin =
            sessionData.minAttendanceMinutes ??
            Math.round(((sessionData.durationMinutes || 60) * 0.75));
          const compliant =
            ["PRESENT", "PRESENT_AUTO", "PRESENT_MANUAL", "CORRECTED", "PRESENT_LIVE", "PRESENT_RECORDED"].includes(
              currentSessionAtt.status
            ) || totMin >= reqMin;

          setProgressState({
            liveMinutes: liveMin,
            recordedMinutes: recMin,
            totalMinutes: totMin,
            requiredMinutes: reqMin,
            isCompliant: compliant,
            status: currentSessionAtt.status,
            progressPercent: reqMin > 0 ? Math.min(100, Math.round((totMin / reqMin) * 100)) : 100,
          });
        }
      }
    } catch (err: any) {
      setError(err?.message || "Failed to load session recording");
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleHeartbeat = async (
    positionSec: number,
    isEnded?: boolean,
    videoDurationSec?: number,
    _deltaSec?: number,
    fromSec?: number,
    toSec?: number,
    options?: { keepalive?: boolean }
  ) => {
    try {
      const headers = { ...getAuthHeaders(), "Content-Type": "application/json" };
      const res = await fetch(`${API_URL}/sessions/${encodeURIComponent(sessionId)}/recording-progress`, {
        method: "POST",
        headers,
        keepalive: Boolean(options?.keepalive),
        body: JSON.stringify({
          positionSec,
          fromSec,
          toSec,
          isEnded,
          videoDurationSec,
        }),
      });

      if (res.ok) {
        const result = await res.json();
        setProgressState((prev) => ({
          liveMinutes: result.liveMinutes ?? prev.liveMinutes,
          recordedMinutes: result.recordedMinutes ?? prev.recordedMinutes,
          totalMinutes: result.totalMinutes ?? prev.totalMinutes,
          requiredMinutes: result.requiredMinutes ?? prev.requiredMinutes,
          isCompliant: result.isCompliant || prev.isCompliant,
          status: result.attendanceStatus || prev.status,
          progressPercent:
            result.requiredMinutes > 0
              ? Math.min(100, Math.round((result.totalMinutes / result.requiredMinutes) * 100))
              : 100,
        }));
      }
    } catch (e) {
      console.warn("[SessionRecording] Heartbeat failed silently:", e);
    }
  };

  const recordingUrl = session?.recordingUrl || session?.recordingLink;

  if (loading) {
    return (
      <div style={{ padding: "40px 24px", maxWidth: "1000px", margin: "0 auto" }}>
        <p style={{ color: "#64748b" }}>Loading session recording...</p>
      </div>
    );
  }

  if (error || !session) {
    return (
      <div style={{ padding: "40px 24px", maxWidth: "1000px", margin: "0 auto" }}>
        <Link href="/attendance" style={{ color: "#0284c7", textDecoration: "none", fontSize: "0.9rem" }}>
          ← Back to Attendance
        </Link>
        <div style={{ marginTop: "24px", padding: "16px", background: "#fef2f2", color: "#b91c1c", borderRadius: "8px" }}>
          {error || "Session not found"}
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: "32px 24px", maxWidth: "1100px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "24px" }}>
      {/* Top Breadcrumb & Status */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
        <Link href="/attendance" style={{ color: "#0284c7", textDecoration: "none", fontSize: "0.9rem", fontWeight: 500 }}>
          ← Back to Attendance
        </Link>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span
            style={{
              padding: "4px 10px",
              borderRadius: "16px",
              fontSize: "0.8rem",
              fontWeight: 600,
              background: progressState.isCompliant ? "#dcfce7" : "#fef3c7",
              color: progressState.isCompliant ? "#15803d" : "#b45309",
            }}
          >
            {progressState.isCompliant ? "✓ Attendance Satisfied" : "In Progress"}
          </span>
          <span style={{ fontSize: "0.85rem", color: "#64748b" }}>
            Status: <strong>{progressState.status}</strong>
          </span>
        </div>
      </div>

      {/* Session Title & Metadata */}
      <div>
        <h1 style={{ fontSize: "1.6rem", fontWeight: 700, color: "#0f172a", marginBottom: "6px" }}>
          {session.title}
        </h1>
        {session.batch && (
          <p style={{ fontSize: "0.9rem", color: "#64748b", margin: 0 }}>
            {session.batch.program?.title ? `${session.batch.program.title} · ` : ""}
            {session.batch.name}
          </p>
        )}
      </div>

      {/* Compliance Metric Card */}
      <div
        style={{
          background: "#ffffff",
          border: "1px solid #e2e8f0",
          borderRadius: "12px",
          padding: "20px",
          display: "flex",
          flexDirection: "column",
          gap: "12px",
          boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: "8px" }}>
          <div>
            <span style={{ fontSize: "0.85rem", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600 }}>
              Attendance Progress (Live + Recorded)
            </span>
            <div style={{ fontSize: "1.2rem", fontWeight: 700, color: "#0f172a", marginTop: "2px" }}>
              {Math.round(progressState.totalMinutes * 10) / 10} / {progressState.requiredMinutes} mins required
            </div>
          </div>
          <div style={{ fontSize: "0.85rem", color: "#64748b" }}>
            Live: <strong>{Math.round(progressState.liveMinutes * 10) / 10}m</strong> · Recorded:{" "}
            <strong>{Math.round(progressState.recordedMinutes * 10) / 10}m</strong>
          </div>
        </div>

        {/* Progress Bar */}
        <div style={{ width: "100%", height: "8px", background: "#f1f5f9", borderRadius: "4px", overflow: "hidden" }}>
          <div
            style={{
              width: `${Math.min(100, (progressState.totalMinutes / (progressState.requiredMinutes || 1)) * 100)}%`,
              height: "100%",
              background: progressState.isCompliant ? "#22c55e" : "#0284c7",
              transition: "width 0.3s ease",
            }}
          />
        </div>

        {progressState.isCompliant && (
          <div
            style={{
              background: "#f0fdf4",
              border: "1px solid #bbf7d0",
              color: "#166534",
              borderRadius: "8px",
              padding: "10px 14px",
              fontSize: "0.85rem",
              fontWeight: 500,
            }}
          >
            ✓ You have completed the required watch threshold for this session! Your Stage 3 Attendance requirement is satisfied.
          </div>
        )}
      </div>

      {/* Video Player */}
      <div style={{ background: "#000000", borderRadius: "12px", overflow: "hidden", minHeight: "420px" }}>
        {recordingUrl ? (
          <CompulsoryVideoPlayer
            lessonId={session.id}
            videoSrc={recordingUrl}
            userName={currentUser?.name || "Learner"}
            userEmail={currentUser?.email || ""}
            durationSec={(session.durationMinutes || 60) * 60}
            onHeartbeat={handleHeartbeat}
            onComplete={() => {
              handleHeartbeat(
                (session.durationMinutes || 60) * 60,
                true,
                (session.durationMinutes || 60) * 60
              );
            }}
          />
        ) : (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              height: "360px",
              color: "#94a3b8",
              gap: "8px",
            }}
          >
            <p style={{ fontSize: "1.05rem", fontWeight: 600 }}>No recording available yet for this session.</p>
            <p style={{ fontSize: "0.85rem", color: "#64748b" }}>
              Please check back after the instructor uploads or links the meeting recording.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
