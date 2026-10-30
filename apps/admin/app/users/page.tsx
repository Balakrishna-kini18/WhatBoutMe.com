"use client";

import { useEffect, useState, FormEvent, useRef, Suspense } from "react";
import styles from "../page.module.css";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { CustomSelect, ActionMenu, StatusBadge, useToast, Modal, TableSkeleton, EmptyState, Pagination, SortIndicator } from "../components";
import { apiGet, API_URL } from "../lib/api";

const RevokeAccessModal = dynamic(
  () => import("../components/RevokeAccessModal").then((mod) => mod.RevokeAccessModal),
  { ssr: false }
);

interface UserEnrolment {
  id: string;
  batchId: string | null;
  batchName: string | null;
  programId?: string | null;
  programTitle: string | null;
  status: string;
  currentStepNumber?: number | null;
  completedSteps?: number;
  totalSteps?: number | null;
  progressPercent?: number;
  isStepLocked?: boolean;
  stepLockReason?: string | null;
  stepLabel?: string | null;
  isAgreementSigned?: boolean;
  createdAt?: string | Date;
}

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  createdAt?: string | Date;
  progress?: string;
  currentStepNumber?: number | null;
  completedSteps?: number;
  totalSteps?: number | null;
  progressPercent?: number;
  currentStage?: string | null;
  stageLabel?: string | null;
  isStepLocked?: boolean;
  stepLockReason?: string | null;
  twoFactorEnabled?: boolean;
  isAgreementSigned?: boolean;
  managedBatches?: Array<{ id: string; name: string }>;
  cohort?: string;
  batchId?: string | null;
  enrolmentId?: string | null;
  enrolments?: UserEnrolment[];
  enrolledAt?: string | null;
  joined?: string;
  permissions?: string[];
}

const ROLE_CARDS = [
  {
    id: "SUPER_ADMIN",
    title: "Super Admin",
    badgeLabel: "Super Admin",
    tone: "roleSuperAdmin" as const,
    description: "Full system governance, staff management & audit logs",
    requiresSuperAdmin: true,
  },
  {
    id: "ADMIN",
    title: "Admin",
    badgeLabel: "Admin",
    tone: "roleAdmin" as const,
    description: "Curriculum, batches, quizzes, leads & revenue",
    requiresSuperAdmin: false,
  },
  {
    id: "MANAGER",
    title: "Batch Manager",
    badgeLabel: "Batch Manager",
    tone: "roleManager" as const,
    description: "Assigned batch sessions, learners & attendance",
    requiresSuperAdmin: false,
  },
  {
    id: "USER",
    title: "Learner",
    badgeLabel: "Learner",
    tone: "roleUser" as const,
    description: "Enrolled courses, player, notes & bookings",
    requiresSuperAdmin: false,
  },
];

export default function UsersPage() {
  return (
    <Suspense fallback={null}>
      <UsersContent />
    </Suspense>
  );
}

