"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { API_URL, errorMessage } from "../../../lib/api";
import { StatusBadge, TableSkeleton, EmptyState } from "../../../components";

interface EnrolmentItem {
  id: string;
  userId: string;
  programId: string;
  batchId?: string | null;
  status: string;
  createdAt: string;
  user?: {
    id: string;
    name?: string | null;
    email: string;
    phone?: string | null;
    avatarUrl?: string | null;
  };
  batch?: {
    id: string;
    name: string;
  } | null;
  program?: {
    id: string;
    title: string;
    totalSteps?: number;
  } | null;
  stepProgress?: Array<{
    stepId: string;
    isCompleted: boolean;
    completedAt?: string | null;
  }>;
  examAttempts?: Array<{
    id: string;
    score: number;
    passed: boolean;
    createdAt: string;
  }>;
  oneOnOneRequests?: Array<{
    id: string;
    status: string;
    requestedStart: string;
    session?: {
      id: string;
      startTime: string;
      endTime: string;
      status: string;
      joinUrl?: string | null;
    } | null;
  }>;
  missionStatements?: Array<{
    id: string;
    status: string;
    fileUrl: string;
    submittedAt: string;
  }>;
  certificate?: {
    id: string;
    status: string;
    certificateCode: string;
    issuedAt?: string | null;
  } | null;
}

interface ProgramEnrolmentsPanelProps {
  programId: string;
  programTitle?: string;
  totalStepsCount?: number;
}

