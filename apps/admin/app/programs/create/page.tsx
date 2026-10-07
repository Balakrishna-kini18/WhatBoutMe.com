"use client";

import { useState, FormEvent } from "react";
import styles from "../../page.module.css";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { API_URL, errorMessage } from "../../lib/api";

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
          <Link href="/programs" className={styles.backLink}>← Back to Programs</Link>
          <h1 className={styles.title}>Create New Program</h1>
          <p className={styles.subtitle}>Define the core program attributes and pricing before configuring steps.</p>
        </div>
      </header>

      {formError && (
        <div style={{ backgroundColor: "#fef2f2", border: "1px solid #f87171", color: "#991b1b", padding: "12px 16px", borderRadius: "8px", marginBottom: "1.5rem" }}>
          ⚠️ {formError}
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: "2rem", alignItems: "start" }}>
        {/* Main Details */}
        <section className={styles.tableSection} style={{ padding: "2rem" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
            <div className={styles.formGroup}>
              <label style={{ fontSize: "0.9rem", fontWeight: 600, display: "block", marginBottom: "6px" }}>
                Program Title <span style={{ color: "#ef4444" }}>*</span>
              </label>
              <input
                type="text"
                placeholder="e.g. 11 Steps to U Certification"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className={styles.formInput}
                required
                style={{ width: "100%" }}
              />
            </div>

            <div className={styles.formGroup}>
              <label style={{ fontSize: "0.9rem", fontWeight: 600, display: "block", marginBottom: "6px" }}>
                Program Description
              </label>
              <textarea
                rows={4}
                placeholder="A comprehensive overview of competencies and outcomes..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className={styles.formInput}
                style={{ width: "100%", resize: "vertical" }}
              />
            </div>

            <div className={styles.formGroup}>
              <label style={{ fontSize: "0.9rem", fontWeight: 600, display: "block", marginBottom: "6px" }}>
                Publication Status
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as any)}
                className={styles.formInput}
                style={{ width: "100%" }}
              >
                <option value="PUBLISHED">Published (Available for batch enrolment)</option>
                <option value="DRAFT">Draft (Under authoring)</option>
              </select>
            </div>
          </div>
        </section>

        {/* Pricing & Features Sidebar */}
        <div>
          <section className={styles.tableSection} style={{ padding: "1.5rem", marginBottom: "1.5rem" }}>
            <h2 style={{ margin: "0 0 1rem 0", fontSize: "1.1rem" }}>Pricing</h2>
            <div className={styles.formGroup}>
              <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "4px" }}>
                Price (USD) <span style={{ color: "#ef4444" }}>*</span>
              </label>
              <input
                type="number"
                min={0}
                value={price}
                onChange={(e) => setPrice(e.target.value === "" ? "" : Number(e.target.value))}
                className={styles.formInput}
                required
                style={{ width: "100%" }}
              />
            </div>
          </section>

          <section className={styles.tableSection} style={{ padding: "1.5rem", marginBottom: "1.5rem" }}>
            <h2 style={{ margin: "0 0 1rem 0", fontSize: "1.1rem" }}>Certification</h2>
            <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.875rem", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={hasCertificate}
                onChange={(e) => setHasCertificate(e.target.checked)}
                style={{ accentColor: "#0f172a", width: "16px", height: "16px" }}
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
