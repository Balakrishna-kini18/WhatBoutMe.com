"use client";

import { useEffect, useState, FormEvent, Suspense } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "../../AuthProvider";
import styles from "../../page.module.css";
import {
  CustomSelect,
  StatusBadge,
  useToast,
  Modal,
  TableSkeleton,
  EmptyState,
  Pagination,
  ActionMenu,
} from "../../components";
import { apiGet, apiPost, apiDelete } from "../../lib/api";

// --- Clean SVG Icon Helpers (Zero Emojis) ---
function BuildingIcon({ size = 16, style }: { size?: number; style?: React.CSSProperties }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={style}>
      <rect width="16" height="20" x="4" y="2" rx="2" ry="2" />
      <path d="M9 22v-4h6v4" />
      <path d="M8 6h.01" />
      <path d="M16 6h.01" />
      <path d="M8 10h.01" />
      <path d="M16 10h.01" />
      <path d="M8 14h.01" />
      <path d="M16 14h.01" />
    </svg>
  );
}

function LayersIcon({ size = 16, style }: { size?: number; style?: React.CSSProperties }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={style}>
      <polygon points="12 2 2 7 12 12 22 7 12 2" />
      <polyline points="2 17 12 22 22 17" />
      <polyline points="2 12 12 17 22 12" />
    </svg>
  );
}

function PercentIcon({ size = 16, style }: { size?: number; style?: React.CSSProperties }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={style}>
      <line x1="19" y1="5" x2="5" y2="19" />
      <circle cx="6.5" cy="6.5" r="2.5" />
      <circle cx="17.5" cy="17.5" r="2.5" />
    </svg>
  );
}

function CalendarIcon({ size = 16, style }: { size?: number; style?: React.CSSProperties }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={style}>
      <rect width="18" height="18" x="3" y="4" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

function CopyIcon({ size = 12, style }: { size?: number; style?: React.CSSProperties }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={style}>
      <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
      <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
    </svg>
  );
}

function CheckIcon({ size = 14, style }: { size?: number; style?: React.CSSProperties }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={style}>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function RefreshCwIcon({ size = 12, style }: { size?: number; style?: React.CSSProperties }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={style}>
      <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
      <path d="M8 16H3v5" />
    </svg>
  );
}

