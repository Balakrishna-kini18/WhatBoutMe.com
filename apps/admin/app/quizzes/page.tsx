"use client";

import { useEffect, useState } from "react";
import styles from "../page.module.css";
import Link from "next/link";

export default function QuizzesPage() {
  const [quizzes, setQuizzes] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchQuizzes();
  }, []);

  const fetchQuizzes = async () => {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || `${process.env.NEXT_PUBLIC_API_URL || `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}`}`}/quizzes`);
      if (res.ok) {
        const data = await res.json();
        setQuizzes(data);
      }
    } catch (e) {
      console.error("Failed to fetch quizzes", e);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={styles.dashboard}>
      <header className={styles.header}>
        <div className={styles.headerText}>
          <h1 className={styles.title}>Question Bank</h1>
          <p className={styles.subtitle}>Manage quizzes and passing criteria for each step.</p>
        </div>
        <div className={styles.headerActions}>
          <Link href="/quizzes/create" className={styles.primaryBtn}>+ Create Quiz</Link>
        </div>
      </header>

      <section className={styles.tableSection}>
        <div className={styles.sectionHeader}>
          <h2>Assessments</h2>
        </div>
        
        <div className={styles.tableWrapper}>
          <table className={styles.adminTable}>
            <thead>
              <tr>
                <th>Linked Step</th>
                <th>Questions</th>
                <th>Passing Score</th>
                <th>Last Updated</th>
                <th className={styles.alignRight}>Action</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={5} style={{textAlign: "center", padding: "20px"}}>Loading quizzes...</td>
                </tr>
              ) : quizzes.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{textAlign: "center", padding: "20px"}}>No quizzes found.</td>
                </tr>
              ) : quizzes.map((quiz) => (
                <tr key={quiz.id}>
                  <td>
                    <span className={styles.cellUserName}>{quiz.step}</span>
                  </td>
                  <td><span className={styles.cellText}>{quiz.questions}</span></td>
                  <td><span className={styles.cellText}>{quiz.passMark}</span></td>
                  <td><span className={styles.cellTextMuted}>{quiz.updated}</span></td>
                  <td className={styles.alignRight}>
                    <button className={styles.iconActionBtn} title="Edit Questions">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{opacity: 0.6}}>
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                        <polyline points="14 2 14 8 20 8"></polyline>
                        <line x1="16" y1="13" x2="8" y2="13"></line>
                        <line x1="16" y1="17" x2="8" y2="17"></line>
                        <polyline points="10 9 9 9 8 9"></polyline>
                      </svg>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