export default function ProgramEnrolmentsPanel({
  programId,
  programTitle,
  totalStepsCount = 0,
}: ProgramEnrolmentsPanelProps) {
  const [enrolments, setEnrolments] = useState<EnrolmentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");

  async function loadEnrolments() {
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
        throw new Error(await errorMessage(res, "Could not fetch program enrolments"));
      }

      const json = await res.json();
      const list: EnrolmentItem[] = Array.isArray(json)
        ? json
        : Array.isArray(json?.data)
        ? json.data
        : [];
      setEnrolments(list);
    } catch (err: any) {
      console.error("Failed to load enrolments:", err);
      setError(err.message || "Failed to load enrolments");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (programId) {
      loadEnrolments();
    }
  }, [programId]);

  // Derived KPI Stats
  const stats = useMemo(() => {
    const total = enrolments.length;
    const active = enrolments.filter((e) => e.status === "ACTIVE").length;
    const completed = enrolments.filter(
      (e) => e.status === "COMPLETED" || e.certificate?.status === "ISSUED"
    ).length;
    const pendingAgreement = enrolments.filter((e) => e.status === "PENDING_AGREEMENT").length;
    return { total, active, completed, pendingAgreement };
  }, [enrolments]);

  // Filtered List
  const filteredList = useMemo(() => {
    return enrolments.filter((e) => {
      if (statusFilter !== "ALL" && e.status !== statusFilter) {
        return false;
      }
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const userName = (e.user?.name || "").toLowerCase();
        const userEmail = (e.user?.email || "").toLowerCase();
        const batchName = (e.batch?.name || "").toLowerCase();
        if (!userName.includes(query) && !userEmail.includes(query) && !batchName.includes(query)) {
          return false;
        }
      }
      return true;
    });
  }, [enrolments, statusFilter, searchQuery]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      {/* Top Header & Actions */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "1rem",
        }}
      >
        <div>
          <h2 style={{ fontSize: "1.35rem", fontWeight: 700, margin: 0, color: "#14110f" }}>
            Active Enrolments ({stats.total})
          </h2>
          <p style={{ margin: "4px 0 0", fontSize: "0.88rem", color: "#78716a" }}>
            Registered students progressing through {programTitle || "this curriculum"}.
          </p>
        </div>

        <button
          type="button"
          onClick={loadEnrolments}
          disabled={loading}
          style={{
            padding: "8px 16px",
            borderRadius: 8,
            border: "1px solid #e7e0d6",
            background: "#ffffff",
            color: "#44403c",
            fontSize: "0.85rem",
            fontWeight: 600,
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
          }}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="23 4 23 10 17 10" />
            <polyline points="1 20 1 14 7 14" />
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
          </svg>
          <span>Refresh</span>
        </button>
      </div>

      {/* KPI Cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
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
            Total Enrolled
          </span>
          <div style={{ fontSize: "1.75rem", fontWeight: 800, color: "#14110f", marginTop: 4 }}>
            {stats.total}
          </div>
          <span style={{ fontSize: "0.78rem", color: "#a8a29e" }}>Across all batches</span>
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
            Active Learners
          </span>
          <div style={{ fontSize: "1.75rem", fontWeight: 800, color: "#0284c7", marginTop: 4 }}>
            {stats.active}
          </div>
          <span style={{ fontSize: "0.78rem", color: "#a8a29e" }}>Advancing curriculum</span>
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
            Completed / Certified
          </span>
          <div style={{ fontSize: "1.75rem", fontWeight: 800, color: "#16a34a", marginTop: 4 }}>
            {stats.completed}
          </div>
          <span style={{ fontSize: "0.78rem", color: "#a8a29e" }}>Graduated learners</span>
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
            Pending Agreement
          </span>
          <div style={{ fontSize: "1.75rem", fontWeight: 800, color: "#d97706", marginTop: 4 }}>
            {stats.pendingAgreement}
          </div>
          <span style={{ fontSize: "0.78rem", color: "#a8a29e" }}>Awaiting e-signature</span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "1rem",
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          {["ALL", "ACTIVE", "COMPLETED", "PENDING_AGREEMENT"].map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => setStatusFilter(st)}
              style={{
                padding: "6px 14px",
                borderRadius: "20px",
                border: "1px solid",
                borderColor: statusFilter === st ? "#b8860b" : "#e7e0d6",
                background: statusFilter === st ? "#b8860b" : "#ffffff",
                color: statusFilter === st ? "#ffffff" : "#57534e",
                fontSize: "0.82rem",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {st === "ALL"
                ? `All (${enrolments.length})`
                : st === "ACTIVE"
                ? `Active (${stats.active})`
                : st === "COMPLETED"
                ? `Completed (${stats.completed})`
                : `Pending Agreement (${stats.pendingAgreement})`}
            </button>
          ))}
        </div>

        <div style={{ position: "relative", minWidth: 260 }}>
          <input
            type="text"
            placeholder="Search learner name or email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: "100%",
              padding: "8px 12px 8px 34px",
              borderRadius: 8,
              border: "1px solid #e7e0d6",
              fontSize: "0.85rem",
              background: "#ffffff",
              color: "#1c1917",
            }}
          />
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#a8a29e"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ position: "absolute", left: 10, top: 10 }}
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </div>
      </div>

      {/* Main Table */}
      <div
        style={{
          background: "#ffffff",
          borderRadius: 12,
          border: "1px solid #f0ebe4",
          overflow: "hidden",
        }}
      >
        {loading ? (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.88rem" }}>
              <tbody>
                <TableSkeleton rows={5} columns={7} />
              </tbody>
            </table>
          </div>
        ) : error ? (
          <div style={{ padding: "2rem", textAlign: "center", color: "#dc2626" }}>
            <p style={{ fontWeight: 600 }}>Error loading enrolments: {error}</p>
            <button
              type="button"
              onClick={loadEnrolments}
              style={{
                marginTop: "0.5rem",
                padding: "6px 14px",
                borderRadius: 6,
                background: "#fef2f2",
                border: "1px solid #fecaca",
                color: "#991b1b",
                cursor: "pointer",
              }}
            >
              Retry
            </button>
          </div>
        ) : filteredList.length === 0 ? (
          <div style={{ padding: "3rem 1rem" }}>
            <EmptyState
              title="No Enrolments Found"
              description={
                searchQuery
                  ? "No learner matches the search query."
                  : "No students are currently enrolled in this program."
              }
            />
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
                  <th style={{ padding: "12px 16px" }}>Learner</th>
                  <th style={{ padding: "12px 16px" }}>Batch</th>
                  <th style={{ padding: "12px 16px" }}>Curriculum Progress</th>
                  <th style={{ padding: "12px 16px" }}>Final Exam</th>
                  <th style={{ padding: "12px 16px" }}>1-on-1 Coaching</th>
                  <th style={{ padding: "12px 16px" }}>Mission Statement</th>
                  <th style={{ padding: "12px 16px" }}>Status</th>
                  <th style={{ padding: "12px 16px", textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredList.map((enr) => {
                  const stepsDone = enr.stepProgress?.filter((s) => s.isCompleted)?.length || 0;
                  const totalSteps = totalStepsCount || enr.program?.totalSteps || 1;
                  const pct = Math.min(100, Math.round((stepsDone / Math.max(1, totalSteps)) * 100));

                  const latestExam = enr.examAttempts?.[0];
                  const latestCoaching = enr.oneOnOneRequests?.[0];
                  const latestMission = enr.missionStatements?.[0];
                  const cert = enr.certificate;

                  return (
                    <tr
                      key={enr.id}
                      style={{
                        borderBottom: "1px solid #f5f2ed",
                        transition: "background 0.15s ease",
                      }}
                    >
                      {/* Learner info */}
                      <td style={{ padding: "12px 16px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                          <div
                            style={{
                              width: 34,
                              height: 34,
                              borderRadius: "50%",
                              background: "#fef3c7",
                              color: "#b45309",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontWeight: 700,
                              fontSize: "0.85rem",
                              flexShrink: 0,
                            }}
                          >
                            {(enr.user?.name || enr.user?.email || "U").charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div style={{ fontWeight: 600, color: "#14110f" }}>
                              {enr.user?.name || "Learner"}
                            </div>
                            <div style={{ fontSize: "0.78rem", color: "#78716a" }}>
                              {enr.user?.email}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Batch */}
                      <td style={{ padding: "12px 16px", color: "#44403c" }}>
                        {enr.batch?.name ? (
                          <span
                            style={{
                              background: "#f5f5f4",
                              padding: "3px 8px",
                              borderRadius: 6,
                              fontSize: "0.82rem",
                              fontWeight: 500,
                            }}
                          >
                            {enr.batch.name}
                          </span>
                        ) : (
                          <span style={{ color: "#a8a29e", fontSize: "0.82rem" }}>Direct Enrolment</span>
                        )}
                      </td>

                      {/* Curriculum Progress */}
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
                            <span style={{ fontWeight: 600, color: "#1c1917" }}>{pct}%</span>
                            <span style={{ color: "#78716a" }}>
                              {stepsDone}/{totalSteps} steps
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
                                width: `${pct}%`,
                                height: "100%",
                                background: pct === 100 ? "#16a34a" : "#b8860b",
                                borderRadius: 4,
                                transition: "width 0.3s ease",
                              }}
                            />
                          </div>
                        </div>
                      </td>

                      {/* Final Exam */}
                      <td style={{ padding: "12px 16px" }}>
                        {latestExam ? (
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 4,
                              fontSize: "0.82rem",
                              fontWeight: 600,
                              color: latestExam.passed ? "#16a34a" : "#dc2626",
                            }}
                          >
                            {latestExam.passed ? "✓ Passed" : "✗ Failed"} ({latestExam.score}%)
                          </span>
                        ) : (
                          <span style={{ color: "#a8a29e", fontSize: "0.82rem" }}>Not Attempted</span>
                        )}
                      </td>

                      {/* 1-on-1 Coaching */}
                      <td style={{ padding: "12px 16px" }}>
                        {latestCoaching ? (
                          <div>
                            <span
                              style={{
                                display: "inline-block",
                                padding: "2px 8px",
                                borderRadius: 12,
                                fontSize: "0.78rem",
                                fontWeight: 600,
                                background:
                                  latestCoaching.status === "APPROVED"
                                    ? "#dcfce7"
                                    : latestCoaching.status === "PENDING_APPROVAL"
                                    ? "#fef3c7"
                                    : "#f3f4f6",
                                color:
                                  latestCoaching.status === "APPROVED"
                                    ? "#166534"
                                    : latestCoaching.status === "PENDING_APPROVAL"
                                    ? "#92400e"
                                    : "#4b5563",
                              }}
                            >
                              {latestCoaching.status === "APPROVED"
                                ? "Scheduled"
                                : latestCoaching.status === "PENDING_APPROVAL"
                                ? "Pending Approval"
                                : latestCoaching.status}
                            </span>
                            {latestCoaching.status === "PENDING_APPROVAL" && (
                              <div style={{ marginTop: 6 }}>
                                <Link
                                  href="/approvals?tab=coaching"
                                  style={{
                                    fontSize: "0.76rem",
                                    fontWeight: 700,
                                    color: "#b8860b",
                                    textDecoration: "underline",
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: "3px",
                                  }}
                                >
                                  <span>Approve Slot</span>
                                  <span aria-hidden="true">&rarr;</span>
                                </Link>
                              </div>
                            )}
                            {latestCoaching.session?.joinUrl && (
                              <div style={{ marginTop: 2 }}>
                                <a
                                  href={latestCoaching.session.joinUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  style={{
                                    fontSize: "0.75rem",
                                    color: "#0284c7",
                                    textDecoration: "underline",
                                  }}
                                >
                                  Join Zoom
                                </a>
                              </div>
                            )}
                          </div>
                        ) : (
                          <span style={{ color: "#a8a29e", fontSize: "0.82rem" }}>Not Requested</span>
                        )}
                      </td>

                      {/* Mission Statement (Stage 5 Final Requirement) */}
                      <td style={{ padding: "12px 16px" }}>
                        {latestMission ? (
                          <div>
                            <span
                              style={{
                                display: "inline-block",
                                padding: "2px 8px",
                                borderRadius: 12,
                                fontSize: "0.78rem",
                                fontWeight: 600,
                                background:
                                  latestMission.status === "APPROVED"
                                    ? "#dcfce7"
                                    : latestMission.status === "SUBMITTED"
                                    ? "#fef3c7"
                                    : "#fee2e2",
                                color:
                                  latestMission.status === "APPROVED"
                                    ? "#166534"
                                    : latestMission.status === "SUBMITTED"
                                    ? "#92400e"
                                    : "#991b1b",
                              }}
                            >
                              {latestMission.status === "APPROVED"
                                ? "✓ Approved"
                                : latestMission.status === "SUBMITTED"
                                ? "Pending Review"
                                : "Revision Requested"}
                            </span>
                            {latestMission.status === "SUBMITTED" && (
                              <div style={{ marginTop: 6 }}>
                                <Link
                                  href="/approvals?tab=missions"
                                  style={{
                                    fontSize: "0.76rem",
                                    fontWeight: 700,
                                    color: "#b8860b",
                                    textDecoration: "underline",
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: "3px",
                                  }}
                                >
                                  <span>Review in Approvals</span>
                                  <span aria-hidden="true">&rarr;</span>
                                </Link>
                              </div>
                            )}
                          </div>
                        ) : (
                          <span style={{ color: "#a8a29e", fontSize: "0.82rem" }}>
                            {latestCoaching?.session?.status === "COMPLETED" ? "Awaiting Upload" : "Locked (Stage 4)"}
                          </span>
                        )}
                      </td>

                      {/* Status */}
                      <td style={{ padding: "12px 16px" }}>
                        <StatusBadge status={enr.status} />
                        {cert?.status === "ISSUED" && (
                          <div style={{ marginTop: 4 }}>
                            <span
                              style={{
                                fontSize: "0.72rem",
                                color: "#166534",
                                background: "#dcfce7",
                                padding: "1px 6px",
                                borderRadius: 4,
                                fontWeight: 700,
                              }}
                            >
                              CERTIFIED
                            </span>
                          </div>
                        )}
                      </td>

                      {/* Actions */}
                      <td style={{ padding: "12px 16px", textAlign: "right" }}>
                        <div style={{ display: "inline-flex", gap: "6px", alignItems: "center", justifyContent: "flex-end" }}>
                          {latestCoaching?.status === "PENDING_APPROVAL" && (
                            <Link
                              href="/approvals?tab=coaching"
                              style={{
                                padding: "6px 10px",
                                borderRadius: 6,
                                background: "#b8860b",
                                color: "#ffffff",
                                fontSize: "0.82rem",
                                fontWeight: 700,
                                textDecoration: "none",
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 4,
                              }}
                            >
                              <span>Approve Slot</span>
                              <span aria-hidden="true">&rarr;</span>
                            </Link>
                          )}
                          <Link
                            href={`/users?search=${encodeURIComponent(enr.user?.email || "")}`}
                            style={{
                              padding: "6px 12px",
                              borderRadius: 6,
                              background: "#fef9ee",
                              border: "1px solid #fde68a",
                              color: "#92400e",
                              fontSize: "0.82rem",
                              fontWeight: 600,
                              textDecoration: "none",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 4,
                            }}
                          >
                            <span>Manage Learner</span>
                            <span aria-hidden="true">&rarr;</span>
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
