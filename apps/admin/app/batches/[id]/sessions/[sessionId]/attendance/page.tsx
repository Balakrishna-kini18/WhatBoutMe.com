"use client";

import { useEffect, useState, use } from "react";
import styles from "../../../../../page.module.css";
import Link from "next/link";

export default function SessionAttendancePage({ params }: { params: Promise<{ id: string, sessionId: string }> }) {
  const resolvedParams = use(params);
  const { id: batchId, sessionId } = resolvedParams;
  
  const [attendances, setAttendances] = useState<any[]>([]);
  const [enrolments, setEnrolments] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [session, setSession] = useState<any>(null);

  useEffect(() => {
    fetchData();
  }, [batchId, sessionId]);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      // Fetch session details
      const sessionRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/sessions?batchId=${batchId}`);
      if (sessionRes.ok) {
        const sessions = await sessionRes.json();
        const currentSession = sessions.find((s: any) => s.id === sessionId);
        setSession(currentSession);
      }

      // Fetch batch enrolments to know who SHOULD be here
      const batchRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/batches/${batchId}`);
      if (batchRes.ok) {
        const currentBatch = await batchRes.json();
        if (currentBatch && currentBatch.enrolments) {
          setEnrolments(currentBatch.enrolments);
        }
      }

      // Fetch actual attendance records
      const attRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/sessions/${sessionId}/attendance`);
      if (attRes.ok) {
        setAttendances(await attRes.json());
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  const markAttendance = async (userId: string) => {
    try {
      // the AuthProvider adds the sign-in token to API requests
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/sessions/${sessionId}/override-attendance`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId })
      });
      if (res.ok) {
        fetchData();
      } else {
        alert("Failed to mark attendance.");
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Merge enrolments with attendance to show all students
  const mergedData = enrolments.map(enrolment => {
    const record = attendances.find(a => a.enrolmentId === enrolment.id);
    return {
      userId: enrolment.userId,
      userName: enrolment.user?.name || 'Unknown User',
      userEmail: enrolment.user?.email || '',
      isPresent: !!record,
      joinTime: record?.joinTime || null
    };
  });

  return (
    <div className={styles.dashboard}>
      <header className={styles.header}>
        <div className={styles.headerText}>
          <div style={{display: 'flex', alignItems: 'center', gap: '15px'}}>
            <Link href={`/batches/${batchId}/sessions`} style={{textDecoration: 'none', color: 'var(--accent-primary)', fontSize: '1.2rem'}}>← Back to Sessions</Link>
            <h1 className={styles.title}>Attendance: {session?.title || 'Session'}</h1>
          </div>
          <p className={styles.subtitle}>View and manually override attendance for this live class.</p>
        </div>
      </header>

      <section className={styles.tableSection}>
        <div className={styles.tableWrapper}>
          <table className={styles.adminTable}>
            <thead>
              <tr>
                <th>Student Name</th>
                <th>Email</th>
                <th>Status</th>
                <th>Join Time</th>
                <th className={styles.alignRight}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={5} style={{textAlign: "center", padding: "20px"}}>Loading attendance data...</td>
                </tr>
              ) : mergedData.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{textAlign: "center", padding: "20px"}}>No students enrolled in this batch.</td>
                </tr>
              ) : mergedData.map((student) => (
                <tr key={student.userId}>
                  <td><span className={styles.cellUserName}>{student.userName}</span></td>
                  <td><span className={styles.cellTextMuted}>{student.userEmail}</span></td>
                  <td>
                    <span className={`${styles.statusChip} ${student.isPresent ? styles.active : styles.expired}`}>
                      {student.isPresent ? 'Present' : 'Absent'}
                    </span>
                  </td>
                  <td>
                    <span className={styles.cellTextMuted}>
                      {student.joinTime ? new Date(student.joinTime).toLocaleTimeString() : '---'}
                    </span>
                  </td>
                  <td className={styles.alignRight}>
                    {!student.isPresent && (
                      <button className={styles.secondaryBtn} onClick={() => markAttendance(student.userId)}>Mark Present</button>
                    )}
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
