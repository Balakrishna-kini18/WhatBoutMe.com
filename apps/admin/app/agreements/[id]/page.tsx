"use client";

import { useEffect, useState, use, FormEvent } from "react";
import Image from "next/image";
import styles from "../../page.module.css";
import Link from "next/link";
import { API_URL, errorMessage, cachedFetch } from "../../lib/api";
import { StatusBadge, CustomSelect, type CustomSelectOption, ConfirmDialog, useToast, AgreementMarkdown } from "../../components";

const ENROLMENT_STATUS_OPTIONS: CustomSelectOption[] = [
  { value: "ALL", label: "Enrolment: All" },
  { value: "ACTIVE", label: "Active (Paid)" },
  { value: "PENDING_PAYMENT", label: "Pending Payment" },
  { value: "REVOKED", label: "Revoked Access" },
  { value: "COMPLETED", label: "Completed" },
];

const PAYMENT_STATUS_OPTIONS: CustomSelectOption[] = [
  { value: "ALL", label: "Payment: All" },
  { value: "PAID", label: "Paid / Succeeded" },
  { value: "PENDING", label: "Pending" },
  { value: "REFUNDED", label: "Refunded" },
  { value: "FAILED", label: "Failed / Abandoned" },
];

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
  enrolmentId?: string;
  programId?: string;
  templateId?: string;
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
    content?: string;
    publishedAt: string | null;
  };
  templateVersion: string;
  consentVersion?: string | null;
  consentTimestamp?: string | null;
  signatureType?: string | null;
  signerIp: string | null;
  userAgent: string | null;
  signedAt: string;
  status: string;
  signedPdfUrl: string | null;
  typedName: string | null;
  drawnSignature: string | null;
  scope?: "SHARED_DEFAULT" | "PROGRAM";
  paymentStatus?: "PAID" | "PENDING" | "REFUNDED" | "FAILED";
  enrolmentStatus?: string;
  programTitle?: string;
  program?: {
    id: string;
    title: string;
    slug?: string;
    price?: number;
  };
  enrolment?: {
    id: string;
    status: string;
    batchId?: string;
    batch?: {
      id: string;
      name: string;
      startDate?: string;
    };
    payments?: Array<{
      id: string;
      status: string;
      amount: number;
      currency: string;
      stripeSessionId?: string;
      createdAt: string;
    }>;
  };
  auditLogs?: Array<{
    id: string;
    action: string;
    entity: string;
    meta?: any;
    ip?: string;
    createdAt: string;
  }>;
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
  const toast = useToast();
  const [confirmConfig, setConfirmConfig] = useState<{
    isOpen: boolean;
    title: string;
    subtitle?: string;
    description: React.ReactNode;
    confirmText?: string;
    tone?: "danger" | "warning" | "info";
    onConfirm: () => Promise<void> | void;
  } | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);

  // Create new version modal
  const [isVersionModalOpen, setIsVersionModalOpen] = useState(false);
  const [newVersionString, setNewVersionString] = useState("");
  const [newVersionContent, setNewVersionContent] = useState("");
  const [newVersionChangelog, setNewVersionChangelog] = useState("");
  const [publishNewVersion, setPublishNewVersion] = useState(false);
  const [versionEditorTab, setVersionEditorTab] = useState<"edit" | "preview">("edit");
  const [versionInlineError, setVersionInlineError] = useState<string | null>(null);

  // Edit template info modal
  const [isEditTemplateModalOpen, setIsEditTemplateModalOpen] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");

  // View content modal
  const [viewingVersion, setViewingVersion] = useState<TemplateVersion | null>(null);
  const [copiedTerms, setCopiedTerms] = useState(false);
  const [contentViewMode, setContentViewMode] = useState<"preview" | "raw">("preview");

  // View signature preview / full audit detail modal
  const [previewSignatureModal, setPreviewSignatureModal] = useState<SignedRecord | null>(null);
  const [isLoadingSignedDetail, setIsLoadingSignedDetail] = useState(false);

  // Signed Records tabs, search, filters & pagination
  const [signedTab, setSignedTab] = useState<"COMPLETED" | "PENDING_PAYMENT" | "ALL">("COMPLETED");
  const [signedSearchInput, setSignedSearchInput] = useState("");
  const [signedSearch, setSignedSearch] = useState("");
  const [signedEnrolStatus, setSignedEnrolStatus] = useState<string>("ALL");
  const [signedPaymentStatus, setSignedPaymentStatus] = useState<string>("ALL");
  const [signedStartDate, setSignedStartDate] = useState<string>("");
  const [signedEndDate, setSignedEndDate] = useState<string>("");
  const [signedPage, setSignedPage] = useState<number>(1);
  const [signedLimit] = useState<number>(15);
  const [signedTotal, setSignedTotal] = useState<number>(0);
  const [signedTotalPages, setSignedTotalPages] = useState<number>(1);
  const [signedCounts, setSignedCounts] = useState<{ completed: number; pendingPayment: number; all: number }>({
    completed: 0,
    pendingPayment: 0,
    all: 0,
  });
  const [isSignedLoading, setIsSignedLoading] = useState<boolean>(false);

  const [statusMsg, setStatusMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [downloadingSignedId, setDownloadingSignedId] = useState<string | null>(null);

  useEffect(() => {
    fetchTemplateData();
  }, [templateId]);

  useEffect(() => {
    const handler = setTimeout(() => {
      setSignedSearch(signedSearchInput);
      setSignedPage(1);
    }, 350);
    return () => clearTimeout(handler);
  }, [signedSearchInput]);

  useEffect(() => {
    fetchSignedRecords(
      signedTab,
      signedSearch,
      signedEnrolStatus,
      signedPaymentStatus,
      signedPage,
      signedStartDate,
      signedEndDate,
    );
  }, [templateId, signedTab, signedSearch, signedEnrolStatus, signedPaymentStatus, signedPage, signedStartDate, signedEndDate]);

  const fetchSignedRecords = async (
    targetTab = signedTab,
    searchTerm = signedSearch,
    enrolFilter = signedEnrolStatus,
    payFilter = signedPaymentStatus,
    targetPage = signedPage,
    startDate = signedStartDate,
    endDate = signedEndDate,
  ) => {
    setIsSignedLoading(true);
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const params = new URLSearchParams({
        tab: targetTab,
        page: String(targetPage),
        limit: String(signedLimit),
      });
      if (searchTerm.trim()) params.set("search", searchTerm.trim());
      if (enrolFilter && enrolFilter !== "ALL") params.set("enrolmentStatus", enrolFilter);
      if (payFilter && payFilter !== "ALL") params.set("paymentStatus", payFilter);
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);

      const res = await fetch(
        `${API_URL}/admin/agreement-templates/${templateId}/signed?${params.toString()}`,
        { headers },
      );

      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          // Backward compatibility fallback
          setSignedRecords(data);
          setSignedTotal(data.length);
          setSignedTotalPages(1);
          setSignedCounts({
            completed: data.filter((r) => r.enrolment?.status === "ACTIVE" || r.paymentStatus === "PAID").length,
            pendingPayment: data.filter((r) => r.enrolment?.status === "PENDING_PAYMENT" && r.paymentStatus !== "PAID").length,
            all: data.length,
          });
        } else {
          setSignedRecords(data.data || []);
          setSignedTotal(data.total || 0);
          setSignedTotalPages(data.totalPages || 1);
          if (data.counts) {
            setSignedCounts(data.counts);
          }
        }
      }
    } catch (err: any) {
      console.error("Failed to fetch signed records", err);
    } finally {
      setIsSignedLoading(false);
    }
  };

  const handleOpenSignedDetails = async (rec: SignedRecord) => {
    setPreviewSignatureModal(rec);
    setIsLoadingSignedDetail(true);
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const res = await fetch(`${API_URL}/admin/agreement-templates/signed/${rec.id}`, { headers });
      if (res.ok) {
        const fullDetail = await res.json();
        setPreviewSignatureModal(fullDetail);
      }
    } catch (err) {
      console.error("Failed to load full signed record detail", err);
    } finally {
      setIsLoadingSignedDetail(false);
    }
  };

  const fetchTemplateData = async () => {
    setIsLoading(true);
    setStatusMsg(null);
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const [tplRes, versionsRes] = await Promise.all([
        fetch(`${API_URL}/admin/agreement-templates/${templateId}`, { headers }),
        fetch(`${API_URL}/admin/agreement-templates/${templateId}/versions`, { headers }),
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
    } catch (err: any) {
      setStatusMsg({ type: "error", text: err.message || "Failed to load agreement template details" });
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdateTemplateInfo = async (e: FormEvent) => {
    e.preventDefault();
    if (!editTitle.trim()) {
      setStatusMsg({ type: "error", text: "Template title is required." });
      return;
    }

    setIsSubmitting(true);
    setStatusMsg(null);
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
      const res = await fetch(`${API_URL}/admin/agreement-templates/${templateId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          title: editTitle.trim(),
          description: editDescription.trim() || undefined,
        }),
      });

      if (!res.ok) {
        throw new Error(await errorMessage(res, "Failed to update template information"));
      }

      setIsEditTemplateModalOpen(false);
      setStatusMsg({ type: "success", text: "Template metadata updated successfully." });
      await fetchTemplateData();
    } catch (err: any) {
      console.error(err);
      setStatusMsg({ type: "error", text: err.message || "Failed to update template info" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreateVersion = async (e: FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    const trimmedVersion = newVersionString.trim();
    const trimmedContent = newVersionContent.trim();

    if (!trimmedVersion) {
      setVersionInlineError("Please enter a version number.");
      return;
    }

    if (!/^v?\d+(\.\d+)*$/i.test(trimmedVersion)) {
      setVersionInlineError('Version must be formatted like "v1.0", "v2.0", "1.0", or "v1.1".');
      return;
    }

    // Client-side case-insensitive duplicate check against existing versions
    const isDuplicate = versions.some(
      (v) => v.version.trim().toLowerCase() === trimmedVersion.toLowerCase()
    );
    if (isDuplicate) {
      setVersionInlineError("This version already exists. Please enter a different version number.");
      return;
    }

    if (!trimmedContent || trimmedContent.length < 10) {
      toast.error("Agreement terms must be at least 10 characters long.");
      return;
    }

    setVersionInlineError(null);
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
          version: trimmedVersion,
          content: trimmedContent,
          changelog: newVersionChangelog.trim() || undefined,
          status: publishNewVersion ? "PUBLISHED" : "DRAFT",
        }),
      });

      if (!res.ok) {
        const errorText = await errorMessage(res, "Failed to create agreement version");
        if (
          res.status === 409 ||
          (res.status === 400 && /already exists/i.test(errorText)) ||
          /already exists/i.test(errorText)
        ) {
          setVersionInlineError("This version already exists. Please enter a different version number.");
          return;
        }
        throw new Error(errorText);
      }

      setIsVersionModalOpen(false);
      toast.success(
        publishNewVersion
          ? `Version ${trimmedVersion} published live.`
          : `Version ${trimmedVersion} saved as draft.`
      );
      setStatusMsg({
        type: "success",
        text: publishNewVersion
          ? `Version ${trimmedVersion} published live.`
          : `Version ${trimmedVersion} saved as draft.`,
      });
      await fetchTemplateData();
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Failed to create version");
      setStatusMsg({ type: "error", text: err.message || "Failed to create version" });
    } finally {
      setIsSubmitting(false);
    }
  };


  const handlePublishVersion = (version: TemplateVersion) => {
    setConfirmConfig({
      isOpen: true,
      title: "Publish Agreement Version",
      subtitle: `Version: ${version.version}`,
      description: `Are you sure you want to publish ${version.version}? This will make it active for all enrolled learners and automatically archive previous versions.`,
      confirmText: "Publish Version",
      tone: "info",
      onConfirm: async () => {
        setIsConfirming(true);
        setStatusMsg(null);
        try {
          const res = await cachedFetch(`${API_URL}/admin/agreement-templates/${templateId}/versions/${version.id}/publish`, {
            method: "POST",
          });

          if (!res.ok) {
            throw new Error(await errorMessage(res, `Failed to publish ${version.version}`));
          }

          toast.success(`Version ${version.version} is now PUBLISHED and live.`);
          setStatusMsg({ type: "success", text: `Version ${version.version} is now PUBLISHED and live for learners.` });
          await fetchTemplateData();
        } catch (err: any) {
          toast.error(err.message || "Publish action failed");
          setStatusMsg({ type: "error", text: err.message || "Publish action failed" });
        } finally {
          setIsConfirming(false);
          setConfirmConfig(null);
        }
      },
    });
  };

  const handleDeleteDraft = (version: TemplateVersion) => {
    setConfirmConfig({
      isOpen: true,
      title: "Delete Draft Version",
      subtitle: `Version: ${version.version}`,
      description: `Are you sure you want to delete draft version ${version.version}? This action cannot be undone.`,
      confirmText: "Delete Draft",
      tone: "danger",
      onConfirm: async () => {
        setIsConfirming(true);
        setStatusMsg(null);
        try {
          const res = await cachedFetch(`${API_URL}/admin/agreement-templates/${templateId}/versions/${version.id}`, {
            method: "DELETE",
          });

          if (!res.ok) {
            throw new Error(await errorMessage(res, `Failed to delete ${version.version}`));
          }

          toast.success(`Draft ${version.version} deleted.`);
          setStatusMsg({ type: "success", text: `Draft ${version.version} deleted.` });
          await fetchTemplateData();
        } catch (err: any) {
          toast.error(err.message || "Failed to delete draft");
          setStatusMsg({ type: "error", text: err.message || "Failed to delete draft" });
        } finally {
          setIsConfirming(false);
          setConfirmConfig(null);
        }
      },
    });
  };

  const handleDownloadSignedPdf = async (rec: SignedRecord) => {
    setDownloadingSignedId(rec.id);
    setStatusMsg(null);
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
      const rawFetch =
        typeof window !== "undefined" && (window as any).__rawOriginalFetch
          ? (window as any).__rawOriginalFetch
          : fetch;
      // Fetch the binary PDF bytes directly from the API endpoint
      const res = await rawFetch(
        `${API_URL}/admin/agreement-templates/${templateId}/signed/${rec.id}/pdf`,
        {
          headers: {
            Accept: "application/pdf",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        },
      );

      if (!res.ok) {
        throw new Error(await errorMessage(res, "Failed to generate signed agreement PDF"));
      }

      const arrayBuffer = await res.arrayBuffer();
      const blob = new Blob([arrayBuffer], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `agreement-${rec.id}.pdf`;
      document.body.appendChild(link);
      link.click();
      setTimeout(() => {
        link.remove();
        URL.revokeObjectURL(url);
      }, 10000);
    } catch (err: any) {
      console.error(err);
      setStatusMsg({
        type: "error",
        text: err.message || "Failed to download signed agreement PDF",
      });
    } finally {
      setDownloadingSignedId(null);
    }
  };

  if (isLoading) {
    return (
      <div className={styles.dashboard}>
        <div style={{ textAlign: "center", padding: "4rem", color: "var(--text-secondary)" }}>
          Loading agreement details...
        </div>
      </div>
    );
  }

  if (!template) {
    return (
      <div className={styles.dashboard}>
        <div className={styles.alertError}>
          <span>Agreement template not found or removed.</span>
        </div>
        <Link href="/agreements" className={styles.secondaryBtn} style={{ display: "inline-block", marginTop: "1rem" }}>
          &larr; Back to Agreements
        </Link>
      </div>
    );
  }

  const publishedVersion = versions.find((v) => v.status === "PUBLISHED");
  const hasDraft = versions.some((v) => v.status === "DRAFT");
  const templateOverallStatus: "PUBLISHED" | "DRAFT" | "ARCHIVED" = publishedVersion
    ? "PUBLISHED"
    : hasDraft
    ? "DRAFT"
    : "ARCHIVED";

  const isSharedDefault =
    /standard|default|general|platform/i.test(template.title) ||
    /default|shared/i.test(template.description || "");

  return (
    <div className={styles.dashboard}>
      {/* HEADER & ACTIONS */}
      <header className={styles.header}>
        <div className={styles.headerText}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.45rem", marginBottom: "0.65rem" }}>
            <Link
              href="/agreements"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.35rem",
                fontSize: "0.8rem",
                color: "var(--accent-primary, #b86b11)",
                textDecoration: "none",
                fontWeight: 600,
                transition: "opacity 0.15s ease",
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="15 18 9 12 15 6" />
              </svg>
              <span>Agreements</span>
            </Link>
            <span style={{ color: "var(--border-dark, #c4b5a0)", fontSize: "0.8rem" }}>/</span>
            <span style={{ color: "var(--text-secondary, #78716c)", fontSize: "0.8rem", fontWeight: 500 }}>Contract Governance</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
            <h1 className={styles.title} style={{ margin: 0 }}>{template.title}</h1>
            <StatusBadge status={templateOverallStatus} />
            <span
              style={{
                fontSize: "0.74rem",
                fontWeight: 600,
                color: isSharedDefault ? "#92400e" : "var(--accent-primary, #b86b11)",
                background: isSharedDefault ? "#fef3c7" : "var(--bg-soft, #f7f3ec)",
                border: isSharedDefault ? "1px solid #fde68a" : "1px solid #ebdccb",
                padding: "3px 9px",
                borderRadius: "999px",
                letterSpacing: "0.02em",
              }}
            >
              {isSharedDefault ? "Shared Default" : `Program: ${template.program?.title || "Curriculum"}`}
            </span>
          </div>
          {template.description && (
            <p className={styles.subtitle} style={{ margin: "0.35rem 0 0 0", fontSize: "0.86rem", color: "var(--text-secondary)" }}>
              {template.description}
            </p>
          )}
        </div>
        <div className={styles.headerActions} style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <button
            type="button"
            className={styles.secondaryBtn}
            onClick={() => {
              setEditTitle(template.title);
              setEditDescription(template.description || "");
              setIsEditTemplateModalOpen(true);
            }}
            title="Edits the administrative title and description only"
            style={{ display: "inline-flex", alignItems: "center", gap: "0.45rem" }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
            <span>Edit Details</span>
          </button>
          <button
            className={styles.primaryBtn}
            onClick={() => {
              const lastV = versions[0]?.version || "v1.0";
              const nextNum = (parseFloat(lastV.replace(/[^0-9.]/g, "")) || 1) + 1;
              const suggested = `v${nextNum}.0`;
              setNewVersionString(suggested);
              setNewVersionContent(versions[0]?.content || "");
              setNewVersionChangelog("");
              setPublishNewVersion(false);
              setVersionEditorTab("edit");
              if (versions.some((v) => v.version.trim().toLowerCase() === suggested.toLowerCase())) {
                setVersionInlineError("This version already exists. Please enter a different version number.");
              } else {
                setVersionInlineError(null);
              }
              setIsVersionModalOpen(true);
            }}
            title="The only path to legally binding changes — drafts and publishes new terms"
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
          <span className={styles.pointsBadge}>{signedCounts.all || signedRecords.length}</span>
        </button>
      </div>

      {/* TAB 1: VERSION HISTORY */}
      {activeTab === "versions" && (
        <section className={styles.tableSection}>
          <div className={styles.sectionHeader}>
            <div>
              <h2>Version History</h2>
              <p style={{ margin: "0.25rem 0 0 0", fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                Published and archived versions are legally locked and cannot be edited in place. To update terms, draft and publish a new version.
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
                  <th>Publication Date</th>
                  <th>Signed Count</th>
                  <th>Created By</th>
                  <th className={styles.alignRight} style={{ width: "200px" }}>Actions</th>
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
                    const isDraft = ver.status === "DRAFT";
                    const signedCount = ver._count?.signedAgreements ?? 0;

                    return (
                      <tr key={ver.id}>
                        <td>
                          <strong>{ver.version}</strong>
                        </td>
                        <td>
                          <StatusBadge status={ver.status} />
                        </td>
                        <td style={{ fontSize: "0.85rem", maxWidth: "250px" }}>
                          {ver.changelog || "—"}
                        </td>
                        <td style={{ fontSize: "0.85rem" }}>
                          {ver.publishedAt ? new Date(ver.publishedAt).toLocaleDateString() : "Unpublished"}
                        </td>
                        <td>
                          <span style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                            {signedCount} signed
                          </span>
                        </td>
                        <td style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                          {ver.createdBy?.name || ver.createdBy?.email || "System"}
                        </td>
                        <td className={styles.alignRight}>
                          <div style={{ display: "inline-flex", gap: "0.5rem", alignItems: "center" }}>
                            <button
                              type="button"
                              className={styles.secondaryBtnSmall}
                              style={{ whiteSpace: "nowrap" }}
                              onClick={() => setViewingVersion(ver)}
                            >
                              View Content
                            </button>
                            {isDraft && (
                              <button
                                type="button"
                                className={styles.primaryBtnSmall}
                                style={{ whiteSpace: "nowrap" }}
                                onClick={() => handlePublishVersion(ver)}
                              >
                                Publish Live
                              </button>
                            )}
                            {isDraft && signedCount === 0 && (
                              <button
                                type="button"
                                className={styles.dangerBtnSmall}
                                style={{ whiteSpace: "nowrap" }}
                                onClick={() => handleDeleteDraft(ver)}
                              >
                                Delete
                              </button>
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
          <div className={styles.sectionHeader} style={{ flexWrap: "wrap", gap: "1rem" }}>
            <div>
              <h2 style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                <span>Signed Records &amp; Audit Log</span>
                <span
                  style={{
                    fontSize: "0.75rem",
                    fontWeight: 600,
                    padding: "2px 8px",
                    borderRadius: "999px",
                    background: "var(--bg-soft, #f7f3ec)",
                    color: "var(--text-secondary, #57534e)",
                    border: "1px solid var(--border-light, #e7decb)",
                  }}
                >
                  {signedTotal} total records
                </span>
              </h2>
              <p style={{ margin: "0.25rem 0 0 0", fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                Auditable log of learners who consented and signed this agreement, captured with immutable timestamp, IP address, and digital signature.
                {isSharedDefault && (
                  <span style={{ display: "inline-block", marginLeft: "0.4rem", color: "#92400e", fontWeight: 500 }}>
                    (Platform fallback contract preserving individual program attribution)
                  </span>
                )}
              </p>
            </div>

            {/* SUB-TABS: Completed (Paid), Pending Payment, All Records */}
            <div
              style={{
                display: "inline-flex",
                background: "var(--bg-soft, #f7f3ec)",
                padding: "3px",
                borderRadius: "8px",
                border: "1px solid var(--border-light, #e7decb)",
                gap: "2px",
              }}
            >
              <button
                type="button"
                onClick={() => {
                  setSignedTab("COMPLETED");
                  setSignedPage(1);
                }}
                style={{
                  padding: "6px 14px",
                  fontSize: "0.78rem",
                  fontWeight: signedTab === "COMPLETED" ? 700 : 500,
                  borderRadius: "6px",
                  border: "none",
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.45rem",
                  background: signedTab === "COMPLETED" ? "#ffffff" : "transparent",
                  color: signedTab === "COMPLETED" ? "var(--text-primary)" : "var(--text-secondary)",
                  boxShadow: signedTab === "COMPLETED" ? "0 1px 3px rgba(0,0,0,0.06)" : "none",
                  transition: "all 0.15s ease",
                }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: signedTab === "COMPLETED" ? "#15803d" : "inherit" }}>
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                  <polyline points="22 4 12 14.01 9 11.01" />
                </svg>
                <span>Completed (Paid)</span>
                <span
                  style={{
                    fontSize: "0.7rem",
                    padding: "1px 6px",
                    borderRadius: "999px",
                    background: signedTab === "COMPLETED" ? "#dcfce7" : "rgba(0,0,0,0.05)",
                    color: signedTab === "COMPLETED" ? "#15803d" : "inherit",
                    fontWeight: 700,
                  }}
                >
                  {signedCounts.completed}
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setSignedTab("PENDING_PAYMENT");
                  setSignedPage(1);
                }}
                style={{
                  padding: "6px 14px",
                  fontSize: "0.78rem",
                  fontWeight: signedTab === "PENDING_PAYMENT" ? 700 : 500,
                  borderRadius: "6px",
                  border: "none",
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.45rem",
                  background: signedTab === "PENDING_PAYMENT" ? "#ffffff" : "transparent",
                  color: signedTab === "PENDING_PAYMENT" ? "var(--text-primary)" : "var(--text-secondary)",
                  boxShadow: signedTab === "PENDING_PAYMENT" ? "0 1px 3px rgba(0,0,0,0.06)" : "none",
                  transition: "all 0.15s ease",
                }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: signedTab === "PENDING_PAYMENT" ? "#b45309" : "inherit" }}>
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
                <span>Pending Payment</span>
                <span
                  style={{
                    fontSize: "0.7rem",
                    padding: "1px 6px",
                    borderRadius: "999px",
                    background: signedTab === "PENDING_PAYMENT" ? "#fef3c7" : "rgba(0,0,0,0.05)",
                    color: signedTab === "PENDING_PAYMENT" ? "#b45309" : "inherit",
                    fontWeight: 700,
                  }}
                >
                  {signedCounts.pendingPayment}
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setSignedTab("ALL");
                  setSignedPage(1);
                }}
                style={{
                  padding: "6px 14px",
                  fontSize: "0.78rem",
                  fontWeight: signedTab === "ALL" ? 700 : 500,
                  borderRadius: "6px",
                  border: "none",
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.45rem",
                  background: signedTab === "ALL" ? "#ffffff" : "transparent",
                  color: signedTab === "ALL" ? "var(--text-primary)" : "var(--text-secondary)",
                  boxShadow: signedTab === "ALL" ? "0 1px 3px rgba(0,0,0,0.06)" : "none",
                  transition: "all 0.15s ease",
                }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="8" y1="6" x2="21" y2="6" />
                  <line x1="8" y1="12" x2="21" y2="12" />
                  <line x1="8" y1="18" x2="21" y2="18" />
                  <line x1="3" y1="6" x2="3.01" y2="6" />
                  <line x1="3" y1="12" x2="3.01" y2="12" />
                  <line x1="3" y1="18" x2="3.01" y2="18" />
                </svg>
                <span>All Records</span>
                <span
                  style={{
                    fontSize: "0.7rem",
                    padding: "1px 6px",
                    borderRadius: "999px",
                    background: signedTab === "ALL" ? "var(--bg-card, #e2d9cc)" : "rgba(0,0,0,0.05)",
                    color: "inherit",
                    fontWeight: 700,
                  }}
                >
                  {signedCounts.all}
                </span>
              </button>
            </div>
          </div>


          {/* SEARCH & FILTERS BAR */}
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "0.75rem",
              alignItems: "center",
              marginBottom: "1.25rem",
              padding: "0.85rem 1rem",
              background: "#ffffff",
              border: "1px solid var(--border-light, #e7decb)",
              borderRadius: "10px",
            }}
          >
            {/* Search Input with embedded magnifying glass */}
            <div style={{ position: "relative", flex: "1 1 240px", minWidth: "220px" }}>
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="var(--text-muted, #a8a29e)"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{
                  position: "absolute",
                  left: "11px",
                  top: "50%",
                  transform: "translateY(-50%)",
                  pointerEvents: "none",
                }}
              >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="text"
                placeholder="Search learner name, email, program or signer..."
                value={signedSearchInput}
                onChange={(e) => setSignedSearchInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    setSignedSearch(signedSearchInput);
                    setSignedPage(1);
                  }
                }}
                style={{
                  width: "100%",
                  height: "32px",
                  padding: "0 2rem 0 2.2rem",
                  fontSize: "0.82rem",
                  borderRadius: "8px",
                  border: "1px solid var(--border-light, #e7decb)",
                  background: "var(--bg-soft, #f7f3ec)",
                  color: "var(--text-primary)",
                  outline: "none",
                  boxSizing: "border-box",
                  transition: "border-color 0.15s ease, background-color 0.15s ease",
                }}
              />
              {signedSearchInput && (
                <button
                  type="button"
                  onClick={() => {
                    setSignedSearchInput("");
                    setSignedSearch("");
                    setSignedPage(1);
                  }}
                  style={{
                    position: "absolute",
                    right: "8px",
                    top: "50%",
                    transform: "translateY(-50%)",
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                    color: "var(--text-muted)",
                    fontSize: "0.95rem",
                    padding: "2px 4px",
                    lineHeight: 1,
                  }}
                  title="Clear search"
                >
                  &times;
                </button>
              )}
            </div>

            {/* Enrolment Status Filter (Shared CustomSelect) */}
            <CustomSelect
              value={signedEnrolStatus}
              onChange={(val) => {
                setSignedEnrolStatus(val);
                setSignedPage(1);
              }}
              options={ENROLMENT_STATUS_OPTIONS}
              minWidth="160px"
              size="sm"
              placeholder="Enrolment: All"
              ariaLabel="Filter by Enrolment Status"
            />

            {/* Payment Status Filter (Shared CustomSelect) */}
            <CustomSelect
              value={signedPaymentStatus}
              onChange={(val) => {
                setSignedPaymentStatus(val);
                setSignedPage(1);
              }}
              options={PAYMENT_STATUS_OPTIONS}
              minWidth="150px"
              size="sm"
              placeholder="Payment: All"
              ariaLabel="Filter by Payment Status"
            />

            {/* Reset Filters */}
            {(signedSearch || signedEnrolStatus !== "ALL" || signedPaymentStatus !== "ALL") && (
              <button
                type="button"
                className={styles.secondaryBtnSmall}
                onClick={() => {
                  setSignedSearchInput("");
                  setSignedSearch("");
                  setSignedEnrolStatus("ALL");
                  setSignedPaymentStatus("ALL");
                  setSignedStartDate("");
                  setSignedEndDate("");
                  setSignedPage(1);
                }}
                style={{
                  padding: "0.52rem 0.75rem",
                  color: "var(--text-muted)",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.35rem",
                }}
                title="Reset all filters"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="1 4 1 10 7 10" />
                  <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
                </svg>
                <span>Reset</span>
              </button>
            )}
          </div>

          <div className={styles.tableWrapper}>
            <table className={styles.adminTable}>
              <thead>
                <tr>
                  <th>Learner</th>
                  <th>Enrolled Program / Course</th>
                  <th>Signed By / Method</th>
                  <th>Agreement Version</th>
                  <th>Signed On</th>
                  <th>Payment</th>
                  <th>Enrolment</th>
                  <th className={styles.alignRight} style={{ width: "230px" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {isSignedLoading ? (
                  <tr>
                    <td colSpan={8} style={{ textAlign: "center", padding: "3.5rem 1.5rem", color: "var(--text-secondary)" }}>
                      <div style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem" }}>
                        <span style={{ display: "inline-block", width: "14px", height: "14px", border: "2px solid #b86b11", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                        <span>Loading audit records...</span>
                      </div>
                    </td>
                  </tr>
                ) : signedRecords.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ textAlign: "center", padding: "4rem 1.5rem", background: "#ffffff" }}>
                      <div style={{ maxWidth: "460px", margin: "0 auto", display: "flex", flexDirection: "column", alignItems: "center" }}>
                        {signedTab === "COMPLETED" ? (
                          <>
                            <div
                              style={{
                                width: "64px",
                                height: "64px",
                                borderRadius: "16px",
                                background: "#ecfdf5",
                                border: "1px solid #bbf7d0",
                                color: "#16a34a",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                marginBottom: "1rem",
                                boxShadow: "0 2px 8px rgba(22, 163, 74, 0.08)",
                              }}
                            >
                              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <rect x="3" y="4" width="18" height="16" rx="2" />
                                <line x1="7" y1="8" x2="17" y2="8" />
                                <line x1="7" y1="12" x2="13" y2="12" />
                                <polyline points="15 16 17 18 21 14" />
                              </svg>
                            </div>
                            <h3 style={{ fontSize: "1.05rem", fontWeight: 700, color: "var(--text-primary)", margin: "0 0 0.4rem 0" }}>
                              No Completed Enrollments Yet
                            </h3>
                            <p style={{ fontSize: "0.84rem", color: "var(--text-secondary)", margin: "0 0 1.25rem 0", lineHeight: 1.6 }}>
                              When learners consent to this agreement and complete checkout confirmation, their verified enrollments and legal certificates appear here.
                            </p>
                            {signedCounts.pendingPayment > 0 && (
                              <button
                                type="button"
                                onClick={() => {
                                  setSignedTab("PENDING_PAYMENT");
                                  setSignedPage(1);
                                }}
                                className={styles.primaryBtn}
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: "0.45rem",
                                  fontSize: "0.82rem",
                                  padding: "0.55rem 1.1rem",
                                }}
                              >
                                <span>Review Pending Signatures ({signedCounts.pendingPayment})</span>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                  <line x1="5" y1="12" x2="19" y2="12" />
                                  <polyline points="12 5 19 12 12 19" />
                                </svg>
                              </button>
                            )}
                          </>
                        ) : signedTab === "PENDING_PAYMENT" ? (
                          <>
                            <div
                              style={{
                                width: "64px",
                                height: "64px",
                                borderRadius: "16px",
                                background: "#fef3c7",
                                border: "1px solid #fde68a",
                                color: "#d97706",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                marginBottom: "1rem",
                                boxShadow: "0 2px 8px rgba(217, 119, 6, 0.08)",
                              }}
                            >
                              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="12" cy="12" r="10" />
                                <polyline points="12 6 12 12 16 14" />
                              </svg>
                            </div>
                            <h3 style={{ fontSize: "1.05rem", fontWeight: 700, color: "var(--text-primary)", margin: "0 0 0.4rem 0" }}>
                              No Signed Agreements Awaiting Payment
                            </h3>
                            <p style={{ fontSize: "0.84rem", color: "var(--text-secondary)", margin: "0 0 1.25rem 0", lineHeight: 1.6 }}>
                              All learners who consented and signed this agreement have either completed checkout, or no signings are currently pending payment.
                            </p>
                            {signedCounts.completed > 0 && (
                              <button
                                type="button"
                                onClick={() => {
                                  setSignedTab("COMPLETED");
                                  setSignedPage(1);
                                }}
                                className={styles.secondaryBtn}
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: "0.45rem",
                                  fontSize: "0.82rem",
                                  padding: "0.55rem 1.1rem",
                                }}
                              >
                                <span>View Completed Records ({signedCounts.completed})</span>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                  <line x1="5" y1="12" x2="19" y2="12" />
                                  <polyline points="12 5 19 12 12 19" />
                                </svg>
                              </button>
                            )}
                          </>
                        ) : (
                          <>
                            <div
                              style={{
                                width: "64px",
                                height: "64px",
                                borderRadius: "16px",
                                background: "var(--bg-soft, #f7f3ec)",
                                border: "1px solid var(--border-light, #e7decb)",
                                color: "var(--text-secondary, #78716c)",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                marginBottom: "1rem",
                              }}
                            >
                              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                <polyline points="14 2 14 8 20 8" />
                                <line x1="16" y1="13" x2="8" y2="13" />
                                <line x1="16" y1="17" x2="8" y2="17" />
                                <polyline points="10 9 9 9 8 9" />
                              </svg>
                            </div>
                            <h3 style={{ fontSize: "1.05rem", fontWeight: 700, color: "var(--text-primary)", margin: "0 0 0.4rem 0" }}>
                              No Signed Agreement Records Found
                            </h3>
                            <p style={{ fontSize: "0.84rem", color: "var(--text-secondary)", margin: "0 0 1.25rem 0", lineHeight: 1.6 }}>
                              {signedSearch || signedEnrolStatus !== "ALL" || signedPaymentStatus !== "ALL"
                                ? "No records matched your search query or filter parameters. Try clearing your filters or searching with different terms."
                                : "No learner signatures have been recorded for this agreement yet."}
                            </p>
                            {(signedSearch || signedEnrolStatus !== "ALL" || signedPaymentStatus !== "ALL") && (
                              <button
                                type="button"
                                onClick={() => {
                                  setSignedSearchInput("");
                                  setSignedSearch("");
                                  setSignedEnrolStatus("ALL");
                                  setSignedPaymentStatus("ALL");
                                  setSignedPage(1);
                                }}
                                className={styles.secondaryBtn}
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: "0.45rem",
                                  fontSize: "0.82rem",
                                  padding: "0.55rem 1.1rem",
                                }}
                              >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                  <polyline points="1 4 1 10 7 10" />
                                  <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
                                </svg>
                                <span>Reset All Filters</span>
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ) : (
                  signedRecords.map((rec) => {
                    const learnerName =
                      [rec.user?.firstName, rec.user?.lastName].filter(Boolean).join(" ") ||
                      rec.user?.name ||
                      rec.user?.email;

                    const initials =
                      [rec.user?.firstName?.[0], rec.user?.lastName?.[0]].filter(Boolean).join("") ||
                      rec.user?.name?.slice(0, 2).toUpperCase() ||
                      rec.user?.email?.slice(0, 2).toUpperCase() ||
                      "U";

                    const effectiveProgram = rec.programTitle || rec.program?.title || template.program?.title || "Curriculum";
                    const isSharedScope = rec.scope === "SHARED_DEFAULT" || isSharedDefault;

                    const paymentStatus = rec.paymentStatus || (rec.enrolment?.status === "ACTIVE" ? "PAID" : "PENDING");
                    const enrolmentStatus = rec.enrolmentStatus || rec.enrolment?.status || rec.status;

                    return (
                      <tr key={rec.id}>
                        {/* Learner */}
                        <td>
                          <div style={{ display: "flex", alignItems: "center", gap: "0.65rem" }}>
                            <div
                              style={{
                                width: "32px",
                                height: "32px",
                                borderRadius: "50%",
                                background: "#f0e8dc",
                                border: "1px solid #ebdccb",
                                color: "#8c6f4a",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontSize: "0.74rem",
                                fontWeight: 700,
                                flexShrink: 0,
                              }}
                            >
                              {initials}
                            </div>
                            <div>
                              <strong style={{ color: "var(--text-primary)", fontSize: "0.85rem", display: "block" }}>
                                {learnerName}
                              </strong>
                              <div style={{ fontSize: "0.76rem", color: "var(--text-secondary)", marginTop: "1px" }}>
                                {rec.user?.email}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Enrolled Program & Scope Attribution */}
                        <td>
                          <div style={{ fontWeight: 600, color: "var(--text-primary)", fontSize: "0.84rem" }}>
                            {effectiveProgram}
                          </div>
                          <div style={{ marginTop: "3px" }}>
                            <span
                              style={{
                                fontSize: "0.68rem",
                                fontWeight: 600,
                                padding: "2px 6px",
                                borderRadius: "4px",
                                background: isSharedScope ? "#fef3c7" : "var(--bg-soft, #f7f3ec)",
                                color: isSharedScope ? "#92400e" : "var(--accent-primary, #b86b11)",
                                border: isSharedScope ? "1px solid #fde68a" : "1px solid #ebdccb",
                              }}
                            >
                              {isSharedScope ? "Shared Default Fallback" : "Program Agreement"}
                            </span>
                          </div>
                        </td>

                        {/* Signed By / Method */}
                        <td>
                          <div style={{ fontWeight: 600, color: "var(--text-primary)", fontSize: "0.84rem" }}>
                            {rec.typedName || "—"}
                          </div>
                          <div style={{ fontSize: "0.74rem", color: "var(--text-secondary)", marginTop: "2px", display: "inline-flex", alignItems: "center", gap: "0.3rem" }}>
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M12 19l7-7 3 3-7 7-3-3z" />
                              <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
                            </svg>
                            <span>{rec.signatureType === "UPLOADED" ? "Uploaded Image" : "Drawn Signature"}</span>
                          </div>
                        </td>

                        {/* Agreement Version */}
                        <td>
                          <span style={{ fontSize: "0.84rem", color: "var(--text-primary)", fontWeight: 600 }}>
                            {rec.templateVersion || rec.version?.version || "v1.0"}
                          </span>
                          <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginTop: "2px" }}>
                            Consent: {rec.consentVersion || rec.templateVersion || "v1.0"}
                          </div>
                        </td>

                        {/* Signed On & IP */}
                        <td>
                          <div style={{ fontSize: "0.82rem", color: "var(--text-primary)" }}>
                            {new Date(rec.signedAt).toLocaleString()}
                          </div>
                          <div style={{ fontSize: "0.72rem", fontFamily: "monospace", color: "var(--text-secondary)", marginTop: "2px" }}>
                            IP: {rec.signerIp || "—"}
                          </div>
                        </td>

                        {/* Payment Status */}
                        <td>
                          <span
                            style={{
                              display: "inline-block",
                              fontSize: "0.72rem",
                              fontWeight: 700,
                              padding: "2px 8px",
                              borderRadius: "999px",
                              letterSpacing: "0.02em",
                              background:
                                paymentStatus === "PAID"
                                  ? "#dcfce7"
                                  : paymentStatus === "REFUNDED"
                                  ? "#f3e8ff"
                                  : paymentStatus === "FAILED"
                                  ? "#ffe4e6"
                                  : "#fef3c7",
                              color:
                                paymentStatus === "PAID"
                                  ? "#15803d"
                                  : paymentStatus === "REFUNDED"
                                  ? "#7e22ce"
                                  : paymentStatus === "FAILED"
                                  ? "#be123c"
                                  : "#b45309",
                              border:
                                paymentStatus === "PAID"
                                  ? "1px solid #bbf7d0"
                                  : paymentStatus === "REFUNDED"
                                  ? "1px solid #e9d5ff"
                                  : paymentStatus === "FAILED"
                                  ? "1px solid #fecdd3"
                                  : "1px solid #fde68a",
                            }}
                          >
                            {paymentStatus}
                          </span>
                        </td>

                        {/* Enrolment Status */}
                        <td>
                          <StatusBadge status={enrolmentStatus} />
                        </td>
                        {/* Actions */}
                        <td className={styles.alignRight}>
                          <div style={{ display: "inline-flex", gap: "0.4rem", alignItems: "center" }}>
                            <button
                              type="button"
                              onClick={() => handleOpenSignedDetails(rec)}
                              className={styles.secondaryBtnSmall}
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "0.35rem",
                                fontSize: "0.78rem",
                                padding: "0.35rem 0.75rem",
                                cursor: "pointer",
                              }}
                              title="Verify signature and inspect full audit record"
                            >
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <circle cx="12" cy="12" r="10" />
                                <line x1="12" y1="16" x2="12" y2="12" />
                                <line x1="12" y1="8" x2="12.01" y2="8" />
                              </svg>
                              <span>View Details</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDownloadSignedPdf(rec)}
                              disabled={downloadingSignedId === rec.id}
                              className={styles.secondaryBtnSmall}
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "0.35rem",
                                fontSize: "0.78rem",
                                padding: "0.35rem 0.75rem",
                                cursor: downloadingSignedId === rec.id ? "wait" : "pointer",
                                opacity: downloadingSignedId === rec.id ? 0.65 : 1,
                              }}
                              title="Download this signed agreement as an authorized PDF record"
                            >
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                <polyline points="7 10 12 15 17 10" />
                                <line x1="12" y1="15" x2="12" y2="3" />
                              </svg>
                              <span>{downloadingSignedId === rec.id ? "Preparing…" : "Download PDF"}</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* PAGINATION CONTROLS */}
          {signedTotal > 0 && (
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "0.85rem 0.5rem 0.25rem",
                fontSize: "0.8rem",
                color: "var(--text-secondary)",
                flexWrap: "wrap",
                gap: "0.5rem",
              }}
            >
              <div>
                Showing <strong>{(signedPage - 1) * signedLimit + 1}</strong> to{" "}
                <strong>{Math.min(signedPage * signedLimit, signedTotal)}</strong> of{" "}
                <strong>{signedTotal}</strong> records
              </div>

              <div style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem" }}>
                <button
                  type="button"
                  className={styles.secondaryBtnSmall}
                  disabled={signedPage <= 1 || isSignedLoading}
                  onClick={() => setSignedPage((p) => Math.max(1, p - 1))}
                  style={{
                    padding: "0.35rem 0.75rem",
                    opacity: signedPage <= 1 ? 0.5 : 1,
                    cursor: signedPage <= 1 ? "not-allowed" : "pointer",
                  }}
                >
                  &larr; Previous
                </button>

                <span style={{ fontWeight: 600, padding: "0 0.4rem" }}>
                  Page {signedPage} of {signedTotalPages}
                </span>

                <button
                  type="button"
                  className={styles.secondaryBtnSmall}
                  disabled={signedPage >= signedTotalPages || isSignedLoading}
                  onClick={() => setSignedPage((p) => Math.min(signedTotalPages, p + 1))}
                  style={{
                    padding: "0.35rem 0.75rem",
                    opacity: signedPage >= signedTotalPages ? 0.5 : 1,
                    cursor: signedPage >= signedTotalPages ? "not-allowed" : "pointer",
                  }}
                >
                  Next &rarr;
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      {/* CREATE NEW VERSION MODAL */}
      {isVersionModalOpen && (
        <div className={styles.modalOverlay} onClick={() => !isSubmitting && setIsVersionModalOpen(false)}>
          <div className={styles.modalContent} style={{ maxWidth: "700px" }} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div>
                <h2>Create New Agreement Version</h2>
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
                    Version <span style={{ color: "#ef4444" }}>*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. v2.0"
                    value={newVersionString}
                    onChange={(e) => {
                      const val = e.target.value;
                      setNewVersionString(val);
                      const trimmed = val.trim();
                      if (trimmed && versions.some((v) => v.version.trim().toLowerCase() === trimmed.toLowerCase())) {
                        setVersionInlineError("This version already exists. Please enter a different version number.");
                      } else if (trimmed && !/^v?\d+(\.\d+)*$/i.test(trimmed)) {
                        setVersionInlineError('Version must be formatted like "v1.0", "v2.0", "1.0", or "v1.1".');
                      } else {
                        setVersionInlineError(null);
                      }
                    }}
                    style={{
                      borderColor: versionInlineError ? "#ef4444" : undefined,
                    }}
                    required
                  />
                  {versionInlineError && (
                    <span style={{ color: "#ef4444", fontSize: "0.78rem", marginTop: "4px", display: "block" }}>
                      {versionInlineError}
                    </span>
                  )}
                </div>
                <div className={styles.formGroup} style={{ flex: 2 }}>
                  <label>
                    Change summary <span className={styles.optionalLabel}>(optional)</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Updated refund and confidentiality clauses"
                    value={newVersionChangelog}
                    onChange={(e) => setNewVersionChangelog(e.target.value)}
                  />
                </div>
              </div>

              <div className={styles.formGroup}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                  <label style={{ margin: 0 }}>
                    Agreement Terms <span style={{ color: "#ef4444" }}>*</span>
                  </label>
                  <div style={{ display: "inline-flex", background: "var(--bg-soft, #f7f3ec)", padding: "2px", borderRadius: "6px", border: "1px solid var(--border-light, #e7decb)" }}>
                    <button
                      type="button"
                      onClick={() => setVersionEditorTab("edit")}
                      style={{
                        border: "none",
                        background: versionEditorTab === "edit" ? "#ffffff" : "transparent",
                        color: versionEditorTab === "edit" ? "var(--text-primary)" : "var(--text-secondary)",
                        padding: "4px 10px",
                        borderRadius: "4px",
                        fontSize: "0.76rem",
                        fontWeight: 600,
                        cursor: "pointer",
                        boxShadow: versionEditorTab === "edit" ? "0 1px 2px rgba(0,0,0,0.06)" : "none",
                      }}
                    >
                      Edit Markdown
                    </button>
                    <button
                      type="button"
                      onClick={() => setVersionEditorTab("preview")}
                      style={{
                        border: "none",
                        background: versionEditorTab === "preview" ? "#ffffff" : "transparent",
                        color: versionEditorTab === "preview" ? "var(--text-primary)" : "var(--text-secondary)",
                        padding: "4px 10px",
                        borderRadius: "4px",
                        fontSize: "0.76rem",
                        fontWeight: 600,
                        cursor: "pointer",
                        boxShadow: versionEditorTab === "preview" ? "0 1px 2px rgba(0,0,0,0.06)" : "none",
                      }}
                    >
                      Preview
                    </button>
                  </div>
                </div>

                {versionEditorTab === "edit" ? (
                  <textarea
                    rows={8}
                    value={newVersionContent}
                    onChange={(e) => setNewVersionContent(e.target.value)}
                    placeholder="Enter revised legal terms in Markdown format (# Headings, - Bullets, **Bold**)..."
                    required
                    style={{
                      fontFamily: "monospace",
                      fontSize: "0.85rem",
                      lineHeight: "1.6",
                      padding: "0.75rem 1rem",
                      minHeight: "170px",
                    }}
                  />
                ) : (
                  <div
                    style={{
                      background: "#ffffff",
                      border: "1px solid var(--border-light, #E7E0D6)",
                      borderRadius: "8px",
                      padding: "1rem 1.25rem",
                      minHeight: "170px",
                      maxHeight: "260px",
                      overflowY: "auto",
                      fontSize: "0.88rem",
                      lineHeight: 1.65,
                      color: "var(--text-primary)",
                    }}
                  >
                    {newVersionContent.trim() ? (
                      <AgreementMarkdown content={newVersionContent} />
                    ) : (
                      <p style={{ color: "var(--text-muted)", fontStyle: "italic", margin: 0 }}>
                        No content entered yet. Switch to &ldquo;Edit Markdown&rdquo; to add agreement text.
                      </p>
                    )}
                  </div>
                )}

                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.74rem", color: "var(--text-muted)", marginTop: "4px" }}>
                  <span>{newVersionContent.trim() ? newVersionContent.trim().split(/\s+/).filter(Boolean).length : 0} words</span>
                  <span>{newVersionContent.length} characters</span>
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", margin: "0.35rem 0" }}>
                <input
                  type="checkbox"
                  id="publishNewVersion"
                  checked={publishNewVersion}
                  onChange={(e) => setPublishNewVersion(e.target.checked)}
                  style={{ width: "16px", height: "16px", cursor: "pointer", accentColor: "var(--accent-primary)" }}
                />
                <label htmlFor="publishNewVersion" style={{ fontSize: "0.85rem", fontWeight: 500, cursor: "pointer", color: "var(--text-primary)" }}>
                  Publish immediately and archive the previous version
                </label>
              </div>

              <div className={styles.modalFooter}>
                <button
                  type="button"
                  className={styles.secondaryBtn}
                  onClick={() => setIsVersionModalOpen(false)}
                  disabled={isSubmitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={styles.primaryBtn}
                  disabled={isSubmitting || Boolean(versionInlineError)}
                >
                  {isSubmitting
                    ? "Saving..."
                    : publishNewVersion
                      ? "Publish Version"
                      : "Save Draft"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* VIEW VERSION CONTENT MODAL */}
      {viewingVersion && (
        <div className={styles.modalOverlay} onClick={() => setViewingVersion(null)}>
          <div className={styles.modalContent} style={{ maxWidth: "720px" }} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div>
                <h2>Agreement Version {viewingVersion.version}</h2>
                <p className={styles.modalIntro}>
                  Status: {viewingVersion.status} • {viewingVersion.publishedAt ? `Published ${new Date(viewingVersion.publishedAt).toLocaleDateString()}` : "Unpublished Draft"}
                  {viewingVersion.createdBy?.name ? ` by ${viewingVersion.createdBy.name}` : ""}
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

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "0.75rem 1.75rem 0" }}>
              <div style={{ display: "inline-flex", background: "var(--bg-soft, #f7f3ec)", padding: "2px", borderRadius: "6px", border: "1px solid var(--border-light, #e7decb)" }}>
                <button
                  type="button"
                  onClick={() => setContentViewMode("preview")}
                  style={{
                    border: "none",
                    background: contentViewMode === "preview" ? "#ffffff" : "transparent",
                    color: contentViewMode === "preview" ? "var(--text-primary)" : "var(--text-secondary)",
                    padding: "4px 10px",
                    borderRadius: "4px",
                    fontSize: "0.76rem",
                    fontWeight: 600,
                    cursor: "pointer",
                    boxShadow: contentViewMode === "preview" ? "0 1px 2px rgba(0,0,0,0.06)" : "none",
                  }}
                >
                  Formatted Preview
                </button>
                <button
                  type="button"
                  onClick={() => setContentViewMode("raw")}
                  style={{
                    border: "none",
                    background: contentViewMode === "raw" ? "#ffffff" : "transparent",
                    color: contentViewMode === "raw" ? "var(--text-primary)" : "var(--text-secondary)",
                    padding: "4px 10px",
                    borderRadius: "4px",
                    fontSize: "0.76rem",
                    fontWeight: 600,
                    cursor: "pointer",
                    boxShadow: contentViewMode === "raw" ? "0 1px 2px rgba(0,0,0,0.06)" : "none",
                  }}
                >
                  Raw Markdown
                </button>
              </div>
              <span style={{ fontSize: "0.76rem", color: "var(--text-muted)" }}>
                {viewingVersion.content.trim().split(/\s+/).filter(Boolean).length} words • {viewingVersion.content.length} characters
              </span>
            </div>

            <div style={{
              background: contentViewMode === "raw" ? "#FAFAFA" : "#FFFFFF",
              border: "1px solid var(--border-light, #E7E0D6)",
              borderRadius: "8px",
              padding: "1.25rem 1.5rem",
              margin: "0.6rem 1.75rem 1.25rem",
              maxHeight: "360px",
              overflowY: "auto",
              fontSize: "0.88rem",
              lineHeight: 1.65,
              color: "var(--text-primary)",
            }}>
              {contentViewMode === "raw" ? (
                <pre style={{ margin: 0, fontFamily: "monospace", fontSize: "0.82rem", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                  {viewingVersion.content}
                </pre>
              ) : (
                <AgreementMarkdown content={viewingVersion.content} />
              )}
            </div>

            <div className={styles.modalFooter}>
              <button
                type="button"
                className={styles.secondaryBtn}
                onClick={async () => {
                  if (viewingVersion?.content) {
                    await navigator.clipboard.writeText(viewingVersion.content);
                    setCopiedTerms(true);
                    setTimeout(() => setCopiedTerms(false), 2000);
                  }
                }}
                style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}
              >
                {copiedTerms ? (
                  <>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#15803d" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>
                    <span style={{ color: "#15803d", fontWeight: 600 }}>Copied to Clipboard!</span>
                  </>
                ) : (
                  <>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                    <span>Copy Terms</span>
                  </>
                )}
              </button>
              <button
                type="button"
                className={styles.secondaryBtn}
                onClick={() => {
                  const lastV = viewingVersion.version;
                  const nextNum = (parseFloat(lastV.replace(/[^0-9.]/g, "")) || 1) + 1;
                  const suggested = `v${nextNum}.0`;
                  setNewVersionString(suggested);
                  setNewVersionContent(viewingVersion.content);
                  setNewVersionChangelog(`Branched from ${viewingVersion.version}`);
                  setPublishNewVersion(false);
                  setVersionEditorTab("edit");
                  if (versions.some((v) => v.version.trim().toLowerCase() === suggested.toLowerCase())) {
                    setVersionInlineError("This version already exists. Please enter a different version number.");
                  } else {
                    setVersionInlineError(null);
                  }
                  setViewingVersion(null);
                  setIsVersionModalOpen(true);
                }}
                style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}
                title="Create a new draft version prefilled with these terms"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                <span>Branch as New Version</span>
              </button>
              <button
                type="button"
                className={styles.primaryBtn}
                onClick={() => setViewingVersion(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SIGNATURE & CONSENT VERIFICATION MODAL */}
      {previewSignatureModal && (
        <div
          className={styles.modalOverlay}
          onClick={() => setPreviewSignatureModal(null)}
        >
          <div
            className={styles.modalContent}
            style={{ maxWidth: "680px", maxHeight: "90vh", overflowY: "auto" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.modalHeader}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                  <h2 style={{ margin: 0 }}>Digital Signature &amp; Audit Record</h2>
                  <span
                    style={{
                      background: "#dcfce7",
                      color: "#15803d",
                      border: "1px solid #bbf7d0",
                      fontSize: "0.68rem",
                      fontWeight: 700,
                      padding: "2px 7px",
                      borderRadius: "999px",
                      letterSpacing: "0.04em",
                      textTransform: "uppercase",
                    }}
                  >
                    Verified Record
                  </span>
                  {previewSignatureModal.paymentStatus && (
                    <span
                      style={{
                        fontSize: "0.68rem",
                        fontWeight: 700,
                        padding: "2px 7px",
                        borderRadius: "999px",
                        letterSpacing: "0.04em",
                        background:
                          previewSignatureModal.paymentStatus === "PAID"
                            ? "#dcfce7"
                            : previewSignatureModal.paymentStatus === "REFUNDED"
                            ? "#f3e8ff"
                            : previewSignatureModal.paymentStatus === "FAILED"
                            ? "#ffe4e6"
                            : "#fef3c7",
                        color:
                          previewSignatureModal.paymentStatus === "PAID"
                            ? "#15803d"
                            : previewSignatureModal.paymentStatus === "REFUNDED"
                            ? "#7e22ce"
                            : previewSignatureModal.paymentStatus === "FAILED"
                            ? "#be123c"
                            : "#b45309",
                      }}
                    >
                      Payment: {previewSignatureModal.paymentStatus}
                    </span>
                  )}
                </div>
                <p className={styles.modalIntro} style={{ marginTop: "0.3rem" }}>
                  Immutable legal evidence for <strong>{previewSignatureModal.typedName || previewSignatureModal.user?.name || "Learner"}</strong> ({previewSignatureModal.user?.email})
                </p>
              </div>
              <button
                type="button"
                className={styles.closeBtn}
                onClick={() => setPreviewSignatureModal(null)}
                aria-label="Close modal"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            {/* SIGNATURE DISPLAY CARD */}
            <div
              style={{
                background: "#FDFAF6",
                border: "1px solid var(--border-light, #E7E0D6)",
                borderRadius: "12px",
                margin: "1rem 1.75rem 0.75rem",
                overflow: "hidden",
                boxShadow: "0 1px 3px rgba(20, 17, 15, 0.03)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "0.55rem 1rem",
                  background: "var(--bg-soft, #F7F3EC)",
                  borderBottom: "1px solid var(--border-light, #E7E0D6)",
                  fontSize: "0.74rem",
                  fontWeight: 600,
                  color: "var(--text-secondary)",
                }}
              >
                <span style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M12 19l7-7 3 3-7 7-3-3z" />
                    <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
                    <path d="M2 2l7.586 7.586" />
                    <circle cx="11" cy="11" r="2" />
                  </svg>
                  {previewSignatureModal.signatureType === "UPLOADED" ? "Uploaded Signature Image" : "Drawn Digital Signature"}
                </span>
                <span style={{ color: "#15803d", fontWeight: 700, fontSize: "0.72rem" }}>
                  E-SIGN COMPLIANT
                </span>
              </div>

              {(() => {
                const rawSig = previewSignatureModal.drawnSignature || "";
                const signatureSrc = rawSig.startsWith("data:image")
                  ? rawSig
                  : rawSig.length > 50
                  ? `data:image/png;base64,${rawSig}`
                  : null;

                return (
                  <div
                    style={{
                      padding: "1.25rem",
                      textAlign: "center",
                      minHeight: "130px",
                      maxHeight: "180px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundImage: "radial-gradient(#E2D9CC 1px, transparent 1px)",
                      backgroundSize: "16px 16px",
                    }}
                  >
                    {signatureSrc ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={signatureSrc}
                        alt={`Verified digital signature of ${previewSignatureModal.typedName || "Learner"}`}
                        style={{ maxHeight: "150px", maxWidth: "100%", objectFit: "contain" }}
                      />
                    ) : (
                      <div style={{ color: "var(--text-secondary)", fontSize: "0.85rem" }}>
                        No graphical signature data captured
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>

            {/* AUDIT METADATA GRID */}
            <div
              style={{
                background: "#FFFFFF",
                border: "1px solid var(--border-light, #E7E0D6)",
                borderRadius: "10px",
                padding: "1.1rem 1.25rem",
                margin: "0 1.75rem 0.75rem",
                fontSize: "0.82rem",
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "0.75rem 1.25rem",
              }}
            >
              <div>
                <span style={{ color: "var(--text-muted)", display: "block", fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.04em", fontWeight: 600, marginBottom: "2px" }}>
                  Signer Legal Name
                </span>
                <strong style={{ fontSize: "0.88rem", color: "var(--text-primary)" }}>
                  {previewSignatureModal.typedName || "—"}
                </strong>
              </div>

              <div>
                <span style={{ color: "var(--text-muted)", display: "block", fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.04em", fontWeight: 600, marginBottom: "2px" }}>
                  Account Email
                </span>
                <span style={{ fontSize: "0.85rem", color: "var(--text-primary)", fontWeight: 500 }}>
                  {previewSignatureModal.user?.email}
                </span>
              </div>

              <div>
                <span style={{ color: "var(--text-muted)", display: "block", fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.04em", fontWeight: 600, marginBottom: "2px" }}>
                  Enrolled Program / Course
                </span>
                <strong style={{ color: "var(--text-primary)" }}>
                  {previewSignatureModal.programTitle || previewSignatureModal.program?.title || "Program"}
                </strong>
                <span
                  style={{
                    display: "inline-block",
                    marginLeft: "6px",
                    fontSize: "0.68rem",
                    fontWeight: 600,
                    padding: "1px 5px",
                    borderRadius: "4px",
                    background: previewSignatureModal.scope === "SHARED_DEFAULT" ? "#fef3c7" : "var(--bg-soft, #f7f3ec)",
                    color: previewSignatureModal.scope === "SHARED_DEFAULT" ? "#92400e" : "var(--accent-primary, #b86b11)",
                  }}
                >
                  {previewSignatureModal.scope === "SHARED_DEFAULT" ? "Shared Default" : "Program Agreement"}
                </span>
              </div>

              <div>
                <span style={{ color: "var(--text-muted)", display: "block", fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.04em", fontWeight: 600, marginBottom: "2px" }}>
                  Cohort / Batch
                </span>
                <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>
                  {previewSignatureModal.enrolment?.batch?.name || "Standard Enrollment"}
                </span>
              </div>

              <div>
                <span style={{ color: "var(--text-muted)", display: "block", fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.04em", fontWeight: 600, marginBottom: "2px" }}>
                  Agreement Version
                </span>
                <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>
                  {previewSignatureModal.templateVersion || previewSignatureModal.version?.version || "v1.0"}
                </span>
              </div>

              <div>
                <span style={{ color: "var(--text-muted)", display: "block", fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.04em", fontWeight: 600, marginBottom: "2px" }}>
                  Consent Statement
                </span>
                <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>
                  {previewSignatureModal.consentVersion || previewSignatureModal.templateVersion || "v1.0"}
                </span>
              </div>

              <div>
                <span style={{ color: "var(--text-muted)", display: "block", fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.04em", fontWeight: 600, marginBottom: "2px" }}>
                  Signing Timestamp
                </span>
                <strong style={{ color: "var(--text-primary)" }}>
                  {new Date(previewSignatureModal.signedAt).toLocaleString()}
                </strong>
              </div>

              <div>
                <span style={{ color: "var(--text-muted)", display: "block", fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.04em", fontWeight: 600, marginBottom: "2px" }}>
                  Signer IP Address
                </span>
                <code
                  style={{
                    fontFamily: "monospace",
                    fontSize: "0.78rem",
                    background: "var(--bg-soft, #f7f3ec)",
                    padding: "2px 6px",
                    borderRadius: "4px",
                    border: "1px solid var(--border-light, #e7decb)",
                    color: "var(--text-primary)",
                  }}
                >
                  {previewSignatureModal.signerIp || "—"}
                </code>
              </div>

              <div style={{ gridColumn: "1 / -1", borderTop: "1px dashed var(--border-light, #E7E0D6)", paddingTop: "0.6rem" }}>
                <span style={{ color: "var(--text-muted)", display: "block", fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.04em", fontWeight: 600, marginBottom: "2px" }}>
                  Client Environment (User-Agent)
                </span>
                <span
                  style={{
                    fontFamily: "monospace",
                    fontSize: "0.72rem",
                    color: "var(--text-secondary)",
                    lineHeight: 1.5,
                    overflowWrap: "anywhere",
                    wordBreak: "normal",
                    display: "block",
                  }}
                >
                  {previewSignatureModal.userAgent || "—"}
                </span>
              </div>
            </div>

            {/* PAYMENT & ENROLLMENT AUDIT DETAILS */}
            <div
              style={{
                background: "#FFFFFF",
                border: "1px solid var(--border-light, #E7E0D6)",
                borderRadius: "10px",
                padding: "0.9rem 1.25rem",
                margin: "0 1.75rem 0.75rem",
                fontSize: "0.82rem",
              }}
            >
              <div style={{ fontWeight: 700, fontSize: "0.8rem", color: "var(--text-primary)", marginBottom: "0.5rem", display: "flex", alignItems: "center", gap: "0.4rem" }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
                <span>Payment &amp; Course Access Verification</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem 1.25rem" }}>
                <div>
                  <span style={{ color: "var(--text-muted)", fontSize: "0.7rem", display: "block" }}>Payment State:</span>
                  <strong style={{ color: previewSignatureModal.paymentStatus === "PAID" ? "#15803d" : "#b45309" }}>
                    {previewSignatureModal.paymentStatus || "PENDING"}
                  </strong>
                </div>
                <div>
                  <span style={{ color: "var(--text-muted)", fontSize: "0.7rem", display: "block" }}>Course Access Gate:</span>
                  <strong style={{ color: previewSignatureModal.enrolmentStatus === "ACTIVE" ? "#15803d" : "#dc2626" }}>
                    {previewSignatureModal.enrolmentStatus === "ACTIVE" ? "UNLOCKED (Enrolment Active)" : "LOCKED (Payment/Agreement Required)"}
                  </strong>
                </div>
                {previewSignatureModal.enrolment?.payments?.[0] && (
                  <div style={{ gridColumn: "1 / -1", fontSize: "0.76rem", color: "var(--text-secondary)", marginTop: "2px" }}>
                    Transaction: <code style={{ fontFamily: "monospace" }}>{previewSignatureModal.enrolment.payments[0].stripeSessionId || previewSignatureModal.enrolment.payments[0].id}</code> • Amount: {previewSignatureModal.enrolment.payments[0].amount} {previewSignatureModal.enrolment.payments[0].currency}
                  </div>
                )}
              </div>
            </div>

            {/* AUDIT LOG TIMELINE */}
            {previewSignatureModal.auditLogs && previewSignatureModal.auditLogs.length > 0 && (
              <div
                style={{
                  background: "var(--bg-soft, #f7f3ec)",
                  border: "1px solid var(--border-light, #E7E0D6)",
                  borderRadius: "10px",
                  padding: "0.85rem 1.15rem",
                  margin: "0 1.75rem 1.25rem",
                  fontSize: "0.78rem",
                }}
              >
                <div style={{ fontWeight: 700, fontSize: "0.78rem", color: "var(--text-primary)", marginBottom: "0.5rem", display: "flex", alignItems: "center", gap: "0.4rem" }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                  <span>Audit Trail Timeline</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                  {previewSignatureModal.auditLogs.map((log) => (
                    <div key={log.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.5rem", fontSize: "0.74rem" }}>
                      <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>{log.action}</span>
                      <span style={{ color: "var(--text-muted)", fontFamily: "monospace", fontSize: "0.7rem" }}>
                        {new Date(log.createdAt).toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className={styles.modalFooter}>
              <button
                type="button"
                className={styles.secondaryBtn}
                onClick={() => setPreviewSignatureModal(null)}
              >
                Close
              </button>
              <button
                type="button"
                className={styles.primaryBtn}
                onClick={() => handleDownloadSignedPdf(previewSignatureModal)}
                disabled={downloadingSignedId === previewSignatureModal.id}
                style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                <span>{downloadingSignedId === previewSignatureModal.id ? "Preparing PDF..." : "Download Signed PDF"}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EDIT TEMPLATE METADATA MODAL */}
      {isEditTemplateModalOpen && (
        <div className={styles.modalOverlay} onClick={() => !isSubmitting && setIsEditTemplateModalOpen(false)}>
          <div className={styles.modalContent} style={{ maxWidth: "560px" }} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div>
                <h2>Edit Template Details</h2>
                <p className={styles.modalIntro}>
                  Updates the administrative title and description only. It never changes published legal terms — use Create New Version to change terms.
                </p>
              </div>
              <button
                type="button"
                className={styles.closeBtn}
                onClick={() => setIsEditTemplateModalOpen(false)}
                disabled={isSubmitting}
                aria-label="Close modal"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleUpdateTemplateInfo} className={styles.modalForm}>
              <div className={styles.formGroup}>
                <label>
                  Template Title <span style={{ color: "#ef4444" }}>*</span>
                </label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  placeholder="e.g. Program Agreement for The Mindful Leadership Track"
                  required
                />
              </div>

              <div className={styles.formGroup}>
                <label>Description / Usage Note <span className={styles.optionalLabel}>(Optional)</span></label>
                <textarea
                  rows={3}
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  placeholder="Summary of what this contract governs or cohort specifications"
                />
              </div>

              <div style={{
                background: "var(--bg-soft, #f7f3ec)",
                border: "1px solid var(--border-light, #e7decb)",
                borderRadius: "8px",
                padding: "0.65rem 0.85rem",
                fontSize: "0.8rem",
                color: "var(--text-secondary, #57534e)",
                display: "flex",
                alignItems: "flex-start",
                gap: "0.5rem",
              }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0, marginTop: "2px", color: "var(--accent-primary, #b86b11)" }}>
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="16" x2="12" y2="12" />
                  <line x1="12" y1="8" x2="12.01" y2="8" />
                </svg>
                <div>
                  <strong>Audit Guardrail:</strong> Modifying template details updates administrative metadata only. Published legal terms and existing signed learner records remain immutable.
                </div>
              </div>

              <div className={styles.modalFooter}>
                <button
                  type="button"
                  className={styles.secondaryBtn}
                  onClick={() => setIsEditTemplateModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={styles.primaryBtn}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* In-website branded ConfirmDialog */}
      <ConfirmDialog
        isOpen={Boolean(confirmConfig?.isOpen)}
        onClose={() => {
          if (!isConfirming) setConfirmConfig(null);
        }}
        onConfirm={confirmConfig?.onConfirm || (() => {})}
        title={confirmConfig?.title || "Confirm Action"}
        subtitle={confirmConfig?.subtitle}
        description={confirmConfig?.description || "Are you sure you want to proceed?"}
        confirmText={isConfirming ? "Processing..." : confirmConfig?.confirmText || "Confirm"}
        cancelText="Cancel"
        tone={confirmConfig?.tone || "danger"}
        isLoading={isConfirming}
      />
    </div>
  );
}