function ChevronDownIcon({ size = 14, style }: { size?: number; style?: React.CSSProperties }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={style}>
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function AlertTriangleIcon({ size = 16, style }: { size?: number; style?: React.CSSProperties }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={style}>
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

function TrashIcon({ size = 14, style }: { size?: number; style?: React.CSSProperties }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={style}>
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
    </svg>
  );
}

interface OrganizationItem {
  id: string;
  orgCode: string;
  name: string;
  slug: string;
  orgType: string;
  status: string;
  contactPersonName: string;
  contactEmail: string;
  contactPhone?: string | null;
  billingEmail: string;
  defaultCurrency: string;
  isAuthorizedReseller: boolean;
  showSponsorOnCertificate: boolean;
  sponsorDisplayName?: string | null;
  allowedEmailDomains: string[];
  totalSlots: number;
  assignedSlots: number;
  consumedSlots: number;
  availableSlots: number;
  pendingApprovalCount?: number;
  pendingPaymentCount?: number;
  pendingSlots?: number;
  pendingBatchNames?: string[];
  activeBatchesCount: number;
  revenueByCurrency: Record<string, number>;
  membersCount: number;
  createdAt: string;
}

const ORG_TYPES = [
  { value: "ALL", label: "All Organization Types" },
  { value: "CORPORATE", label: "Corporate Enterprise" },
  { value: "RESELLER_ACADEMY", label: "Reseller Academy" },
  { value: "CLINIC", label: "Clinic / Healthcare" },
  { value: "SCHOOL", label: "School" },
  { value: "UNIVERSITY", label: "University" },
  { value: "NGO", label: "NGO / Non-Profit" },
  { value: "GOVERNMENT", label: "Government" },
];

const ORG_STATUSES = [
  { value: "ALL", label: "All Statuses" },
  { value: "ACTIVE", label: "Active" },
  { value: "PENDING_VERIFICATION", label: "Pending Verification" },
  { value: "SUSPENDED", label: "Suspended" },
];

export default function OrganizationsPage() {
  return (
    <Suspense fallback={null}>
      <OrganizationsContent />
    </Suspense>
  );
}

function OrganizationsContent() {
  const toast = useToast();
  const router = useRouter();
  const { user } = useAuth();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const effectiveUser = user || (typeof window !== "undefined" ? (() => {
    try {
      const raw = localStorage.getItem("user");
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  })() : null);

  const isOrgAccount = Boolean(
    (effectiveUser as any)?.isOrgUser ||
    (effectiveUser as any)?.organizationId ||
    (effectiveUser as any)?.organization ||
    (effectiveUser as any)?.orgRole
  );
  const isPlatformAdmin = Boolean(
    effectiveUser?.role === "SUPER_ADMIN" || effectiveUser?.role === "ADMIN"
  );
  const orgId = (effectiveUser as any)?.organization?.id || (effectiveUser as any)?.organizationId || null;

  useEffect(() => {
    if (!isPlatformAdmin && orgId) {
      router.replace(`/users/organizations/${orgId}`);
    }
  }, [isPlatformAdmin, orgId, router]);
  const [organizations, setOrganizations] = useState<OrganizationItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 20;

  // Search & Filter
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");

  // Create Modal & Simplified Onboarding State
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPasswordText, setShowPasswordText] = useState(false);
  const [createdResult, setCreatedResult] = useState<any>(null);
  const [copiedPassword, setCopiedPassword] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const generateRandomPassword = () => {
    const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let p = "Partner@";
    for (let i = 0; i < 4; i++) {
      p += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return p + "!";
  };

  const [createForm, setCreateForm] = useState({
    name: "",
    orgType: "RESELLER_ACADEMY",
    contactPersonName: "",
    contactEmail: "",
    contactPhone: "",
    initialPassword: "Partner@2026!",
    sendInviteEmail: true,
    // Optional Advanced Fields
    legalName: "",
    billingEmail: "",
    taxId: "",
    defaultCurrency: "USD",
    paymentTermsDays: 30,
    isAuthorizedReseller: true,
    showSponsorOnCertificate: true,
    sponsorDisplayName: "",
    allowedEmailDomains: "",
  });

  // Delete Organization Modal State
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [orgToDelete, setOrgToDelete] = useState<OrganizationItem | null>(null);
  const [confirmDeleteEmail, setConfirmDeleteEmail] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const handleOpenDeleteModal = (org: OrganizationItem) => {
    setOrgToDelete(org);
    setConfirmDeleteEmail("");
    setDeleteError(null);
    setIsDeleteModalOpen(true);
  };

  const handleDeleteSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!orgToDelete) return;
    try {
      setIsDeleting(true);
      setDeleteError(null);
      await apiDelete(`/admin/organizations/${orgToDelete.id}`, {
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmEmail: confirmDeleteEmail.trim() }),
      });
      toast.success(`Organization "${orgToDelete.name}" permanently deleted.`, "Organization Deleted");
      setIsDeleteModalOpen(false);
      setOrgToDelete(null);
      fetchOrganizations();
    } catch (err: any) {
      setDeleteError(err?.message || "Failed to delete organization");
    } finally {
      setIsDeleting(false);
    }
  };

  const fetchOrganizations = async () => {
    if (!isPlatformAdmin) return;
    try {
      setIsLoading(true);
      const queryParams = new URLSearchParams({
        page: String(page),
        limit: String(pageSize),
      });
      if (search.trim()) queryParams.set("search", search.trim());
      if (statusFilter !== "ALL") queryParams.set("status", statusFilter);
      if (typeFilter !== "ALL") queryParams.set("orgType", typeFilter);

      const res = await apiGet<{
        items: OrganizationItem[];
        total: number;
        page: number;
        totalPages: number;
      }>(`/admin/organizations?${queryParams.toString()}`);

      setOrganizations(res.items || []);
      setTotalCount(res.total || 0);
    } catch (e: any) {
      console.error("Failed to load organizations", e);
      toast.error(e?.message || "Failed to load organizations", "Error");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const delay = setTimeout(() => {
      fetchOrganizations();
    }, 250);
    return () => clearTimeout(delay);
  }, [page, search, statusFilter, typeFilter]);

  const handleCreateSubmit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      setIsSubmitting(true);
      const domains = createForm.allowedEmailDomains
        .split(",")
        .map((d) => d.trim())
        .filter(Boolean);

      const res = await apiPost<any>("/admin/organizations", {
        ...createForm,
        billingEmail: createForm.billingEmail.trim() || createForm.contactEmail.trim(),
        allowedEmailDomains: domains,
        paymentTermsDays: Number(createForm.paymentTermsDays) || 30,
      });

      toast.success(`Organization "${createForm.name}" created successfully.`, "Success");
      setCreatedResult(res);
      fetchOrganizations();
    } catch (err: any) {
      toast.error(err.message || "Failed to create organization", "Creation Failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCloseCreateModal = () => {
    setIsCreateModalOpen(false);
    setCreatedResult(null);
    setCopiedPassword(false);
    setCopiedLink(false);
    setCreateForm({
      name: "",
      orgType: "RESELLER_ACADEMY",
      contactPersonName: "",
      contactEmail: "",
      contactPhone: "",
      initialPassword: "Partner@2026!",
      sendInviteEmail: true,
      legalName: "",
      billingEmail: "",
      taxId: "",
      defaultCurrency: "USD",
      paymentTermsDays: 30,
      isAuthorizedReseller: true,
      showSponsorOnCertificate: true,
      sponsorDisplayName: "",
      allowedEmailDomains: "",
    });
  };

  // Roll-up metrics for top KPI cards
  const totalSlotsLicensed = organizations.reduce((sum, o) => sum + o.totalSlots, 0);
  const totalSlotsUtilized = organizations.reduce((sum, o) => sum + (o.assignedSlots + o.consumedSlots), 0);
  const totalActiveBatches = organizations.reduce((sum, o) => sum + o.activeBatchesCount, 0);

  if (!mounted) {
    return (
      <div className={styles.dashboardContainer}>
        <div style={{ padding: "4rem 2rem", textAlign: "center", color: "var(--text-muted, #64748b)" }}>
          <p style={{ fontWeight: 600, fontSize: "1rem" }}>Loading organizations...</p>
        </div>
      </div>
    );
  }

  if (!isPlatformAdmin) {
    if (orgId) {
      return (
        <div className={styles.dashboardContainer}>
          <div style={{ padding: "4rem 2rem", textAlign: "center", color: "var(--text-muted, #64748b)" }}>
            <p style={{ fontWeight: 600, fontSize: "1rem" }}>Redirecting to your organization workspace...</p>
          </div>
        </div>
      );
    }
    return (
      <div className={styles.dashboardContainer}>
        <div style={{ maxWidth: 560, margin: "4rem auto", textAlign: "center" }}>
          <EmptyState
            icon="Building"
            title="You are not part of an organization"
            description="Your account is not currently linked to an active organization workspace. If your organization was recently deleted or you require partner access, please contact WhatBoutMe administration."
            actionLabel="Return to Home"
            actionHref="/"
          />
          <div style={{ marginTop: "1rem" }}>
            <button
              type="button"
              className={styles.secondaryBtn}
              onClick={() => {
                localStorage.clear();
                window.location.href = "/login";
              }}
            >
              Sign Out / Switch Account
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.dashboardContainer} style={{ gap: "1.25rem" }}>
      {/* Top Header */}
      <header
        className={styles.header}
        style={{
          margin: 0,
          alignItems: "center",
          display: "flex",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "1rem",
        }}
      >
        <div className={styles.headerText}>
          <h1 className={styles.title} style={{ margin: 0 }}>
            Organizations
          </h1>
        </div>
        <div className={styles.headerActions}>
          <button
            type="button"
            className={styles.primaryBtn}
            onClick={() => setIsCreateModalOpen(true)}
          >
            <span>+ Create Organization</span>
          </button>
        </div>
      </header>

      {/* Top KPI Summary Cards */}
      <section className={styles.kpiGrid} aria-label="Key Performance Indicators">
        <div className={styles.kpiCard}>
          <div className={styles.kpiTopRow}>
            <span className={styles.kpiLabel}>Total Organizations</span>
            <div className={styles.kpiIconBox}>
              <BuildingIcon size={16} />
            </div>
          </div>
          <div className={styles.kpiValueRow}>
            <span className={styles.kpiValue}>{totalCount}</span>
          </div>
        </div>

        <div className={styles.kpiCard}>
          <div className={styles.kpiTopRow}>
            <span className={styles.kpiLabel}>Licensed Batch Slots</span>
            <div className={styles.kpiIconBox}>
              <LayersIcon size={16} />
            </div>
          </div>
          <div className={styles.kpiValueRow}>
            <span className={styles.kpiValue}>{totalSlotsLicensed}</span>
          </div>
        </div>

        <div className={styles.kpiCard}>
          <div className={styles.kpiTopRow}>
            <span className={styles.kpiLabel}>Seat Utilization</span>
            <div className={styles.kpiIconBox}>
              <PercentIcon size={16} />
            </div>
          </div>
          <div className={styles.kpiValueRow}>
            <span className={styles.kpiValue}>
              {totalSlotsLicensed > 0
                ? `${Math.round((totalSlotsUtilized / totalSlotsLicensed) * 100)}%`
                : "0%"}
            </span>
          </div>
        </div>

        <div className={styles.kpiCard}>
          <div className={styles.kpiTopRow}>
            <span className={styles.kpiLabel}>Active Cohort Batches</span>
            <div className={styles.kpiIconBox}>
              <CalendarIcon size={16} />
            </div>
          </div>
          <div className={styles.kpiValueRow}>
            <span className={styles.kpiValue}>{totalActiveBatches}</span>
          </div>
        </div>
      </section>

      {/* Table Section */}
      <section className={styles.tableSection}>
        <div
          className={styles.sectionHeader}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "0.6rem",
          }}
        >
          {/* Left: Search Bar */}
          <div
            className={styles.searchContainer}
            style={{ minWidth: "220px", flex: "1 1 240px", maxWidth: "340px" }}
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
              style={{
                color: "var(--text-muted)",
                flexShrink: 0,
                marginRight: "0.4rem",
              }}
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              placeholder="Search by name, org code, email..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className={styles.searchInput}
            />
          </div>

          {/* Right: Type Filter & Status Filter & Reset */}
          <div
            style={{
              display: "flex",
              gap: "0.65rem",
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <CustomSelect
              options={ORG_TYPES}
              value={typeFilter}
              onChange={(val) => {
                setTypeFilter(val);
                setPage(1);
              }}
              placeholder="Filter by Type"
              minWidth="175px"
              ariaLabel="Filter organizations by type"
            />
            <CustomSelect
              options={ORG_STATUSES}
              value={statusFilter}
              onChange={(val) => {
                setStatusFilter(val);
                setPage(1);
              }}
              placeholder="Filter by Status"
              minWidth="140px"
              ariaLabel="Filter organizations by status"
            />
            {(search || typeFilter !== "ALL" || statusFilter !== "ALL") && (
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  setTypeFilter("ALL");
                  setStatusFilter("ALL");
                  setPage(1);
                }}
                className={styles.secondaryBtn}
                style={{
                  padding: "0.4rem 0.75rem",
                  fontSize: "0.78rem",
                  height: "36px",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.35rem",
                }}
                title="Reset all filters"
              >
                <RefreshCwIcon size={12} />
                <span>Reset</span>
              </button>
            )}
          </div>
        </div>

        <div className={styles.tableWrapper}>
          <table className={styles.adminTable}>
            <thead>
              <tr>
                <th>Organization</th>
                <th>Primary Contact</th>
                <th>Licensed Slots</th>
                <th>Batches</th>
                <th>Institutional Billing</th>
                <th>Status</th>
                <th style={{ textAlign: "right" }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <TableSkeleton rows={5} columns={7} />
              ) : organizations.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: "3rem 1.5rem" }}>
                    <EmptyState
                      title="No organizations found"
                      description="Create your first organization or reseller partnership to license batch slots."
                      actionLabel="+ Create Organization"
                      onAction={() => setIsCreateModalOpen(true)}
                    />
                  </td>
                </tr>
              ) : (
                organizations.map((org) => {
                  const utilization =
                    org.totalSlots > 0
                      ? Math.round(((org.assignedSlots + org.consumedSlots) / org.totalSlots) * 100)
                      : 0;
                  const formattedType = (org.orgType || "CORPORATE")
                    .toLowerCase()
                    .replace(/_/g, " ")
                    .replace(/\b\w/g, (c) => c.toUpperCase());

                  return (
                    <tr key={org.id}>
                      {/* Organization Name & Details */}
                      <td>
                        <div>
                          <Link
                            href={`/users/organizations/${org.id}`}
                            style={{
                              fontWeight: 600,
                              color: "var(--accent-primary, #c97a1e)",
                              textDecoration: "none",
                              fontSize: "0.88rem",
                            }}
                          >
                            {org.name}
                          </Link>
                          <div style={{ fontSize: "0.75rem", color: "var(--text-muted, #64748b)", marginTop: "2px" }}>
                            {org.orgCode} &bull; {formattedType}
                          </div>
                        </div>
                      </td>

                      {/* Primary Contact Person */}
                      <td>
                        <div style={{ fontWeight: 600, color: "var(--text-primary)", fontSize: "0.85rem" }}>
                          {org.contactPersonName || "—"}
                        </div>
                        <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                          {org.contactEmail}
                        </div>
                      </td>

                      {/* Licensed Slots */}
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          <span style={{ fontWeight: 600, color: "var(--text-primary)", fontSize: "0.85rem" }}>
                            {org.totalSlots > 0 ? `${org.assignedSlots + org.consumedSlots} / ${org.totalSlots} seats` : "0 seats"}
                          </span>
                          {org.totalSlots > 0 && (
                            <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: 500 }}>
                              ({utilization}%)
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Active Batches */}
                      <td>
                        <span style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                          {org.activeBatchesCount > 0
                            ? `${org.activeBatchesCount} ${org.activeBatchesCount === 1 ? "batch" : "batches"}`
                            : "—"}
                        </span>
                      </td>

                      {/* Institutional Billing / Revenue */}
                      <td>
                        <span style={{ fontWeight: 600, color: "var(--text-primary)", fontSize: "0.85rem" }}>
                          {org.defaultCurrency}{" "}
                          {(org.revenueByCurrency?.[org.defaultCurrency] || 0).toLocaleString()}
                        </span>
                      </td>

                      {/* Status Badge */}
                      <td>
                        <StatusBadge status={org.status} />
                      </td>

                      {/* Action */}
                      <td style={{ textAlign: "right" }}>
                        <div style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem", justifyContent: "flex-end" }}>
                          <Link
                            href={`/users/organizations/${org.id}`}
                            className={styles.secondaryBtn}
                            style={{
                              padding: "0.32rem 0.7rem",
                              fontSize: "0.78rem",
                              fontWeight: 600,
                              textDecoration: "none",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "4px",
                              whiteSpace: "nowrap",
                            }}
                          >
                            <span>View Details</span>
                            <span>&rarr;</span>
                          </Link>
                          <ActionMenu
                            items={[
                              {
                                label: "Delete Organization",
                                icon: <TrashIcon size={14} />,
                                danger: true,
                                onClick: () => handleOpenDeleteModal(org),
                              },
                            ]}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {totalCount > pageSize && (
          <div style={{ padding: "12px 0 0", borderTop: "1px solid var(--border-light)" }}>
            <Pagination
              currentPage={page}
              totalItems={totalCount}
              pageSize={pageSize}
              onPageChange={(p) => setPage(p)}
              pageSizeOptions={[10, 20, 50]}
              itemLabel="organizations"
            />
          </div>
        )}
      </section>

      {/* Create Organization Modal */}
      <Modal
        isOpen={isCreateModalOpen}
        onClose={handleCloseCreateModal}
        maxWidth="620px"
        title={createdResult ? "Organization Created & Credentials Ready" : "Create New Organization"}
      >
        {createdResult ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "16px", padding: "4px 0" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
                background: "#f0fdf4",
                border: "1px solid #bbf7d0",
                padding: "12px 16px",
                borderRadius: "8px",
              }}
            >
              <div
                style={{
                  width: "36px",
                  height: "36px",
                  borderRadius: "50%",
                  background: "#16a34a",
                  color: "#ffffff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <CheckIcon size={20} />
              </div>
              <div>
                <h4 style={{ margin: 0, fontSize: "0.95rem", fontWeight: 700, color: "#166534" }}>
                  {createdResult.name} ({createdResult.orgCode}) Created
                </h4>
                <p style={{ margin: "2px 0 0", fontSize: "0.82rem", color: "#15803d" }}>
                  {createdResult.resetUrl
                    ? `Welcome email with password setup link sent to ${createdResult.ownerEmail || createdResult.contactEmail}.`
                    : "Organization account is active."}
                </p>
              </div>
            </div>

            <div
              style={{
                background: "var(--bg-soft, #f8fafc)",
                border: "1px solid var(--border-light, #e2e8f0)",
                borderRadius: "8px",
                padding: "14px 16px",
                display: "flex",
                flexDirection: "column",
                gap: "12px",
              }}
            >
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "0.75rem",
                    fontWeight: 600,
                    color: "var(--text-secondary, #64748b)",
                    textTransform: "uppercase",
                    letterSpacing: "0.03em",
                  }}
                >
                  Partner Sign-In Email
                </label>
                <div style={{ fontSize: "0.95rem", fontWeight: 600, color: "var(--text-primary, #0f172a)", marginTop: "2px" }}>
                  {createdResult.ownerEmail || createdResult.contactEmail}
                </div>
              </div>

              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <label
                    style={{
                      fontSize: "0.75rem",
                      fontWeight: 600,
                      color: "var(--text-secondary, #64748b)",
                      textTransform: "uppercase",
                      letterSpacing: "0.03em",
                    }}
                  >
                    Initial Temporary Password
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(createdResult.temporaryPassword || "");
                      setCopiedPassword(true);
                      setTimeout(() => setCopiedPassword(false), 2000);
                    }}
                    style={{
                      background: "none",
                      border: "none",
                      color: "var(--accent-primary, #c97a1e)",
                      fontSize: "0.78rem",
                      fontWeight: 600,
                      cursor: "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "4px",
                    }}
                  >
                    {copiedPassword ? (
                      <>
                        <CheckIcon size={12} />
                        <span>Copied</span>
                      </>
                    ) : (
                      <>
                        <CopyIcon size={12} />
                        <span>Copy Password</span>
                      </>
                    )}
                  </button>
                </div>
                <div
                  style={{
                    fontFamily: "monospace",
                    fontSize: "0.95rem",
                    fontWeight: 700,
                    color: "#334155",
                    background: "#ffffff",
                    padding: "6px 10px",
                    borderRadius: "6px",
                    border: "1px solid #cbd5e1",
                    marginTop: "4px",
                  }}
                >
                  {createdResult.temporaryPassword}
                </div>
              </div>

              {createdResult.resetUrl && (
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <label
                      style={{
                        fontSize: "0.75rem",
                        fontWeight: 600,
                        color: "var(--text-secondary, #64748b)",
                        textTransform: "uppercase",
                        letterSpacing: "0.03em",
                      }}
                    >
                      Direct Password Setup Link
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(createdResult.resetUrl || "");
                        setCopiedLink(true);
                        setTimeout(() => setCopiedLink(false), 2000);
                      }}
                      style={{
                        background: "none",
                        border: "none",
                        color: "var(--accent-primary, #c97a1e)",
                        fontSize: "0.78rem",
                        fontWeight: 600,
                        cursor: "pointer",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "4px",
                      }}
                    >
                      {copiedLink ? (
                        <>
                          <CheckIcon size={12} />
                          <span>Copied</span>
                        </>
                      ) : (
                        <>
                          <CopyIcon size={12} />
                          <span>Copy Link</span>
                        </>
                      )}
                    </button>
                  </div>
                  <div
                    style={{
                      fontSize: "0.78rem",
                      color: "#475569",
                      background: "#ffffff",
                      padding: "6px 10px",
                      borderRadius: "6px",
                      border: "1px solid #cbd5e1",
                      marginTop: "4px",
                      wordBreak: "break-all",
                    }}
                  >
                    {createdResult.resetUrl}
                  </div>
                </div>
              )}
            </div>

            <div className={styles.modalFooter} style={{ padding: "0.5rem 0 0", marginTop: "0.5rem" }}>
              <button
                type="button"
                className={styles.secondaryBtn}
                onClick={handleCloseCreateModal}
              >
                Close
              </button>
              <Link
                href={`/users/organizations/${createdResult.id}`}
                className={styles.primaryBtn}
                style={{ textDecoration: "none" }}
              >
                <span>Open Workspace &rarr;</span>
              </Link>
            </div>
          </div>
        ) : (
          <form className={styles.modalForm} onSubmit={handleCreateSubmit} style={{ padding: 0 }}>
            <div className={styles.formGroup}>
              <label>
                Organization / Company Name <span style={{ color: "var(--accent-primary, #c97a1e)" }}>*</span>
              </label>
              <input
                type="text"
                required
                value={createForm.name}
                onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
              />
            </div>

            <div className={styles.formRow}>
              <div className={styles.formGroup}>
                <label>Organization Type</label>
                <CustomSelect
                  value={createForm.orgType}
                  onChange={(val) => setCreateForm({ ...createForm, orgType: val })}
                  options={[
                    { value: "RESELLER_ACADEMY", label: "Reseller Academy / Training Partner" },
                    { value: "CORPORATE", label: "Corporate Enterprise" },
                    { value: "SCHOOL", label: "K-12 School" },
                    { value: "UNIVERSITY", label: "University / Higher Ed" },
                    { value: "CLINIC", label: "Clinic / Healthcare" },
                    { value: "NGO", label: "NGO / Non-Profit" },
                    { value: "GOVERNMENT", label: "Government Agency" },
                  ]}
                  fullWidth
                  ariaLabel="Organization Type"
                />
              </div>

              <div className={styles.formGroup}>
                <label>
                  Contact Person Name <span style={{ color: "var(--accent-primary, #c97a1e)" }}>*</span>
                </label>
                <input
                  type="text"
                  required
                  value={createForm.contactPersonName}
                  onChange={(e) => setCreateForm({ ...createForm, contactPersonName: e.target.value })}
                />
              </div>
            </div>

            <div className={styles.formGroup}>
              <label>
                Organization Email Address <span style={{ color: "var(--accent-primary, #c97a1e)" }}>*</span>
              </label>
              <input
                type="email"
                required
                value={createForm.contactEmail}
                onChange={(e) => setCreateForm({ ...createForm, contactEmail: e.target.value })}
              />
              <span style={{ fontSize: "0.75rem", color: "var(--text-muted, #64748b)", marginTop: "2px" }}>
                Used for sign-in, partner portal admin access, and billing notifications.
              </span>
            </div>

            {/* Initial Password & Invite Mode */}
            <div
              style={{
                background: "#faf7f2",
                border: "1px solid #e7decb",
                borderRadius: "8px",
                padding: "14px 16px",
                display: "flex",
                flexDirection: "column",
                gap: "12px",
              }}
            >
              <div className={styles.formGroup}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                  <label style={{ margin: 0 }}>Initial Temporary Password</label>
                  <button
                    type="button"
                    onClick={() => setCreateForm({ ...createForm, initialPassword: generateRandomPassword() })}
                    className={styles.secondaryBtn}
                    style={{
                      padding: "3px 8px",
                      fontSize: "0.76rem",
                      gap: "4px",
                      display: "inline-flex",
                      alignItems: "center",
                    }}
                  >
                    <RefreshCwIcon size={12} />
                    <span>Generate New</span>
                  </button>
                </div>
                <div style={{ position: "relative" }}>
                  <input
                    type={showPasswordText ? "text" : "password"}
                    value={createForm.initialPassword}
                    onChange={(e) => setCreateForm({ ...createForm, initialPassword: e.target.value })}
                    style={{
                      width: "100%",
                      paddingRight: "54px",
                      fontFamily: "monospace",
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPasswordText(!showPasswordText)}
                    style={{
                      position: "absolute",
                      right: "10px",
                      top: "50%",
                      transform: "translateY(-50%)",
                      background: "none",
                      border: "none",
                      color: "var(--text-muted, #64748b)",
                      cursor: "pointer",
                      fontSize: "0.78rem",
                      fontWeight: 600,
                    }}
                  >
                    {showPasswordText ? "Hide" : "Show"}
                  </button>
                </div>
              </div>

              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  fontSize: "0.84rem",
                  cursor: "pointer",
                  color: "var(--text-secondary, #334155)",
                  margin: 0,
                }}
              >
                <input
                  type="checkbox"
                  checked={createForm.sendInviteEmail}
                  onChange={(e) => setCreateForm({ ...createForm, sendInviteEmail: e.target.checked })}
                  style={{ accentColor: "var(--accent-primary, #c97a1e)", cursor: "pointer" }}
                />
                <span style={{ fontWeight: 600 }}>Send welcome email with password reset link to this email</span>
              </label>
            </div>

            <div className={styles.modalFooter} style={{ padding: "1rem 0 0", marginTop: "0.5rem", borderTop: "1px solid var(--border-light, #e2e8f0)" }}>
              <button
                type="button"
                className={styles.secondaryBtn}
                onClick={handleCloseCreateModal}
                disabled={isSubmitting}
              >
                Cancel
              </button>
              <button
                type="submit"
                className={styles.primaryBtn}
                disabled={isSubmitting}
              >
                {isSubmitting ? "Creating & Sending Invite..." : "Create Organization & Send Invite"}
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={isDeleteModalOpen}
        onClose={() => {
          if (isDeleting) return;
          setIsDeleteModalOpen(false);
          setOrgToDelete(null);
        }}
        title={`Delete Organization — ${orgToDelete?.name || ""}`}
      >
        {orgToDelete && (
          <form onSubmit={handleDeleteSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <div
              style={{
                padding: "14px 16px",
                borderRadius: "8px",
                background: "#fef2f2",
                border: "1px solid #fecaca",
                color: "#991b1b",
                fontSize: "0.85rem",
                lineHeight: "1.5",
              }}
            >
              <div style={{ fontWeight: 700, marginBottom: "4px", display: "flex", alignItems: "center", gap: "6px" }}>
                <AlertTriangleIcon size={16} style={{ color: "#dc2626" }} />
                <span>High-Risk Destructive Action</span>
              </div>
              Permanently deletes <strong>{orgToDelete.name}</strong> ({orgToDelete.orgCode}). All associated batch seat pools, prepaid vouchers, department seat allocations, and staff memberships will be permanently deleted.
            </div>

            <div style={{ padding: "12px 14px", background: "#f8fafc", borderRadius: "8px", border: "1px solid #e2e8f0", fontSize: "0.83rem" }}>
              <div style={{ color: "#64748b", marginBottom: "4px" }}>Organization Registered Email:</div>
              <code style={{ fontSize: "0.95rem", fontWeight: 700, color: "#0f172a", wordBreak: "break-all" }}>
                {orgToDelete.billingEmail || orgToDelete.contactEmail}
              </code>
            </div>

            <div className={styles.formGroup}>
              <label>
                To confirm deletion, please type this organization's email address below:
              </label>
              <input
                type="email"
                required
                autoFocus
                placeholder={orgToDelete.billingEmail || orgToDelete.contactEmail}
                value={confirmDeleteEmail}
                onChange={(e) => setConfirmDeleteEmail(e.target.value)}
              />
            </div>

            {deleteError && (
              <p style={{ margin: 0, padding: "8px 12px", background: "#fef2f2", color: "#dc2626", borderRadius: "6px", fontSize: "0.82rem" }}>
                {deleteError}
              </p>
            )}

            <div className={styles.modalFooter} style={{ padding: "0.5rem 0 0", marginTop: "0.5rem", borderTop: "1px solid var(--border-light, #e2e8f0)" }}>
              <button
                type="button"
                className={styles.secondaryBtn}
                onClick={() => {
                  setIsDeleteModalOpen(false);
                  setOrgToDelete(null);
                }}
                disabled={isDeleting}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={
                  isDeleting ||
                  (confirmDeleteEmail.trim().toLowerCase() !== (orgToDelete.billingEmail || "").trim().toLowerCase() &&
                   confirmDeleteEmail.trim().toLowerCase() !== (orgToDelete.contactEmail || "").trim().toLowerCase())
                }
                style={{
                  padding: "8px 20px",
                  borderRadius: "8px",
                  border: "none",
                  background: "#dc2626",
                  color: "#ffffff",
                  fontWeight: 600,
                  fontSize: "0.85rem",
                  cursor:
                    isDeleting ||
                    (confirmDeleteEmail.trim().toLowerCase() !== (orgToDelete.billingEmail || "").trim().toLowerCase() &&
                     confirmDeleteEmail.trim().toLowerCase() !== (orgToDelete.contactEmail || "").trim().toLowerCase())
                      ? "not-allowed"
                      : "pointer",
                  opacity:
                    isDeleting ||
                    (confirmDeleteEmail.trim().toLowerCase() !== (orgToDelete.billingEmail || "").trim().toLowerCase() &&
                     confirmDeleteEmail.trim().toLowerCase() !== (orgToDelete.contactEmail || "").trim().toLowerCase())
                      ? 0.5
                      : 1,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                {isDeleting ? "Deleting..." : "Permanently Delete Organization"}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
