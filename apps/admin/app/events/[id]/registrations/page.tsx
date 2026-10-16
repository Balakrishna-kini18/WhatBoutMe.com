"use client";

import React, { useEffect, useState, useMemo, use } from "react";
import Link from "next/link";
import styles from "./registrations.module.css";
import { API_URL } from "../../../lib/api";
import { Modal, StatusBadge, useToast } from "../../../components";

interface Registration {
  id: string;
  eventId: string;
  userId?: string | null;
  fullName: string;
  email: string;
  phone: string;
  category: string;
  categoryOther?: string | null;
  organization?: string | null;
  city?: string | null;
  status: "CONFIRMED" | "REJECTED";
  rejectedAt?: string | null;
  rejectionReason?: string | null;
  createdAt: string;
  user?: { id: string; name?: string | null; email?: string | null } | null;
}

interface EventDetails {
  id: string;
  type: "EVENT" | "WEBINAR";
  title: string;
  description: string;
  status: string;
  startAt: string;
  endAt: string;
  location?: string | null;
  meetingLink?: string | null;
  maxRegistrations?: number | null;
  registrationCount: number;
}

const CATEGORY_LABELS: Record<string, string> = {
  STUDENT: "Student",
  ENTREPRENEUR: "Entrepreneur",
  STARTUP_FOUNDER: "Startup Founder",
  ASPIRING_FOUNDER: "Aspiring Founder",
  PROFESSIONAL: "Working Professional",
  RESEARCHER: "Researcher",
  ACADEMIC_FACULTY: "Academic / Faculty",
  INVESTOR: "Investor",
  CONSULTANT: "Consultant",
  FREELANCER: "Freelancer",
  JOB_SEEKER: "Job Seeker",
  CORPORATE_EMPLOYEE: "Corporate Employee",
  NGO_WORKER: "NGO / Social Sector",
  GOVERNMENT_OFFICIAL: "Government Official",
  HOMEMAKER: "Homemaker",
  RETIRED: "Retired",
  OTHER: "Other",
};

