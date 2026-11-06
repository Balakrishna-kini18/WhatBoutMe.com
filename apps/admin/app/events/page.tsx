"use client";

import React, { useEffect, useState, useMemo, useRef } from "react";
import Link from "next/link";
import styles from "./events.module.css";
import {
  API_URL,
  getMarketingUrl,
  type EventItem,
  type EventLocationType,
  type CurrencyCode,
  type CreateEventPayload,
} from "../lib/api";
import {
  Modal,
  StatusBadge,
  ConfirmDialog,
  useToast,
  CustomSelect,
  DatePicker,
  TimePicker,
  EmptyState,
} from "../components";
import type { StatusTone } from "../components";

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
  Share: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
      <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
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

function formatSchedule(start: string, end?: string | null) {
  try {
    const s = new Date(start);
    const dateStr = s.toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    const startTime = s.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
    if (!end) return `${dateStr} · ${startTime}`;
    const e = new Date(end);
    const endTime = e.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
    return `${dateStr} · ${startTime} - ${endTime}`;
  } catch {
    return `${start}${end ? ` - ${end}` : ""}`;
  }
}

function formatPrice(price: number, currency: CurrencyCode) {
  if (price === 0) return "Free RSVP";
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      minimumFractionDigits: price % 1 === 0 ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(price);
  } catch {
    return `${currency} ${price}`;
  }
}

