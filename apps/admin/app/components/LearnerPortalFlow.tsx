"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import styles from "./LearnerPortalFlow.module.css";
import { API_URL, cachedFetch } from "../lib/api";

export interface StageNode {
  key: string;
  stageNumber: number;
  title: string;
  description: string;
  isUnlocked: boolean;
  isCompleted: boolean;
  completedAt?: string | null;
  unmetRequirements?: string[];
  adminActionUrl?: string;
  adminActionLabel?: string;
}

export interface LearnerPortalFlowProps {
  enrolmentId: string;
  learnerName?: string;
  onRefresh?: () => void;
  className?: string;
}

export function LearnerPortalFlow({
  enrolmentId,
  learnerName,
  className = "",
}: LearnerPortalFlowProps) {
  const [stages, setStages] = useState<StageNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProgressionTree = async () => {
    if (!enrolmentId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await cachedFetch(`${API_URL}/progression/tree/${enrolmentId}`, {
        skipCache: true,
      });

      if (!res.ok) {
        throw new Error("Could not load learner progression tree");
      }

      const data = await res.json();
      const st = data.stages || {};

      const nodes: StageNode[] = [
        {
          key: "STAGE_1_CURRICULUM",
          stageNumber: 1,
          title: "Curriculum & Videos",
          description: "Modules 1–11 with 10s heartbeat watch tracking and check quizzes.",
          isUnlocked: Boolean(st.STAGE_1_CURRICULUM?.isUnlocked ?? true),
          isCompleted: Boolean(st.STAGE_1_CURRICULUM?.isCompleted),
          completedAt: st.STAGE_1_CURRICULUM?.completedAt,
          unmetRequirements: st.STAGE_1_CURRICULUM?.unmetRequirements,
          adminActionUrl: `/programs/${data.programId || ""}`,
          adminActionLabel: "View Course",
        },
        {
          key: "STAGE_2_EXAM",
          stageNumber: 2,
          title: "Randomized Exam",
          description: "50-question randomized pool assessment with server timer.",
          isUnlocked: Boolean(st.STAGE_2_EXAM?.isUnlocked),
          isCompleted: Boolean(st.STAGE_2_EXAM?.isCompleted),
          completedAt: st.STAGE_2_EXAM?.completedAt,
          unmetRequirements: st.STAGE_2_EXAM?.unmetRequirements,
          adminActionUrl: `/programs/${data.programId || ""}`,
          adminActionLabel: "Exam Settings",
        },
        {
          key: "STAGE_3_ATTENDANCE",
          stageNumber: 3,
          title: "Hybrid Attendance",
          description: "Live Zoom threshold (≥50%) or recorded session watch minutes.",
          isUnlocked: Boolean(st.STAGE_3_ATTENDANCE?.isUnlocked),
          isCompleted: Boolean(st.STAGE_3_ATTENDANCE?.isCompleted),
          completedAt: st.STAGE_3_ATTENDANCE?.completedAt,
          unmetRequirements: st.STAGE_3_ATTENDANCE?.unmetRequirements,
          adminActionUrl: "/batches",
          adminActionLabel: "Attendance",
        },
        {
          key: "STAGE_4_ONE_ON_ONE",
          stageNumber: 4,
          title: "1-on-1 Coaching Call",
          description: "Student-booked, admin-approved session with T-10m reminder.",
          isUnlocked: Boolean(st.STAGE_4_ONE_ON_ONE?.isUnlocked),
          isCompleted: Boolean(st.STAGE_4_ONE_ON_ONE?.isCompleted),
          completedAt: st.STAGE_4_ONE_ON_ONE?.completedAt,
          unmetRequirements: st.STAGE_4_ONE_ON_ONE?.unmetRequirements,
          adminActionUrl: "/meetings",
          adminActionLabel: "Review Bookings",
        },
        {
          key: "STAGE_5_MISSION_STATEMENT",
          stageNumber: 5,
          title: "Mission Statement",
          description: "Handwritten upload review triggering automated graduation certificate.",
          isUnlocked: Boolean(st.STAGE_5_MISSION_STATEMENT?.isUnlocked),
          isCompleted: Boolean(st.STAGE_5_MISSION_STATEMENT?.isCompleted),
          completedAt: st.STAGE_5_MISSION_STATEMENT?.completedAt,
          unmetRequirements: st.STAGE_5_MISSION_STATEMENT?.unmetRequirements,
          adminActionUrl: "/approvals",
          adminActionLabel: "Review Queue",
        },
      ];

      setStages(nodes);
    } catch (err: any) {
      setError(err.message || "Failed to fetch stage progression");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProgressionTree();
  }, [enrolmentId]);

  if (loading) {
    return (
      <div className={`${styles.flowContainer} ${className}`} style={{ textAlign: "center", padding: "1.5rem" }}>
        <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--text-muted, #64748b)" }}>
          Loading 5-Stage Progression Pipeline state machine...
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`${styles.flowContainer} ${className}`} style={{ padding: "1rem" }}>
        <p style={{ margin: 0, fontSize: "0.85rem", color: "#dc2626", display: "flex", alignItems: "center", gap: "6px" }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          <span>Progression State Error: {error}</span>
        </p>
      </div>
    );
  }

  const completedCount = stages.filter((s) => s.isCompleted).length;

  return (
    <div className={`${styles.flowContainer} ${className}`}>
      <div className={styles.flowHeader}>
        <div>
          <h3 className={styles.flowTitle}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#b8860b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"></path>
            </svg>
            <span>5-Stage Learner Progression Pipeline</span>
          </h3>
          <p className={styles.flowSubtitle}>
            {learnerName ? `Active gating for ${learnerName} · ` : ""}
            Stage N+1 remains strictly locked until Stage N is marked COMPLETED.
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{
            fontSize: "0.78rem",
            fontWeight: 700,
            padding: "3px 9px",
            borderRadius: "12px",
            background: completedCount === 5 ? "#dcfce7" : "#f1f5f9",
            color: completedCount === 5 ? "#166534" : "#475569",
          }}>
            {completedCount} of 5 Stages Completed
          </span>
          <button
            type="button"
            onClick={fetchProgressionTree}
            title="Refresh Progression State"
            style={{
              background: "none",
              border: "1px solid var(--border-light, #e2e8f0)",
              borderRadius: "6px",
              padding: "4px 8px",
              cursor: "pointer",
              fontSize: "0.75rem",
              color: "#64748b",
            }}
          >
            ↻
          </button>
        </div>
      </div>

      <div className={styles.stagesTrack}>
        {stages.map((st) => {
          const status = st.isCompleted
            ? "COMPLETED"
            : st.isUnlocked
            ? "UNLOCKED"
            : "LOCKED";

          return (
            <div key={st.key} className={`${styles.stageCard} ${styles[status]}`}>
              <div className={styles.stageTopRow}>
                <span className={styles.stageNumberBadge}>
                  Stage {st.stageNumber}
                </span>
                <span className={styles.stageStatusIcon} title={status}>
                  {status === "COMPLETED" ? "✓" : status === "UNLOCKED" ? "🔓" : "🔒"}
                </span>
              </div>

              <h4 className={styles.stageTitle}>{st.title}</h4>
              <p className={styles.stageDesc}>{st.description}</p>

              {st.unmetRequirements && st.unmetRequirements.length > 0 && (
                <div className={styles.unmetBox}>
                  <strong>Blocking:</strong> {st.unmetRequirements[0]}
                </div>
              )}

              <div className={styles.stageFooter}>
                <span>
                  {st.isCompleted
                    ? st.completedAt
                      ? new Date(st.completedAt).toLocaleDateString()
                      : "Completed"
                    : st.isUnlocked
                    ? "In Progress"
                    : "Locked"}
                </span>

                {st.adminActionUrl && (
                  <Link href={st.adminActionUrl} className={styles.actionLink}>
                    {st.adminActionLabel} &rarr;
                  </Link>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
