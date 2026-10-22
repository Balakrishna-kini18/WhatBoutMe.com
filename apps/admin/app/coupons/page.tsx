"use client";

import React, { useEffect, useState, useMemo } from "react";
import styles from "./coupons.module.css";
import { API_URL, cachedFetch, errorMessage, type SupportedCurrency } from "../lib/api";
import { Modal, CustomSelect, StatusBadge, ActionMenu, ConfirmDialog } from "../components";
import type { StatusTone } from "../components";

interface Coupon {
  id: string;
  code: string;
  description: string | null;
  discountType: "PERCENTAGE" | "FIXED_AMOUNT";
  discountValue: number;
  currency: SupportedCurrency | "ALL";
  scope: "ALL_COURSES" | "SPECIFIC_COURSES";
  maxTotalUses: number | null;
  currentUses: number;
  maxUsesPerUser: number;
  validFrom: string;
  expiresAt: string | null;
  isActive: boolean;
  appliesToInstalments: boolean;
  stripeCouponId: string | null;
  stripePromotionCodeId: string | null;
  programs: Array<{ id: string; title: string; slug: string }>;
  _count?: { redemptions: number };
  createdAt: string;
  updatedAt: string;
}

interface CouponKPIs {
  activeCount: number;
  totalRedemptions: number;
  totalDiscountGiven: Record<string, number>;
  depletedCount: number;
  expiredCount: number;
}

interface ProgramOption {
  id: string;
  title: string;
}

interface RedemptionRecord {
  id: string;
  userId: string;
  orderAmount: number;
  discountAmount: number;
  finalAmount: number;
  currency: string;
  redeemedAt: string;
  user?: { id: string; name: string; email: string };
  payment?: { id: string; status: string; amount: number; currency: string };
}

const Icons = {
  Plus: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  ),
  Refresh: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 4 23 10 17 10" />
      <polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </svg>
  ),
  Copy: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  ),
  Check: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ),
  Search: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  ),
  Tag: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
      <line x1="7" y1="7" x2="7.01" y2="7" />
    </svg>
  ),
  Dollar: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="1" x2="12" y2="23" />
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  ),
  Ticket: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2z" />
      <path d="M13 5v2" />
      <path d="M13 17v2" />
      <path d="M13 11v2" />
    </svg>
  ),
  Clock: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  ),
};

