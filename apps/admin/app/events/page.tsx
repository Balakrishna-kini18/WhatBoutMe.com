"use client";

import React, { useEffect, useState, useMemo, useRef } from "react";
import Link from "next/link";
import styles from "./events.module.css";
import { API_URL } from "../lib/api";
import { Modal, StatusBadge, ConfirmDialog, useToast } from "../components";
import type { StatusTone } from "../components";

export interface EventItem {
  id: string;
  type: "EVENT" | "WEBINAR";
  title: string;
  description: string;
  status: "SCHEDULED" | "REGISTRATION_OPEN" | "ONGOING" | "ENDED" | "CANCELLED";
  startAt: string;
  endAt: string;
  location?: string | null;
  meetingLink?: string | null;
  coverImageUrl?: string | null;
  maxRegistrations?: number | null;
  registrationOpensAt?: string | null;
  registrationClosesAt?: string | null;
  registrationCount: number;
  registeredByMe: boolean;
  createdAt: string;
  updatedAt: string;
}

const Icons = {
  Plus: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  ),
  Calendar: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  ),
  Pin: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  ),
  Video: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="23 7 16 12 23 17 23 7" />
      <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
    </svg>
  ),
  Users: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
  Edit: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  ),
  Trash: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  ),
  Search: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  ),
};

function formatSchedule(start: string, end: string) {
  try {
    const s = new Date(start);
    const e = new Date(end);
    const dateStr = s.toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    const startTime = s.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
    const endTime = e.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
    return `${dateStr} · ${startTime} - ${endTime}`;
  } catch {
    return `${start} - ${end}`;
  }
}