export default function EventRegistrationsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const eventId = resolvedParams.id;
  const { success: toastSuccess, error: toastError } = useToast();

  const [event, setEvent] = useState<EventDetails | null>(null);
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");

  // Reject Modal
  const [pendingReject, setPendingReject] = useState<Registration | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [isRejecting, setIsRejecting] = useState(false);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const token = localStorage.getItem("token");
      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const [evtRes, regsRes] = await Promise.all([
        fetch(`${API_URL}/admin/events/${eventId}`, { headers }),
        fetch(`${API_URL}/admin/events/${eventId}/registrations`, { headers }),
      ]);

      if (evtRes.ok) {
        const evtData = await evtRes.json();
        setEvent(evtData);
      }
      if (regsRes.ok) {
        const regsData = await regsRes.json();
        setRegistrations(Array.isArray(regsData) ? regsData : []);
      }
    } catch {
      toastError("Failed to load registration roster");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [eventId]);

  const confirmedCount = registrations.filter((r) => r.status === "CONFIRMED").length;
  const rejectedCount = registrations.length - confirmedCount;

  const filteredRegistrations = useMemo(() => {
    if (!search.trim()) return registrations;
    const q = search.toLowerCase();
    return registrations.filter(
      (r) =>
        r.fullName.toLowerCase().includes(q) ||
        r.email.toLowerCase().includes(q) ||
        r.phone.includes(q) ||
        (r.organization && r.organization.toLowerCase().includes(q)) ||
        (r.city && r.city.toLowerCase().includes(q)) ||
        (r.category && r.category.toLowerCase().includes(q)),
    );
  }, [registrations, search]);

  const handleExportCsv = () => {
    if (registrations.length === 0) return;

    const headers = [
      "#",
      "Full Name",
      "Email Address",
      "Phone Number",
      "Category",
      "Organization",
      "City",
      "Status",
      "Registration Date",
      "Rejection Reason",
    ];

    const escapeCsv = (val: any) => {
      const str = val == null ? "" : String(val).trim();
      if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const rows = registrations.map((r, index) => {
      const categoryText =
        r.category === "OTHER" && r.categoryOther
          ? `Other (${r.categoryOther})`
          : CATEGORY_LABELS[r.category] || r.category;

      return [
        index + 1,
        escapeCsv(r.fullName),
        escapeCsv(r.email),
        escapeCsv(r.phone),
        escapeCsv(categoryText),
        escapeCsv(r.organization || "—"),
        escapeCsv(r.city || "—"),
        escapeCsv(r.status),
        escapeCsv(new Date(r.createdAt).toLocaleString()),
        escapeCsv(r.rejectionReason || "—"),
      ].join(",");
    });

    // UTF-8 BOM so Excel opens with proper characters
    const csvContent = "\uFEFF" + [headers.join(","), ...rows].join("\r\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const cleanTitle = (event?.title || "event").toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const dateStr = new Date().toISOString().split("T")[0];
    link.href = url;
    link.download = `${cleanTitle}-registrations-${dateStr}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toastSuccess("Attendee roster exported");
  };

  const handleConfirmReject = async () => {
    if (!pendingReject) return;
    setIsRejecting(true);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(
        `${API_URL}/admin/events/${eventId}/registrations/${pendingReject.id}/reject`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ reason: rejectionReason.trim() || undefined }),
        },
      );

      if (res.ok) {
        toastSuccess(`Registration for ${pendingReject.fullName} rejected`);
        setRegistrations((prev) =>
          prev.map((r) =>
            r.id === pendingReject.id
              ? {
                  ...r,
                  status: "REJECTED",
                  rejectedAt: new Date().toISOString(),
                  rejectionReason: rejectionReason.trim() || null,
                }
              : r,
          ),
        );
        setPendingReject(null);
        setRejectionReason("");
      } else {
        toastError("Failed to reject registration");
      }
    } catch {
      toastError("Network error while rejecting registration");
    } finally {
      setIsRejecting(false);
    }
  };

  return (
    <div className={styles.container}>
      {/* Back button */}
      <Link href="/events" className={styles.backBtn}>
        ← Back to Events
      </Link>

      {/* Event Hero */}
      <div className={styles.eventHero}>
        <div className={styles.heroLeft}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span
              style={{
                fontSize: "0.7rem",
                fontWeight: 700,
                textTransform: "uppercase",
                background: "#f1f5f9",
                color: "#475569",
                padding: "0.2rem 0.5rem",
                borderRadius: "6px",
              }}
            >
              {event?.type || "EVENT"}
            </span>
            <span style={{ fontSize: "0.8rem", color: "#64748b", fontWeight: 600 }}>
              {event?.status?.replace(/_/g, " ")}
            </span>
          </div>

          <h1 className={styles.heroTitle}>{event?.title || "Attendee Roster"}</h1>

          {event && (
            <div className={styles.heroMeta}>
              <div className={styles.heroMetaItem}>
                <span>📅</span>
                <span>
                  {new Date(event.startAt).toLocaleDateString(undefined, {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </span>
              </div>
              {event.location && (
                <div className={styles.heroMetaItem}>
                  <span>📍</span>
                  <span>{event.location}</span>
                </div>
              )}
              {event.meetingLink && (
                <div className={styles.heroMetaItem}>
                  <span>🔗</span>
                  <span>Virtual Link Active</span>
                </div>
              )}
            </div>
          )}
        </div>

        <div className={styles.heroRight}>
          <button
            type="button"
            className={styles.exportBtn}
            onClick={handleExportCsv}
            disabled={registrations.length === 0}
          >
            <span>📥 Export to CSV (Excel)</span>
          </button>
        </div>
      </div>

      {/* Toolbar */}
      <div className={styles.tableToolbar}>
        <div className={styles.statChips}>
          <span className={styles.chipConfirmed}>
            <span className={styles.chipDot} />
            <span>{confirmedCount} Confirmed Attendees</span>
          </span>
          {rejectedCount > 0 && (
            <span className={styles.chipRejected}>
              <span className={styles.chipDot} />
              <span>{rejectedCount} Rejected</span>
            </span>
          )}
        </div>

        <div className={styles.searchWrap}>
          <span className={styles.searchIcon}>🔍</span>
          <input
            type="search"
            placeholder="Search attendee, email, city, company..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={styles.searchInput}
          />
        </div>
      </div>

      {/* Attendees Table */}
      <div className={styles.tableWrap}>
        {isLoading ? (
          <div className={styles.emptyRoster}>Loading attendee roster...</div>
        ) : filteredRegistrations.length === 0 ? (
          <div className={styles.emptyRoster}>
            {search ? "No matching registrations found." : "No registrations yet for this event."}
          </div>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.th} style={{ width: "45px" }}>#</th>
                <th className={styles.th}>Attendee</th>
                <th className={styles.th}>Contact</th>
                <th className={styles.th}>Category</th>
                <th className={styles.th}>Organization</th>
                <th className={styles.th}>City</th>
                <th className={styles.th}>Status</th>
                <th className={styles.th}>Registered</th>
                <th className={styles.th} style={{ textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredRegistrations.map((reg, index) => {
                const initials = reg.fullName
                  .split(" ")
                  .map((n) => n[0])
                  .join("")
                  .slice(0, 2)
                  .toUpperCase();

                const categoryLabel =
                  reg.category === "OTHER" && reg.categoryOther
                    ? `Other (${reg.categoryOther})`
                    : CATEGORY_LABELS[reg.category] || reg.category;

                return (
                  <tr key={reg.id} className={styles.tr}>
                    <td className={styles.td} style={{ color: "#94a3b8", fontWeight: 600 }}>
                      {index + 1}
                    </td>
                    <td className={styles.td}>
                      <div className={styles.avatarWrap}>
                        <div className={styles.avatar}>{initials}</div>
                        <div>
                          <div className={styles.userName}>{reg.fullName}</div>
                          {reg.user && (
                            <span style={{ fontSize: "0.75rem", color: "#64748b" }}>
                              Registered Learner
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className={styles.td}>
                      <div style={{ fontWeight: 500 }}>{reg.email}</div>
                      <div style={{ fontSize: "0.775rem", color: "#64748b" }}>{reg.phone}</div>
                    </td>
                    <td className={styles.td}>
                      <span
                        style={{
                          background: "#f1f5f9",
                          color: "#334155",
                          padding: "0.2rem 0.5rem",
                          borderRadius: "6px",
                          fontSize: "0.775rem",
                          fontWeight: 600,
                        }}
                      >
                        {categoryLabel}
                      </span>
                    </td>
                    <td className={styles.td}>{reg.organization || "—"}</td>
                    <td className={styles.td}>{reg.city || "—"}</td>
                    <td className={styles.td}>
                      <StatusBadge
                        status={reg.status}
                        tone={reg.status === "CONFIRMED" ? "completed" : "error"}
                      />
                      {reg.rejectionReason && (
                        <div style={{ fontSize: "0.7rem", color: "#b91c1c", marginTop: "0.2rem" }}>
                          {reg.rejectionReason}
                        </div>
                      )}
                    </td>
                    <td className={styles.td} style={{ fontSize: "0.8rem", color: "#64748b" }}>
                      {new Date(reg.createdAt).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </td>
                    <td className={styles.td} style={{ textAlign: "right" }}>
                      {reg.status === "CONFIRMED" && (
                        <button
                          type="button"
                          className={styles.rejectBtn}
                          onClick={() => {
                            setPendingReject(reg);
                            setRejectionReason("");
                          }}
                        >
                          Reject
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Reject Modal */}
      {pendingReject && (
        <Modal
          isOpen={Boolean(pendingReject)}
          onClose={() => setPendingReject(null)}
          title="Decline Registration"
          maxWidth="560px"
        >
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <p style={{ fontSize: "0.875rem", color: "#475569", margin: 0 }}>
              Are you sure you want to decline the registration for{" "}
              <strong>{pendingReject.fullName}</strong> ({pendingReject.email})?
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
              <label style={{ fontSize: "0.8rem", fontWeight: 600, color: "#334155" }}>
                Reason for Rejection (Optional)
              </label>
              <textarea
                placeholder="e.g. Workshop capacity reached, does not meet eligibility criteria..."
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                style={{
                  width: "100%",
                  padding: "0.6rem",
                  borderRadius: "8px",
                  border: "1px solid #cbd5e1",
                  fontSize: "0.85rem",
                  minHeight: "80px",
                  fontFamily: "inherit",
                }}
              />
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem", marginTop: "0.5rem" }}>
              <button
                type="button"
                onClick={() => setPendingReject(null)}
                style={{
                  background: "#f1f5f9",
                  border: "none",
                  padding: "0.5rem 1rem",
                  borderRadius: "8px",
                  fontWeight: 600,
                  fontSize: "0.85rem",
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmReject}
                disabled={isRejecting}
                style={{
                  background: "#dc2626",
                  color: "#ffffff",
                  border: "none",
                  padding: "0.5rem 1.15rem",
                  borderRadius: "8px",
                  fontWeight: 600,
                  fontSize: "0.85rem",
                  cursor: "pointer",
                }}
              >
                {isRejecting ? "Declining..." : "Decline Registration"}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
