"use client";

import { useEffect, useState, useMemo } from "react";
import styles from "../page.module.css";
import Link from "next/link";
import { API_URL, cachedFetch, errorMessage } from "../lib/api";
import { ActionMenu, StatusBadge, ConfirmDialog, useToast } from "../components";

interface QuizListItem {
  id: string;
  stepId: string;
  step: string;
  questions: number;
  passMark: string;
  maxAttempts?: number;
  cooldownHours?: number;
  questionCount?: number;
  updated: string;
}

export default function QuizzesPage() {
  const { success: toastSuccess, error: toastError } = useToast();
  const [quizzes, setQuizzes] = useState<QuizListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // In-website branded popup state (replaces browser window.confirm)
  const [quizToDelete, setQuizToDelete] = useState<QuizListItem | null>(null);
  const [isDeletingQuiz, setIsDeletingQuiz] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Instant search query
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    fetchQuizzes();
  }, []);

  const fetchQuizzes = async (skipCache = false) => {
    setIsLoading(true);
    setActionError(null);
    try {
      const res = await cachedFetch(`${API_URL}/quizzes`, {
        skipCache,
        ttlMs: 30_000,
      });
      if (!res.ok) {
        throw new Error(await errorMessage(res, "Failed to load quizzes"));
      }
      const data = await res.json();
      setQuizzes(data);
    } catch (e: any) {
      setActionError(e.message);
    } finally {
      setIsLoading(false);
    }
  };

  const confirmDeleteQuiz = async () => {
    if (!quizToDelete) return;
    setIsDeletingQuiz(true);
    setDeleteError(null);
    try {
      const res = await cachedFetch(`${API_URL}/quizzes/${quizToDelete.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        throw new Error(await errorMessage(res, "Failed to delete quiz"));
      }

      // Optimistic update: instantly remove quiz from local UI list
      const deletedId = quizToDelete.id;
      setQuizzes((prev) => prev.filter((q) => q.id !== deletedId));
      toastSuccess("Quiz deleted successfully.");
      setActionSuccess("Quiz deleted successfully.");
      setQuizToDelete(null);
    } catch (e: any) {
      const msg = e.message || "Failed to delete quiz";
      setDeleteError(msg);
      toastError(msg);
    } finally {
      setIsDeletingQuiz(false);
    }
  };

  const filteredQuizzes = useMemo(() => {
    if (!searchQuery.trim()) return quizzes;
    const q = searchQuery.toLowerCase();
    return quizzes.filter(
      (quiz) =>
        quiz.step.toLowerCase().includes(q) ||
        quiz.passMark.toLowerCase().includes(q)
    );
  }, [quizzes, searchQuery]);

  return (
    <div className={styles.dashboard}>
      <header className={styles.header}>
        <div className={styles.headerText}>
          <h1 className={styles.title}>Question Bank & Quizzes</h1>
          <p className={styles.subtitle}>
            Manage knowledge-check quizzes, question pools, retries, and cooldown parameters for each step.
          </p>
        </div>
        <div className={styles.headerActions}>
          <Link
            href="/quizzes/create"
            className={styles.primaryBtn}
            style={{ textDecoration: "none", display: "inline-flex", alignItems: "center", gap: "0.5rem" }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
            <span>Create Quiz</span>
          </Link>
        </div>
      </header>

      {actionError && (
        <div style={{
          backgroundColor: "#fef2f2",
          border: "1px solid #fecaca",
          color: "#991b1b",
          padding: "12px 16px",
          borderRadius: "8px",
          marginBottom: "1.25rem",
          display: "flex",
          alignItems: "center",
          gap: "10px",
          fontSize: "0.88rem"
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
          <span>{actionError}</span>
        </div>
      )}

      {actionSuccess && (
        <div style={{
          backgroundColor: "#f0fdf4",
          border: "1px solid #bbf7d0",
          color: "#166534",
          padding: "12px 16px",
          borderRadius: "8px",
          marginBottom: "1.25rem",
          display: "flex",
          alignItems: "center",
          gap: "10px",
          fontSize: "0.88rem"
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
            <polyline points="22 4 12 14.01 9 11.01"></polyline>
          </svg>
          <span>{actionSuccess}</span>
        </div>
      )}

      <section className={styles.tableSection}>
        <div className={styles.sectionHeader} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem" }}>
          <h2>Step Assessments & Question Pools</h2>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flex: "1", maxWidth: "380px", justifyContent: "flex-end" }}>
            <div style={{ position: "relative", width: "100%" }}>
              <span style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)", display: "flex", pointerEvents: "none" }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
              </span>
              <input
                type="text"
                placeholder="Search by step title..."
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
                <th>Pool / Bank</th>
                <th>Pass Mark</th>
                <th>Max Retries</th>
                <th>Cooldown</th>
                <th>Last Updated</th>
                <th className={styles.alignRight}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: "center", padding: "36px", color: "var(--text-secondary)" }}>
                    Loading quizzes from database...
                  </td>
                </tr>
              ) : filteredQuizzes.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: "center", padding: "36px", color: "var(--text-secondary)" }}>
                    {searchQuery
                      ? `No quizzes matching "${searchQuery}".`
                      : "No quizzes found. Click Create Quiz to add a step assessment."}
                  </td>
                </tr>
              ) : (
                filteredQuizzes.map((quiz) => (
                  <tr key={quiz.id}>
                    <td>
                      <span className={styles.cellUserName}>{quiz.step}</span>
                    </td>
                    <td>
                      <span className={styles.cellText}>
                        {quiz.questions} question{quiz.questions !== 1 ? "s" : ""}
                        {quiz.questionCount ? ` (Pool size: ${quiz.questionCount})` : ""}
                      </span>
                    </td>
                    <td>
                      <StatusBadge status={quiz.passMark} tone="completed" />
                    </td>
                    <td>
                      <span className={styles.cellText}>{quiz.maxAttempts ?? 3} attempts</span>
                    </td>
                    <td>
                      <span className={styles.cellText}>{quiz.cooldownHours ?? 24} hours</span>
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
          if (!isDeletingQuiz) {
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
        confirmText={isDeletingQuiz ? "Deleting..." : "Delete Quiz"}
        cancelText="Cancel"
        isLoading={isDeletingQuiz}
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
