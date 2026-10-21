"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import styles from "../page.module.css";
import Link from "next/link";
import { API_URL, cachedFetch, errorMessage } from "../lib/api";
import { ActionMenu, StatusBadge, ConfirmDialog, useToast } from "../components";

interface QuizListItem {
  id: string;
  stepId: string;
  step: string;
  stepSequence?: number;
  stepTitle?: string;
  programTitle?: string;
  questions: number;
  passMark: string;
  maxAttempts?: number;
  cooldownHours?: number;
  questionCount?: number;
  quizPlacement?: "BEFORE_VIDEO" | "AFTER_VIDEO";
  questionTypes?: Array<"MULTIPLE_CHOICE" | "MULTI_SELECT" | "SHORT_ANSWER" | string>;
  visualCount?: number;
  feedsFinalExam?: boolean;
  updated: string;
}

export default function QuizzesPage() {
  const { success: toastSuccess, error: toastError } = useToast();

  // Core quiz state
  const [quizzes, setQuizzes] = useState<QuizListItem[]>([]);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // In-website branded popup state (Zero native browser alerts)
  const [quizToDelete, setQuizToDelete] = useState<QuizListItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Real-time instant search filter
  const [searchQuery, setSearchQuery] = useState("");

  /**
   * Senior Pattern: Non-destructive data loading.
   * Only the very first fetch displays the initial skeleton.
   * Subsequent fetches (or background revalidations) NEVER unmount or blank out the table.
   */
  const loadQuizzes = useCallback(async (silent = false) => {
    if (!silent) {
      setIsRefreshing(true);
    }
    try {
      const res = await cachedFetch(`${API_URL}/quizzes`, {
        skipCache: silent,
        ttlMs: 30_000,
      });
      if (!res.ok) {
        throw new Error(await errorMessage(res, "Failed to load quizzes"));
      }
      const data: QuizListItem[] = await res.json();
      setQuizzes(data);
    } catch (e: any) {
      toastError(e.message || "Failed to load quizzes");
    } finally {
      setIsInitialLoading(false);
      setIsRefreshing(false);
    }
  }, [toastError]);

  useEffect(() => {
    loadQuizzes(false);
  }, [loadQuizzes]);

  /**
   * Senior Pattern: Optimistic UI Deletion with Automatic Rollback.
   * 1. Closes the dialog instantly.
   * 2. Removes the item from state immediately (<10ms) — ZERO page refresh, ZERO table flicker.
   * 3. Dispatches the DELETE request asynchronously in the background.
   * 4. If the server rejects the request, cleanly rolls back to the previous snapshot and alerts the user.
   */
  const confirmDeleteQuiz = async () => {
    if (!quizToDelete) return;
    const target = quizToDelete;
    const targetId = target.id;

    setIsDeleting(true);
    setDeleteError(null);

    // Capture snapshot for rollback safety
    const previousSnapshot = quizzes;

    // 1. Optimistic removal: instantaneous feedback
    setQuizzes((curr) => curr.filter((q) => q.id !== targetId));
    setQuizToDelete(null);
    setIsDeleting(false);
    toastSuccess(`Quiz for "${target.step}" removed.`);

    // 2. Perform network request in background
    try {
      const res = await cachedFetch(`${API_URL}/quizzes/${targetId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        throw new Error(await errorMessage(res, "Server failed to delete quiz"));
      }
    } catch (e: any) {
      // Rollback on failure
      setQuizzes(previousSnapshot);
      toastError(e.message || "Could not delete quiz. Restored previous list.");
    }
  };

  // Placement and visual filters
  const [placementFilter, setPlacementFilter] = useState<string>("ALL");
  const [visualOnly, setVisualOnly] = useState<boolean>(false);

  // Instant client-side search filtering
  const filteredQuizzes = useMemo(() => {
    let list = quizzes;
    if (placementFilter !== "ALL") {
      list = list.filter((q) => (q.quizPlacement || "AFTER_VIDEO") === placementFilter);
    }
    if (visualOnly) {
      list = list.filter((q) => (q.visualCount ?? 0) > 0);
    }
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (quiz) =>
          quiz.step.toLowerCase().includes(q) ||
          quiz.passMark.toLowerCase().includes(q) ||
          (quiz.programTitle && quiz.programTitle.toLowerCase().includes(q))
      );
    }
    return list;
  }, [quizzes, searchQuery, placementFilter, visualOnly]);

  return (
    <div className={styles.dashboard}>
      <header className={styles.header}>
        <div className={styles.headerText}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <h1 className={styles.title}>Question Bank & Quizzes</h1>
            {isRefreshing && (
              <span
                style={{
                  fontSize: "0.75rem",
                  padding: "2px 8px",
                  borderRadius: "12px",
                  background: "#fef3c7",
                  color: "#92400e",
                  fontWeight: 600,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                }}
              >
                Syncing...
              </span>
            )}
          </div>
          <p className={styles.subtitle}>
            Manage knowledge-check quizzes, question pools, retries, and cooldown parameters for each step.
          </p>
        </div>
        <div className={styles.headerActions}>
          <button
            type="button"
            onClick={() => loadQuizzes(true)}
            disabled={isRefreshing}
            className={styles.secondaryBtn}
            title="Refresh quizzes list"
            style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}
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
              style={{ animation: isRefreshing ? "spin 1s linear infinite" : "none" }}
            >
              <polyline points="23 4 23 10 17 10" />
              <polyline points="1 20 1 14 7 14" />
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            </svg>
            <span>Refresh</span>
          </button>
          <Link
            href="/quizzes/create"
            className={styles.primaryBtn}
            style={{ textDecoration: "none", display: "inline-flex", alignItems: "center", gap: "0.5rem" }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            <span>Create Quiz</span>
          </Link>
        </div>
      </header>

      <section className={styles.tableSection}>
        <div className={styles.sectionHeader} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem" }}>
          <div>
            <h2 style={{ margin: 0 }}>Step Assessments & Question Pools</h2>
            <p style={{ margin: "4px 0 0", fontSize: "0.82rem", color: "var(--text-secondary)" }}>
              {isInitialLoading
                ? "Loading assessments..."
                : `Showing ${filteredQuizzes.length} of ${quizzes.length} quiz assessments`}
            </p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap", justifyContent: "flex-end" }}>
            {/* Placement filter */}
            <select
              value={placementFilter}
              onChange={(e) => setPlacementFilter(e.target.value)}
              style={{
                padding: "7px 10px",
                borderRadius: "6px",
                border: "1px solid var(--border-light)",
                fontSize: "0.825rem",
                background: "#ffffff",
                color: "var(--text-primary)",
              }}
              aria-label="Filter by quiz placement"
            >
              <option value="ALL">All Placements</option>
              <option value="BEFORE_VIDEO">Before Video (Pre-Assessment)</option>
              <option value="AFTER_VIDEO">After Video (Comprehension)</option>
            </select>

            {/* Visuals only checkbox */}
            <label
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "5px",
                fontSize: "0.825rem",
                color: "var(--text-primary)",
                cursor: "pointer",
              }}
            >
              <input
                type="checkbox"
                checked={visualOnly}
                onChange={(e) => setVisualOnly(e.target.checked)}
                style={{ cursor: "pointer" }}
              />
              <span>Has Visuals</span>
            </label>

            {/* Instant search */}
            <div style={{ position: "relative", minWidth: "220px" }}>
              <span style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)", display: "flex", pointerEvents: "none" }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
              </span>
              <input
                type="text"
                placeholder="Search step title..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  width: "100%",
                  padding: "7px 12px 7px 32px",
                  border: "1px solid var(--border-light)",
                  borderRadius: "6px",
                  fontSize: "0.85rem",
                  background: "#ffffff",
                  color: "var(--text-primary)",
                  outline: "none",
                }}
              />
            </div>
          </div>
        </div>

        <div className={styles.tableWrapper}>
          <table className={styles.adminTable}>
            <thead>
              <tr>
                <th>Linked Step</th>
                <th>Placement</th>
                <th>Question Types</th>
                <th>Pool & Visuals</th>
                <th>Pass Mark</th>
                <th>Retries & Cooldown</th>
                <th>Last Updated</th>
                <th className={styles.alignRight}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {isInitialLoading ? (
                // Elegant skeleton rows on first load (prevents blank table flash)
                Array.from({ length: 5 }).map((_, idx) => (
                  <tr key={`skeleton-${idx}`}>
                    <td>
                      <div className="skeleton" style={{ width: "80%", height: "18px", borderRadius: "4px" }} />
                    </td>
                    <td>
                      <div className="skeleton" style={{ width: "65px", height: "18px", borderRadius: "12px" }} />
                    </td>
                    <td>
                      <div className="skeleton" style={{ width: "80px", height: "18px", borderRadius: "4px" }} />
                    </td>
                    <td>
                      <div className="skeleton" style={{ width: "70px", height: "18px", borderRadius: "4px" }} />
                    </td>
                    <td>
                      <div className="skeleton" style={{ width: "50px", height: "20px", borderRadius: "12px" }} />
                    </td>
                    <td>
                      <div className="skeleton" style={{ width: "70px", height: "16px", borderRadius: "4px" }} />
                    </td>
                    <td>
                      <div className="skeleton" style={{ width: "80px", height: "14px", borderRadius: "4px" }} />
                    </td>
                    <td className={styles.alignRight}>
                      <div className="skeleton" style={{ width: "28px", height: "28px", borderRadius: "6px", marginLeft: "auto" }} />
                    </td>
                  </tr>
                ))
              ) : filteredQuizzes.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: "center", padding: "48px 24px", color: "var(--text-secondary)" }}>
                    {searchQuery || placementFilter !== "ALL" || visualOnly ? (
                      <div>
                        <p style={{ margin: 0, fontWeight: 600 }}>No quizzes matching current filters</p>
                        <p style={{ margin: "4px 0 0", fontSize: "0.85rem" }}>Try adjusting your placement filter or search query.</p>
                      </div>
                    ) : (
                      <div>
                        <p style={{ margin: 0, fontWeight: 600 }}>No quizzes configured yet</p>
                        <p style={{ margin: "4px 0 16px", fontSize: "0.85rem" }}>Knowledge-check quizzes can be attached to any curriculum step.</p>
                        <Link href="/quizzes/create" className={styles.primaryBtn} style={{ textDecoration: "none", display: "inline-flex" }}>
                          Create First Quiz
                        </Link>
                      </div>
                    )}
                  </td>
                </tr>
              ) : (
                filteredQuizzes.map((quiz) => (
                  <tr
                    key={quiz.id}
                    style={{
                      transition: "opacity 0.2s ease, transform 0.2s ease",
                    }}
                  >
                    <td>
                      <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                        <span className={styles.cellUserName}>{quiz.step}</span>
                        {quiz.programTitle && (
                          <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                            {quiz.programTitle}
                          </span>
                        )}
                      </div>
                    </td>
                    <td>
                      {(quiz.quizPlacement || "AFTER_VIDEO") === "BEFORE_VIDEO" ? (
                        <div style={{ display: "inline-flex", flexDirection: "column", gap: "2px" }}>
                          <StatusBadge status="Before Video" tone="pending" />
                          <span style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>Pre-Assessment</span>
                        </div>
                      ) : (
                        <div style={{ display: "inline-flex", flexDirection: "column", gap: "2px" }}>
                          <StatusBadge status="After Video" tone="active" />
                          <span style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>Comprehension</span>
                        </div>
                      )}
                    </td>
                    <td>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
                        {(quiz.questionTypes && quiz.questionTypes.length > 0
                          ? quiz.questionTypes
                          : ["MULTIPLE_CHOICE"]
                        ).map((t) => {
                          if (t === "MULTIPLE_CHOICE") {
                            return (
                              <span
                                key={t}
                                style={{
                                  fontSize: "0.72rem",
                                  padding: "2px 6px",
                                  borderRadius: "4px",
                                  background: "#eff6ff",
                                  color: "#1d4ed8",
                                  fontWeight: 500,
                                  border: "1px solid #bfdbfe",
                                }}
                              >
                                Single Choice
                              </span>
                            );
                          }
                          if (t === "MULTI_SELECT") {
                            return (
                              <span
                                key={t}
                                style={{
                                  fontSize: "0.72rem",
                                  padding: "2px 6px",
                                  borderRadius: "4px",
                                  background: "#f0fdf4",
                                  color: "#15803d",
                                  fontWeight: 500,
                                  border: "1px solid #bbf7d0",
                                }}
                              >
                                Multiple Choice
                              </span>
                            );
                          }
                          if (t === "SHORT_ANSWER") {
                            return (
                              <span
                                key={t}
                                style={{
                                  fontSize: "0.72rem",
                                  padding: "2px 6px",
                                  borderRadius: "4px",
                                  background: "#faf5ff",
                                  color: "#7e22ce",
                                  fontWeight: 500,
                                  border: "1px solid #e9d5ff",
                                }}
                              >
                                Text Box
                              </span>
                            );
                          }
                          return (
                            <span
                              key={t}
                              style={{
                                fontSize: "0.72rem",
                                padding: "2px 6px",
                                borderRadius: "4px",
                                background: "#f1f5f9",
                                color: "#475569",
                                fontWeight: 500,
                              }}
                            >
                              {t}
                            </span>
                          );
                        })}
                      </div>
                    </td>
                    <td>
                      <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                        <span className={styles.cellText} style={{ fontWeight: 600 }}>
                          {quiz.questions} question{quiz.questions !== 1 ? "s" : ""}
                          {quiz.questionCount ? ` (Pool: ${quiz.questionCount})` : ""}
                        </span>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
                          {(quiz.visualCount ?? 0) > 0 ? (
                            <span
                              style={{
                                fontSize: "0.72rem",
                                padding: "2px 6px",
                                borderRadius: "4px",
                                background: "#fffbeb",
                                color: "#b45309",
                                border: "1px solid #fde68a",
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "3px",
                              }}
                            >
                              {quiz.visualCount} Visual
                            </span>
                          ) : (
                            <span
                              style={{
                                fontSize: "0.72rem",
                                padding: "2px 6px",
                                borderRadius: "4px",
                                background: "#f8fafc",
                                color: "#64748b",
                                border: "1px solid #e2e8f0",
                              }}
                            >
                              Text Only
                            </span>
                          )}
                          {quiz.feedsFinalExam !== false && (
                            <span
                              style={{
                                fontSize: "0.72rem",
                                padding: "2px 6px",
                                borderRadius: "4px",
                                background: "#fdf4ff",
                                color: "#a21caf",
                                border: "1px solid #f5d0fe",
                                fontWeight: 500,
                              }}
                              title="Questions pool feeds into the 50-question shuffled Final Exam"
                            >
                              ✓ 50-Q Final Exam
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td>
                      <StatusBadge status={quiz.passMark} tone="completed" />
                    </td>
                    <td>
                      <span className={styles.cellText}>
                        {quiz.maxAttempts ?? 3} attempts
                        <br />
                        <small style={{ color: "var(--text-muted)" }}>
                          {quiz.cooldownHours ?? 24}h cooldown
                        </small>
                      </span>
                    </td>
                    <td>
                      <span className={styles.cellTextMuted}>{quiz.updated}</span>
                    </td>
                    <td className={styles.alignRight}>
                      <ActionMenu
                        ariaLabel={`Actions for ${quiz.step}`}
                        items={[
                          {
                            label: "Edit Quiz & Questions",
                            href: `/quizzes/${quiz.id}/edit`,
                            icon: (
                              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                              </svg>
                            ),
                          },
                          {
                            label: "Delete Quiz",
                            danger: true,
                            dividerAbove: true,
                            onClick: () => {
                              setDeleteError(null);
                              setQuizToDelete(quiz);
                            },
                            icon: (
                              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <polyline points="3 6 5 6 21 6" />
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                <line x1="10" y1="11" x2="10" y2="17" />
                                <line x1="14" y1="11" x2="14" y2="17" />
                              </svg>
                            ),
                          },
                        ]}
                      />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* In-website branded ConfirmDialog for Quiz Deletion */}
      <ConfirmDialog
        isOpen={Boolean(quizToDelete)}
        onClose={() => {
          if (!isDeleting) {
            setQuizToDelete(null);
            setDeleteError(null);
          }
        }}
        onConfirm={confirmDeleteQuiz}
        title="Delete Knowledge-Check Quiz"
        subtitle={quizToDelete?.step}
        description={
          <>
            Are you sure you want to delete the quiz for <strong>{quizToDelete?.step}</strong>? This will permanently remove all attached questions, answer options, and learner attempts from this step.
          </>
        }
        tone="danger"
        confirmText={isDeleting ? "Deleting..." : "Delete Quiz"}
        cancelText="Cancel"
        isLoading={isDeleting}
        error={deleteError}
        itemDetails={
          quizToDelete
            ? [
                { label: "Linked Step", value: quizToDelete.step },
                {
                  label: "Questions Pool",
                  value: `${quizToDelete.questions} question${quizToDelete.questions !== 1 ? "s" : ""}${quizToDelete.questionCount ? ` (Pool: ${quizToDelete.questionCount})` : ""}`,
                },
                { label: "Pass Mark", value: quizToDelete.passMark },
                { label: "Max Retries", value: `${quizToDelete.maxAttempts ?? 3} attempts` },
                { label: "Cooldown", value: `${quizToDelete.cooldownHours ?? 24} hours` },
              ]
            : []
        }
        callout={{
          tone: "warning",
          text: "Learners will bypass this quiz when completing this curriculum step.",
        }}
      />
    </div>
  );
}
