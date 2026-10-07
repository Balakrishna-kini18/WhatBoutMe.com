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
        <header className={styles.header}>
          <div className={styles.headerText}>
            <Link href="/agreements" className={styles.backLink}>← Back to Agreements</Link>
            <h1 className={styles.title}>Template Not Found</h1>
          </div>
        </header>
      </div>
    );
  }

  const activeVersion = versions.find((v) => v.status === "PUBLISHED");

  return (
    <div className={styles.dashboard}>
      <header className={styles.header}>
        <div className={styles.headerText}>
          <Link href="/agreements" className={styles.backLink}>← Back to Agreements</Link>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginTop: "0.5rem" }}>
            <h1 className={styles.title}>{template.title}</h1>
            {activeVersion ? (
              <span style={{
                background: "#dcfce7",
                color: "#15803d",
                padding: "0.25rem 0.75rem",
                borderRadius: "16px",
                fontSize: "0.85rem",
                fontWeight: 700
              }}>
                Active: {activeVersion.version}
              </span>
            ) : (
              <span style={{
                background: "#fef3c7",
                color: "#b45309",
                padding: "0.25rem 0.75rem",
                borderRadius: "16px",
                fontSize: "0.85rem",
                fontWeight: 600
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
          >
            + Create New Version
          </button>
        </div>
      </header>

      {statusMsg && (
        <div style={{
          background: statusMsg.type === "success" ? "#ecfdf5" : "#fee2e2",
          border: `1px solid ${statusMsg.type === "success" ? "#10b981" : "#ef4444"}`,
          color: statusMsg.type === "success" ? "#047857" : "#b91c1c",
          padding: "1rem",
          borderRadius: "8px",
          marginBottom: "1.5rem",
          fontSize: "0.9rem"
        }}>
          {statusMsg.text}
        </div>
      )}

      {/* TABS */}
      <div style={{ display: "flex", gap: "1rem", borderBottom: "1px solid var(--border-light)", marginBottom: "1.5rem" }}>
        <button
          onClick={() => setActiveTab("versions")}
          style={{
            background: "none",
            border: "none",
            padding: "0.75rem 1.5rem",
            fontSize: "0.95rem",
            fontWeight: 700,
            cursor: "pointer",
            borderBottom: activeTab === "versions" ? "3px solid var(--accent-primary)" : "3px solid transparent",
            color: activeTab === "versions" ? "var(--text-primary)" : "var(--text-secondary)"
          }}
        >
          Version History ({versions.length})
        </button>
        <button
          onClick={() => setActiveTab("signed")}
          style={{
            background: "none",
            border: "none",
            padding: "0.75rem 1.5rem",
            fontSize: "0.95rem",
            fontWeight: 700,
            cursor: "pointer",
            borderBottom: activeTab === "signed" ? "3px solid var(--accent-primary)" : "3px solid transparent",
            color: activeTab === "signed" ? "var(--text-primary)" : "var(--text-secondary)"
          }}
        >
          Signed Records &amp; Audit ({signedRecords.length})
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
            maxWidth: "750px",
            maxHeight: "90vh",
            overflowY: "auto",
            padding: "2rem",
            boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1)",
            border: "1px solid var(--border-light)"
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
              <h2 style={{ margin: 0, fontSize: "1.3rem", fontWeight: 800 }}>Create New Agreement Version</h2>
              <button
                type="button"
                onClick={() => setIsVersionModalOpen(false)}
                style={{ background: "none", border: "none", fontSize: "1.5rem", cursor: "pointer", color: "var(--text-secondary)" }}
              >
                ×
              </button>
            </div>

            <form onSubmit={handleCreateVersion} style={{ display: "flex", flexDirection: "column", gap: "1.2rem" }}>
              <div style={{ display: "flex", gap: "1rem" }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 700, marginBottom: "0.4rem" }}>
                    Version Tag *
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. v2.0"
                    value={newVersionString}
                    onChange={(e) => setNewVersionString(e.target.value)}
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
                    Changelog / Revision Summary
                  </label>
                  <input
                    type="text"
                    placeholder="Describe legal or clause updates in this release..."
                    value={newVersionChangelog}
                    onChange={(e) => setNewVersionChangelog(e.target.value)}
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
                  Contract Terms &amp; Conditions (Markdown or Plain Text) *
                </label>
                <textarea
                  rows={10}
                  value={newVersionContent}
                  onChange={(e) => setNewVersionContent(e.target.value)}
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
                  id="publishNew"
                  checked={publishNewVersion}
                  onChange={(e) => setPublishNewVersion(e.target.checked)}
                  style={{ width: "18px", height: "18px", cursor: "pointer" }}
                />
                <label htmlFor="publishNew" style={{ fontSize: "0.9rem", fontWeight: 600, cursor: "pointer" }}>
                  Publish immediately (activates this version for learners and archives previous live version)
                </label>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "1rem", marginTop: "1rem" }}>
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
            maxHeight: "85vh",
            display: "flex",
            flexDirection: "column",
            padding: "2rem",
            boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1)",
            border: "1px solid var(--border-light)"
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
              <div>
                <h2 style={{ margin: 0, fontSize: "1.2rem", fontWeight: 800 }}>
                  Agreement Terms — {viewingVersion.version}
                </h2>
                <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                  Status: <strong>{viewingVersion.status}</strong> • {viewingVersion.publishedAt ? `Published on ${new Date(viewingVersion.publishedAt).toLocaleDateString()}` : "Draft"}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setViewingVersion(null)}
                style={{ background: "none", border: "none", fontSize: "1.5rem", cursor: "pointer", color: "var(--text-secondary)" }}
              >
                ×
              </button>
            </div>

            <div style={{
              flex: 1,
              overflowY: "auto",
              background: "var(--bg-main)",
              padding: "1.5rem",
              borderRadius: "8px",
              border: "1px solid var(--border-light)",
              fontSize: "0.9rem",
              lineHeight: 1.6,
              whiteSpace: "pre-wrap",
              fontFamily: "inherit"
            }}>
              {viewingVersion.content}
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "1rem" }}>
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
