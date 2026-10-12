"use client";

import { useState, FormEvent } from "react";
import styles from "../../page.module.css";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { API_URL, errorMessage } from "../../lib/api";
import { CustomSelect } from "../../components";

export default function CreateProgramPage() {
  const router = useRouter();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState<number | "">(1999);
  const [status, setStatus] = useState<"DRAFT" | "PUBLISHED">("PUBLISHED");
  const [hasCertificate, setHasCertificate] = useState(true);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setFormError("Program title is required.");
      return;
    }

    setIsSubmitting(true);
    setFormError(null);

    try {
      const token = localStorage.getItem("token");
      const payload = {
        title: title.trim(),
        description: description.trim() || undefined,
        price: Number(price) || 0,
        status,
        hasCertificate,
      };

      const res = await fetch(`${API_URL}/programs`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        throw new Error(await errorMessage(res, "Failed to create program"));
      }

      router.push("/programs");
    } catch (err: any) {
      setFormError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className={styles.dashboard}>
      <header className={styles.header}>
        <div className={styles.headerText}>
          <Link
            href="/programs"
            className={styles.secondaryBtnSmall}
            style={{ textDecoration: "none", display: "inline-flex", alignItems: "center", gap: "0.4rem", marginBottom: "0.75rem" }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="19" y1="12" x2="5" y2="12"></line>
              <polyline points="12 19 5 12 12 5"></polyline>
            </svg>
            <span>Back to Programs</span>
          </Link>
          <h1 className={styles.title}>Create New Program</h1>
          <p className={styles.subtitle}>Define the core program attributes and pricing before configuring steps.</p>
        </div>
      </header>

      {formError && (
        <div style={{
          backgroundColor: "#fef2f2",
          border: "1px solid #fecaca",
          color: "#991b1b",
          padding: "12px 16px",
          borderRadius: "8px",
          marginBottom: "1.5rem",
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
          <span>{formError}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: "2rem", alignItems: "start" }}>
        {/* Main Details */}
        <section className={styles.tableSection} style={{ padding: "2rem" }}>
          <div className={styles.modalForm}>
            <div className={styles.formGroup}>
              <label>
                Program Title <span style={{ color: "var(--status-error)" }}>*</span>
              </label>
              <input
                type="text"
                placeholder="e.g. 11 Steps to U Certification"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
              />
            </div>

            <div className={styles.formGroup}>
              <label>
                Program Description
              </label>
              <textarea
                rows={5}
                placeholder="A comprehensive overview of competencies and outcomes..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            <div className={styles.formGroup}>
              <label>
                Publication Status
              </label>
              <CustomSelect
                value={status}
                onChange={(val) => setStatus(val as any)}
                fullWidth
                ariaLabel="Publication Status"
                options={[
                  { value: "PUBLISHED", label: "Published (Available for batch enrolment)" },
                  { value: "DRAFT", label: "Draft (Under authoring)" },
                ]}
              />
            </div>
          </div>
        </section>

        {/* Pricing & Features Sidebar */}
        <div>
          <section className={styles.tableSection} style={{ padding: "1.75rem", marginBottom: "1.5rem" }}>
            <h2 style={{ margin: "0 0 1rem 0", fontSize: "1.1rem", fontWeight: 700 }}>Pricing</h2>
            <div className={styles.formGroup}>
              <label>
                Price (USD) <span style={{ color: "var(--status-error)" }}>*</span>
              </label>
              <input
                type="number"
                min={0}
                value={price}
                onChange={(e) => setPrice(e.target.value === "" ? "" : Number(e.target.value))}
                required
              />
            </div>
          </section>

          <section className={styles.tableSection} style={{ padding: "1.75rem", marginBottom: "1.5rem" }}>
            <h2 style={{ margin: "0 0 1rem 0", fontSize: "1.1rem", fontWeight: 700 }}>Certification</h2>
            <label style={{ display: "flex", alignItems: "center", gap: "0.6rem", fontSize: "0.88rem", fontWeight: 500, cursor: "pointer", color: "var(--text-primary)" }}>
              <input
                type="checkbox"
                checked={hasCertificate}
                onChange={(e) => setHasCertificate(e.target.checked)}
                style={{ accentColor: "var(--accent-primary)", width: "16px", height: "16px", cursor: "pointer" }}
              />
              <span>Issue Official Certificate upon completion</span>
            </label>
          </section>

          <button
            type="submit"
            className={styles.primaryBtn}
            disabled={isSubmitting}
            style={{ width: "100%", padding: "12px", fontSize: "0.95rem" }}
          >
            {isSubmitting ? "Creating Program..." : "Create Program"}
          </button>
        </div>
      </form>
    </div>
  );
}
