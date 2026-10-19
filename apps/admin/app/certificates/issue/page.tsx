"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import page from "../../page.module.css";
import styles from "../Certificate.module.css";
import { API_URL } from "../../lib/api";

const Certificate = dynamic(() => import("../Certificate"), { ssr: false });

const today = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};

export default function IssueCertificatesPage() {
  const [templateType, setTemplateType] = useState<"CPD_25_HOURS" | "PARTICIPATION">("CPD_25_HOURS");
  const [course, setCourse] = useState("11 Steps to U Certification Programme");
  const [date, setDate] = useState(today);
  const [prefix, setPrefix] = useState("WBM-CPD-2026-");
  const [names, setNames] = useState("");
  const [courses, setCourses] = useState<string[]>([]);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  useEffect(() => {
    fetch(`${API_URL}/programs`)
      .then((res) => (res.ok ? res.json() : []))
      .then((programs: any) => {
        const list = Array.isArray(programs) ? programs : programs?.items || [];
        setCourses(list.map((p: any) => p.title));
      })
      .catch(() => setCourses([]));
  }, []);

  const handleTemplateChange = (nextTemplate: "CPD_25_HOURS" | "PARTICIPATION") => {
    setTemplateType(nextTemplate);
    if (nextTemplate === "CPD_25_HOURS") {
      setCourse("11 Steps to U Certification Programme");
      setPrefix("WBM-CPD-2026-");
    } else {
      setCourse("Executive Vision Board & Alignment Workshop");
      setPrefix("WBM-WS-2026-");
    }
  };

  const handleCopyLink = (certNum: string, index: number) => {
    const url = `https://whatboutme.com/verify/${certNum}`;
    navigator.clipboard.writeText(url);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2500);
  };

  const people = names
    .split("\n")
    .map((name) => name.trim())
    .filter(Boolean);

  const ready = people.length > 0 && course.trim() !== "" && date !== "";

  return (
    <div className={page.dashboard}>
      <header className={`${page.header} ${styles.screenOnly}`}>
        <div className={page.headerText}>
          <h1 className={page.title}>Manual Certificate Generator</h1>
          <p className={page.subtitle}>
            Issue formal CPD-accredited certificates or corporate participation credentials with unique verification numbers and LinkedIn share integration.
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
            <span>{people.length > 1 ? `Print or Save ${people.length} Certificates` : "Print or Save PDF"}</span>
          </button>
        </div>
      </header>

      {/* Configuration Form Card */}
      <section className={`${page.tableSection} ${styles.screenOnly}`} style={{ padding: "1.75rem", marginBottom: "1.5rem" }}>
        <div className={page.modalForm}>
          {/* Template Selection Tabs */}
          <div className={page.formGroup} style={{ marginBottom: "1.25rem" }}>
            <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: 700 }}>
              Select Certificate Template Type *
            </label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
              <button
                type="button"
                onClick={() => handleTemplateChange("CPD_25_HOURS")}
                style={{
                  padding: "1rem",
                  borderRadius: "8px",
                  border: `2px solid ${templateType === "CPD_25_HOURS" ? "#b8860b" : "var(--border-light, #e2e8f0)"}`,
                  background: templateType === "CPD_25_HOURS" ? "rgba(184, 134, 11, 0.08)" : "#ffffff",
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px" }}>
                  <span style={{ fontWeight: 700, fontSize: "0.95rem", color: "#8a5a00" }}>
                    25 CPD Hours Certification
                  </span>
                  <span style={{ fontSize: "0.7rem", padding: "1px 6px", borderRadius: "10px", background: "#fef3c7", color: "#92400e", fontWeight: 600 }}>
                    11 Steps to U
                  </span>
                </div>
                <p style={{ margin: 0, fontSize: "0.8rem", color: "var(--text-secondary, #64748b)" }}>
                  Includes 25 CPD Hours badge, CPD UK accreditation, and full curriculum assessment verification.
                </p>
              </button>

              <button
                type="button"
                onClick={() => handleTemplateChange("PARTICIPATION")}
                style={{
                  padding: "1rem",
                  borderRadius: "8px",
                  border: `2px solid ${templateType === "PARTICIPATION" ? "#b8860b" : "var(--border-light, #e2e8f0)"}`,
                  background: templateType === "PARTICIPATION" ? "rgba(184, 134, 11, 0.08)" : "#ffffff",
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px" }}>
                  <span style={{ fontWeight: 700, fontSize: "0.95rem", color: "#8a5a00" }}>
                    Certificate of Participation
                  </span>
                  <span style={{ fontSize: "0.7rem", padding: "1px 6px", borderRadius: "10px", background: "#e0f2fe", color: "#0369a1", fontWeight: 600 }}>
                    Corporate Workshop
                  </span>
                </div>
                <p style={{ margin: 0, fontSize: "0.8rem", color: "var(--text-secondary, #64748b)" }}>
                  Tailored for corporate workshops and talks. No final exam or CPD hours required.
                </p>
              </button>
            </div>
          </div>

          <div className={page.formRow}>
            <div className={page.formGroup}>
              <label htmlFor="course">Programme or Workshop Title *</label>
              <input
                id="course"
                type="text"
                list="course-list"
                placeholder="e.g. 11 Steps to U Certification Programme"
                value={course}
                onChange={(e) => setCourse(e.target.value)}
                required
              />
              <datalist id="course-list">
                {courses.map((title) => (
                  <option key={title} value={title} />
                ))}
              </datalist>
            </div>

            <div className={page.formGroup}>
              <label htmlFor="date">Date of Issue *</label>
              <input
                id="date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
              />
            </div>

            <div className={page.formGroup}>
              <label htmlFor="prefix">Certificate Number Prefix</label>
              <input
                id="prefix"
                type="text"
                placeholder="e.g. WBM-CPD-2026-"
                value={prefix}
                onChange={(e) => setPrefix(e.target.value)}
              />
            </div>
          </div>

          <div className={page.formGroup}>
            <label htmlFor="names">Recipient Names (one per line) *</label>
            <textarea
              id="names"
              rows={5}
              placeholder={"Roweena Britto\nDr. Marcus Vance\nSarah Jenkins"}
              value={names}
              onChange={(e) => setNames(e.target.value)}
            />
            <span style={{ fontSize: "0.75rem", color: "var(--text-muted, #94a3b8)", marginTop: "4px" }}>
              Each line will generate an individual certificate with an auto-incrementing serial number.
            </span>
          </div>
        </div>
      </section>

      {/* Rendered Certificates Preview Stack */}
      {ready ? (
        <div className={styles.stack}>
          {people.map((name, i) => {
            const certNum = `${prefix}${String(i + 1).padStart(3, "0")}`;
            const verifyUrl = `https://whatboutme.com/verify/${certNum}`;

            return (
              <div key={`${name}-${i}`} style={{ marginBottom: "2.5rem" }}>
                {/* Screen-only Certificate Header Bar */}
                <div
                  className={styles.screenOnly}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "0.75rem 1rem",
                    background: "#ffffff",
                    border: "1px solid var(--border-light, #e2e8f0)",
                    borderRadius: "8px 8px 0 0",
                    maxWidth: "1100px",
                    margin: "0 auto",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <span style={{ fontWeight: 700, fontSize: "0.95rem" }}>
                      #{i + 1}: {name}
                    </span>
                    <span style={{ fontSize: "0.8rem", padding: "2px 8px", borderRadius: "4px", background: "#f8fafc", color: "#475569", border: "1px solid #cbd5e1", fontFamily: "monospace" }}>
                      {certNum}
                    </span>
                    <span style={{ fontSize: "0.75rem", color: "#16a34a", fontWeight: 600 }}>
                      {templateType === "CPD_25_HOURS" ? "✓ 25 CPD Hours" : "✓ Participation"}
                    </span>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <button
                      type="button"
                      onClick={() => handleCopyLink(certNum, i)}
                      style={{
                        fontSize: "0.78rem",
                        padding: "5px 10px",
                        borderRadius: "5px",
                        border: "1px solid #cbd5e1",
                        background: "#f8fafc",
                        cursor: "pointer",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "4px",
                      }}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                      </svg>
                      <span>{copiedIndex === i ? "Copied!" : "Copy Verify Link"}</span>
                    </button>
                    <a
                      href={verifyUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        fontSize: "0.78rem",
                        color: "#2563eb",
                        textDecoration: "none",
                        padding: "5px 8px",
                      }}
                    >
                      Open Verify URL &rarr;
                    </a>
                  </div>
                </div>

                {/* Rendered Certificate Sheet */}
                <Certificate
                  recipientName={name}
                  courseName={course.trim()}
                  issueDate={`${date}T00:00:00`}
                  certificateNo={certNum}
                  certificateNumber={certNum}
                  templateType={templateType}
                  cpdHours={templateType === "CPD_25_HOURS" ? 25 : null}
                  verificationUrl={verifyUrl}
                  showLinkedInShare={true}
                />
              </div>
            );
          })}
        </div>
      ) : (
        <p className={styles.message}>
          Select a template, enter the course title, date of issue, and at least one recipient name to generate certificates.
        </p>
      )}
    </div>
  );
}
