"use client";

import { useEffect, useState, useMemo } from "react";
import { API_URL, errorMessage } from "../../../lib/api";
import { TableSkeleton } from "../../../components";

interface StepItem {
  id: string;
  sequence: number;
  title: string;
  description?: string;
  lessons?: any[];
  quiz?: any | null;
}

interface EnrolmentItem {
  id: string;
  userId: string;
  status: string;
  stepProgress?: Array<{
    stepId: string;
    isCompleted: boolean;
  }>;
  examAttempts?: Array<{
    score: number;
    passed: boolean;
  }>;
  oneOnOneRequests?: Array<{
    status: string;
    session?: {
      status: string;
    } | null;
  }>;
  missionStatements?: Array<{
    status: string;
  }>;
  certificate?: {
    status: string;
  } | null;
}

interface ProgramAnalyticsPanelProps {
  programId: string;
  programTitle?: string;
  steps: StepItem[];
}

export default function ProgramAnalyticsPanel({
  programId,
  programTitle,
  steps,
}: ProgramAnalyticsPanelProps) {
  const [enrolments, setEnrolments] = useState<EnrolmentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      setError(null);
      try {
        const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
        const res = await fetch(`${API_URL}/admin/enrolments?programId=${programId}&limit=100`, {
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        });
        if (!res.ok) {
          throw new Error(await errorMessage(res, "Failed to load program analytics"));
        }
        const json = await res.json();
        const list: EnrolmentItem[] = Array.isArray(json)
          ? json
          : Array.isArray(json?.data)
          ? json.data
          : [];
        setEnrolments(list);
      } catch (err: any) {
        console.error("Failed to load analytics enrolments:", err);
        setError(err.message || "Failed to load analytics data");
      } finally {
        setLoading(false);
      }
    }

    if (programId) {
      loadData();
    }
  }, [programId]);

  // Aggregate Top-Level KPIs
  const totalEnrolments = enrolments.length;
  const totalStepsCount = steps.length || 1;

  const curriculumCompletedCount = useMemo(() => {
    return enrolments.filter((e) => {
      const completedSteps = e.stepProgress?.filter((sp) => sp.isCompleted)?.length || 0;
      return completedSteps >= totalStepsCount;
    }).length;
  }, [enrolments, totalStepsCount]);

  const curriculumCompletionRate = totalEnrolments
    ? Math.round((curriculumCompletedCount / totalEnrolments) * 100)
    : 0;

  const examStats = useMemo(() => {
    const attempts = enrolments.flatMap((e) => e.examAttempts || []);
    if (attempts.length === 0) {
      return { totalAttempts: 0, passRate: 0, avgScore: 0 };
    }
    const passed = attempts.filter((a) => a.passed).length;
    const avgScore = Math.round(
      attempts.reduce((acc, cur) => acc + (cur.score || 0), 0) / attempts.length
    );
    const passRate = Math.round((passed / attempts.length) * 100);
    return { totalAttempts: attempts.length, passRate, avgScore };
  }, [enrolments]);

  const certifiedCount = useMemo(() => {
    return enrolments.filter((e) => e.certificate?.status === "ISSUED").length;
  }, [enrolments]);

  const certificationRate = totalEnrolments
    ? Math.round((certifiedCount / totalEnrolments) * 100)
    : 0;

  // Step-by-step Telemetry computation
  const stepTelemetry = useMemo(() => {
    return steps.map((step, idx) => {
      const completedLearners = enrolments.filter((e) =>
        e.stepProgress?.some((sp) => sp.stepId === step.id && sp.isCompleted)
      ).length;

      const completionRate = totalEnrolments
        ? Math.round((completedLearners / totalEnrolments) * 100)
        : 0;

      // Drop-off from previous step
      let dropOffPercent = 0;
      if (idx > 0) {
        const prevCompleted = enrolments.filter((e) =>
          e.stepProgress?.some((sp) => sp.stepId === steps[idx - 1]?.id && sp.isCompleted)
        ).length;
        if (prevCompleted > 0) {
          dropOffPercent = Math.max(
            0,
            Math.round(((prevCompleted - completedLearners) / prevCompleted) * 100)
          );
        }
      }

      const videoLessonsCount =
        step.lessons?.filter(
          (l) => l.type === "VIDEO" || l.lessonType === "VIDEO" || Boolean(l.videoUrl)
        ).length || 0;

      return {
        step,
        completedLearners,
        completionRate,
        dropOffPercent,
        videoLessonsCount,
        hasQuiz: Boolean(step.quiz),
      };
    });
  }, [steps, enrolments, totalEnrolments]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.75rem" }}>
      {/* Header */}
      <div>
        <h2 style={{ fontSize: "1.35rem", fontWeight: 700, margin: 0, color: "#14110f" }}>
          Learning Telemetry &amp; Completion Analytics
        </h2>
        <p style={{ margin: "4px 0 0", fontSize: "0.88rem", color: "#78716a" }}>
          Real-time drop-off telemetry, video watched completion, and diagnostic quiz benchmarks for{" "}
          <strong>{programTitle || "this program"}</strong>.
        </p>
      </div>

      {/* Top 4 KPI Metric Cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: "1rem",
        }}
      >
        <div
          style={{
            background: "#ffffff",
            borderRadius: 12,
            padding: "1.25rem",
            border: "1px solid #f0ebe4",
            boxShadow: "0 1px 3px rgba(0,0,0,0.02)",
          }}
        >
          <span style={{ fontSize: "0.8rem", color: "#78716a", fontWeight: 600 }}>
            Cohort Size (Enrolments)
          </span>
          <div style={{ fontSize: "1.85rem", fontWeight: 800, color: "#14110f", marginTop: 4 }}>
            {totalEnrolments}
          </div>
          <span style={{ fontSize: "0.78rem", color: "#0284c7" }}>
            Total active &amp; graduated learners
          </span>
        </div>

        <div
          style={{
            background: "#ffffff",
            borderRadius: 12,
            padding: "1.25rem",
            border: "1px solid #f0ebe4",
            boxShadow: "0 1px 3px rgba(0,0,0,0.02)",
          }}
        >
          <span style={{ fontSize: "0.8rem", color: "#78716a", fontWeight: 600 }}>
            Curriculum Completion Rate
          </span>
          <div style={{ fontSize: "1.85rem", fontWeight: 800, color: "#16a34a", marginTop: 4 }}>
            {curriculumCompletionRate}%
          </div>
          <span style={{ fontSize: "0.78rem", color: "#78716a" }}>
            {curriculumCompletedCount} of {totalEnrolments} finished all {totalStepsCount} modules
          </span>
        </div>

        <div
          style={{
            background: "#ffffff",
            borderRadius: 12,
            padding: "1.25rem",
            border: "1px solid #f0ebe4",
            boxShadow: "0 1px 3px rgba(0,0,0,0.02)",
          }}
        >
          <span style={{ fontSize: "0.8rem", color: "#78716a", fontWeight: 600 }}>
            Final Exam Pass Rate
          </span>
          <div style={{ fontSize: "1.85rem", fontWeight: 800, color: "#b8860b", marginTop: 4 }}>
            {examStats.passRate}%
          </div>
          <span style={{ fontSize: "0.78rem", color: "#78716a" }}>
            Avg Score: {examStats.avgScore}% ({examStats.totalAttempts} attempts)
          </span>
        </div>

        <div
          style={{
            background: "#ffffff",
            borderRadius: 12,
            padding: "1.25rem",
            border: "1px solid #f0ebe4",
            boxShadow: "0 1px 3px rgba(0,0,0,0.02)",
          }}
        >
          <span style={{ fontSize: "0.8rem", color: "#78716a", fontWeight: 600 }}>
            Graduation / Certified
          </span>
          <div style={{ fontSize: "1.85rem", fontWeight: 800, color: "#7c3aed", marginTop: 4 }}>
            {certificationRate}%
          </div>
          <span style={{ fontSize: "0.78rem", color: "#78716a" }}>
            {certifiedCount} certificates issued
          </span>
        </div>
      </div>

      {/* Certification Milestone Funnel */}
      <div
        style={{
          background: "#ffffff",
          borderRadius: 12,
          padding: "1.5rem",
          border: "1px solid #f0ebe4",
        }}
      >
        <h3 style={{ fontSize: "1.05rem", fontWeight: 700, margin: "0 0 1rem", color: "#14110f" }}>
          Milestone Progression Funnel
        </h3>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {[
            { label: "1. Program Enrolled", count: totalEnrolments, pct: 100, color: "#0284c7" },
            {
              label: "2. Curriculum Completed",
              count: curriculumCompletedCount,
              pct: curriculumCompletionRate,
              color: "#16a34a",
            },
            {
              label: "3. Final Exam Passed",
              count: enrolments.filter((e) => e.examAttempts?.some((a) => a.passed)).length,
              pct: totalEnrolments
                ? Math.round(
                    (enrolments.filter((e) => e.examAttempts?.some((a) => a.passed)).length /
                      totalEnrolments) *
                      100
                  )
                : 0,
              color: "#b8860b",
            },
            {
              label: "4. 1-on-1 Coaching Completed",
              count: enrolments.filter((e) =>
                e.oneOnOneRequests?.some(
                  (r) => r.status === "APPROVED" || r.session?.status === "COMPLETED"
                )
              ).length,
              pct: totalEnrolments
                ? Math.round(
                    (enrolments.filter((e) =>
                      e.oneOnOneRequests?.some(
                        (r) => r.status === "APPROVED" || r.session?.status === "COMPLETED"
                      )
                    ).length /
                      totalEnrolments) *
                      100
                  )
                : 0,
              color: "#8b5cf6",
            },
            {
              label: "5. Mission Statement & Certified",
              count: certifiedCount,
              pct: certificationRate,
              color: "#ec4899",
            },
          ].map((milestone, i) => (
            <div key={i}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: "0.82rem",
                  marginBottom: 4,
                }}
              >
                <span style={{ fontWeight: 600, color: "#292524" }}>{milestone.label}</span>
                <span style={{ color: "#78716a" }}>
                  {milestone.count} learners ({milestone.pct}%)
                </span>
              </div>
              <div
                style={{
                  width: "100%",
                  height: 10,
                  borderRadius: 6,
                  background: "#f5f2ed",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width: `${milestone.pct}%`,
                    height: "100%",
                    background: milestone.color,
                    borderRadius: 6,
                    transition: "width 0.4s ease",
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Step-by-Step Drop-off & Telemetry Table */}
      <div
        style={{
          background: "#ffffff",
          borderRadius: 12,
          border: "1px solid #f0ebe4",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: "1rem 1.25rem",
            borderBottom: "1px solid #f0ebe4",
            background: "#fdfbf7",
          }}
        >
          <h3 style={{ fontSize: "1rem", fontWeight: 700, margin: 0, color: "#14110f" }}>
            Module-by-Module Progression &amp; Drop-off Telemetry
          </h3>
          <p style={{ margin: "2px 0 0", fontSize: "0.8rem", color: "#78716a" }}>
            Pinpoint exactly where learners advance smoothly or experience drop-off.
          </p>
        </div>

        {loading ? (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.88rem" }}>
              <tbody>
                <TableSkeleton rows={4} columns={5} />
              </tbody>
            </table>
          </div>
        ) : error ? (
          <div style={{ padding: "2rem", textAlign: "center", color: "#dc2626" }}>
            Error loading module telemetry: {error}
          </div>
        ) : stepTelemetry.length === 0 ? (
          <div style={{ padding: "2rem", textAlign: "center", color: "#78716a" }}>
            No curriculum steps configured yet.
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: "0.88rem",
                textAlign: "left",
              }}
            >
              <thead>
                <tr
                  style={{
                    background: "#fbf9f6",
                    borderBottom: "1px solid #f0ebe4",
                    color: "#78716a",
                    fontWeight: 600,
                    fontSize: "0.8rem",
                    textTransform: "uppercase",
                    letterSpacing: "0.03em",
                  }}
                >
                  <th style={{ padding: "12px 16px" }}>Sequence &amp; Module</th>
                  <th style={{ padding: "12px 16px" }}>Lessons &amp; Content</th>
                  <th style={{ padding: "12px 16px" }}>Completed Learners</th>
                  <th style={{ padding: "12px 16px" }}>Completion Rate</th>
                  <th style={{ padding: "12px 16px" }}>Drop-Off from Prior</th>
                </tr>
              </thead>
              <tbody>
                {stepTelemetry.map((item, index) => (
                  <tr
                    key={item.step.id}
                    style={{
                      borderBottom: "1px solid #f5f2ed",
                      transition: "background 0.15s ease",
                    }}
                  >
                    {/* Sequence & Module Title */}
                    <td style={{ padding: "12px 16px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span
                          style={{
                            width: 26,
                            height: 26,
                            borderRadius: "50%",
                            background: "#e0e7ff",
                            color: "#3730a3",
                            fontWeight: 700,
                            fontSize: "0.8rem",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          {index + 1}
                        </span>
                        <div>
                          <div style={{ fontWeight: 600, color: "#14110f" }}>
                            {item.step.title}
                          </div>
                          {item.step.description && (
                            <div
                              style={{
                                fontSize: "0.78rem",
                                color: "#78716a",
                                maxWidth: 280,
                                whiteSpace: "nowrap",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                              }}
                            >
                              {item.step.description}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Lessons & Content */}
                    <td style={{ padding: "12px 16px", color: "#57534e" }}>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        <span
                          style={{
                            background: "#f5f5f4",
                            padding: "2px 7px",
                            borderRadius: 6,
                            fontSize: "0.78rem",
                            fontWeight: 500,
                          }}
                        >
                          {item.step.lessons?.length || 0} lessons
                        </span>
                        {item.videoLessonsCount > 0 && (
                          <span
                            style={{
                              background: "#e0f2fe",
                              color: "#0369a1",
                              padding: "2px 7px",
                              borderRadius: 6,
                              fontSize: "0.78rem",
                              fontWeight: 500,
                            }}
                          >
                            {item.videoLessonsCount} video
                          </span>
                        )}
                        {item.hasQuiz && (
                          <span
                            style={{
                              background: "#fef3c7",
                              color: "#92400e",
                              padding: "2px 7px",
                              borderRadius: 6,
                              fontSize: "0.78rem",
                              fontWeight: 600,
                            }}
                          >
                            Quiz
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Completed Learners */}
                    <td style={{ padding: "12px 16px", fontWeight: 600, color: "#14110f" }}>
                      {item.completedLearners} / {totalEnrolments}
                    </td>

                    {/* Completion Rate Bar */}
                    <td style={{ padding: "12px 16px" }}>
                      <div style={{ minWidth: 140 }}>
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            fontSize: "0.78rem",
                            marginBottom: 4,
                          }}
                        >
                          <span style={{ fontWeight: 600, color: "#16a34a" }}>
                            {item.completionRate}%
                          </span>
                        </div>
                        <div
                          style={{
                            width: "100%",
                            height: 6,
                            borderRadius: 4,
                            background: "#f3f0ea",
                            overflow: "hidden",
                          }}
                        >
                          <div
                            style={{
                              width: `${item.completionRate}%`,
                              height: "100%",
                              background: item.completionRate === 100 ? "#16a34a" : "#0284c7",
                              borderRadius: 4,
                            }}
                          />
                        </div>
                      </div>
                    </td>

                    {/* Drop-Off */}
                    <td style={{ padding: "12px 16px" }}>
                      {index === 0 ? (
                        <span style={{ color: "#a8a29e", fontSize: "0.82rem" }}>Baseline (0%)</span>
                      ) : item.dropOffPercent > 0 ? (
                        <span
                          style={{
                            color: "#dc2626",
                            fontWeight: 600,
                            fontSize: "0.82rem",
                            background: "#fef2f2",
                            padding: "2px 8px",
                            borderRadius: 6,
                          }}
                        >
                          &darr; {item.dropOffPercent}% drop
                        </span>
                      ) : (
                        <span
                          style={{
                            color: "#16a34a",
                            fontWeight: 600,
                            fontSize: "0.82rem",
                            background: "#f0fdf4",
                            padding: "2px 8px",
                            borderRadius: 6,
                          }}
                        >
                          0% retention
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
