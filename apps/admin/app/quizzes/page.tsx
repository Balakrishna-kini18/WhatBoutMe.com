"use client";

import { useEffect, useState } from "react";
import styles from "../page.module.css";
import Link from "next/link";
import { API_URL, errorMessage } from "../lib/api";

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
  const [quizzes, setQuizzes] = useState<QuizListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  useEffect(() => {
    fetchQuizzes();
  }, []);

  const fetchQuizzes = async () => {
    setIsLoading(true);
    setActionError(null);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_URL}/quizzes`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
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

  const handleDeleteQuiz = async (quizId: string, stepTitle: string) => {
    if (!window.confirm(`Are you sure you want to delete the quiz for "${stepTitle}"?`)) {
      return;
    }
    setActionError(null);
    setActionSuccess(null);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_URL}/quizzes/${quizId}`, {
        method: "DELETE",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        throw new Error(await errorMessage(res, "Failed to delete quiz"));
      }
      setActionSuccess("Quiz deleted successfully.");
      await fetchQuizzes();
    } catch (e: any) {
      setActionError(e.message);
    }
  };

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
          <Link href="/quizzes/create" className={styles.primaryBtn} style={{ textDecoration: "none" }}>
            + Create Quiz
          </Link>
        </div>
      </header>

      {actionError && (
        <div style={{ backgroundColor: "#fef2f2", border: "1px solid #f87171", color: "#991b1b", padding: "12px 16px", borderRadius: "8px", marginBottom: "1rem" }}>
          ⚠️ {actionError}
        </div>
      )}

      {actionSuccess && (
        <div style={{ backgroundColor: "#f0fdf4", border: "1px solid #86efac", color: "#166534", padding: "12px 16px", borderRadius: "8px", marginBottom: "1rem" }}>
          ✓ {actionSuccess}
        </div>
      )}

      <section className={styles.tableSection}>
        <div className={styles.sectionHeader}>
          <h2>Step Assessments & Question Pools</h2>
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
                  <td colSpan={7} style={{ textAlign: "center", padding: "30px" }}>
                    Loading quizzes from database...
                  </td>
                </tr>
              ) : quizzes.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: "center", padding: "30px" }}>
                    No quizzes found. Click <strong>+ Create Quiz</strong> to add a step assessment.
                  </td>
                </tr>
              ) : (
                quizzes.map((quiz) => (
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
                      <span style={{ fontWeight: 600, color: "#166534" }}>{quiz.passMark}</span>
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
                      <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
                        <Link
                          href={`/quizzes/${quiz.id}/edit`}
                          style={{
                            padding: "4px 10px",
                            fontSize: "0.8rem",
                            borderRadius: "4px",
                            border: "1px solid #cbd5e1",
                            backgroundColor: "white",
                            color: "#0f172a",
                            textDecoration: "none",
                            fontWeight: 600,
                          }}
                        >
                          Edit
                        </Link>
                        <button
                          type="button"
                          onClick={() => handleDeleteQuiz(quiz.id, quiz.step)}
                          style={{
                            padding: "4px 8px",
                            fontSize: "0.8rem",
                            borderRadius: "4px",
                            border: "1px solid #fca5a5",
                            backgroundColor: "#fff1f2",
                            color: "#9f1239",
                            cursor: "pointer",
                          }}
                          title="Delete Quiz"
                        >
                          ✕
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
