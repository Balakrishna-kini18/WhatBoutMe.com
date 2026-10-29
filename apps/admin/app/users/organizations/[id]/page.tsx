"use client";

import { useEffect, useState, FormEvent, Suspense, use } from "react";
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
  const isOrgUser = Boolean((user as any)?.isOrgUser || (user as any)?.organizationId);
  const searchParams = useSearchParams();
  const tabParam = searchParams?.get("tab");

  const [org, setOrg] = useState<any>(null);
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
  const [isSubmittingRequest, setIsSubmittingRequest] = useState(false);
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
      router.push("/users/organizations");
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
      const data = await apiGet(`/admin/organizations/${orgId}`);
      setOrg(data);
      if (data?.defaultCurrency) {
        setPoolForm((prev) => ({ ...prev, currency: data.defaultCurrency }));
        setRequestForm((prev) => ({ ...prev, currency: data.defaultCurrency }));
      }
    } catch (e: any) {
      toast.error(e?.message || "Failed to load organization", "Error");
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
    } catch (e: any) {
      console.error(e);
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
    } catch (e) {
      console.error("Failed to load available batches", e);
    }
  };

  useEffect(() => {
    fetchOrganizationDetails();
    fetchAvailableBatches();
  }, [orgId]);

  useEffect(() => {
    fetchLearners();
  }, [orgId, selectedBatchId, studentSearch]);

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

  // Aggregate slot calculations
  const totalSlots = org.seatPools?.reduce((s: number, p: any) => s + p.totalSeats, 0) || 0;
  const assignedSlots = org.seatPools?.reduce((s: number, p: any) => s + p.seatsAssigned, 0) || 0;
  const consumedSlots = org.seatPools?.reduce((s: number, p: any) => s + p.seatsConsumed, 0) || 0;
  const availableSlots = org.seatPools?.reduce((s: number, p: any) => s + p.seatsAvailable, 0) || 0;
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
    if (qty >= 50) return 25;
    if (qty >= 25) return 15;
    if (qty >= 10) return 10;
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
            <span style={{ fontSize: "1.1rem" }}>👑</span>
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
              }}
            >
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

          {!isOrgUser && (
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

          {!isOrgUser && (
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
            {org.seatPools?.length || 0}
          </div>
          <div style={{ fontSize: "0.78rem", color: "#94a3b8" }}>Allocated cohort pools</div>
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
                {org.seatPools?.map((p: any) => (
                  <option key={p.batchId} value={p.batchId}>
                    {p.batch?.name || p.poolCode}
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
                  <span>🎉</span> Slot Request Approved — Payment Required
                </div>
                <div style={{ fontSize: "0.82rem", color: "#1e3a8a", marginTop: "3px" }}>
                  WhatBoutMe Admin has approved your booking! Complete the simulated payment below to unlock and assign your student seats.
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
                                {!isOrgUser ? (
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
                                  <span style={{ color: "#b45309", fontSize: "0.8rem", fontWeight: 600 }}>
                                    ⏳ Awaiting Admin Approval
                                  </span>
                                )}
                              </>
                            )}

                            {/* State 2: PENDING_PAYMENT */}
                            {isPendingPayment && (
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
                                }}
                              >
                                💳 Pay Now ({pool.currency} {pool.netAmount?.toLocaleString()}) &rarr;
                              </button>
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
                            {!isOrgUser && !isActive && (
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
                      }}
                    >
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
          <div style={{ textAlign: "center", padding: "10px 0" }}>
            <div style={{ fontSize: "2.5rem", marginBottom: "8px" }}>✅</div>
            <h3 style={{ fontSize: "1.1rem", fontWeight: 700, color: "#0f172a", marginBottom: "6px" }}>
              Student Assigned Successfully!
            </h3>
            <p style={{ fontSize: "0.88rem", color: "#64748b", marginBottom: "1rem" }}>
              {assignedResult.mode === "VOUCHER_CODE"
                ? "The prepaid voucher code has been generated. Provide this code to the student to claim their pre-paid seat."
                : `An email invite with the onboarding claim link has been dispatched to ${assignedResult.inviteEmail || assignForm.email}.`}
            </p>

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
              onClick={() => setIsAssignModalOpen(false)}
              style={{
                marginTop: "10px",
                padding: "8px 20px",
                background: "#0f172a",
                color: "#ffffff",
                borderRadius: "6px",
                border: "none",
                fontWeight: 600,
                fontSize: "0.85rem",
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
        }}
        title={`Purchase / Request Course Slots — ${org?.name || ""}`}
      >
        <form onSubmit={handleRequestPoolSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div>
            <label style={{ display: "block", fontSize: "0.83rem", fontWeight: 600, color: "#1e293b", marginBottom: "6px" }}>
              Target Course & Cohort Batch *
            </label>
            <select
              required
              value={requestForm.batchId}
              onChange={(e) => setRequestForm({ ...requestForm, batchId: e.target.value })}
              style={{
                width: "100%",
                padding: "9px 12px",
                borderRadius: "6px",
                border: "1px solid #cbd5e1",
                background: "#fff",
                fontSize: "0.88rem",
              }}
            >
              <option value="">Select a course cohort batch...</option>
              {batches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} • {b.programTitle || "Program"} (Starts: {b.startDate ? new Date(b.startDate).toLocaleDateString() : "TBD"}) — {b.availableSeats} batch seats remaining
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <div>
              <label style={{ display: "block", fontSize: "0.83rem", fontWeight: 600, color: "#1e293b", marginBottom: "6px" }}>
                Number of Student Seats *
              </label>
              <input
                type="number"
                min={1}
                required
                value={requestForm.totalSeats}
                onChange={(e) => setRequestForm({ ...requestForm, totalSeats: Math.max(1, Number(e.target.value)) })}
                style={{
                  width: "100%",
                  padding: "9px 12px",
                  borderRadius: "6px",
                  border: "1px solid #cbd5e1",
                  fontSize: "0.9rem",
                }}
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: "0.83rem", fontWeight: 600, color: "#1e293b", marginBottom: "6px" }}>
                Billing Currency
              </label>
              <select
                value={requestCurrency}
                onChange={(e) => setRequestForm({ ...requestForm, currency: e.target.value })}
                style={{
                  width: "100%",
                  padding: "9px 12px",
                  borderRadius: "6px",
                  border: "1px solid #cbd5e1",
                  background: "#fff",
                  fontSize: "0.9rem",
                }}
              >
                <option value="USD">USD ($)</option>
                <option value="AED">AED (AED)</option>
                <option value="INR">INR (₹)</option>
              </select>
            </div>
          </div>

          {/* Dynamic Commercials & Volume Discount Card */}
          <div
            style={{
              background: "#f8fafc",
              border: "1px solid #e2e8f0",
              borderRadius: "8px",
              padding: "14px 16px",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.83rem", marginBottom: "6px", color: "#64748b" }}>
              <span>Base Rate per Seat:</span>
              <span style={{ fontWeight: 600, color: "#0f172a" }}>
                {requestCurrency} {unitPrice.toLocaleString()}
              </span>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.83rem", marginBottom: "6px", color: "#64748b" }}>
              <span>Subtotal ({requestForm.totalSeats} seats):</span>
              <span style={{ fontWeight: 600, color: "#0f172a" }}>
                {requestCurrency} {subtotalAmount.toLocaleString()}
              </span>
            </div>

            {discountPercent > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.83rem", marginBottom: "6px", color: "#16a34a" }}>
                <span>Volume Tier Discount ({discountPercent}%):</span>
                <span style={{ fontWeight: 700 }}>
                  -{requestCurrency} {calculatedDiscount.toLocaleString()}
                </span>
              </div>
            )}

            <div style={{ height: "1px", background: "#e2e8f0", margin: "8px 0" }} />

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: "0.9rem", fontWeight: 700, color: "#0f172a" }}>
                Estimated Total:
              </span>
              <span style={{ fontSize: "1.25rem", fontWeight: 800, color: "#c97a1e" }}>
                {requestCurrency} {estimatedNetAmount.toLocaleString()}
              </span>
            </div>

            {/* Volume Tier Pill */}
            <div style={{ marginTop: "10px", fontSize: "0.75rem", color: "#64748b" }}>
              💡 Volume discounts: <strong>10+ seats: 10% off</strong> &bull; <strong>25+ seats: 15% off</strong> &bull; <strong>50+ seats: 25% off</strong>
            </div>
          </div>

          <div>
            <label style={{ display: "block", fontSize: "0.83rem", fontWeight: 600, color: "#1e293b", marginBottom: "6px" }}>
              Notes / Message for WhatBoutMe Admin (Optional)
            </label>
            <textarea
              rows={2}
              placeholder="e.g. Seats required for our Q4 engineering cohort. Expected start next Monday."
              value={requestForm.notes}
              onChange={(e) => setRequestForm({ ...requestForm, notes: e.target.value })}
              style={{
                width: "100%",
                padding: "8px 12px",
                borderRadius: "6px",
                border: "1px solid #cbd5e1",
                fontSize: "0.85rem",
              }}
            />
          </div>

          <div
            style={{
              padding: "10px 14px",
              borderRadius: "6px",
              background: "#eff6ff",
              border: "1px solid #bfdbfe",
              color: "#1e40af",
              fontSize: "0.8rem",
              lineHeight: 1.4,
            }}
          >
            ℹ️ <strong>Workflow:</strong> Upon clicking submit, your request will be delivered to WhatBoutMe administration for approval. Once approved, the <strong>Pay Now</strong> button will appear in your workspace to complete payment and unlock the seats.
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "6px" }}>
            <button
              type="button"
              onClick={() => setIsRequestModalOpen(false)}
              disabled={isSubmittingRequest}
              style={{
                padding: "8px 16px",
                borderRadius: "6px",
                border: "1px solid #cbd5e1",
                background: "#ffffff",
                color: "#475569",
                fontWeight: 600,
                fontSize: "0.85rem",
                cursor: isSubmittingRequest ? "not-allowed" : "pointer",
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmittingRequest || !requestForm.batchId}
              style={{
                padding: "9px 22px",
                borderRadius: "6px",
                border: "none",
                background: "linear-gradient(135deg, #c97a1e 0%, #b45309 100%)",
                color: "#ffffff",
                fontWeight: 700,
                fontSize: "0.88rem",
                cursor: isSubmittingRequest || !requestForm.batchId ? "not-allowed" : "pointer",
                opacity: isSubmittingRequest || !requestForm.batchId ? 0.6 : 1,
                boxShadow: "0 2px 4px rgba(201, 122, 30, 0.25)",
              }}
            >
              {isSubmittingRequest ? "Submitting Request..." : "Submit Booking Request to WhatBoutMe Admin →"}
            </button>
          </div>
        </form>
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
    </div>
  );
}
