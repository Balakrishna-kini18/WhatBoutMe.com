"use client";

import { useEffect, useState, useMemo, FormEvent, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import styles from "../page.module.css";
import { API_URL, errorMessage, cachedFetch } from "../lib/api";
import { CustomSelect, ActionMenu, StatusBadge, ConfirmDialog, useToast, TableSkeleton, EmptyState, SortIndicator, DatePicker, Pagination, type SortOrder } from "../components";

interface Batch {
  id: string;
  name: string;
  program: string;
  programId?: string;
  manager: string;
  managerId?: string;
  students: number;
  status: string;
  startDate: string;
  endDate?: string;
  rawStartDate?: string;
  rawEndDate?: string;
  rawRegistrationDeadline?: string;
  registrationDeadline?: string;
  capacity?: number;
}

type SortField = "name" | "program" | "manager" | "startDate" | "students" | "status";

export default function BatchesPage() {
  return (
    <Suspense fallback={null}>
      <BatchesContent />
    </Suspense>
  );
}

function BatchesContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { success: toastSuccess, error: toastError } = useToast();
  const [batchToDelete, setBatchToDelete] = useState<Batch | null>(null);
  const [isDeletingBatch, setIsDeletingBatch] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingBatchId, setEditingBatchId] = useState<string | null>(null);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [programs, setPrograms] = useState<{ id: string; title: string; hasCertificate?: boolean }[]>([]);
  const [managers, setManagers] = useState<{ id: string; name: string; email: string }[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentUserRole, setCurrentUserRole] = useState("USER");
  const isManager = currentUserRole === "MANAGER" || currentUserRole === "TEACHER";

  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem("user") || "{}");
      setCurrentUserRole(stored.role || "USER");
    } catch {
      setCurrentUserRole("USER");
    }
  }, []);

  // Pagination
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Form states
  const [name, setName] = useState("");
  const [programId, setProgramId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [registrationDeadline, setRegistrationDeadline] = useState("");
  const [capacity, setCapacity] = useState("");
  const [manager, setManager] = useState("");
  const [batchStatus, setBatchStatus] = useState("");
  const [awardCertificate, setAwardCertificate] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  // Filters
  const [search, setSearch] = useState("");
  const [selectedProgramFilter, setSelectedProgramFilter] = useState("");
  const [selectedStatusFilter, setSelectedStatusFilter] = useState("");

  const hasActiveFilters = Boolean(
    search.trim() || selectedProgramFilter || selectedStatusFilter
  );

  const resetAllFilters = () => {
    setSearch("");
    setSelectedProgramFilter("");
    setSelectedStatusFilter("");
    setPage(1);
  };

  // Sorting
  const [sortField, setSortField] = useState<SortField>("startDate");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortOrder("asc");
    }
  };

  useEffect(() => {
    Promise.all([fetchBatches(), fetchPrograms(), fetchManagers()]).then(() =>
      setIsLoading(false)
    );
  }, []);

  // Auto-open modal if ?create=1 or ?action=create is present in URL
  useEffect(() => {
    if (!isManager && (searchParams.get("create") === "1" || searchParams.get("action") === "create")) {
      openCreateModal();
    }
  }, [searchParams, isManager]);

  // Auto-filter by target batch if ?id= or ?batchId= is present
  useEffect(() => {
    const targetId = searchParams.get("id") || searchParams.get("batchId");
    if (targetId && batches.length > 0) {
      const match = batches.find((b) => b.id === targetId);
      if (match && !search) {
        setSearch(match.name);
      }
    }
  }, [searchParams, batches]);

  useEffect(() => {
    if (isModalOpen) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === "Escape") {
          closeModal();
        }
      };
      window.addEventListener("keydown", handleKeyDown);
      return () => {
        document.body.style.overflow = originalOverflow;
        window.removeEventListener("keydown", handleKeyDown);
      };
    }
  }, [isModalOpen]);

  const fetchManagers = async () => {
    try {
      const res = await cachedFetch(`${API_URL}/users?limit=100`);
      if (res.ok) {
        const json = await res.json();
        const userList = Array.isArray(json) ? json : json?.data || [];
        setManagers(
          userList.filter(
            (u: any) =>
              u.role === "MANAGER" ||
              u.role === "SUPER_ADMIN" ||
              u.role === "ADMIN"
          )
        );
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchPrograms = async () => {
    try {
      const res = await cachedFetch(`${API_URL}/programs`);
      if (res.ok) {
        const data = await res.json();
        setPrograms(data);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchBatches = async () => {
    try {
      const res = await cachedFetch(`${API_URL}/batches`);
      if (res.ok) {
        const data = await res.json();
        const now = new Date();
        const todayStartMs = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
        const mappedBatches = data.map((b: any) => {
          return {
            ...b,
            status: b.status,
            program: b.program?.title || "Unknown",
            manager: b.manager?.name || "Unassigned",
            managerId: b.managerId || b.manager?.id || "",
            rawStartDate: b.startDate,
            rawEndDate: b.endDate,
            rawRegistrationDeadline: b.registrationDeadline,
            startDate: b.startDate
              ? new Date(b.startDate).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })
              : "--",
            registrationDeadline: b.registrationDeadline
              ? new Date(b.registrationDeadline).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })
              : "--",
            students: b.enrolledCount ?? b.students ?? 0,
            capacity: b.capacity || 50,
          };
        });
        setBatches(mappedBatches);
      }
    } catch (e) {
      console.error("Failed to fetch batches", e);
    }
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingBatchId(null);
    setName("");
    setProgramId("");
    setStartDate("");
    setEndDate("");
    setRegistrationDeadline("");
    setCapacity("");
    setManager("");
    setBatchStatus("");
    setFormError("");
    if (searchParams.get("create") || searchParams.get("action")) {
      router.replace("/batches");
    }
  };

  const openEditModal = (batch: Batch) => {
    setEditingBatchId(batch.id);
    setName(batch.name);
    const p = programs.find((prog) => prog.title === batch.program || prog.id === batch.programId);
    setProgramId(p ? p.id : (batch.programId || ""));
    const startSource = batch.rawStartDate || batch.startDate;
    const d = startSource ? new Date(startSource) : null;
    if (d && !isNaN(d.getTime())) {
      setStartDate(d.toISOString().split("T")[0] || "");
    } else {
      setStartDate("");
    }
    const endSource = batch.rawEndDate || batch.endDate;
    const ed = endSource ? new Date(endSource) : null;
    if (ed && !isNaN(ed.getTime())) {
      setEndDate(ed.toISOString().split("T")[0] || "");
    } else {
      setEndDate("");
    }
    const regSource = batch.rawRegistrationDeadline || batch.registrationDeadline;
    const rd = regSource && regSource !== "--" ? new Date(regSource) : null;
    if (rd && !isNaN(rd.getTime())) {
      setRegistrationDeadline(rd.toISOString().split("T")[0] || "");
    } else {
      setRegistrationDeadline("");
    }
    setCapacity(String(batch.capacity || "50"));
    setManager(batch.managerId || "");
    setBatchStatus(batch.status || "");
    setAwardCertificate(p?.hasCertificate ?? true);
    setIsModalOpen(true);
  };

  const openCreateModal = () => {
    setEditingBatchId(null);
    setName("");
    setProgramId(programs[0]?.id || "");
    setStartDate("");
    setEndDate("");
    setRegistrationDeadline("");
    setBatchStatus("");
    setCapacity("50");
    setManager("");
    setAwardCertificate(true);
    setFormError("");
    setIsModalOpen(true);
  };


  const confirmDeleteBatch = async () => {
    if (!batchToDelete) return;
    setIsDeletingBatch(true);
    setDeleteError(null);
    try {
      const res = await cachedFetch(`${API_URL}/batches/${batchToDelete.id}`, {
        method: "DELETE",
      });
      if (res.ok || res.status === 404) {
        toastSuccess(`Batch "${batchToDelete.name}" deleted successfully.`);
        setBatches((prev) => prev.filter((b) => b.id !== batchToDelete.id));
        setBatchToDelete(null);
        fetchBatches();
      } else {
        const err = await errorMessage(res, "Could not delete batch.");
        setDeleteError(err);
        toastError(err);
      }
    } catch (e) {
      console.error("Failed to delete batch", e);
      setDeleteError("Failed to communicate with the server.");
      toastError("Failed to communicate with the server.");
    } finally {
      setIsDeletingBatch(false);
    }
  };

  const handleSaveBatch = async (e: FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    if (!name.trim()) {
      setFormError("Batch name is required.");
      return;
    }

    if (!startDate) {
      setFormError("Please select a valid Start Date.");
      return;
    }

    const todayStr = new Date().toISOString().slice(0, 10);
    if (!editingBatchId && startDate < todayStr) {
      setFormError("Batch Start Date cannot be in the past.");
      return;
    }

    if (endDate && endDate < startDate) {
      setFormError("Batch End Date must be on or after Start Date.");
      return;
    }

    if (!registrationDeadline) {
      setFormError("Please select a Registration Deadline.");
      return;
    }

    if (!editingBatchId && registrationDeadline < todayStr) {
      setFormError("Registration Deadline cannot be in the past.");
      return;
    }

    if (registrationDeadline && endDate && registrationDeadline > endDate) {
      setFormError("Registration Deadline cannot be after Batch End Date.");
      return;
    }

    setIsSubmitting(true);
    setFormError("");

    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    const payload: any = {
      name: name.trim(),
      programId: programId,
      startDate: new Date(startDate).toISOString(),
      capacity: parseInt(capacity) || 50,
      managerId: manager || null,
      ...(batchStatus ? { status: batchStatus } : {}),
    };

    if (endDate) {
      payload.endDate = new Date(endDate).toISOString();
    }

    if (registrationDeadline) {
      payload.registrationDeadline = new Date(registrationDeadline).toISOString();
    } else if (editingBatchId) {
      payload.registrationDeadline = null;
    }

    try {
      const url = editingBatchId
        ? `${API_URL}/batches/${editingBatchId}`
        : `${API_URL}/batches`;
      const method = editingBatchId ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        if (programId) {
          await fetch(`${API_URL}/programs/${programId}`, {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({ hasCertificate: awardCertificate }),
          }).catch(() => null);
        }
        closeModal();
        fetchBatches();
      } else {
        const data = await res.json().catch(() => null);
        const raw = data?.error?.message ?? data?.message;
        setFormError(
          (Array.isArray(raw) ? raw.join(", ") : raw) ||
            `Could not save the batch (HTTP ${res.status}).`
        );
      }
    } catch (e) {
      console.error("Failed to save batch", e);
      setFormError("Could not reach the server. Check that the API is running.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredAndSortedBatches = batches
    .filter((batch) => {
      const q = search.toLowerCase();
      const matchesSearch =
        !q ||
        batch.name.toLowerCase().includes(q) ||
        (batch.manager && batch.manager.toLowerCase().includes(q)) ||
        (batch.program && batch.program.toLowerCase().includes(q));
      const matchesProgram =
        !selectedProgramFilter || batch.program === selectedProgramFilter;
      const matchesStatus =
        !selectedStatusFilter ||
        batch.status?.toUpperCase() === selectedStatusFilter.toUpperCase();
      return matchesSearch && matchesProgram && matchesStatus;
    })
    .sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case "name":
          comparison = a.name.localeCompare(b.name);
          break;
        case "program":
          comparison = a.program.localeCompare(b.program);
          break;
        case "manager":
          comparison = (a.manager || "").localeCompare(b.manager || "");
          break;
        case "startDate": {
          const aTime = a.rawStartDate ? new Date(a.rawStartDate).getTime() : 0;
          const bTime = b.rawStartDate ? new Date(b.rawStartDate).getTime() : 0;
          comparison = aTime - bTime;
          break;
        }
        case "students":
          comparison = (a.students || 0) - (b.students || 0);
          break;
        case "status":
          comparison = (a.status || "").localeCompare(b.status || "");
          break;
        default:
          comparison = 0;
      }
      return sortOrder === "asc" ? comparison : -comparison;
    });

  const totalBatches = filteredAndSortedBatches.length;
  const paginatedBatches = filteredAndSortedBatches.slice(
    (page - 1) * pageSize,
    page * pageSize
  );

  const statusCounts = useMemo(() => {
    const counts = {
      ALL: batches.length,
      ACTIVE: 0,
      UPCOMING: 0,
      COMPLETED: 0,
      ARCHIVED: 0,
    };
    for (const b of batches) {
      const s = (b.status || "").toUpperCase();
      if (s === "ACTIVE") counts.ACTIVE++;
      else if (s === "UPCOMING") counts.UPCOMING++;
      else if (s === "COMPLETED") counts.COMPLETED++;
      else if (s === "ARCHIVED" || s === "DRAFT") counts.ARCHIVED++;
    }
    return counts;
  }, [batches]);

  const activeTab = selectedStatusFilter ? selectedStatusFilter.toUpperCase() : "ALL";

  return (
    <div className={styles.dashboardContainer} style={{ gap: "0.85rem" }}>
      <header
        className={styles.header}
        style={{
          marginBottom: 0,
          alignItems: "center",
          display: "flex",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "1rem",
        }}
      >
        <div className={styles.headerText}>
          <h1 className={styles.title} style={{ margin: 0 }}>
            {isManager ? "Assigned Batches" : "Batches"}
          </h1>
        </div>
        {!isManager && (
          <div className={styles.headerActions}>
            <button className={styles.primaryBtn} onClick={openCreateModal}>
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              <span>Create Batch</span>
            </button>
          </div>
        )}
      </header>

      {/* 2. Batch Page Structure: Status Tab Layout */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.75rem", marginBottom: "0.25rem" }}>
        <div className={styles.tabsContainer} role="tablist" aria-label="Batch directory views" style={{ gap: "0.5rem", flexWrap: "wrap", margin: 0 }}>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "ALL"}
            className={`${styles.tabBtn} ${activeTab === "ALL" ? styles.tabBtnActive : ""}`}
            onClick={() => { setSelectedStatusFilter(""); setPage(1); }}
          >
            All Batches ({statusCounts.ALL})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "ACTIVE"}
            className={`${styles.tabBtn} ${activeTab === "ACTIVE" ? styles.tabBtnActive : ""}`}
            onClick={() => { setSelectedStatusFilter("ACTIVE"); setPage(1); }}
          >
            Active ({statusCounts.ACTIVE})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "UPCOMING"}
            className={`${styles.tabBtn} ${activeTab === "UPCOMING" ? styles.tabBtnActive : ""}`}
            onClick={() => { setSelectedStatusFilter("UPCOMING"); setPage(1); }}
          >
            Upcoming ({statusCounts.UPCOMING})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "COMPLETED"}
            className={`${styles.tabBtn} ${activeTab === "COMPLETED" ? styles.tabBtnActive : ""}`}
            onClick={() => { setSelectedStatusFilter("COMPLETED"); setPage(1); }}
          >
            Completed ({statusCounts.COMPLETED})
          </button>
          {statusCounts.ARCHIVED > 0 && (
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "ARCHIVED"}
              className={`${styles.tabBtn} ${activeTab === "ARCHIVED" ? styles.tabBtnActive : ""}`}
              onClick={() => { setSelectedStatusFilter("ARCHIVED"); setPage(1); }}
            >
              Archived ({statusCounts.ARCHIVED})
            </button>
          )}
        </div>
      </div>

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
              placeholder="Search batches, programs, managers..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className={styles.searchInput}
            />
          </div>

          {/* Right: Program Filter & Reset Button */}
          <div
            style={{
              display: "flex",
              gap: "0.65rem",
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <CustomSelect
              value={selectedProgramFilter}
              onChange={(val) => {
                setSelectedProgramFilter(val);
                setPage(1);
              }}
              options={[
                { value: "", label: "All Programs" },
                ...programs.map((p) => ({ value: p.title, label: p.title })),
              ]}
              minWidth="175px"
              ariaLabel="Filter batches by program"
            />
            {hasActiveFilters && (
              <button
                type="button"
                onClick={resetAllFilters}
                style={{
                  background: "transparent",
                  border: "1px dashed var(--border-light, #e7decb)",
                  color: "var(--accent-primary, #c97a1e)",
                  fontSize: "0.78rem",
                  fontWeight: 600,
                  cursor: "pointer",
                  padding: "0.4rem 0.75rem",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.35rem",
                  borderRadius: "6px",
                  height: "36px",
                  whiteSpace: "nowrap",
                }}
                title="Reset all filters to default"
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M23 4v6h-6" />
                  <path d="M1 20v-6h6" />
                  <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                </svg>
                <span>Reset Filters</span>
              </button>
            )}
          </div>
        </div>

        <div className={styles.tableWrapper}>
          <table className={styles.adminTable}>
            <thead>
              <tr>
                <th
                  onClick={() => handleSort("name")}
                  style={{ cursor: "pointer", userSelect: "none" }}
                  aria-sort={sortField === "name" ? (sortOrder === "asc" ? "ascending" : "descending") : "none"}
                >
                  <div style={{ display: "inline-flex", alignItems: "center" }}>
                    <span>Batch Name</span>
                    <SortIndicator active={sortField === "name"} order={sortOrder} />
                  </div>
                </th>
                <th
                  onClick={() => handleSort("program")}
                  style={{ cursor: "pointer", userSelect: "none" }}
                  aria-sort={sortField === "program" ? (sortOrder === "asc" ? "ascending" : "descending") : "none"}
                >
                  <div style={{ display: "inline-flex", alignItems: "center" }}>
                    <span>Program</span>
                    <SortIndicator active={sortField === "program"} order={sortOrder} />
                  </div>
                </th>
                <th
                  onClick={() => handleSort("manager")}
                  style={{ cursor: "pointer", userSelect: "none" }}
                  aria-sort={sortField === "manager" ? (sortOrder === "asc" ? "ascending" : "descending") : "none"}
                >
                  <div style={{ display: "inline-flex", alignItems: "center" }}>
                    <span>Manager</span>
                    <SortIndicator active={sortField === "manager"} order={sortOrder} />
                  </div>
                </th>
                <th
                  onClick={() => handleSort("startDate")}
                  style={{ cursor: "pointer", userSelect: "none" }}
                  aria-sort={sortField === "startDate" ? (sortOrder === "asc" ? "ascending" : "descending") : "none"}
                >
                  <div style={{ display: "inline-flex", alignItems: "center" }}>
                    <span>Start Date</span>
                    <SortIndicator active={sortField === "startDate"} order={sortOrder} />
                  </div>
                </th>
                <th
                  onClick={() => handleSort("students")}
                  style={{ cursor: "pointer", userSelect: "none" }}
                  aria-sort={sortField === "students" ? (sortOrder === "asc" ? "ascending" : "descending") : "none"}
                >
                  <div style={{ display: "inline-flex", alignItems: "center" }}>
                    <span>Learners / Capacity</span>
                    <SortIndicator active={sortField === "students"} order={sortOrder} />
                  </div>
                </th>
                <th
                  onClick={() => handleSort("status")}
                  style={{ cursor: "pointer", userSelect: "none" }}
                  aria-sort={sortField === "status" ? (sortOrder === "asc" ? "ascending" : "descending") : "none"}
                >
                  <div style={{ display: "inline-flex", alignItems: "center" }}>
                    <span>Status</span>
                    <SortIndicator active={sortField === "status"} order={sortOrder} />
                  </div>
                </th>
                <th
                  className={styles.alignRight}
                  style={{ width: "4rem", minWidth: "60px" }}
                >
                  Action
                </th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <TableSkeleton columns={7} rows={5} />
              ) : filteredAndSortedBatches.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: "1rem" }}>
                    <EmptyState
                      title="No batches found"
                      description={
                        search
                           ? `No batches match "${search}". Try adjusting your search query or filters.`
                           : "Get started by launching a batch for an active program."
                      }
                      actionLabel={hasActiveFilters ? "Reset Filters" : (!isManager ? "Create Batch" : undefined)}
                      onAction={hasActiveFilters ? resetAllFilters : undefined}
                      actionHref={!hasActiveFilters && !isManager ? "/batches/create" : undefined}
                    />
                  </td>
                </tr>
              ) : (
                paginatedBatches.map((batch) => {
                  const cap = batch.capacity || 50;
                  const isFull = batch.students >= cap;
                  const openSeats = Math.max(0, cap - batch.students);

                  return (
                    <tr key={batch.id}>
                      <td>
                        <Link
                          href={`/batches/${batch.id}`}
                          className={styles.cellUserName}
                          style={{ textDecoration: "none", color: "inherit" }}
                          title="Open batch management hub"
                        >
                          <span style={{ color: "var(--accent-primary)", fontWeight: 600 }}>
                            {batch.name}
                          </span>
                        </Link>
                      </td>
                      <td>
                        <span className={styles.cellText}>{batch.program}</span>
                      </td>
                      <td>
                        {batch.manager && batch.manager !== "Unassigned" && batch.manager !== "Unknown" ? (
                          <span className={styles.cellText}>{batch.manager}</span>
                        ) : (
                          <span style={{ color: "var(--text-muted)", fontSize: "0.84rem", fontStyle: "italic" }}>
                            Unassigned
                          </span>
                        )}
                      </td>
                      <td>
                        <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                          <span className={styles.cellText}>{batch.startDate}</span>
                          {batch.rawEndDate && (
                            <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                              to {new Date(batch.rawEndDate).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                            </span>
                          )}
                        </div>
                      </td>
                      <td>
                        <Link
                          href={`/batches/${batch.id}?tab=learners`}
                          style={{ textDecoration: "none", color: "inherit" }}
                          title="View enrolled learners roster"
                        >
                          <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                            <span className={styles.cellText} style={{ fontWeight: 600, color: "var(--accent-primary)" }}>
                              {batch.students}{" "}
                              <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>
                                / {cap}
                              </span>
                            </span>
                            {isFull ? (
                              <span style={{ fontSize: "0.72rem", color: "var(--status-error)", fontWeight: 600 }}>
                                Full
                              </span>
                            ) : (
                              <span style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>
                                {openSeats} open
                              </span>
                            )}
                          </div>
                        </Link>
                      </td>
                      <td>
                        <StatusBadge status={batch.status} />
                      </td>
                      <td
                        className={styles.alignRight}
                        style={{ width: "4rem", minWidth: "60px" }}
                      >
                        <div className={styles.rowActions} style={{ justifyContent: "flex-end" }}>
                          <ActionMenu
                            ariaLabel={`Actions for ${batch.name}`}
                            items={
                              isManager
                                ? [
                                    {
                                      label: "Manage Batch & Learners",
                                      icon: (
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
                                        >
                                          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                                          <circle cx="9" cy="7" r="4" />
                                          <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                                          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                                        </svg>
                                      ),
                                      href: `/batches/${batch.id}?tab=learners`,
                                    },
                                    {
                                      label: "Manage Live Sessions",
                                      icon: (
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
                                        >
                                          <rect
                                            x="3"
                                            y="4"
                                            width="18"
                                            height="18"
                                            rx="2"
                                            ry="2"
                                          />
                                          <line x1="16" y1="2" x2="16" y2="6" />
                                          <line x1="8" y1="2" x2="8" y2="6" />
                                          <line x1="3" y1="10" x2="21" y2="10" />
                                        </svg>
                                      ),
                                      href: `/batches/${batch.id}?tab=sessions`,
                                    },
                                    {
                                      label: "Send Announcement",
                                      icon: (
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
                                        >
                                          <path d="M22 2L11 13" />
                                          <polygon points="22 2 15 22 11 13 2 9 22 2" />
                                        </svg>
                                      ),
                                      href: `/batches/${batch.id}?tab=broadcast`,
                                    },
                                  ]
                                : [
                                    {
                                      label: "Manage Batch & Learners",
                                      icon: (
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
                                        >
                                          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                                          <circle cx="9" cy="7" r="4" />
                                          <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                                          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                                        </svg>
                                      ),
                                      href: `/batches/${batch.id}?tab=learners`,
                                    },
                                    {
                                      label: "Manage Live Sessions",
                                      icon: (
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
                                        >
                                          <rect
                                            x="3"
                                            y="4"
                                            width="18"
                                            height="18"
                                            rx="2"
                                            ry="2"
                                          />
                                          <line x1="16" y1="2" x2="16" y2="6" />
                                          <line x1="8" y1="2" x2="8" y2="6" />
                                          <line x1="3" y1="10" x2="21" y2="10" />
                                        </svg>
                                      ),
                                      href: `/batches/${batch.id}?tab=sessions`,
                                    },
                                    {
                                      label: "Send Announcement",
                                      icon: (
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
                                        >
                                          <path d="M22 2L11 13" />
                                          <polygon points="22 2 15 22 11 13 2 9 22 2" />
                                        </svg>
                                      ),
                                      href: `/batches/${batch.id}?tab=broadcast`,
                                    },
                                    {
                                      label: "Edit Batch",
                                      icon: (
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
                                        >
                                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                                        </svg>
                                      ),
                                      onClick: () => openEditModal(batch),
                                    },
                                    {
                                      label: "Delete Batch",
                                      icon: (
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
                                        >
                                          <polyline points="3 6 5 6 21 6" />
                                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                          <line x1="10" y1="11" x2="10" y2="17" />
                                          <line x1="14" y1="11" x2="14" y2="17" />
                                        </svg>
                                      ),
                                      danger: true,
                                      dividerAbove: true,
                                      onClick: () => setBatchToDelete(batch),
                                    },
                                  ]
                            }
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

        {!isLoading && totalBatches > 0 && (
          <Pagination
            currentPage={page}
            totalItems={totalBatches}
            pageSize={pageSize}
            onPageChange={(newPage) => setPage(newPage)}
            onPageSizeChange={(newSize) => {
              setPageSize(newSize);
              setPage(1);
            }}
            pageSizeOptions={[10, 20, 50]}
            itemLabel="batches"
          />
        )}
      </section>

      {isModalOpen && (
        <div
          className={styles.modalOverlay}
          onClick={closeModal}
        >
          <div
            className={styles.modalContent}
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: "620px", maxHeight: "90vh", display: "flex", flexDirection: "column" }}
          >
            <div className={styles.modalHeader} style={{ padding: "1rem 1.5rem" }}>
              <h2 style={{ margin: 0, fontSize: "1.2rem", fontWeight: 700 }}>
                {editingBatchId ? "Edit Batch" : "Create New Batch"}
              </h2>
              <button
                className={styles.closeBtn}
                onClick={closeModal}
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <form
              className={styles.modalForm}
              onSubmit={handleSaveBatch}
              style={{
                padding: "1.25rem 1.5rem",
                display: "flex",
                flexDirection: "column",
                gap: "1rem",
                overflowY: "auto",
                flex: 1,
              }}
            >
              {formError && (
                <div
                  style={{
                    padding: "10px 14px",
                    background: "rgba(220, 38, 38, 0.08)",
                    border: "1px solid rgba(220, 38, 38, 0.3)",
                    borderRadius: "8px",
                    color: "#dc2626",
                    fontSize: "0.88rem",
                    marginBottom: "0.25rem",
                  }}
                  role="alert"
                >
                  {formError}
                </div>
              )}
              <div className={styles.formGroup}>
                <label>
                  Batch Name <span style={{ color: "var(--accent-primary, #c97a1e)" }}>*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Winter Batch 2026"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>

              <div className={styles.formGroup}>
                <label>
                  Assign Program <span style={{ color: "var(--accent-primary, #c97a1e)" }}>*</span>
                </label>
                <CustomSelect
                  value={programId}
                  onChange={(val) => {
                    setProgramId(val);
                    const sel = programs.find((prog) => prog.id === val);
                    if (sel) {
                      setAwardCertificate(sel.hasCertificate ?? true);
                    }
                  }}
                  fullWidth
                  ariaLabel="Assign Program"
                  placeholder="Select a Program..."
                  options={programs.map((p) => ({
                    value: p.id,
                    label: p.title,
                  }))}
                />
              </div>

              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label>
                    Start Date <span style={{ color: "var(--accent-primary, #c97a1e)" }}>*</span>
                  </label>
                  <DatePicker
                    value={startDate}
                    onChange={(val) => {
                      setStartDate(val);
                      if (endDate && val && val > endDate) {
                        setEndDate("");
                      }
                    }}
                    placeholder="Select Start Date"
                    ariaLabel="Start Date"
                    minWidth="100%"
                    minDate={!editingBatchId ? new Date().toISOString().slice(0, 10) : undefined}
                    maxDate={endDate || undefined}
                  />
                </div>
                <div className={styles.formGroup}>
                  <label>
                    End Date <span className={styles.optionalLabel}>(Optional)</span>
                  </label>
                  <DatePicker
                    value={endDate}
                    onChange={setEndDate}
                    placeholder="Select End Date (Optional)"
                    ariaLabel="End Date (Optional)"
                    minWidth="100%"
                    minDate={startDate || (!editingBatchId ? new Date().toISOString().slice(0, 10) : undefined)}
                  />
                </div>
              </div>

              <div className={styles.formGroup}>
                <label style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                  <span>Registration Deadline</span>
                  <span style={{ color: "var(--accent-primary, #c97a1e)" }}>*</span>
                  <div className={styles.helpTooltip}>
                    <span
                      className={styles.helpIcon}
                      aria-label="Registration Cutoff Information"
                      tabIndex={0}
                    >
                      ?
                    </span>
                    <div className={styles.helpTooltipContent}>
                      Learners cannot self-enroll after this date. Admins can manually assign students anytime.
                    </div>
                  </div>
                </label>
                <DatePicker
                  value={registrationDeadline}
                  onChange={setRegistrationDeadline}
                  placeholder="Select Registration Deadline"
                  ariaLabel="Registration Deadline"
                  minWidth="100%"
                  maxDate={endDate || undefined}
                />
              </div>

              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label>
                    Max Capacity <span style={{ color: "var(--accent-primary, #c97a1e)" }}>*</span>
                  </label>
                  <input
                    type="number"
                    placeholder="50"
                    min="1"
                    required
                    value={capacity}
                    onChange={(e) => setCapacity(e.target.value)}
                  />
                </div>
                <div className={styles.formGroup}>
                  <label>
                    Assign Manager <span className={styles.optionalLabel}>(Optional)</span>
                  </label>
                  <CustomSelect
                    value={manager}
                    onChange={setManager}
                    fullWidth
                    ariaLabel="Assign Manager"
                    placeholder="Select a Manager..."
                    options={[
                      { value: "", label: "None / Unassigned" },
                      ...managers.map((m) => ({
                        value: m.id,
                        label: m.name || m.email,
                      })),
                    ]}
                  />
                </div>
              </div>

              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label>Batch Status</label>
                  <CustomSelect
                    value={batchStatus}
                    onChange={setBatchStatus}
                    fullWidth
                    ariaLabel="Batch Status"
                    placeholder="Auto (Based on Start & End Date)"
                    options={[
                      { value: "", label: "Auto (Active if started today or earlier)" },
                      { value: "ACTIVE", label: "Active" },
                      { value: "UPCOMING", label: "Upcoming" },
                      { value: "COMPLETED", label: "Completed" },
                      { value: "ARCHIVED", label: "Archived" },
                    ]}
                  />
                </div>
              </div>

              {/* Certificate Award Option */}
              <div
                style={{
                  padding: "0.75rem 1rem",
                  background: awardCertificate ? "rgba(201, 122, 30, 0.06)" : "var(--bg-card-muted, #fdfbf7)",
                  border: `1px solid ${awardCertificate ? "var(--accent-primary, #c97a1e)" : "var(--border-light)"}`,
                  borderRadius: "8px",
                  marginTop: "0.25rem",
                  transition: "all 0.15s ease",
                }}
              >
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.65rem",
                    cursor: "pointer",
                    margin: 0,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={awardCertificate}
                    onChange={(e) => setAwardCertificate(e.target.checked)}
                    style={{
                      width: "16px",
                      height: "16px",
                      accentColor: "var(--accent-primary, #c97a1e)",
                      cursor: "pointer",
                    }}
                  />
                  <div
                    style={{
                      fontWeight: 600,
                      fontSize: "0.88rem",
                      color: "var(--text-primary)",
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                    }}
                  >
                    <svg
                      width="15"
                      height="15"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="var(--accent-primary, #c97a1e)"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <circle cx="12" cy="8" r="6" />
                      <path d="M15.4 13.8L18 22l-6-3-6 3 2.6-8.2" />
                    </svg>
                    <span>Award Certificate of Completion</span>
                  </div>
                </label>
              </div>

              <div className={styles.modalFooter} style={{ padding: "1rem 0 0", marginTop: "0.5rem", borderTop: "1px solid var(--border-light)" }}>
                <button
                  type="button"
                  className={styles.secondaryBtn}
                  onClick={closeModal}
                  disabled={isSubmitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={styles.primaryBtn}
                  disabled={isSubmitting}
                >
                  {isSubmitting
                    ? "Saving..."
                    : editingBatchId
                    ? "Update Batch"
                    : "Save Batch"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}


      {/* Branded ConfirmDialog for Batch Deletion */}
      <ConfirmDialog
        isOpen={Boolean(batchToDelete)}
        onClose={() => {
          if (!isDeletingBatch) setBatchToDelete(null);
        }}
        onConfirm={confirmDeleteBatch}
        title="Delete Batch?"
        subtitle={batchToDelete?.name}
        description="Are you sure you want to delete this batch? This will permanently delete the batch schedule and associated sessions."
        tone="danger"
        confirmText={isDeletingBatch ? "Deleting..." : "Delete Batch"}
        cancelText="Cancel"
        isLoading={isDeletingBatch}
        error={deleteError}
        itemDetails={
          batchToDelete
            ? [
                { label: "Batch Name", value: batchToDelete.name },
                { label: "Program", value: batchToDelete.program },
                { label: "Enrolled Learners", value: batchToDelete.students },
                { label: "Status", value: batchToDelete.status },
              ]
            : []
        }
        callout={{
          tone: "warning",
          text:
            batchToDelete && batchToDelete.students > 0
              ? `Caution: This batch has ${batchToDelete.students} enrolled learner(s). Deleting it will permanently remove the batch and associated records.`
              : "Permanent action: This empty batch will be permanently removed.",
        }}
      />
    </div>
  );
}
