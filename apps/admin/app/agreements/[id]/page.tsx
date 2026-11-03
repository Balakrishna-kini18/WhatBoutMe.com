"use client";

import { useEffect, useState, useMemo, use, FormEvent } from "react";
import styles from "../../page.module.css";
import Link from "next/link";
import { API_URL, errorMessage, cachedFetch } from "../../lib/api";
import {
  StatusBadge,
  CustomSelect,
  ConfirmDialog,
  useToast,
  AgreementMarkdown,
  TableSkeleton,
  EmptyState,
  Pagination,
  SortIndicator,
  type SortOrder,
} from "../../components";

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

interface ProgramOption {
  id: string;
  title: string;
}

interface BatchOption {
  id: string;
  name: string;
  programId?: string;
  program?: { id: string; title: string } | string;
}

type VersionSortField = "version" | "publishedAt" | "signed" | "status";
type SignedSortField = "learner" | "program" | "version" | "signedAt" | "status";

function getLearnerDisplayName(rec: SignedRecord): string {
  return (
    [rec.user?.firstName, rec.user?.lastName].filter(Boolean).join(" ") ||
    rec.user?.name ||
    rec.typedName ||
    rec.user?.email ||
    "Learner"
  );
}

function getEffectiveProgramId(rec: SignedRecord, template: TemplateDetails | null): string {
  return rec.programId || rec.program?.id || template?.programId || template?.program?.id || "";
}

function getEffectiveProgramTitle(rec: SignedRecord, template: TemplateDetails | null): string {
  return rec.programTitle || rec.program?.title || template?.program?.title || "—";
}

function getEffectiveBatchId(rec: SignedRecord): string {
  return rec.enrolment?.batch?.id || rec.enrolment?.batchId || "";
}

function getEffectiveBatchName(rec: SignedRecord): string {
  return rec.enrolment?.batch?.name || "—";
}

