"use client";

import { useEffect, useState, FormEvent, Suspense, use, useRef, useMemo } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import styles from "../../../page.module.css";
import { useAuth } from "../../../AuthProvider";
import {
  CustomSelect,
  StatusBadge,
  useToast,
  Modal,
  TableSkeleton,
  EmptyState,
} from "../../../components";
import { apiGet, apiPatch, apiPost, apiDelete, API_URL } from "../../../lib/api";
import VolumePricingModal, { VolumePricingConfig } from "../components/VolumePricingModal";

function CrownIcon({ size = 16, style }: { size?: number; style?: React.CSSProperties }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={style}
    >
      <path d="M11.562 3.266a.5.5 0 0 1 .876 0L15.39 8.87a1 1 0 0 0 1.516.294L21.183 5.5a.5.5 0 0 1 .798.519l-2.834 10.246a1 1 0 0 1-.956.734H5.81a1 1 0 0 1-.957-.734L2.02 6.02a.5.5 0 0 1 .798-.519l4.276 3.664a1 1 0 0 0 1.516-.294z" />
      <path d="M5 21h14" />
    </svg>
  );
}

function CreditCardIcon({ size = 14, style }: { size?: number; style?: React.CSSProperties }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={style}
    >
      <rect width="20" height="14" x="2" y="5" rx="2" />
      <line x1="2" x2="22" y1="10" y2="10" />
    </svg>
  );
}

