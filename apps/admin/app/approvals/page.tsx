"use client";

import styles from "../page.module.css";
import Link from "next/link";

export default function ApprovalsPage() {
  const approvals = [
    {
      id: 1,
      learner: "Emma Davis",
      email: "emma@example.com",
      program: "11 Steps to U",
      status: "Pending Final Review",
      examScore: "92%",
      attendance: "100%",
      oral: "Passed",
    },
    {
      id: 2,
      learner: "Michael Chen",
      email: "michael.c@example.com",
      program: "11 Steps to U",
      status: "Waiting for Oral Assessment",
      examScore: "85%",
      attendance: "80%",
      oral: "Pending",
    },
    {
      id: 3,
      learner: "Sarah Johnson",
      email: "sarah.j@example.com",
      program: "Vision Board Workshop",
      status: "Ready to Issue",
      examScore: "N/A",
      attendance: "100%",
      oral: "N/A",
    }
  ];

  return (
    <div className={styles.dashboard}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Certificate Approvals</h1>
          <p className={styles.subtitle}>Review learner progress and issue final certificates.</p>
        </div>
      </header>

      <div className={styles.tableContainer}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>LEARNER</th>
              <th>PROGRAM</th>
              <th>FINAL EXAM</th>
              <th>ATTENDANCE</th>
              <th>ORAL EXAM</th>
              <th>STATUS</th>
              <th>ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            {approvals.map((app) => (
              <tr key={app.id}>
                <td>
                  <div className={styles.userInfo}>
                    <div className={styles.userAvatar}>{app.learner.charAt(0)}</div>
                    <div>
                      <strong>{app.learner}</strong>
                      <span className={styles.userEmail}>{app.email}</span>
                    </div>
                  </div>
                </td>
                <td>{app.program}</td>
                <td>{app.examScore}</td>
                <td>{app.attendance}</td>
                <td>
                  <span className={styles.statusBadge} data-status={app.oral === "Passed" ? "success" : "warning"}>
                    {app.oral}
                  </span>
                </td>
                <td>
                  <span className={styles.statusBadge} data-status={app.status === "Ready to Issue" || app.status === "Pending Final Review" ? "success" : "warning"}>
                    {app.status}
                  </span>
                </td>
                <td>
                  <div className={styles.actionButtons}>
                    <button className={styles.iconBtn} title="Review Checklist">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                        <polyline points="14 2 14 8 20 8"></polyline>
                        <line x1="16" y1="13" x2="8" y2="13"></line>
                        <line x1="16" y1="17" x2="8" y2="17"></line>
                        <polyline points="10 9 9 9 8 9"></polyline>
                      </svg>
                    </button>
                    {app.status.includes("Pending Final Review") && (
                       <button className={styles.iconBtn} title="Issue Certificate" style={{ color: 'var(--status-success)' }}>
                         <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                           <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                           <polyline points="22 4 12 14.01 9 11.01"></polyline>
                         </svg>
                       </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