function toLocalDatetimeInput(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function EventsAdminPage() {
  const { success: toastSuccess, error: toastError } = useToast();
  const [events, setEvents] = useState<EventItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [locationTypeFilter, setLocationTypeFilter] = useState<"ALL" | EventLocationType>("ALL");
  const [publishFilter, setPublishFilter] = useState<string>("ALL");

  // Modal & Form State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<EventItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [eventToDelete, setEventToDelete] = useState<EventItem | null>(null);

  // Form Fields
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [startDatePart, setStartDatePart] = useState("");
  const [startTimePart, setStartTimePart] = useState("10:00");
  const [endDatePart, setEndDatePart] = useState("");
  const [endTimePart, setEndTimePart] = useState("12:00");
  const [timeFormat, setTimeFormat] = useState<"12h" | "24h">("12h");
  const [timezone, setTimezone] = useState("UTC");

  // Location Toggle & Fields
  const [locationType, setLocationType] = useState<EventLocationType>("ONLINE");
  const [meetingLink, setMeetingLink] = useState("");
  const [venueName, setVenueName] = useState("");
  const [venueAddress, setVenueAddress] = useState("");

  // Pricing & Capacity Fields
  const [price, setPrice] = useState("0");
  const [currency, setCurrency] = useState<CurrencyCode>("USD");
  const [seatLimit, setSeatLimit] = useState("");
  const [bannerUrl, setBannerUrl] = useState("");
  const [isPublished, setIsPublished] = useState(true);

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
    setTitle("");
    setDescription("");
    const today = new Date().toISOString().split("T")[0] || "";
    setStartDatePart(today);
    setStartTimePart("10:00");
    setEndDatePart(today);
    setEndTimePart("12:00");
    setTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");

    setLocationType("ONLINE");
    setMeetingLink("");
    setVenueName("");
    setVenueAddress("");

    setPrice("0");
    setCurrency("USD");
    setSeatLimit("");
    setBannerUrl("");
    setIsPublished(true);

    setFormError(null);
    setIsModalOpen(true);
  };

  const openEditModal = (evt: EventItem) => {
    setEditingEvent(evt);
    setTitle(evt.title);
    setDescription(evt.description);

    const startIso = evt.startDateTime || evt.startDateTimeUtc || evt.startAt;
    const endIso = evt.endDateTime || evt.endDateTimeUtc || evt.endAt;
    const sParts = toLocalDatetimeInput(startIso).split("T");
    const eParts = toLocalDatetimeInput(endIso).split("T");
    const sDate = sParts[0] || "";
    const sTime = sParts[1] || "10:00";
    const eDate = eParts[0] || sDate;
    const eTime = eParts[1] || "12:00";
    setStartDatePart(sDate);
    setStartTimePart(sTime);
    setEndDatePart(eDate);
    setEndTimePart(eTime);
    setTimezone(evt.timezone || "UTC");

    setLocationType(evt.locationType || "ONLINE");
    setMeetingLink(evt.onlineMeetingLink || evt.meetingLink || "");
    setVenueName(evt.venueName || "");
    setVenueAddress(evt.physicalAddress || evt.venueAddress || evt.location || "");

    setPrice(String(evt.amount ?? evt.price ?? 0));
    setCurrency(evt.currency || "USD");
    setSeatLimit(
      evt.capacity !== undefined && evt.capacity !== null
        ? String(evt.capacity)
        : evt.seatLimit !== undefined && evt.seatLimit !== null
        ? String(evt.seatLimit)
        : evt.maxRegistrations !== undefined && evt.maxRegistrations !== null
        ? String(evt.maxRegistrations)
        : ""
    );
    setBannerUrl(evt.bannerUrl || evt.coverImageUrl || "");
    setIsPublished(evt.isPublished ?? true);

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
        setBannerUrl(data.coverImageUrl);
        toastSuccess("Cover banner uploaded");
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

  const handleCopyShareLink = async (evt: EventItem) => {
    const origin = getMarketingUrl();
    const shareUrl = `${origin}/events/${evt.slug || evt.id}`;

    if (navigator.share) {
      try {
        await navigator.share({
          title: evt.title,
          text: `Register for ${evt.title} on WhatBoutMe!`,
          url: shareUrl,
        });
        return;
      } catch {
        // Fallback to clipboard
      }
    }

    try {
      await navigator.clipboard.writeText(shareUrl);
      toastSuccess("Shareable event link copied to clipboard!");
    } catch {
      toastError("Could not copy link to clipboard");
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

    const startDateTime = new Date(`${startDatePart}T${startTimePart}:00`).toISOString();
    const endDateTime = new Date(`${endDatePart}T${endTimePart}:00`).toISOString();

    if (new Date(startDateTime).getTime() >= new Date(endDateTime).getTime()) {
      setFormError("End date & time must be strictly after start date & time");
      return;
    }

    // Strict location type validation
    if (locationType === "ONLINE" && !meetingLink.trim()) {
      setFormError("Online events require a Virtual Meeting Link (Zoom URL)");
      return;
    }

    if (locationType === "PHYSICAL") {
      if (!venueName.trim()) {
        setFormError("Physical events require a Venue / Hall Name");
        return;
      }
      if (!venueAddress.trim()) {
        setFormError("Physical events require a Venue Address");
        return;
      }
    }

    const numPrice = Number(price);
    if (isNaN(numPrice) || numPrice < 0) {
      setFormError("Price must be a valid number >= 0");
      return;
    }

    setIsSubmitting(true);
    try {
      const token = localStorage.getItem("token");
      const payload: CreateEventPayload = {
        title: title.trim(),
        description: description.trim(),
        startDateTime,
        startDateTimeUtc: startDateTime,
        endDateTime,
        endDateTimeUtc: endDateTime,
        timezone,
        locationType,
        meetingLink: locationType === "ONLINE" ? meetingLink.trim() : undefined,
        onlineMeetingLink: locationType === "ONLINE" ? meetingLink.trim() : undefined,
        venueName: locationType === "PHYSICAL" ? venueName.trim() : undefined,
        venueAddress: locationType === "PHYSICAL" ? venueAddress.trim() : undefined,
        physicalAddress: locationType === "PHYSICAL" ? venueAddress.trim() : undefined,
        price: numPrice,
        amount: numPrice,
        currency,
        seatLimit: seatLimit.trim() ? Number(seatLimit) : null,
        capacity: seatLimit.trim() ? Number(seatLimit) : null,
        bannerUrl: bannerUrl.trim() || undefined,
        isPublished,
      };

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

  const handleTogglePublish = async (evt: EventItem) => {
    try {
      const token = localStorage.getItem("token");
      const newStatus = !evt.isPublished;
      const res = await fetch(`${API_URL}/admin/events/${evt.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ isPublished: newStatus }),
      });

      if (res.ok) {
        toastSuccess(newStatus ? "Event published" : "Event unpublished");
        setEvents((prev) =>
          prev.map((e) => (e.id === evt.id ? { ...e, isPublished: newStatus } : e)),
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
  const publishedCount = events.filter((e) => e.isPublished).length;
  const totalSeatsBooked = events.reduce((acc, e) => acc + (e.seatsBooked || e.registrationCount || 0), 0);
  const onlineCount = events.filter((e) => e.locationType === "ONLINE").length;

  // Filtered List
  const filteredEvents = useMemo(() => {
    return events.filter((e) => {
      if (locationTypeFilter !== "ALL" && e.locationType !== locationTypeFilter) return false;
      if (publishFilter === "PUBLISHED" && !e.isPublished) return false;
      if (publishFilter === "DRAFT" && e.isPublished) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchTitle = e.title.toLowerCase().includes(q);
        const matchDesc = e.description?.toLowerCase().includes(q);
        const matchVenue = e.venueName?.toLowerCase().includes(q) || e.venueAddress?.toLowerCase().includes(q);
        if (!matchTitle && !matchDesc && !matchVenue) return false;
      }
      return true;
    });
  }, [events, locationTypeFilter, publishFilter, search]);

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.header}>
        <div>
          <h1 className={styles.headerTitle}>Events &amp; Webinars</h1>
          {/* <p className={styles.headerSubtitle}>
            Manage community workshops, masterclasses, and live webinars with dynamic multi-currency pricing
          </p> */}
        </div>
        <button type="button" className={styles.primaryBtn} onClick={openCreateModal}>
          <Icons.Plus />
          <span>New Event</span>
        </button>
      </div>

      {/* KPI Cards */}
      <div className={styles.kpiGrid}>
        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>Total Events</span>
          <span className={styles.kpiValue}>{totalEvents}</span>
        </div>
        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>Published & Live</span>
          <span className={styles.kpiValue}>{publishedCount}</span>
        </div>
        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>Confirmed Bookings</span>
          <span className={styles.kpiValue}>{totalSeatsBooked}</span>
        </div>
        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>Online Sessions</span>
          <span className={styles.kpiValue}>{onlineCount}</span>
        </div>
      </div>

      {/* Toolbar */}
      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          <div className={styles.segmented}>
            <button
              type="button"
              className={`${styles.segmentBtn} ${locationTypeFilter === "ALL" ? styles.segmentBtnActive : ""}`}
              onClick={() => setLocationTypeFilter("ALL")}
            >
              All Formats
            </button>
            <button
              type="button"
              className={`${styles.segmentBtn} ${locationTypeFilter === "ONLINE" ? styles.segmentBtnActive : ""}`}
              onClick={() => setLocationTypeFilter("ONLINE")}
            >
              Online
            </button>
            <button
              type="button"
              className={`${styles.segmentBtn} ${locationTypeFilter === "PHYSICAL" ? styles.segmentBtnActive : ""}`}
              onClick={() => setLocationTypeFilter("PHYSICAL")}
            >
              Physical / In-Person
            </button>
          </div>

          <CustomSelect
            value={publishFilter}
            onChange={(val) => setPublishFilter(val)}
            minWidth="175px"
            ariaLabel="Filter events by visibility"
            options={[
              { value: "ALL", label: "All Visibility" },
              { value: "PUBLISHED", label: "Published Only" },
              { value: "DRAFT", label: "Drafts / Unpublished" },
            ]}
          />
        </div>

        <div className={styles.searchWrap}>
          <span className={styles.searchIcon}>
            <Icons.Search />
          </span>
          <input
            type="search"
            placeholder="Search by title, venue..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={styles.searchInput}
          />
        </div>
      </div>

      {/* Events Grid */}
      {isLoading ? (
        <div className={styles.eventsGrid}>
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div
              key={i}
              className="skeletonCard"
              style={{
                height: 380,
                borderRadius: 16,
                padding: "1rem",
                display: "flex",
                flexDirection: "column",
                gap: "1rem",
              }}
            >
              <div className="skeleton" style={{ width: "100%", height: 160, borderRadius: 12 }} />
              <div className="skeleton" style={{ width: "65%", height: 22, borderRadius: 6 }} />
              <div className="skeleton" style={{ width: "90%", height: 16, borderRadius: 4 }} />
              <div className="skeleton" style={{ width: "40%", height: 16, borderRadius: 4, marginTop: "auto" }} />
            </div>
          ))}
        </div>
      ) : filteredEvents.length === 0 ? (
        <div style={{ background: "#ffffff", border: "1px solid var(--border-light, #ece4d7)", borderRadius: 12, padding: "3rem 1.5rem" }}>
          <EmptyState
            icon="calendar"
            title="No events found"
            description={
              search || locationTypeFilter !== "ALL" || publishFilter !== "ALL"
                ? "Try adjusting your filters or search terms."
                : "Get started by creating your first community event or webinar."
            }
            actionLabel={
              search || locationTypeFilter !== "ALL" || publishFilter !== "ALL"
                ? "Reset Filters"
                : "Create Event"
            }
            onAction={
              search || locationTypeFilter !== "ALL" || publishFilter !== "ALL"
                ? () => {
                    setSearch("");
                    setLocationTypeFilter("ALL");
                    setPublishFilter("ALL");
                  }
                : openCreateModal
            }
          />
        </div>
      ) : (
        <div className={styles.eventsGrid}>
          {filteredEvents.map((evt) => {
            const startIso = evt.startDateTime || evt.startAt || "";
            const endIso = evt.endDateTime || evt.endAt || "";
            const booked = evt.seatsBooked ?? evt.registrationCount ?? 0;
            const limit = evt.seatLimit ?? evt.maxRegistrations;
            const capacityRatio = limit ? Math.min(100, Math.round((booked / limit) * 100)) : 0;
            const isOnline = evt.locationType === "ONLINE";

            return (
              <div key={evt.id} className={styles.eventCard}>
                <div className={styles.coverWrap}>
                  {evt.bannerUrl || evt.coverImageUrl ? (
                    <img
                      src={evt.bannerUrl || evt.coverImageUrl || ""}
                      alt={evt.title}
                      className={styles.coverImg}
                    />
                  ) : (
                    <div className={styles.coverPlaceholder}>
                      <div style={{ opacity: 0.85, transform: "scale(1.2)" }}>
                        <Icons.Calendar />
                      </div>
                      <span style={{ maxWidth: "85%", overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
                        {evt.title}
                      </span>
                    </div>
                  )}

                  <div className={styles.cardHeaderOverlay}>
                    {isOnline ? (
                      <span className={styles.badgeOnline}>Online</span>
                    ) : (
                      <span className={styles.badgePhysical}>In-Person</span>
                    )}

                    <StatusBadge
                      status={evt.isPublished ? "PUBLISHED" : "DRAFT"}
                      tone={evt.isPublished ? "active" : "neutral"}
                    />
                  </div>
                </div>

                <div className={styles.cardBody}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "0.5rem" }}>
                    <h3 className={styles.cardTitle}>{evt.title}</h3>
                    <span className={styles.priceBadge}>{formatPrice(evt.price, evt.currency)}</span>
                  </div>

                  {evt.description && <p className={styles.cardDesc}>{evt.description}</p>}

                  <div className={styles.metaList}>
                    <div className={styles.metaItem}>
                      <Icons.Calendar />
                      <span>{formatSchedule(startIso, endIso)}</span>
                    </div>

                    {isOnline ? (
                      <div className={styles.metaItem}>
                        <Icons.Video />
                        <span style={{ color: "var(--accent-primary, #c97a1e)", fontWeight: 600 }}>
                          Meeting link private (emailed after payment)
                        </span>
                      </div>
                    ) : (
                      <div className={styles.metaItem}>
                        <Icons.Pin />
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {evt.venueName ? `${evt.venueName} · ` : ""}
                          {evt.venueAddress || evt.location || "Physical Hall"}
                        </span>
                      </div>
                    )}

                    <div className={styles.metaItem} style={{ marginTop: "0.25rem" }}>
                      <Icons.Users />
                      <span style={{ fontWeight: 600 }}>
                        {booked} booked {limit ? `/ ${limit} seats` : "(unlimited)"}
                      </span>
                    </div>
                  </div>

                  {limit ? (
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
                    <span>Registrations ({booked})</span>
                  </Link>

                  <div className={styles.cardActions}>
                    <button
                      type="button"
                      className={styles.shareBtn}
                      onClick={() => handleCopyShareLink(evt)}
                      title="Copy Share Link to Clipboard"
                    >
                      <Icons.Share />
                      <span>Share</span>
                    </button>

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
          title={editingEvent ? "Edit Event / Workshop" : "Create Event / Workshop"}
          maxWidth="720px"
        >
          <form onSubmit={handleSubmit} className={styles.formGrid}>
            {formError && <div className={styles.errorBanner}>{formError}</div>}

            {/* Event Name */}
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

            {/* Description */}
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

            {/* Format Toggle (Online vs Physical) */}
            <div className={styles.formGroup}>
              <label className={styles.label}>Session Format *</label>
              <div className={styles.segmented} style={{ width: "fit-content" }}>
                <button
                  type="button"
                  className={`${styles.segmentBtn} ${locationType === "ONLINE" ? styles.segmentBtnActive : ""}`}
                  onClick={() => setLocationType("ONLINE")}
                >
                  Online Session (Zoom / Meet)
                </button>
                <button
                  type="button"
                  className={`${styles.segmentBtn} ${locationType === "PHYSICAL" ? styles.segmentBtnActive : ""}`}
                  onClick={() => setLocationType("PHYSICAL")}
                >
                  In-Person Physical Venue
                </button>
              </div>
            </div>

            {/* Conditional Location Inputs */}
            {locationType === "ONLINE" ? (
              <div className={styles.formGroup}>
                <label className={styles.label}>Virtual Meeting Link (Zoom URL) *</label>
                <input
                  type="url"
                  placeholder="https://zoom.us/j/1234567890"
                  value={meetingLink}
                  onChange={(e) => setMeetingLink(e.target.value)}
                  className={styles.input}
                  required={locationType === "ONLINE"}
                />
                <span style={{ fontSize: "0.75rem", color: "var(--text-muted, #78716a)" }}>
                  Kept secure and private from public APIs. Automatically sent via email upon verified payment.
                </span>
              </div>
            ) : (
              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label className={styles.label}>Venue / Hall Name *</label>
                  <input
                    type="text"
                    placeholder="e.g. Grand Ballroom, Taj West End"
                    value={venueName}
                    onChange={(e) => setVenueName(e.target.value)}
                    className={styles.input}
                    required={locationType === "PHYSICAL"}
                  />
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.label}>Physical Address / Map Location *</label>
                  <input
                    type="text"
                    placeholder="e.g. Race Course Rd, High Grounds, Bengaluru"
                    value={venueAddress}
                    onChange={(e) => setVenueAddress(e.target.value)}
                    className={styles.input}
                    required={locationType === "PHYSICAL"}
                  />
                </div>
              </div>
            )}

            {/* Schedule Section */}
            <div className={styles.formRow}>
              <div className={styles.formGroup}>
                <label className={styles.label}>Start Date *</label>
                <DatePicker
                  value={startDatePart}
                  onChange={(val) => {
                    setStartDatePart(val);
                    if (endDatePart && val && val > endDatePart) {
                      setEndDatePart(val);
                    }
                  }}
                  placeholder="Select Start Date"
                  ariaLabel="Start Date"
                  minWidth="100%"
                />
              </div>
              <div className={styles.formGroup}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <label className={styles.label}>Start Time *</label>
                  <div style={{ display: "inline-flex", background: "var(--bg-soft, #f5ece1)", padding: "1px", borderRadius: "5px", gap: "1px", border: "1px solid var(--border-light, #ece4d7)" }}>
                    <button
                      type="button"
                      onClick={() => setTimeFormat("12h")}
                      style={{
                        border: "none",
                        background: timeFormat === "12h" ? "#ffffff" : "transparent",
                        color: timeFormat === "12h" ? "var(--text-primary, #14110f)" : "var(--text-muted, #78716a)",
                        fontWeight: timeFormat === "12h" ? 700 : 500,
                        fontSize: "0.68rem",
                        padding: "2px 6px",
                        borderRadius: "4px",
                        cursor: "pointer",
                        boxShadow: timeFormat === "12h" ? "0 1px 2px rgba(20, 17, 15, 0.06)" : "none",
                      }}
                      title="12-Hour Format (AM/PM)"
                    >
                      12h
                    </button>
                    <button
                      type="button"
                      onClick={() => setTimeFormat("24h")}
                      style={{
                        border: "none",
                        background: timeFormat === "24h" ? "#ffffff" : "transparent",
                        color: timeFormat === "24h" ? "var(--text-primary, #14110f)" : "var(--text-muted, #78716a)",
                        fontWeight: timeFormat === "24h" ? 700 : 500,
                        fontSize: "0.68rem",
                        padding: "2px 6px",
                        borderRadius: "4px",
                        cursor: "pointer",
                        boxShadow: timeFormat === "24h" ? "0 1px 2px rgba(20, 17, 15, 0.06)" : "none",
                      }}
                      title="24-Hour Military Format"
                    >
                      24h
                    </button>
                  </div>
                </div>
                <TimePicker
                  value={startTimePart}
                  onChange={setStartTimePart}
                  format={timeFormat}
                  ariaLabel="Start Time"
                />
              </div>
            </div>

            <div className={styles.formRow}>
              <div className={styles.formGroup}>
                <label className={styles.label}>End Date *</label>
                <DatePicker
                  value={endDatePart}
                  onChange={setEndDatePart}
                  placeholder="Select End Date"
                  ariaLabel="End Date"
                  minWidth="100%"
                  minDate={startDatePart || undefined}
                />
              </div>
              <div className={styles.formGroup}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <label className={styles.label}>End Time *</label>
                  <div style={{ display: "inline-flex", background: "var(--bg-soft, #f5ece1)", padding: "1px", borderRadius: "5px", gap: "1px", border: "1px solid var(--border-light, #ece4d7)" }}>
                    <button
                      type="button"
                      onClick={() => setTimeFormat("12h")}
                      style={{
                        border: "none",
                        background: timeFormat === "12h" ? "#ffffff" : "transparent",
                        color: timeFormat === "12h" ? "var(--text-primary, #14110f)" : "var(--text-muted, #78716a)",
                        fontWeight: timeFormat === "12h" ? 700 : 500,
                        fontSize: "0.68rem",
                        padding: "2px 6px",
                        borderRadius: "4px",
                        cursor: "pointer",
                        boxShadow: timeFormat === "12h" ? "0 1px 2px rgba(20, 17, 15, 0.06)" : "none",
                      }}
                      title="12-Hour Format (AM/PM)"
                    >
                      12h
                    </button>
                    <button
                      type="button"
                      onClick={() => setTimeFormat("24h")}
                      style={{
                        border: "none",
                        background: timeFormat === "24h" ? "#ffffff" : "transparent",
                        color: timeFormat === "24h" ? "var(--text-primary, #14110f)" : "var(--text-muted, #78716a)",
                        fontWeight: timeFormat === "24h" ? 700 : 500,
                        fontSize: "0.68rem",
                        padding: "2px 6px",
                        borderRadius: "4px",
                        cursor: "pointer",
                        boxShadow: timeFormat === "24h" ? "0 1px 2px rgba(20, 17, 15, 0.06)" : "none",
                      }}
                      title="24-Hour Military Format"
                    >
                      24h
                    </button>
                  </div>
                </div>
                <TimePicker
                  value={endTimePart}
                  onChange={setEndTimePart}
                  format={timeFormat}
                  ariaLabel="End Time"
                />
              </div>
            </div>

            {/* Pricing & Capacity */}
            <div className={styles.formRow}>
              <div className={styles.formGroup}>
                <label className={styles.label}>Ticket Price ($ USD) *</label>
                <div style={{ position: "relative" }}>
                  <span
                    style={{
                      position: "absolute",
                      left: "12px",
                      top: "50%",
                      transform: "translateY(-50%)",
                      fontWeight: 700,
                      color: "var(--text-muted, #78716a)",
                      fontSize: "0.95rem",
                    }}
                  >
                    $
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00 for free RSVP"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    className={styles.input}
                    style={{ paddingLeft: "26px" }}
                    required
                  />
                </div>
                <span style={{ fontSize: "0.75rem", color: "var(--text-muted, #78716a)" }}>
                  Set to 0 for a free registration session.
                </span>
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label}>Seat Capacity Limit</label>
                <input
                  type="number"
                  min="1"
                  placeholder="Leave empty for unlimited"
                  value={seatLimit}
                  onChange={(e) => setSeatLimit(e.target.value)}
                  className={styles.input}
                />
                <span style={{ fontSize: "0.75rem", color: "var(--text-muted, #78716a)" }}>
                  Leave empty for unlimited attendance.
                </span>
              </div>
            </div>

            {/* Publication Status */}
            <div className={styles.formGroup}>
              <label className={styles.label}>Publication Status</label>
              <CustomSelect
                value={isPublished ? "PUBLISHED" : "DRAFT"}
                onChange={(val) => setIsPublished(val === "PUBLISHED")}
                fullWidth
                ariaLabel="Publication Status"
                options={[
                  { value: "PUBLISHED", label: "Published (Visible to Learners)" },
                  { value: "DRAFT", label: "Draft (Hidden from Public)" },
                ]}
              />
            </div>

            {/* Banner Upload */}
            <div className={styles.formGroup}>
              <label className={styles.label}>Event Cover Banner</label>
              {bannerUrl ? (
                <div className={styles.previewWrap}>
                  <img src={bannerUrl} alt="Preview" className={styles.previewImg} />
                  <button
                    type="button"
                    onClick={() => setBannerUrl("")}
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
                    {isUploadingImage ? "Uploading to Cloudinary..." : "Click to upload banner image"}
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
                className={styles.secondaryBtn}
                onClick={() => setIsModalOpen(false)}
                disabled={isSubmitting}
              >
                Cancel
              </button>
              <button type="submit" className={styles.primaryBtn} disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <span className="spinner" /> Saving...
                  </>
                ) : (
                  editingEvent ? "Save Changes" : "Create Event"
                )}
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
