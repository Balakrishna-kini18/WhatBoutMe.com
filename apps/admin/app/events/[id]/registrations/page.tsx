"use client";

import React, { useEffect, useState, useMemo, use } from "react";
import Link from "next/link";
import styles from "./registrations.module.css";
import {
  API_URL,
  type EventItem,
  type EventRegistrationItem,
  type EventRegistrationsResponse,
  type CurrencyCode,
} from "../../../lib/api";
import { StatusBadge, useToast } from "../../../components";
import type { StatusTone } from "../../../components";

const paymentStatusToneMap: Record<string, StatusTone> = {
  PAID: "completed",
  REGISTERED: "completed",
  PENDING: "pending",
  FAILED: "error",
  REFUNDED: "neutral",
};

function formatPrice(amount: number, currency: CurrencyCode | string) {
  if (amount === 0) return "Free";
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currency as string,
      minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount}`;
  }
}

export default function EventRegistrationsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const eventId = resolvedParams.id;
  const { success: toastSuccess, error: toastError } = useToast();

  const [event, setEvent] = useState<EventItem | null>(null);
  const [registrations, setRegistrations] = useState<EventRegistrationItem[]>([]);
  const [kpis, setKpis] = useState<EventRegistrationsResponse["kpis"] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");

  const loadData = async () => {
    setIsLoading(true);
    try {
      const token = localStorage.getItem("token");
      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const res = await fetch(`${API_URL}/admin/events/${eventId}/registrations`, { headers });
      if (res.ok) {
        const data: EventRegistrationsResponse = await res.json();
        setEvent(data.event);
        setRegistrations(data.registrations || []);
        setKpis(data.kpis);
      } else {
        toastError("Failed to load registration roster");
      }
    } catch {
      toastError("Failed to connect to server");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [eventId]);

  const filteredRegistrations = useMemo(() => {
    return registrations.filter((r) => {
      if (statusFilter !== "ALL" && r.paymentStatus !== statusFilter) return false;
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      const name = (r.attendeeName || r.fullName || "").toLowerCase();
      const email = (r.attendeeEmail || r.email || "").toLowerCase();
      const phone = (r.attendeePhone || r.phone || "");
      const txId = (r.gatewayPaymentId || r.gatewayOrderId || "").toLowerCase();
      return name.includes(q) || email.includes(q) || phone.includes(q) || txId.includes(q);
    });
  }, [registrations, search, statusFilter]);

  const handleExportCsv = () => {
    if (registrations.length === 0) return;

    const headers = [
      "#",
      "Attendee Name",
      "Email Address",
      "Phone Number",
      "Currency",
      "Amount Paid",
      "Payment Status",
      "Gateway",
      "Order ID",
      "Payment ID",
      "Email Sent",
      "Registered At",
    ];

    const escapeCsv = (val: any) => {
      const str = val == null ? "" : String(val).trim();
      if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const rows = registrations.map((r, index) => {
      return [
        index + 1,
        escapeCsv(r.attendeeName || r.fullName),
        escapeCsv(r.attendeeEmail || r.email),
        escapeCsv(r.attendeePhone || r.phone),
        escapeCsv(r.currency),
        escapeCsv(r.amount),
        escapeCsv(r.paymentStatus),
        escapeCsv(r.paymentGateway),
        escapeCsv(r.gatewayOrderId || "—"),
        escapeCsv(r.gatewayPaymentId || "—"),
        escapeCsv(r.emailSent ? "YES" : "NO"),
        escapeCsv(new Date(r.registeredAt || r.createdAt).toLocaleString()),
      ].join(",");
    });

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
    toastSuccess("Attendee roster exported to CSV");
  };

  // Format revenue string
  const revenueSummary = useMemo(() => {
    if (!kpis?.revenueByCurrency || Object.keys(kpis.revenueByCurrency).length === 0) {
      return "0.00";
    }
    return Object.entries(kpis.revenueByCurrency)
      .map(([curr, total]) => formatPrice(total, curr))
      .join(" · ");
  }, [kpis]);

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
                background: event?.locationType === "ONLINE" ? "#ecfdf5" : "#fef3c7",
                color: event?.locationType === "ONLINE" ? "#065f46" : "#92400e",
                padding: "0.2rem 0.5rem",
                borderRadius: "6px",
              }}
            >
              {event?.locationType === "ONLINE" ? "🟢 Online Live Session" : "📍 In-Person Event"}
            </span>
            <span style={{ fontSize: "0.8rem", color: "#64748b", fontWeight: 600 }}>
              {event?.isPublished ? "PUBLISHED" : "DRAFT"}
            </span>
          </div>

          <h1 className={styles.heroTitle}>{event?.title || "Attendee Roster"}</h1>

          {event && (
            <div className={styles.heroMeta}>
              <div className={styles.heroMetaItem}>
                <span>📅</span>
                <span>
                  {new Date(event.startDateTime || event.startAt || "").toLocaleDateString(undefined, {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </span>
              </div>
              <div className={styles.heroMetaItem}>
                <span>🏷️</span>
                <span>{formatPrice(event.price, event.currency)}</span>
              </div>
              {event.locationType === "ONLINE" ? (
                <div className={styles.heroMetaItem}>
                  <span>🔗</span>
                  <span>Gated Meeting URL</span>
                </div>
              ) : (
                <div className={styles.heroMetaItem}>
                  <span>📍</span>
                  <span>{event.venueName || event.venueAddress || "Physical Hall"}</span>
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
            <span>📥 Export to CSV</span>
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className={styles.kpiGrid}>
        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>Confirmed Attendees</span>
          <span className={styles.kpiValue} style={{ color: "#059669" }}>
            {kpis?.totalConfirmed ?? 0}
          </span>
          <span className={styles.kpiSub}>Verified paid / confirmed tickets</span>
        </div>

        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>Seats Remaining</span>
          <span className={styles.kpiValue}>
            {kpis?.seatsRemaining === null ? "Unlimited" : kpis?.seatsRemaining ?? "—"}
          </span>
          <span className={styles.kpiSub}>
            {kpis?.seatLimit ? `out of ${kpis.seatLimit} total capacity` : "no capacity limit set"}
          </span>
        </div>

        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>Revenue Collected</span>
          <span className={styles.kpiValue} style={{ fontSize: "1.35rem" }}>
            {revenueSummary}
          </span>
          <span className={styles.kpiSub}>Synced with platform invoices & billing</span>
        </div>

        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>Total Attempts</span>
          <span className={styles.kpiValue}>{kpis?.totalRegistrations ?? registrations.length}</span>
          <span className={styles.kpiSub}>Includes pending checkouts</span>
        </div>
      </div>

      {/* Toolbar */}
      <div className={styles.tableToolbar}>
        <div className={styles.statChips}>
          <span className={styles.chipConfirmed}>
            <span className={styles.chipDot} />
            <span>{kpis?.totalConfirmed ?? 0} Confirmed Attendees</span>
          </span>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{
              padding: "0.35rem 0.65rem",
              borderRadius: "8px",
              border: "1px solid #cbd5e1",
              fontSize: "0.775rem",
              fontWeight: 600,
              background: "#ffffff",
              color: "#334155",
            }}
          >
            <option value="ALL">All Payment Statuses</option>
            <option value="PAID">PAID</option>
            <option value="PENDING">PENDING</option>
            <option value="FAILED">FAILED</option>
            <option value="REFUNDED">REFUNDED</option>
          </select>
        </div>

        <div className={styles.searchWrap}>
          <span className={styles.searchIcon}>🔍</span>
          <input
            type="search"
            placeholder="Search attendee, email, phone, transaction ID..."
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
            {search ? "No matching registrations found." : "No attendee registrations recorded yet for this event."}
          </div>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.th} style={{ width: "45px" }}>#</th>
                <th className={styles.th}>Attendee</th>
                <th className={styles.th}>Contact Info</th>
                <th className={styles.th}>Amount & Currency</th>
                <th className={styles.th}>Payment Status</th>
                <th className={styles.th}>Gateway Details</th>
                <th className={styles.th}>Registered At</th>
              </tr>
            </thead>
            <tbody>
              {filteredRegistrations.map((reg, index) => {
                const name = reg.attendeeName || reg.fullName || "Guest Attendee";
                const email = reg.attendeeEmail || reg.email || "—";
                const phone = reg.attendeePhone || reg.phone || "—";
                const initials = name
                  .split(" ")
                  .map((n) => n[0])
                  .join("")
                  .slice(0, 2)
                  .toUpperCase();

                const isPaid = reg.paymentStatus === "PAID";

                return (
                  <tr key={reg.id} className={styles.tr}>
                    <td className={styles.td} style={{ color: "#94a3b8", fontWeight: 600 }}>
                      {index + 1}
                    </td>
                    <td className={styles.td}>
                      <div className={styles.avatarWrap}>
                        <div className={styles.avatar}>{initials}</div>
                        <div>
                          <div className={styles.userName}>{name}</div>
                          {reg.emailSent && (
                            <span style={{ fontSize: "0.7rem", color: "#059669", fontWeight: 600 }}>
                              ✉️ Access email dispatched
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className={styles.td}>
                      <div style={{ fontWeight: 500 }}>{email}</div>
                      <div style={{ fontSize: "0.775rem", color: "#64748b" }}>{phone}</div>
                    </td>
                    <td className={styles.td}>
                      <span style={{ fontWeight: 700, color: isPaid ? "#0f172a" : "#64748b" }}>
                        {formatPrice(reg.amount, reg.currency)}
                      </span>
                    </td>
                    <td className={styles.td}>
                      <StatusBadge
                        status={reg.paymentStatus === "PAID" ? "REGISTERED" : reg.paymentStatus}
                        tone={paymentStatusToneMap[reg.paymentStatus === "PAID" ? "REGISTERED" : reg.paymentStatus] || "neutral"}
                      />
                    </td>
                    <td className={styles.td}>
                      <div style={{ fontSize: "0.775rem", fontFamily: "monospace", color: "#475569" }}>
                        {reg.gatewayPaymentId ? (
                          <span title="Gateway Payment ID">{reg.gatewayPaymentId}</span>
                        ) : reg.gatewayOrderId ? (
                          <span title="Gateway Order ID">{reg.gatewayOrderId}</span>
                        ) : (
                          <span>{reg.paymentGateway}</span>
                        )}
                      </div>
                    </td>
                    <td className={styles.td} style={{ fontSize: "0.8rem", color: "#64748b" }}>
                      {new Date(reg.registeredAt || reg.createdAt).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
