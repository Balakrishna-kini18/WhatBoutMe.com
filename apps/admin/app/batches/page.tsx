"use client";

import { useEffect, useState, FormEvent, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import styles from "../page.module.css";
import { API_URL, errorMessage } from "../lib/api";
import { CustomSelect, ActionMenu, StatusBadge } from "../components";

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
  capacity?: number;
}

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

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingBatchId, setEditingBatchId] = useState<string | null>(null);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [programs, setPrograms] = useState<{ id: string; title: string }[]>([]);
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

  // result of "Issue Certificates": what happened, and who was left out
  const [issueResult, setIssueResult] = useState<{
    batchId: string;
    batchName: string;
    ok: boolean;
    text: string;
    notFinished: string[];
  } | null>(null);
  const [issuingId, setIssuingId] = useState<string | null>(null);
  // the batch waiting for the admin to confirm "Issue Certificates"
  const [confirmBatch, setConfirmBatch] = useState<Batch | null>(null);

  // Form states
  const [name, setName] = useState("");
  const [programId, setProgramId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [capacity, setCapacity] = useState("");
  const [manager, setManager] = useState("");

  // Filters
  const [search, setSearch] = useState("");
  const [selectedProgramFilter, setSelectedProgramFilter] = useState("");
  const [selectedStatusFilter, setSelectedStatusFilter] = useState("");

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

  useEffect(() => {
    if (isModalOpen || confirmBatch) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === "Escape") {
          if (confirmBatch) setConfirmBatch(null);
          else if (isModalOpen) closeModal();
        }
      };
      window.addEventListener("keydown", handleKeyDown);
      return () => {
        document.body.style.overflow = originalOverflow;
        window.removeEventListener("keydown", handleKeyDown);
      };
    }
  }, [isModalOpen, confirmBatch]);

  const fetchManagers = async () => {
    try {
      const res = await fetch(`${API_URL}/users?limit=100`);
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
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_URL}/programs`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
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
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_URL}/batches`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        const data = await res.json();
        const mappedBatches = data.map((b: any) => ({
          ...b,
          program: b.program?.title || "Unknown",
          manager: b.manager?.name || "Unknown",
          managerId: b.managerId || b.manager?.id || "",
          rawStartDate: b.startDate,
          rawEndDate: b.endDate,
          startDate: b.startDate
            ? new Date(b.startDate).toLocaleDateString()
            : "--",
          students: b.enrolledCount || 0,
        }));
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
    setCapacity("");
    setManager("");
    if (searchParams.get("create") || searchParams.get("action")) {
      router.replace("/batches");
    }
  };

  const openEditModal = (batch: Batch) => {
    setEditingBatchId(batch.id);
    setName(batch.name);
    const p = programs.find((prog) => prog.title === batch.program);
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
    setCapacity(String(batch.capacity || "50"));
    setManager(batch.managerId || "");
    setIsModalOpen(true);
  };

  const openCreateModal = () => {
    setEditingBatchId(null);
    setName("");
    setProgramId("");
    setStartDate("");
    setEndDate("");
    setCapacity("50");
    setManager("");
    setIsModalOpen(true);
  };

  const handleIssueCertificates = async (
    batchId: string,
    batchName: string,
    includeUnfinished = false
  ) => {
    setIssuingId(batchId);
    try {
      const res = await fetch(
        `${API_URL}/certificates/batch/${batchId}/issue`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ includeUnfinished }),
        }
      );
      if (!res.ok) {
        setIssueResult({
          batchId,
          batchName,
          ok: false,
          text: await errorMessage(res, "Could not issue the certificates"),
          notFinished: [],
        });
        return;
      }
      const result: {
        learners: number;
        issued: number;
        alreadyIssued: number;
        notFinished: string[];
      } = await res.json();
      const parts = [
        result.learners === 0
          ? `${batchName} has no enrolled learners yet.`
          : `${batchName}: ${result.issued} issued.`,
        result.alreadyIssued > 0
          ? `${result.alreadyIssued} already had one.`
          : "",
        result.notFinished.length > 0
          ? `${result.notFinished.length} not finished: ${result.notFinished.join(", ")}.`
          : "",
      ];
      setIssueResult({
        batchId,
        batchName,
        ok: true,
        text: parts.filter(Boolean).join(" "),
        notFinished: result.notFinished,
      });
    } catch {
      setIssueResult({
        batchId,
        batchName,
        ok: false,
        text: "Could not reach the server. Check that the API is running.",
        notFinished: [],
      });
    } finally {
      setIssuingId(null);
    }
  };

  const handleDeleteBatch = async (id: string) => {
    if (!confirm("Are you sure you want to delete this batch?")) return;
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000"}/batches/${id}`,
        {
          method: "DELETE",
        }
      );
      if (res.ok) {
        fetchBatches();
      }
    } catch (e) {
      console.error("Failed to delete batch", e);
    }
  };

  const handleSaveBatch = async (e: FormEvent) => {
    e.preventDefault();
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    const payload: any = {
      name: name.trim(),
      programId: programId,
      startDate: new Date(startDate).toISOString(),
      capacity: parseInt(capacity) || 50,
      managerId: manager || null,
    };

    if (endDate) {
      payload.endDate = new Date(endDate).toISOString();
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
        closeModal();
        fetchBatches();
      }
    } catch (e) {
      console.error("Failed to save batch", e);
    }
  };

  return (
    <div className={styles.dashboardContainer}>
      <header className={styles.header}>
        <div className={styles.headerText}>
          <h1 className={styles.title}>{isManager ? "Assigned Batches" : "Batches & Cohorts"}</h1>
          <p className={styles.subtitle}>
            {isManager
              ? "View and manage sessions, attendance, and learners in your cohorts."
              : "Organize learners into groups and schedule live sessions."}
          </p>
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

      {issueResult && (
        <div
          role="status"
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: "0.75rem",
            margin: "0 0 1.5rem",
            padding: "0.75rem 1rem",
            borderRadius: "8px",
            fontSize: "0.88rem",
            background: issueResult.ok
              ? "var(--status-success-bg)"
              : "var(--status-error-bg)",
            color: issueResult.ok
              ? "var(--status-success)"
              : "var(--status-error)",
            border: `1px solid ${issueResult.ok ? "#a7f3d0" : "#fecdd3"}`,
          }}
        >
          <span style={{ flex: 1, minWidth: "16rem" }}>{issueResult.text}</span>
          {issueResult.notFinished.length > 0 && (
            <button
              type="button"
              className={styles.secondaryBtnSmall}
              disabled={issuingId !== null}
              onClick={() =>
                handleIssueCertificates(
                  issueResult.batchId,
                  issueResult.batchName,
                  true
                )
              }
            >
              Issue to them anyway
            </button>
          )}
        </div>
      )}

      <section className={styles.tableSection}>
        <div className={styles.sectionHeader}>
          <h2>All Batches ({batches.length})</h2>
          <div
            style={{
              display: "flex",
              gap: "0.75rem",
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <div
              className={styles.searchContainer}
              style={{ minWidth: "220px" }}
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
                placeholder="Search batches..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className={styles.searchInput}
              />
            </div>
            <CustomSelect
              value={selectedProgramFilter}
              onChange={setSelectedProgramFilter}
              options={[
                { value: "", label: "All Programs" },
                ...programs.map((p) => ({ value: p.title, label: p.title })),
              ]}
              minWidth="175px"
              ariaLabel="Filter batches by program"
            />
            <CustomSelect
              value={selectedStatusFilter}
              onChange={setSelectedStatusFilter}
              options={[
                { value: "", label: "All Statuses" },
                { value: "ACTIVE", label: "Active" },
                { value: "COMPLETED", label: "Completed" },
                { value: "DRAFT", label: "Draft" },
                { value: "ARCHIVED", label: "Archived" },
              ]}
              minWidth="135px"
              ariaLabel="Filter batches by status"
            />
          </div>
        </div>

        <div className={styles.tableWrapper}>
          <table className={styles.adminTable}>
            <thead>
              <tr>
                <th>Batch Name</th>
                <th>Program</th>
                <th>Manager</th>
                <th>Start Date</th>
                <th>Students</th>
                <th>Status</th>
                <th
                  className={styles.alignRight}
                  style={{ width: "15.5rem", minWidth: "240px" }}
                >
                  Action
                </th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td
                    colSpan={7}
                    style={{
                      textAlign: "center",
                      padding: "28px",
                      color: "var(--text-muted)",
                    }}
                  >
                    Loading batches from database...
                  </td>
                </tr>
              ) : batches.filter((batch) => {
                  const q = search.toLowerCase();
                  const matchesSearch =
                    !q ||
                    batch.name.toLowerCase().includes(q) ||
                    (batch.manager &&
                      batch.manager.toLowerCase().includes(q)) ||
                    (batch.program &&
                      batch.program.toLowerCase().includes(q));
                  const matchesProgram =
                    !selectedProgramFilter ||
                    batch.program === selectedProgramFilter;
                  const matchesStatus =
                    !selectedStatusFilter ||
                    batch.status?.toUpperCase() ===
                      selectedStatusFilter.toUpperCase();
                  return matchesSearch && matchesProgram && matchesStatus;
                }).length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    style={{
                      textAlign: "center",
                      padding: "28px",
                      color: "var(--text-muted)",
                    }}
                  >
                    No batches found. Create one!
                  </td>
                </tr>
              ) : (
                batches
                  .filter((batch) => {
                    const q = search.toLowerCase();
                    const matchesSearch =
                      !q ||
                      batch.name.toLowerCase().includes(q) ||
                      (batch.manager &&
                        batch.manager.toLowerCase().includes(q)) ||
                      (batch.program &&
                        batch.program.toLowerCase().includes(q));
                    const matchesProgram =
                      !selectedProgramFilter ||
                      batch.program === selectedProgramFilter;
                    const matchesStatus =
                      !selectedStatusFilter ||
                      batch.status?.toUpperCase() ===
                        selectedStatusFilter.toUpperCase();
                    return matchesSearch && matchesProgram && matchesStatus;
                  })
                  .map((batch) => (
                    <tr key={batch.id}>
                      <td>
                        <span className={styles.cellUserName}>
                          {batch.name}
                        </span>
                      </td>
                      <td>
                        <span className={styles.cellText}>{batch.program}</span>
                      </td>
                      <td>
                        <span className={styles.cellTextMuted}>
                          {batch.manager}
                        </span>
                      </td>
                      <td>
                        <span className={styles.cellTextMuted}>
                          {batch.startDate}
                        </span>
                      </td>
                      <td>
                        <span className={styles.cellText}>
                          {batch.students}
                        </span>
                      </td>
                      <td>
                        <StatusBadge status={batch.status} />
                      </td>
                      <td
                        className={styles.alignRight}
                        style={{ minWidth: "240px" }}
                      >
                        <div className={styles.rowActions}>
                          {!isManager && (
                            <button
                              type="button"
                              className={styles.rowActionBtn}
                              disabled={issuingId !== null}
                              onClick={() => setConfirmBatch(batch)}
                            >
                              <svg
                                width="14"
                                height="14"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.75"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                aria-hidden="true"
                              >
                                <circle cx="12" cy="8" r="6" />
                                <path d="M15.4 13.8L18 22l-6-3-6 3 2.6-8.2" />
                              </svg>
                              <span>
                                {issuingId === batch.id
                                  ? "Issuing..."
                                  : "Issue Certificates"}
                              </span>
                            </button>
                          )}
                          <ActionMenu
                            ariaLabel={`Actions for ${batch.name}`}
                            items={
                              isManager
                                ? [
                                    {
                                      label: "Manage Sessions & Attendance",
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
                                      href: `/batches/${batch.id}/sessions`,
                                    },
                                    {
                                      label: "View Schedule",
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
                                  ]
                                : [
                                    {
                                      label: "Edit Schedule",
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
                                      label: "Manage Sessions & Attendance",
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
                                      href: `/batches/${batch.id}/sessions`,
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
                                      onClick: () => handleDeleteBatch(batch.id),
                                    },
                                  ]
                            }
                          />
                        </div>
                      </td>
                    </tr>
                  ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* CREATE BATCH MODAL */}
      {confirmBatch && (
        <div
          className={styles.modalOverlay}
          onClick={() => setConfirmBatch(null)}
        >
          <div
            className={styles.modalContent}
            role="dialog"
            aria-modal="true"
            aria-labelledby="issue-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.modalHeader}>
              <h2 id="issue-title">Issue Certificates?</h2>
              <button
                type="button"
                className={styles.closeBtn}
                aria-label="Close"
                onClick={() => setConfirmBatch(null)}
              >
                ×
              </button>
            </div>
            <p
              style={{
                margin: 0,
                fontSize: "0.95rem",
                lineHeight: 1.6,
                color: "var(--text-secondary)",
              }}
            >
              Every learner in{" "}
              <strong style={{ color: "var(--text-primary)" }}>
                {confirmBatch.name}
              </strong>{" "}
              who has finished{" "}
              <strong style={{ color: "var(--text-primary)" }}>
                {confirmBatch.program}
              </strong>{" "}
              will get a certificate dated today. It appears in their portal
              straight away. Learners who have not finished are left out and
              listed afterwards.
            </p>
            <div className={styles.modalFooter}>
              <button
                type="button"
                className={styles.secondaryBtn}
                onClick={() => setConfirmBatch(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className={styles.primaryBtn}
                autoFocus
                onClick={() => {
                  const batch = confirmBatch;
                  setConfirmBatch(null);
                  handleIssueCertificates(batch.id, batch.name);
                }}
              >
                Approve &amp; Issue
              </button>
            </div>
          </div>
        </div>
      )}

      {isModalOpen && (
        <div
          className={styles.modalOverlay}
          onClick={closeModal}
        >
          <div
            className={styles.modalContent}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.modalHeader}>
              <h2>{editingBatchId ? "Edit Batch" : "Create New Batch"}</h2>
              <button
                className={styles.closeBtn}
                onClick={closeModal}
              >
                ×
              </button>
            </div>

            <form className={styles.modalForm} onSubmit={handleSaveBatch}>
              <div className={styles.modalBody}>
                <div className={styles.formGroup}>
                  <label>Batch Name</label>
                  <input
                    type="text"
                    placeholder="e.g. Winter Cohort 2026"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>

                <div className={styles.formGroup}>
                  <label>Assign Program</label>
                  <CustomSelect
                    value={programId}
                    onChange={setProgramId}
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
                    <label>Start Date</label>
                    <input
                      type="date"
                      required
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                    />
                  </div>
                  <div className={styles.formGroup}>
                    <label>End Date (Optional)</label>
                    <input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                    />
                  </div>
                </div>

                <div className={styles.formRow}>
                  <div className={styles.formGroup}>
                    <label>Max Capacity</label>
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
                    <label>Assign Manager</label>
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
              </div>

              <div className={styles.modalFooter}>
                <button
                  type="button"
                  className={styles.secondaryBtn}
                  onClick={closeModal}
                >
                  Cancel
                </button>
                <button type="submit" className={styles.primaryBtn}>
                  {editingBatchId ? "Update Batch" : "Save Batch"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