export default function CouponsPage() {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [kpis, setKpis] = useState<CouponKPIs | null>(null);
  const [programs, setPrograms] = useState<ProgramOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [couponToDelete, setCouponToDelete] = useState<Coupon | null>(null);
  const [isDeletingCoupon, setIsDeletingCoupon] = useState(false);
  const [deleteCouponError, setDeleteCouponError] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("ALL");
  const [currencyFilter, setCurrencyFilter] = useState<string>("ALL");
  const [scopeFilter, setScopeFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");

  // Modals & UI States
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingCoupon, setEditingCoupon] = useState<Coupon | null>(null);
  const [viewingRedemptionsCoupon, setViewingRedemptionsCoupon] = useState<Coupon | null>(null);
  const [redemptions, setRedemptions] = useState<RedemptionRecord[]>([]);
  const [isLoadingRedemptions, setIsLoadingRedemptions] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Form State
  const [formCode, setFormCode] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formDiscountType, setFormDiscountType] = useState<"PERCENTAGE" | "FIXED_AMOUNT">("PERCENTAGE");
  const [formDiscountValue, setFormDiscountValue] = useState<number>(10);
  const [formCurrency, setFormCurrency] = useState<SupportedCurrency | "ALL">("USD");
  const [formScope, setFormScope] = useState<"ALL_COURSES" | "SPECIFIC_COURSES">("ALL_COURSES");
  const [formProgramIds, setFormProgramIds] = useState<string[]>([]);
  const [formMaxTotalUses, setFormMaxTotalUses] = useState<string>("");
  const [formMaxUsesPerUser, setFormMaxUsesPerUser] = useState<number>(1);
  const [formExpiresAt, setFormExpiresAt] = useState<string>("");
  const [formIsActive, setFormIsActive] = useState<boolean>(true);
  const [formAppliesToInstalments, setFormAppliesToInstalments] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    loadAll(controller.signal);
    return () => controller.abort();
  }, []);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const loadAll = async (signal?: AbortSignal) => {
    setIsLoading(true);
    setError(null);
    try {
      // Kill Waterfall: Load KPIs, Coupons, and Programs concurrently in a single window
      const [kpisRes, couponsRes, programsRes] = await Promise.all([
        cachedFetch(`${API_URL}/admin/coupons/kpis`, { credentials: "include", signal }),
        cachedFetch(`${API_URL}/admin/coupons?limit=100`, { credentials: "include", signal }),
        cachedFetch(`${API_URL}/programs`, { credentials: "include", signal }).catch(() => null),
      ]);

      if (kpisRes.ok) {
        const kpiJson = await kpisRes.json();
        setKpis(kpiJson);
      }

      if (couponsRes.ok) {
        const couponsJson = await couponsRes.json();
        setCoupons(couponsJson.items || []);
      } else {
        const errJson = await couponsRes.json().catch(() => null);
        setError(errJson?.message || `Failed to load coupons (${couponsRes.status})`);
      }

      if (programsRes && programsRes.ok) {
        const data = await programsRes.json();
        const list = Array.isArray(data) ? data : data?.items || [];
        setPrograms(list.map((p: any) => ({ id: p.id, title: p.title })));
      }
    } catch (err: any) {
      if (err?.name !== "AbortError") {
        setError(err?.message || "Error loading coupon data. Please check connection.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const loadData = () => loadAll();

  const handleCopy = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    showToast(`Coupon code "${code}" copied to clipboard!`);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const openCreateModal = () => {
    setEditingCoupon(null);
    setFormCode("");
    setFormDescription("");
    setFormDiscountType("PERCENTAGE");
    setFormDiscountValue(10);
    setFormCurrency("USD");
    setFormScope("ALL_COURSES");
    setFormProgramIds([]);
    setFormMaxTotalUses("");
    setFormMaxUsesPerUser(1);
    setFormExpiresAt("");
    setFormIsActive(true);
    setFormAppliesToInstalments(false);
    setFormError(null);
    setIsCreateModalOpen(true);
  };

  const openEditModal = (coupon: Coupon) => {
    setEditingCoupon(coupon);
    setFormCode(coupon.code);
    setFormDescription(coupon.description || "");
    setFormDiscountType(coupon.discountType);
    setFormDiscountValue(coupon.discountValue);
    setFormCurrency(coupon.currency === "ALL" ? "USD" : coupon.currency);
    setFormScope(coupon.scope);
    setFormProgramIds(coupon.programs.map((p) => p.id));
    setFormMaxTotalUses(coupon.maxTotalUses ? String(coupon.maxTotalUses) : "");
    setFormMaxUsesPerUser(coupon.maxUsesPerUser || 1);
    setFormExpiresAt(
      coupon.expiresAt ? new Date(coupon.expiresAt).toISOString().slice(0, 16) : "",
    );
    setFormIsActive(coupon.isActive);
    setFormAppliesToInstalments(coupon.appliesToInstalments);
    setFormError(null);
    setIsCreateModalOpen(true);
  };

  const handleSaveCoupon = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const normalizedCode = formCode.trim().toUpperCase();
    if (!normalizedCode || normalizedCode.length < 3) {
      setFormError("Coupon code must be at least 3 characters");
      return;
    }

    if (formDiscountType === "PERCENTAGE" && (formDiscountValue <= 0 || formDiscountValue > 100)) {
      setFormError("Percentage discount must be between 1% and 100%");
      return;
    }

    if (formDiscountType === "FIXED_AMOUNT") {
      if (formDiscountValue <= 0) {
        setFormError("Fixed discount amount must be greater than zero");
        return;
      }
      if (formCurrency === "ALL") {
        setFormError("Fixed amount coupons must specify a currency (INR, AED, or USD)");
        return;
      }
    }

    if (formScope === "SPECIFIC_COURSES" && formProgramIds.length === 0) {
      setFormError("Please select at least one course for course-specific coupons");
      return;
    }

    setIsSubmitting(true);
    try {
      const payload: any = {
        code: normalizedCode,
        description: formDescription.trim() || undefined,
        discountType: formDiscountType,
        discountValue: Number(formDiscountValue),
        currency: formDiscountType === "FIXED_AMOUNT" ? formCurrency : "ALL",
        scope: formScope,
        programIds: formScope === "SPECIFIC_COURSES" ? formProgramIds : [],
        maxTotalUses: formMaxTotalUses ? Number(formMaxTotalUses) : undefined,
        maxUsesPerUser: Number(formMaxUsesPerUser) || 1,
        expiresAt: formExpiresAt ? new Date(formExpiresAt).toISOString() : null,
        isActive: formIsActive,
        appliesToInstalments: formAppliesToInstalments,
      };

      const url = editingCoupon
        ? `${API_URL}/admin/coupons/${editingCoupon.id}`
        : `${API_URL}/admin/coupons`;
      const method = editingCoupon ? "PATCH" : "POST";

      const res = await cachedFetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        throw new Error(errJson?.message || `Failed to save coupon (${res.status})`);
      }

      setIsCreateModalOpen(false);
      showToast(editingCoupon ? "Coupon updated successfully" : "Coupon created successfully");
      loadData();
    } catch (err: any) {
      setFormError(err?.message || "Failed to save coupon");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleActive = async (coupon: Coupon) => {
    const nextActive = !coupon.isActive;
    const previousCoupons = coupons;

    // Optimistic UI update: immediately toggle status in local state
    setCoupons((prev) =>
      prev.map((c) => (c.id === coupon.id ? { ...c, isActive: nextActive } : c))
    );
    showToast(`Coupon ${coupon.code} ${nextActive ? "activated" : "deactivated"}`);

    try {
      const res = await cachedFetch(`${API_URL}/admin/coupons/${coupon.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ isActive: nextActive }),
      });

      if (!res.ok) {
        // Rollback on server error
        setCoupons(previousCoupons);
        showToast("Failed to update status");
      }
    } catch {
      setCoupons(previousCoupons);
      showToast("Failed to update status");
    }
  };

  const confirmDeleteCoupon = async () => {
    if (!couponToDelete) return;
    const coupon = couponToDelete;
    const isDeactivation = (coupon.currentUses || 0) > 0 || (coupon._count?.redemptions || 0) > 0;
    setIsDeletingCoupon(true);
    setDeleteCouponError(null);

    const previousCoupons = coupons;

    // Optimistic UI update: immediately deactivate or remove from local array
    if (isDeactivation) {
      setCoupons((prev) =>
        prev.map((c) => (c.id === coupon.id ? { ...c, isActive: false } : c))
      );
    } else {
      setCoupons((prev) => prev.filter((c) => c.id !== coupon.id));
    }
    showToast(`Coupon "${coupon.code}" ${isDeactivation ? "deactivated" : "removed"}`);
    setCouponToDelete(null);

    try {
      const res = await cachedFetch(`${API_URL}/admin/coupons/${coupon.id}`, {
        method: "DELETE",
        credentials: "include",
      });

      if (!res.ok) {
        setCoupons(previousCoupons);
        const errJson = await res.json().catch(() => null);
        showToast(errJson?.message || "Failed to delete coupon");
      }
    } catch {
      setCoupons(previousCoupons);
      showToast("Failed to delete coupon");
    } finally {
      setIsDeletingCoupon(false);
    }
  };

  const handleViewRedemptions = async (coupon: Coupon) => {
    setViewingRedemptionsCoupon(coupon);
    setIsLoadingRedemptions(true);
    try {
      const res = await cachedFetch(`${API_URL}/admin/coupons/${coupon.id}`, {
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        setRedemptions(data.redemptions || []);
      }
    } catch {
      setRedemptions([]);
    } finally {
      setIsLoadingRedemptions(false);
    }
  };

  // Filtered List
  const filteredCoupons = useMemo(() => {
    return coupons.filter((c) => {
      if (search) {
        const q = search.toLowerCase();
        const matchCode = c.code.toLowerCase().includes(q);
        const matchDesc = c.description?.toLowerCase().includes(q);
        if (!matchCode && !matchDesc) return false;
      }
      if (typeFilter !== "ALL" && c.discountType !== typeFilter) return false;
      if (currencyFilter !== "ALL" && c.currency !== currencyFilter) return false;
      if (scopeFilter !== "ALL" && c.scope !== scopeFilter) return false;
      if (statusFilter !== "ALL") {
        const isDepleted = c.maxTotalUses !== null && c.currentUses >= c.maxTotalUses;
        const isExpired = c.expiresAt !== null && new Date(c.expiresAt) < new Date();
        if (statusFilter === "ACTIVE" && (!c.isActive || isDepleted || isExpired)) return false;
        if (statusFilter === "INACTIVE" && c.isActive) return false;
        if (statusFilter === "EXPIRED" && !isExpired) return false;
        if (statusFilter === "DEPLETED" && !isDepleted) return false;
      }
      return true;
    });
  }, [coupons, search, typeFilter, currencyFilter, scopeFilter, statusFilter]);

  const getStatusBadgeProps = (c: Coupon): { status: string; tone: StatusTone } => {
    const isDepleted = c.maxTotalUses !== null && c.currentUses >= c.maxTotalUses;
    const isExpired = c.expiresAt !== null && new Date(c.expiresAt) < new Date();

    if (!c.isActive) return { status: "Inactive", tone: "inactive" };
    if (isExpired) return { status: "Expired", tone: "error" };
    if (isDepleted) return { status: "Depleted", tone: "pending" };
    return { status: "Active", tone: "active" };
  };

  return (
    <div className={styles.container}>
      {/* Toast */}
      {toastMessage && <div className={styles.copiedToast}>{toastMessage}</div>}

      {/* Header */}
      <header className={styles.header}>
        <div className={styles.titleArea}>
          <h1>Coupons Management</h1>
          <p className={styles.subtitle}>
            Create promo codes, multi-currency discounts (INR / AED / USD), usage limits, and checkout rules.
          </p>
        </div>
        <div className={styles.headerActions}>
          <button
            className={styles.refreshBtn}
            onClick={loadData}
            title="Refresh coupons"
            aria-label="Refresh coupons"
          >
            <Icons.Refresh />
          </button>
          <button className={styles.primaryBtn} onClick={openCreateModal}>
            <Icons.Plus />
            <span>Create Coupon</span>
          </button>
        </div>
      </header>

      {/* KPI Cards */}
      <section className={styles.kpiGrid}>
        <div className={styles.kpiCard}>
          <div className={styles.kpiTopRow}>
            <span className={styles.kpiLabel}>Active Coupons</span>
            <div className={styles.kpiIconBox}>
              <Icons.Tag />
            </div>
          </div>
          <div className={styles.kpiValueRow}>
            <span className={styles.kpiValue}>
              {kpis?.activeCount ?? coupons.filter((c) => c.isActive).length}
            </span>
          </div>
          <div className={styles.kpiFooter}>
            <span className={styles.kpiMeta}>Available at checkout</span>
          </div>
        </div>

        <div className={styles.kpiCard}>
          <div className={styles.kpiTopRow}>
            <span className={styles.kpiLabel}>Total Redemptions</span>
            <div className={styles.kpiIconBox}>
              <Icons.Ticket />
            </div>
          </div>
          <div className={styles.kpiValueRow}>
            <span className={styles.kpiValue}>{kpis?.totalRedemptions ?? 0}</span>
          </div>
          <div className={styles.kpiFooter}>
            <span className={styles.kpiMeta}>Used across all batches</span>
          </div>
        </div>

        <div className={styles.kpiCard}>
          <div className={styles.kpiTopRow}>
            <span className={styles.kpiLabel}>Discounts Given</span>
            <div className={styles.kpiIconBox}>
              <Icons.Dollar />
            </div>
          </div>
          <div className={styles.kpiSub} style={{ marginTop: "0.25rem" }}>
            <span className={styles.currencyPill}>
              USD: ${(kpis?.totalDiscountGiven?.USD || 0).toLocaleString()}
            </span>
            <span className={styles.currencyPill}>
              INR: ₹{(kpis?.totalDiscountGiven?.INR || 0).toLocaleString()}
            </span>
            <span className={styles.currencyPill}>
              AED: AED {(kpis?.totalDiscountGiven?.AED || 0).toLocaleString()}
            </span>
          </div>
          <div className={styles.kpiFooter} style={{ marginTop: "0.25rem" }}>
            <span className={styles.kpiMeta}>Multi-currency savings</span>
          </div>
        </div>

        <div className={styles.kpiCard}>
          <div className={styles.kpiTopRow}>
            <span className={styles.kpiLabel}>Depleted / Expired</span>
            <div className={styles.kpiIconBox}>
              <Icons.Clock />
            </div>
          </div>
          <div className={styles.kpiValueRow}>
            <span className={styles.kpiValue}>
              {(kpis?.depletedCount || 0) + (kpis?.expiredCount || 0)}
            </span>
          </div>
          <div className={styles.kpiFooter}>
            <span className={styles.kpiMeta}>
              {kpis?.depletedCount || 0} depleted, {kpis?.expiredCount || 0} expired
            </span>
          </div>
        </div>
      </section>

      {/* Filter Bar */}
      <section className={styles.filterBar}>
        <div className={styles.searchInputWrap}>
          <span className={styles.searchIcon}>
            <Icons.Search />
          </span>
          <input
            type="text"
            className={styles.searchInput}
            placeholder="Search coupon code or description..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <CustomSelect
          value={typeFilter}
          onChange={setTypeFilter}
          options={[
            { value: "ALL", label: "All Types" },
            { value: "PERCENTAGE", label: "Percentage (%)" },
            { value: "FIXED_AMOUNT", label: "Fixed Amount" },
          ]}
          minWidth="145px"
          ariaLabel="Filter coupons by discount type"
        />

        <CustomSelect
          value={currencyFilter}
          onChange={setCurrencyFilter}
          options={[
            { value: "ALL", label: "All Currencies" },
            { value: "USD", label: "USD ($)" },
            { value: "INR", label: "INR (₹)" },
            { value: "AED", label: "AED" },
          ]}
          minWidth="145px"
          ariaLabel="Filter coupons by currency"
        />

        <CustomSelect
          value={scopeFilter}
          onChange={setScopeFilter}
          options={[
            { value: "ALL", label: "All Scopes" },
            { value: "ALL_COURSES", label: "All Courses" },
            { value: "SPECIFIC_COURSES", label: "Specific Courses" },
          ]}
          minWidth="150px"
          ariaLabel="Filter coupons by scope"
        />

        <CustomSelect
          value={statusFilter}
          onChange={setStatusFilter}
          options={[
            { value: "ALL", label: "All Statuses" },
            { value: "ACTIVE", label: "Active" },
            { value: "INACTIVE", label: "Inactive" },
            { value: "EXPIRED", label: "Expired" },
            { value: "DEPLETED", label: "Depleted" },
          ]}
          minWidth="140px"
          ariaLabel="Filter coupons by status"
        />
      </section>

      {/* Error state */}
      {error && (
        <div style={{ padding: "0.75rem 1rem", background: "var(--status-error-bg, #fee2e2)", color: "var(--status-error, #b91c1c)", borderRadius: "8px", border: "1px solid #fecdd3", fontSize: "0.84375rem" }}>
          {error}
        </div>
      )}

      {/* Coupons Table */}
      <section className={styles.tableCard}>
        <div className={styles.tableWrapper}>
          <table className={styles.couponsTable}>
            <thead>
              <tr>
                <th>Code</th>
                <th>Discount</th>
                <th>Applicable Courses</th>
                <th>Usage</th>
                <th>Valid Until</th>
                <th>Status</th>
                <th style={{ textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: "center", padding: "3rem", color: "var(--text-muted, #78716a)" }}>
                    Loading coupons...
                  </td>
                </tr>
              ) : filteredCoupons.length === 0 ? (
                <tr>
                  <td colSpan={7}>
                    <div className={styles.emptyState}>
                      <div className={styles.emptyStateIcon}>
                        <Icons.Tag />
                      </div>
                      <h3 className={styles.emptyStateTitle}>No coupons found</h3>
                      <p className={styles.emptyStateSubtitle}>
                        {search || typeFilter !== "ALL" || currencyFilter !== "ALL" || scopeFilter !== "ALL" || statusFilter !== "ALL"
                          ? "No coupons match your selected filters. Try clearing filters or adjust your search query."
                          : "No discount coupons have been created yet. Create promo codes to offer student discounts."}
                      </p>
                      {search || typeFilter !== "ALL" || currencyFilter !== "ALL" || scopeFilter !== "ALL" || statusFilter !== "ALL" ? (
                        <button
                          type="button"
                          className={styles.cancelBtn}
                          onClick={() => {
                            setSearch("");
                            setTypeFilter("ALL");
                            setCurrencyFilter("ALL");
                            setScopeFilter("ALL");
                            setStatusFilter("ALL");
                          }}
                          style={{ marginTop: "0.25rem" }}
                        >
                          Clear Filters
                        </button>
                      ) : (
                        <button
                          type="button"
                          className={styles.primaryBtn}
                          onClick={openCreateModal}
                          style={{ marginTop: "0.25rem" }}
                        >
                          <Icons.Plus />
                          <span>Create Coupon</span>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                filteredCoupons.map((coupon) => {
                  const badge = getStatusBadgeProps(coupon);
                  const isDepleted = coupon.maxTotalUses !== null && coupon.currentUses >= coupon.maxTotalUses;
                  const usagePercent = coupon.maxTotalUses
                    ? Math.min(100, Math.round((coupon.currentUses / coupon.maxTotalUses) * 100))
                    : null;

                  return (
                    <tr key={coupon.id}>
                      <td>
                        <div className={styles.codeCell}>
                          <span className={styles.codeBadge}>{coupon.code}</span>
                          <button
                            className={styles.copyBtn}
                            onClick={() => handleCopy(coupon.code)}
                            title="Copy code"
                            aria-label={`Copy code ${coupon.code}`}
                          >
                            {copiedCode === coupon.code ? <Icons.Check /> : <Icons.Copy />}
                          </button>
                        </div>
                        {coupon.description && (
                          <div style={{ fontSize: "0.75rem", color: "var(--text-muted, #78716a)", marginTop: "0.2rem" }}>
                            {coupon.description}
                          </div>
                        )}
                      </td>
                      <td>
                        <div className={styles.discountBadge}>
                          {coupon.discountType === "PERCENTAGE" ? (
                            <span>{coupon.discountValue}% OFF</span>
                          ) : (
                            <span style={{ display: "inline-flex", alignItems: "center", gap: "2px" }}>
                              <strong>
                                {coupon.currency === "USD"
                                  ? "$"
                                  : coupon.currency === "INR"
                                  ? "₹"
                                  : "AED "}
                              </strong>
                              <span>{Number(coupon.discountValue).toLocaleString()} OFF</span>
                              <span style={{ fontSize: "0.7rem", opacity: 0.85, marginLeft: "4px" }}>
                                ({coupon.currency})
                              </span>
                            </span>
                          )}
                        </div>
                        {coupon.appliesToInstalments && (
                          <div style={{ fontSize: "0.7rem", color: "var(--accent-primary, #c97a1e)", marginTop: "0.15rem", fontWeight: 600 }}>
                            ✓ Allowed on Instalments
                          </div>
                        )}
                      </td>
                      <td>
                        {coupon.scope === "ALL_COURSES" ? (
                          <span className={styles.scopeBadge}>All Courses</span>
                        ) : (
                          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.25rem" }}>
                            {coupon.programs.map((p) => (
                              <span key={p.id} className={styles.scopeBadge} title={p.title}>
                                {p.title.length > 20 ? `${p.title.slice(0, 20)}...` : p.title}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td>
                        <div className={styles.usageProgress}>
                          <span className={styles.usageText}>
                            {coupon.currentUses} / {coupon.maxTotalUses ? coupon.maxTotalUses : "∞"}
                          </span>
                          {usagePercent !== null && (
                            <div className={styles.progressBar}>
                              <div
                                className={styles.progressFill}
                                style={{
                                  width: `${usagePercent}%`,
                                  backgroundColor: isDepleted ? "var(--status-warning, #b45309)" : "var(--accent-primary, #c97a1e)",
                                }}
                              />
                            </div>
                          )}
                        </div>
                      </td>
                      <td>
                        <div style={{ fontSize: "0.825rem", color: "var(--text-secondary, #4a443d)" }}>
                          {coupon.expiresAt
                            ? new Date(coupon.expiresAt).toLocaleDateString(undefined, {
                                year: "numeric",
                                month: "short",
                                day: "numeric",
                              })
                            : "No expiry"}
                        </div>
                      </td>
                      <td>
                        <StatusBadge status={badge.status} tone={badge.tone} />
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <ActionMenu
                          items={[
                            {
                              label: "Edit Coupon",
                              onClick: () => openEditModal(coupon),
                            },
                            {
                              label: coupon.isActive ? "Deactivate" : "Activate",
                              onClick: () => handleToggleActive(coupon),
                            },
                            {
                              label: "View Redemptions",
                              onClick: () => handleViewRedemptions(coupon),
                            },
                            {
                              label: (coupon.currentUses || 0) > 0 ? "Archive Coupon" : "Delete Coupon",
                              danger: true,
                              onClick: () => {
                                setDeleteCouponError(null);
                                setCouponToDelete(coupon);
                              },
                            },
                          ]}
                        />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Create / Edit Coupon Modal */}
      <Modal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        title={editingCoupon ? `Edit Coupon: ${editingCoupon.code}` : "Create New Coupon"}
      >
        <form onSubmit={handleSaveCoupon} className={styles.formGrid}>
          {formError && (
            <div style={{ padding: "0.75rem", background: "rgba(239, 68, 68, 0.15)", color: "#f87171", borderRadius: "6px", fontSize: "0.85rem" }}>
              {formError}
            </div>
          )}

          <div className={styles.formRow}>
            <div className={styles.formGroup}>
              <label>Coupon Code *</label>
              <input
                type="text"
                className={styles.formInput}
                placeholder="e.g. ROWEENA20"
                value={formCode}
                onChange={(e) => setFormCode(e.target.value.toUpperCase())}
                required
              />
              <span className={styles.formHelp}>Normalized to uppercase automatically.</span>
            </div>

            <div className={styles.formGroup}>
              <label>Discount Type *</label>
              <select
                className={styles.formSelect}
                value={formDiscountType}
                onChange={(e) => {
                  const nextType = e.target.value as any;
                  setFormDiscountType(nextType);
                  if (nextType === "FIXED_AMOUNT" && (formCurrency as string) === "ALL") {
                    setFormCurrency("USD");
                  }
                }}
              >
                <option value="PERCENTAGE">Percentage (%)</option>
                <option value="FIXED_AMOUNT">Fixed Amount</option>
              </select>
            </div>
          </div>

          <div className={styles.formRow}>
            <div className={styles.formGroup}>
              <label>
                {formDiscountType === "PERCENTAGE" ? "Discount Percentage (1–100%) *" : "Discount Amount *"}
              </label>
              <input
                type="number"
                step="any"
                min="0.01"
                max={formDiscountType === "PERCENTAGE" ? "100" : undefined}
                className={styles.formInput}
                value={formDiscountValue}
                onChange={(e) => setFormDiscountValue(parseFloat(e.target.value) || 0)}
                required
              />
            </div>

            {formDiscountType === "FIXED_AMOUNT" ? (
              <div className={styles.formGroup}>
                <label>Currency *</label>
                <select
                  className={styles.formSelect}
                  value={formCurrency}
                  onChange={(e) => setFormCurrency(e.target.value as any)}
                  required
                >
                  <option value="USD">USD ($)</option>
                  <option value="INR">INR (₹)</option>
                  <option value="AED">AED</option>
                </select>
                <span className={styles.formHelp}>Fixed discounts only apply to the matching currency.</span>
              </div>
            ) : (
              <div className={styles.formGroup}>
                <label>Currency Applicability</label>
                <input
                  type="text"
                  className={styles.formInput}
                  value="All Currencies (Percentage)"
                  disabled
                  style={{ opacity: 0.6 }}
                />
              </div>
            )}
          </div>

          <div className={styles.formGroup}>
            <label>Description (Optional)</label>
            <input
              type="text"
              className={styles.formInput}
              placeholder="e.g. 20% discount for Autumn Batch registrations"
              value={formDescription}
              onChange={(e) => setFormDescription(e.target.value)}
            />
          </div>

          <div className={styles.formRow}>
            <div className={styles.formGroup}>
              <label>Course Scope *</label>
              <select
                className={styles.formSelect}
                value={formScope}
                onChange={(e) => setFormScope(e.target.value as any)}
              >
                <option value="ALL_COURSES">All Courses (Global)</option>
                <option value="SPECIFIC_COURSES">Specific Courses Only</option>
              </select>
            </div>

            <div className={styles.formGroup}>
              <label>Max Total Redemptions</label>
              <input
                type="number"
                min="1"
                className={styles.formInput}
                placeholder="Leave blank for unlimited"
                value={formMaxTotalUses}
                onChange={(e) => setFormMaxTotalUses(e.target.value)}
              />
            </div>
          </div>

          {formScope === "SPECIFIC_COURSES" && (
            <div className={styles.formGroup}>
              <label>Select Applicable Courses *</label>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", maxHeight: "160px", overflowY: "auto", border: "1px solid var(--border-light, #ece4d7)", background: "var(--bg-card-muted, #fdfbf7)", padding: "0.75rem", borderRadius: "8px" }}>
                {programs.map((p) => (
                  <label key={p.id} style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.84375rem", color: "var(--text-primary, #14110f)", cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={formProgramIds.includes(p.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setFormProgramIds([...formProgramIds, p.id]);
                        } else {
                          setFormProgramIds(formProgramIds.filter((id) => id !== p.id));
                        }
                      }}
                      style={{ accentColor: "var(--accent-primary, #c97a1e)", cursor: "pointer" }}
                    />
                    <span>{p.title}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className={styles.formRow}>
            <div className={styles.formGroup}>
              <label>Max Uses Per Learner</label>
              <input
                type="number"
                min="1"
                className={styles.formInput}
                value={formMaxUsesPerUser}
                onChange={(e) => setFormMaxUsesPerUser(parseInt(e.target.value) || 1)}
                required
              />
            </div>

            <div className={styles.formGroup}>
              <label>Expiration Date & Time (Optional)</label>
              <input
                type="datetime-local"
                className={styles.formInput}
                value={formExpiresAt}
                onChange={(e) => setFormExpiresAt(e.target.value)}
              />
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            <label className={styles.toggleRow}>
              <input
                type="checkbox"
                className={styles.toggleCheckbox}
                checked={formAppliesToInstalments}
                onChange={(e) => setFormAppliesToInstalments(e.target.checked)}
              />
              <span className={styles.toggleLabel}>Allow on Instalment Payment Plans</span>
            </label>

            <label className={styles.toggleRow}>
              <input
                type="checkbox"
                className={styles.toggleCheckbox}
                checked={formIsActive}
                onChange={(e) => setFormIsActive(e.target.checked)}
              />
              <span className={styles.toggleLabel}>Coupon is Active</span>
            </label>
          </div>

          <div className={styles.modalFooter}>
            <button
              type="button"
              className={styles.cancelBtn}
              onClick={() => setIsCreateModalOpen(false)}
            >
              Cancel
            </button>
            <button
              type="submit"
              className={styles.primaryBtn}
              disabled={isSubmitting}
            >
              {isSubmitting ? "Saving..." : editingCoupon ? "Save Changes" : "Create Coupon"}
            </button>
          </div>
        </form>
      </Modal>

      {/* Redemption History Modal */}
      <Modal
        isOpen={Boolean(viewingRedemptionsCoupon)}
        onClose={() => setViewingRedemptionsCoupon(null)}
        title={`Redemptions: ${viewingRedemptionsCoupon?.code || ""}`}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--text-secondary, #4a443d)" }}>
            Showing the latest redemption records for code{" "}
            <strong style={{ color: "var(--text-primary, #14110f)" }}>{viewingRedemptionsCoupon?.code}</strong>.
          </p>

          {isLoadingRedemptions ? (
            <div style={{ padding: "2rem", textAlign: "center", color: "var(--text-muted, #78716a)" }}>
              Loading redemptions...
            </div>
          ) : redemptions.length === 0 ? (
            <div style={{ padding: "2rem", textAlign: "center", color: "var(--text-muted, #78716a)" }}>
              No redemptions recorded for this coupon yet.
            </div>
          ) : (
            <div style={{ maxHeight: "350px", overflowY: "auto" }}>
              <table className={styles.redemptionsTable}>
                <thead>
                  <tr>
                    <th>Learner</th>
                    <th>Original</th>
                    <th>Discount</th>
                    <th>Final Paid</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {redemptions.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{r.user?.name || "Unknown"}</div>
                        <div style={{ fontSize: "0.75rem", color: "var(--text-muted, #78716a)" }}>{r.user?.email}</div>
                      </td>
                      <td>
                        {r.currency} {r.orderAmount.toLocaleString()}
                      </td>
                      <td style={{ color: "var(--status-success, #15803d)", fontWeight: 600 }}>
                        -{r.currency} {r.discountAmount.toLocaleString()}
                      </td>
                      <td style={{ fontWeight: 600 }}>
                        {r.currency} {r.finalAmount.toLocaleString()}
                      </td>
                      <td style={{ fontSize: "0.75rem", color: "var(--text-muted, #78716a)" }}>
                        {new Date(r.redeemedAt).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className={styles.modalFooter}>
            <button
              className={styles.cancelBtn}
              onClick={() => setViewingRedemptionsCoupon(null)}
            >
              Close
            </button>
          </div>
        </div>
      </Modal>

      {/* In-website branded ConfirmDialog for Coupon Deletion / Archival */}
      <ConfirmDialog
        isOpen={Boolean(couponToDelete)}
        onClose={() => {
          if (!isDeletingCoupon) {
            setCouponToDelete(null);
            setDeleteCouponError(null);
          }
        }}
        onConfirm={confirmDeleteCoupon}
        title={
          couponToDelete && ((couponToDelete.currentUses || 0) > 0 || (couponToDelete._count?.redemptions || 0) > 0)
            ? "Deactivate Coupon & Preserve Invoices"
            : "Delete Coupon Code"
        }
        subtitle={couponToDelete ? `Code: ${couponToDelete.code}` : undefined}
        description={
          couponToDelete && ((couponToDelete.currentUses || 0) > 0 || (couponToDelete._count?.redemptions || 0) > 0) ? (
            <>
              Coupon <strong>{couponToDelete.code}</strong> has historical student redemptions. Deactivating it will prevent new redemptions while preserving past invoice and accounting integrity.
            </>
          ) : (
            <>
              Are you sure you want to permanently delete coupon <strong>{couponToDelete?.code}</strong>? This action cannot be undone.
            </>
          )
        }
        tone="danger"
        confirmText={
          isDeletingCoupon
            ? "Processing..."
            : couponToDelete && ((couponToDelete.currentUses || 0) > 0 || (couponToDelete._count?.redemptions || 0) > 0)
            ? "Deactivate Coupon"
            : "Delete Coupon"
        }
        cancelText="Cancel"
        isLoading={isDeletingCoupon}
        error={deleteCouponError}
        itemDetails={
          couponToDelete
            ? [
                { label: "Code", value: couponToDelete.code },
                {
                  label: "Discount",
                  value:
                    couponToDelete.discountType === "PERCENTAGE"
                      ? `${couponToDelete.discountValue}% OFF`
                      : `${couponToDelete.currency} ${couponToDelete.discountValue} OFF`,
                },
                { label: "Times Used", value: `${couponToDelete.currentUses || 0} times` },
              ]
            : []
        }
      />
    </div>
  );
}