function UsersContent() {
  const searchParams = useSearchParams();
  const { success: toastSuccess } = useToast();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [revokingUser, setRevokingUser] = useState<User | null>(null);
  const [isRevokeModalOpen, setIsRevokeModalOpen] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [totalUsers, setTotalUsers] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [pageSize, setPageSize] = useState(10);
  const limit = pageSize;
  const [batches, setBatches] = useState<{id: string, name: string}[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [roleFilter, setRoleFilter] = useState<"ALL" | "USER" | "MANAGER" | "ADMIN" | "SUPER_ADMIN">("ALL");
  const [selectedManagerBatchIds, setSelectedManagerBatchIds] = useState<string[]>([]);

  // Status Distribution Counts
  const activeCount = users.filter((u) => ((u as any).accountStatus || u.status || "ACTIVE").toUpperCase() === "ACTIVE").length;
  const suspendedCount = users.filter((u) => ((u as any).accountStatus || u.status || "").toUpperCase() === "SUSPENDED").length;
  const inactiveCount = users.filter((u) => {
    const s = ((u as any).accountStatus || u.status || "").toUpperCase();
    return s === "INACTIVE" || s === "DISABLED";
  }).length;
  const paymentPendingCount = users.filter((u) => {
    return u.enrolments?.some((e) => e.status === "PENDING_PAYMENT" || e.stepLockReason === "PAYMENT_REQUIRED");
  }).length;
  const agreementRequiredCount = users.filter((u) => {
    const isPaymentPending = u.enrolments?.some((e) => e.status === "PENDING_PAYMENT" || e.stepLockReason === "PAYMENT_REQUIRED");
    return u.role === "USER" && !u.isAgreementSigned && !isPaymentPending;
  }).length;

  // Role Tab Counts (fetched from API)
  const [roleCounts, setRoleCounts] = useState<Record<string, number>>({});

  // Interactive Column Header Sorting
  type SortField = "name" | "role" | "program" | "step" | "agreement" | "batch" | "date";
  type SortDirection = "asc" | "desc";
  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

  // Secondary Dropdown Filters
  const [programsList, setProgramsList] = useState<{ id: string; title: string }[]>([]);
  const [programFilter, setProgramFilter] = useState<string>("ALL");
  const [agreementFilter, setAgreementFilter] = useState<"ALL" | "SIGNED" | "PENDING">("ALL");
  const [batchFilter, setBatchFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "ACTIVE" | "PAYMENT_PENDING" | "AGREEMENT_REQUIRED" | "SUSPENDED" | "INACTIVE">("ALL");

  // In-row Active Program Selector for Multi-Course Learners
  const [selectedProgramByUser, setSelectedProgramByUser] = useState<Record<string, string>>({});

  useEffect(() => {
    setSelectedProgramByUser({});
  }, [statusFilter, programFilter, batchFilter, agreementFilter, roleFilter]);

  // CSV Export State
  const [isExporting, setIsExporting] = useState(false);
  const [exportSuccess, setExportSuccess] = useState(false);

  // Quick Assign Batch Modal State
  const [assignBatchUser, setAssignBatchUser] = useState<User | null>(null);
  const [assignBatchId, setAssignBatchId] = useState<string>("");
  const [isAssigningBatch, setIsAssigningBatch] = useState(false);

  // Form states
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [cohort, setCohort] = useState("");
  const [role, setRole] = useState("USER");
  const [initialRole, setInitialRole] = useState("USER");
  const [status, setStatus] = useState("ACTIVE");
  const [password, setPassword] = useState("");
  const [permissions, setPermissions] = useState<string[]>([]);
  const [formError, setFormError] = useState("");
  const [editingEnrolmentId, setEditingEnrolmentId] = useState<string | null>(null);
  const [editingUserEnrolments, setEditingUserEnrolments] = useState<UserEnrolment[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  // only a super admin may create another super admin
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [currentUserRole, setCurrentUserRole] = useState("USER");
  const isManager = currentUserRole === "MANAGER" || currentUserRole === "TEACHER";

  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem("user") || "{}");
      setCurrentUserRole(stored.role || "USER");
      setIsSuperAdmin(stored.role === "SUPER_ADMIN");
    } catch {
      setIsSuperAdmin(false);
      setCurrentUserRole("USER");
    }
  }, []);

  useEffect(() => {
    fetchBatches();
    fetchPrograms();
  }, []);

  // Reactively sync with URL parameters (?batchId=... & ?role=...)
  useEffect(() => {
    const bId = searchParams.get("batchId");
    if (bId) {
      setBatchFilter(bId);
      setRoleFilter("USER");
    }
    const roleParam = searchParams.get("role");
    if (roleParam && ["USER", "MANAGER", "ADMIN", "SUPER_ADMIN", "ALL"].includes(roleParam.toUpperCase())) {
      setRoleFilter(roleParam.toUpperCase() as any);
    }
  }, [searchParams]);

  const fetchPrograms = async () => {
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_URL}/programs`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        const list = Array.isArray(data) ? data : data.programs || data.data || [];
        setProgramsList(list.map((p: any) => ({ id: p.id, title: p.title || p.name })));
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    if (isModalOpen) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === "Escape") {
          setIsModalOpen(false);
        }
      };
      window.addEventListener("keydown", handleKeyDown);
      return () => {
        document.body.style.overflow = originalOverflow;
        window.removeEventListener("keydown", handleKeyDown);
      };
    }
  }, [isModalOpen]);

  const userFetchAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setIsLoading(true);
    if (userFetchAbortRef.current) {
      userFetchAbortRef.current.abort();
    }
    const controller = new AbortController();
    userFetchAbortRef.current = controller;

    const delay = setTimeout(() => {
      fetchUsers(controller.signal);
    }, 300); // debounce search
    return () => {
      clearTimeout(delay);
      controller.abort();
    };
  }, [page, search, roleFilter, pageSize]);

  const fetchBatches = async () => {
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_URL}/batches`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setBatches(Array.isArray(data) ? data : data.batches || []);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchUsers = async (signal?: AbortSignal) => {
    try {
      const roleParam = roleFilter !== "ALL" ? `&role=${roleFilter}` : "";
      const json = await apiGet<{ data: User[]; total: number; roleCounts?: Record<string, number> }>(
        `/users?page=${page}&limit=${pageSize}&search=${encodeURIComponent(search)}${roleParam}`,
        { signal, skipCache: true }
      );
      if (json) {
        setUsers(json.data || []);
        setTotalUsers(json.total || 0);
        if (json.roleCounts) {
          setRoleCounts(json.roleCounts);
        }
      }
    } catch (e: any) {
      if (e?.name !== "AbortError") {
        console.error("Failed to fetch users", e);
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Sorting handlers
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      if (sortDirection === "asc") {
        setSortDirection("desc");
      } else {
        setSortField(null);
        setSortDirection("asc");
      }
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const renderSortIcon = (field: SortField) => {
    return (
      <SortIndicator
        active={sortField === field}
        order={sortDirection}
      />
    );
  };

  // Filter options
  const distinctProgramTitles = Array.from(
    new Set([
      ...programsList.map((p) => p.title),
      ...users.flatMap((u) => (u.enrolments || []).map((e) => e.programTitle).filter(Boolean) as string[]),
    ])
  ).filter(Boolean);

  const programOptions = [
    { value: "ALL", label: "All Programs" },
    { value: "NONE", label: "No Program Enrolled" },
    ...distinctProgramTitles.map((t) => ({ value: t, label: t })),
  ];

  const agreementOptions = [
    { value: "ALL", label: "All Agreements" },
    { value: "SIGNED", label: "Signed Only" },
    { value: "PENDING", label: "Pending Only" },
  ];

  const batchOptions = [
    { value: "ALL", label: "All Batches" },
    { value: "UNASSIGNED", label: "Unassigned" },
    ...batches.map((b) => ({ value: b.id, label: b.name })),
  ];

  const statusOptions = [
    {
      value: "ALL",
      label: "All",
    },
    {
      value: "ACTIVE",
      label: "Active",
    },
    ...((roleFilter === "ALL" || roleFilter === "USER")
      ? [
          {
            value: "PAYMENT_PENDING",
            label: "Payment Pending",
          },
          {
            value: "AGREEMENT_REQUIRED",
            label: "Agreement Required",
          },
        ]
      : []),
    {
      value: "SUSPENDED",
      label: "Suspended",
    },
    {
      value: "INACTIVE",
      label: "Disabled",
    },
  ];

  const hasActiveFilters = Boolean(
    search ||
    roleFilter !== "ALL" ||
    statusFilter !== "ALL" ||
    programFilter !== "ALL" ||
    agreementFilter !== "ALL" ||
    batchFilter !== "ALL" ||
    sortField !== null
  );

  const resetAllFilters = () => {
    setSearch("");
    setRoleFilter("ALL");
    setStatusFilter("ALL");
    setProgramFilter("ALL");
    setAgreementFilter("ALL");
    setBatchFilter("ALL");
    setSelectedProgramByUser({});
    setSortField(null);
    setSortDirection("asc");
    setPage(1);
  };

  const isEnrolmentPaymentPending = (enr: UserEnrolment): boolean => {
    return (
      enr.status === "PENDING_PAYMENT" ||
      enr.stepLockReason === "PAYMENT_REQUIRED" ||
      enr.stepLabel === "Payment Pending"
    );
  };

  const isEnrolmentAgreementRequired = (enr: UserEnrolment, user: User): boolean => {
    if (isEnrolmentPaymentPending(enr)) return false;
    return (
      enr.stepLockReason === "AGREEMENT_REQUIRED" ||
      enr.stepLabel === "Agreement Required" ||
      (user.role === "USER" && !enr.isAgreementSigned)
    );
  };

  const getMatchingEnrolments = (user: User): UserEnrolment[] => {
    const enrolments = user.enrolments || [];
    if (enrolments.length === 0) return [];

    return enrolments.filter((enr) => {
      // 1. Program filter
      if (programFilter !== "ALL" && programFilter !== "NONE") {
        const matchesProgram =
          enr.programTitle?.toLowerCase() === programFilter.toLowerCase() ||
          enr.programId === programFilter ||
          enr.id === programFilter;
        if (!matchesProgram) return false;
      }

      // 2. Batch filter
      if (batchFilter !== "ALL" && batchFilter !== "UNASSIGNED") {
        const matchesBatch = enr.batchId === batchFilter || enr.batchName === batchFilter;
        if (!matchesBatch) return false;
      } else if (batchFilter === "UNASSIGNED") {
        const isUnassigned = !enr.batchId || !enr.batchName || enr.batchName === "Unassigned";
        if (!isUnassigned) return false;
      }

      // 3. Status filter
      if (statusFilter !== "ALL") {
        if (statusFilter === "PAYMENT_PENDING") {
          if (!isEnrolmentPaymentPending(enr)) return false;
        } else if (statusFilter === "AGREEMENT_REQUIRED") {
          if (!isEnrolmentAgreementRequired(enr, user)) return false;
        } else if (statusFilter === "ACTIVE") {
          if (isEnrolmentPaymentPending(enr) || isEnrolmentAgreementRequired(enr, user) || enr.status === "REVOKED") {
            return false;
          }
        }
      }

      // 4. Agreement filter
      if (agreementFilter === "SIGNED") {
        const isSigned = enr.isAgreementSigned ?? user.isAgreementSigned;
        if (!isSigned) return false;
      } else if (agreementFilter === "PENDING") {
        const isSigned = enr.isAgreementSigned ?? user.isAgreementSigned;
        if (isSigned) return false;
      }

      return true;
    });
  };

  const hasActiveEnrolmentFilter =
    statusFilter !== "ALL" ||
    programFilter !== "ALL" ||
    batchFilter !== "ALL" ||
    agreementFilter !== "ALL";

  // Client-side secondary filtering and sorting
  const filteredUsers = users.filter((u) => {
    // Role filter
    if (roleFilter !== "ALL" && u.role !== roleFilter) return false;

    // Search query
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      const matchesName = u.name?.toLowerCase().includes(q);
      const matchesEmail = u.email?.toLowerCase().includes(q);
      const matchesProgram = u.enrolments?.some((e) => e.programTitle?.toLowerCase().includes(q));
      const matchesBatch =
        u.cohort?.toLowerCase().includes(q) ||
        u.managedBatches?.some((b) => b.name?.toLowerCase().includes(q)) ||
        u.enrolments?.some((e) => e.batchName?.toLowerCase().includes(q));
      if (!matchesName && !matchesEmail && !matchesProgram && !matchesBatch) return false;
    }

    // Secondary: Account Status & Progression Gates filter
    if (statusFilter !== "ALL") {
      const uStatus = ((u as any).accountStatus || u.status || "ACTIVE").toUpperCase();
      if (statusFilter === "SUSPENDED") {
        if (uStatus !== "SUSPENDED") return false;
      } else if (statusFilter === "INACTIVE") {
        if (uStatus !== "INACTIVE" && uStatus !== "DISABLED") return false;
      } else if (statusFilter === "ACTIVE") {
        if (uStatus !== "ACTIVE") return false;
      }
    }

    // Secondary: Program filter NONE check
    if (programFilter === "NONE") {
      if (u.enrolments && u.enrolments.length > 0) return false;
    }

    // Secondary: Batch filter for managers
    if (u.role === "MANAGER" && batchFilter !== "ALL") {
      if (batchFilter === "UNASSIGNED") {
        if (u.managedBatches && u.managedBatches.length > 0) return false;
      } else {
        const hasBatch = u.managedBatches?.some((b) => b.id === batchFilter || b.name === batchFilter);
        if (!hasBatch && u.batchId !== batchFilter) return false;
      }
    }

    // For learners when any enrolment filter is active: must have at least one matching enrolment
    if (u.role === "USER" && hasActiveEnrolmentFilter) {
      if (programFilter === "NONE") {
        // handled above
      } else {
        const matching = getMatchingEnrolments(u);
        if (matching.length === 0) return false;
      }
    }

    // For non-learners: check agreement filter and specific course filters
    if (u.role !== "USER") {
      if (agreementFilter !== "ALL") return false;
      if (statusFilter === "PAYMENT_PENDING" || statusFilter === "AGREEMENT_REQUIRED") return false;
      if (programFilter !== "ALL" && programFilter !== "NONE") return false;
    }

    return true;
  });

  function parseDate(rawDate: string | Date | number | null | undefined): Date | null {
    if (!rawDate) return null;
    if (rawDate instanceof Date) return isNaN(rawDate.getTime()) ? null : rawDate;
    if (typeof rawDate === "number") {
      const d = new Date(rawDate);
      return isNaN(d.getTime()) ? null : d;
    }
    if (typeof rawDate === "string") {
      const s = rawDate.trim();
      if (!s || s === "—" || s === "-") return null;
      // Match DD/MM/YYYY or DD-MM-YYYY
      const dmy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
      if (dmy && dmy[1] && dmy[2] && dmy[3]) {
        const day = parseInt(dmy[1], 10);
        const month = parseInt(dmy[2], 10) - 1;
        const year = parseInt(dmy[3], 10);
        const d = new Date(year, month, day);
        return isNaN(d.getTime()) ? null : d;
      }
      // Match YYYY-MM-DD
      const ymd = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
      if (ymd && ymd[1] && ymd[2] && ymd[3]) {
        const year = parseInt(ymd[1], 10);
        const month = parseInt(ymd[2], 10) - 1;
        const day = parseInt(ymd[3], 10);
        const d = new Date(year, month, day);
        return isNaN(d.getTime()) ? null : d;
      }
      const d = new Date(s);
      return isNaN(d.getTime()) ? null : d;
    }
    return null;
  }

  function formatNumericDate(rawDate: string | Date | number | null | undefined): string {
    const d = parseDate(rawDate);
    if (!d) return typeof rawDate === "string" && rawDate !== "—" ? rawDate : "—";
    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  }

  const getEnrolledDate = (user: User, enr?: UserEnrolment | null) => {
    const isEnrolled = user.enrolments && user.enrolments.length > 0;
    if (!isEnrolled) return "—";
    const rawDate = enr?.createdAt || user.enrolledAt || user.createdAt || user.joined;
    if (!rawDate) return "—";
    return formatNumericDate(rawDate);
  };

  const sortedUsers = [...filteredUsers].sort((a, b) => {
    if (!sortField) return 0;
    let valA: any = "";
    let valB: any = "";
    if (sortField === "name") {
      valA = (a.name || a.email || "").toLowerCase();
      valB = (b.name || b.email || "").toLowerCase();
    } else if (sortField === "role") {
      const weights: Record<string, number> = { SUPER_ADMIN: 4, ADMIN: 3, MANAGER: 2, USER: 1 };
      valA = weights[a.role] || 0;
      valB = weights[b.role] || 0;
    } else if (sortField === "program") {
      const getProgTitle = (u: User) => {
        const active =
          (programFilter !== "ALL"
            ? u.enrolments?.find(e => e.programTitle?.toLowerCase() === programFilter.toLowerCase() || e.programId === programFilter || e.id === programFilter)
            : null) ||
          (selectedProgramByUser[u.id] ? u.enrolments?.find(e => e.id === selectedProgramByUser[u.id] || e.programId === selectedProgramByUser[u.id]) : null) ||
          u.enrolments?.[0];
        return (active?.programTitle || "").toLowerCase();
      };
      valA = getProgTitle(a);
      valB = getProgTitle(b);
    } else if (sortField === "step") {
      const getStepVal = (u: User) => {
        if (u.role !== "USER") return -1;
        const active =
          (programFilter !== "ALL"
            ? u.enrolments?.find(e => e.programTitle?.toLowerCase() === programFilter.toLowerCase() || e.programId === programFilter || e.id === programFilter)
            : null) ||
          (selectedProgramByUser[u.id] ? u.enrolments?.find(e => e.id === selectedProgramByUser[u.id] || e.programId === selectedProgramByUser[u.id]) : null) ||
          u.enrolments?.[0];
        if (active?.isStepLocked) return -1;
        if (active?.stepLabel === "Certified") return 1000;
        return active?.progressPercent ?? (active?.completedSteps ?? (u.progressPercent ?? (u.completedSteps ?? 0)));
      };
      valA = getStepVal(a);
      valB = getStepVal(b);
    } else if (sortField === "agreement") {
      const getAgreementVal = (u: User) => {
        if (u.role !== "USER") return 0;
        const active =
          (programFilter !== "ALL"
            ? u.enrolments?.find(e => e.programTitle?.toLowerCase() === programFilter.toLowerCase() || e.programId === programFilter || e.id === programFilter)
            : null) ||
          (selectedProgramByUser[u.id] ? u.enrolments?.find(e => e.id === selectedProgramByUser[u.id] || e.programId === selectedProgramByUser[u.id]) : null) ||
          u.enrolments?.[0];
        const signed = active ? active.isAgreementSigned ?? u.isAgreementSigned : u.isAgreementSigned;
        return signed ? 2 : 1;
      };
      valA = getAgreementVal(a);
      valB = getAgreementVal(b);
    } else if (sortField === "batch") {
      const getBatchVal = (u: User) => {
        if (u.role === "SUPER_ADMIN" || u.role === "ADMIN") return "—";
        if (u.role === "MANAGER") return u.managedBatches?.[0]?.name || "Unassigned";
        const active =
          (programFilter !== "ALL"
            ? u.enrolments?.find(e => e.programTitle?.toLowerCase() === programFilter.toLowerCase() || e.programId === programFilter || e.id === programFilter)
            : null) ||
          (selectedProgramByUser[u.id] ? u.enrolments?.find(e => e.id === selectedProgramByUser[u.id] || e.programId === selectedProgramByUser[u.id]) : null) ||
          u.enrolments?.[0];
        const bName = active?.batchName && active.batchName !== "Unassigned" ? active.batchName : (u.cohort && u.cohort !== "Unassigned" ? u.cohort : "Unassigned");
        return bName.toLowerCase();
      };
      valA = getBatchVal(a);
      valB = getBatchVal(b);
    } else if (sortField === "date") {
      const dateA = a.enrolments?.[0]?.createdAt || a.enrolledAt || a.createdAt || a.joined || 0;
      const dateB = b.enrolments?.[0]?.createdAt || b.enrolledAt || b.createdAt || b.joined || 0;
      const parsedA = parseDate(dateA);
      const parsedB = parseDate(dateB);
      valA = parsedA ? parsedA.getTime() : 0;
      valB = parsedB ? parsedB.getTime() : 0;
    }
    if (valA < valB) return sortDirection === "asc" ? -1 : 1;
    if (valA > valB) return sortDirection === "asc" ? 1 : -1;
    return 0;
  });

  // CSV Export Engine
  const handleExportCsv = async () => {
    if (isExporting) return;
    setIsExporting(true);
    try {
      const roleParam = roleFilter !== "ALL" ? `&role=${roleFilter}` : "";

      // Fetch all records across all pages matching the active role & search criteria
      let exportDataset: User[] = [];
      try {
        const firstBatch = await apiGet<{ data: User[]; total: number; totalPages: number }>(
          `/users?page=1&limit=100&search=${encodeURIComponent(search)}${roleParam}`,
          { skipCache: true }
        );
        if (firstBatch && Array.isArray(firstBatch.data)) {
          exportDataset = [...firstBatch.data];
          const totalPages = firstBatch.totalPages || Math.ceil((firstBatch.total || 0) / 100);
          if (totalPages > 1) {
            for (let p = 2; p <= totalPages; p++) {
              const nextBatch = await apiGet<{ data: User[] }>(
                `/users?page=${p}&limit=100&search=${encodeURIComponent(search)}${roleParam}`,
                { skipCache: true }
              );
              if (nextBatch && Array.isArray(nextBatch.data)) {
                exportDataset.push(...nextBatch.data);
              }
            }
          }
        }
      } catch (err) {
        console.warn("Could not fetch all pages via apiGet, falling back to current page", err);
        exportDataset = users;
      }

      if (exportDataset.length === 0) {
        exportDataset = users;
      }

      // Apply active secondary filters
      let exportFiltered = exportDataset.filter((u) => {
        if (programFilter === "NONE") {
          if (u.enrolments && u.enrolments.length > 0) return false;
        } else if (programFilter !== "ALL") {
          const hasProg = u.enrolments?.some((e) => e.programTitle === programFilter || e.programTitle?.toLowerCase() === programFilter.toLowerCase());
          if (!hasProg) return false;
        }

        if (agreementFilter === "SIGNED") {
          if (!u.isAgreementSigned) return false;
        } else if (agreementFilter === "PENDING") {
          if (u.role === "USER" && u.isAgreementSigned) return false;
          if (u.role !== "USER") return false;
        }

        if (batchFilter === "UNASSIGNED") {
          if (u.role === "MANAGER") {
            if (u.managedBatches && u.managedBatches.length > 0) return false;
          } else {
            if (u.cohort || u.batchId) return false;
          }
        } else if (batchFilter !== "ALL") {
          if (u.role === "MANAGER") {
            const hasBatch = u.managedBatches?.some((b) => b.id === batchFilter || b.name === batchFilter);
            if (!hasBatch && u.batchId !== batchFilter) return false;
          } else {
            if (u.batchId !== batchFilter && u.cohort !== batchFilter) return false;
          }
        }

        return true;
      });

      // Apply current sort order if any
      if (sortField) {
        exportFiltered = [...exportFiltered].sort((a, b) => {
          let valA: any = "";
          let valB: any = "";
          if (sortField === "name") {
            valA = (a.name || a.email || "").toLowerCase();
            valB = (b.name || b.email || "").toLowerCase();
          } else if (sortField === "role") {
            const weights: Record<string, number> = { SUPER_ADMIN: 4, ADMIN: 3, MANAGER: 2, USER: 1 };
            valA = weights[a.role] || 0;
            valB = weights[b.role] || 0;
          } else if (sortField === "program") {
            valA = (a.enrolments?.[0]?.programTitle || "").toLowerCase();
            valB = (b.enrolments?.[0]?.programTitle || "").toLowerCase();
          } else if (sortField === "step") {
            valA = a.role === "USER" ? (a.currentStepNumber || 1) : -1;
            valB = b.role === "USER" ? (b.currentStepNumber || 1) : -1;
          } else if (sortField === "agreement") {
            valA = a.role === "USER" ? (a.isAgreementSigned ? 2 : 1) : 0;
            valB = b.role === "USER" ? (b.isAgreementSigned ? 2 : 1) : 0;
          } else if (sortField === "batch") {
            const getBatchVal = (u: User) => {
              if (u.role === "SUPER_ADMIN" || u.role === "ADMIN") return "—";
              if (u.role === "MANAGER") return u.managedBatches?.[0]?.name || "Unassigned";
              return u.cohort && u.cohort !== "Unassigned" ? u.cohort : "Unassigned";
            };
            valA = getBatchVal(a).toLowerCase();
            valB = getBatchVal(b).toLowerCase();
    } else if (sortField === "date") {
      const dateA = a.enrolments?.[0]?.createdAt || a.enrolledAt || a.createdAt || a.joined || 0;
      const dateB = b.enrolments?.[0]?.createdAt || b.enrolledAt || b.createdAt || b.joined || 0;
      valA = new Date(dateA).getTime() || 0;
      valB = new Date(dateB).getTime() || 0;
          }
          if (valA < valB) return sortDirection === "asc" ? -1 : 1;
          if (valA > valB) return sortDirection === "asc" ? 1 : -1;
          return 0;
        });
      }

      if (exportFiltered.length === 0) {
        toastSuccess("No user records match the active filters to export.");
        setIsExporting(false);
        return;
      }

      let headers: string[];
      let rowMapper: (u: User) => string[];

      if (roleFilter === "SUPER_ADMIN") {
        headers = ["Name", "Email", "Role", "Account Status", "System Governance", "Joined Date"];
        rowMapper = (u) => [
          `"${(u.name || "").replace(/"/g, '""')}"`,
          `"${(u.email || "").replace(/"/g, '""')}"`,
          `"Super Admin"`,
          `"${(u.status || "ACTIVE").toUpperCase()}"`,
          `"${u.twoFactorEnabled ? "2FA Protected • All Systems" : "Full System Governance • Foxwel & Roweena"}"`,
          `"${formatNumericDate(u.joined || u.createdAt)}"`,
        ];
      } else if (roleFilter === "ADMIN") {
        headers = ["Name", "Email", "Role", "Account Status", "Administrative Scope", "Joined Date"];
        rowMapper = (u) => [
          `"${(u.name || "").replace(/"/g, '""')}"`,
          `"${(u.email || "").replace(/"/g, '""')}"`,
          `"Admin"`,
          `"${(u.status || "ACTIVE").toUpperCase()}"`,
          `"Curriculum, Batches, Quizzes & Reports"`,
          `"${formatNumericDate(u.joined || u.createdAt)}"`,
        ];
      } else if (roleFilter === "MANAGER") {
        headers = ["Name", "Email", "Role", "Account Status", "Managed Batches", "Joined Date"];
        rowMapper = (u) => [
          `"${(u.name || "").replace(/"/g, '""')}"`,
          `"${(u.email || "").replace(/"/g, '""')}"`,
          `"Batch Manager"`,
          `"${(u.status || "ACTIVE").toUpperCase()}"`,
          `"${(u.managedBatches && u.managedBatches.length > 0 ? u.managedBatches.map((b) => b.name).join("; ") : "Unassigned").replace(/"/g, '""')}"`,
          `"${formatNumericDate(u.joined || u.createdAt)}"`,
        ];
      } else {
        headers = [
          "Name",
          "Email",
          "Role",
          "Account Status",
          "Enrolled Programs",
          "Batch",
          "Curriculum Progress",
          "Agreement Status",
          "Joined Date",
        ];
        rowMapper = (u) => {
          const roleLabel =
            u.role === "USER"
              ? "Learner"
              : u.role === "MANAGER"
              ? "Batch Manager"
              : u.role === "ADMIN"
              ? "Admin"
              : u.role === "SUPER_ADMIN"
              ? "Super Admin"
              : u.role;

          const programs =
            u.enrolments && u.enrolments.length > 0
              ? u.enrolments.map((e) => e.programTitle || "11 Steps to You").join("; ")
              : u.role === "USER" ? "None" : "—";

          const step =
            u.role === "USER" && u.enrolments && u.enrolments.length > 0 && !u.isStepLocked
              ? u.stageLabel || (u.currentStepNumber ? `Step ${u.currentStepNumber} / ${u.totalSteps || 11}` : "—")
              : u.isStepLocked ? "Locked" : "—";
          const agreement = u.role === "USER" ? (u.isAgreementSigned ? "Signed" : "Pending") : "—";
          const batch =
            u.role === "SUPER_ADMIN" || u.role === "ADMIN"
              ? "—"
              : u.role === "MANAGER"
              ? (u.managedBatches && u.managedBatches.length > 0
                  ? u.managedBatches.map((b) => b.name).join("; ")
                  : "Unassigned")
              : (u.cohort && u.cohort !== "Unassigned" ? u.cohort : "Unassigned");

          const joinedDate = formatNumericDate(u.joined || u.createdAt);

          return [
            `"${(u.name || "").replace(/"/g, '""')}"`,
            `"${(u.email || "").replace(/"/g, '""')}"`,
            `"${roleLabel}"`,
            `"${(u.status || "ACTIVE").toUpperCase()}"`,
            `"${programs.replace(/"/g, '""')}"`,
            `"${step}"`,
            `"${agreement}"`,
            `"${batch.replace(/"/g, '""')}"`,
            `"${joinedDate}"`,
          ];
        };
      }

      const rows = exportFiltered.map(rowMapper);

      const csvContent = "\uFEFF" + [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const dateStr = new Date().toISOString().slice(0, 10);
      const roleSlug = roleFilter.toLowerCase().replace(/_/g, "-");
      link.href = url;
      link.setAttribute("download", `whatboutme-users-${roleSlug}-${dateStr}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setExportSuccess(true);
      setTimeout(() => setExportSuccess(false), 2500);
      toastSuccess(`Exported ${rows.length} users to CSV.`);
    } catch (e: any) {
      console.error("CSV Export failed", e);
      toastSuccess("Could not complete CSV export.");
    } finally {
      setIsExporting(false);
    }
  };

  const openEditModal = (user: User) => {
    setEditingUserId(user.id);
    setEmail(user.email);
    const names = user.name ? user.name.split(" ") : ["", ""];
    setFirstName(names[0] || "");
    setLastName(names.slice(1).join(" ") || "");

    const userEnrolments = user.enrolments || [];
    setEditingUserEnrolments(userEnrolments);
    const activeEnrolment = userEnrolments.find(e => e.status !== "REVOKED") || userEnrolments[0];
    const initialEnrolmentId = user.enrolmentId || activeEnrolment?.id || null;
    setEditingEnrolmentId(initialEnrolmentId);

    const initialBatchId = user.batchId || activeEnrolment?.batchId || null;
    const matchingBatch = batches.find(b => b.id === initialBatchId || b.name === user.cohort || b.id === user.cohort);
    setCohort(matchingBatch ? matchingBatch.id : (initialBatchId || ""));

    const userRole = user.role || "USER";
    setRole(userRole);
    setInitialRole(userRole);
    setStatus(user.status || "ACTIVE");
    setPassword("");
    setPermissions(user.permissions || []);
    const initialManaged = user.managedBatches?.map(b => b.id) || (user.batchId ? [user.batchId] : []);
    setSelectedManagerBatchIds(initialManaged);
    setFormError("");
    setIsModalOpen(true);
  };

  const openCreateModal = () => {
    setEditingUserId(null);
    setEditingEnrolmentId(null);
    setEditingUserEnrolments([]);
    setEmail("");
    setFirstName("");
    setLastName("");
    setCohort("");
    setRole("USER");
    setInitialRole("USER");
    setStatus("ACTIVE");
    setPassword("");
    setPermissions([]);
    setSelectedManagerBatchIds([]);
    setFormError("");
    setIsModalOpen(true);
  };

  const openAssignBatchModal = (user: User) => {
    setAssignBatchUser(user);
    setAssignBatchId(user.batchId || "");
  };

  const handleAssignBatchSubmit = async () => {
    if (!assignBatchUser) return;
    setIsAssigningBatch(true);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_URL}/users/${assignBatchUser.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ batchId: assignBatchId || null }),
      });
      if (res.ok) {
        toastSuccess(`Assigned ${assignBatchUser.name || "user"} to batch.`);
        setAssignBatchUser(null);
        fetchUsers();
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.message || "Failed to assign batch");
      }
    } catch (e: any) {
      alert(e.message || "Connection error");
    } finally {
      setIsAssigningBatch(false);
    }
  };

  const handleOpenRevokeModal = (user: User) => {
    setRevokingUser(user);
    setIsRevokeModalOpen(true);
  };

  const handleSaveUser = async (e: FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setFormError("");

    if (role === "SUPER_ADMIN" && !isSuperAdmin) {
      setFormError("Security rule: Only Super Admins can assign the Super Admin role.");
      return;
    }

    setIsSubmitting(true);
    const isBatchScoped = role === "USER" || role === "MANAGER";
    const payload: Record<string, any> = {
      email,
      name: `${firstName} ${lastName}`.trim(),
      role,
      permissions,
      batchId: isBatchScoped ? (cohort || null) : null,
      cohort: isBatchScoped ? (cohort || undefined) : undefined,
      enrolmentId: editingEnrolmentId || undefined,
      status,
      ...(password ? { password } : {}),
    };

    if (role === "MANAGER") {
      payload.batchIds = selectedManagerBatchIds;
    }

    try {
      const token = localStorage.getItem("token");
      const url = editingUserId
        ? `${API_URL}/users/${editingUserId}`
        : `${API_URL}/users`;
      const method = editingUserId ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setIsModalOpen(false);
        setEmail("");
        setFirstName("");
        setLastName("");
        setEditingUserId(null);
        setEditingEnrolmentId(null);
        setEditingUserEnrolments([]);
        toastSuccess(editingUserId ? "User updated successfully." : "User created successfully.");
        fetchUsers();
      } else {
        const data = await res.json().catch(() => null);
        const raw = data?.error?.message ?? data?.message;
        setFormError((Array.isArray(raw) ? raw.join(", ") : raw) || `Could not save the user (error ${res.status}).`);
      }
    } catch (e) {
      console.error("Failed to save user", e);
      setFormError("Could not reach the server. Check that the API is running.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className={styles.dashboard}>
      <header className={styles.header}>
        <div className={styles.headerText}>
          <h1 className={styles.title}>Users & Enrolments</h1>
          {/* <p className={styles.subtitle}>
            {isManager ? "Learners enrolled in your assigned batches." : "Manage all learners across your programs."}
          </p> */}
        </div>
        <div className={styles.headerActions}>
          <button
            type="button"
            className={styles.exportBtn}
            onClick={handleExportCsv}
            disabled={isExporting}
            aria-label="Export users to CSV"
          >
            {isExporting ? (
              <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ animation: "spin 1s linear infinite" }}>
                  <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                </svg>
                <span>Exporting...</span>
              </span>
            ) : exportSuccess ? (
              <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", color: "#166534" }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <span>Exported</span>
              </span>
            ) : (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                <span>Export CSV</span>
              </>
            )}
          </button>
          {!isManager && (
            <button className={styles.primaryBtn} onClick={openCreateModal}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              <span>Add User</span>
            </button>
          )}
        </div>
      </header>

      {/* Segmented Navigation: People vs Organizations */}
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
            fontWeight: 700,
            borderRadius: "7px",
            background: "#ffffff",
            color: "#0f172a",
            boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
            textDecoration: "none",
          }}
        >
          People (Learners & Staff)
        </Link>
        <Link
          href="/users/organizations"
          style={{
            padding: "6px 16px",
            fontSize: "0.85rem",
            fontWeight: 500,
            borderRadius: "7px",
            background: "transparent",
            color: "#475569",
            textDecoration: "none",
          }}
        >
          Organizations & Resellers
        </Link>
      </div>

      {!isManager && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.75rem", marginBottom: "1rem" }}>
          <div className={styles.tabsContainer} role="tablist" aria-label="User directory views" style={{ gap: "0.5rem", flexWrap: "wrap", margin: 0 }}>
            <button
              type="button"
              role="tab"
              aria-selected={roleFilter === "ALL"}
              className={`${styles.tabBtn} ${roleFilter === "ALL" ? styles.tabBtnActive : ""}`}
              onClick={() => { setRoleFilter("ALL"); setStatusFilter("ALL"); setPage(1); }}
            >
              All Roles {roleCounts.ALL !== undefined ? `(${roleCounts.ALL})` : ""}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={roleFilter === "USER"}
              className={`${styles.tabBtn} ${roleFilter === "USER" ? styles.tabBtnActive : ""}`}
              onClick={() => { setRoleFilter("USER"); setStatusFilter("ALL"); setPage(1); }}
            >
              Learners {roleCounts.USER !== undefined ? `(${roleCounts.USER})` : ""}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={roleFilter === "MANAGER"}
              className={`${styles.tabBtn} ${roleFilter === "MANAGER" ? styles.tabBtnActive : ""}`}
              onClick={() => { setRoleFilter("MANAGER"); setStatusFilter("ALL"); setPage(1); }}
            >
              Batch Managers {roleCounts.MANAGER !== undefined ? `(${roleCounts.MANAGER})` : ""}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={roleFilter === "ADMIN"}
              className={`${styles.tabBtn} ${roleFilter === "ADMIN" ? styles.tabBtnActive : ""}`}
              onClick={() => { setRoleFilter("ADMIN"); setStatusFilter("ALL"); setPage(1); }}
            >
              Admins {roleCounts.ADMIN !== undefined ? `(${roleCounts.ADMIN})` : ""}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={roleFilter === "SUPER_ADMIN"}
              className={`${styles.tabBtn} ${roleFilter === "SUPER_ADMIN" ? styles.tabBtnActive : ""}`}
              onClick={() => { setRoleFilter("SUPER_ADMIN"); setStatusFilter("ALL"); setPage(1); }}
            >
              Super Admins {roleCounts.SUPER_ADMIN !== undefined ? `(${roleCounts.SUPER_ADMIN})` : ""}
            </button>
          </div>
        </div>
      )}

      <section className={styles.tableSection}>
        <div className={styles.sectionHeader} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "0.6rem" }}>
          {/* Left: Search Bar starting from the far left */}
          <div className={styles.searchContainer} style={{ minWidth: "220px", flex: "1 1 240px", maxWidth: "320px" }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ color: "var(--text-muted)", flexShrink: 0, marginRight: "0.4rem" }}>
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              placeholder="Search by name or email..."
              className={styles.searchInput}
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
            />
          </div>

          {/* Right: Status Dropdown + Program Dropdown + Batch Dropdown + Agreement Dropdown + Reset */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
            {/* Status Dropdown */}
            <CustomSelect
              value={statusFilter}
              onChange={(val) => { setStatusFilter(val as any); setPage(1); }}
              options={statusOptions}
              size="sm"
              minWidth="145px"
              searchable={false}
              ariaLabel="Filter by status"
            />

            {(roleFilter === "ALL" || roleFilter === "USER") && (
              <CustomSelect
                value={programFilter}
                onChange={(val) => { setProgramFilter(val); setPage(1); }}
                options={programOptions}
                size="sm"
                minWidth="140px"
                ariaLabel="Filter by enrolled program"
              />
            )}

            {(roleFilter === "ALL" || roleFilter === "USER" || roleFilter === "MANAGER") && (
              <CustomSelect
                value={batchFilter}
                onChange={(val) => { setBatchFilter(val); setPage(1); }}
                options={batchOptions}
                size="sm"
                minWidth="140px"
                ariaLabel="Filter by batch"
              />
            )}

            {(roleFilter === "ALL" || roleFilter === "USER") && (
              <CustomSelect
                value={agreementFilter}
                onChange={(val) => { setAgreementFilter(val as any); setPage(1); }}
                options={agreementOptions}
                size="sm"
                minWidth="145px"
                ariaLabel="Filter by agreement status"
              />
            )}

            {hasActiveFilters && (
              <button
                type="button"
                onClick={resetAllFilters}
                style={{
                  background: "transparent",
                  border: "1px dashed var(--border-light, #d8cdbe)",
                  borderRadius: "8px",
                  padding: "0 0.65rem",
                  height: "36px",
                  fontSize: "0.78rem",
                  color: "var(--text-secondary, #64748b)",
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                }}
                title="Reset all filters and search"
              >
                <span>Reset</span>
                <span style={{ fontSize: "0.9rem" }}>×</span>
              </button>
            )}
          </div>
        </div>

        {actionError && (
          <div role="alert" style={{ margin: "0.5rem 0 1rem", padding: "0.75rem 1rem", borderRadius: "8px", background: "#fef2f2", color: "#b91c1c", fontSize: "0.85rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span>{actionError}</span>
            <button type="button" onClick={() => setActionError(null)} style={{ background: "none", border: "none", color: "#b91c1c", cursor: "pointer", fontWeight: "bold" }}>×</button>
          </div>
        )}

        <div className={styles.tableWrapper}>
          <table className={styles.adminTable}>
            <thead>
              <tr>
                <th
                  onClick={() => handleSort("name")}
                  style={{ cursor: "pointer", userSelect: "none" }}
                  title="Click to sort by User & Profile"
                  aria-sort={sortField === "name" ? (sortDirection === "asc" ? "ascending" : "descending") : "none"}
                >
                  <span style={{ display: "inline-flex", alignItems: "center", gap: "2px" }}>
                    User &amp; Profile {renderSortIcon("name")}
                  </span>
                </th>

                {/* Role column: only shown in All Roles */}
                {roleFilter === "ALL" && (
                  <th
                    onClick={() => handleSort("role")}
                    style={{ cursor: "pointer", userSelect: "none" }}
                    title="Click to sort by Role"
                    aria-sort={sortField === "role" ? (sortDirection === "asc" ? "ascending" : "descending") : "none"}
                  >
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "2px" }}>
                      Role {renderSortIcon("role")}
                    </span>
                  </th>
                )}

                {/* Columns for ALL & USER (Learners) */}
                {(roleFilter === "ALL" || roleFilter === "USER") && (
                  <>
                    <th
                      onClick={() => handleSort("program")}
                      style={{ cursor: "pointer", userSelect: "none" }}
                      title="Click to sort by Enrolled Programs"
                      aria-sort={sortField === "program" ? (sortDirection === "asc" ? "ascending" : "descending") : "none"}
                    >
                      <span style={{ display: "inline-flex", alignItems: "center", gap: "2px" }}>
                        Enrolled Programs {renderSortIcon("program")}
                      </span>
                    </th>
                    <th
                      onClick={() => handleSort("batch")}
                      style={{ cursor: "pointer", userSelect: "none" }}
                      title="Click to sort by Batch"
                      aria-sort={sortField === "batch" ? (sortDirection === "asc" ? "ascending" : "descending") : "none"}
                    >
                      <span style={{ display: "inline-flex", alignItems: "center", gap: "2px" }}>
                        Batch {renderSortIcon("batch")}
                      </span>
                    </th>
                    <th
                      onClick={() => handleSort("step")}
                      style={{ cursor: "pointer", userSelect: "none" }}
                      title="Click to sort by Curriculum Progress"
                      aria-sort={sortField === "step" ? (sortDirection === "asc" ? "ascending" : "descending") : "none"}
                    >
                      <span style={{ display: "inline-flex", alignItems: "center", gap: "2px" }}>
                        Curriculum Progress {renderSortIcon("step")}
                      </span>
                    </th>
                    <th
                      onClick={() => handleSort("agreement")}
                      style={{ cursor: "pointer", userSelect: "none" }}
                      title="Click to sort by Agreement"
                      aria-sort={sortField === "agreement" ? (sortDirection === "asc" ? "ascending" : "descending") : "none"}
                    >
                      <span style={{ display: "inline-flex", alignItems: "center", gap: "2px" }}>
                        Agreement {renderSortIcon("agreement")}
                      </span>
                    </th>
                    {roleFilter === "USER" && (
                      <th
                        onClick={() => handleSort("date")}
                        style={{ cursor: "pointer", userSelect: "none" }}
                        title="Click to sort by Enrolled Date"
                        aria-sort={sortField === "date" ? (sortDirection === "asc" ? "ascending" : "descending") : "none"}
                      >
                        <span style={{ display: "inline-flex", alignItems: "center", gap: "2px" }}>
                          Enrolled On {renderSortIcon("date")}
                        </span>
                      </th>
                    )}
                  </>
                )}

                {/* Columns for Batch Managers */}
                {roleFilter === "MANAGER" && (
                  <>
                    <th
                      onClick={() => handleSort("batch")}
                      style={{ cursor: "pointer", userSelect: "none" }}
                      title="Click to sort by Managed Batches"
                      aria-sort={sortField === "batch" ? (sortDirection === "asc" ? "ascending" : "descending") : "none"}
                    >
                      <span style={{ display: "inline-flex", alignItems: "center", gap: "2px" }}>
                        Managed Batches {renderSortIcon("batch")}
                      </span>
                    </th>
                    <th>Account Status</th>
                    <th>Joined Date</th>
                  </>
                )}

                {/* Columns for Admins */}
                {roleFilter === "ADMIN" && (
                  <>
                    <th>Administrative Scope</th>
                    <th>Account Status</th>
                    <th>Joined Date</th>
                  </>
                )}

                {/* Columns for Super Admins */}
                {roleFilter === "SUPER_ADMIN" && (
                  <>
                    <th>Governance &amp; Access</th>
                    <th>Account Status</th>
                    <th>Joined Date</th>
                  </>
                )}

                <th className={styles.alignRight}>Action</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <TableSkeleton columns={roleFilter === "ALL" || roleFilter === "USER" ? 7 : 5} rows={6} />
              ) : sortedUsers.length === 0 ? (
                <tr>
                  <td colSpan={roleFilter === "ALL" || roleFilter === "USER" ? 7 : 5} style={{ padding: "32px 16px" }}>
                    <EmptyState
                      icon="users"
                      title="No users found"
                      description="No user records matched your filter criteria or search query."
                      actionLabel={hasActiveFilters ? "Reset Filters" : "Add First User"}
                      onAction={hasActiveFilters ? resetAllFilters : () => openCreateModal()}
                    />
                  </td>
                </tr>
              ) : sortedUsers.map((user) => {
                const matchingEnrolments = getMatchingEnrolments(user);
                const availableEnrolments = hasActiveEnrolmentFilter
                  ? (matchingEnrolments.length > 0 ? matchingEnrolments : user.enrolments || [])
                  : (user.enrolments || []);

                const activeEnrolment =
                  (selectedProgramByUser[user.id]
                    ? availableEnrolments.find(
                        (e) => e.id === selectedProgramByUser[user.id] || e.programId === selectedProgramByUser[user.id]
                      )
                    : null) ||
                  availableEnrolments.find((e) => e.status !== "REVOKED") ||
                  availableEnrolments[0];

                const profileHref = activeEnrolment?.id ? `/users/${user.id}?enrolmentId=${activeEnrolment.id}` : `/users/${user.id}`;

                return (
                <tr key={user.id}>
                  {/* User & Profile (Always present) */}
                  <td>
                    <Link href={profileHref} style={{ textDecoration: "none", color: "inherit" }}>
                      <div className={styles.cellUser}>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          <span className={styles.cellUserName}>{user.name}</span>
                          {((user as any).accountStatus === "SUSPENDED" || user.status === "SUSPENDED") && (
                            <span style={{
                              fontSize: "0.65rem",
                              fontWeight: 700,
                              background: "#fee2e2",
                              color: "#991b1b",
                              border: "1px solid #fecaca",
                              borderRadius: "4px",
                              padding: "1px 5px",
                              lineHeight: 1.2,
                            }}>
                              Suspended
                            </span>
                          )}
                          {((user as any).accountStatus === "INACTIVE" || user.status === "INACTIVE" || user.status === "DISABLED") && (
                            <span style={{
                              fontSize: "0.65rem",
                              fontWeight: 700,
                              background: "#f3f4f6",
                              color: "#4b5563",
                              border: "1px solid #e5e7eb",
                              borderRadius: "4px",
                              padding: "1px 5px",
                              lineHeight: 1.2,
                            }}>
                              Disabled
                            </span>
                          )}
                        </div>
                        <span className={styles.cellUserEmail}>{user.email}</span>
                      </div>
                    </Link>
                  </td>

                  {/* Role (Only shown on ALL) */}
                  {roleFilter === "ALL" && (
                    <td>
                      <StatusBadge status={user.role === "USER" ? "Learner" : user.role} />
                    </td>
                  )}

                  {/* Curriculum columns for ALL & USER */}
                  {(roleFilter === "ALL" || roleFilter === "USER") && (
                    <>
                      {(() => {
                        const hasMultipleCourses = (user.enrolments?.length || 0) > 1;
                        const otherProgramsText = hasMultipleCourses
                          ? user.enrolments!.slice(1).map((e) => e.programTitle).filter(Boolean).join(", ")
                          : "";

                        return (
                          <>
                            {/* ENROLLED PROGRAMS */}
                            <td>
                              {user.enrolments && user.enrolments.length > 0 ? (
                                hasMultipleCourses ? (
                                  <div style={{ maxWidth: "200px" }}>
                                    <CustomSelect
                                      value={activeEnrolment?.id || ""}
                                      onChange={(val) => {
                                        setSelectedProgramByUser((prev) => ({ ...prev, [user.id]: val }));
                                      }}
                                      options={availableEnrolments.map((enr) => ({
                                        value: enr.id,
                                        label: enr.programTitle || "Program",
                                      }))}
                                      size="sm"
                                      minWidth="160px"
                                      width="100%"
                                      menuMinWidth="230px"
                                      searchable={false}
                                      ariaLabel={`Select enrolled program for ${user.name}`}
                                    />
                                    {user.enrolments.length > availableEnrolments.length && (
                                      <span
                                        style={{ fontSize: "0.7rem", color: "var(--text-muted)", display: "block", marginTop: "2px", cursor: "default" }}
                                        title={`${user.enrolments.length - availableEnrolments.length} other program(s) filtered out`}
                                      >
                                        +{user.enrolments.length - availableEnrolments.length} other program{user.enrolments.length - availableEnrolments.length > 1 ? "s" : ""}
                                      </span>
                                    )}
                                  </div>
                                ) : (
                                  <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                                    <span style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--text-primary)" }}>
                                      {activeEnrolment?.programTitle || "11 Steps to You"}
                                    </span>
                                  </div>
                                )
                              ) : (
                                <span className={styles.cellTextMuted}>{user.role === "USER" ? "None" : "—"}</span>
                              )}
                            </td>

                            {/* BATCH (Positioned right after Enrolled Programs) */}
                            <td>
                              {user.role === "SUPER_ADMIN" || user.role === "ADMIN" ? (
                                <span className={styles.cellTextMuted}>—</span>
                              ) : user.role === "MANAGER" ? (
                                user.managedBatches && user.managedBatches.length > 0 ? (
                                  <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                                    <span style={{ fontSize: "0.8rem", fontWeight: 700, color: "#1e3a8a" }}>
                                      {user.managedBatches[0]?.name}
                                    </span>
                                    {user.managedBatches.length > 1 && (
                                      <span style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>
                                        +{user.managedBatches.length - 1} more batch{user.managedBatches.length > 2 ? "es" : ""}
                                      </span>
                                    )}
                                  </div>
                                ) : (
                                  <span style={{ fontSize: "0.75rem", color: "#b45309", fontWeight: 600 }}>Unassigned</span>
                                )
                              ) : (
                                (() => {
                                  const batchName =
                                    activeEnrolment?.batchName && activeEnrolment.batchName !== "Unassigned"
                                      ? activeEnrolment.batchName
                                      : (programFilter !== "ALL" ? "Unassigned" : (user.cohort && user.cohort !== "Unassigned" ? user.cohort : "Unassigned"));

                                  return (
                                    <span className={styles.cellText}>
                                      {batchName !== "Unassigned" ? (
                                        <span style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--text-primary)" }}>
                                          {batchName}
                                        </span>
                                      ) : (
                                        <span style={{ fontSize: "0.75rem", color: "#b45309", fontWeight: 600 }}>Unassigned</span>
                                      )}
                                    </span>
                                  );
                                })()
                              )}
                            </td>

                            {/* CURRICULUM PROGRESS */}
                            <td>
                              {user.role === "USER" && user.enrolments && user.enrolments.length > 0 ? (
                                (() => {
                                  const enr = activeEnrolment;
                                  const isLocked = enr?.isStepLocked ?? user.isStepLocked;
                                  const lockReason = enr?.stepLockReason || user.stepLockReason;
                                  const isPaymentPending =
                                    enr?.status === "PENDING_PAYMENT" ||
                                    lockReason === "PAYMENT_REQUIRED" ||
                                    enr?.stepLabel === "Payment Pending" ||
                                    user.stageLabel === "Payment Pending";
                                  const isAgreementPending =
                                    !isPaymentPending &&
                                    (lockReason === "AGREEMENT_REQUIRED" ||
                                      enr?.stepLabel === "Agreement Required" ||
                                      user.stageLabel === "Agreement Required" ||
                                      (!enr?.isAgreementSigned && !user.isAgreementSigned));

                                  // Payment Pending (Orange/Amber Badge)
                                  if (isPaymentPending) {
                                    return (
                                      <span
                                        style={{
                                          display: "inline-flex",
                                          alignItems: "center",
                                          gap: "4px",
                                          fontSize: "0.72rem",
                                          fontWeight: 600,
                                          background: "#fff7ed",
                                          color: "#c2410c",
                                          border: "1px solid #ffedd5",
                                          padding: "2px 8px",
                                          borderRadius: "100px",
                                          whiteSpace: "nowrap",
                                        }}
                                        title="Course unlocked upon payment completion"
                                      >
                                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                          <rect x="2" y="5" width="20" height="14" rx="2" />
                                          <line x1="2" y1="10" x2="22" y2="10" />
                                        </svg>
                                        <span>Payment Pending</span>
                                      </span>
                                    );
                                  }

                                  // Agreement Required (Amber Badge)
                                  if (isLocked && isAgreementPending) {
                                    return (
                                      <span
                                        style={{
                                          display: "inline-flex",
                                          alignItems: "center",
                                          gap: "4px",
                                          fontSize: "0.72rem",
                                          fontWeight: 600,
                                          background: "#fffbeb",
                                          color: "#b45309",
                                          border: "1px solid #fde68a",
                                          padding: "2px 8px",
                                          borderRadius: "100px",
                                          whiteSpace: "nowrap",
                                        }}
                                        title="Workshop agreement must be signed before accessing Step 1"
                                      >
                                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                          <polyline points="14 2 14 8 20 8" />
                                          <line x1="16" y1="13" x2="8" y2="13" />
                                          <line x1="16" y1="17" x2="8" y2="17" />
                                        </svg>
                                        <span>Agreement Required</span>
                                      </span>
                                    );
                                  }

                                  // Administrative Lock
                                  if (isLocked) {
                                    return (
                                      <span
                                        style={{
                                          display: "inline-flex",
                                          alignItems: "center",
                                          gap: "4px",
                                          fontSize: "0.72rem",
                                          fontWeight: 600,
                                          background: "#fee2e2",
                                          color: "#991b1b",
                                          border: "1px solid #fecaca",
                                          padding: "2px 8px",
                                          borderRadius: "100px",
                                          whiteSpace: "nowrap",
                                        }}
                                      >
                                        <svg
                                          width="11"
                                          height="11"
                                          viewBox="0 0 24 24"
                                          fill="none"
                                          stroke="currentColor"
                                          strokeWidth="2.5"
                                          strokeLinecap="round"
                                          strokeLinejoin="round"
                                          aria-hidden="true"
                                        >
                                          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                                          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                                        </svg>
                                        <span>Locked</span>
                                      </span>
                                    );
                                  }

                                  const isCertified = enr?.stepLabel === "Certified";
                                  if (isCertified) {
                                    return (
                                      <span
                                        style={{
                                          display: "inline-flex",
                                          alignItems: "center",
                                          gap: "4px",
                                          fontSize: "0.72rem",
                                          fontWeight: 700,
                                          background: "#dcfce7",
                                          color: "#15803d",
                                          border: "1px solid #bbf7d0",
                                          padding: "2px 8px",
                                          borderRadius: "100px",
                                          whiteSpace: "nowrap",
                                        }}
                                      >
                                        <svg
                                          width="11"
                                          height="11"
                                          viewBox="0 0 24 24"
                                          fill="none"
                                          stroke="currentColor"
                                          strokeWidth="3"
                                          strokeLinecap="round"
                                          strokeLinejoin="round"
                                          aria-hidden="true"
                                        >
                                          <polyline points="20 6 9 17 4 12" />
                                        </svg>
                                        <span>Certified</span>
                                      </span>
                                    );
                                  }

                                  const completedSteps = enr?.completedSteps ?? user.completedSteps ?? 0;
                                  const totalSteps = enr?.totalSteps ?? user.totalSteps ?? 11;
                                  const progressPercent = enr?.progressPercent ?? user.progressPercent ?? (totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0);
                                  const label = enr?.stepLabel || `${completedSteps}/${totalSteps} Steps (${progressPercent}%)`;
                                  const isCompleted = completedSteps === totalSteps && totalSteps > 0;
                                  const hasStarted = completedSteps > 0 || progressPercent > 0;

                                  return (
                                    <span
                                      style={{
                                        display: "inline-flex",
                                        alignItems: "center",
                                        gap: "4px",
                                        fontSize: "0.75rem",
                                        fontWeight: 700,
                                        background: isCompleted ? "#dcfce7" : hasStarted ? "#eff6ff" : "#fef3c7",
                                        color: isCompleted ? "#15803d" : hasStarted ? "#1d4ed8" : "#92400e",
                                        border: `1px solid ${isCompleted ? "#bbf7d0" : hasStarted ? "#bfdbfe" : "#fde68a"}`,
                                        padding: "2px 8px",
                                        borderRadius: "100px",
                                        whiteSpace: "nowrap",
                                      }}
                                    >
                                      {label}
                                    </span>
                                  );
                                })()
                              ) : (
                                <span className={styles.cellTextMuted}>—</span>
                              )}
                            </td>

                            {/* AGREEMENT */}
                            <td>
                              {user.role === "USER" ? (
                                (activeEnrolment ? activeEnrolment.isAgreementSigned ?? user.isAgreementSigned : user.isAgreementSigned) ? (
                                  <span
                                    style={{
                                      display: "inline-flex",
                                      alignItems: "center",
                                      gap: "4px",
                                      fontSize: "0.75rem",
                                      fontWeight: 600,
                                      background: "#f0fdf4",
                                      color: "#166534",
                                      border: "1px solid #bbf7d0",
                                      padding: "2px 8px",
                                      borderRadius: "100px",
                                    }}
                                  >
                                    <svg
                                      width="11"
                                      height="11"
                                      viewBox="0 0 24 24"
                                      fill="none"
                                      stroke="currentColor"
                                      strokeWidth="3"
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      aria-hidden="true"
                                    >
                                      <polyline points="20 6 9 17 4 12" />
                                    </svg>
                                    <span>Signed</span>
                                  </span>
                                ) : (
                                  <span
                                    style={{
                                      display: "inline-flex",
                                      alignItems: "center",
                                      gap: "4px",
                                      fontSize: "0.75rem",
                                      fontWeight: 600,
                                      background: "#fffbeb",
                                      color: "#b45309",
                                      border: "1px solid #fde68a",
                                      padding: "2px 8px",
                                      borderRadius: "100px",
                                    }}
                                  >
                                    Pending
                                  </span>
                                )
                              ) : (
                                <span className={styles.cellTextMuted}>—</span>
                              )}
                            </td>
                          </>
                        );
                      })()}
                      {roleFilter === "USER" && (
                        <td>
                          <span className={styles.cellTextMuted}>
                            {getEnrolledDate(user, activeEnrolment)}
                          </span>
                        </td>
                      )}
                    </>
                  )}

                  {/* Batch Manager-specific columns */}
                  {roleFilter === "MANAGER" && (
                    <>
                      <td>
                        {user.managedBatches && user.managedBatches.length > 0 ? (
                          <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                            <span style={{ fontSize: "0.82rem", fontWeight: 700, color: "#1e3a8a" }}>
                              {user.managedBatches[0]?.name}
                            </span>
                            {user.managedBatches.length > 1 && (
                              <span style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>
                                +{user.managedBatches.length - 1} more batch{user.managedBatches.length > 2 ? "es" : ""}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span style={{ fontSize: "0.75rem", color: "#b45309", fontWeight: 600 }}>Unassigned</span>
                        )}
                      </td>
                      <td>
                        <StatusBadge status={user.status || "ACTIVE"} />
                      </td>
                      <td>
                        <span className={styles.cellTextMuted}>{formatNumericDate(user.joined || user.createdAt)}</span>
                      </td>
                    </>
                  )}

                  {/* Admin-specific columns */}
                  {roleFilter === "ADMIN" && (
                    <>
                      <td>
                        <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                          <span style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--text-primary)" }}>
                            LMS Operations &amp; Approvals
                          </span>
                          <span style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>
                            Programs, Batches, Quizzes &amp; Reports
                          </span>
                        </div>
                      </td>
                      <td>
                        <StatusBadge status={user.status || "ACTIVE"} />
                      </td>
                      <td>
                        <span className={styles.cellTextMuted}>{formatNumericDate(user.joined || user.createdAt)}</span>
                      </td>
                    </>
                  )}

                  {/* Super Admin-specific columns */}
                  {roleFilter === "SUPER_ADMIN" && (
                    <>
                      <td>
                        <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                          <span style={{ fontSize: "0.82rem", fontWeight: 700, color: "var(--text-primary)" }}>
                            Full System Governance
                          </span>
                          <span style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>
                            {user.twoFactorEnabled ? "2FA Protected • All Systems" : "Global Governance • Foxwel &amp; Roweena"}
                          </span>
                        </div>
                      </td>
                      <td>
                        <StatusBadge status={user.status || "ACTIVE"} />
                      </td>
                      <td>
                        <span className={styles.cellTextMuted}>{formatNumericDate(user.joined || user.createdAt)}</span>
                      </td>
                    </>
                  )}
                  <td className={styles.alignRight}>
                    <ActionMenu
                      ariaLabel={`Actions for ${user.name}`}
                      items={[
                        {
                          label: "View Profile",
                          href: profileHref,
                          icon: (
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                              <circle cx="12" cy="7" r="4" />
                            </svg>
                          ),
                        },
                        ...((user.role === "USER" || user.role === "MANAGER")
                          ? [
                              {
                                label: "Assign Batch",
                                onClick: () => openAssignBatchModal(user),
                                icon: (
                                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                    <polygon points="12 2 2 7 12 12 22 7 12 2" />
                                    <polyline points="2 17 12 22 22 17" />
                                    <polyline points="2 12 12 17 22 12" />
                                  </svg>
                                ),
                              },
                            ]
                          : []),
                        ...(!isManager
                          ? [
                              ...(!isSuperAdmin && user.role === "SUPER_ADMIN"
                                ? []
                                : [
                                    {
                                      label: "Edit Role / Profile",
                                      onClick: () => openEditModal(user),
                                      icon: (
                                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                                        </svg>
                                      ),
                                    },
                                    ...(user.role === "USER" || (user.enrolments && user.enrolments.length > 0)
                                      ? [
                                          {
                                            label: "Revoke Access",
                                            danger: true,
                                            dividerAbove: true,
                                            onClick: () => handleOpenRevokeModal(user),
                                            icon: (
                                              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                                <polyline points="3 6 5 6 21 6" />
                                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                                <line x1="10" y1="11" x2="10" y2="17" />
                                                <line x1="14" y1="11" x2="14" y2="17" />
                                              </svg>
                                            ),
                                          },
                                        ]
                                      : []),
                                  ]),
                            ]
                          : []),
                      ]}
                    />
                  </td>
                </tr>
              );
            })}
            </tbody>
          </table>
        </div>

        {!isLoading && totalUsers > 0 && (
          <Pagination
            currentPage={page}
            totalItems={totalUsers}
            pageSize={pageSize}
            onPageChange={(newPage) => setPage(newPage)}
            onPageSizeChange={(newSize) => {
              setPageSize(newSize);
              setPage(1);
            }}
            pageSizeOptions={[10, 20, 50]}
            itemLabel={roleFilter === "USER" ? "learners" : "users"}
          />
        )}
      </section>

      {/* ROLE ASSIGNMENT & USER MODAL */}
      {isModalOpen && (
        <div className={styles.modalOverlay} onClick={() => setIsModalOpen(false)}>
          <div className={`${styles.modalContent} ${styles.modalContentWide}`} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2>{editingUserId ? "Edit User & Role Assignment" : "Add New User"}</h2>
              <button className={styles.closeBtn} onClick={() => setIsModalOpen(false)} aria-label="Close dialog">×</button>
            </div>

            <form className={`${styles.modalForm} ${styles.userModalForm}`} onSubmit={handleSaveUser}>
              <div className={`${styles.modalBody} ${styles.userModalBody}`}>
                {/* 1. EMAIL */}
                <div className={styles.formGroup}>
                  <label htmlFor="user-modal-email">Email Address <span style={{ color: "var(--accent-primary)" }}>*</span></label>
                  <input
                    id="user-modal-email"
                    type="email"
                    placeholder="name@example.com"
                    required
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                  />
                </div>

                {/* 2. FIRST & LAST NAME */}
                <div className={styles.formRow}>
                  <div className={styles.formGroup}>
                    <label htmlFor="user-modal-firstname">First Name <span style={{ color: "var(--accent-primary)" }}>*</span></label>
                    <input
                      id="user-modal-firstname"
                      type="text"
                      placeholder="e.g. Alex"
                      required
                      value={firstName}
                      onChange={e => setFirstName(e.target.value)}
                    />
                  </div>
                  <div className={styles.formGroup}>
                    <label htmlFor="user-modal-lastname">Last Name <span style={{ color: "var(--accent-primary)" }}>*</span></label>
                    <input
                      id="user-modal-lastname"
                      type="text"
                      placeholder="e.g. Morgan"
                      required
                      value={lastName}
                      onChange={e => setLastName(e.target.value)}
                    />
                  </div>
                </div>

                {/* 3. PRIMARY ROLE SELECTION */}
                <div className={styles.roleSection}>
                  <label style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: "0.35rem" }}>
                    Select Primary Role <span style={{ color: "var(--accent-primary)" }}>*</span>
                  </label>

                  <div className={styles.roleGrid} role="radiogroup" aria-label="Select primary role">
                    {ROLE_CARDS.map(card => {
                      const isSelected = role === card.id;
                      const isDisabled = card.requiresSuperAdmin && !isSuperAdmin;
                      return (
                        <div
                          key={card.id}
                          role="radio"
                          aria-checked={isSelected}
                          aria-disabled={isDisabled}
                          tabIndex={isDisabled ? -1 : 0}
                          className={`${styles.roleCard} ${isSelected ? styles.roleCardSelected : ""} ${isDisabled ? styles.roleCardDisabled : ""}`}
                          onClick={() => {
                            if (isDisabled) return;
                            setRole(card.id);
                          }}
                          onKeyDown={(e) => {
                            if ((e.key === " " || e.key === "Enter") && !isDisabled) {
                              e.preventDefault();
                              setRole(card.id);
                            }
                          }}
                        >
                          <div className={styles.roleCardHeader}>
                            <div className={styles.roleCardTitleRow}>
                              <StatusBadge status={card.badgeLabel} tone={card.tone} />
                            </div>
                            <div className={styles.roleRadioIndicator} aria-hidden="true">
                              {isSelected && (
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                                  <polyline points="20 6 9 17 4 12" />
                                </svg>
                              )}
                            </div>
                          </div>

                          <p className={styles.rolePurpose}>{card.description}</p>

                          {isDisabled && (
                            <div style={{ fontSize: "0.72rem", color: "var(--status-error)", marginTop: "0.2rem" }}>
                              Requires Super Admin role
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* 4. ASSIGNED BATCH (LEARNERS & MANAGERS ONLY - NOT FOR SUPER ADMIN OR ADMIN) */}
                {role === "USER" && (
                  <>
                    {editingUserEnrolments.length > 1 && (
                      <div className={styles.formGroup} style={{ marginTop: "0.2rem" }}>
                        <label>Enrolment to Update ({editingUserEnrolments.length} total)</label>
                        <CustomSelect
                          value={editingEnrolmentId || ""}
                          onChange={(val) => {
                            setEditingEnrolmentId(val);
                            const selected = editingUserEnrolments.find(e => e.id === val);
                            if (selected?.batchId) {
                              setCohort(selected.batchId);
                            }
                          }}
                          options={editingUserEnrolments.map((e) => ({
                            value: e.id,
                            label: `${e.programTitle || 'Program'} - ${e.batchName || 'Unassigned Batch'} [${e.status}]`,
                          }))}
                          fullWidth
                          ariaLabel="Select enrolment to update"
                        />
                      </div>
                    )}

                    <div className={styles.formGroup} style={{ marginTop: "0.2rem" }}>
                      <label htmlFor="user-modal-cohort">
                        Assigned Batch <span className={styles.optionalLabel}>(Optional)</span>
                      </label>
                      <CustomSelect
                        value={cohort}
                        onChange={(val) => setCohort(val)}
                        options={[
                          { value: "", label: "None (Pending Placement)" },
                          ...batches.map((b) => ({ value: b.id, label: b.name })),
                        ]}
                        fullWidth
                        ariaLabel="Assign to batch"
                      />
                    </div>
                  </>
                )}

                {role === "MANAGER" && (
                  <div className={styles.formGroup} style={{ marginTop: "0.2rem" }}>
                    <label style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: "0.35rem" }}>
                      Assigned Batches <span className={styles.optionalLabel}>(Select batches this manager will oversee)</span>
                    </label>
                    {batches.length === 0 ? (
                      <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", fontStyle: "italic", margin: 0, padding: "0.4rem 0" }}>
                        No batches available. Create batches in the Batches tab.
                      </p>
                    ) : (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", maxHeight: "90px", overflowY: "auto", padding: "0.4rem", background: "#fdfbf7", border: "1px solid var(--border-light)", borderRadius: "8px" }}>
                        {batches.map((b) => {
                          const isChecked = selectedManagerBatchIds.includes(b.id);
                          return (
                            <label
                              key={b.id}
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "0.45rem",
                                padding: "0.25rem 0.6rem",
                                borderRadius: "6px",
                                fontSize: "0.8rem",
                                cursor: "pointer",
                                background: isChecked ? "#ecfdf5" : "#ffffff",
                                border: isChecked ? "1.5px solid #10b981" : "1px solid #e2d9cd",
                                color: isChecked ? "#065f46" : "var(--text-primary)",
                                fontWeight: isChecked ? 600 : 400,
                                transition: "all 0.15s ease",
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setSelectedManagerBatchIds((prev) => [...prev, b.id]);
                                    if (!cohort) setCohort(b.id);
                                  } else {
                                    setSelectedManagerBatchIds((prev) => prev.filter((id) => id !== b.id));
                                    if (cohort === b.id) setCohort("");
                                  }
                                }}
                                style={{ accentColor: "#10b981", margin: 0 }}
                              />
                              <span>{b.name}</span>
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* 5. TEMPORARY PASSWORD & ACCOUNT STATUS */}
                {editingUserId ? (
                  <div className={styles.formRow}>
                    <div className={styles.formGroup}>
                      <label htmlFor="user-modal-password">
                        New Password <span className={styles.optionalLabel}>(Leave blank to keep current)</span>
                      </label>
                      <input
                        id="user-modal-password"
                        type="password"
                        autoComplete="new-password"
                        placeholder="Leave blank to keep unchanged"
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                      />
                    </div>

                    <div className={styles.formGroup}>
                      <label>Account Status</label>
                      <CustomSelect
                        value={status}
                        onChange={(val) => setStatus(val)}
                        options={[
                          { value: "ACTIVE", label: "Active (Full Access)" },
                          { value: "SUSPENDED", label: "Suspended (Revokes Sessions)" },
                          { value: "INACTIVE", label: "Inactive (Disabled)" },
                        ]}
                        fullWidth
                        ariaLabel="Select account status"
                      />
                      <p style={{ margin: "0.3rem 0 0", fontSize: "0.75rem", color: "var(--text-muted)", display: "flex", alignItems: "center", gap: "4px" }}>
                        <span>Security:</span>
                        {users.find(u => u.id === editingUserId)?.twoFactorEnabled ? (
                          <span style={{ color: "#047857", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: "3px" }}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                            </svg>
                            <span>2FA Enabled</span>
                          </span>
                        ) : (
                          <span>2FA Disabled</span>
                        )}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className={styles.formGroup}>
                    <label htmlFor="user-modal-password">
                      Password <span style={{ color: "var(--accent-primary)" }}>*</span>{" "}
                      <span className={styles.optionalLabel}>(At least 8 chars)</span>
                    </label>
                    <input
                      id="user-modal-password"
                      type="text"
                      autoComplete="off"
                      minLength={8}
                      required
                      placeholder="At least 8 characters"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                    />
                  </div>
                )}



                {/* 7. DYNAMIC ROLE CHANGE SECURITY WARNING */}
                {editingUserId && role !== initialRole && (
                  <div className={styles.roleWarningBanner} role="alert">
                    <div className={styles.roleWarningTitle}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
                        <line x1="12" y1="9" x2="12" y2="13" />
                        <line x1="12" y1="17" x2="12.01" y2="17" />
                      </svg>
                      <span>Role Permission &amp; Security Boundary Change</span>
                    </div>
                    <p className={styles.roleWarningText}>
                      You are changing this account from <strong>{initialRole}</strong> to <strong>{role}</strong>.
                    </p>
                    <ul className={styles.roleWarningList}>
                      <li><strong>Immediate scope re-evaluation:</strong> The server will verify permissions under the new role on every request.</li>
                      <li><strong>Session revocation:</strong> All active sessions and refresh tokens for this user will be revoked immediately upon saving (forcing re-login).</li>
                      <li><strong>Audit logging:</strong> This administrative change is permanently recorded in the system audit log.</li>
                    </ul>
                  </div>
                )}

                {formError && (
                  <p role="alert" style={{ margin: 0, padding: '0.75rem 1rem', borderRadius: '8px', background: '#fef2f2', color: '#b91c1c', fontSize: '0.85rem' }}>{formError}</p>
                )}
              </div>

              <div className={styles.modalFooter}>
                <button type="button" className={styles.secondaryBtn} onClick={() => setIsModalOpen(false)}>Cancel</button>
                <button type="submit" className={styles.primaryBtn} disabled={isSubmitting}>
                  {isSubmitting ? (
                    <>
                      <span className="spinner" /> Saving...
                    </>
                  ) : (
                    editingUserId ? "Save Changes" : "Add User"
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Quick Assign Batch Modal */}
      {assignBatchUser && (
        <Modal
          isOpen={Boolean(assignBatchUser)}
          onClose={() => setAssignBatchUser(null)}
          title={`Assign Batch: ${assignBatchUser.name || assignBatchUser.email}`}
          maxWidth="480px"
          footer={
            <>
              <button
                type="button"
                className={styles.secondaryBtn}
                onClick={() => setAssignBatchUser(null)}
                disabled={isAssigningBatch}
              >
                Cancel
              </button>
              <button
                type="button"
                className={styles.primaryBtn}
                onClick={handleAssignBatchSubmit}
                disabled={isAssigningBatch}
              >
                {isAssigningBatch ? (
                  <>
                    <span className="spinner" /> Saving...
                  </>
                ) : (
                  "Save Assignment"
                )}
              </button>
            </>
          }
        >
          <div className={styles.formGroup} style={{ marginTop: "0.5rem" }}>
            <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: 600, fontSize: "0.875rem", color: "var(--text-primary)" }}>
              Select Batch
            </label>
            <CustomSelect
              options={[
                { value: "", label: "No Batch Assigned (Unassigned)" },
                ...batches.map((b) => ({
                  value: b.id,
                  label: b.name,
                })),
              ]}
              value={assignBatchId}
              onChange={(val) => setAssignBatchId(val)}
              placeholder="Select batch..."
            />
          </div>
        </Modal>
      )}

      {/* Branded, Accessible Revoke Access Confirmation Modal */}
      <RevokeAccessModal
        isOpen={isRevokeModalOpen}
        onClose={() => setIsRevokeModalOpen(false)}
        user={revokingUser}
        onSuccess={fetchUsers}
      />

    </div>
  );
}
