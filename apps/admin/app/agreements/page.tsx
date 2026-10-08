"use client";

import { useEffect, useState, FormEvent } from "react";
import styles from "../page.module.css";
import Link from "next/link";
import { API_URL, errorMessage } from "../lib/api";

interface AgreementTemplate {
  id: string;
  title: string;
  description: string | null;
  programId: string;
  program?: {
    id: string;
    title: string;
    slug: string;
  };
  versions?: Array<{
    id: string;
    version: string;
    status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
    publishedAt: string | null;
  }>;
  _count?: {
    versions: number;
    signedAgreements: number;
  };
  createdAt: string;
  updatedAt: string;
}

interface ProgramOption {
  id: string;
  title: string;
  slug: string;
}

export default function AdminAgreementsPage() {
  const [templates, setTemplates] = useState<AgreementTemplate[]>([]);
  const [programs, setPrograms] = useState<ProgramOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Create Template form states
  const [selectedProgramId, setSelectedProgramId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [initialVersion, setInitialVersion] = useState("v1.0");
  const [initialContent, setInitialContent] = useState("");
  const [initialChangelog, setInitialChangelog] = useState("Initial terms and conditions release");
  const [publishImmediately, setPublishImmediately] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const [templatesRes, programsRes] = await Promise.all([
        fetch(`${API_URL}/admin/agreement-templates`, { headers }),
        fetch(`${API_URL}/programs`, { headers }),
      ]);

      if (templatesRes.ok) {
        const templatesData = await templatesRes.json();
        setTemplates(Array.isArray(templatesData) ? templatesData : []);
      } else {
        const msg = await errorMessage(templatesRes, "Failed to load agreement templates");
        setErrorMsg(msg);
      }

      if (programsRes.ok) {
        const programsData = await programsRes.json();
        setPrograms(Array.isArray(programsData) ? programsData : []);
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to load data");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateTemplate = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedProgramId || !title.trim() || !initialContent.trim()) {
      setErrorMsg("Please select a program, enter a title, and provide agreement content.");
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
      const res = await fetch(`${API_URL}/admin/agreement-templates`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          programId: selectedProgramId,
          title: title.trim(),
          description: description.trim() || undefined,
          initialVersion: initialVersion.trim() || "v1.0",
          initialContent: initialContent.trim(),
          initialChangelog: initialChangelog.trim() || undefined,
          publishImmediately,
        }),
      });

      if (!res.ok) {
        throw new Error(await errorMessage(res, "Failed to create agreement template"));
      }

      setIsModalOpen(false);
      resetForm();
      await fetchData();
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || "Failed to create template");
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setSelectedProgramId("");
    setTitle("");
    setDescription("");
    setInitialVersion("v1.0");
    setInitialContent("");
    setInitialChangelog("Initial terms and conditions release");
    setPublishImmediately(true);
  };

  return (
    <div className={styles.dashboard}>
      <header className={styles.header}>
        <div className={styles.headerText}>
          <h1 className={styles.title}>Program Agreements</h1>
          <p className={styles.subtitle}>
            Manage legally binding program agreements, version histories (v1.0, v2.0), and view signed learner copies.
          </p>
        </div>
        <div className={styles.headerActions}>
          <button
            className={styles.primaryBtn}
            onClick={() => {
              resetForm();
              setIsModalOpen(true);
            }}
          >
            + Create Agreement Template
          </button>
        </div>
      </header>

      {errorMsg && (
        <div style={{
          background: "#fee2e2",
          border: "1px solid #ef4444",
          color: "#b91c1c",
          padding: "1rem",
          borderRadius: "8px",
          marginBottom: "1.5rem",
          fontSize: "0.9rem"
        }}>
          {errorMsg}
        </div>
      )}

      <section className={styles.tableSection}>
        <div className={styles.sectionHeader}>
          <h2>Agreement Templates by Program</h2>
        </div>

        <div className={styles.tableWrapper}>
          <table className={styles.adminTable}>
            <thead>
              <tr>
                <th>Program</th>
                <th>Template Title</th>
                <th>Active Version</th>
                <th>Total Versions</th>
                <th>Signed Copies</th>
                <th>Created</th>
                <th className={styles.alignRight} style={{ width: "160px" }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: "center", padding: "2rem", color: "var(--text-secondary)" }}>
                    Loading agreement templates...
                  </td>
                </tr>
              ) : templates.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: "center", padding: "3rem", color: "var(--text-secondary)" }}>
                    <p style={{ margin: "0 0 1rem 0", fontSize: "1rem" }}>No agreement templates configured yet.</p>
                    <button
                      className={styles.secondaryBtn}
                      style={{ margin: "0 auto" }}
                      onClick={() => setIsModalOpen(true)}
                    >
                      + Create First Agreement Template
                    </button>
                  </td>
                </tr>
              ) : (
                templates.map((tpl) => {
                  const publishedVersion = tpl.versions?.find((v) => v.status === "PUBLISHED");
                  return (
                    <tr key={tpl.id}>
                      <td style={{ fontWeight: 600 }}>{tpl.program?.title || "Unknown Program"}</td>
                      <td>
                        <strong>{tpl.title}</strong>
                        {tpl.description && (
                          <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                            {tpl.description}
                          </div>
                        )}
                      </td>
                      <td>
                        {publishedVersion ? (
                          <span style={{
                            background: "#dcfce7",
                            color: "#15803d",
                            padding: "0.25rem 0.6rem",
                            borderRadius: "12px",
                            fontSize: "0.8rem",
                            fontWeight: 700
                          }}>
                            {publishedVersion.version} (Active)
                          </span>
                        ) : (
                          <span style={{
                            background: "#fef3c7",
                            color: "#b45309",
                            padding: "0.25rem 0.6rem",
                            borderRadius: "12px",
                            fontSize: "0.8rem",
                            fontWeight: 600
                          }}>
                            Draft Only
                          </span>
                        )}
                      </td>
                      <td>{tpl._count?.versions ?? tpl.versions?.length ?? 0} versions</td>
                      <td>
                        <strong style={{ color: "var(--accent-primary)" }}>
                          {tpl._count?.signedAgreements ?? 0}
                        </strong>{" "}
                        signed
                      </td>
                      <td style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                        {new Date(tpl.createdAt).toLocaleDateString()}
                      </td>
                      <td className={styles.alignRight}>
                        <Link
                          href={`/agreements/${tpl.id}`}
                          className={styles.secondaryBtn}
                          style={{ display: "inline-flex", textDecoration: "none", padding: "0.4rem 0.8rem", fontSize: "0.85rem" }}
                        >
                          Manage &amp; Audit →
                        </Link>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* CREATE TEMPLATE MODAL */}
      {isModalOpen && (
        <div style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.5)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 1000,
          padding: "1rem"
        }}>
          <div style={{
            background: "var(--bg-card)",
            borderRadius: "16px",
            width: "100%",
            maxWidth: "700px",
            maxHeight: "90vh",
            overflowY: "auto",
            padding: "2rem",
            boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)",
            border: "1px solid var(--border-light)"
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
              <h2 style={{ margin: 0, fontSize: "1.3rem", fontWeight: 800 }}>Create Agreement Template</h2>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                style={{ background: "none", border: "none", fontSize: "1.5rem", cursor: "pointer", color: "var(--text-secondary)" }}
              >
                ×
              </button>
            </div>

            <form onSubmit={handleCreateTemplate} style={{ display: "flex", flexDirection: "column", gap: "1.2rem" }}>
              <div>
                <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 700, marginBottom: "0.4rem" }}>
                  Select Program *
                </label>
                <select
                  value={selectedProgramId}
                  onChange={(e) => setSelectedProgramId(e.target.value)}
                  required
                  style={{
                    width: "100%",
                    padding: "0.75rem",
                    borderRadius: "8px",
                    border: "1px solid var(--border-light)",
                    background: "var(--bg-main)"
                  }}
                >
                  <option value="">-- Choose a program --</option>
                  {programs.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 700, marginBottom: "0.4rem" }}>
                  Template Title *
                </label>
                <input
                  type="text"
                  placeholder="e.g. 11 Steps to U Standard Program Agreement"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                  style={{
                    width: "100%",
                    padding: "0.75rem",
                    borderRadius: "8px",
                    border: "1px solid var(--border-light)",
                    background: "var(--bg-main)"
                  }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 700, marginBottom: "0.4rem" }}>
                  Description (Optional)
                </label>
                <input
                  type="text"
                  placeholder="Brief summary of what this contract governs"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "0.75rem",
                    borderRadius: "8px",
                    border: "1px solid var(--border-light)",
                    background: "var(--bg-main)"
                  }}
                />
              </div>

              <div style={{ display: "flex", gap: "1rem" }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 700, marginBottom: "0.4rem" }}>
                    Initial Version String *
                  </label>
                  <input
                    type="text"
                    placeholder="v1.0"
                    value={initialVersion}
                    onChange={(e) => setInitialVersion(e.target.value)}
                    required
                    style={{
                      width: "100%",
                      padding: "0.75rem",
                      borderRadius: "8px",
                      border: "1px solid var(--border-light)",
                      background: "var(--bg-main)"
                    }}
                  />
                </div>
                <div style={{ flex: 2 }}>
                  <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 700, marginBottom: "0.4rem" }}>
                    Changelog Note
                  </label>
                  <input
                    type="text"
                    placeholder="Initial terms and conditions release"
                    value={initialChangelog}
                    onChange={(e) => setInitialChangelog(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "0.75rem",
                      borderRadius: "8px",
                      border: "1px solid var(--border-light)",
                      background: "var(--bg-main)"
                    }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 700, marginBottom: "0.4rem" }}>
                  Agreement Terms &amp; Conditions (Contract Content) *
                </label>
                <textarea
                  rows={8}
                  placeholder="Enter full contract terms that the learner must read and consent to before Step 1 unlocks..."
                  value={initialContent}
                  onChange={(e) => setInitialContent(e.target.value)}
                  required
                  style={{
                    width: "100%",
                    padding: "0.75rem",
                    borderRadius: "8px",
                    border: "1px solid var(--border-light)",
                    background: "var(--bg-main)",
                    fontFamily: "inherit",
                    fontSize: "0.9rem",
                    resize: "vertical"
                  }}
                />
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                <input
                  type="checkbox"
                  id="publishNow"
                  checked={publishImmediately}
                  onChange={(e) => setPublishImmediately(e.target.checked)}
                  style={{ width: "18px", height: "18px", cursor: "pointer" }}
                />
                <label htmlFor="publishNow" style={{ fontSize: "0.9rem", fontWeight: 600, cursor: "pointer" }}>
                  Publish immediately (makes this version live for learner sign-off)
                </label>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "1rem", marginTop: "1rem" }}>
                <button
                  type="button"
                  className={styles.secondaryBtn}
                  onClick={() => setIsModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={styles.primaryBtn}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? "Creating..." : "Create Template"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
