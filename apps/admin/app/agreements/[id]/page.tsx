"use client";

import { useEffect, useState, use, FormEvent } from "react";
import styles from "../../page.module.css";
import Link from "next/link";
import { API_URL, errorMessage } from "../../lib/api";

interface TemplateDetails {
  id: string;
  title: string;
  description: string | null;
  programId: string;
  program?: {
    id: string;
    title: string;
    slug: string;
  };
  versions: TemplateVersion[];
}

interface TemplateVersion {
  id: string;
  templateId: string;
  version: string;
  content: string;
  changelog: string | null;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  publishedAt: string | null;
  createdAt: string;
  createdBy?: {
    id: string;
    name: string | null;
    email: string;
  } | null;
  _count?: {
    signedAgreements: number;
  };
}

interface SignedRecord {
  id: string;
  userId: string;
  user: {
    id: string;
    email: string;
    firstName?: string | null;
    lastName?: string | null;
    name?: string | null;
  };
  version: {
    id: string;
    version: string;
    publishedAt: string | null;
  };
  templateVersion: string;
  signerIp: string | null;
  userAgent: string | null;
  signedAt: string;
  status: string;
  signedPdfUrl: string | null;
  typedName: string | null;
  drawnSignature: string | null;
}

export default function AgreementTemplateDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const templateId = resolvedParams.id;

  const [template, setTemplate] = useState<TemplateDetails | null>(null);
  const [versions, setVersions] = useState<TemplateVersion[]>([]);
  const [signedRecords, setSignedRecords] = useState<SignedRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"versions" | "signed">("versions");

  // Create new version modal
  const [isVersionModalOpen, setIsVersionModalOpen] = useState(false);
  const [newVersionString, setNewVersionString] = useState("");
  const [newVersionContent, setNewVersionContent] = useState("");
  const [newVersionChangelog, setNewVersionChangelog] = useState("");
  const [publishNewVersion, setPublishNewVersion] = useState(false);

  // View content modal
  const [viewingVersion, setViewingVersion] = useState<TemplateVersion | null>(null);

  const [statusMsg, setStatusMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    fetchTemplateData();
  }, [templateId]);

  const fetchTemplateData = async () => {
    setIsLoading(true);
    setStatusMsg(null);
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const [tplRes, versionsRes, signedRes] = await Promise.all([
        fetch(`${API_URL}/admin/agreement-templates/${templateId}`, { headers }),
        fetch(`${API_URL}/admin/agreement-templates/${templateId}/versions`, { headers }),
        fetch(`${API_URL}/admin/agreement-templates/${templateId}/signed`, { headers }),
      ]);

      if (tplRes.ok) {
        const tplData = await tplRes.json();
        setTemplate(tplData);
      } else {
        const msg = await errorMessage(tplRes, "Failed to load template");
        setStatusMsg({ type: "error", text: msg });
      }

      if (versionsRes.ok) {
        const vData = await versionsRes.json();
        setVersions(Array.isArray(vData) ? vData : []);
      }

      if (signedRes.ok) {
        const sData = await signedRes.json();
        setSignedRecords(Array.isArray(sData) ? sData : []);
      }
    } catch (err: any) {
      setStatusMsg({ type: "error", text: err.message || "Failed to load agreement template details" });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateVersion = async (e: FormEvent) => {
    e.preventDefault();
    if (!newVersionString.trim() || !newVersionContent.trim()) {
      setStatusMsg({ type: "error", text: "Version string and content are required." });
      return;
    }

    setIsSubmitting(true);
    setStatusMsg(null);
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
      const res = await fetch(`${API_URL}/admin/agreement-templates/${templateId}/versions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          version: newVersionString.trim(),
          content: newVersionContent.trim(),
          changelog: newVersionChangelog.trim() || undefined,
          status: publishNewVersion ? "PUBLISHED" : "DRAFT",
        }),
      });

      if (!res.ok) {
        throw new Error(await errorMessage(res, "Failed to create new agreement version"));
      }

      setIsVersionModalOpen(false);
      setNewVersionString("");
      setNewVersionContent("");
      setNewVersionChangelog("");
      setPublishNewVersion(false);
      setStatusMsg({ type: "success", text: `Version ${newVersionString} created successfully.` });
      await fetchTemplateData();
    } catch (err: any) {
      console.error(err);
      setStatusMsg({ type: "error", text: err.message || "Failed to create version" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePublishVersion = async (version: TemplateVersion) => {
    if (!confirm(`Are you sure you want to publish ${version.version}? This will make it active for all learners and archive previous versions.`)) {
      return;
    }

    setStatusMsg(null);
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
      const res = await fetch(`${API_URL}/admin/agreement-templates/${templateId}/versions/${version.id}/publish`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });

      if (!res.ok) {
        throw new Error(await errorMessage(res, `Failed to publish ${version.version}`));
      }

      setStatusMsg({ type: "success", text: `Version ${version.version} is now PUBLISHED and live for learners.` });
      await fetchTemplateData();
    } catch (err: any) {
      console.error(err);
      setStatusMsg({ type: "error", text: err.message || "Publish action failed" });
    }
  };

  const handleDeleteDraft = async (version: TemplateVersion) => {
    if (!confirm(`Delete draft ${version.version}? This cannot be undone.`)) {
      return;
    }

    setStatusMsg(null);
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
      const res = await fetch(`${API_URL}/admin/agreement-templates/${templateId}/versions/${version.id}`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });

      if (!res.ok) {
        throw new Error(await errorMessage(res, `Failed to delete draft ${version.version}`));
      }

      setStatusMsg({ type: "success", text: `Draft ${version.version} deleted.` });
      await fetchTemplateData();
    } catch (err: any) {
      console.error(err);
      setStatusMsg({ type: "error", text: err.message || "Delete draft failed" });
    }
  };

  if (isLoading && !template) {
    return (
      <div className={styles.dashboard}>
        <p style={{ padding: "3rem", textAlign: "center", color: "var(--text-secondary)" }}>
          Loading agreement template details...
        </p>
      </div>
    );
  }

  if (!template) {
    return (
      <div className={styles.dashboard}>
        <div style={{ marginBottom: "0.25rem" }}>
          <Link href="/agreements" className={styles.backLink}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            <span>Back to Agreements</span>
          </Link>
        </div>
        <header className={styles.header}>
          <div className={styles.headerText}>
            <h1 className={styles.title}>Template Not Found</h1>
          </div>
        </header>
      </div>
    );
  }

  const activeVersion = versions.find((v) => v.status === "PUBLISHED");

  return (
    <div className={styles.dashboard}>
      <div style={{ marginBottom: "0.25rem" }}>
        <Link href="/agreements" className={styles.backLink}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          <span>Back to Agreements</span>
        </Link>
      </div>

      <header className={styles.header}>
        <div className={styles.headerText}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <h1 className={styles.title}>{template.title}</h1>
            {activeVersion ? (
              <span className={styles.correctBadge} style={{ fontSize: "0.8rem", padding: "0.25rem 0.65rem" }}>
                Active: {activeVersion.version}
              </span>
            ) : (
              <span style={{
                background: "#fef3c7",
                color: "#b45309",
                padding: "0.25rem 0.65rem",
                borderRadius: "9999px",
                fontSize: "0.8rem",
                fontWeight: 600,
                display: "inline-flex",
                alignItems: "center"
              }}>
                No Live Version
              </span>
            )}
          </div>
          <p className={styles.subtitle}>
            Program: <strong>{template.program?.title}</strong> • {template.description || "Governs learner eligibility and prerequisite for Step 1 access"}
          </p>
        </div>
        <div className={styles.headerActions}>
          <button
            className={styles.primaryBtn}
            onClick={() => {
              // Pre-fill next version guess based on active or last version
              const lastV = versions[0]?.version || "v1.0";
              const nextNum = (parseFloat(lastV.replace(/[^0-9.]/g, "")) || 1) + 1;
              setNewVersionString(`v${nextNum}.0`);
              setNewVersionContent(versions[0]?.content || "");
              setNewVersionChangelog("");
              setPublishNewVersion(false);
              setIsVersionModalOpen(true);
            }}
            style={{ display: "inline-flex", alignItems: "center", gap: "0.45rem" }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            <span>Create New Version</span>
          </button>
        </div>
      </header>

      {statusMsg && (
        <div className={statusMsg.type === "success" ? styles.alertSuccess : styles.alertError}>
          {statusMsg.type === "success" ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          )}
          <span>{statusMsg.text}</span>
        </div>
      )}

      {/* TABS */}
      <div className={styles.tabsContainer}>
        <button
          onClick={() => setActiveTab("versions")}
          className={`${styles.tabBtn} ${activeTab === "versions" ? styles.tabBtnActive : ""}`}
        >
          <span>Version History</span>
          <span className={styles.pointsBadge}>{versions.length}</span>
        </button>
        <button
          onClick={() => setActiveTab("signed")}
          className={`${styles.tabBtn} ${activeTab === "signed" ? styles.tabBtnActive : ""}`}
        >
          <span>Signed Records &amp; Audit</span>
          <span className={styles.pointsBadge}>{signedRecords.length}</span>
        </button>
      </div>

      {/* TAB 1: VERSIONS */}
      {activeTab === "versions" && (
        <section className={styles.tableSection}>
          <div className={styles.sectionHeader}>
            <div>
              <h2>Template Version History</h2>
              <p style={{ margin: "0.25rem 0 0 0", fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                Published and historical versions are legally immutable. Creating a new version does not mutate previously signed agreements.
              </p>
            </div>
          </div>

          <div className={styles.tableWrapper}>
            <table className={styles.adminTable}>
              <thead>
                <tr>
                  <th>Version</th>
                  <th>Status</th>
                  <th>Changelog / Notes</th>
                  <th>Published Date</th>
                  <th>Signed Count</th>
                  <th>Created By</th>
                  <th className={styles.alignRight}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {versions.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: "center", padding: "2rem", color: "var(--text-secondary)" }}>
                      No versions created yet. Click &quot;+ Create New Version&quot; to author v1.0.
                    </td>
                  </tr>
                ) : (
                  versions.map((ver) => {
                    const isPublished = ver.status === "PUBLISHED";
                    const isArchived = ver.status === "ARCHIVED";
                    const isDraft = ver.status === "DRAFT";
                    const signedCount = ver._count?.signedAgreements ?? 0;

                    return (
                      <tr key={ver.id}>
                        <td>
                          <strong>{ver.version}</strong>
                        </td>
                        <td>
                          {isPublished ? (
                            <span style={{
                              background: "#dcfce7",
                              color: "#15803d",
                              padding: "0.2rem 0.6rem",
                              borderRadius: "12px",
                              fontSize: "0.8rem",
                              fontWeight: 700
                            }}>
                              PUBLISHED (Active)
                            </span>
                          ) : isArchived ? (
                            <span style={{
                              background: "#f1f5f9",
                              color: "#475569",
                              padding: "0.2rem 0.6rem",
                              borderRadius: "12px",
                              fontSize: "0.8rem",
                              fontWeight: 600
                            }}>
                              ARCHIVED
                            </span>
                          ) : (
                            <span style={{
                              background: "#fef3c7",
                              color: "#b45309",
                              padding: "0.2rem 0.6rem",
                              borderRadius: "12px",
                              fontSize: "0.8rem",
                              fontWeight: 600
                            }}>
                              DRAFT
                            </span>
                          )}
                        </td>
                        <td style={{ fontSize: "0.85rem", maxWidth: "250px" }}>
                          {ver.changelog || "—"}
                        </td>
                        <td style={{ fontSize: "0.85rem" }}>
                          {ver.publishedAt ? new Date(ver.publishedAt).toLocaleDateString() : "Unpublished"}
                        </td>
                        <td>
                          <strong>{signedCount}</strong> signed
                        </td>
                        <td style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                          {ver.createdBy?.name || ver.createdBy?.email || "System"}
                        </td>
                        <td className={styles.alignRight}>
                          <div style={{ display: "inline-flex", gap: "0.5rem", alignItems: "center" }}>
                            <button
                              className={styles.secondaryBtn}
                              style={{ padding: "0.3rem 0.7rem", fontSize: "0.8rem" }}
                              onClick={() => setViewingVersion(ver)}
                            >
                              View Content
                            </button>
                            {isDraft && (
                              <button
                                className={styles.primaryBtn}
                                style={{ padding: "0.3rem 0.7rem", fontSize: "0.8rem" }}
                                onClick={() => handlePublishVersion(ver)}
                              >
                                Publish Live
                              </button>
                            )}
                            {isDraft && signedCount === 0 && (
                              <button
                                style={{
                                  background: "#fee2e2",
                                  color: "#b91c1c",
                                  border: "none",
                                  padding: "0.3rem 0.7rem",
                                  borderRadius: "6px",
                                  fontSize: "0.8rem",
                                  fontWeight: 600,
                                  cursor: "pointer"
                                }}
                                onClick={() => handleDeleteDraft(ver)}
                              >
                                Delete
                              </button>
                            )}
                            {(isPublished || isArchived) && (
                              <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)", fontStyle: "italic" }}>
                                🔒 Immutable
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* TAB 2: SIGNED RECORDS & AUDIT */}
      {activeTab === "signed" && (
        <section className={styles.tableSection}>
          <div className={styles.sectionHeader}>
            <div>
              <h2>Signed Learner Agreements</h2>
              <p style={{ margin: "0.25rem 0 0 0", fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                Auditable log of learners who signed this agreement, captured with immutable timestamp, IP, User-Agent, and drawn signature vector.
              </p>
            </div>
          </div>

          <div className={styles.tableWrapper}>
            <table className={styles.adminTable}>
              <thead>
                <tr>
                  <th>Learner</th>
                  <th>Signed Version</th>
                  <th>Signer Full Name</th>
                  <th>Signing Timestamp</th>
                  <th>Signer IP</th>
                  <th>Status</th>
                  <th>Signature</th>
                </tr>
              </thead>
              <tbody>
                {signedRecords.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: "center", padding: "3rem", color: "var(--text-secondary)" }}>
                      No learners have signed this agreement yet.
                    </td>
                  </tr>
                ) : (
                  signedRecords.map((rec) => {
                    const learnerName =
                      [rec.user?.firstName, rec.user?.lastName].filter(Boolean).join(" ") ||
                      rec.user?.name ||
                      rec.user?.email;

                    return (
                      <tr key={rec.id}>
                        <td>
                          <strong>{learnerName}</strong>
                          <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                            {rec.user?.email}
                          </div>
                        </td>
                        <td>
                          <span style={{
                            background: "#e2e8f0",
                            color: "#334155",
                            padding: "0.2rem 0.5rem",
                            borderRadius: "6px",
                            fontSize: "0.8rem",
                            fontWeight: 700
                          }}>
                            {rec.templateVersion || rec.version?.version}
                          </span>
                        </td>
                        <td style={{ fontWeight: 600 }}>{rec.typedName || "—"}</td>
                        <td style={{ fontSize: "0.85rem" }}>
                          {new Date(rec.signedAt).toLocaleString()}
                        </td>
                        <td style={{ fontSize: "0.85rem", fontFamily: "monospace" }}>
                          {rec.signerIp || "—"}
                        </td>
                        <td>
                          <span style={{
                            background: "#dcfce7",
                            color: "#15803d",
                            padding: "0.2rem 0.6rem",
                            borderRadius: "12px",
                            fontSize: "0.8rem",
                            fontWeight: 700
                          }}>
                            {rec.status}
                          </span>
                        </td>
                        <td>
                          {rec.drawnSignature && rec.drawnSignature.startsWith("data:image") ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={rec.drawnSignature}
                              alt="Drawn signature"
                              style={{ maxHeight: "32px", border: "1px solid var(--border-light)", borderRadius: "4px", background: "#fff" }}
                            />
                          ) : (
                            <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>Captured</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* CREATE NEW VERSION MODAL */}
      {isVersionModalOpen && (
        <div className={styles.modalOverlay} onClick={() => !isSubmitting && setIsVersionModalOpen(false)}>
          <div className={styles.modalContent} style={{ maxWidth: "700px" }} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div>
                <h2>Create New Agreement Version</h2>
                <p className={styles.modalIntro}>Draft and publish legally immutable terms for this curriculum</p>
              </div>
              <button
                type="button"
                className={styles.closeBtn}
                onClick={() => setIsVersionModalOpen(false)}
                disabled={isSubmitting}
                aria-label="Close modal"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleCreateVersion} className={styles.modalForm}>
              <div className={styles.formRow}>
                <div className={styles.formGroup} style={{ flex: 1 }}>
                  <label>
                    Version Tag <span style={{ color: "#ef4444" }}>*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. v2.0"
                    value={newVersionString}
                    onChange={(e) => setNewVersionString(e.target.value)}
                    required
                  />
                </div>
                <div className={styles.formGroup} style={{ flex: 2 }}>
                  <label>
                    Changelog / Revision Summary <span className={styles.optionalLabel}>(Optional)</span>
                  </label>
                  <input
                    type="text"
                    placeholder="Describe legal or clause updates in this release..."
                    value={newVersionChangelog}
                    onChange={(e) => setNewVersionChangelog(e.target.value)}
                  />
                </div>
              </div>

              <div className={styles.formGroup}>
                <label>
                  Contract Terms &amp; Conditions (Markdown or Plain Text) <span style={{ color: "#ef4444" }}>*</span>
                </label>
                <textarea
                  rows={10}
                  value={newVersionContent}
                  onChange={(e) => setNewVersionContent(e.target.value)}
                  required
                />
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "0.65rem", padding: "0.5rem 0" }}>
                <input
                  type="checkbox"
                  id="publishNew"
                  checked={publishNewVersion}
                  onChange={(e) => setPublishNewVersion(e.target.checked)}
                  style={{ width: "16px", height: "16px", cursor: "pointer", accentColor: "var(--accent-primary)" }}
                />
                <label htmlFor="publishNew" style={{ fontSize: "0.85rem", fontWeight: 600, cursor: "pointer", color: "var(--text-primary)" }}>
                  Publish immediately (activates this version for learners and archives previous live version)
                </label>
              </div>

              <div className={styles.modalFooter}>
                <button
                  type="button"
                  className={styles.secondaryBtn}
                  onClick={() => setIsVersionModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={styles.primaryBtn}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? "Saving..." : "Create Version"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* VIEW CONTENT MODAL */}
      {viewingVersion && (
        <div className={styles.modalOverlay} onClick={() => setViewingVersion(null)}>
          <div className={styles.modalContent} style={{ maxWidth: "700px" }} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div>
                <h2>Agreement Terms — {viewingVersion.version}</h2>
                <p className={styles.modalIntro}>
                  Status: <strong>{viewingVersion.status}</strong> • {viewingVersion.publishedAt ? `Published on ${new Date(viewingVersion.publishedAt).toLocaleDateString()}` : "Draft"}
                </p>
              </div>
              <button
                type="button"
                className={styles.closeBtn}
                onClick={() => setViewingVersion(null)}
                aria-label="Close modal"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <div style={{
              maxHeight: "55vh",
              overflowY: "auto",
              background: "var(--bg-soft)",
              padding: "1.25rem",
              borderRadius: "8px",
              border: "1px solid var(--border-light)",
              fontSize: "0.875rem",
              lineHeight: 1.6,
              whiteSpace: "pre-wrap",
              fontFamily: "inherit",
              color: "var(--text-primary)",
              marginBottom: "1rem"
            }}>
              {viewingVersion.content}
            </div>

            <div className={styles.modalFooter}>
              <button
                type="button"
                className={styles.secondaryBtn}
                onClick={() => setViewingVersion(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
