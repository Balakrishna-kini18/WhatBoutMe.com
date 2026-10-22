"use client";

import { useEffect, useState, FormEvent } from "react";
import styles from "../page.module.css";
import Link from "next/link";
import { API_URL, errorMessage } from "../lib/api";
import { CustomSelect, StatusBadge, TableSkeleton, EmptyState } from "../components";

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
  const [scopeType, setScopeType] = useState<"PROGRAM" | "SHARED_DEFAULT">("PROGRAM");
  const [selectedProgramId, setSelectedProgramId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [initialVersion, setInitialVersion] = useState("v1.0");
  const [initialContent, setInitialContent] = useState("");
  const [initialChangelog, setInitialChangelog] = useState("Initial terms and conditions release");
  const [publishImmediately, setPublishImmediately] = useState(false);

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
        const rawPrograms = Array.isArray(programsData) ? programsData : [];
        const filteredPrograms = rawPrograms
          .filter((p: any) => !p.isArchived && !/test\s*program|placeholder|junk|foo\s*bar/i.test(p.title))
          .sort((a: any, b: any) => a.title.localeCompare(b.title));
        setPrograms(filteredPrograms);
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to load data");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateTemplate = async (e: FormEvent) => {
    e.preventDefault();

    if (scopeType === "PROGRAM" && !selectedProgramId) {
      setErrorMsg("Please select a target program for this agreement.");
      return;
    }

    if (!title.trim() || !initialContent.trim()) {
      setErrorMsg("Please enter an agreement title and terms content.");
      return;
    }

    // For shared default, link to first active program to satisfy foreign key constraint
    const targetProgramId = scopeType === "PROGRAM" ? selectedProgramId : programs[0]?.id;
    if (!targetProgramId) {
      setErrorMsg("At least one active program is required in the system to establish an agreement template.");
      return;
    }

    // Embed [Shared Default] marker in description if shared default scope was chosen
    const resolvedDescription =
      scopeType === "SHARED_DEFAULT"
        ? [description.trim(), "[Shared Default]"].filter(Boolean).join(" ")
        : description.trim() || undefined;

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
          programId: targetProgramId,
          title: title.trim(),
          description: resolvedDescription,
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
    setScopeType("PROGRAM");
    setSelectedProgramId("");
    setTitle("");
    setDescription("");
    setInitialVersion("v1.0");
    setInitialContent("");
    setInitialChangelog("Initial terms and conditions release");
    setPublishImmediately(false);
  };

  return (
    <div className={styles.dashboard}>
      <header className={styles.header}>
        <div className={styles.headerText}>
          <h1 className={styles.title}>Program Agreements</h1>
          {/* <p className={styles.subtitle}>
            Author, version, and manage legally binding curriculum agreements and review signed learner records.
          </p> */}
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

      {/* AGREEMENTS INDEX TABLE */}
      <section className={styles.tableSection}>
        <div className={styles.sectionHeader} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <h2>Configured Agreements</h2>
            {!isLoading && (
              <span
                style={{
                  fontSize: "0.76rem",
                  fontWeight: 600,
                  color: "var(--text-secondary)",
                  background: "var(--bg-soft, #f7f3ec)",
                  border: "1px solid var(--border-light, #e7decb)",
                  padding: "2px 8px",
                  borderRadius: "12px",
                }}
              >
                {templates.length} {templates.length === 1 ? "agreement" : "agreements"}
              </span>
            )}
          </div>
        </div>

        <div className={styles.tableWrapper}>
          <table className={styles.adminTable}>
            <thead>
              <tr>
                <th>Agreement Name</th>
                <th style={{ width: "220px" }}>Scope</th>
                <th style={{ width: "90px" }}>Version</th>
                <th style={{ width: "130px" }}>Status</th>
                <th style={{ width: "100px" }}>Signed</th>
                <th style={{ width: "120px" }}>Updated</th>
                <th className={styles.alignRight} style={{ width: "120px" }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <TableSkeleton columns={7} rows={4} />
              ) : templates.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: "32px 16px" }}>
                    <EmptyState
                      icon="document"
                      title="No agreement templates configured yet"
                      description="Create legal consent waivers and digital workshop terms before enrolling learners."
                      actionLabel="Create First Agreement Template"
                      onAction={() => setIsModalOpen(true)}
                    />
                  </td>
                </tr>
              ) : (
                templates.map((tpl) => {
                  const publishedVersion = tpl.versions?.find((v) => v.status === "PUBLISHED");
                  const hasDraft = tpl.versions?.some((v) => v.status === "DRAFT");
                  const status: "PUBLISHED" | "DRAFT" | "ARCHIVED" = publishedVersion
                    ? "PUBLISHED"
                    : hasDraft
                    ? "DRAFT"
                    : "ARCHIVED";

                  // The create flow writes a `[Shared Default]` marker into the
                  // description; that marker is authoritative. The heuristic on
                  // the title is only a fallback for older rows.
                  const isSharedDefault =
                    /\[Shared Default\]/.test(tpl.description ?? "") ||
                    /standard|default|general|platform/i.test(tpl.title) ||
                    /default|shared/i.test(tpl.description || "");

                  const currentVersionText = publishedVersion?.version || tpl.versions?.[0]?.version || "—";
                  const signedCount = tpl._count?.signedAgreements ?? 0;
                  const updatedDate = new Date(tpl.updatedAt || tpl.createdAt).toLocaleDateString();
                  const cleanDescription = (tpl.description ?? "").replace(/^\[Shared Default\]\s*/i, "").trim();

                  return (
                    <tr key={tpl.id}>
                      <td>
                        <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>{tpl.title}</span>
                        {cleanDescription && (
                          <div style={{ fontSize: "0.78rem", color: "var(--text-secondary)", marginTop: "2px" }}>
                            {cleanDescription}
                          </div>
                        )}
                      </td>
                      <td>
                        {isSharedDefault ? (
                          <div style={{ display: "inline-flex", flexDirection: "column", gap: "2px" }}>
                            <span
                              style={{
                                display: "inline-block",
                                width: "fit-content",
                                fontSize: "0.72rem",
                                fontWeight: 600,
                                color: "#92400e",
                                background: "#fef3c7",
                                border: "1px solid #fde68a",
                                padding: "2px 8px",
                                borderRadius: "4px",
                                letterSpacing: "0.02em",
                              }}
                            >
                              Shared Default
                            </span>
                            <span style={{ fontSize: "0.76rem", color: "var(--text-muted)" }}>
                              All unassigned courses
                            </span>
                          </div>
                        ) : (
                          <div style={{ display: "inline-flex", flexDirection: "column", gap: "2px" }}>
                            <span
                              style={{
                                display: "inline-block",
                                width: "fit-content",
                                fontSize: "0.72rem",
                                fontWeight: 600,
                                color: "var(--accent-primary, #b86b11)",
                                background: "var(--bg-soft, #f7f3ec)",
                                border: "1px solid #ebdccb",
                                padding: "2px 8px",
                                borderRadius: "4px",
                                letterSpacing: "0.02em",
                              }}
                            >
                              Program-specific
                            </span>
                            {tpl.program?.title && (
                              <span style={{ fontSize: "0.78rem", color: "var(--text-secondary)", fontWeight: 500 }}>
                                {tpl.program.title}
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                      <td>
                        <span style={{ fontSize: "0.85rem", color: "var(--text-primary)" }}>
                          {currentVersionText}
                        </span>
                      </td>
                      <td>
                        <StatusBadge status={status} />
                      </td>
                      <td>
                        <span style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                          {signedCount} signed
                        </span>
                      </td>
                      <td>
                        <span style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
                          {updatedDate}
                        </span>
                      </td>
                      <td className={styles.alignRight}>
                        <Link
                          href={`/agreements/${tpl.id}`}
                          className={styles.secondaryBtnSmall}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "6px",
                            textDecoration: "none",
                            whiteSpace: "nowrap",
                          }}
                        >
                          <span>Manage</span>
                          <span aria-hidden="true">&rarr;</span>
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
            style={{ maxWidth: "720px" }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="agreement-modal-title"
          >
            <div className={styles.modalHeader}>
              <div>
                <h2 id="agreement-modal-title">Create Agreement Template</h2>
                <p className={styles.modalIntro}>
                  Establish legal terms and conditions required before course payment and access.
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
                {/* 1. Explicit Scope Selector */}
                <div className={styles.formGroup}>
                  <label style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "0.35rem" }}>
                    Agreement Scope <span style={{ color: "var(--status-error)" }}>*</span>
                  </label>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                    <button
                      type="button"
                      onClick={() => setScopeType("PROGRAM")}
                      style={{
                        padding: "0.75rem 1rem",
                        borderRadius: "8px",
                        border: scopeType === "PROGRAM" ? "2px solid var(--accent-primary, #b86b11)" : "1px solid var(--border-light, #e7decb)",
                        background: scopeType === "PROGRAM" ? "var(--bg-soft, #f7f3ec)" : "#ffffff",
                        textAlign: "left",
                        cursor: "pointer",
                        transition: "all 0.15s ease",
                      }}
                    >
                      <div style={{ fontWeight: 600, fontSize: "0.85rem", color: "var(--text-primary)" }}>
                        Program-specific
                      </div>
                      <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "2px" }}>
                        Assigned directly to a single curriculum
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setScopeType("SHARED_DEFAULT")}
                      style={{
                        padding: "0.75rem 1rem",
                        borderRadius: "8px",
                        border: scopeType === "SHARED_DEFAULT" ? "2px solid var(--accent-primary, #b86b11)" : "1px solid var(--border-light, #e7decb)",
                        background: scopeType === "SHARED_DEFAULT" ? "var(--bg-soft, #f7f3ec)" : "#ffffff",
                        textAlign: "left",
                        cursor: "pointer",
                        transition: "all 0.15s ease",
                      }}
                    >
                      <div style={{ fontWeight: 600, fontSize: "0.85rem", color: "var(--text-primary)" }}>
                        Shared default
                      </div>
                      <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "2px" }}>
                        Platform fallback for unassigned courses
                      </div>
                    </button>
                  </div>
                </div>

                {/* 2. Program Selector (Only when Program-specific scope is selected) */}
                {scopeType === "PROGRAM" ? (
                  <div className={styles.formGroup}>
                    <label>
                      Select Program <span style={{ color: "var(--status-error)" }}>*</span>
                    </label>
                    <CustomSelect
                      value={selectedProgramId}
                      onChange={setSelectedProgramId}
                      fullWidth
                      menuMaxHeight="220px"
                      ariaLabel="Select Program"
                      placeholder="-- Choose a program --"
                      options={programs.map((p) => ({
                        value: p.id,
                        label: p.title,
                      }))}
                    />
                    <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", margin: "4px 0 0" }}>
                      Learners enrolling in this course will be required to sign this document before payment.
                    </p>
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
                    <div style={{
                      background: "var(--bg-soft, #f7f3ec)",
                      border: "1px solid var(--border-light, #e7decb)",
                      borderRadius: "8px",
                      padding: "0.75rem 1rem",
                      fontSize: "0.82rem",
                      color: "var(--text-secondary)",
                      lineHeight: 1.5,
                    }}>
                      Shared default agreements apply automatically as a platform fallback to any course that does not have its own program-specific terms.
                    </div>
                    {templates.some((t) => /\[Shared Default\]/.test(t.description ?? "")) && (
                      <div style={{
                        background: "#fffbeb",
                        border: "1px solid #fde68a",
                        borderRadius: "8px",
                        padding: "0.7rem 1rem",
                        fontSize: "0.78rem",
                        color: "#92400e",
                        lineHeight: 1.5,
                      }}>
                        A shared default agreement already exists. Review the existing one before publishing another.
                      </div>
                    )}
                  </div>
                )}

                {/* 3. Agreement Title */}
                <div className={styles.formGroup}>
                  <label>
                    Template Title <span style={{ color: "var(--status-error)" }}>*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 11 Steps Standard Program Agreement"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    required
                  />
                </div>

                {/* 4. Description */}
                <div className={styles.formGroup}>
                  <label>Description <span className={styles.optionalLabel}>(Optional)</span></label>
                  <input
                    type="text"
                    placeholder="Brief administrative summary of what this agreement covers"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </div>

                {/* 5. Versioning row */}
                <div className={styles.formRow}>
                  <div className={styles.formGroup}>
                    <label>
                      Initial Version <span style={{ color: "var(--status-error)" }}>*</span>
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
                    <label>Changelog Note <span className={styles.optionalLabel}>(Optional)</span></label>
                    <input
                      type="text"
                      placeholder="e.g. Initial terms and conditions release"
                      value={initialChangelog}
                      onChange={(e) => setInitialChangelog(e.target.value)}
                    />
                  </div>
                </div>

                {/* 6. Agreement Terms */}
                <div className={styles.formGroup}>
                  <label>
                    Agreement Terms &amp; Conditions <span style={{ color: "var(--status-error)" }}>*</span>
                  </label>
                  <textarea
                    rows={6}
                    placeholder="Enter agreement terms that the learner must review and consent to before checkout..."
                    value={initialContent}
                    onChange={(e) => setInitialContent(e.target.value)}
                    required
                    style={{
                      fontFamily: "var(--font-sans), system-ui, sans-serif",
                      fontSize: "0.88rem",
                      lineHeight: "1.6",
                      padding: "0.75rem 1rem",
                      minHeight: "130px",
                    }}
                  />
                </div>

                {/* 7. Publication Status Lifecycle */}
                <div className={styles.formGroup}>
                  <label style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "0.35rem" }}>
                    Initial Lifecycle State
                  </label>
                  <div style={{ display: "flex", gap: "1.5rem" }}>
                    <label style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem", cursor: "pointer", fontSize: "0.85rem", color: "var(--text-primary)" }}>
                      <input
                        type="radio"
                        name="lifecycle"
                        checked={!publishImmediately}
                        onChange={() => setPublishImmediately(false)}
                        style={{ accentColor: "var(--accent-primary)" }}
                      />
                      <span>Save as Draft (Review before publishing)</span>
                    </label>
                    <label style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem", cursor: "pointer", fontSize: "0.85rem", color: "var(--text-primary)" }}>
                      <input
                        type="radio"
                        name="lifecycle"
                        checked={publishImmediately}
                        onChange={() => setPublishImmediately(true)}
                        style={{ accentColor: "var(--accent-primary)" }}
                      />
                      <span>Publish Live (Activate immediately for learners)</span>
                    </label>
                  </div>
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
                  {isSubmitting ? (
                    <>
                      <span className="spinner" /> Creating...
                    </>
                  ) : (
                    "Create Agreement"
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
