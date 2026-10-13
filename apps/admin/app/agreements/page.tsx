"use client";

import { useEffect, useState, FormEvent } from "react";
import styles from "../page.module.css";
import Link from "next/link";
import { API_URL, errorMessage } from "../lib/api";
import { CustomSelect, StatusBadge } from "../components";

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

  // Lock background scroll and listen for Escape key when modal is open
  useEffect(() => {
    if (!isModalOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsModalOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isModalOpen]);

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
            style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem" }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
            <span>Create Agreement Template</span>
          </button>
        </div>
      </header>

      {errorMsg && (
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
          <span>{errorMsg}</span>
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
                  <td colSpan={7} style={{ textAlign: "center", padding: "36px", color: "var(--text-secondary)" }}>
                    Loading agreement templates...
                  </td>
                </tr>
              ) : templates.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: "center", padding: "36px", color: "var(--text-secondary)" }}>
                    <p style={{ margin: "0 0 1rem 0", fontSize: "0.95rem" }}>No agreement templates configured yet.</p>
                    <button
                      className={styles.secondaryBtn}
                      style={{ margin: "0 auto", display: "inline-flex", alignItems: "center", gap: "0.5rem" }}
                      onClick={() => setIsModalOpen(true)}
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <line x1="12" y1="5" x2="12" y2="19"></line>
                        <line x1="5" y1="12" x2="19" y2="12"></line>
                      </svg>
                      <span>Create First Agreement Template</span>
                    </button>
                  </td>
                </tr>
              ) : (
                templates.map((tpl) => {
                  const publishedVersion = tpl.versions?.find((v) => v.status === "PUBLISHED");
                  return (
                    <tr key={tpl.id}>
                      <td>
                        <span className={styles.cellUserName}>{tpl.program?.title || "Unknown Program"}</span>
                      </td>
                      <td>
                        <span className={styles.cellText} style={{ fontWeight: 600 }}>{tpl.title}</span>
                        {tpl.description && (
                          <div className={styles.cellTextMuted}>
                            {tpl.description}
                          </div>
                        )}
                      </td>
                      <td>
                        {publishedVersion ? (
                          <div style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                            <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--text-primary)" }}>
                              {publishedVersion.version}
                            </span>
                            <StatusBadge status="ACTIVE" />
                          </div>
                        ) : (
                          <StatusBadge status="DRAFT" />
                        )}
                      </td>
                      <td>
                        <span className={styles.cellText}>{tpl._count?.versions ?? tpl.versions?.length ?? 0} versions</span>
                      </td>
                      <td>
                        <strong style={{ color: "var(--accent-primary)", fontWeight: 700 }}>
                          {tpl._count?.signedAgreements ?? 0}
                        </strong>{" "}
                        <span className={styles.cellTextMuted}>signed</span>
                      </td>
                      <td>
                        <span className={styles.cellTextMuted}>
                          {new Date(tpl.createdAt).toLocaleDateString()}
                        </span>
                      </td>
                      <td className={styles.alignRight}>
                        <Link
                          href={`/agreements/${tpl.id}`}
                          className={styles.secondaryBtnSmall}
                          style={{ display: "inline-flex", textDecoration: "none" }}
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
        <div className={styles.modalOverlay} onClick={() => setIsModalOpen(false)}>
          <div
            className={styles.modalContent}
            style={{ maxWidth: "780px" }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="agreement-modal-title"
          >
            <div className={styles.modalHeader}>
              <div>
                <h2 id="agreement-modal-title">Create Agreement Template</h2>
                <p className={styles.modalIntro}>
                  Define terms and conditions for learner sign-off.
                </p>
              </div>
              <button
                type="button"
                className={styles.closeBtn}
                onClick={() => setIsModalOpen(false)}
                aria-label="Close dialog"
              >
                ×
              </button>
            </div>

            <form
              onSubmit={handleCreateTemplate}
              style={{ display: "flex", flexDirection: "column", flex: "1 1 auto", minHeight: 0, overflow: "hidden" }}
            >
              <div className={styles.modalBody}>
                <div className={styles.formGroup}>
                  <label>
                    Select Program <span style={{ color: "var(--status-error)" }}>*</span>
                  </label>
                  <CustomSelect
                    value={selectedProgramId}
                    onChange={setSelectedProgramId}
                    fullWidth
                    ariaLabel="Select Program"
                    placeholder="-- Choose a program --"
                    options={programs.map((p) => ({
                      value: p.id,
                      label: p.title,
                    }))}
                  />
                </div>

                <div className={styles.formGroup}>
                  <label>
                    Template Title <span style={{ color: "var(--status-error)" }}>*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 11 Steps to U Standard Program Agreement"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    required
                  />
                </div>

                <div className={styles.formGroup}>
                  <label>Description <span className={styles.optionalLabel}>(Optional)</span></label>
                  <input
                    type="text"
                    placeholder="Brief summary of what this contract governs"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </div>

                <div className={styles.formRow}>
                  <div className={styles.formGroup}>
                    <label>
                      Initial Version String <span style={{ color: "var(--status-error)" }}>*</span>
                    </label>
                    <input
                      type="text"
                      placeholder="v1.0"
                      value={initialVersion}
                      onChange={(e) => setInitialVersion(e.target.value)}
                      required
                    />
                  </div>
                  <div className={styles.formGroup}>
                    <label>Changelog Note</label>
                    <input
                      type="text"
                      placeholder="Initial terms and conditions release"
                      value={initialChangelog}
                      onChange={(e) => setInitialChangelog(e.target.value)}
                    />
                  </div>
                </div>

                <div className={styles.formGroup}>
                  <label>
                    Agreement Terms &amp; Conditions (Contract Content) <span style={{ color: "var(--status-error)" }}>*</span>
                  </label>
                  <textarea
                    rows={10}
                    placeholder="Enter full contract terms that the learner must read and consent to before Step 1 unlocks..."
                    value={initialContent}
                    onChange={(e) => setInitialContent(e.target.value)}
                    required
                    style={{
                      fontFamily: "var(--font-sans), system-ui, sans-serif",
                      fontSize: "0.88rem",
                      lineHeight: "1.6",
                      padding: "0.75rem 1rem",
                      minHeight: "180px",
                    }}
                  />
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", margin: "0.25rem 0" }}>
                  <input
                    type="checkbox"
                    id="publishNow"
                    checked={publishImmediately}
                    onChange={(e) => setPublishImmediately(e.target.checked)}
                    style={{ width: "16px", height: "16px", cursor: "pointer", accentColor: "var(--accent-primary)" }}
                  />
                  <label htmlFor="publishNow" style={{ fontSize: "0.88rem", fontWeight: 500, cursor: "pointer", color: "var(--text-primary)" }}>
                    Publish immediately (makes this version live for learner sign-off)
                  </label>
                </div>
              </div>

              <div className={styles.modalFooter}>
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
