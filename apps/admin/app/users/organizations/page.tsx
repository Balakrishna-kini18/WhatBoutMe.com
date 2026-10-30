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
} from "../../components";
import { apiGet, apiPost, apiDelete } from "../../lib/api";
import VolumePricingModal, { VolumePricingConfig } from "./components/VolumePricingModal";

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
  const [pricingConfig, setPricingConfig] = useState<VolumePricingConfig>({
    enabled: true,
    tiers: [
      { minSeats: 10, discountPercent: 10, label: "10+ seats" },
      { minSeats: 25, discountPercent: 15, label: "25+ seats" },
      { minSeats: 50, discountPercent: 25, label: "50+ seats" },
    ],
    quickPresets: [10, 25, 50, 100],
    customNote: "Volume discounts: 10+ seats: 10% off • 25+ seats: 15% off • 50+ seats: 25% off",
  });
  const [isPricingModalOpen, setIsPricingModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showAdvancedCreate, setShowAdvancedCreate] = useState(false);
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

      const res = await apiGet<{
        items: OrganizationItem[];
        total: number;
        page: number;
        totalPages: number;
      }>(`/admin/organizations?${queryParams.toString()}`);

      let filteredItems = res.items || [];
      if (typeFilter !== "ALL") {
        filteredItems = filteredItems.filter((o) => o.orgType === typeFilter);
      }

      setOrganizations(filteredItems);
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
    setShowAdvancedCreate(false);
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
      <div className={styles.dashboard}>
        <div style={{ padding: "4rem 2rem", textAlign: "center", color: "#64748b" }}>
          <p style={{ fontWeight: 600, fontSize: "1rem" }}>Loading organizations...</p>
        </div>
      </div>
    );
  }

  if (!isPlatformAdmin) {
    if (orgId) {
      return (
        <div className={styles.dashboard}>
          <div style={{ padding: "4rem 2rem", textAlign: "center", color: "#64748b" }}>
            <p style={{ fontWeight: 600, fontSize: "1rem" }}>Redirecting to your organization workspace...</p>
          </div>
        </div>
      );
    }
    return (
      <div className={styles.dashboard}>
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
    <div className={styles.dashboard}>
      {/* Top Header */}
      <header className={styles.header}>
        <div className={styles.headerText}>
          <h1 className={styles.title}>Users & Enrolments</h1>
          <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: "0.88rem" }}>
            Institutional B2B buyers, reseller academies, batch slot capacity pools & co-branded sponsorship.
          </p>
        </div>
        <div className={styles.headerActions} style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          {isPlatformAdmin && (
            <button
              type="button"
              onClick={() => setIsPricingModalOpen(true)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                background: "#fef3c7",
                color: "#92400e",
                border: "1px solid #fde68a",
                padding: "8px 16px",
                borderRadius: "8px",
                fontWeight: 700,
                fontSize: "0.85rem",
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
              title="Configure dynamic volume discount tiers and offers"
            >
              <span>⚙️ Pricing &amp; Volume Offers</span>
            </button>
          )}
          <button
            type="button"
            className={styles.primaryBtn}
            onClick={() => setIsCreateModalOpen(true)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              background: "#c97a1e",
              color: "#ffffff",
              border: "none",
              padding: "8px 16px",
              borderRadius: "8px",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            <span>+ Create Organization</span>
          </button>
        </div>
      </header>

      {/* Segmented Switch: People vs Organizations */}
      <div
        style={{
          display: "flex",
          gap: "6px",
          background: "#e2e8f0",
          padding: "4px",
          borderRadius: "10px",
          width: "fit-content",
          marginBottom: "1.25rem",
        }}
      >
        <Link
          href="/users"
          style={{
            padding: "6px 16px",
            fontSize: "0.85rem",
            fontWeight: 500,
            borderRadius: "7px",
            background: "transparent",
            color: "#475569",
            textDecoration: "none",
            transition: "all 0.15s ease",
          }}
        >
          People (Learners & Staff)
        </Link>
        <Link
          href="/users/organizations"
          style={{
            padding: "6px 16px",
            fontSize: "0.85rem",
            fontWeight: 700,
            borderRadius: "7px",
            background: "#ffffff",
            color: "#0f172a",
            boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
            textDecoration: "none",
          }}
        >
          Organizations & Resellers
        </Link>
      </div>

      {/* Top KPI Summary Cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: "1rem",
          marginBottom: "1.5rem",
        }}
      >
        <div
          style={{
            background: "#ffffff",
            border: "1px solid #e2e8f0",
            borderRadius: "12px",
            padding: "1rem 1.25rem",
            boxShadow: "0 1px 2px rgba(0,0,0,0.03)",
          }}
        >
          <div style={{ fontSize: "0.8rem", fontWeight: 600, color: "#64748b", textTransform: "uppercase" }}>
            Total Organizations
          </div>
          <div style={{ fontSize: "1.75rem", fontWeight: 700, color: "#0f172a", marginTop: "4px" }}>
            {totalCount}
          </div>
          <div style={{ fontSize: "0.8rem", color: "#94a3b8", marginTop: "2px" }}>
            Institutions & reseller partners
          </div>
        </div>

        <div
          style={{
            background: "#ffffff",
            border: "1px solid #e2e8f0",
            borderRadius: "12px",
            padding: "1rem 1.25rem",
            boxShadow: "0 1px 2px rgba(0,0,0,0.03)",
          }}
        >
          <div style={{ fontSize: "0.8rem", fontWeight: 600, color: "#64748b", textTransform: "uppercase" }}>
            Licensed Batch Slots
          </div>
          <div style={{ fontSize: "1.75rem", fontWeight: 700, color: "#c97a1e", marginTop: "4px" }}>
            {totalSlotsLicensed}
          </div>
          <div style={{ fontSize: "0.8rem", color: "#94a3b8", marginTop: "2px" }}>
            Total pre-allocated student seats
          </div>
        </div>

        <div
          style={{
            background: "#ffffff",
            border: "1px solid #e2e8f0",
            borderRadius: "12px",
            padding: "1rem 1.25rem",
            boxShadow: "0 1px 2px rgba(0,0,0,0.03)",
          }}
        >
          <div style={{ fontSize: "0.8rem", fontWeight: 600, color: "#64748b", textTransform: "uppercase" }}>
            Seat Utilization
          </div>
          <div style={{ fontSize: "1.75rem", fontWeight: 700, color: "#16a34a", marginTop: "4px" }}>
            {totalSlotsLicensed > 0
              ? `${Math.round((totalSlotsUtilized / totalSlotsLicensed) * 100)}%`
              : "0%"}
          </div>
          <div style={{ fontSize: "0.8rem", color: "#94a3b8", marginTop: "2px" }}>
            {totalSlotsUtilized} of {totalSlotsLicensed} slots assigned
          </div>
        </div>

        <div
          style={{
            background: "#ffffff",
            border: "1px solid #e2e8f0",
            borderRadius: "12px",
            padding: "1rem 1.25rem",
            boxShadow: "0 1px 2px rgba(0,0,0,0.03)",
          }}
        >
          <div style={{ fontSize: "0.8rem", fontWeight: 600, color: "#64748b", textTransform: "uppercase" }}>
            Active Cohort Batches
          </div>
          <div style={{ fontSize: "1.75rem", fontWeight: 700, color: "#0f172a", marginTop: "4px" }}>
            {totalActiveBatches}
          </div>
          <div style={{ fontSize: "0.8rem", color: "#94a3b8", marginTop: "2px" }}>
            Batches with org reservations
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div
        style={{
          display: "flex",
          gap: "12px",
          alignItems: "center",
          flexWrap: "wrap",
          background: "#ffffff",
          padding: "14px 18px",
          borderRadius: "12px",
          border: "1px solid #e2e8f0",
          marginBottom: "1.25rem",
        }}
      >
        <div style={{ flex: 1, minWidth: "220px" }}>
          <input
            type="text"
            placeholder="Search by name, org code (e.g. WBM-ORG-0001), or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: "100%",
              padding: "8px 14px",
              borderRadius: "8px",
              border: "1px solid #cbd5e1",
              fontSize: "0.9rem",
            }}
          />
        </div>

        <div style={{ width: "200px" }}>
          <CustomSelect
            options={ORG_TYPES}
            value={typeFilter}
            onChange={(val) => setTypeFilter(val)}
            placeholder="Filter by Type"
          />
        </div>

        <div style={{ width: "170px" }}>
          <CustomSelect
            options={ORG_STATUSES}
            value={statusFilter}
            onChange={(val) => setStatusFilter(val)}
            placeholder="Filter by Status"
          />
        </div>
      </div>

      {/* Main Organizations Table */}
      <div
        style={{
          background: "#ffffff",
          borderRadius: "12px",
          border: "1px solid #e2e8f0",
          overflow: "hidden",
          boxShadow: "0 1px 3px rgba(0,0,0,0.02)",
        }}
      >
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "0.88rem" }}>
            <thead>
              <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0", color: "#475569", fontWeight: 600 }}>
                <th style={{ padding: "12px 18px" }}>Organization</th>
                <th style={{ padding: "12px 18px" }}>Type</th>
                <th style={{ padding: "12px 18px" }}>Licensed Slots</th>
                <th style={{ padding: "12px 18px" }}>Batches</th>
                <th style={{ padding: "12px 18px" }}>Institutional Billing</th>
                <th style={{ padding: "12px 18px" }}>Primary Contact</th>
                <th style={{ padding: "12px 18px" }}>Status</th>
                <th style={{ padding: "12px 18px", textAlign: "right" }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <TableSkeleton rows={5} columns={8} />
              ) : organizations.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ padding: "3rem 1.5rem" }}>
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

                  return (
                    <tr
                      key={org.id}
                      style={{
                        borderBottom: "1px solid #f1f5f9",
                        transition: "background 0.15s ease",
                      }}
                      onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "#fafafa")}
                      onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "transparent")}
                    >
                      {/* Name & OrgCode */}
                      <td style={{ padding: "14px 18px" }}>
                        <Link
                          href={`/users/organizations/${org.id}`}
                          style={{ fontWeight: 700, color: "#0f172a", textDecoration: "none", fontSize: "0.95rem" }}
                        >
                          {org.name}
                        </Link>
                        <div style={{ display: "flex", gap: "6px", alignItems: "center", marginTop: "3px" }}>
                          <span
                            style={{
                              fontSize: "0.74rem",
                              fontWeight: 600,
                              color: "#64748b",
                              background: "#f1f5f9",
                              padding: "1px 6px",
                              borderRadius: "4px",
                            }}
                          >
                            {org.orgCode}
                          </span>
                          {org.isAuthorizedReseller && (
                            <span
                              style={{
                                fontSize: "0.72rem",
                                fontWeight: 700,
                                color: "#0284c7",
                                background: "#e0f2fe",
                                padding: "1px 6px",
                                borderRadius: "4px",
                              }}
                            >
                              RESELLER
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Type */}
                      <td style={{ padding: "14px 18px", color: "#334155", fontWeight: 500 }}>
                        {org.orgType.replace(/_/g, " ")}
                      </td>

                      {/* Licensed Slots with visual bar */}
                      <td style={{ padding: "14px 18px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <span style={{ fontWeight: 700, color: "#0f172a" }}>
                            {org.assignedSlots + org.consumedSlots}
                          </span>
                          <span style={{ color: "#94a3b8" }}>/</span>
                          <span style={{ color: "#64748b" }}>{org.totalSlots}</span>
                          <span style={{ fontSize: "0.75rem", color: "#16a34a", fontWeight: 600 }}>
                            ({utilization}%)
                          </span>
                        </div>
                        <div
                          style={{
                            width: "120px",
                            height: "5px",
                            background: "#e2e8f0",
                            borderRadius: "9999px",
                            overflow: "hidden",
                            marginTop: "5px",
                          }}
                        >
                          <div
                            style={{
                              width: `${Math.min(100, utilization)}%`,
                              height: "100%",
                              background: utilization > 80 ? "#16a34a" : "#c97a1e",
                              borderRadius: "9999px",
                            }}
                          />
                        </div>
                        {(org.pendingPaymentCount || 0) > 0 && (
                          <div style={{ marginTop: "6px" }}>
                            <span
                              style={{
                                fontSize: "0.72rem",
                                fontWeight: 700,
                                color: "#b45309",
                                background: "#fef3c7",
                                padding: "2px 7px",
                                borderRadius: "4px",
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "4px",
                              }}
                            >
                              <span>💳</span> {org.pendingSlots} slots pending payment
                            </span>
                          </div>
                        )}
                        {(org.pendingApprovalCount || 0) > 0 && (
                          <div style={{ marginTop: "6px" }}>
                            <span
                              style={{
                                fontSize: "0.72rem",
                                fontWeight: 700,
                                color: "#1d4ed8",
                                background: "#eff6ff",
                                padding: "2px 7px",
                                borderRadius: "4px",
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "4px",
                              }}
                            >
                              <span>⏳</span> {org.pendingSlots} slots pending review
                            </span>
                          </div>
                        )}
                      </td>

                      {/* Active Batches */}
                      <td style={{ padding: "14px 18px", color: "#334155" }}>
                        {org.activeBatchesCount > 0 ? (
                          <span style={{ fontWeight: 600 }}>{org.activeBatchesCount} batches</span>
                        ) : org.pendingBatchNames && org.pendingBatchNames.length > 0 ? (
                          <div>
                            <div style={{ fontWeight: 600, color: "#92400e" }}>{org.pendingBatchNames[0]}</div>
                            <div style={{ fontSize: "0.72rem", color: "#b45309", fontWeight: 500 }}>
                              {(org.pendingPaymentCount || 0) > 0 ? "Awaiting Payment" : "Awaiting Review"}
                            </div>
                          </div>
                        ) : (
                          <span style={{ color: "#94a3b8" }}>No active batch</span>
                        )}
                      </td>

                      {/* Billing / Revenue */}
                      <td style={{ padding: "14px 18px" }}>
                        <div style={{ fontWeight: 600, color: "#0f172a" }}>
                          {org.defaultCurrency}{" "}
                          {(org.revenueByCurrency?.[org.defaultCurrency] || 0).toLocaleString()}
                        </div>
                        <div style={{ fontSize: "0.75rem", color: "#64748b" }}>
                          {org.billingEmail}
                        </div>
                      </td>

                      {/* Contact Person */}
                      <td style={{ padding: "14px 18px" }}>
                        <div style={{ fontWeight: 600, color: "#1e293b" }}>{org.contactPersonName}</div>
                        <div style={{ fontSize: "0.75rem", color: "#64748b" }}>{org.contactEmail}</div>
                      </td>

                      {/* Status Badge */}
                      <td style={{ padding: "14px 18px" }}>
                        <StatusBadge status={org.status} />
                      </td>

                      {/* Action */}
                      <td style={{ padding: "14px 18px", textAlign: "right" }}>
                        <div style={{ display: "inline-flex", alignItems: "center", gap: "8px", justifyContent: "flex-end" }}>
                          <Link
                            href={`/users/organizations/${org.id}`}
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "5px",
                              padding: "6px 14px",
                              borderRadius: "6px",
                              background: (org.pendingApprovalCount || 0) > 0
                                ? "#16a34a"
                                : (org.pendingPaymentCount || 0) > 0
                                  ? "#c97a1e"
                                  : "#f1f5f9",
                              color: ((org.pendingApprovalCount || 0) > 0 || (org.pendingPaymentCount || 0) > 0)
                                ? "#ffffff"
                                : "#0f172a",
                              fontWeight: 600,
                              fontSize: "0.82rem",
                              textDecoration: "none",
                              border: "1px solid #cbd5e1",
                              transition: "all 0.15s ease",
                            }}
                          >
                            {(org.pendingApprovalCount || 0) > 0
                              ? "Review Request →"
                              : (org.pendingPaymentCount || 0) > 0
                                ? "View Workspace (Payment Pending) →"
                                : "Workspace →"}
                          </Link>
                          <button
                            type="button"
                            onClick={() => handleOpenDeleteModal(org)}
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "4px",
                              padding: "6px 12px",
                              borderRadius: "6px",
                              background: "#fff1f2",
                              color: "#e11d48",
                              fontWeight: 600,
                              fontSize: "0.82rem",
                              border: "1px solid #fecdd3",
                              cursor: "pointer",
                              transition: "all 0.15s ease",
                            }}
                            onMouseEnter={(e) => {
                              (e.currentTarget as HTMLElement).style.background = "#e11d48";
                              (e.currentTarget as HTMLElement).style.color = "#ffffff";
                            }}
                            onMouseLeave={(e) => {
                              (e.currentTarget as HTMLElement).style.background = "#fff1f2";
                              (e.currentTarget as HTMLElement).style.color = "#e11d48";
                            }}
                            title={`Delete ${org.name}`}
                          >
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <polyline points="3 6 5 6 21 6" />
                              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                            </svg>
                            Delete
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

        {totalCount > pageSize && (
          <div style={{ padding: "12px 18px", borderTop: "1px solid #e2e8f0" }}>
            <Pagination
              currentPage={page}
              totalItems={totalCount}
              pageSize={pageSize}
              onPageChange={(p) => setPage(p)}
            />
          </div>
        )}
      </div>

      {/* Create Organization Modal */}
      <Modal
        isOpen={isCreateModalOpen}
        onClose={handleCloseCreateModal}
        title={createdResult ? "Organization Created & Credentials Ready" : "Create New Organization"}
      >
        {createdResult ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "16px", padding: "4px 0" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px", background: "#f0fdf4", border: "1px solid #bbf7d0", padding: "12px 16px", borderRadius: "8px" }}>
              <div style={{ width: "36px", height: "36px", borderRadius: "50%", background: "#22c55e", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <div>
                <h4 style={{ margin: 0, fontSize: "0.95rem", fontWeight: 700, color: "#166534" }}>
                  {createdResult.name} ({createdResult.orgCode}) Created!
                </h4>
                <p style={{ margin: "2px 0 0", fontSize: "0.82rem", color: "#15803d" }}>
                  {createdResult.resetUrl
                    ? `Welcome email with 1-click password setup link sent to ${createdResult.ownerEmail || createdResult.contactEmail}.`
                    : "Organization account is active."}
                </p>
              </div>
            </div>

            <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "8px", padding: "14px 16px", display: "flex", flexDirection: "column", gap: "12px" }}>
              <div>
                <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.03em" }}>
                  Partner Sign-In Email
                </label>
                <div style={{ fontSize: "0.95rem", fontWeight: 600, color: "#0f172a", marginTop: "2px" }}>
                  {createdResult.ownerEmail || createdResult.contactEmail}
                </div>
              </div>

              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <label style={{ fontSize: "0.75rem", fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.03em" }}>
                    Initial Temporary Password
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(createdResult.temporaryPassword || "");
                      setCopiedPassword(true);
                      setTimeout(() => setCopiedPassword(false), 2000);
                    }}
                    style={{ background: "none", border: "none", color: "#c97a1e", fontSize: "0.78rem", fontWeight: 600, cursor: "pointer" }}
                  >
                    {copiedPassword ? "✓ Copied!" : "📋 Copy Password"}
                  </button>
                </div>
                <div style={{ fontFamily: "monospace", fontSize: "0.95rem", fontWeight: 700, color: "#334155", background: "#ffffff", padding: "6px 10px", borderRadius: "6px", border: "1px solid #cbd5e1", marginTop: "4px" }}>
                  {createdResult.temporaryPassword}
                </div>
              </div>

              {createdResult.resetUrl && (
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <label style={{ fontSize: "0.75rem", fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.03em" }}>
                      Direct Password Reset / Setup Link
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(createdResult.resetUrl || "");
                        setCopiedLink(true);
                        setTimeout(() => setCopiedLink(false), 2000);
                      }}
                      style={{ background: "none", border: "none", color: "#c97a1e", fontSize: "0.78rem", fontWeight: 600, cursor: "pointer" }}
                    >
                      {copiedLink ? "✓ Copied!" : "📋 Copy Link"}
                    </button>
                  </div>
                  <div style={{ fontSize: "0.78rem", color: "#475569", background: "#ffffff", padding: "6px 10px", borderRadius: "6px", border: "1px solid #cbd5e1", marginTop: "4px", wordBreak: "break-all" }}>
                    {createdResult.resetUrl}
                  </div>
                </div>
              )}
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "6px" }}>
              <button
                type="button"
                onClick={handleCloseCreateModal}
                style={{
                  padding: "8px 16px",
                  borderRadius: "6px",
                  border: "1px solid #cbd5e1",
                  background: "#ffffff",
                  color: "#475569",
                  fontWeight: 600,
                  fontSize: "0.85rem",
                  cursor: "pointer",
                }}
              >
                Close
              </button>
              <Link
                href={`/users/organizations/${createdResult.id}`}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "8px 18px",
                  borderRadius: "6px",
                  background: "#c97a1e",
                  color: "#ffffff",
                  fontWeight: 600,
                  fontSize: "0.85rem",
                  textDecoration: "none",
                }}
              >
                Open Workspace &rarr;
              </Link>
            </div>
          </div>
        ) : (
          <form onSubmit={handleCreateSubmit} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            <div>
              <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, color: "#1e293b", marginBottom: "4px" }}>
                Organization / Company Name *
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Apna College or Bright Minds Academy"
                value={createForm.name}
                onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                style={{ width: "100%", padding: "9px 12px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "0.9rem" }}
              />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              <div>
                <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, color: "#1e293b", marginBottom: "4px" }}>
                  Organization Type
                </label>
                <select
                  value={createForm.orgType}
                  onChange={(e) => setCreateForm({ ...createForm, orgType: e.target.value })}
                  style={{ width: "100%", padding: "9px 12px", borderRadius: "6px", border: "1px solid #cbd5e1", background: "#fff", fontSize: "0.88rem" }}
                >
                  <option value="RESELLER_ACADEMY">Reseller Academy / Training Partner</option>
                  <option value="CORPORATE">Corporate Enterprise</option>
                  <option value="SCHOOL">K-12 School</option>
                  <option value="UNIVERSITY">University / Higher Ed</option>
                  <option value="CLINIC">Clinic / Healthcare</option>
                  <option value="NGO">NGO / Non-Profit</option>
                  <option value="GOVERNMENT">Government Agency</option>
                </select>
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, color: "#1e293b", marginBottom: "4px" }}>
                  Partner Contact Person *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Pryanch"
                  value={createForm.contactPersonName}
                  onChange={(e) => setCreateForm({ ...createForm, contactPersonName: e.target.value })}
                  style={{ width: "100%", padding: "9px 12px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "0.9rem" }}
                />
              </div>
            </div>

            <div>
              <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, color: "#1e293b", marginBottom: "4px" }}>
                Organization Email Address *
              </label>
              <input
                type="email"
                required
                placeholder="e.g. partner@apnacollege.com"
                value={createForm.contactEmail}
                onChange={(e) => setCreateForm({ ...createForm, contactEmail: e.target.value })}
                style={{ width: "100%", padding: "9px 12px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "0.9rem" }}
              />
              <span style={{ fontSize: "0.75rem", color: "#64748b", marginTop: "3px", display: "block" }}>
                Used for sign-in, partner portal admin access, and billing notifications.
              </span>
            </div>

            {/* Initial Password & Invite Mode */}
            <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "8px", padding: "12px 14px", display: "flex", flexDirection: "column", gap: "10px" }}>
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                  <label style={{ fontSize: "0.82rem", fontWeight: 600, color: "#1e293b" }}>
                    Initial Temporary Password
                  </label>
                  <button
                    type="button"
                    onClick={() => setCreateForm({ ...createForm, initialPassword: generateRandomPassword() })}
                    style={{ background: "none", border: "none", color: "#c97a1e", fontSize: "0.78rem", fontWeight: 600, cursor: "pointer" }}
                  >
                    🎲 Generate New
                  </button>
                </div>
                <div style={{ position: "relative" }}>
                  <input
                    type={showPasswordText ? "text" : "password"}
                    value={createForm.initialPassword}
                    onChange={(e) => setCreateForm({ ...createForm, initialPassword: e.target.value })}
                    style={{ width: "100%", padding: "8px 40px 8px 12px", borderRadius: "6px", border: "1px solid #cbd5e1", fontFamily: "monospace", fontSize: "0.9rem" }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPasswordText(!showPasswordText)}
                    style={{ position: "absolute", right: "10px", top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "#64748b", cursor: "pointer", fontSize: "0.75rem" }}
                  >
                    {showPasswordText ? "Hide" : "Show"}
                  </button>
                </div>
              </div>

              <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.84rem", cursor: "pointer", color: "#334155" }}>
                <input
                  type="checkbox"
                  checked={createForm.sendInviteEmail}
                  onChange={(e) => setCreateForm({ ...createForm, sendInviteEmail: e.target.checked })}
                />
                <span style={{ fontWeight: 600 }}>Send welcome email with password reset link to this email</span>
              </label>
            </div>

            {/* Optional Advanced Settings Toggle */}
            <div>
              <button
                type="button"
                onClick={() => setShowAdvancedCreate(!showAdvancedCreate)}
                style={{
                  background: "none",
                  border: "none",
                  color: "#64748b",
                  fontSize: "0.8rem",
                  fontWeight: 600,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                  padding: "4px 0",
                }}
              >
                <span>{showAdvancedCreate ? "▾ Hide Advanced Settings" : "▸ Show Advanced Financial & Domain Settings (Optional)"}</span>
              </button>

              {showAdvancedCreate && (
                <div style={{ marginTop: "10px", padding: "12px", background: "#f8fafc", borderRadius: "8px", border: "1px solid #e2e8f0", display: "flex", flexDirection: "column", gap: "10px" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                    <div>
                      <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 600, marginBottom: "3px" }}>
                        Legal Entity Name
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Apna Education Pvt Ltd"
                        value={createForm.legalName}
                        onChange={(e) => setCreateForm({ ...createForm, legalName: e.target.value })}
                        style={{ width: "100%", padding: "7px 10px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "0.85rem" }}
                      />
                    </div>
                    <div>
                      <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 600, marginBottom: "3px" }}>
                        Tax ID / GST / VAT
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. 29AABCU9603R1ZM"
                        value={createForm.taxId}
                        onChange={(e) => setCreateForm({ ...createForm, taxId: e.target.value })}
                        style={{ width: "100%", padding: "7px 10px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "0.85rem" }}
                      />
                    </div>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                    <div>
                      <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 600, marginBottom: "3px" }}>
                        Default Currency
                      </label>
                      <select
                        value={createForm.defaultCurrency}
                        onChange={(e) => setCreateForm({ ...createForm, defaultCurrency: e.target.value })}
                        style={{ width: "100%", padding: "7px 10px", borderRadius: "6px", border: "1px solid #cbd5e1", background: "#fff", fontSize: "0.85rem" }}
                      >
                        <option value="USD">USD ($)</option>
                        <option value="AED">AED (AED)</option>
                        <option value="INR">INR (₹)</option>
                      </select>
                    </div>
                    <div>
                      <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 600, marginBottom: "3px" }}>
                        Separate Billing Email
                      </label>
                      <input
                        type="email"
                        placeholder="Leave blank to use main email"
                        value={createForm.billingEmail}
                        onChange={(e) => setCreateForm({ ...createForm, billingEmail: e.target.value })}
                        style={{ width: "100%", padding: "7px 10px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "0.85rem" }}
                      />
                    </div>
                  </div>

                  <div>
                    <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 600, marginBottom: "3px" }}>
                      Allowed Email Domains (Optional Domain-Lock)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. @apnacollege.com, @apna.in"
                      value={createForm.allowedEmailDomains}
                      onChange={(e) => setCreateForm({ ...createForm, allowedEmailDomains: e.target.value })}
                      style={{ width: "100%", padding: "7px 10px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "0.85rem" }}
                    />
                  </div>
                </div>
              )}
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "8px" }}>
              <button
                type="button"
                onClick={handleCloseCreateModal}
                style={{
                  padding: "8px 16px",
                  borderRadius: "6px",
                  border: "1px solid #cbd5e1",
                  background: "#f8fafc",
                  color: "#475569",
                  fontWeight: 600,
                  fontSize: "0.85rem",
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                style={{
                  padding: "8px 22px",
                  borderRadius: "6px",
                  border: "none",
                  background: "#c97a1e",
                  color: "#ffffff",
                  fontWeight: 600,
                  fontSize: "0.88rem",
                  cursor: isSubmitting ? "not-allowed" : "pointer",
                  opacity: isSubmitting ? 0.7 : 1,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                }}
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
                <span>⚠️</span> High-Risk Destructive Action
              </div>
              Permanently deletes <strong>{orgToDelete.name}</strong> ({orgToDelete.orgCode}). All associated batch seat pools, prepaid vouchers, department seat allocations, and staff memberships will be permanently deleted.
            </div>

            <div style={{ padding: "12px 14px", background: "#f8fafc", borderRadius: "8px", border: "1px solid #e2e8f0", fontSize: "0.83rem" }}>
              <div style={{ color: "#64748b", marginBottom: "4px" }}>Organization Registered Email:</div>
              <code style={{ fontSize: "0.95rem", fontWeight: 700, color: "#0f172a", wordBreak: "break-all" }}>
                {orgToDelete.billingEmail || orgToDelete.contactEmail}
              </code>
            </div>

            <div>
              <label style={{ display: "block", fontSize: "0.84rem", fontWeight: 600, color: "#1e293b", marginBottom: "6px" }}>
                To confirm deletion, please type this organization's email address below:
              </label>
              <input
                type="email"
                required
                autoFocus
                placeholder={orgToDelete.billingEmail || orgToDelete.contactEmail}
                value={confirmDeleteEmail}
                onChange={(e) => setConfirmDeleteEmail(e.target.value)}
                style={{
                  width: "100%",
                  padding: "9px 12px",
                  borderRadius: "6px",
                  border: "1px solid #cbd5e1",
                  fontSize: "0.9rem",
                  fontFamily: "inherit",
                }}
              />
            </div>

            {deleteError && (
              <p style={{ margin: 0, padding: "8px 12px", background: "#fef2f2", color: "#dc2626", borderRadius: "6px", fontSize: "0.82rem" }}>
                {deleteError}
              </p>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "8px" }}>
              <button
                type="button"
                onClick={() => {
                  setIsDeleteModalOpen(false);
                  setOrgToDelete(null);
                }}
                disabled={isDeleting}
                style={{
                  padding: "8px 16px",
                  borderRadius: "6px",
                  border: "1px solid #cbd5e1",
                  background: "#ffffff",
                  color: "#475569",
                  fontWeight: 600,
                  fontSize: "0.85rem",
                  cursor: isDeleting ? "not-allowed" : "pointer",
                }}
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
                  borderRadius: "6px",
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