function toLocalDatetimeInput(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const statusToneMap: Record<string, StatusTone> = {
  REGISTRATION_OPEN: "active",
  SCHEDULED: "pending",
  ONGOING: "info",
  ENDED: "completed",
  CANCELLED: "error",
};

export default function EventsAdminPage() {
  const { success: toastSuccess, error: toastError } = useToast();
  const [events, setEvents] = useState<EventItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"ALL" | "EVENT" | "WEBINAR">("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");

  // Modal & Form State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<EventItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [eventToDelete, setEventToDelete] = useState<EventItem | null>(null);

  // Form Fields
  const [type, setType] = useState<"EVENT" | "WEBINAR">("EVENT");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [startDatePart, setStartDatePart] = useState("");
  const [startTimePart, setStartTimePart] = useState("10:00");
  const [endDatePart, setEndDatePart] = useState("");
  const [endTimePart, setEndTimePart] = useState("12:00");
  const [location, setLocation] = useState("");
  const [meetingLink, setMeetingLink] = useState("");
  const [coverImageUrl, setCoverImageUrl] = useState("");
  const [maxRegistrations, setMaxRegistrations] = useState("");
  const [registrationMode, setRegistrationMode] = useState<"OPEN" | "SCHEDULED">("OPEN");
  const [regOpensAt, setRegOpensAt] = useState("");
  const [regClosesAt, setRegClosesAt] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadEvents = async () => {
    setIsLoading(true);
    try {
      const token = localStorage.getItem("token");
      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;
      const res = await fetch(`${API_URL}/admin/events?limit=200`, {
        headers,
      });
      if (res.ok) {
        const json = await res.json();
        setEvents(json.items || []);
      } else {
        toastError("Failed to fetch events roster");
      }
    } catch {
      toastError("Could not connect to server");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadEvents();
  }, []);

  const openCreateModal = () => {
    setEditingEvent(null);
    setType("EVENT");
    setTitle("");
    setDescription("");
    const today = new Date().toISOString().split("T")[0] || "";
    setStartDatePart(today);
    setStartTimePart("10:00");
    setEndDatePart(today);
    setEndTimePart("12:00");
    setLocation("");
    setMeetingLink("");
    setCoverImageUrl("");
    setMaxRegistrations("");
    setRegistrationMode("OPEN");
    setRegOpensAt("");
    setRegClosesAt("");
    setFormError(null);
    setIsModalOpen(true);
  };

  const openEditModal = (evt: EventItem) => {
    setEditingEvent(evt);
    setType(evt.type);
    setTitle(evt.title);
    setDescription(evt.description);

    const sParts = toLocalDatetimeInput(evt.startAt).split("T");
    const eParts = toLocalDatetimeInput(evt.endAt).split("T");
    const sDate = sParts[0] || "";
    const sTime = sParts[1] || "10:00";
    const eDate = eParts[0] || sDate;
    const eTime = eParts[1] || "12:00";
    setStartDatePart(sDate);
    setStartTimePart(sTime);
    setEndDatePart(eDate);
    setEndTimePart(eTime);

    setLocation(evt.location || "");
    setMeetingLink(evt.meetingLink || "");
    setCoverImageUrl(evt.coverImageUrl || "");
    setMaxRegistrations(evt.maxRegistrations ? String(evt.maxRegistrations) : "");
    setRegistrationMode(evt.status === "SCHEDULED" || evt.registrationOpensAt ? "SCHEDULED" : "OPEN");
    setRegOpensAt(toLocalDatetimeInput(evt.registrationOpensAt));
    setRegClosesAt(toLocalDatetimeInput(evt.registrationClosesAt));
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingImage(true);
    setFormError(null);
    try {
      const token = localStorage.getItem("token");
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch(`${API_URL}/admin/events/cover-image`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });

      if (res.ok) {
        const data = await res.json();
        setCoverImageUrl(data.coverImageUrl);
        toastSuccess("Cover image uploaded");
      } else {
        const err = await res.json().catch(() => null);
        setFormError(err?.message || "Image upload failed");
      }
    } catch {
      setFormError("Network error while uploading image");
    } finally {
      setIsUploadingImage(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!title.trim()) {
      setFormError("Please enter an event title");
      return;
    }
    if (!description.trim()) {
      setFormError("Please provide an event description");
      return;
    }
    if (!startDatePart || !endDatePart) {
      setFormError("Please select both start and end dates");
      return;
    }

    const startAt = new Date(`${startDatePart}T${startTimePart}:00`).toISOString();
    const endAt = new Date(`${endDatePart}T${endTimePart}:00`).toISOString();

    if (new Date(startAt).getTime() >= new Date(endAt).getTime()) {
      setFormError("End date & time must be strictly after start date & time");
      return;
    }

    if (registrationMode === "SCHEDULED" && !regOpensAt) {
      setFormError("Please select when registration opens");
      return;
    }

    setIsSubmitting(true);
    try {
      const token = localStorage.getItem("token");
      const payload: any = {
        type,
        title: title.trim(),
        description: description.trim(),
        startAt,
        endAt,
        location: location.trim() || undefined,
        meetingLink: meetingLink.trim() || undefined,
        coverImageUrl: coverImageUrl.trim() || undefined,
        maxRegistrations: maxRegistrations ? Number(maxRegistrations) : undefined,
        registrationOpensAt:
          registrationMode === "SCHEDULED" && regOpensAt
            ? new Date(regOpensAt).toISOString()
            : undefined,
        registrationClosesAt: regClosesAt ? new Date(regClosesAt).toISOString() : undefined,
      };

      if (!editingEvent) {
        payload.status = registrationMode === "OPEN" ? "REGISTRATION_OPEN" : "SCHEDULED";
      }

      const url = editingEvent
        ? `${API_URL}/admin/events/${editingEvent.id}`
        : `${API_URL}/admin/events`;
      const method = editingEvent ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        toastSuccess(editingEvent ? "Event updated successfully" : "Event created successfully");
        setIsModalOpen(false);
        loadEvents();
      } else {
        const err = await res.json().catch(() => null);
        setFormError(err?.message || "Failed to save event");
      }
    } catch {
      setFormError("Server error while saving event");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStatusChange = async (eventId: string, newStatus: string) => {
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_URL}/admin/events/${eventId}/status`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ status: newStatus }),
      });

      if (res.ok) {
        toastSuccess("Status updated");
        setEvents((prev) =>
          prev.map((e) => (e.id === eventId ? { ...e, status: newStatus as any } : e)),
        );
      } else {
        toastError("Failed to update status");
      }
    } catch {
      toastError("Network error");
    }
  };

  const handleDeleteConfirm = async () => {
    if (!eventToDelete) return;
    setIsDeleting(true);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_URL}/admin/events/${eventToDelete.id}`, {
        method: "DELETE",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        toastSuccess("Event deleted");
        setEvents((prev) => prev.filter((e) => e.id !== eventToDelete.id));
        setEventToDelete(null);
      } else {
        toastError("Failed to delete event");
      }
    } catch {
      toastError("Network error while deleting event");
    } finally {
      setIsDeleting(false);
    }
  };

  // KPIs
  const totalEvents = events.length;
  const activeRegs = events.filter((e) => e.status === "REGISTRATION_OPEN").length;
  const totalAttendees = events.reduce((acc, e) => acc + (e.registrationCount || 0), 0);
  const upcomingCount = events.filter(
    (e) => new Date(e.endAt).getTime() >= Date.now() && e.status !== "CANCELLED",
  ).length;

  // Filtered List
  const filteredEvents = useMemo(() => {
    return events.filter((e) => {
      if (typeFilter !== "ALL" && e.type !== typeFilter) return false;
      if (statusFilter !== "ALL" && e.status !== statusFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchTitle = e.title.toLowerCase().includes(q);
        const matchDesc = e.description?.toLowerCase().includes(q);
        const matchLoc = e.location?.toLowerCase().includes(q);
        if (!matchTitle && !matchDesc && !matchLoc) return false;
      }
      return true;
    });
  }, [events, typeFilter, statusFilter, search]);

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.header}>
        <div>
          <h1 className={styles.headerTitle}>Events & Webinars</h1>
          <p className={styles.headerSubtitle}>
            Manage community workshops, masterclasses, and live webinars
          </p>
        </div>
        <button type="button" className={styles.primaryBtn} onClick={openCreateModal}>
          <Icons.Plus />
          <span>New Event</span>
        </button>
      </div>

      {/* KPI Cards */}
      <div className={styles.kpiGrid}>
        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>Total Programs</span>
          <span className={styles.kpiValue}>{totalEvents}</span>
          <span className={styles.kpiSub}>Events & webinars created</span>
        </div>
        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>Open For Registration</span>
          <span className={styles.kpiValue}>{activeRegs}</span>
          <span className={styles.kpiSub}>Accepting learner registrations</span>
        </div>
        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>Registered Attendees</span>
          <span className={styles.kpiValue}>{totalAttendees}</span>
          <span className={styles.kpiSub}>Total confirmed attendees</span>
        </div>
        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>Upcoming</span>
          <span className={styles.kpiValue}>{upcomingCount}</span>
          <span className={styles.kpiSub}>Future sessions scheduled</span>
        </div>
      </div>

      {/* Toolbar */}
      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          <div className={styles.segmented}>
            <button
              type="button"
              className={`${styles.segmentBtn} ${typeFilter === "ALL" ? styles.segmentBtnActive : ""}`}
              onClick={() => setTypeFilter("ALL")}
            >
              All
            </button>
            <button
              type="button"
              className={`${styles.segmentBtn} ${typeFilter === "EVENT" ? styles.segmentBtnActive : ""}`}
              onClick={() => setTypeFilter("EVENT")}
            >
              Events
            </button>
            <button
              type="button"
              className={`${styles.segmentBtn} ${typeFilter === "WEBINAR" ? styles.segmentBtnActive : ""}`}
              onClick={() => setTypeFilter("WEBINAR")}
            >
              Webinars
            </button>
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className={styles.select}
            style={{ width: "auto" }}
          >
            <option value="ALL">All Statuses</option>
            <option value="REGISTRATION_OPEN">Registration Open</option>
            <option value="SCHEDULED">Scheduled</option>
            <option value="ONGOING">Ongoing</option>
            <option value="ENDED">Ended</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
        </div>

        <div className={styles.searchWrap}>
          <span className={styles.searchIcon}>
            <Icons.Search />
          </span>
          <input
            type="search"
            placeholder="Search by title, location..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={styles.searchInput}
          />
        </div>
      </div>

      {/* Events Grid */}
      {isLoading ? (
        <div style={{ textAlign: "center", padding: "4rem", color: "#64748b" }}>
          Loading events roster...
        </div>
      ) : filteredEvents.length === 0 ? (
        <div className={styles.emptyState}>
          <span className={styles.emptyTitle}>No events found</span>
          <p className={styles.emptySub}>
            {search || typeFilter !== "ALL" || statusFilter !== "ALL"
              ? "Try adjusting your filters or search terms."
              : "Get started by creating your first community event or webinar."}
          </p>
          <button type="button" className={styles.primaryBtn} onClick={openCreateModal}>
            <Icons.Plus />
            <span>Create Event</span>
          </button>
        </div>
      ) : (
        <div className={styles.eventsGrid}>
          {filteredEvents.map((evt) => {
            const capacityRatio = evt.maxRegistrations
              ? Math.min(100, Math.round((evt.registrationCount / evt.maxRegistrations) * 100))
              : 0;

            return (
              <div key={evt.id} className={styles.eventCard}>
                <div className={styles.coverWrap}>
                  {evt.coverImageUrl ? (
                    <img src={evt.coverImageUrl} alt={evt.title} className={styles.coverImg} />
                  ) : (
                    <div className={styles.coverPlaceholder}>
                      <span>{evt.title}</span>
                    </div>
                  )}

                  <div className={styles.cardHeaderOverlay}>
                    <span className={styles.typeBadge}>{evt.type}</span>
                    <StatusBadge
                      status={evt.status.replace(/_/g, " ")}
                      tone={statusToneMap[evt.status] || "neutral"}
                    />
                  </div>
                </div>

                <div className={styles.cardBody}>
                  <h3 className={styles.cardTitle}>{evt.title}</h3>
                  {evt.description && <p className={styles.cardDesc}>{evt.description}</p>}

                  <div className={styles.metaList}>
                    <div className={styles.metaItem}>
                      <Icons.Calendar />
                      <span>{formatSchedule(evt.startAt, evt.endAt)}</span>
                    </div>

                    {evt.location && (
                      <div className={styles.metaItem}>
                        <Icons.Pin />
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {evt.location}
                        </span>
                      </div>
                    )}

                    {evt.meetingLink && (
                      <div className={styles.metaItem}>
                        <Icons.Video />
                        <a
                          href={evt.meetingLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ color: "#3b82f6", textDecoration: "none" }}
                        >
                          Virtual Meeting Room
                        </a>
                      </div>
                    )}

                    <div className={styles.metaItem} style={{ marginTop: "0.25rem" }}>
                      <Icons.Users />
                      <span style={{ fontWeight: 600 }}>
                        {evt.registrationCount} attendee{evt.registrationCount === 1 ? "" : "s"}
                        {evt.maxRegistrations ? ` / ${evt.maxRegistrations} max` : " (no limit)"}
                      </span>
                    </div>
                  </div>

                  {evt.maxRegistrations ? (
                    <div className={styles.capacityBarWrap}>
                      <div
                        className={styles.capacityBarFill}
                        style={{
                          width: `${capacityRatio}%`,
                          background: capacityRatio >= 90 ? "#ef4444" : "#10b981",
                        }}
                      />
                    </div>
                  ) : null}
                </div>

                <div className={styles.cardFooter}>
                  <Link
                    href={`/events/${evt.id}/registrations`}
                    className={styles.viewRegsBtn}
                  >
                    <span>Registrations ({evt.registrationCount})</span>
                  </Link>

                  <div className={styles.cardActions}>
                    <select
                      value={evt.status}
                      onChange={(e) => handleStatusChange(evt.id, e.target.value)}
                      className={styles.select}
                      style={{ padding: "0.3rem 0.6rem", fontSize: "0.75rem", width: "auto" }}
                      aria-label="Change status"
                    >
                      <option value="REGISTRATION_OPEN">Registration Open</option>
                      <option value="SCHEDULED">Scheduled</option>
                      <option value="ONGOING">Ongoing</option>
                      <option value="ENDED">Ended</option>
                      <option value="CANCELLED">Cancelled</option>
                    </select>

                    <button
                      type="button"
                      className={styles.iconBtn}
                      onClick={() => openEditModal(evt)}
                      title="Edit Event"
                      aria-label="Edit event"
                    >
                      <Icons.Edit />
                    </button>

                    <button
                      type="button"
                      className={`${styles.iconBtn} ${styles.iconBtnDanger}`}
                      onClick={() => setEventToDelete(evt)}
                      title="Delete Event"
                      aria-label="Delete event"
                    >
                      <Icons.Trash />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create / Edit Modal */}
      {isModalOpen && (
        <Modal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          title={editingEvent ? "Edit Event / Webinar" : "Create Event / Webinar"}
          maxWidth="700px"
        >
          <form onSubmit={handleSubmit} className={styles.formGrid}>
            {formError && <div className={styles.errorBanner}>{formError}</div>}

            <div className={styles.formRow}>
              <div className={styles.formGroup}>
                <label className={styles.label}>Program Type *</label>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value as "EVENT" | "WEBINAR")}
                  className={styles.select}
                >
                  <option value="EVENT">Community Event (In-Person or Hybrid)</option>
                  <option value="WEBINAR">Live Webinar (Virtual)</option>
                </select>
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label}>Max Registrations Capacity</label>
                <input
                  type="number"
                  min="1"
                  placeholder="Leave empty for unlimited"
                  value={maxRegistrations}
                  onChange={(e) => setMaxRegistrations(e.target.value)}
                  className={styles.input}
                />
              </div>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label}>Event Title *</label>
              <input
                type="text"
                placeholder="e.g. Brain Health & Cognitive Resilience Masterclass"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className={styles.input}
                required
              />
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label}>Description *</label>
              <textarea
                placeholder="Detailed agenda, key takeaways, and what attendees will learn..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className={styles.textarea}
                required
              />
            </div>

            {/* Schedule Section */}
            <div className={styles.formRow}>
              <div className={styles.formGroup}>
                <label className={styles.label}>Start Date *</label>
                <input
                  type="date"
                  value={startDatePart}
                  onChange={(e) => setStartDatePart(e.target.value)}
                  className={styles.input}
                  required
                />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.label}>Start Time *</label>
                <input
                  type="time"
                  value={startTimePart}
                  onChange={(e) => setStartTimePart(e.target.value)}
                  className={styles.input}
                  required
                />
              </div>
            </div>

            <div className={styles.formRow}>
              <div className={styles.formGroup}>
                <label className={styles.label}>End Date *</label>
                <input
                  type="date"
                  value={endDatePart}
                  onChange={(e) => setEndDatePart(e.target.value)}
                  className={styles.input}
                  required
                />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.label}>End Time *</label>
                <input
                  type="time"
                  value={endTimePart}
                  onChange={(e) => setEndTimePart(e.target.value)}
                  className={styles.input}
                  required
                />
              </div>
            </div>

            {/* Location & Meeting Link */}
            <div className={styles.formRow}>
              <div className={styles.formGroup}>
                <label className={styles.label}>Physical Location (Venue)</label>
                <input
                  type="text"
                  placeholder="e.g. Dubai Knowledge Park, Building 2, Auditorium"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  className={styles.input}
                />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.label}>Virtual Meeting Link (Zoom / Meet)</label>
                <input
                  type="url"
                  placeholder="https://zoom.us/j/..."
                  value={meetingLink}
                  onChange={(e) => setMeetingLink(e.target.value)}
                  className={styles.input}
                />
              </div>
            </div>

            {/* Registration Settings */}
            <div className={styles.formGroup}>
              <label className={styles.label}>Registration Mode</label>
              <div className={styles.segmented} style={{ width: "fit-content" }}>
                <button
                  type="button"
                  className={`${styles.segmentBtn} ${registrationMode === "OPEN" ? styles.segmentBtnActive : ""}`}
                  onClick={() => setRegistrationMode("OPEN")}
                >
                  Open Immediately
                </button>
                <button
                  type="button"
                  className={`${styles.segmentBtn} ${registrationMode === "SCHEDULED" ? styles.segmentBtnActive : ""}`}
                  onClick={() => setRegistrationMode("SCHEDULED")}
                >
                  Schedule Opening Date
                </button>
              </div>
            </div>

            {registrationMode === "SCHEDULED" && (
              <div className={styles.formGroup}>
                <label className={styles.label}>Registration Opens At *</label>
                <input
                  type="datetime-local"
                  value={regOpensAt}
                  onChange={(e) => setRegOpensAt(e.target.value)}
                  className={styles.input}
                  required={registrationMode === "SCHEDULED"}
                />
              </div>
            )}

            <div className={styles.formGroup}>
              <label className={styles.label}>Registration Closes At (Optional Cutoff)</label>
              <input
                type="datetime-local"
                value={regClosesAt}
                onChange={(e) => setRegClosesAt(e.target.value)}
                className={styles.input}
              />
            </div>

            {/* Cover Image Upload */}
            <div className={styles.formGroup}>
              <label className={styles.label}>Cover Image</label>
              {coverImageUrl ? (
                <div className={styles.previewWrap}>
                  <img src={coverImageUrl} alt="Preview" className={styles.previewImg} />
                  <button
                    type="button"
                    onClick={() => setCoverImageUrl("")}
                    className={styles.removeImgBtn}
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <div
                  className={styles.uploadBox}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Icons.Plus />
                  <span style={{ fontSize: "0.85rem", fontWeight: 600 }}>
                    {isUploadingImage ? "Uploading to Cloudinary..." : "Click to upload cover banner"}
                  </span>
                  <span style={{ fontSize: "0.75rem", color: "#94a3b8" }}>
                    PNG, JPG, WEBP up to 10MB
                  </span>
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                onChange={handleImageUpload}
              />
            </div>

            {/* Modal Actions */}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem", marginTop: "1rem" }}>
              <button
                type="button"
                className={styles.segmentBtn}
                onClick={() => setIsModalOpen(false)}
                disabled={isSubmitting}
              >
                Cancel
              </button>
              <button type="submit" className={styles.primaryBtn} disabled={isSubmitting}>
                {isSubmitting ? "Saving..." : editingEvent ? "Save Changes" : "Create Event"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Delete Confirmation */}
      {eventToDelete && (
        <ConfirmDialog
          isOpen={Boolean(eventToDelete)}
          title="Delete Event?"
          description={`Are you sure you want to permanently delete "${eventToDelete.title}"? All attendee registrations will also be removed.`}
          confirmText={isDeleting ? "Deleting..." : "Delete Event"}
          tone="danger"
          onConfirm={handleDeleteConfirm}
          onClose={() => setEventToDelete(null)}
        />
      )}
    </div>
  );
}
