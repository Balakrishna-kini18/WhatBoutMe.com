"use client";

import { useEffect, useState, useMemo, FormEvent } from "react";
import Link from "next/link";
import { API_URL, errorMessage } from "../lib/api";
import styles from "../page.module.css";
import {
  StatusBadge,
  TableSkeleton,
  EmptyState,
  CustomSelect,
  Pagination,
  SortIndicator,
  Modal,
  useToast,
  type SortOrder,
} from "../components";

type SortField = "learner" | "program" | "code" | "createdAt" | "status";

export default function CertificatesQueue() {
  const { success: toastSuccess, error: toastError } = useToast();
  const [certificates, setCertificates] = useState<any[]>([]);
  const [batches, setBatches] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [inFlightAction, setInFlightAction] = useState<{ id: string; action: string } | null>(null);
  const [notice, setNotice] = useState("");

  // Filters, Sorting & Pagination
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [search, setSearch] = useState<string>("");
  const [programFilter, setProgramFilter] = useState<string>("ALL");
  const [batchFilter, setBatchFilter] = useState<string>("");
  const [sortField, setSortField] = useState<SortField>("createdAt");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Reject Modal
  const [rejectingCert, setRejectingCert] = useState<any | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [submittingReject, setSubmittingReject] = useState(false);

  useEffect(() => {
    fetchCertificates();
    fetchBatches();
  }, []);

  useEffect(() => {
    setPage(1);
  }, [statusFilter, search, programFilter, batchFilter]);

  const fetchBatches = async () => {
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
      const res = await fetch(`${API_URL}/batches`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        const raw = await res.json();
        setBatches(Array.isArray(raw) ? raw : raw?.batches || []);
      }
    } catch {
      // ignore
    }
  };

  const fetchCertificates = async () => {
    setIsLoading(true);
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
      const res = await fetch(`${API_URL}/certificates`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        const data = await res.json();
        setCertificates(Array.isArray(data) ? data : []);
      } else {
        setNotice(await errorMessage(res, "Could not load the certificates"));
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAction = async (id: string, action: "approve" | "issue") => {
    try {
      setInFlightAction({ id, action });
      setNotice("");
      const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
      const res = await fetch(`${API_URL}/certificates/${id}/${action}`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        toastSuccess(`Certificate ${action === "approve" ? "approved" : "issued"} successfully.`);
        fetchCertificates();
      } else {
        const err = await errorMessage(res, `Could not ${action} the certificate`);
        setNotice(err);
        toastError(err);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setInFlightAction(null);
    }
  };

  const handleRejectSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!rejectingCert || !rejectionReason.trim()) return;
    setSubmittingReject(true);
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
      const res = await fetch(`${API_URL}/certificates/${rejectingCert.id}/reject`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ reason: rejectionReason.trim() }),
      });
      if (res.ok) {
        toastSuccess("Certificate request rejected.");
        setRejectingCert(null);
        setRejectionReason("");
        fetchCertificates();
      } else {
        const err = await errorMessage(res, "Could not reject certificate");
        setNotice(err);
        toastError(err);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSubmittingReject(false);
    }
  };

  const programOptions = useMemo(() => {
    const titles = new Set<string>();
    for (const b of batches) {
      if (b.program?.title) titles.add(b.program.title);
    }
    for (const c of certificates) {
      const t = c.enrolment?.batch?.program?.title || c.enrolment?.program?.title;
      if (t) titles.add(t);
    }
    return [
      { value: "ALL", label: "All Programs" },
      ...Array.from(titles)
        .sort((a, b) => a.localeCompare(b))
        .map((t) => ({ value: t, label: t })),
    ];
  }, [batches, certificates]);

  const batchOptions = useMemo(() => {
    return [
      { value: "", label: "All Batches" },
      { value: "UNASSIGNED", label: "Direct / No Batch" },
      ...batches.map((b) => ({
        value: b.id,
        label: b.name,
      })),
    ];
  }, [batches]);

  const contextFiltered = useMemo(() => {
    return certificates.filter((c) => {
      const cBatchId = c.enrolment?.batch?.id || c.enrolment?.batchId || "";
      const cBatchName = c.enrolment?.batch?.name || "";
      const cProgTitle =
        c.enrolment?.batch?.program?.title || c.enrolment?.program?.title || "11 Steps Programme";

      if (batchFilter === "UNASSIGNED") {
        if (cBatchId) return false;
      } else if (batchFilter) {
        if (cBatchId !== batchFilter) return false;
      }

      if (programFilter !== "ALL") {
        if (cProgTitle.toLowerCase() !== programFilter.toLowerCase()) return false;
      }

      if (search.trim()) {
        const q = search.toLowerCase().trim();
        const matchesName = c.enrolment?.user?.name?.toLowerCase().includes(q);
        const matchesEmail = c.enrolment?.user?.email?.toLowerCase().includes(q);
        const matchesCode = c.certificateCode?.toLowerCase().includes(q);
        const matchesProg = cProgTitle.toLowerCase().includes(q);
        const matchesBatch = cBatchName.toLowerCase().includes(q);
        if (!matchesName && !matchesEmail && !matchesCode && !matchesProg && !matchesBatch) {
          return false;
        }
      }

      return true;
    });
  }, [certificates, batchFilter, programFilter, search]);

  const statusCounts = useMemo(() => {
    const counts = {
      ALL: contextFiltered.length,
      PENDING: 0,
      APPROVED: 0,
      ISSUED: 0,
      REJECTED: 0,
    };
    for (const c of contextFiltered) {
      if (c.status === "PENDING") counts.PENDING++;
      else if (c.status === "APPROVED") counts.APPROVED++;
      else if (c.status === "ISSUED") counts.ISSUED++;
      else if (c.status === "REJECTED") counts.REJECTED++;
    }
    return counts;
  }, [contextFiltered]);

  const statusOptions = useMemo(() => {
    return [
      { value: "ALL", label: `All Statuses (${statusCounts.ALL})` },
      { value: "PENDING", label: `Pending (${statusCounts.PENDING})` },
      { value: "APPROVED", label: `Approved (${statusCounts.APPROVED})` },
      { value: "ISSUED", label: `Issued (${statusCounts.ISSUED})` },
      { value: "REJECTED", label: `Rejected (${statusCounts.REJECTED})` },
    ];
  }, [statusCounts]);

  const filtered = useMemo(() => {
    if (statusFilter === "ALL") return contextFiltered;
    return contextFiltered.filter((c) => c.status === statusFilter);
  }, [contextFiltered, statusFilter]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let cmp = 0;
      if (sortField === "learner") {
        cmp = (a.enrolment?.user?.name || "").localeCompare(b.enrolment?.user?.name || "");
      } else if (sortField === "program") {
        const pA = a.enrolment?.batch?.program?.title || a.enrolment?.program?.title || "";
        const pB = b.enrolment?.batch?.program?.title || b.enrolment?.program?.title || "";
        cmp = pA.localeCompare(pB);
      } else if (sortField === "code") {
        cmp = (a.certificateCode || "").localeCompare(b.certificateCode || "");
      } else if (sortField === "createdAt") {
        cmp = new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();
      } else if (sortField === "status") {
        cmp = (a.status || "").localeCompare(b.status || "");
      }
      return sortOrder === "asc" ? cmp : -cmp;
    });
  }, [filtered, sortField, sortOrder]);

  const paginated = useMemo(() => {
    const start = (page - 1) * pageSize;
    return sorted.slice(start, start + pageSize);
  }, [sorted, page, pageSize]);

  const hasFilters = Boolean(
    statusFilter !== "ALL" || search.trim() || programFilter !== "ALL" || batchFilter !== ""
  );

  const resetFilters = () => {
    setStatusFilter("ALL");
    setSearch("");
    setProgramFilter("ALL");
    setBatchFilter("");
    setPage(1);
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortOrder("asc");
    }
  };

  return (
    <div className={styles.dashboardContainer}>
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
            Certificates
          </h1>
        </div>
        <div className={styles.headerActions}>
          <Link href="/approvals?tab=certificates" className={styles.secondaryBtn}>
            <span>Approvals &amp; Gates</span>
          </Link>
        </div>
      </header>

      {notice && (
        <div role="alert" className={styles.alertError} style={{ marginBottom: 0 }}>
          <span>{notice}</span>
        </div>
      )}

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
              placeholder="Search learner, email, or cert code..."
              className={styles.searchInput}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search certificates"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
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

          {/* Right: Dropdown Filters */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", flexWrap: "wrap" }}>
            <CustomSelect
              value={statusFilter}
              onChange={setStatusFilter}
              options={statusOptions}
              minWidth="170px"
              ariaLabel="Filter by Status"
            />
            <CustomSelect
              value={programFilter}
              onChange={setProgramFilter}
              options={programOptions}
              minWidth="175px"
              ariaLabel="Filter by Program"
            />
            <CustomSelect
              value={batchFilter}
              onChange={setBatchFilter}
              options={batchOptions}
              minWidth="175px"
              ariaLabel="Filter by Batch"
            />
            {hasFilters && (
              <button
                type="button"
                onClick={resetFilters}
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
                <th onClick={() => handleSort("learner")} style={{ cursor: "pointer", userSelect: "none" }}>
                  Learner
                  <SortIndicator active={sortField === "learner"} order={sortOrder} />
                </th>
                <th onClick={() => handleSort("program")} style={{ cursor: "pointer", userSelect: "none" }}>
                  Program &amp; Batch
                  <SortIndicator active={sortField === "program"} order={sortOrder} />
                </th>
                <th onClick={() => handleSort("code")} style={{ cursor: "pointer", userSelect: "none" }}>
                  Certificate No.
                  <SortIndicator active={sortField === "code"} order={sortOrder} />
                </th>
                <th onClick={() => handleSort("createdAt")} style={{ cursor: "pointer", userSelect: "none" }}>
                  Date
                  <SortIndicator active={sortField === "createdAt"} order={sortOrder} />
                </th>
                <th onClick={() => handleSort("status")} style={{ cursor: "pointer", userSelect: "none" }}>
                  Status
                  <SortIndicator active={sortField === "status"} order={sortOrder} />
                </th>
                <th className={styles.alignRight}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <TableSkeleton columns={6} rows={5} />
              ) : paginated.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: "32px 16px" }}>
                    <EmptyState
                      icon="academic"
                      title={hasFilters ? "No certificates match your filters" : "No certificates in queue"}
                      description={
                        hasFilters
                          ? "Try clearing your search or switching the active filter."
                          : "When learners complete their final steps and exams, certificates will appear here."
                      }
                      actionLabel={hasFilters ? "Reset Filters" : undefined}
                      onAction={hasFilters ? resetFilters : undefined}
                    />
                  </td>
                </tr>
              ) : (
                paginated.map((cert) => {
                  const programTitle =
                    cert.enrolment?.batch?.program?.title ||
                    cert.enrolment?.program?.title ||
                    "11 Steps Programme";
                  const batchName = cert.enrolment?.batch?.name;
                  const learnerId = cert.enrolment?.user?.id || cert.enrolment?.userId;
                  const certCode = cert.certificateCode || cert.certificateNumber;

                  return (
                    <tr key={cert.id}>
                      <td>
                        <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                          {learnerId ? (
                            <Link
                              href={`/users/${learnerId}`}
                              className={styles.cohortLink}
                              style={{ fontSize: "0.875rem" }}
                            >
                              {cert.enrolment?.user?.name || "Unknown Learner"}
                            </Link>
                          ) : (
                            <span className={styles.cellUserName}>
                              {cert.enrolment?.user?.name || "Unknown Learner"}
                            </span>
                          )}
                          {cert.enrolment?.user?.email && (
                            <span className={styles.cellUserEmail}>{cert.enrolment.user.email}</span>
                          )}
                        </div>
                      </td>
                      <td>
                        <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                          <span style={{ fontWeight: 600, color: "var(--text-primary)", fontSize: "0.85rem" }}>
                            {programTitle}
                          </span>
                          <span className={styles.cellTextMuted}>
                            {batchName || "Direct Enrolment"}
                          </span>
                        </div>
                      </td>
                      <td>
                        {certCode ? (
                          <code style={{ fontSize: "0.78rem", color: "var(--text-secondary)" }}>
                            {certCode}
                          </code>
                        ) : (
                          <span className={styles.cellTextMuted}>—</span>
                        )}
                      </td>
                      <td>
                        <span className={`${styles.cellTextMuted} tabularNums`}>
                          {new Date(cert.issueDate || cert.createdAt).toLocaleDateString(undefined, {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}
                        </span>
                      </td>
                      <td>
                        <StatusBadge status={cert.status} />
                      </td>
                      <td className={styles.alignRight}>
                        {cert.status === "PENDING" && (
                          <div style={{ display: "flex", gap: "6px", justifyContent: "flex-end" }}>
                            <button
                              type="button"
                              className={styles.primaryBtnSmall}
                              onClick={() => handleAction(cert.id, "approve")}
                              disabled={inFlightAction?.id === cert.id}
                            >
                              {inFlightAction?.id === cert.id && inFlightAction?.action === "approve"
                                ? "Approving..."
                                : "Approve"}
                            </button>
                            <button
                              type="button"
                              className={styles.dangerBtnSmall}
                              onClick={() => {
                                setRejectingCert(cert);
                                setRejectionReason("");
                              }}
                              disabled={inFlightAction?.id === cert.id}
                            >
                              Reject
                            </button>
                          </div>
                        )}
                        {cert.status === "APPROVED" && (
                          <div style={{ display: "flex", gap: "6px", justifyContent: "flex-end", alignItems: "center" }}>
                            <button
                              type="button"
                              className={styles.successBtnSmall}
                              onClick={() => handleAction(cert.id, "issue")}
                              disabled={inFlightAction?.id === cert.id}
                            >
                              {inFlightAction?.id === cert.id && inFlightAction?.action === "issue"
                                ? "Issuing..."
                                : "Issue"}
                            </button>
                            <Link href={`/certificates/${cert.id}`} className={styles.secondaryBtnSmall}>
                              View
                            </Link>
                          </div>
                        )}
                        {cert.status === "ISSUED" && (
                          <Link href={`/certificates/${cert.id}`} className={styles.secondaryBtnSmall}>
                            View
                          </Link>
                        )}
                        {cert.status === "REJECTED" && (
                          <span className={styles.cellTextMuted} style={{ fontSize: "0.8rem" }}>
                            {cert.rejectionReason || "Rejected"}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <Pagination
          currentPage={page}
          totalItems={sorted.length}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={(s) => {
            setPageSize(s);
            setPage(1);
          }}
          itemLabel="certificates"
        />
      </section>

      {rejectingCert && (
        <Modal
          isOpen={true}
          onClose={() => setRejectingCert(null)}
          title="Reject Certificate Request"
          subtitle={`Learner: ${rejectingCert.enrolment?.user?.name || "Learner"} (${rejectingCert.enrolment?.user?.email || ""})`}
          maxWidth="480px"
        >
          <form onSubmit={handleRejectSubmit}>
            <div style={{ display: "flex", flexDirection: "column", gap: "14px", marginTop: "6px" }}>
              <div className={styles.formGroup}>
                <label htmlFor="cert-reject-reason" style={{ color: "#991b1b" }}>
                  Rejection Reason *
                </label>
                <textarea
                  id="cert-reject-reason"
                  rows={3}
                  placeholder="Specify why this certificate request is being rejected..."
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  required
                />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "8px" }}>
                <button
                  type="button"
                  className={styles.secondaryBtn}
                  onClick={() => setRejectingCert(null)}
                  disabled={submittingReject}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={styles.dangerBtnSmall}
                  style={{ padding: "8px 16px", fontSize: "0.85rem" }}
                  disabled={submittingReject || !rejectionReason.trim()}
                >
                  {submittingReject ? "Rejecting..." : "Confirm Rejection"}
                </button>
              </div>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
