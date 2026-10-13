"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import page from "../../page.module.css";
import Certificate from "../Certificate";
import styles from "../Certificate.module.css";
import { API_URL } from "../../lib/api";

const today = () => {
  const now = new Date();
  // local calendar date, not UTC, so "today" is not yesterday late at night
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};

/**
 * Issue certificates by hand. The design is fixed; only the names, the course
 * and the date change. One certificate is made per name and they print one to
 * a page. Nothing is saved: this is for workshops and talks whose attendees
 * are not learners in the portal.
 */
export default function IssueCertificatesPage() {
  const [course, setCourse] = useState("");
  const [date, setDate] = useState(today);
  const [names, setNames] = useState("");
  const [courses, setCourses] = useState<string[]>([]);

  // suggestions only: any course name can be typed
  useEffect(() => {
    fetch(`${API_URL}/programs`)
      .then((res) => (res.ok ? res.json() : []))
      .then((programs: { title: string }[]) => setCourses(programs.map((p) => p.title)))
      .catch(() => setCourses([]));
  }, []);

  const people = names
    .split("\n")
    .map((name) => name.trim())
    .filter(Boolean);
  const ready = people.length > 0 && course.trim() !== "" && date !== "";

  return (
    <div className={page.dashboard}>
      <header className={`${page.header} ${styles.screenOnly}`}>
        <div className={page.headerText}>
          <h1 className={page.title}>Issue Certificates</h1>
          <p className={page.subtitle}>
            The design stays the same. Enter the course, the date and one name per line.
          </p>
        </div>
        <div className={page.headerActions}>
          <Link href="/certificates" className={page.backLink} style={{ margin: 0 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            <span>Back to Certificates</span>
          </Link>
          <button
            type="button"
            className={page.primaryBtn}
            disabled={!ready}
            onClick={() => window.print()}
            style={{ display: "inline-flex", alignItems: "center", gap: "0.45rem" }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="6 9 6 2 18 2 18 9" />
              <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
              <rect x="6" y="14" width="12" height="8" />
            </svg>
            <span>{people.length > 1 ? `Print or Save ${people.length} PDFs` : "Print or Save PDF"}</span>
          </button>
        </div>
      </header>

      <section className={`${page.tableSection} ${styles.screenOnly}`} style={{ padding: "1.75rem", marginBottom: "1.5rem" }}>
        <div className={page.modalForm}>
          <div className={page.formRow}>
            <div className={page.formGroup}>
              <label htmlFor="course">Course</label>
              <input id="course" type="text" list="course-list" placeholder="11 Steps to You Programme" value={course} onChange={(e) => setCourse(e.target.value)} />
              <datalist id="course-list">
                {courses.map((title) => (
                  <option key={title} value={title} />
                ))}
              </datalist>
            </div>
            <div className={page.formGroup}>
              <label htmlFor="date">Date of Issue</label>
              <input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>
          <div className={page.formGroup}>
            <label htmlFor="names">Names (one per line)</label>
            <textarea id="names" rows={6} placeholder={"Alice Learner\nBob Learner"} value={names} onChange={(e) => setNames(e.target.value)} />
          </div>
        </div>
      </section>

      {ready ? (
        <div className={styles.stack}>
          {people.map((name, i) => (
            <Certificate key={`${name}-${i}`} name={name} course={course.trim()} issuedAt={`${date}T00:00:00`} />
          ))}
        </div>
      ) : (
        <p className={styles.message}>
          Fill in the course, the date and at least one name to see the certificates here.
        </p>
      )}
    </div>
  );
}