function getEffectiveEnrolmentStatus(rec: SignedRecord): string {
  return rec.enrolmentStatus || rec.enrolment?.status || rec.status || "SIGNED";
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
  const [programs, setPrograms] = useState<ProgramOption[]>([]);
  const [batches, setBatches] = useState<BatchOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSignedLoading, setIsSignedLoading] = useState(false);
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

  // Version History filters, sorting & pagination
  const [versionSearch, setVersionSearch] = useState("");
  const [versionStatusFilter, setVersionStatusFilter] = useState("ALL");
  const [versionSortField, setVersionSortField] = useState<VersionSortField>("publishedAt");
  const [versionSortOrder, setVersionSortOrder] = useState<SortOrder>("desc");
  const [versionPage, setVersionPage] = useState(1);
  const [versionPageSize, setVersionPageSize] = useState(10);

  // Signed Records filters, sorting & pagination
  const [signedSearch, setSignedSearch] = useState("");
  const [signedProgramFilter, setSignedProgramFilter] = useState("ALL");
  const [signedBatchFilter, setSignedBatchFilter] = useState("ALL");
  const [signedStatusFilter, setSignedStatusFilter] = useState("ALL");
  const [signedSortField, setSignedSortField] = useState<SignedSortField>("signedAt");
  const [signedSortOrder, setSignedSortOrder] = useState<SortOrder>("desc");
  const [signedPage, setSignedPage] = useState(1);
  const [signedPageSize, setSignedPageSize] = useState(10);

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

  // View signature preview / audit detail modal
  const [previewSignatureModal, setPreviewSignatureModal] = useState<SignedRecord | null>(null);

  const [statusMsg, setStatusMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [downloadingSignedId, setDownloadingSignedId] = useState<string | null>(null);

  useEffect(() => {
    fetchTemplateData();
    fetchSignedRecords();
  }, [templateId]);

  useEffect(() => {
    setVersionPage(1);
  }, [versionSearch, versionStatusFilter]);

  useEffect(() => {
    setSignedPage(1);
  }, [signedSearch, signedProgramFilter, signedBatchFilter, signedStatusFilter]);

  const fetchTemplateData = async () => {
    setIsLoading(true);
    setStatusMsg(null);
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const [tplRes, versionsRes, progsRes, batchesRes] = await Promise.all([
        fetch(`${API_URL}/admin/agreement-templates/${templateId}`, { headers }),
        fetch(`${API_URL}/admin/agreement-templates/${templateId}/versions`, { headers }),
        fetch(`${API_URL}/programs`, { headers }).catch(() => null),
        fetch(`${API_URL}/batches`, { headers }).catch(() => null),
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

      if (progsRes && progsRes.ok) {
        const pData = await progsRes.json();
        if (Array.isArray(pData)) {
          setPrograms(
            pData
              .filter((p: any) => !p.isArchived && !/test\s*program|placeholder|junk|foo\s*bar/i.test(p.title))
              .sort((a: any, b: any) => (a.title || "").localeCompare(b.title || ""))
          );
        }
      }

      if (batchesRes && batchesRes.ok) {
        const bData = await batchesRes.json();
        if (Array.isArray(bData)) {
          setBatches(bData);
        }
      }
    } catch (err: any) {
      setStatusMsg({ type: "error", text: err.message || "Failed to load agreement details" });
    } finally {
      setIsLoading(false);
    }
  };

  const fetchSignedRecords = async () => {
    setIsSignedLoading(true);
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const res = await fetch(
        `${API_URL}/admin/agreement-templates/${templateId}/signed?tab=ALL&page=1&limit=100`,
        { headers }
      );

      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setSignedRecords(data);
        } else {
          setSignedRecords(Array.isArray(data.data) ? data.data : []);
        }
      }
    } catch (err) {
      console.error("Failed to fetch signed records", err);
    } finally {
      setIsSignedLoading(false);
    }
  };

  const handleOpenSignedDetails = async (rec: SignedRecord) => {
    setPreviewSignatureModal(rec);
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
    }
  };

  useEffect(() => {
    if (typeof window !== "undefined") {
      const searchParams = new URLSearchParams(window.location.search);
      const targetSignedId = searchParams.get("signedId");
      if (targetSignedId) {
        setActiveTab("signed");
        handleOpenSignedDetails({ id: targetSignedId } as any);
      }
    }
  }, [templateId]);

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
      toast.success("Agreement details updated.");
      await fetchTemplateData();
    } catch (err: any) {
      toast.error(err.message || "Failed to update template info");
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
      await fetchTemplateData();
    } catch (err: any) {
      toast.error(err.message || "Failed to create version");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePublishVersion = (version: TemplateVersion) => {
    setConfirmConfig({
      isOpen: true,
      title: "Publish Agreement Version",
      subtitle: `Version: ${version.version}`,
      description: `Are you sure you want to publish ${version.version}? This will make it active for all enrolled learners and archive previous versions.`,
      confirmText: "Publish Version",
      tone: "info",
      onConfirm: async () => {
        setIsConfirming(true);
        try {
          const res = await cachedFetch(
            `${API_URL}/admin/agreement-templates/${templateId}/versions/${version.id}/publish`,
            { method: "POST" }
          );

          if (!res.ok) {
            throw new Error(await errorMessage(res, `Failed to publish ${version.version}`));
          }

          toast.success(`Version ${version.version} is now published.`);
          await fetchTemplateData();
        } catch (err: any) {
          toast.error(err.message || "Publish action failed");
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
        try {
          const res = await cachedFetch(
            `${API_URL}/admin/agreement-templates/${templateId}/versions/${version.id}`,
            { method: "DELETE" }
          );

          if (!res.ok) {
            throw new Error(await errorMessage(res, `Failed to delete ${version.version}`));
          }

          toast.success(`Draft ${version.version} deleted.`);
          await fetchTemplateData();
        } catch (err: any) {
          toast.error(err.message || "Failed to delete draft");
        } finally {
          setIsConfirming(false);
          setConfirmConfig(null);
        }
      },
    });
  };

  const handleDownloadSignedPdf = async (rec: SignedRecord) => {
    setDownloadingSignedId(rec.id);
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
      const rawFetch =
        typeof window !== "undefined" && (window as any).__rawOriginalFetch
          ? (window as any).__rawOriginalFetch
          : fetch;
      const res = await rawFetch(
        `${API_URL}/admin/agreement-templates/${templateId}/signed/${rec.id}/pdf`,
        {
          headers: {
            Accept: "application/pdf",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        }
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
      toast.error(err.message || "Failed to download signed agreement PDF");
    } finally {
      setDownloadingSignedId(null);
    }
  };

  // ───────────────────────────────────────────────────────────────────────────
  // VERSION HISTORY FILTERING, SORTING & PAGINATION
  // ───────────────────────────────────────────────────────────────────────────

  const handleVersionSort = (field: VersionSortField) => {
    if (versionSortField === field) {
      setVersionSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setVersionSortField(field);
      setVersionSortOrder("asc");
    }
  };

  const contextFilteredVersions = useMemo(() => {
    if (!versionSearch.trim()) return versions;
    const q = versionSearch.toLowerCase().trim();
    return versions.filter((v) => {
      const verMatch = (v.version || "").toLowerCase().includes(q);
      const logMatch = (v.changelog || "").toLowerCase().includes(q);
      const authorMatch = (v.createdBy?.name || v.createdBy?.email || "").toLowerCase().includes(q);
      return verMatch || logMatch || authorMatch;
    });
  }, [versions, versionSearch]);

  const versionStatusOptions = useMemo(() => {
    const counts = {
      ALL: contextFilteredVersions.length,
      PUBLISHED: 0,
      DRAFT: 0,
      ARCHIVED: 0,
    };
    for (const v of contextFilteredVersions) {
      if (v.status in counts) counts[v.status]++;
    }
    return [
      { value: "ALL", label: `All Statuses (${counts.ALL})` },
      { value: "PUBLISHED", label: `Published (${counts.PUBLISHED})` },
      { value: "DRAFT", label: `Draft (${counts.DRAFT})` },
      { value: "ARCHIVED", label: `Archived (${counts.ARCHIVED})` },
    ];
  }, [contextFilteredVersions]);

  const filteredVersions = useMemo(() => {
    if (versionStatusFilter === "ALL") return contextFilteredVersions;
    return contextFilteredVersions.filter((v) => v.status === versionStatusFilter);
  }, [contextFilteredVersions, versionStatusFilter]);

  const sortedVersions = useMemo(() => {
    return [...filteredVersions].sort((a, b) => {
      let cmp = 0;
      if (versionSortField === "version") {
        cmp = (a.version || "").localeCompare(b.version || "");
      } else if (versionSortField === "publishedAt") {
        const dA = new Date(a.publishedAt || a.createdAt || 0).getTime();
        const dB = new Date(b.publishedAt || b.createdAt || 0).getTime();
        cmp = dA - dB;
      } else if (versionSortField === "signed") {
        cmp = (a._count?.signedAgreements ?? 0) - (b._count?.signedAgreements ?? 0);
      } else if (versionSortField === "status") {
        cmp = (a.status || "").localeCompare(b.status || "");
      }
      return versionSortOrder === "asc" ? cmp : -cmp;
    });
  }, [filteredVersions, versionSortField, versionSortOrder]);

  const paginatedVersions = useMemo(() => {
    const start = (versionPage - 1) * versionPageSize;
    return sortedVersions.slice(start, start + versionPageSize);
  }, [sortedVersions, versionPage, versionPageSize]);

  const hasVersionFilters = Boolean(versionSearch.trim() || versionStatusFilter !== "ALL");

  const resetVersionFilters = () => {
    setVersionSearch("");
    setVersionStatusFilter("ALL");
    setVersionPage(1);
  };

  // ───────────────────────────────────────────────────────────────────────────
  // SIGNED RECORDS FILTERING (PROGRAM, BATCH, STATUS, SEARCH), SORTING & PAGINATION
  // ───────────────────────────────────────────────────────────────────────────

  const handleSignedSort = (field: SignedSortField) => {
    if (signedSortField === field) {
      setSignedSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSignedSortField(field);
      setSignedSortOrder("asc");
    }
  };

  const signedProgramOptions = useMemo(() => {
    const map = new Map<string, string>();
    programs.forEach((p) => {
      if (p.id && p.title) map.set(p.id, p.title);
    });
    if (template?.program?.id && template?.program?.title) {
      map.set(template.program.id, template.program.title);
    }
    signedRecords.forEach((rec) => {
      const pId = getEffectiveProgramId(rec, template);
      const pTitle = getEffectiveProgramTitle(rec, template);
      if (pId && pTitle && pTitle !== "—") {
        map.set(pId, pTitle);
      }
    });
    return [
      { value: "ALL", label: "All Programs" },
      ...Array.from(map.entries()).map(([value, label]) => ({ value, label })),
    ];
  }, [programs, template, signedRecords]);

  const signedBatchOptions = useMemo(() => {
    const map = new Map<string, string>();
    batches.forEach((b) => {
      const bProgId =
        b.programId || (typeof b.program === "object" && b.program ? b.program.id : undefined);
      if (signedProgramFilter !== "ALL" && bProgId && bProgId !== signedProgramFilter) {
        return;
      }
      if (b.id && b.name) map.set(b.id, b.name);
    });
    signedRecords.forEach((rec) => {
      const recProgId = getEffectiveProgramId(rec, template);
      if (signedProgramFilter !== "ALL" && recProgId !== signedProgramFilter) {
        return;
      }
      const bId = getEffectiveBatchId(rec);
      const bName = getEffectiveBatchName(rec);
      if (bId && bName && bName !== "—") {
        map.set(bId, bName);
      }
    });
    return [
      { value: "ALL", label: "All Batches" },
      ...Array.from(map.entries()).map(([value, label]) => ({ value, label })),
    ];
  }, [batches, signedRecords, signedProgramFilter, template]);

  const contextFilteredSigned = useMemo(() => {
    return signedRecords.filter((rec) => {
      const progId = getEffectiveProgramId(rec, template);
      const progTitle = getEffectiveProgramTitle(rec, template);
      const batchId = getEffectiveBatchId(rec);
      const batchName = getEffectiveBatchName(rec);

      if (signedProgramFilter !== "ALL" && progId !== signedProgramFilter && progTitle !== signedProgramFilter) {
        return false;
      }

      if (signedBatchFilter !== "ALL" && batchId !== signedBatchFilter && batchName !== signedBatchFilter) {
        return false;
      }

      if (!signedSearch.trim()) return true;
      const q = signedSearch.toLowerCase().trim();
      const learnerName = getLearnerDisplayName(rec).toLowerCase();
      const email = (rec.user?.email || "").toLowerCase();
      const progMatch = progTitle.toLowerCase().includes(q);
      const batchMatch = batchName.toLowerCase().includes(q);
      const versionMatch = (rec.templateVersion || rec.version?.version || "").toLowerCase().includes(q);
      return learnerName.includes(q) || email.includes(q) || progMatch || batchMatch || versionMatch;
    });
  }, [signedRecords, signedProgramFilter, signedBatchFilter, signedSearch, template]);

  const signedStatusOptions = useMemo(() => {
    const counts = {
      ALL: contextFilteredSigned.length,
      ACTIVE: 0,
      PENDING_PAYMENT: 0,
      COMPLETED: 0,
      REVOKED: 0,
    };
    for (const rec of contextFilteredSigned) {
      const st = getEffectiveEnrolmentStatus(rec);
      if (st === "ACTIVE") counts.ACTIVE++;
      else if (st === "PENDING_PAYMENT" || st === "PENDING_AGREEMENT") counts.PENDING_PAYMENT++;
      else if (st === "COMPLETED") counts.COMPLETED++;
      else if (st === "REVOKED") counts.REVOKED++;
    }
    return [
      { value: "ALL", label: `All Statuses (${counts.ALL})` },
      { value: "ACTIVE", label: `Active (${counts.ACTIVE})` },
      { value: "PENDING_PAYMENT", label: `Pending Payment (${counts.PENDING_PAYMENT})` },
      { value: "COMPLETED", label: `Completed (${counts.COMPLETED})` },
      { value: "REVOKED", label: `Revoked (${counts.REVOKED})` },
    ];
  }, [contextFilteredSigned]);

  const filteredSigned = useMemo(() => {
    if (signedStatusFilter === "ALL") return contextFilteredSigned;
    return contextFilteredSigned.filter((rec) => {
      const st = getEffectiveEnrolmentStatus(rec);
      if (signedStatusFilter === "PENDING_PAYMENT") {
        return st === "PENDING_PAYMENT" || st === "PENDING_AGREEMENT";
      }
      return st === signedStatusFilter;
    });
  }, [contextFilteredSigned, signedStatusFilter]);

  const sortedSigned = useMemo(() => {
    return [...filteredSigned].sort((a, b) => {
      let cmp = 0;
      if (signedSortField === "learner") {
        cmp = getLearnerDisplayName(a).localeCompare(getLearnerDisplayName(b));
      } else if (signedSortField === "program") {
        cmp = getEffectiveProgramTitle(a, template).localeCompare(getEffectiveProgramTitle(b, template));
      } else if (signedSortField === "version") {
        const vA = a.templateVersion || a.version?.version || "";
        const vB = b.templateVersion || b.version?.version || "";
        cmp = vA.localeCompare(vB);
      } else if (signedSortField === "signedAt") {
        cmp = new Date(a.signedAt || 0).getTime() - new Date(b.signedAt || 0).getTime();
      } else if (signedSortField === "status") {
        cmp = getEffectiveEnrolmentStatus(a).localeCompare(getEffectiveEnrolmentStatus(b));
      }
      return signedSortOrder === "asc" ? cmp : -cmp;
    });
  }, [filteredSigned, signedSortField, signedSortOrder, template]);

  const paginatedSigned = useMemo(() => {
    const start = (signedPage - 1) * signedPageSize;
    return sortedSigned.slice(start, start + signedPageSize);
  }, [sortedSigned, signedPage, signedPageSize]);

  const hasSignedFilters = Boolean(
    signedSearch.trim() ||
      signedProgramFilter !== "ALL" ||
      signedBatchFilter !== "ALL" ||
      signedStatusFilter !== "ALL"
  );

  const resetSignedFilters = () => {
    setSignedSearch("");
    setSignedProgramFilter("ALL");
    setSignedBatchFilter("ALL");
    setSignedStatusFilter("ALL");
    setSignedPage(1);
  };

  if (isLoading) {
    return (
      <div className={styles.dashboardContainer}>
        <section className={styles.tableSection}>
          <div className={styles.tableWrapper}>
            <table className={styles.adminTable}>
              <tbody>
                <TableSkeleton columns={6} rows={5} />
              </tbody>
            </table>
          </div>
        </section>
      </div>
    );
  }

  if (!template) {
    return (
      <div className={styles.dashboardContainer}>
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

  return (
    <div className={styles.dashboardContainer}>
      {/* HEADER & ACTIONS */}
      <header className={styles.header} style={{ marginBottom: 0 }}>
        <div className={styles.headerText}>
          <div style={{ marginBottom: "0.4rem" }}>
            <Link
              href="/agreements"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.3rem",
                fontSize: "0.8rem",
                color: "var(--accent-primary, #b86b11)",
                textDecoration: "none",
                fontWeight: 600,
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="15 18 9 12 15 6" />
              </svg>
              <span>Agreements</span>
            </Link>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.65rem", flexWrap: "wrap" }}>
            <h1 className={styles.title} style={{ margin: 0 }}>{template.title}</h1>
            <StatusBadge status={templateOverallStatus} />
          </div>
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
            style={{ display: "inline-flex", alignItems: "center", gap: "0.45rem" }}
          >
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
            style={{ display: "inline-flex", alignItems: "center", gap: "0.45rem" }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            <span>New Version</span>
          </button>
        </div>
      </header>

      {statusMsg && (
        <div className={statusMsg.type === "success" ? styles.alertSuccess : styles.alertError}>
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
          <span>Signed Records</span>
          <span className={styles.pointsBadge}>{signedRecords.length}</span>
        </button>
      </div>

      {/* TAB 1: VERSION HISTORY */}
      {activeTab === "versions" && (
        <section className={styles.tableSection}>
          <div
            className={styles.sectionHeader}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: "0.75rem",
            }}
          >
            <div
              className={styles.searchContainer}
              style={{ minWidth: "240px", flex: "1 1 260px", maxWidth: "340px" }}
            >
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                style={{ color: "var(--text-muted)", flexShrink: 0, marginRight: "0.45rem" }}
              >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="text"
                value={versionSearch}
                onChange={(e) => setVersionSearch(e.target.value)}
                placeholder="Search version, changelog, or author..."
                className={styles.searchInput}
                aria-label="Search versions"
              />
              {versionSearch && (
                <button
                  type="button"
                  onClick={() => setVersionSearch("")}
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--text-muted)",
                    cursor: "pointer",
                    padding: "0 2px",
                    fontSize: "0.85rem",
                    lineHeight: 1,
                  }}
                  aria-label="Clear search"
                >
                  ✕
                </button>
              )}
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", flexWrap: "wrap" }}>
              <CustomSelect
                ariaLabel="Filter versions by status"
                value={versionStatusFilter}
                onChange={setVersionStatusFilter}
                options={versionStatusOptions}
                minWidth="165px"
              />
              {hasVersionFilters && (
                <button
                  type="button"
                  onClick={resetVersionFilters}
                  className={styles.secondaryBtnSmall}
                  style={{ height: "36px", padding: "0 0.85rem" }}
                >
                  Reset
                </button>
              )}
            </div>
          </div>

          <div className={styles.tableWrapper}>
            <table className={styles.adminTable}>
              <thead>
                <tr>
                  <th
                    onClick={() => handleVersionSort("version")}
                    style={{ cursor: "pointer", userSelect: "none" }}
                  >
                    Version
                    <SortIndicator active={versionSortField === "version"} order={versionSortOrder} />
                  </th>
                  <th>Changelog</th>
                  <th
                    onClick={() => handleVersionSort("publishedAt")}
                    style={{ cursor: "pointer", userSelect: "none" }}
                  >
                    Published Date
                    <SortIndicator active={versionSortField === "publishedAt"} order={versionSortOrder} />
                  </th>
                  <th
                    onClick={() => handleVersionSort("signed")}
                    style={{ cursor: "pointer", userSelect: "none" }}
                  >
                    Signed
                    <SortIndicator active={versionSortField === "signed"} order={versionSortOrder} />
                  </th>
                  <th>Created By</th>
                  <th
                    onClick={() => handleVersionSort("status")}
                    style={{ cursor: "pointer", userSelect: "none" }}
                  >
                    Status
                    <SortIndicator active={versionSortField === "status"} order={versionSortOrder} />
                  </th>
                  <th className={styles.alignRight}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {sortedVersions.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ padding: "32px 16px" }}>
                      <EmptyState
                        icon="document"
                        title={hasVersionFilters ? "No matching versions" : "No versions created yet"}
                        description={
                          hasVersionFilters
                            ? "Try clearing your search or status filter."
                            : "Create a new version to author agreement terms."
                        }
                        actionLabel={hasVersionFilters ? "Reset Filters" : undefined}
                        onAction={hasVersionFilters ? resetVersionFilters : undefined}
                      />
                    </td>
                  </tr>
                ) : (
                  paginatedVersions.map((ver) => {
                    const isDraft = ver.status === "DRAFT";
                    const signedCount = ver._count?.signedAgreements ?? 0;

                    return (
                      <tr key={ver.id}>
                        <td>
                          <span className={styles.cellUserName}>{ver.version}</span>
                        </td>
                        <td>
                          <span className={styles.cellTextSecondary}>{ver.changelog || "—"}</span>
                        </td>
                        <td>
                          <span className={styles.cellTextMuted}>
                            {ver.publishedAt
                              ? new Date(ver.publishedAt).toLocaleDateString("en-US", {
                                  month: "short",
                                  day: "numeric",
                                  year: "numeric",
                                })
                              : "—"}
                          </span>
                        </td>
                        <td>
                          <span className={styles.cellTextSecondary}>{signedCount}</span>
                        </td>
                        <td>
                          <span className={styles.cellTextSecondary}>
                            {ver.createdBy?.name || ver.createdBy?.email || "System"}
                          </span>
                        </td>
                        <td>
                          <StatusBadge status={ver.status} />
                        </td>
                        <td className={styles.alignRight}>
                          <div style={{ display: "inline-flex", gap: "0.4rem", alignItems: "center" }}>
                            <button
                              type="button"
                              className={styles.secondaryBtnSmall}
                              style={{ whiteSpace: "nowrap" }}
                              onClick={() => setViewingVersion(ver)}
                            >
                              View
                            </button>
                            {isDraft && (
                              <button
                                type="button"
                                className={styles.primaryBtnSmall}
                                style={{ whiteSpace: "nowrap" }}
                                onClick={() => handlePublishVersion(ver)}
                              >
                                Publish
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

          <Pagination
            currentPage={versionPage}
            pageSize={versionPageSize}
            totalItems={sortedVersions.length}
            onPageChange={setVersionPage}
            onPageSizeChange={(size) => {
              setVersionPageSize(size);
              setVersionPage(1);
            }}
            itemLabel="versions"
          />
        </section>
      )}

      {/* TAB 2: SIGNED RECORDS */}
      {activeTab === "signed" && (
        <section className={styles.tableSection}>
          {/* Unified Search, Program, Batch & Status Filter Toolbar */}
          <div
            className={styles.sectionHeader}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: "0.75rem",
            }}
          >
            {/* Left: Search */}
            <div
              className={styles.searchContainer}
              style={{ minWidth: "240px", flex: "1 1 260px", maxWidth: "340px" }}
            >
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                style={{ color: "var(--text-muted)", flexShrink: 0, marginRight: "0.45rem" }}
              >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="text"
                value={signedSearch}
                onChange={(e) => setSignedSearch(e.target.value)}
                placeholder="Search learner, email, program, or batch..."
                className={styles.searchInput}
                aria-label="Search signed records"
              />
              {signedSearch && (
                <button
                  type="button"
                  onClick={() => setSignedSearch("")}
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--text-muted)",
                    cursor: "pointer",
                    padding: "0 2px",
                    fontSize: "0.85rem",
                    lineHeight: 1,
                  }}
                  aria-label="Clear search"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Right: Program, Batch & Status Dropdowns */}
            <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", flexWrap: "wrap" }}>
              <CustomSelect
                ariaLabel="Filter signed records by program"
                value={signedProgramFilter}
                onChange={(val) => {
                  setSignedProgramFilter(val);
                  setSignedBatchFilter("ALL");
                }}
                options={signedProgramOptions}
                minWidth="180px"
              />
              <CustomSelect
                ariaLabel="Filter signed records by batch"
                value={signedBatchFilter}
                onChange={setSignedBatchFilter}
                options={signedBatchOptions}
                minWidth="175px"
              />
              <CustomSelect
                ariaLabel="Filter signed records by status"
                value={signedStatusFilter}
                onChange={setSignedStatusFilter}
                options={signedStatusOptions}
                minWidth="175px"
              />
              {hasSignedFilters && (
                <button
                  type="button"
                  onClick={resetSignedFilters}
                  className={styles.secondaryBtnSmall}
                  style={{ height: "36px", padding: "0 0.85rem" }}
                >
                  Reset
                </button>
              )}
            </div>
          </div>

          <div className={styles.tableWrapper}>
            <table className={styles.adminTable}>
              <thead>
                <tr>
                  <th
                    onClick={() => handleSignedSort("learner")}
                    style={{ cursor: "pointer", userSelect: "none" }}
                  >
                    Learner
                    <SortIndicator active={signedSortField === "learner"} order={signedSortOrder} />
                  </th>
                  <th
                    onClick={() => handleSignedSort("program")}
                    style={{ cursor: "pointer", userSelect: "none" }}
                  >
                    Program &amp; Batch
                    <SortIndicator active={signedSortField === "program"} order={signedSortOrder} />
                  </th>
                  <th
                    onClick={() => handleSignedSort("version")}
                    style={{ cursor: "pointer", userSelect: "none" }}
                  >
                    Version
                    <SortIndicator active={signedSortField === "version"} order={signedSortOrder} />
                  </th>
                  <th
                    onClick={() => handleSignedSort("signedAt")}
                    style={{ cursor: "pointer", userSelect: "none" }}
                  >
                    Signed Date
                    <SortIndicator active={signedSortField === "signedAt"} order={signedSortOrder} />
                  </th>
                  <th
                    onClick={() => handleSignedSort("status")}
                    style={{ cursor: "pointer", userSelect: "none" }}
                  >
                    Status
                    <SortIndicator active={signedSortField === "status"} order={signedSortOrder} />
                  </th>
                  <th className={styles.alignRight}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {isSignedLoading ? (
                  <TableSkeleton columns={6} rows={5} />
                ) : sortedSigned.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ padding: "32px 16px" }}>
                      <EmptyState
                        icon="document"
                        title={hasSignedFilters ? "No matching signed records" : "No signed records yet"}
                        description={
                          hasSignedFilters
                            ? "Try adjusting your search, program, batch, or status filters."
                            : "Learner signatures for this agreement will appear here."
                        }
                        actionLabel={hasSignedFilters ? "Reset Filters" : undefined}
                        onAction={hasSignedFilters ? resetSignedFilters : undefined}
                      />
                    </td>
                  </tr>
                ) : (
                  paginatedSigned.map((rec) => {
                    const learnerName = getLearnerDisplayName(rec);
                    const effectiveProgram = getEffectiveProgramTitle(rec, template);
                    const batchName = getEffectiveBatchName(rec);
                    const enrolmentStatus = getEffectiveEnrolmentStatus(rec);
                    const signedDateText = rec.signedAt
                      ? new Date(rec.signedAt).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })
                      : "—";

                    return (
                      <tr key={rec.id}>
                        <td>
                          <div className={styles.cellUser}>
                            <div className={styles.cellUserName}>{learnerName}</div>
                            <div className={styles.cellUserEmail}>{rec.user?.email}</div>
                          </div>
                        </td>
                        <td>
                          <div className={styles.cellUserName}>{effectiveProgram}</div>
                          {batchName !== "—" && (
                            <div className={styles.cellUserEmail}>{batchName}</div>
                          )}
                        </td>
                        <td>
                          <span className={styles.cellTextSecondary}>
                            {rec.templateVersion || rec.version?.version || "v1.0"}
                          </span>
                        </td>
                        <td>
                          <span className={styles.cellTextMuted}>{signedDateText}</span>
                        </td>
                        <td>
                          <StatusBadge status={enrolmentStatus} />
                        </td>
                        <td className={styles.alignRight}>
                          <div style={{ display: "inline-flex", gap: "0.4rem", alignItems: "center" }}>
                            <button
                              type="button"
                              onClick={() => handleOpenSignedDetails(rec)}
                              className={styles.secondaryBtnSmall}
                              style={{ whiteSpace: "nowrap" }}
                            >
                              View
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDownloadSignedPdf(rec)}
                              disabled={downloadingSignedId === rec.id}
                              className={styles.secondaryBtnSmall}
                              style={{
                                whiteSpace: "nowrap",
                                opacity: downloadingSignedId === rec.id ? 0.65 : 1,
                              }}
                            >
                              {downloadingSignedId === rec.id ? "..." : "PDF"}
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

          <Pagination
            currentPage={signedPage}
            pageSize={signedPageSize}
            totalItems={sortedSigned.length}
            onPageChange={setSignedPage}
            onPageSizeChange={(size) => {
              setSignedPageSize(size);
              setSignedPage(1);
            }}
            itemLabel="records"
          />
        </section>
      )}

      {/* CREATE NEW VERSION MODAL */}
      {isVersionModalOpen && (
        <div className={styles.modalOverlay} onClick={() => !isSubmitting && setIsVersionModalOpen(false)}>
          <div className={styles.modalContent} style={{ maxWidth: "700px" }} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div>
                <h2>Create New Version</h2>
              </div>
              <button
                type="button"
                className={styles.closeBtn}
                onClick={() => setIsVersionModalOpen(false)}
                disabled={isSubmitting}
                aria-label="Close modal"
              >
                ×
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
                    Changelog <span className={styles.optionalLabel}>(optional)</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Updated terms"
                    value={newVersionChangelog}
                    onChange={(e) => setNewVersionChangelog(e.target.value)}
                  />
                </div>
              </div>

              <div className={styles.formGroup}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                  <label style={{ margin: 0 }}>
                    Terms &amp; Conditions <span style={{ color: "#ef4444" }}>*</span>
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
                      }}
                    >
                      Edit
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
                    placeholder="Enter agreement terms in Markdown format..."
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
                        No content entered yet.
                      </p>
                    )}
                  </div>
                )}
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
                  Publish immediately
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
              <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                <h2 style={{ margin: 0 }}>Version {viewingVersion.version}</h2>
                <StatusBadge status={viewingVersion.status} />
              </div>
              <button
                type="button"
                className={styles.closeBtn}
                onClick={() => setViewingVersion(null)}
                aria-label="Close modal"
              >
                ×
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
                  }}
                >
                  Preview
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
                  }}
                >
                  Markdown
                </button>
              </div>
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
              >
                {copiedTerms ? "Copied!" : "Copy Terms"}
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
              >
                Branch Version
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

      {/* SIGNATURE & RECORD DETAIL MODAL */}
      {previewSignatureModal && (
        <div
          className={styles.modalOverlay}
          onClick={() => setPreviewSignatureModal(null)}
        >
          <div
            className={styles.modalContent}
            style={{ maxWidth: "640px", maxHeight: "90vh", overflowY: "auto" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.modalHeader}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", flexWrap: "wrap" }}>
                <h2 style={{ margin: 0 }}>Signed Agreement Record</h2>
                <StatusBadge status={getEffectiveEnrolmentStatus(previewSignatureModal)} />
              </div>
              <button
                type="button"
                className={styles.closeBtn}
                onClick={() => setPreviewSignatureModal(null)}
                aria-label="Close modal"
              >
                ×
              </button>
            </div>

            {/* SIGNATURE DISPLAY CARD */}
            <div
              style={{
                background: "#FDFAF6",
                border: "1px solid var(--border-light, #E7E0D6)",
                borderRadius: "10px",
                margin: "1rem 1.75rem 0.75rem",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "0.5rem 1rem",
                  background: "var(--bg-soft, #F7F3EC)",
                  borderBottom: "1px solid var(--border-light, #E7E0D6)",
                  fontSize: "0.74rem",
                  fontWeight: 600,
                  color: "var(--text-secondary)",
                }}
              >
                <span>
                  {previewSignatureModal.signatureType === "UPLOADED" ? "Uploaded Signature" : "Drawn Signature"}
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
                      minHeight: "120px",
                      maxHeight: "170px",
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
                        alt={`Signature of ${previewSignatureModal.typedName || "Learner"}`}
                        style={{ maxHeight: "140px", maxWidth: "100%", objectFit: "contain" }}
                      />
                    ) : (
                      <div style={{ color: "var(--text-secondary)", fontSize: "0.85rem" }}>
                        No signature image available
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>

            {/* METADATA GRID */}
            <div
              style={{
                background: "#FFFFFF",
                border: "1px solid var(--border-light, #E7E0D6)",
                borderRadius: "10px",
                padding: "1rem 1.25rem",
                margin: "0 1.75rem 1rem",
                fontSize: "0.82rem",
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "0.75rem 1.25rem",
              }}
            >
              <div>
                <span style={{ color: "var(--text-muted)", display: "block", fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.04em", fontWeight: 600, marginBottom: "2px" }}>
                  Learner
                </span>
                <strong style={{ color: "var(--text-primary)" }}>
                  {previewSignatureModal.typedName || getLearnerDisplayName(previewSignatureModal)}
                </strong>
              </div>

              <div>
                <span style={{ color: "var(--text-muted)", display: "block", fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.04em", fontWeight: 600, marginBottom: "2px" }}>
                  Email
                </span>
                <span style={{ color: "var(--text-primary)", fontWeight: 500 }}>
                  {previewSignatureModal.user?.email}
                </span>
              </div>

              <div>
                <span style={{ color: "var(--text-muted)", display: "block", fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.04em", fontWeight: 600, marginBottom: "2px" }}>
                  Program
                </span>
                <strong style={{ color: "var(--text-primary)" }}>
                  {getEffectiveProgramTitle(previewSignatureModal, template)}
                </strong>
              </div>

              <div>
                <span style={{ color: "var(--text-muted)", display: "block", fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.04em", fontWeight: 600, marginBottom: "2px" }}>
                  Batch
                </span>
                <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>
                  {getEffectiveBatchName(previewSignatureModal)}
                </span>
              </div>

              <div>
                <span style={{ color: "var(--text-muted)", display: "block", fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.04em", fontWeight: 600, marginBottom: "2px" }}>
                  Version
                </span>
                <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>
                  {previewSignatureModal.templateVersion || previewSignatureModal.version?.version || "v1.0"}
                </span>
              </div>

              <div>
                <span style={{ color: "var(--text-muted)", display: "block", fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.04em", fontWeight: 600, marginBottom: "2px" }}>
                  Payment
                </span>
                <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>
                  {previewSignatureModal.paymentStatus || "PENDING"}
                </span>
              </div>

              <div>
                <span style={{ color: "var(--text-muted)", display: "block", fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.04em", fontWeight: 600, marginBottom: "2px" }}>
                  Signed On
                </span>
                <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>
                  {new Date(previewSignatureModal.signedAt).toLocaleString()}
                </span>
              </div>

              <div>
                <span style={{ color: "var(--text-muted)", display: "block", fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.04em", fontWeight: 600, marginBottom: "2px" }}>
                  IP Address
                </span>
                <code
                  style={{
                    fontFamily: "monospace",
                    fontSize: "0.78rem",
                    color: "var(--text-secondary)",
                  }}
                >
                  {previewSignatureModal.signerIp || "—"}
                </code>
              </div>
            </div>

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
              >
                {downloadingSignedId === previewSignatureModal.id ? "Preparing..." : "Download PDF"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EDIT TEMPLATE METADATA MODAL */}
      {isEditTemplateModalOpen && (
        <div className={styles.modalOverlay} onClick={() => !isSubmitting && setIsEditTemplateModalOpen(false)}>
          <div className={styles.modalContent} style={{ maxWidth: "520px" }} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div>
                <h2>Edit Details</h2>
              </div>
              <button
                type="button"
                className={styles.closeBtn}
                onClick={() => setIsEditTemplateModalOpen(false)}
                disabled={isSubmitting}
                aria-label="Close modal"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleUpdateTemplateInfo} className={styles.modalForm}>
              <div className={styles.formGroup}>
                <label>
                  Title <span style={{ color: "#ef4444" }}>*</span>
                </label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  placeholder="Agreement title"
                  required
                />
              </div>

              <div className={styles.formGroup}>
                <label>Description <span className={styles.optionalLabel}>(Optional)</span></label>
                <textarea
                  rows={3}
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  placeholder="Brief summary"
                />
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