function ClockIcon({ size = 13, style }: { size?: number; style?: React.CSSProperties }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={style}
    >
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

interface OrgWorkspaceProps {
  params: Promise<{ id: string }>;
}

export default function OrganizationWorkspacePage({ params }: OrgWorkspaceProps) {
  const resolvedParams = use(params);
  return (
    <Suspense fallback={null}>
      <OrganizationWorkspaceContent orgId={resolvedParams.id} />
    </Suspense>
  );
}

function OrganizationWorkspaceContent({ orgId }: { orgId: string }) {
  const router = useRouter();
  const toast = useToast();
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
  const isOrgUser = Boolean(
    !isPlatformAdmin && (isOrgAccount || effectiveUser?.role === "USER" || !effectiveUser?.role)
  );
  const userOrgId = (effectiveUser as any)?.organization?.id || (effectiveUser as any)?.organizationId || null;

  useEffect(() => {
    if (!isPlatformAdmin && userOrgId && orgId !== userOrgId) {
      router.replace(`/users/organizations/${userOrgId}`);
    }
  }, [isPlatformAdmin, userOrgId, orgId, router]);
  const searchParams = useSearchParams();
  const tabParam = searchParams?.get("tab");

  const [org, setOrg] = useState<any>(null);
  const [accessError, setAccessError] = useState<{
    code: "NOT_MEMBER" | "NOT_FOUND" | "SUSPENDED" | "UNKNOWN";
    title: string;
    message: string;
  } | null>(null);
  const [learners, setLearners] = useState<any[]>([]);
  const [batches, setBatches] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<"students" | "pools" | "billing" | "team">("students");
  const [isLoading, setIsLoading] = useState(true);
  const [isLearnersLoading, setIsLearnersLoading] = useState(false);

  useEffect(() => {
    if (tabParam && ["students", "pools", "billing", "team"].includes(tabParam)) {
      setActiveTab(tabParam as any);
    }
  }, [tabParam]);

  // Filters
  const [selectedBatchId, setSelectedBatchId] = useState<string>("ALL");
  const [studentSearch, setStudentSearch] = useState("");

  // Modals
  const [isAllocateModalOpen, setIsAllocateModalOpen] = useState(false);
  const [isSubmittingPool, setIsSubmittingPool] = useState(false);
  const [poolForm, setPoolForm] = useState({
    batchId: "",
    totalSeats: 30,
    paymentMethod: "ONLINE",
    currency: "USD",
    customPricePerSeat: "",
    notes: "",
  });

  // Self-Service Slot Booking & Purchase Modal State
  const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);
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
  const [isSubmittingRequest, setIsSubmittingRequest] = useState(false);
  const [isBatchDropdownOpen, setIsBatchDropdownOpen] = useState(false);
  const [batchSearchTerm, setBatchSearchTerm] = useState("");
  const batchDropdownRef = useRef<HTMLDivElement>(null);
  const [requestForm, setRequestForm] = useState({
    batchId: "",
    totalSeats: 10,
    currency: "USD",
    notes: "",
  });

  // Simulated Checkout Modal State (Test Bypass Mode)
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [selectedPoolForPayment, setSelectedPoolForPayment] = useState<any>(null);
  const [isSubmittingPayment, setIsSubmittingPayment] = useState(false);
  const [paymentForm, setPaymentForm] = useState({
    paymentMethod: "ONLINE",
    notes: "",
  });

  // Reject Slot Request Modal State (Admin)
  const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
  const [selectedPoolForReject, setSelectedPoolForReject] = useState<any>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [isRejecting, setIsRejecting] = useState(false);

  // 1-on-1 Management Modal
  const [isOneOnOneModalOpen, setIsOneOnOneModalOpen] = useState(false);
  const [activeEnrolmentForOneOnOne, setActiveEnrolmentForOneOnOne] = useState<any>(null);
  const [oneOnOneForm, setOneOnOneForm] = useState({
    status: "SCHEDULED",
    scheduledAt: "",
    facilitatorName: "Roweena",
    meetingUrl: "",
    adminNotes: "",
  });

  // Goodwill Reclaim Modal
  const [isReclaimModalOpen, setIsReclaimModalOpen] = useState(false);
  const [activeSeatForReclaim, setActiveSeatForReclaim] = useState<any>(null);
  const [reclaimReason, setReclaimReason] = useState("");
  const [isReclaiming, setIsReclaiming] = useState(false);

  // Delete Organization Modal State
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [confirmDeleteEmail, setConfirmDeleteEmail] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const handleDeleteSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!org) return;
    try {
      setIsDeleting(true);
      setDeleteError(null);
      await apiDelete(`/admin/organizations/${org.id}`, {
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmEmail: confirmDeleteEmail.trim() }),
      });
      toast.success(`Organization "${org.name}" permanently deleted.`, "Organization Deleted");

      // Clear deleted organization from local storage session
      if (typeof window !== "undefined") {
        try {
          const raw = localStorage.getItem("user");
          if (raw) {
            const u = JSON.parse(raw);
            if (u.organizationId === org.id || u.organization?.id === org.id) {
              u.organizationId = null;
              u.organization = null;
              u.isOrgUser = false;
              u.orgRole = null;
              localStorage.setItem("user", JSON.stringify(u));
            }
          }
        } catch {}
      }

      if (isPlatformAdmin) {
        router.push("/users/organizations");
      } else {
        router.push("/");
      }
    } catch (err: any) {
      setDeleteError(err?.message || "Failed to delete organization");
    } finally {
      setIsDeleting(false);
    }
  };

  // Assign Student Modal
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [selectedSeatForAssign, setSelectedSeatForAssign] = useState<any>(null);
  const [assignForm, setAssignForm] = useState({
    email: "",
    fullName: "",
    phone: "",
    department: "",
    externalOrderRef: "",
    resalePrice: "",
    redemptionMode: "EMAIL_INVITE",
  });
  const [assignedResult, setAssignedResult] = useState<any>(null);
  const [isSubmittingAssign, setIsSubmittingAssign] = useState(false);

  const handleOpenAssignModal = (learner: any) => {
    setSelectedSeatForAssign(learner);
    setAssignedResult(null);
    setAssignForm({
      email: "",
      fullName: "",
      phone: "",
      department: "",
      externalOrderRef: "",
      resalePrice: "",
      redemptionMode: "EMAIL_INVITE",
    });
    setIsAssignModalOpen(true);
  };

  const handleAssignSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedSeatForAssign) return;
    try {
      setIsSubmittingAssign(true);
      const res = await apiPost(`/admin/organizations/${orgId}/seats/${selectedSeatForAssign.seatId}/assign`, {
        seatId: selectedSeatForAssign.seatId,
        email: assignForm.email.trim(),
        fullName: assignForm.fullName.trim() || undefined,
        phone: assignForm.phone.trim() || undefined,
        department: assignForm.department.trim() || undefined,
        externalOrderRef: assignForm.externalOrderRef.trim() || undefined,
        resalePrice: assignForm.resalePrice ? Number(assignForm.resalePrice) : undefined,
        redemptionMode: assignForm.redemptionMode,
      });

      setAssignedResult(res);
      toast.success(`Slot successfully assigned to ${assignForm.email}.`, "Student Assigned");
      fetchOrganizationDetails();
      fetchLearners();
    } catch (err: any) {
      toast.error(err.message || "Failed to assign student to slot", "Error");
    } finally {
      setIsSubmittingAssign(false);
    }
  };

  const fetchOrganizationDetails = async () => {
    try {
      setIsLoading(true);
      setAccessError(null);
      const data = await apiGet(`/admin/organizations/${orgId}`);
      setOrg(data);
      if (data?.defaultCurrency) {
        setPoolForm((prev) => ({ ...prev, currency: data.defaultCurrency }));
        setRequestForm((prev) => ({ ...prev, currency: data.defaultCurrency }));
      }
      fetchAvailableBatches();
      fetchLearners();
      apiGet<VolumePricingConfig>("/admin/organizations/pricing-tiers")
        .then((cfg) => {
          if (cfg && cfg.tiers) setPricingConfig(cfg);
        })
        .catch(() => {});
    } catch (e: any) {
      const msg = e?.message || "";
      const lower = msg.toLowerCase();
      if (
        lower.includes("not a member") ||
        lower.includes("not member") ||
        lower.includes("403") ||
        lower.includes("forbidden")
      ) {
        setAccessError({
          code: "NOT_MEMBER",
          title: "You are not a member of this organization",
          message:
            "Your account is not registered as a member of this organization workspace, or this organization has been deleted.",
        });
      } else if (lower.includes("not found") || lower.includes("404")) {
        setAccessError({
          code: "NOT_FOUND",
          title: "Organization Not Found",
          message:
            "The requested organization workspace could not be found. It may have been permanently deleted.",
        });
      } else if (lower.includes("suspended") || lower.includes("archived")) {
        setAccessError({
          code: "SUSPENDED",
          title: "Organization Inactive",
          message: msg,
        });
      } else {
        setAccessError({
          code: "UNKNOWN",
          title: "Unable to Load Organization",
          message: msg || "Failed to load organization workspace.",
        });
      }
    } finally {
      setIsLoading(false);
    }
  };

  const fetchLearners = async () => {
    try {
      setIsLearnersLoading(true);
      const query = new URLSearchParams();
      if (selectedBatchId !== "ALL") query.set("batchId", selectedBatchId);
      if (studentSearch.trim()) query.set("search", studentSearch.trim());

      const data = await apiGet(`/admin/organizations/${orgId}/students?${query.toString()}`);
      setLearners(Array.isArray(data) ? data : []);
    } catch {
      // Quietly ignore secondary errors if org is inaccessible
    } finally {
      setIsLearnersLoading(false);
    }
  };

  const fetchAvailableBatches = async () => {
    try {
      const data = await apiGet(`/admin/organizations/${orgId}/batches`);
      const batchList = Array.isArray(data) ? data : data?.batches || [];
      setBatches(batchList);
      if (batchList.length > 0 && !requestForm.batchId) {
        setRequestForm((prev) => ({ ...prev, batchId: batchList[0].id }));
      }
    } catch {
      // Quietly ignore secondary errors if org is inaccessible
    }
  };

  useEffect(() => {
    if (orgId) {
      fetchOrganizationDetails();
    }
  }, [orgId]);

  useEffect(() => {
    if (org && !accessError) {
      fetchLearners();
    }
  }, [selectedBatchId, studentSearch]);

  // Click outside listener for custom batch dropdown
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (batchDropdownRef.current && !batchDropdownRef.current.contains(e.target as Node)) {
        setIsBatchDropdownOpen(false);
      }
    };
    if (isBatchDropdownOpen) {
      document.addEventListener("mousedown", handleOutsideClick);
    }
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [isBatchDropdownOpen]);

  // Filtered batches for search
  const filteredBatches = useMemo(() => {
    if (!batchSearchTerm.trim()) return batches;
    const q = batchSearchTerm.toLowerCase().trim();
    return batches.filter(
      (b) =>
        b.name?.toLowerCase().includes(q) ||
        (b.programTitle || b.program?.title)?.toLowerCase().includes(q)
    );
  }, [batches, batchSearchTerm]);



  const handleAllocatePoolSubmit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      setIsSubmittingPool(true);
      await apiPost(`/admin/organizations/${orgId}/seat-pools`, {
        batchId: poolForm.batchId,
        totalSeats: Number(poolForm.totalSeats),
        paymentMethod: poolForm.paymentMethod,
        currency: poolForm.currency,
        customPricePerSeat: poolForm.customPricePerSeat ? Number(poolForm.customPricePerSeat) : undefined,
        notes: poolForm.notes,
      });

      toast.success(`Successfully allocated ${poolForm.totalSeats} batch slots.`, "Slots Allocated");

      setIsAllocateModalOpen(false);
      fetchOrganizationDetails();
      fetchLearners();
    } catch (err: any) {
      toast.error(err.message || "Failed to allocate slot pool", "Allocation Failed");
    } finally {
      setIsSubmittingPool(false);
    }
  };

  const handleRequestPoolSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!requestForm.batchId) {
      toast.error("Please select a target cohort batch.", "Batch Required");
      return;
    }
    if (!requestForm.totalSeats || requestForm.totalSeats < 1) {
      toast.error("Please enter a valid seat quantity (minimum 1).", "Invalid Quantity");
      return;
    }
    try {
      setIsSubmittingRequest(true);
      await apiPost(`/admin/organizations/${orgId}/seat-pools/request`, {
        batchId: requestForm.batchId,
        totalSeats: Number(requestForm.totalSeats),
        currency: requestForm.currency || org?.defaultCurrency || "USD",
        paymentMethod: "ONLINE",
        notes: requestForm.notes?.trim() || undefined,
      });

      toast.success(
        `Slot booking request for ${requestForm.totalSeats} seats submitted! WhatBoutMe Admin has been notified to review and approve.`,
        "Request Submitted"
      );
      setIsRequestModalOpen(false);
      setRequestForm({
        batchId: batches[0]?.id || "",
        totalSeats: 10,
        currency: org?.defaultCurrency || "USD",
        notes: "",
      });
      setActiveTab("pools");
      fetchOrganizationDetails();
      fetchLearners();
    } catch (err: any) {
      toast.error(err?.message || "Failed to submit slot booking request", "Request Failed");
    } finally {
      setIsSubmittingRequest(false);
    }
  };

  const handleCancelPool = async (poolId: string, poolCode: string) => {
    if (!window.confirm(`Are you sure you want to cancel slot request ${poolCode}?`)) {
      return;
    }
    try {
      await apiDelete(`/admin/organizations/${orgId}/seat-pools/${poolId}`);
      toast.success(`Slot request ${poolCode} cancelled.`, "Request Cancelled");
      fetchOrganizationDetails();
    } catch (err: any) {
      toast.error(err?.message || "Failed to cancel request", "Action Failed");
    }
  };

  const handleApprovePool = async (poolId: string) => {
    try {
      await apiPost(`/admin/organizations/seat-pools/${poolId}/approve`, {});
      toast.success(
        "Slot request approved! Payment option is now unlocked for the organization.",
        "Request Approved"
      );
      fetchOrganizationDetails();
    } catch (err: any) {
      toast.error(err?.message || "Failed to approve request", "Approval Failed");
    }
  };

  const handleRejectPoolSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedPoolForReject) return;
    try {
      setIsRejecting(true);
      await apiPost(`/admin/organizations/seat-pools/${selectedPoolForReject.id}/reject`, {
        reason: rejectReason.trim() || undefined,
      });
      toast.success("Slot booking request cancelled.", "Request Rejected");
      setIsRejectModalOpen(false);
      setSelectedPoolForReject(null);
      setRejectReason("");
      fetchOrganizationDetails();
    } catch (err: any) {
      toast.error(err?.message || "Failed to reject request", "Action Failed");
    } finally {
      setIsRejecting(false);
    }
  };

  const handleOpenPaymentModal = (pool: any) => {
    setSelectedPoolForPayment(pool);
    setPaymentForm({
      paymentMethod: pool.paymentMethod || "ONLINE",
      notes: "",
    });
    setIsPaymentModalOpen(true);
  };

  const handleCompletePaymentSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedPoolForPayment) return;
    try {
      setIsSubmittingPayment(true);
      await apiPost(`/admin/organizations/${orgId}/seat-pools/${selectedPoolForPayment.id}/pay`, {
        paymentMethod: paymentForm.paymentMethod || "ONLINE",
        notes: paymentForm.notes?.trim() || "Simulated payment completed via Test Bypass Mode",
      });

      toast.success(
        `Payment confirmed! ${selectedPoolForPayment.totalSeats} student seats are now unlocked and active.`,
        "Payment Successful"
      );
      setIsPaymentModalOpen(false);
      setSelectedPoolForPayment(null);
      fetchOrganizationDetails();
      fetchLearners();
      setActiveTab("students");
    } catch (err: any) {
      toast.error(err?.message || "Payment simulation failed", "Payment Error");
    } finally {
      setIsSubmittingPayment(false);
    }
  };

  const handleMarkPaid = async (poolId: string) => {
    try {
      await apiPost(`/admin/organizations/seat-pools/${poolId}/mark-paid`, {
        notes: "Marked paid by WhatBoutMe Administrator via Admin Console",
      });
      toast.success("Seat pool status transitioned to ACTIVE and slots unlocked.", "Payment Confirmed");
      fetchOrganizationDetails();
      fetchLearners();
    } catch (err: any) {
      toast.error(err.message || "Failed to confirm payment", "Payment Error");
    }
  };

  const handleOpenOneOnOneModal = (learner: any) => {
    setActiveEnrolmentForOneOnOne(learner);
    setOneOnOneForm({
      status: learner.gates.gate4OneOnOne.status || "SCHEDULED",
      scheduledAt: learner.gates.gate4OneOnOne.scheduledAt
        ? new Date(learner.gates.gate4OneOnOne.scheduledAt).toISOString().slice(0, 16)
        : "",
      facilitatorName: learner.gates.gate4OneOnOne.facilitatorName || "Roweena",
      meetingUrl: learner.gates.gate4OneOnOne.meetingUrl || "",
      adminNotes: "",
    });
    setIsOneOnOneModalOpen(true);
  };

  const handleSaveOneOnOne = async (e: FormEvent) => {
    e.preventDefault();
    if (!activeEnrolmentForOneOnOne?.enrolmentId) return;
    try {
      await apiPatch(
        `/admin/organizations/enrolments/${activeEnrolmentForOneOnOne.enrolmentId}/one-on-one`,
        oneOnOneForm,
      );
      toast.success(`Status updated to ${oneOnOneForm.status}.`, "1-on-1 Session Updated");
      setIsOneOnOneModalOpen(false);
      fetchLearners();
    } catch (err: any) {
      toast.error(err.message || "Update Failed", "Error");
    }
  };

  const handleOpenReclaimModal = (learner: any) => {
    setActiveSeatForReclaim(learner);
    setReclaimReason("");
    setIsReclaimModalOpen(true);
  };

  const handleConfirmReclaim = async (e: FormEvent) => {
    e.preventDefault();
    if (!activeSeatForReclaim?.seatId) return;
    try {
      setIsReclaiming(true);
      await apiPost(`/admin/organizations/seats/${activeSeatForReclaim.seatId}/reclaim`, {
        reason: reclaimReason.trim(),
      });
      toast.success(`Slot #${activeSeatForReclaim.slotNumber} has been reset to AVAILABLE.`, "Goodwill Reclaim Executed");
      setIsReclaimModalOpen(false);
      fetchOrganizationDetails();
      fetchLearners();
    } catch (err: any) {
      toast.error(err.message || "Reclaim Failed", "Error");
    } finally {
      setIsReclaiming(false);
    }
  };

  const [isRetrying, setIsRetrying] = useState(false);

  if (!mounted) {
    return (
      <div className={styles.dashboard}>
        <div style={{ padding: "4rem 2rem", textAlign: "center", color: "#64748b" }}>
          <p style={{ fontWeight: 600, fontSize: "1rem" }}>Loading organization workspace...</p>
        </div>
      </div>
    );
  }

  if (accessError) {
    return (
      <div className={styles.dashboard}>
        <div
          style={{
            maxWidth: 580,
            margin: "4rem auto",
            padding: "2.75rem 2rem",
            background: "#ffffff",
            borderRadius: "16px",
            border: "1px solid var(--border-light, #f0e6d9)",
            boxShadow: "0 4px 20px rgba(0, 0, 0, 0.05)",
            textAlign: "center",
          }}
        >
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: "50%",
              background: "#fef3c7",
              color: "#d97706",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 1.5rem",
              boxShadow: "0 2px 8px rgba(217, 119, 6, 0.15)",
            }}
          >
            <svg
              width="32"
              height="32"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>

          <h2
            style={{
              fontSize: "1.35rem",
              fontWeight: 700,
              color: "var(--text-primary, #1e1e1e)",
              margin: "0 0 0.75rem",
              letterSpacing: "-0.01em",
            }}
          >
            {accessError.title}
          </h2>

          <p
            style={{
              fontSize: "0.925rem",
              color: "var(--text-muted, #6b7280)",
              lineHeight: 1.55,
              margin: "0 0 2rem",
            }}
          >
            {accessError.message === "Failed to fetch"
              ? "Unable to connect to the backend API. The server may have restarted or connectivity was briefly lost."
              : accessError.message}
          </p>

          <div
            style={{
              display: "flex",
              gap: "12px",
              justifyContent: "center",
              flexWrap: "wrap",
            }}
          >
            <button
              type="button"
              className={styles.primaryBtn}
              disabled={isRetrying}
              onClick={async () => {
                setIsRetrying(true);
                setAccessError(null);
                try {
                  await fetchOrganizationDetails();
                } finally {
                  setIsRetrying(false);
                }
              }}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              {isRetrying ? "Retrying..." : "🔄 Retry Connection"}
            </button>

            {isPlatformAdmin ? (
              <>
                <Link
                  href="/users/organizations"
                  className={styles.secondaryBtn}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    textDecoration: "none",
                  }}
                >
                  ← Back to Organizations Directory
                </Link>
                <Link
                  href="/"
                  className={styles.secondaryBtn}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    textDecoration: "none",
                  }}
                >
                  Admin Dashboard
                </Link>
              </>
            ) : (
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
            )}
          </div>

          <div
            style={{
              marginTop: "2rem",
              paddingTop: "1.25rem",
              borderTop: "1px solid var(--border-light, #f0e6d9)",
              fontSize: "0.8125rem",
              color: "var(--text-muted, #9ca3af)",
            }}
          >
            Need help or think this is an error? Contact{" "}
            <a
              href="mailto:support@whatboutme.com"
              style={{ color: "#d97706", textDecoration: "none", fontWeight: 600 }}
            >
              support@whatboutme.com
            </a>
          </div>
        </div>
      </div>
    );
  }

  if (isLoading || !org) {
    return (
      <div className={styles.dashboard}>
        <div style={{ padding: "40px 0" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <tbody>
              <TableSkeleton rows={6} columns={6} />
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // Active pools only for licensed slots and capacity metrics (exclude unpaid pending requests)
  const activePools = org.seatPools?.filter((p: any) => p.status === "ACTIVE" || p.status === "ACTIVE_UNPAID") || [];
  const totalSlots = activePools.reduce((s: number, p: any) => s + p.totalSeats, 0);
  const assignedSlots = activePools.reduce((s: number, p: any) => s + p.seatsAssigned, 0);
  const consumedSlots = activePools.reduce((s: number, p: any) => s + p.seatsConsumed, 0);
  const availableSlots = activePools.reduce((s: number, p: any) => s + p.seatsAvailable, 0);
  const activeBatchesCount = new Set(activePools.map((p: any) => p.batchId)).size;
  const utilization = totalSlots > 0 ? Math.round(((assignedSlots + consumedSlots) / totalSlots) * 100) : 0;

  // Owner identity resolution
  const ownerMember = org.members?.find((m: any) => m.role === "OWNER");
  const ownerName = ownerMember?.user?.name || org.contactPersonName || "shrada";
  const ownerEmail = ownerMember?.user?.email || org.contactEmail || org.billingEmail || "gagan@foxwel.ai";



  // Pricing calculations for course slot request modal
  const selectedBatchForRequest = batches.find((b) => b.id === requestForm.batchId);
  const requestCurrency = requestForm.currency || org?.defaultCurrency || "USD";
  const getBatchPrice = (batch: any, curr: string) => {
    if (!batch) return 1000;
    if (curr === "AED") return batch.priceAED || 3670;
    if (curr === "INR") return batch.priceINR || 82000;
    return batch.priceUSD || 1000;
  };
  const unitPrice = getBatchPrice(selectedBatchForRequest, requestCurrency);
  const getDiscountPercent = (qty: number) => {
    if (!pricingConfig.enabled) return 0;
    const sorted = [...pricingConfig.tiers].sort((a, b) => b.minSeats - a.minSeats);
    for (const tier of sorted) {
      if (qty >= tier.minSeats) {
        return tier.discountPercent;
      }
    }
    return 0;
  };
  const discountPercent = getDiscountPercent(Number(requestForm.totalSeats) || 0);
  const subtotalAmount = unitPrice * (Number(requestForm.totalSeats) || 0);
  const calculatedDiscount = Math.round((subtotalAmount * discountPercent) / 100);
  const estimatedNetAmount = subtotalAmount - calculatedDiscount;

  return (
    <div className={styles.dashboard}>
      {/* Back Link - Only visible to platform staff */}
      {!isOrgUser && (
        <div style={{ marginBottom: "1rem" }}>
          <Link
            href="/users/organizations"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              color: "#64748b",
              fontSize: "0.85rem",
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            &larr; Back to Organizations Directory
          </Link>
        </div>
      )}

      {/* Organization Header */}
      <header
        style={{
          background: "#ffffff",
          border: "1px solid #e2e8f0",
          borderRadius: "14px",
          padding: "24px 28px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          flexWrap: "wrap",
          gap: "20px",
          marginBottom: "1.5rem",
          boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
        }}
      >
        <div style={{ flex: "1 1 520px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
            <h1 style={{ margin: 0, fontSize: "1.65rem", fontWeight: 700, color: "#0f172a" }}>
              {org.name}
            </h1>
            <span
              style={{
                fontSize: "0.8rem",
                fontWeight: 600,
                color: "#475569",
                background: "#f1f5f9",
                padding: "3px 10px",
                borderRadius: "6px",
                border: "1px solid #e2e8f0",
              }}
            >
              {org.orgCode}
            </span>
            <StatusBadge status={org.status} />
            {org.isAuthorizedReseller && (
              <span
                style={{
                  fontSize: "0.75rem",
                  fontWeight: 700,
                  color: "#0369a1",
                  background: "#e0f2fe",
                  border: "1px solid #bae6fd",
                  padding: "3px 10px",
                  borderRadius: "6px",
                  letterSpacing: "0.5px",
                }}
              >
                AUTHORIZED RESELLER
              </span>
            )}
          </div>

          {/* Prominent Executive Owner Badge */}
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "10px",
              background: "linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)",
              border: "1px solid #fde68a",
              padding: "7px 14px",
              borderRadius: "8px",
              marginTop: "12px",
              boxShadow: "0 1px 2px rgba(217, 119, 6, 0.08)",
            }}
          >
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: "24px",
                height: "24px",
                borderRadius: "6px",
                background: "rgba(217, 119, 6, 0.15)",
                color: "#b45309",
                flexShrink: 0,
              }}
              aria-label="Owner Icon"
            >
              <CrownIcon size={15} />
            </span>
            <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "#92400e" }}>
              Organization Owner:
            </span>
            <span style={{ fontSize: "0.88rem", fontWeight: 700, color: "#78350f" }}>
              {ownerName}
            </span>
            <code style={{ fontSize: "0.82rem", background: "rgba(255,255,255,0.7)", padding: "1px 6px", borderRadius: "4px", color: "#b45309" }}>
              {ownerEmail}
            </code>
            <span
              style={{
                fontSize: "0.7rem",
                fontWeight: 700,
                background: "#b45309",
                color: "#ffffff",
                padding: "2px 7px",
                borderRadius: "4px",
                textTransform: "uppercase",
                letterSpacing: "0.5px",
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
              }}
            >
              <CrownIcon size={11} />
              Owner
            </span>
          </div>

          <div
            style={{
              display: "flex",
              gap: "16px",
              marginTop: "12px",
              color: "#64748b",
              fontSize: "0.84rem",
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            <span>
              <strong>Primary Contact:</strong> {org.contactPersonName || ownerName} ({org.contactEmail || ownerEmail})
            </span>
            <span>&bull;</span>
            <span>
              <strong>Billing Email:</strong> {org.billingEmail || ownerEmail}
            </span>
            <span>&bull;</span>
            <span>
              <strong>Currency:</strong> <span style={{ fontWeight: 700, color: "#0f172a" }}>{org.defaultCurrency || "USD"}</span>
            </span>
            {org.allowedEmailDomains?.length > 0 && (
              <>
                <span>&bull;</span>
                <span>
                  <strong>Allowed Domains:</strong> {org.allowedEmailDomains.join(", ")}
                </span>
              </>
            )}
          </div>
        </div>

        {/* Header Action Buttons */}
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
          {/* Primary Action Button: Purchase / Request Course Slots */}
          <button
            type="button"
            onClick={() => {
              if (batches.length > 0 && !requestForm.batchId) {
                setRequestForm((prev) => ({ ...prev, batchId: batches[0].id }));
              }
              setIsRequestModalOpen(true);
            }}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              padding: "10px 20px",
              borderRadius: "8px",
              border: "none",
              background: "linear-gradient(135deg, #c97a1e 0%, #b45309 100%)",
              color: "#ffffff",
              fontWeight: 700,
              fontSize: "0.88rem",
              cursor: "pointer",
              boxShadow: "0 2px 6px rgba(201, 122, 30, 0.3)",
              transition: "transform 0.1s ease, box-shadow 0.1s ease",
            }}
          >
            <span>+ Purchase / Request Course Slots</span>
          </button>

          <a
            href={`${API_URL}/admin/organizations/${orgId}/export-csv`}
            target="_blank"
            rel="noreferrer"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              padding: "9px 16px",
              borderRadius: "8px",
              border: "1px solid #cbd5e1",
              background: "#ffffff",
              color: "#0f172a",
              fontWeight: 600,
              fontSize: "0.85rem",
              textDecoration: "none",
            }}
          >
            <span>Export CSV Report</span>
          </a>

          {isPlatformAdmin && (
            <button
              type="button"
              onClick={() => {
                setConfirmDeleteEmail("");
                setDeleteError(null);
                setIsDeleteModalOpen(true);
              }}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "9px 14px",
                borderRadius: "8px",
                border: "1px solid #fecdd3",
                background: "#fff1f2",
                color: "#e11d48",
                fontWeight: 600,
                fontSize: "0.85rem",
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
              title={`Permanently delete ${org?.name}`}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </svg>
              <span>Delete Organization</span>
            </button>
          )}

          {isPlatformAdmin && (
            <button
              type="button"
              onClick={() => setIsAllocateModalOpen(true)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "9px 16px",
                borderRadius: "8px",
                border: "1px solid #cbd5e1",
                background: "#f8fafc",
                color: "#334155",
                fontWeight: 600,
                fontSize: "0.85rem",
                cursor: "pointer",
              }}
            >
              <span>Direct Allocate</span>
            </button>
          )}
        </div>
      </header>

      {/* KPI Cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
          gap: "1rem",
          marginBottom: "1.5rem",
        }}
      >
        <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: "10px", padding: "14px 18px" }}>
          <div style={{ fontSize: "0.78rem", fontWeight: 600, color: "#64748b", textTransform: "uppercase" }}>
            Total Licensed Slots
          </div>
          <div style={{ fontSize: "1.6rem", fontWeight: 700, color: "#0f172a", marginTop: "2px" }}>
            {totalSlots}
          </div>
          <div style={{ fontSize: "0.78rem", color: "#94a3b8" }}>Capacity across all pools</div>
        </div>

        <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: "10px", padding: "14px 18px" }}>
          <div style={{ fontSize: "0.78rem", fontWeight: 600, color: "#64748b", textTransform: "uppercase" }}>
            Available Slots
          </div>
          <div style={{ fontSize: "1.6rem", fontWeight: 700, color: "#16a34a", marginTop: "2px" }}>
            {availableSlots}
          </div>
          <div style={{ fontSize: "0.78rem", color: "#94a3b8" }}>Ready for student assignment</div>
        </div>

        <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: "10px", padding: "14px 18px" }}>
          <div style={{ fontSize: "0.78rem", fontWeight: 600, color: "#64748b", textTransform: "uppercase" }}>
            Assigned & Consumed
          </div>
          <div style={{ fontSize: "1.6rem", fontWeight: 700, color: "#c97a1e", marginTop: "2px" }}>
            {assignedSlots + consumedSlots} ({utilization}%)
          </div>
          <div style={{ fontSize: "0.78rem", color: "#94a3b8" }}>{consumedSlots} active in curriculum</div>
        </div>

        <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: "10px", padding: "14px 18px" }}>
          <div style={{ fontSize: "0.78rem", fontWeight: 600, color: "#64748b", textTransform: "uppercase" }}>
            Active Batches
          </div>
          <div style={{ fontSize: "1.6rem", fontWeight: 700, color: "#0f172a", marginTop: "2px" }}>
            {activeBatchesCount}
          </div>
          <div style={{ fontSize: "0.78rem", color: "#94a3b8" }}>Allocated cohort batches</div>
        </div>
      </div>

      {/* Segmented Workspace Tabs */}
      <div
        style={{
          display: "flex",
          gap: "8px",
          borderBottom: "1px solid #e2e8f0",
          marginBottom: "1.25rem",
        }}
      >
        <button
          type="button"
          onClick={() => setActiveTab("students")}
          style={{
            padding: "10px 18px",
            fontSize: "0.9rem",
            fontWeight: 600,
            background: "transparent",
            border: "none",
            borderBottom: activeTab === "students" ? "2px solid #c97a1e" : "2px solid transparent",
            color: activeTab === "students" ? "#c97a1e" : "#64748b",
            cursor: "pointer",
          }}
        >
          Enrolled Students & Slot Tracker ({learners.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("pools")}
          style={{
            padding: "10px 18px",
            fontSize: "0.9rem",
            fontWeight: 600,
            background: "transparent",
            border: "none",
            borderBottom: activeTab === "pools" ? "2px solid #c97a1e" : "2px solid transparent",
            color: activeTab === "pools" ? "#c97a1e" : "#64748b",
            cursor: "pointer",
          }}
        >
          Batch Slot Pools ({org.seatPools?.length || 0})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("billing")}
          style={{
            padding: "10px 18px",
            fontSize: "0.9rem",
            fontWeight: 600,
            background: "transparent",
            border: "none",
            borderBottom: activeTab === "billing" ? "2px solid #c97a1e" : "2px solid transparent",
            color: activeTab === "billing" ? "#c97a1e" : "#64748b",
            cursor: "pointer",
          }}
        >
          Invoices & Billing ({org.invoices?.length || 0})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("team")}
          style={{
            padding: "10px 18px",
            fontSize: "0.9rem",
            fontWeight: 600,
            background: "transparent",
            border: "none",
            borderBottom: activeTab === "team" ? "2px solid #c97a1e" : "2px solid transparent",
            color: activeTab === "team" ? "#c97a1e" : "#64748b",
            cursor: "pointer",
          }}
        >
          Organization Team ({org.members?.length || 0})
        </button>
      </div>

      {/* Tab 1: Enrolled Students & Slot Tracker */}
      {activeTab === "students" && (
        <div>
          {/* Sub-filters */}
          <div
            style={{
              display: "flex",
              gap: "12px",
              alignItems: "center",
              flexWrap: "wrap",
              background: "#ffffff",
              padding: "12px 16px",
              borderRadius: "10px",
              border: "1px solid #e2e8f0",
              marginBottom: "1rem",
            }}
          >
            <div style={{ flex: 1, minWidth: "220px" }}>
              <input
                type="text"
                placeholder="Search students by name, email, slot label, department or order ref..."
                value={studentSearch}
                onChange={(e) => setStudentSearch(e.target.value)}
                style={{
                  width: "100%",
                  padding: "7px 12px",
                  borderRadius: "6px",
                  border: "1px solid #cbd5e1",
                  fontSize: "0.85rem",
                }}
              />
            </div>

            <div style={{ width: "240px" }}>
              <select
                value={selectedBatchId}
                onChange={(e) => setSelectedBatchId(e.target.value)}
                style={{
                  width: "100%",
                  padding: "7px 12px",
                  borderRadius: "6px",
                  border: "1px solid #cbd5e1",
                  fontSize: "0.85rem",
                  background: "#fff",
                }}
              >
                <option value="ALL">All Cohort Batches</option>
                {Array.from(
                  new Map<string, string>(
                    (org.seatPools || [])
                      .filter((p: any) => Boolean(p.batchId))
                      .map((p: any) => [String(p.batchId), String(p.batch?.name || p.poolCode || p.batchId)])
                  ).entries()
                ).map(([batchId, batchName]) => (
                  <option key={batchId} value={batchId}>
                    {batchName}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* 6-Gate Academic Tracker Table */}
          <div
            style={{
              background: "#ffffff",
              borderRadius: "12px",
              border: "1px solid #e2e8f0",
              overflow: "hidden",
            }}
          >
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "0.82rem" }}>
                <thead>
                  <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0", color: "#475569" }}>
                    <th style={{ padding: "10px 14px" }}>Slot #</th>
                    <th style={{ padding: "10px 14px" }}>Student</th>
                    <th style={{ padding: "10px 14px" }}>Status</th>
                    <th style={{ padding: "10px 14px" }}>Dept / Order Ref</th>
                    <th style={{ padding: "10px 14px" }}>Gate 1 (Agreement)</th>
                    <th style={{ padding: "10px 14px" }}>Gate 2 (Curriculum)</th>
                    <th style={{ padding: "10px 14px" }}>Gate 3 (Live)</th>
                    <th style={{ padding: "10px 14px" }}>Gate 4 (1-on-1 Session)</th>
                    <th style={{ padding: "10px 14px" }}>Gate 5 (Exam)</th>
                    <th style={{ padding: "10px 14px" }}>Gate 6 (Certificate)</th>
                    <th style={{ padding: "10px 14px", textAlign: "right" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {isLearnersLoading ? (
                    <TableSkeleton rows={5} columns={11} />
                  ) : learners.length === 0 ? (
                    <tr>
                      <td colSpan={11} style={{ padding: "3rem 1.5rem" }}>
                        <EmptyState
                          title="No slots or students allocated yet"
                          description="Allocate a batch slot pool to pre-materialize numbered slots for this organization."
                          actionLabel="+ Allocate Batch Slots"
                          onAction={() => setIsAllocateModalOpen(true)}
                        />
                      </td>
                    </tr>
                  ) : (
                    learners.map((learner) => {
                      const isAvailable = learner.slotStatus === "AVAILABLE";
                      const studentName = learner.student.name || (isAvailable ? "Unassigned Slot" : "Pending Claim");
                      const studentEmail = learner.student.email || "";

                      return (
                        <tr
                          key={learner.seatId}
                          style={{
                            borderBottom: "1px solid #f1f5f9",
                            background: isAvailable ? "#fafafa" : "transparent",
                          }}
                        >
                          {/* Slot # */}
                          <td style={{ padding: "12px 14px", fontWeight: 700, color: "#0f172a" }}>
                            {learner.slotLabel}
                          </td>

                          {/* Student */}
                          <td style={{ padding: "12px 14px" }}>
                            <div style={{ fontWeight: 600, color: isAvailable ? "#94a3b8" : "#0f172a" }}>
                              {studentName}
                            </div>
                            {studentEmail && (
                              <div style={{ fontSize: "0.75rem", color: "#64748b" }}>{studentEmail}</div>
                            )}
                          </td>

                          {/* Status */}
                          <td style={{ padding: "12px 14px" }}>
                            <span
                              style={{
                                fontSize: "0.72rem",
                                fontWeight: 700,
                                padding: "2px 7px",
                                borderRadius: "4px",
                                background:
                                  learner.slotStatus === "CONSUMED"
                                    ? "#dcfce7"
                                    : learner.slotStatus === "ASSIGNED"
                                    ? "#e0e7ff"
                                    : learner.slotStatus === "INVITED"
                                    ? "#fef3c7"
                                    : "#f1f5f9",
                                color:
                                  learner.slotStatus === "CONSUMED"
                                    ? "#15803d"
                                    : learner.slotStatus === "ASSIGNED"
                                    ? "#4338ca"
                                    : learner.slotStatus === "INVITED"
                                    ? "#b45309"
                                    : "#64748b",
                              }}
                            >
                              {learner.slotStatus}
                            </span>
                          </td>

                          {/* Dept / Order Ref */}
                          <td style={{ padding: "12px 14px" }}>
                            <div style={{ color: "#334155" }}>{learner.department || "—"}</div>
                            {learner.externalOrderRef && (
                              <div style={{ fontSize: "0.72rem", color: "#64748b" }}>
                                Ref: {learner.externalOrderRef}
                              </div>
                            )}
                          </td>

                          {/* Gate 1: Agreement */}
                          <td style={{ padding: "12px 14px" }}>
                            {learner.gates.gate1Agreement.isSatisfied ? (
                              <span style={{ color: "#16a34a", fontWeight: 600 }}>✓ Signed</span>
                            ) : (
                              <span style={{ color: "#94a3b8" }}>Pending</span>
                            )}
                          </td>

                          {/* Gate 2: Curriculum Steps */}
                          <td style={{ padding: "12px 14px" }}>
                            {learner.gates.gate2Curriculum.isSatisfied ? (
                              <span style={{ color: "#16a34a", fontWeight: 600 }}>✓ Complete (11/11)</span>
                            ) : (
                              <span style={{ color: "#475569" }}>
                                {learner.gates.gate2Curriculum.completedLessonsCount} lessons done
                              </span>
                            )}
                          </td>

                          {/* Gate 3: Live Attendance */}
                          <td style={{ padding: "12px 14px" }}>
                            {learner.gates.gate3Attendance.isSatisfied ? (
                              <span style={{ color: "#16a34a", fontWeight: 600 }}>✓ Satisfied</span>
                            ) : (
                              <span style={{ color: "#94a3b8" }}>Pending</span>
                            )}
                          </td>

                          {/* Gate 4: 1-on-1 Session */}
                          <td style={{ padding: "12px 14px" }}>
                            <button
                              type="button"
                              onClick={() => handleOpenOneOnOneModal(learner)}
                              disabled={!learner.enrolmentId}
                              style={{
                                background: "none",
                                border: "none",
                                padding: 0,
                                textAlign: "left",
                                cursor: learner.enrolmentId ? "pointer" : "default",
                                textDecoration: learner.enrolmentId ? "underline" : "none",
                                color:
                                  learner.gates.gate4OneOnOne.status === "COMPLETED"
                                    ? "#16a34a"
                                    : learner.gates.gate4OneOnOne.status === "SCHEDULED"
                                    ? "#0284c7"
                                    : "#64748b",
                                fontWeight: 600,
                                fontSize: "0.8rem",
                              }}
                            >
                              {learner.gates.gate4OneOnOne.status === "COMPLETED"
                                ? "✓ Completed"
                                : learner.gates.gate4OneOnOne.status === "SCHEDULED"
                                ? "Scheduled"
                                : "Not Booked"}
                            </button>
                          </td>

                          {/* Gate 5: Exam */}
                          <td style={{ padding: "12px 14px" }}>
                            {learner.gates.gate5Exam.isSatisfied ? (
                              <span style={{ color: "#16a34a", fontWeight: 600 }}>
                                ✓ Passed {learner.gates.gate5Exam.score ? `(${learner.gates.gate5Exam.score} marks)` : ""}
                              </span>
                            ) : (
                              <span style={{ color: "#94a3b8" }}>Pending</span>
                            )}
                          </td>

                          {/* Gate 6: Certificate */}
                          <td style={{ padding: "12px 14px" }}>
                            {learner.gates.gate6Certificate.isIssued ? (
                              <span style={{ color: "#16a34a", fontWeight: 700 }}>
                                ✓ {learner.gates.gate6Certificate.certificateCode.slice(0, 8)}...
                              </span>
                            ) : (
                              <span style={{ color: "#94a3b8" }}>In Progress</span>
                            )}
                          </td>

                          {/* Actions */}
                          <td style={{ padding: "12px 14px", textAlign: "right" }}>
                            <div style={{ display: "inline-flex", gap: "6px", alignItems: "center" }}>
                              {isAvailable && (
                                <button
                                  type="button"
                                  onClick={() => handleOpenAssignModal(learner)}
                                  style={{
                                    padding: "4px 10px",
                                    fontSize: "0.75rem",
                                    fontWeight: 600,
                                    borderRadius: "4px",
                                    border: "none",
                                    background: "#c97a1e",
                                    color: "#fff",
                                    cursor: "pointer",
                                    whiteSpace: "nowrap",
                                  }}
                                >
                                  Assign Student
                                </button>
                              )}

                              {learner.voucherCodeMasked && (
                                <span
                                  style={{
                                    fontSize: "0.72rem",
                                    fontWeight: 600,
                                    color: "#0369a1",
                                    background: "#e0f2fe",
                                    padding: "2px 6px",
                                    borderRadius: "4px",
                                    whiteSpace: "nowrap",
                                  }}
                                  title="Prepaid Voucher Code"
                                >
                                  {learner.voucherCodeMasked}
                                </span>
                              )}

                              {learner.enrolmentId && (
                                <button
                                  type="button"
                                  onClick={() => handleOpenOneOnOneModal(learner)}
                                  style={{
                                    padding: "4px 8px",
                                    fontSize: "0.74rem",
                                    borderRadius: "4px",
                                    border: "1px solid #cbd5e1",
                                    background: "#fff",
                                    cursor: "pointer",
                                  }}
                                >
                                  1-on-1
                                </button>
                              )}

                              {learner.slotStatus === "CONSUMED" && (
                                <button
                                  type="button"
                                  onClick={() => handleOpenReclaimModal(learner)}
                                  style={{
                                    padding: "4px 8px",
                                    fontSize: "0.74rem",
                                    borderRadius: "4px",
                                    border: "1px solid #fca5a5",
                                    background: "#fef2f2",
                                    color: "#b91c1c",
                                    fontWeight: 600,
                                    cursor: "pointer",
                                  }}
                                  title="Admin Goodwill Reclaim (Revokes dropped student and frees slot)"
                                >
                                  Reclaim
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
          </div>
        </div>
      )}

      {/* Tab 2: Batch Slot Pools */}
      {activeTab === "pools" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {/* Action Banners for Pending Pools */}
          {org.seatPools?.some((p: any) => p.status === "PENDING_APPROVAL") && (
            <div
              style={{
                background: "#fffbeb",
                border: "1px solid #fde68a",
                borderRadius: "10px",
                padding: "14px 18px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: "12px",
              }}
            >
              <div>
                <div style={{ fontWeight: 700, color: "#92400e", fontSize: "0.88rem", display: "flex", alignItems: "center", gap: "6px" }}>
                  <span>⏳</span> Course Slot Request Awaiting Admin Review
                </div>
                <div style={{ fontSize: "0.82rem", color: "#b45309", marginTop: "3px" }}>
                  {isOrgUser
                    ? "Your slot booking request has been submitted to WhatBoutMe administration. Once Roweena or staff approves the request, the Pay Now option will appear below."
                    : `${org.name} has submitted a course slot request awaiting your administrative approval.`}
                </div>
              </div>
            </div>
          )}

          {org.seatPools?.some((p: any) => p.status === "PENDING_PAYMENT") && (
            <div
              style={{
                background: "linear-gradient(135deg, #eff6ff 0%, #f0fdf4 100%)",
                border: "1px solid #bfdbfe",
                borderRadius: "10px",
                padding: "14px 18px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: "12px",
              }}
            >
              <div>
                <div style={{ fontWeight: 700, color: "#1e40af", fontSize: "0.88rem", display: "flex", alignItems: "center", gap: "6px" }}>
                  {isOrgUser ? (
                    <>
                      <span>🎉</span> Slot Request Approved — Payment Required
                    </>
                  ) : (
                    <>
                      <ClockIcon size={15} style={{ color: "#1e40af" }} />
                      Slot Request Approved — Awaiting Organization Payment
                    </>
                  )}
                </div>
                <div style={{ fontSize: "0.82rem", color: "#1e3a8a", marginTop: "3px" }}>
                  {isOrgUser
                    ? "WhatBoutMe Admin has approved your booking! Complete the simulated payment below to unlock and assign your student seats."
                    : `Slot booking request has been approved. Awaiting payment from ${org.name} to activate and unlock the student slots.`}
                </div>
              </div>
            </div>
          )}

          {/* Table Container */}
          <div style={{ background: "#ffffff", borderRadius: "12px", border: "1px solid #e2e8f0", overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "0.85rem" }}>
              <thead>
                <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0", color: "#475569" }}>
                  <th style={{ padding: "12px 16px" }}>Pool Code</th>
                  <th style={{ padding: "12px 16px" }}>Batch & Program</th>
                  <th style={{ padding: "12px 16px" }}>Seats Allocated</th>
                  <th style={{ padding: "12px 16px" }}>Commercial Terms</th>
                  <th style={{ padding: "12px 16px" }}>Status</th>
                  <th style={{ padding: "12px 16px", textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {(!org.seatPools || org.seatPools.length === 0) ? (
                  <tr>
                    <td colSpan={6} style={{ padding: "3rem 1.5rem" }}>
                      <EmptyState
                        title="No course slots purchased yet"
                        description="Book cohort batch slots for your organization learners. Once approved and paid, numbered slots are ready for immediate student assignment."
                        actionLabel="+ Purchase / Request Course Slots"
                        onAction={() => {
                          if (batches.length > 0 && !requestForm.batchId) {
                            setRequestForm((prev) => ({ ...prev, batchId: batches[0].id }));
                          }
                          setIsRequestModalOpen(true);
                        }}
                      />
                    </td>
                  </tr>
                ) : (
                  org.seatPools.map((pool: any) => {
                    const isPendingApproval = pool.status === "PENDING_APPROVAL";
                    const isPendingPayment = pool.status === "PENDING_PAYMENT";
                    const isActive = pool.status === "ACTIVE";

                    return (
                      <tr key={pool.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                        <td style={{ padding: "12px 16px" }}>
                          <div style={{ fontWeight: 700, color: "#0f172a" }}>{pool.poolCode}</div>
                          <div style={{ fontSize: "0.72rem", color: "#94a3b8" }}>
                            {new Date(pool.createdAt).toLocaleDateString()}
                          </div>
                        </td>
                        <td style={{ padding: "12px 16px" }}>
                          <div style={{ fontWeight: 600, color: "#0f172a" }}>{pool.batch?.name || "Batch"}</div>
                          <div style={{ fontSize: "0.75rem", color: "#64748b" }}>{pool.program?.title}</div>
                        </td>
                        <td style={{ padding: "12px 16px" }}>
                          <div style={{ fontWeight: 700, color: "#0f172a" }}>
                            {pool.totalSeats} seats
                          </div>
                          {isActive ? (
                            <div style={{ fontSize: "0.75rem", color: "#16a34a" }}>
                              {pool.seatsAvailable} available &bull; {pool.seatsAssigned} assigned
                            </div>
                          ) : (
                            <div style={{ fontSize: "0.75rem", color: "#94a3b8" }}>
                              Locked until payment
                            </div>
                          )}
                        </td>
                        <td style={{ padding: "12px 16px" }}>
                          <div style={{ fontWeight: 700, color: "#0f172a" }}>
                            {pool.currency} {pool.netAmount?.toLocaleString()}
                          </div>
                          <div style={{ fontSize: "0.75rem", color: "#64748b" }}>
                            ({pool.currency} {pool.pricePerSeat} / seat)
                            {pool.discountAmount > 0 && (
                              <span style={{ color: "#16a34a", marginLeft: "4px" }}>
                                &bull; Save {pool.currency} {pool.discountAmount?.toLocaleString()}
                              </span>
                            )}
                          </div>
                        </td>
                        <td style={{ padding: "12px 16px" }}>
                          <StatusBadge status={pool.status} />
                        </td>
                        <td style={{ padding: "12px 16px", textAlign: "right" }}>
                          <div style={{ display: "inline-flex", gap: "8px", alignItems: "center", justifyContent: "flex-end" }}>
                            {/* State 1: PENDING_APPROVAL */}
                            {isPendingApproval && (
                              <>
                                {isPlatformAdmin ? (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => handleApprovePool(pool.id)}
                                      style={{
                                        padding: "6px 14px",
                                        borderRadius: "6px",
                                        border: "none",
                                        background: "#16a34a",
                                        color: "#fff",
                                        fontWeight: 700,
                                        fontSize: "0.8rem",
                                        cursor: "pointer",
                                      }}
                                    >
                                      ✓ Approve Request
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setSelectedPoolForReject(pool);
                                        setRejectReason("");
                                        setIsRejectModalOpen(true);
                                      }}
                                      style={{
                                        padding: "6px 10px",
                                        borderRadius: "6px",
                                        border: "1px solid #fca5a5",
                                        background: "#fff",
                                        color: "#dc2626",
                                        fontWeight: 600,
                                        fontSize: "0.8rem",
                                        cursor: "pointer",
                                      }}
                                    >
                                      ✕ Reject
                                    </button>
                                  </>
                                ) : (
                                  <div style={{ display: "inline-flex", gap: "8px", alignItems: "center" }}>
                                    <span style={{ color: "#b45309", fontSize: "0.8rem", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: "5px" }}>
                                      <ClockIcon size={13} /> Awaiting Admin Approval
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => handleCancelPool(pool.id, pool.poolCode)}
                                      style={{
                                        padding: "4px 8px",
                                        borderRadius: "6px",
                                        border: "1px solid #e2e8f0",
                                        background: "#fff",
                                        color: "#dc2626",
                                        fontSize: "0.72rem",
                                        fontWeight: 600,
                                        cursor: "pointer",
                                      }}
                                      title="Cancel this slot request"
                                    >
                                      ✕ Cancel
                                    </button>
                                  </div>
                                )}
                              </>
                            )}

                            {/* State 2: PENDING_PAYMENT */}
                            {isPendingPayment && (
                              <div style={{ display: "inline-flex", gap: "8px", alignItems: "center" }}>
                                {isOrgUser ? (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => handleOpenPaymentModal(pool)}
                                      style={{
                                        padding: "7px 16px",
                                        borderRadius: "6px",
                                        border: "none",
                                        background: "linear-gradient(135deg, #c97a1e 0%, #b45309 100%)",
                                        color: "#ffffff",
                                        fontWeight: 700,
                                        fontSize: "0.82rem",
                                        cursor: "pointer",
                                        boxShadow: "0 2px 4px rgba(201, 122, 30, 0.25)",
                                        display: "inline-flex",
                                        alignItems: "center",
                                        gap: "6px",
                                      }}
                                    >
                                      <CreditCardIcon size={14} />
                                      Pay Now ({pool.currency} {pool.netAmount?.toLocaleString()}) &rarr;
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleCancelPool(pool.id, pool.poolCode)}
                                      style={{
                                        padding: "7px 10px",
                                        borderRadius: "6px",
                                        border: "1px solid #e2e8f0",
                                        background: "#ffffff",
                                        color: "#dc2626",
                                        fontWeight: 600,
                                        fontSize: "0.78rem",
                                        cursor: "pointer",
                                      }}
                                      title="Cancel this pending slot request"
                                    >
                                      ✕ Cancel
                                    </button>
                                  </>
                                ) : (
                                  <>
                                    <span
                                      style={{
                                        color: "#b45309",
                                        fontSize: "0.78rem",
                                        fontWeight: 600,
                                        background: "#fef3c7",
                                        border: "1px solid #fde68a",
                                        padding: "5px 10px",
                                        borderRadius: "6px",
                                        display: "inline-flex",
                                        alignItems: "center",
                                        gap: "5px",
                                      }}
                                    >
                                      <ClockIcon size={12} />
                                      Awaiting Org Payment
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => handleCancelPool(pool.id, pool.poolCode)}
                                      style={{
                                        padding: "5px 9px",
                                        borderRadius: "6px",
                                        border: "1px solid #e2e8f0",
                                        background: "#ffffff",
                                        color: "#dc2626",
                                        fontWeight: 600,
                                        fontSize: "0.76rem",
                                        cursor: "pointer",
                                      }}
                                      title="Cancel this slot request"
                                    >
                                      ✕ Cancel
                                    </button>
                                  </>
                                )}
                              </div>
                            )}

                            {/* State 3: ACTIVE */}
                            {isActive && (
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedBatchId(pool.batchId);
                                  setActiveTab("students");
                                }}
                                style={{
                                  padding: "6px 14px",
                                  borderRadius: "6px",
                                  border: "none",
                                  background: "#0284c7",
                                  color: "#ffffff",
                                  fontWeight: 600,
                                  fontSize: "0.82rem",
                                  cursor: "pointer",
                                }}
                              >
                                Assign Students &rarr;
                              </button>
                            )}

                            {/* Staff Fallback: Manual Bypass Unlock */}
                            {isPlatformAdmin && !isActive && (
                              <button
                                type="button"
                                onClick={() => handleMarkPaid(pool.id)}
                                style={{
                                  padding: "4px 8px",
                                  borderRadius: "6px",
                                  border: "1px solid #cbd5e1",
                                  background: "#f8fafc",
                                  color: "#64748b",
                                  fontSize: "0.74rem",
                                  cursor: "pointer",
                                }}
                                title="Admin manual bypass: mark as paid immediately"
                              >
                                Bypass Unlock
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
        </div>
      )}

      {/* Tab 3: Invoices & Billing */}
      {activeTab === "billing" && (
        <div style={{ background: "#ffffff", borderRadius: "12px", border: "1px solid #e2e8f0", overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "0.85rem" }}>
            <thead>
              <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0", color: "#475569" }}>
                <th style={{ padding: "12px 16px" }}>Invoice Number</th>
                <th style={{ padding: "12px 16px" }}>Amount</th>
                <th style={{ padding: "12px 16px" }}>Currency</th>
                <th style={{ padding: "12px 16px" }}>Status</th>
                <th style={{ padding: "12px 16px" }}>Date Issued</th>
              </tr>
            </thead>
            <tbody>
              {org.invoices?.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ padding: "24px", textAlign: "center", color: "#94a3b8" }}>
                    No invoices generated yet. Invoices are issued automatically upon seat pool activation.
                  </td>
                </tr>
              ) : (
                org.invoices?.map((inv: any) => (
                  <tr key={inv.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                    <td style={{ padding: "12px 16px", fontWeight: 700 }}>{inv.invoiceNumber}</td>
                    <td style={{ padding: "12px 16px", fontWeight: 600 }}>{inv.amount.toLocaleString()}</td>
                    <td style={{ padding: "12px 16px" }}>{inv.currency}</td>
                    <td style={{ padding: "12px 16px" }}>
                      <StatusBadge status={inv.status} />
                    </td>
                    <td style={{ padding: "12px 16px", color: "#64748b" }}>
                      {new Date(inv.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Tab 4: Team Admins */}
      {activeTab === "team" && (
        <div style={{ background: "#ffffff", borderRadius: "12px", border: "1px solid #e2e8f0", overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "0.85rem" }}>
            <thead>
              <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0", color: "#475569" }}>
                <th style={{ padding: "12px 16px" }}>Member Name</th>
                <th style={{ padding: "12px 16px" }}>Email</th>
                <th style={{ padding: "12px 16px" }}>Role</th>
                <th style={{ padding: "12px 16px" }}>Title</th>
                <th style={{ padding: "12px 16px" }}>Joined</th>
              </tr>
            </thead>
            <tbody>
              {(!org.members || org.members.length === 0) ? (
                <tr>
                  <td colSpan={5} style={{ padding: "24px", textAlign: "center", color: "#94a3b8" }}>
                    No team members assigned yet.
                  </td>
                </tr>
              ) : (
                org.members.map((m: any) => (
                <tr key={m.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                  <td style={{ padding: "12px 16px", fontWeight: 600 }}>{m.user?.name || "Member"}</td>
                  <td style={{ padding: "12px 16px", color: "#475569" }}>{m.user?.email}</td>
                  <td style={{ padding: "12px 16px" }}>
                    <span
                      style={{
                        padding: "2px 8px",
                        borderRadius: "4px",
                        fontSize: "0.75rem",
                        fontWeight: 700,
                        background: m.role === "OWNER" ? "#fef3c7" : "#f1f5f9",
                        color: m.role === "OWNER" ? "#b45309" : "#475569",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "4px",
                      }}
                    >
                      {m.role === "OWNER" && <CrownIcon size={12} />}
                      {m.role}
                    </span>
                  </td>
                  <td style={{ padding: "12px 16px", color: "#64748b" }}>{m.title || "—"}</td>
                  <td style={{ padding: "12px 16px", color: "#94a3b8" }}>
                    {new Date(m.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal: Allocate Batch Slots */}
      <Modal
        isOpen={isAllocateModalOpen}
        onClose={() => setIsAllocateModalOpen(false)}
        title={`Allocate Batch Slots for ${org.name}`}
      >
        <form onSubmit={handleAllocatePoolSubmit} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          <div>
            <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, marginBottom: "4px" }}>
              Target Cohort Batch *
            </label>
            <select
              required
              value={poolForm.batchId}
              onChange={(e) => setPoolForm({ ...poolForm, batchId: e.target.value })}
              style={{ width: "100%", padding: "8px 12px", borderRadius: "6px", border: "1px solid #cbd5e1", background: "#fff" }}
            >
              <option value="">Select an upcoming batch...</option>
              {batches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} ({b.program?.title || "Program"}) — Cap: {b.capacity}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <div>
              <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, marginBottom: "4px" }}>
                Total Number of Slots (e.g. 30) *
              </label>
              <input
                type="number"
                min={1}
                required
                value={poolForm.totalSeats}
                onChange={(e) => setPoolForm({ ...poolForm, totalSeats: Number(e.target.value) })}
                style={{ width: "100%", padding: "8px 12px", borderRadius: "6px", border: "1px solid #cbd5e1" }}
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, marginBottom: "4px" }}>
                Payment Method
              </label>
              <select
                value={poolForm.paymentMethod}
                onChange={(e) => setPoolForm({ ...poolForm, paymentMethod: e.target.value })}
                style={{ width: "100%", padding: "8px 12px", borderRadius: "6px", border: "1px solid #cbd5e1", background: "#fff" }}
              >
                <option value="ONLINE">Online Checkout Link (15-min reservation hold)</option>
                <option value="INVOICE_OFFLINE">Institutional Invoice (Net-30 PO Wire)</option>
                <option value="COMPLIMENTARY">Complimentary / Scholarship (Instant Active)</option>
              </select>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <div>
              <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, marginBottom: "4px" }}>
                Currency
              </label>
              <select
                value={poolForm.currency}
                onChange={(e) => setPoolForm({ ...poolForm, currency: e.target.value })}
                style={{ width: "100%", padding: "8px 12px", borderRadius: "6px", border: "1px solid #cbd5e1", background: "#fff" }}
              >
                <option value="USD">USD ($)</option>
                <option value="AED">AED (AED)</option>
                <option value="INR">INR (₹)</option>
              </select>
            </div>

            <div>
              <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, marginBottom: "4px" }}>
                Negotiated Price Override / Seat (Optional)
              </label>
              <input
                type="number"
                step="0.01"
                placeholder="Leave blank for volume tier"
                value={poolForm.customPricePerSeat}
                onChange={(e) => setPoolForm({ ...poolForm, customPricePerSeat: e.target.value })}
                style={{ width: "100%", padding: "8px 12px", borderRadius: "6px", border: "1px solid #cbd5e1" }}
              />
            </div>
          </div>

          <div>
            <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, marginBottom: "4px" }}>
              Administrative Notes
            </label>
            <textarea
              rows={2}
              placeholder="Internal partnership notes, purchase order references..."
              value={poolForm.notes}
              onChange={(e) => setPoolForm({ ...poolForm, notes: e.target.value })}
              style={{ width: "100%", padding: "8px 12px", borderRadius: "6px", border: "1px solid #cbd5e1" }}
            />
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "10px" }}>
            <button
              type="button"
              onClick={() => setIsAllocateModalOpen(false)}
              style={{ padding: "8px 16px", borderRadius: "6px", border: "1px solid #cbd5e1", background: "#f8fafc" }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmittingPool}
              style={{
                padding: "8px 20px",
                borderRadius: "6px",
                border: "none",
                background: "#c97a1e",
                color: "#ffffff",
                fontWeight: 600,
                cursor: isSubmittingPool ? "not-allowed" : "pointer",
              }}
            >
              {isSubmittingPool ? "Allocating..." : "Allocate Slots"}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal: Manage 1-on-1 Session */}
      <Modal
        isOpen={isOneOnOneModalOpen}
        onClose={() => setIsOneOnOneModalOpen(false)}
        title={`Manage 1-on-1 Mentorship Session`}
      >
        <form onSubmit={handleSaveOneOnOne} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          <div>
            <div style={{ fontSize: "0.88rem", fontWeight: 600, color: "#0f172a" }}>
              Student: {activeEnrolmentForOneOnOne?.student.name} ({activeEnrolmentForOneOnOne?.student.email})
            </div>
            <div style={{ fontSize: "0.78rem", color: "#64748b" }}>
              Slot: {activeEnrolmentForOneOnOne?.slotLabel} &bull; Batch: {activeEnrolmentForOneOnOne?.batchName}
            </div>
          </div>

          <div>
            <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, marginBottom: "4px" }}>
              Gate 4 Session Status
            </label>
            <select
              value={oneOnOneForm.status}
              onChange={(e) => setOneOnOneForm({ ...oneOnOneForm, status: e.target.value })}
              style={{ width: "100%", padding: "8px 12px", borderRadius: "6px", border: "1px solid #cbd5e1", background: "#fff" }}
            >
              <option value="NOT_BOOKED">Not Booked</option>
              <option value="SCHEDULED">Scheduled</option>
              <option value="COMPLETED">Completed (Gate Satisfied)</option>
              <option value="NO_SHOW">No-Show / Reschedule Needed</option>
              <option value="WAIVED_BY_ADMIN">Waived by Admin</option>
            </select>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <div>
              <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, marginBottom: "4px" }}>
                Facilitator
              </label>
              <input
                type="text"
                value={oneOnOneForm.facilitatorName}
                onChange={(e) => setOneOnOneForm({ ...oneOnOneForm, facilitatorName: e.target.value })}
                style={{ width: "100%", padding: "8px 12px", borderRadius: "6px", border: "1px solid #cbd5e1" }}
              />
            </div>
            <div>
              <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, marginBottom: "4px" }}>
                Scheduled Date & Time
              </label>
              <input
                type="datetime-local"
                value={oneOnOneForm.scheduledAt}
                onChange={(e) => setOneOnOneForm({ ...oneOnOneForm, scheduledAt: e.target.value })}
                style={{ width: "100%", padding: "8px 12px", borderRadius: "6px", border: "1px solid #cbd5e1" }}
              />
            </div>
          </div>

          <div>
            <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, marginBottom: "4px" }}>
              Zoom / Meeting URL
            </label>
            <input
              type="url"
              placeholder="https://zoom.us/j/..."
              value={oneOnOneForm.meetingUrl}
              onChange={(e) => setOneOnOneForm({ ...oneOnOneForm, meetingUrl: e.target.value })}
              style={{ width: "100%", padding: "8px 12px", borderRadius: "6px", border: "1px solid #cbd5e1" }}
            />
          </div>

          <div>
            <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, marginBottom: "4px" }}>
              Private Faculty Notes (visible to staff only)
            </label>
            <textarea
              rows={3}
              placeholder="Discussion summary, clinical observations, recommendations..."
              value={oneOnOneForm.adminNotes}
              onChange={(e) => setOneOnOneForm({ ...oneOnOneForm, adminNotes: e.target.value })}
              style={{ width: "100%", padding: "8px 12px", borderRadius: "6px", border: "1px solid #cbd5e1" }}
            />
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "10px" }}>
            <button
              type="button"
              onClick={() => setIsOneOnOneModalOpen(false)}
              style={{ padding: "8px 16px", borderRadius: "6px", border: "1px solid #cbd5e1", background: "#f8fafc" }}
            >
              Cancel
            </button>
            <button
              type="submit"
              style={{
                padding: "8px 20px",
                borderRadius: "6px",
                border: "none",
                background: "#c97a1e",
                color: "#ffffff",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Save Session Status
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal: Admin Goodwill Reclaim */}
      <Modal
        isOpen={isReclaimModalOpen}
        onClose={() => setIsReclaimModalOpen(false)}
        title="Admin Goodwill Reclaim"
      >
        <form onSubmit={handleConfirmReclaim} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "8px", padding: "12px 16px", color: "#991b1b", fontSize: "0.85rem" }}>
            <strong>Warning:</strong> Executing a Goodwill Reclaim will cancel the enrolled student&apos;s access (
            {activeSeatForReclaim?.student?.email}) and immediately return Slot #{activeSeatForReclaim?.slotNumber} back to{" "}
            <strong>AVAILABLE</strong> status for the Organization to reassign.
          </div>

          <div>
            <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, marginBottom: "4px" }}>
              Mandatory Audit Justification Reason *
            </label>
            <textarea
              required
              rows={3}
              placeholder="e.g. Student dropped out due to medical leave; organization requested replacement slot per enterprise agreement."
              value={reclaimReason}
              onChange={(e) => setReclaimReason(e.target.value)}
              style={{ width: "100%", padding: "8px 12px", borderRadius: "6px", border: "1px solid #cbd5e1" }}
            />
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "10px" }}>
            <button
              type="button"
              onClick={() => setIsReclaimModalOpen(false)}
              style={{ padding: "8px 16px", borderRadius: "6px", border: "1px solid #cbd5e1", background: "#f8fafc" }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isReclaiming || reclaimReason.trim().length < 5}
              style={{
                padding: "8px 20px",
                borderRadius: "6px",
                border: "none",
                background: "#dc2626",
                color: "#ffffff",
                fontWeight: 600,
                cursor: isReclaiming ? "not-allowed" : "pointer",
              }}
            >
              {isReclaiming ? "Reclaiming..." : "Confirm Goodwill Reclaim"}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal: Assign Student to Slot */}
      <Modal
        isOpen={isAssignModalOpen}
        onClose={() => setIsAssignModalOpen(false)}
        title={`Assign Student to Slot: ${selectedSeatForAssign?.slotLabel || "Slot"}`}
      >
        {assignedResult ? (
          <div style={{ textAlign: "center", padding: "12px 0" }}>
            <div style={{ fontSize: "2.8rem", marginBottom: "8px" }}>🎉</div>
            <h3 style={{ fontSize: "1.15rem", fontWeight: 700, color: "#0f172a", marginBottom: "6px" }}>
              Student Enrolled &amp; Slot Allocated!
            </h3>
            <p style={{ fontSize: "0.88rem", color: "#64748b", marginBottom: "1.2rem", lineHeight: 1.5 }}>
              {assignedResult.isNewUser
                ? `An account setup email with LMS activation link has been dispatched to ${assignedResult.user?.email || assignForm.email}.`
                : `Student account resolved and course enrolled. A notification email has been dispatched to ${assignedResult.user?.email || assignForm.email}.`}
            </p>

            {/* Direct Setup Link Card */}
            {assignedResult.setupUrl && (
              <div
                style={{
                  background: "#f8fafc",
                  border: "1px solid #cbd5e1",
                  borderRadius: "10px",
                  padding: "16px",
                  margin: "1rem 0",
                  textAlign: "left",
                }}
              >
                <div style={{ fontSize: "0.75rem", color: "#64748b", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "6px" }}>
                  Direct Student Setup &amp; Activation Link
                </div>
                <div
                  style={{
                    fontSize: "0.82rem",
                    color: "#0f172a",
                    background: "#ffffff",
                    padding: "10px 12px",
                    borderRadius: "6px",
                    border: "1px solid #e2e8f0",
                    wordBreak: "break-all",
                    fontFamily: "monospace",
                    lineHeight: 1.4,
                  }}
                >
                  {assignedResult.setupUrl}
                </div>
                <div style={{ display: "flex", gap: "8px", marginTop: "10px" }}>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(assignedResult.setupUrl);
                      toast.success("Account setup link copied to clipboard!", "Link Copied");
                    }}
                    style={{
                      padding: "7px 16px",
                      background: "#c97a1e",
                      color: "#ffffff",
                      borderRadius: "6px",
                      border: "none",
                      fontWeight: 600,
                      fontSize: "0.82rem",
                      cursor: "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px",
                    }}
                  >
                    📋 Copy Setup Link
                  </button>
                  <a
                    href={assignedResult.setupUrl}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      padding: "7px 14px",
                      background: "#ffffff",
                      color: "#475569",
                      borderRadius: "6px",
                      border: "1px solid #cbd5e1",
                      fontWeight: 600,
                      fontSize: "0.82rem",
                      textDecoration: "none",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "4px",
                    }}
                  >
                    Open in LMS &rarr;
                  </a>
                </div>
              </div>
            )}

            {assignedResult.voucherCode && (
              <div
                style={{
                  background: "#f8fafc",
                  border: "2px dashed #cbd5e1",
                  borderRadius: "8px",
                  padding: "14px",
                  margin: "1rem 0",
                }}
              >
                <div style={{ fontSize: "0.75rem", color: "#64748b", fontWeight: 600, textTransform: "uppercase" }}>
                  Prepaid Reseller Voucher Code
                </div>
                <div
                  style={{
                    fontSize: "1.3rem",
                    fontWeight: 700,
                    letterSpacing: "2px",
                    color: "#c97a1e",
                    fontFamily: "monospace",
                    margin: "6px 0",
                  }}
                >
                  {assignedResult.voucherCode}
                </div>
                <div style={{ fontSize: "0.75rem", color: "#94a3b8" }}>
                  Student redeems at: <code style={{ color: "#0284c7" }}>/org-invite/claim</code> with $0 checkout
                </div>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(assignedResult.voucherCode);
                    toast.success("Voucher code copied to clipboard!", "Copied");
                  }}
                  style={{
                    marginTop: "8px",
                    padding: "6px 14px",
                    background: "#c97a1e",
                    color: "#fff",
                    borderRadius: "6px",
                    border: "none",
                    fontWeight: 600,
                    fontSize: "0.8rem",
                    cursor: "pointer",
                  }}
                >
                  Copy Voucher Code
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={() => {
                setIsAssignModalOpen(false);
                setAssignedResult(null);
              }}
              style={{
                marginTop: "12px",
                padding: "9px 28px",
                background: "#0f172a",
                color: "#ffffff",
                borderRadius: "8px",
                border: "none",
                fontWeight: 600,
                fontSize: "0.88rem",
                cursor: "pointer",
              }}
            >
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={handleAssignSubmit} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <div style={{ fontSize: "0.82rem", color: "#64748b" }}>
              Batch Cohort: <strong>{selectedSeatForAssign?.batchName || "Active Cohort"}</strong> &bull; Pool: <strong>{selectedSeatForAssign?.poolCode}</strong>
            </div>

            <div>
              <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, marginBottom: "4px" }}>
                Student Email Address *
              </label>
              <input
                type="email"
                required
                placeholder="student@example.com"
                value={assignForm.email}
                onChange={(e) => setAssignForm({ ...assignForm, email: e.target.value })}
                style={{ width: "100%", padding: "8px 12px", borderRadius: "6px", border: "1px solid #cbd5e1" }}
              />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
              <div>
                <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, marginBottom: "4px" }}>
                  Student Full Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. John Doe"
                  value={assignForm.fullName}
                  onChange={(e) => setAssignForm({ ...assignForm, fullName: e.target.value })}
                  style={{ width: "100%", padding: "8px 12px", borderRadius: "6px", border: "1px solid #cbd5e1" }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, marginBottom: "4px" }}>
                  Phone Number
                </label>
                <input
                  type="text"
                  placeholder="+971 50 123 4567"
                  value={assignForm.phone}
                  onChange={(e) => setAssignForm({ ...assignForm, phone: e.target.value })}
                  style={{ width: "100%", padding: "8px 12px", borderRadius: "6px", border: "1px solid #cbd5e1" }}
                />
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
              <div>
                <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, marginBottom: "4px" }}>
                  Department / Division
                </label>
                <input
                  type="text"
                  placeholder="e.g. Computer Science 2026"
                  value={assignForm.department}
                  onChange={(e) => setAssignForm({ ...assignForm, department: e.target.value })}
                  style={{ width: "100%", padding: "8px 12px", borderRadius: "6px", border: "1px solid #cbd5e1" }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, marginBottom: "4px" }}>
                  Org Order Ref / Invoice #
                </label>
                <input
                  type="text"
                  placeholder="e.g. PO-8823"
                  value={assignForm.externalOrderRef}
                  onChange={(e) => setAssignForm({ ...assignForm, externalOrderRef: e.target.value })}
                  style={{ width: "100%", padding: "8px 12px", borderRadius: "6px", border: "1px solid #cbd5e1" }}
                />
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
              <div>
                <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, marginBottom: "4px" }}>
                  Tuition / Resale Price Charged by Org
                </label>
                <input
                  type="number"
                  placeholder="e.g. 500"
                  value={assignForm.resalePrice}
                  onChange={(e) => setAssignForm({ ...assignForm, resalePrice: e.target.value })}
                  style={{ width: "100%", padding: "8px 12px", borderRadius: "6px", border: "1px solid #cbd5e1" }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, marginBottom: "4px" }}>
                  Redemption Mode
                </label>
                <select
                  value={assignForm.redemptionMode}
                  onChange={(e) => setAssignForm({ ...assignForm, redemptionMode: e.target.value as any })}
                  style={{ width: "100%", padding: "8px 12px", borderRadius: "6px", border: "1px solid #cbd5e1", background: "#fff" }}
                >
                  <option value="EMAIL_INVITE">Email Invitation Link</option>
                  <option value="VOUCHER_CODE">Prepaid Reseller Voucher Code</option>
                </select>
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "12px" }}>
              <button
                type="button"
                onClick={() => setIsAssignModalOpen(false)}
                style={{ padding: "8px 16px", borderRadius: "6px", border: "1px solid #cbd5e1", background: "#f8fafc" }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmittingAssign || !assignForm.email.trim()}
                style={{
                  padding: "8px 20px",
                  borderRadius: "6px",
                  border: "none",
                  background: "#c97a1e",
                  color: "#ffffff",
                  fontWeight: 600,
                  cursor: isSubmittingAssign ? "not-allowed" : "pointer",
                }}
              >
                {isSubmittingAssign ? "Assigning..." : "Assign Student to Slot"}
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* Modal: Purchase / Request Course Slots */}
      <Modal
        isOpen={isRequestModalOpen}
        onClose={() => {
          if (isSubmittingRequest) return;
          setIsRequestModalOpen(false);
          setIsBatchDropdownOpen(false);
        }}
        maxWidth="680px"
        title="Purchase / Request Course Slots"
        subtitle={`Select a cohort batch and allocate student seats for ${org?.name || "your organization"}`}
        footer={
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" }}>
            <button
              type="button"
              onClick={() => {
                setIsRequestModalOpen(false);
                setIsBatchDropdownOpen(false);
              }}
              disabled={isSubmittingRequest}
              style={{
                padding: "9px 18px",
                borderRadius: "8px",
                border: "1px solid #cbd5e1",
                background: "#ffffff",
                color: "#475569",
                fontWeight: 600,
                fontSize: "0.86rem",
                cursor: isSubmittingRequest ? "not-allowed" : "pointer",
                transition: "all 0.15s ease",
              }}
            >
              Cancel
            </button>
            {(() => {
              const hasPending = Boolean(
                requestForm.batchId &&
                org?.seatPools?.some(
                  (p: any) =>
                    p.batchId === requestForm.batchId &&
                    (p.status === "PENDING_APPROVAL" || p.status === "PENDING_PAYMENT")
                )
              );
              const isDisabled = isSubmittingRequest || !requestForm.batchId || hasPending || (Number(requestForm.totalSeats) || 0) < 1;
              return (
                <button
                  type="button"
                  onClick={handleRequestPoolSubmit}
                  disabled={isDisabled}
                  style={{
                    padding: "10px 24px",
                    borderRadius: "8px",
                    border: "none",
                    background: isDisabled ? "#e2e8f0" : "linear-gradient(135deg, #c97a1e 0%, #b45309 100%)",
                    color: isDisabled ? "#94a3b8" : "#ffffff",
                    fontWeight: 700,
                    fontSize: "0.9rem",
                    cursor: isDisabled ? "not-allowed" : "pointer",
                    boxShadow: isDisabled ? "none" : "0 3px 8px rgba(201, 122, 30, 0.3)",
                    transition: "all 0.15s ease",
                  }}
                >
                  {isSubmittingRequest ? "Submitting Booking..." : "Submit Booking Request to WhatBoutMe Admin →"}
                </button>
              );
            })()}
          </div>
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
          {/* Target Course & Cohort Batch Custom Selector */}
          <div style={{ position: "relative" }} ref={batchDropdownRef}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
              <label style={{ fontSize: "0.84rem", fontWeight: 700, color: "#1e293b" }}>
                Target Course & Cohort Batch <span style={{ color: "#dc2626" }}>*</span>
              </label>
              {selectedBatchForRequest && (
                <span style={{ fontSize: "0.76rem", color: "#64748b" }}>
                  Selected: <strong>{selectedBatchForRequest.name}</strong>
                </span>
              )}
            </div>

            {/* Trigger Button Card */}
            <button
              type="button"
              onClick={() => setIsBatchDropdownOpen(!isBatchDropdownOpen)}
              style={{
                width: "100%",
                textAlign: "left",
                background: "#ffffff",
                border: isBatchDropdownOpen ? "2px solid #c97a1e" : "1px solid #cbd5e1",
                borderRadius: "10px",
                padding: "12px 14px",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "12px",
                transition: "all 0.15s ease",
                boxShadow: isBatchDropdownOpen ? "0 0 0 3px rgba(201, 122, 30, 0.15)" : "0 1px 2px rgba(0,0,0,0.03)",
              }}
            >
              {selectedBatchForRequest ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "4px", minWidth: 0, flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                    <span style={{ fontWeight: 700, fontSize: "0.95rem", color: "#0f172a" }}>
                      {selectedBatchForRequest.name}
                    </span>
                    {selectedBatchForRequest.programTitle && !selectedBatchForRequest.name.toLowerCase().includes(selectedBatchForRequest.programTitle.toLowerCase()) && (
                      <span style={{ fontSize: "0.72rem", fontWeight: 700, background: "#fef3c7", color: "#92400e", padding: "2px 8px", borderRadius: "10px" }}>
                        {selectedBatchForRequest.programTitle}
                      </span>
                    )}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "0.78rem", color: "#64748b" }}>
                    <span>📅 Starts: {selectedBatchForRequest.startDate ? new Date(selectedBatchForRequest.startDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "TBD"}</span>
                    <span>&bull;</span>
                    <span style={{ color: selectedBatchForRequest.availableSeats > 0 ? "#16a34a" : "#dc2626", fontWeight: 600 }}>
                      {selectedBatchForRequest.availableSeats > 0 ? `✓ ${selectedBatchForRequest.availableSeats.toLocaleString()} seats available` : "Sold Out (0 seats)"}
                    </span>
                  </div>
                </div>
              ) : (
                <span style={{ color: "#94a3b8", fontSize: "0.9rem" }}>Select a course cohort batch...</span>
              )}
              <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "#64748b" }}>
                <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "#c97a1e" }}>
                  {isBatchDropdownOpen ? "Close" : "Change"}
                </span>
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#c97a1e"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{ transform: isBatchDropdownOpen ? "rotate(180deg)" : "none", transition: "transform 0.2s ease", flexShrink: 0 }}
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </div>
            </button>

            {/* Custom Dropdown List */}
            {isBatchDropdownOpen && (
              <div
                style={{
                  position: "absolute",
                  top: "calc(100% + 6px)",
                  left: 0,
                  right: 0,
                  background: "#ffffff",
                  border: "1px solid #e2e8f0",
                  borderRadius: "12px",
                  boxShadow: "0 14px 30px -4px rgba(0, 0, 0, 0.15), 0 4px 10px -2px rgba(0, 0, 0, 0.06)",
                  zIndex: 100,
                  maxHeight: "310px",
                  display: "flex",
                  flexDirection: "column",
                  overflow: "hidden",
                  animation: "fadeIn 0.15s ease-out",
                }}
              >
                {batches.length > 3 && (
                  <div style={{ padding: "8px 10px", borderBottom: "1px solid #f1f5f9", background: "#f8fafc" }}>
                    <input
                      type="text"
                      placeholder="Search by cohort or course name..."
                      value={batchSearchTerm}
                      onChange={(e) => setBatchSearchTerm(e.target.value)}
                      style={{
                        width: "100%",
                        padding: "8px 12px",
                        borderRadius: "8px",
                        border: "1px solid #cbd5e1",
                        fontSize: "0.84rem",
                        background: "#fff",
                        outline: "none",
                      }}
                      onClick={(e) => e.stopPropagation()}
                      autoFocus
                    />
                  </div>
                )}
                <div style={{ overflowY: "auto", flex: 1, padding: "6px" }}>
                  {filteredBatches.length === 0 ? (
                    <div style={{ padding: "20px", textAlign: "center", color: "#94a3b8", fontSize: "0.85rem" }}>
                      No matching cohort batches found.
                    </div>
                  ) : (
                    filteredBatches.map((b) => {
                      const isSelected = b.id === requestForm.batchId;
                      const isSoldOut = (b.availableSeats || 0) <= 0;
                      const hasPending = org?.seatPools?.some(
                        (p: any) => p.batchId === b.id && (p.status === "PENDING_APPROVAL" || p.status === "PENDING_PAYMENT")
                      );
                      const hasActive = org?.seatPools?.some(
                        (p: any) => p.batchId === b.id && (p.status === "ACTIVE" || p.status === "ACTIVE_UNPAID")
                      );

                      return (
                        <div
                          key={b.id}
                          onClick={() => {
                            if (hasPending) return;
                            setRequestForm((prev) => ({ ...prev, batchId: b.id }));
                            setIsBatchDropdownOpen(false);
                          }}
                          style={{
                            padding: "10px 14px",
                            borderRadius: "8px",
                            background: isSelected ? "#fef3c7" : "transparent",
                            cursor: hasPending ? "not-allowed" : "pointer",
                            opacity: hasPending ? 0.6 : isSoldOut ? 0.65 : 1,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: "10px",
                            transition: "background 0.12s ease",
                            border: isSelected ? "1.5px solid #fde68a" : "1.5px solid transparent",
                            marginBottom: "4px",
                          }}
                          onMouseEnter={(e) => {
                            if (!isSelected && !hasPending) e.currentTarget.style.background = "#faf8f5";
                          }}
                          onMouseLeave={(e) => {
                            if (!isSelected && !hasPending) e.currentTarget.style.background = "transparent";
                          }}
                        >
                          <div style={{ display: "flex", flexDirection: "column", gap: "3px", minWidth: 0 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                              <span style={{ fontWeight: 700, fontSize: "0.9rem", color: isSelected ? "#92400e" : "#0f172a" }}>
                                {b.name}
                              </span>
                              {hasPending && (
                                <span style={{ fontSize: "0.7rem", fontWeight: 700, background: "#fef3c7", color: "#b45309", padding: "1px 7px", borderRadius: "10px" }}>
                                  ⏳ Request Pending
                                </span>
                              )}
                              {hasActive && (
                                <span style={{ fontSize: "0.7rem", fontWeight: 700, background: "#eff6ff", color: "#1d4ed8", padding: "1px 7px", borderRadius: "10px" }}>
                                  Top-up
                                </span>
                              )}
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.76rem", color: "#64748b" }}>
                              <span>📅 Starts {b.startDate ? new Date(b.startDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "TBD"}</span>
                              <span>&bull;</span>
                              <span style={{ color: isSoldOut ? "#dc2626" : "#16a34a", fontWeight: 600 }}>
                                {isSoldOut ? "0 seats remaining" : `${b.availableSeats?.toLocaleString()} seats remaining`}
                              </span>
                            </div>
                          </div>
                          {isSelected && (
                            <span style={{ color: "#c97a1e", fontWeight: 800, fontSize: "1.1rem" }}>✓</span>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}

            {/* Context Notice for Selected Batch */}
            {(() => {
              if (!requestForm.batchId) return null;
              const activePool = org?.seatPools?.find(
                (p: any) => p.batchId === requestForm.batchId && (p.status === "ACTIVE" || p.status === "ACTIVE_UNPAID")
              );
              const pendingPool = org?.seatPools?.find(
                (p: any) => p.batchId === requestForm.batchId && (p.status === "PENDING_APPROVAL" || p.status === "PENDING_PAYMENT")
              );
              if (pendingPool) {
                return (
                  <div style={{ marginTop: "10px", background: "#fffbeb", border: "1px solid #fde68a", padding: "10px 14px", borderRadius: "8px", fontSize: "0.82rem", color: "#92400e" }}>
                    ⚠️ <strong>Pending Request Exists:</strong> Request <strong>{pendingPool.poolCode}</strong> ({pendingPool.totalSeats} seats) for this batch is currently {pendingPool.status === "PENDING_APPROVAL" ? "awaiting admin approval" : "awaiting payment"}. Please complete or cancel the existing request before requesting more slots.
                  </div>
                );
              }
              if (activePool) {
                return (
                  <div style={{ marginTop: "10px", background: "#f0fdf4", border: "1px solid #bbf7d0", padding: "10px 14px", borderRadius: "8px", fontSize: "0.82rem", color: "#166534" }}>
                    ℹ️ <strong>Top-Up Allocation:</strong> You already have <strong>{activePool.totalSeats} active seats</strong> in this batch ({activePool.seatsAvailable} available). This booking will add <strong>+{requestForm.totalSeats} additional seats</strong>.
                  </div>
                );
              }
              return null;
            })()}
          </div>

          {/* Seat Quantity & Quick-Select Presets */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
              <label style={{ fontSize: "0.84rem", fontWeight: 700, color: "#1e293b" }}>
                Number of Student Seats <span style={{ color: "#dc2626" }}>*</span>
              </label>
              <span style={{ fontSize: "0.75rem", color: "#64748b" }}>
                Volume discount unlocks at <strong>{pricingConfig.enabled && pricingConfig.tiers?.length > 0 ? `${pricingConfig.tiers[0]?.minSeats || 10}+ seats` : "10+ seats"}</strong>
              </span>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
              {/* Stepper controls */}
              <div style={{ display: "inline-flex", alignItems: "center", border: "1px solid #cbd5e1", borderRadius: "8px", overflow: "hidden", background: "#ffffff" }}>
                <button
                  type="button"
                  onClick={() => setRequestForm((prev) => ({ ...prev, totalSeats: Math.max(1, (Number(prev.totalSeats) || 1) - 5) }))}
                  style={{
                    width: "36px",
                    height: "38px",
                    border: "none",
                    borderRight: "1px solid #e2e8f0",
                    background: "#f8fafc",
                    color: "#334155",
                    fontWeight: 700,
                    fontSize: "1.1rem",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                  title="Decrease 5 seats"
                >
                  −
                </button>
                <input
                  type="number"
                  min={1}
                  required
                  value={requestForm.totalSeats}
                  onChange={(e) => setRequestForm((prev) => ({ ...prev, totalSeats: Math.max(1, Number(e.target.value)) }))}
                  style={{
                    width: "70px",
                    textAlign: "center",
                    border: "none",
                    outline: "none",
                    padding: "8px 6px",
                    fontSize: "1rem",
                    fontWeight: 700,
                    color: "#0f172a",
                    background: "#fff",
                  }}
                />
                <button
                  type="button"
                  onClick={() => setRequestForm((prev) => ({ ...prev, totalSeats: (Number(prev.totalSeats) || 0) + 5 }))}
                  style={{
                    width: "36px",
                    height: "38px",
                    border: "none",
                    borderLeft: "1px solid #e2e8f0",
                    background: "#f8fafc",
                    color: "#334155",
                    fontWeight: 700,
                    fontSize: "1.1rem",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                  title="Increase 5 seats"
                >
                  +
                </button>
              </div>

              {/* Quick Preset Buttons (Dynamic) */}
              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                {(pricingConfig.quickPresets || [10, 25, 50, 100]).map((qty: number) => {
                  const disc = getDiscountPercent(qty);
                  const isCurrent = Number(requestForm.totalSeats) === qty;
                  return (
                    <button
                      key={qty}
                      type="button"
                      onClick={() => setRequestForm((prev) => ({ ...prev, totalSeats: qty }))}
                      style={{
                        padding: "7px 12px",
                        borderRadius: "20px",
                        border: isCurrent ? "1.5px solid #c97a1e" : "1px solid #e2e8f0",
                        background: isCurrent ? "#fef3c7" : "#ffffff",
                        color: isCurrent ? "#92400e" : "#475569",
                        fontSize: "0.78rem",
                        fontWeight: isCurrent ? 700 : 500,
                        cursor: "pointer",
                        boxShadow: isCurrent ? "0 1px 2px rgba(201, 122, 30, 0.2)" : "none",
                        transition: "all 0.15s ease",
                      }}
                    >
                      {qty} seats {disc > 0 ? (
                        <span style={{ color: "#16a34a", fontWeight: 700 }}>({disc}% OFF)</span>
                      ) : (
                        <span style={{ color: "#64748b", fontWeight: 600 }}>(Standard)</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Currency Segmented Toggle */}
          <div>
            <label style={{ display: "block", fontSize: "0.84rem", fontWeight: 700, color: "#1e293b", marginBottom: "6px" }}>
              Billing Currency
            </label>
            <div
              style={{
                display: "inline-flex",
                background: "#f1f5f9",
                padding: "3px",
                borderRadius: "9px",
                border: "1px solid #e2e8f0",
                gap: "3px",
              }}
            >
              {[
                { code: "USD", symbol: "$" },
                { code: "AED", symbol: "AED" },
                { code: "INR", symbol: "₹" },
              ].map((curr) => {
                const isSelected = requestCurrency === curr.code;
                return (
                  <button
                    key={curr.code}
                    type="button"
                    onClick={() => setRequestForm((prev) => ({ ...prev, currency: curr.code }))}
                    style={{
                      padding: "6px 16px",
                      borderRadius: "7px",
                      border: "none",
                      background: isSelected ? "#c97a1e" : "transparent",
                      color: isSelected ? "#ffffff" : "#475569",
                      fontWeight: isSelected ? 700 : 600,
                      fontSize: "0.82rem",
                      cursor: "pointer",
                      boxShadow: isSelected ? "0 1px 3px rgba(201, 122, 30, 0.3)" : "none",
                      transition: "all 0.15s ease",
                    }}
                  >
                    {curr.code} ({curr.symbol})
                  </button>
                );
              })}
            </div>
          </div>

          {/* Dynamic Commercials & Volume Discount Card */}
          <div
            style={{
              background: "#faf8f5",
              border: "1px solid #f3e8d2",
              borderRadius: "12px",
              padding: "16px 18px",
              boxShadow: "0 1px 3px rgba(0,0,0,0.02)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
              <div style={{ fontSize: "0.82rem", fontWeight: 700, color: "#78350f", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                Commercial Terms &amp; Volume Pricing
              </div>
              {discountPercent > 0 && (
                <span style={{ fontSize: "0.75rem", fontWeight: 700, background: "#dcfce7", color: "#15803d", padding: "2px 8px", borderRadius: "12px", border: "1px solid #bbf7d0" }}>
                  ✓ {discountPercent}% Volume Discount Active
                </span>
              )}
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.84rem", marginBottom: "6px", color: "#64748b" }}>
              <span>Standard Base Rate per Seat:</span>
              <span style={{ fontWeight: 600, color: "#0f172a" }}>
                {requestCurrency} {unitPrice.toLocaleString()} / seat
              </span>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.84rem", marginBottom: "6px", color: "#64748b" }}>
              <span>Gross Subtotal ({requestForm.totalSeats} seats):</span>
              <span style={{ fontWeight: 600, color: "#0f172a" }}>
                {requestCurrency} {subtotalAmount.toLocaleString()}
              </span>
            </div>

            {discountPercent > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.84rem", marginBottom: "6px", color: "#16a34a" }}>
                <span>Volume Tier Discount ({discountPercent}%):</span>
                <span style={{ fontWeight: 700 }}>
                  -{requestCurrency} {calculatedDiscount.toLocaleString()}
                </span>
              </div>
            )}

            <div style={{ height: "1px", background: "#e7decb", margin: "10px 0" }} />

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <span style={{ fontSize: "0.92rem", fontWeight: 700, color: "#0f172a" }}>
                  Estimated Net Total:
                </span>
                <div style={{ fontSize: "0.74rem", color: "#64748b", marginTop: "1px" }}>
                  Locked upon admin review &bull; Invoiced in {requestCurrency}
                </div>
              </div>
              <span style={{ fontSize: "1.45rem", fontWeight: 800, color: "#b45309" }}>
                {requestCurrency} {estimatedNetAmount.toLocaleString()}
              </span>
            </div>

            {/* Volume Tier Pill (Dynamic) */}
            <div
              style={{
                marginTop: "12px",
                fontSize: "0.76rem",
                color: "#78350f",
                background: "#fffbeb",
                padding: "8px 12px",
                borderRadius: "8px",
                border: "1px solid #fde68a",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: "8px",
                flexWrap: "wrap",
              }}
            >
              <span>
                💡 {pricingConfig.customNote || `Volume discounts: ${pricingConfig.tiers.map((t: { minSeats: number; discountPercent: number }) => `${t.minSeats}+ seats: ${t.discountPercent}% off`).join(" • ")}`}
              </span>
              {isPlatformAdmin && (
                <button
                  type="button"
                  onClick={() => setIsPricingModalOpen(true)}
                  style={{
                    padding: "3px 8px",
                    borderRadius: "5px",
                    background: "#fef3c7",
                    border: "1px solid #d97706",
                    color: "#92400e",
                    fontSize: "0.7rem",
                    fontWeight: 700,
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                    flexShrink: 0,
                  }}
                  title="Configure Volume Tiers"
                >
                  ⚙️ Edit Tiers
                </button>
              )}
            </div>
          </div>

          {/* Notes / Message for WhatBoutMe Admin */}
          <div>
            <label style={{ display: "block", fontSize: "0.84rem", fontWeight: 700, color: "#1e293b", marginBottom: "6px" }}>
              Notes / Message for WhatBoutMe Admin (Optional)
            </label>
            <textarea
              rows={2}
              placeholder="e.g. Seats required for our Q4 engineering cohort. Expected start next Monday."
              value={requestForm.notes}
              onChange={(e) => setRequestForm({ ...requestForm, notes: e.target.value })}
              style={{
                width: "100%",
                padding: "9px 12px",
                borderRadius: "8px",
                border: "1px solid #cbd5e1",
                fontSize: "0.86rem",
                outline: "none",
                fontFamily: "inherit",
              }}
            />
          </div>

          {/* Workflow Alert Box */}
          <div
            style={{
              padding: "10px 14px",
              borderRadius: "8px",
              background: "#eff6ff",
              border: "1px solid #bfdbfe",
              color: "#1e40af",
              fontSize: "0.8rem",
              lineHeight: 1.45,
            }}
          >
            ⚡ <strong>WhatBoutMe Booking Workflow:</strong> Upon submission, your request will be delivered to WhatBoutMe administration for approval. Once approved, click the <strong>Pay Now</strong> button in your workspace to complete simulated payment and unlock your student seats.
          </div>
        </div>
      </Modal>

      {/* Modal: Complete Payment (Simulated Checkout) */}
      <Modal
        isOpen={isPaymentModalOpen}
        onClose={() => {
          if (isSubmittingPayment) return;
          setIsPaymentModalOpen(false);
        }}
        title={`Complete Payment — ${selectedPoolForPayment?.poolCode || ""}`}
      >
        {selectedPoolForPayment && (
          <form onSubmit={handleCompletePaymentSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            {/* Order Summary Box */}
            <div
              style={{
                background: "#f8fafc",
                border: "1px solid #e2e8f0",
                borderRadius: "10px",
                padding: "16px",
              }}
            >
              <div style={{ fontSize: "0.78rem", fontWeight: 600, color: "#64748b", textTransform: "uppercase" }}>
                Course Slot Order Summary
              </div>
              <div style={{ fontSize: "1.1rem", fontWeight: 700, color: "#0f172a", marginTop: "4px" }}>
                {selectedPoolForPayment.program?.title || "Selected Course"}
              </div>
              <div style={{ fontSize: "0.85rem", color: "#475569", marginTop: "2px" }}>
                Cohort Batch: <strong>{selectedPoolForPayment.batch?.name || "Cohort"}</strong>
              </div>

              <div style={{ height: "1px", background: "#e2e8f0", margin: "12px 0" }} />

              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem", marginBottom: "4px" }}>
                <span style={{ color: "#64748b" }}>Allocated Seats:</span>
                <span style={{ fontWeight: 600, color: "#0f172a" }}>{selectedPoolForPayment.totalSeats} Student Seats</span>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem", marginBottom: "4px" }}>
                <span style={{ color: "#64748b" }}>Rate per Seat:</span>
                <span style={{ fontWeight: 600, color: "#0f172a" }}>
                  {selectedPoolForPayment.currency} {selectedPoolForPayment.pricePerSeat?.toLocaleString()}
                </span>
              </div>

              {selectedPoolForPayment.discountAmount > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem", marginBottom: "4px", color: "#16a34a" }}>
                  <span>Volume Tier Discount:</span>
                  <span style={{ fontWeight: 700 }}>
                    -{selectedPoolForPayment.currency} {selectedPoolForPayment.discountAmount?.toLocaleString()}
                  </span>
                </div>
              )}

              <div style={{ height: "1px", background: "#e2e8f0", margin: "8px 0" }} />

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "0.95rem", fontWeight: 700, color: "#0f172a" }}>Total Amount Due:</span>
                <span style={{ fontSize: "1.35rem", fontWeight: 800, color: "#c97a1e" }}>
                  {selectedPoolForPayment.currency} {selectedPoolForPayment.netAmount?.toLocaleString()}
                </span>
              </div>
            </div>

            {/* Test Simulation Mode Badge */}
            <div
              style={{
                background: "linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)",
                border: "1px solid #86efac",
                borderRadius: "8px",
                padding: "12px 16px",
                color: "#166534",
                fontSize: "0.83rem",
                lineHeight: 1.4,
              }}
            >
              <div style={{ fontWeight: 700, display: "flex", alignItems: "center", gap: "6px", marginBottom: "3px" }}>
                <span>⚡</span> Payment Simulation Active (TEST_BYPASS Mode)
              </div>
              Live card gateway (Stripe / Razorpay) will be enabled in production. Clicking below simulates a verified checkout transaction, transitions status to <strong>ACTIVE</strong>, materializes <strong>{selectedPoolForPayment.totalSeats} numbered slots</strong>, and generates a paid tax invoice.
            </div>

            <div>
              <label style={{ display: "block", fontSize: "0.83rem", fontWeight: 600, color: "#1e293b", marginBottom: "6px" }}>
                Payment Method
              </label>
              <select
                value={paymentForm.paymentMethod}
                onChange={(e) => setPaymentForm({ ...paymentForm, paymentMethod: e.target.value })}
                style={{
                  width: "100%",
                  padding: "9px 12px",
                  borderRadius: "6px",
                  border: "1px solid #cbd5e1",
                  background: "#fff",
                  fontSize: "0.88rem",
                }}
              >
                <option value="ONLINE">Credit / Debit Card (Instant Simulation)</option>
                <option value="INVOICE_OFFLINE">Institutional Wire Transfer (Net-30 Invoice)</option>
              </select>
            </div>

            <div>
              <label style={{ display: "block", fontSize: "0.83rem", fontWeight: 600, color: "#1e293b", marginBottom: "6px" }}>
                Billing Reference / Transaction Note (Optional)
              </label>
              <input
                type="text"
                placeholder="e.g. Corporate Card Ending in 4242 or PO-8832"
                value={paymentForm.notes}
                onChange={(e) => setPaymentForm({ ...paymentForm, notes: e.target.value })}
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  borderRadius: "6px",
                  border: "1px solid #cbd5e1",
                  fontSize: "0.85rem",
                }}
              />
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "8px" }}>
              <button
                type="button"
                onClick={() => setIsPaymentModalOpen(false)}
                disabled={isSubmittingPayment}
                style={{
                  padding: "8px 16px",
                  borderRadius: "6px",
                  border: "1px solid #cbd5e1",
                  background: "#ffffff",
                  color: "#475569",
                  fontWeight: 600,
                  fontSize: "0.85rem",
                  cursor: isSubmittingPayment ? "not-allowed" : "pointer",
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmittingPayment}
                style={{
                  padding: "10px 24px",
                  borderRadius: "6px",
                  border: "none",
                  background: "linear-gradient(135deg, #16a34a 0%, #15803d 100%)",
                  color: "#ffffff",
                  fontWeight: 700,
                  fontSize: "0.9rem",
                  cursor: isSubmittingPayment ? "not-allowed" : "pointer",
                  boxShadow: "0 2px 6px rgba(22, 163, 74, 0.3)",
                }}
              >
                {isSubmittingPayment
                  ? "Processing Payment..."
                  : `⚡ Pay ${selectedPoolForPayment.currency} ${selectedPoolForPayment.netAmount?.toLocaleString()} & Unlock Slots`}
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* Modal: Reject Slot Booking Request */}
      <Modal
        isOpen={isRejectModalOpen}
        onClose={() => {
          if (isRejecting) return;
          setIsRejectModalOpen(false);
        }}
        title={`Reject Slot Booking Request — ${selectedPoolForReject?.poolCode || ""}`}
      >
        {selectedPoolForReject && (
          <form onSubmit={handleRejectPoolSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <div
              style={{
                padding: "12px 14px",
                borderRadius: "8px",
                background: "#fef2f2",
                border: "1px solid #fecaca",
                color: "#991b1b",
                fontSize: "0.85rem",
              }}
            >
              Are you sure you want to reject the booking request for <strong>{selectedPoolForReject.totalSeats} seats</strong> from <strong>{org.name}</strong>?
            </div>

            <div>
              <label style={{ display: "block", fontSize: "0.83rem", fontWeight: 600, color: "#1e293b", marginBottom: "6px" }}>
                Reason for Rejection (Optional)
              </label>
              <textarea
                rows={3}
                placeholder="e.g. Batch is at full capacity; please select an upcoming cohort date."
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  borderRadius: "6px",
                  border: "1px solid #cbd5e1",
                  fontSize: "0.85rem",
                }}
              />
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "6px" }}>
              <button
                type="button"
                onClick={() => setIsRejectModalOpen(false)}
                disabled={isRejecting}
                style={{
                  padding: "8px 16px",
                  borderRadius: "6px",
                  border: "1px solid #cbd5e1",
                  background: "#ffffff",
                  color: "#475569",
                  fontWeight: 600,
                  fontSize: "0.85rem",
                  cursor: isRejecting ? "not-allowed" : "pointer",
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isRejecting}
                style={{
                  padding: "8px 20px",
                  borderRadius: "6px",
                  border: "none",
                  background: "#dc2626",
                  color: "#ffffff",
                  fontWeight: 600,
                  fontSize: "0.85rem",
                  cursor: isRejecting ? "not-allowed" : "pointer",
                }}
              >
                {isRejecting ? "Rejecting..." : "Confirm Rejection"}
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* Delete Organization Confirmation Modal */}
      <Modal
        isOpen={isDeleteModalOpen}
        onClose={() => {
          if (isDeleting) return;
          setIsDeleteModalOpen(false);
        }}
        title={`Delete Organization — ${org?.name || ""}`}
      >
        {org && (
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
              Permanently deletes <strong>{org.name}</strong> ({org.orgCode}). All associated batch seat pools, prepaid vouchers, department seat allocations, and staff memberships will be permanently deleted.
            </div>

            <div style={{ padding: "12px 14px", background: "#f8fafc", borderRadius: "8px", border: "1px solid #e2e8f0", fontSize: "0.83rem" }}>
              <div style={{ color: "#64748b", marginBottom: "4px" }}>Organization Registered Email:</div>
              <code style={{ fontSize: "0.95rem", fontWeight: 700, color: "#0f172a", wordBreak: "break-all" }}>
                {org.billingEmail || org.contactEmail}
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
                placeholder={org.billingEmail || org.contactEmail}
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
                onClick={() => setIsDeleteModalOpen(false)}
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
                  (confirmDeleteEmail.trim().toLowerCase() !== (org.billingEmail || "").trim().toLowerCase() &&
                   confirmDeleteEmail.trim().toLowerCase() !== (org.contactEmail || "").trim().toLowerCase())
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
                    (confirmDeleteEmail.trim().toLowerCase() !== (org.billingEmail || "").trim().toLowerCase() &&
                     confirmDeleteEmail.trim().toLowerCase() !== (org.contactEmail || "").trim().toLowerCase())
                      ? "not-allowed"
                      : "pointer",
                  opacity:
                    isDeleting ||
                    (confirmDeleteEmail.trim().toLowerCase() !== (org.billingEmail || "").trim().toLowerCase() &&
                     confirmDeleteEmail.trim().toLowerCase() !== (org.contactEmail || "").trim().toLowerCase())
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

      <VolumePricingModal
        isOpen={isPricingModalOpen}
        onClose={() => setIsPricingModalOpen(false)}
        config={pricingConfig}
        onConfigSaved={(newCfg) => setPricingConfig(newCfg)}
      />
    </div>
  );
}
