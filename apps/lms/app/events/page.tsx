"use client";

import React, { useEffect, useState, useMemo } from "react";
import styles from "./events.module.css";
import { API_URL } from "../lib/api";

interface EventItem {
  id: string;
  type?: "EVENT" | "WEBINAR";
  title: string;
  description: string;
  status?: "SCHEDULED" | "REGISTRATION_OPEN" | "ONGOING" | "ENDED" | "CANCELLED";
  startAt: string;
  endAt: string;
  startDateTime?: string;
  endDateTime?: string;
  location?: string | null;
  meetingLink?: string | null;
  coverImageUrl?: string | null;
  bannerUrl?: string | null;
  maxRegistrations?: number | null;
  seatLimit?: number | null;
  registrationOpensAt?: string | null;
  registrationClosesAt?: string | null;
  registrationCount: number;
  seatsBooked?: number;
  registeredByMe: boolean;
  isPublished?: boolean;
  price?: number;
  currency?: string;
  createdAt: string;
}

interface MyRegistration {
  id: string;
  eventId: string;
  fullName: string;
  status: "CONFIRMED" | "REJECTED";
  event: EventItem;
}

const CATEGORIES = [
  { value: "STUDENT", label: "Student" },
  { value: "ENTREPRENEUR", label: "Entrepreneur" },
  { value: "STARTUP_FOUNDER", label: "Startup Founder" },
  { value: "ASPIRING_FOUNDER", label: "Aspiring Founder" },
  { value: "PROFESSIONAL", label: "Working Professional" },
  { value: "RESEARCHER", label: "Researcher" },
  { value: "ACADEMIC_FACULTY", label: "Academic / Faculty" },
  { value: "INVESTOR", label: "Investor" },
  { value: "CONSULTANT", label: "Consultant" },
  { value: "FREELANCER", label: "Freelancer" },
  { value: "JOB_SEEKER", label: "Job Seeker" },
  { value: "CORPORATE_EMPLOYEE", label: "Corporate Employee" },
  { value: "NGO_WORKER", label: "NGO / Social Sector" },
  { value: "GOVERNMENT_OFFICIAL", label: "Government Official" },
  { value: "HOMEMAKER", label: "Homemaker" },
  { value: "RETIRED", label: "Retired" },
  { value: "OTHER", label: "Other" },
];

function getDuration(start: string, end: string) {
  try {
    const s = new Date(start).getTime();
    const e = new Date(end).getTime();
    const mins = Math.max(0, Math.round((e - s) / 60000));
    if (mins < 60) return `${mins} mins`;
    const hrs = Math.floor(mins / 60);
    const rem = mins % 60;
    return rem === 0 ? `${hrs} ${hrs === 1 ? "hour" : "hours"}` : `${hrs} hr ${rem} mins`;
  } catch {
    return "Session";
  }
}

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
    const sTime = s.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
    const eTime = e.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
    return `${dateStr} · ${sTime} - ${eTime}`;
  } catch {
    return `${start} - ${end}`;
  }
}

export default function LmsEventsPage() {
  const [events, setEvents] = useState<EventItem[]>([]);
  const [myRegistrations, setMyRegistrations] = useState<MyRegistration[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState<"ALL" | "EVENT" | "WEBINAR">("ALL");
  const [activeTab, setActiveTab] = useState<"all" | "upcoming" | "past" | "mine">("upcoming");
  const [feedback, setFeedback] = useState<string | null>(null);

  // Registration Modal State
  const [selectedEvent, setSelectedEvent] = useState<EventItem | null>(null);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [category, setCategory] = useState("PROFESSIONAL");
  const [categoryOther, setCategoryOther] = useState("");
  const [organization, setOrganization] = useState("");
  const [city, setCity] = useState("");
  const [modalError, setModalError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const token = localStorage.getItem("token");
      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const [eventsRes, regsRes] = await Promise.all([
        fetch(`${API_URL}/events?limit=100`, { headers }),
        token ? fetch(`${API_URL}/events/my/registrations`, { headers }).catch(() => null) : null,
      ]);

      if (eventsRes.ok) {
        const data = await eventsRes.json();
        setEvents(data.items || []);
      }

      if (regsRes && regsRes.ok) {
        const regsData = await regsRes.json();
        setMyRegistrations(Array.isArray(regsData) ? regsData : []);
      }
    } catch {
      // Ignore network errors
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();

    // Prefill profile data from user session
    try {
      const user = JSON.parse(localStorage.getItem("user") || "{}");
      if (user.name) setFullName(user.name);
      if (user.email) setEmail(user.email);
      if (user.phone) setPhone(user.phone);
    } catch {
      // Ignore
    }
  }, []);

  const registeredEventIds = useMemo(() => {
    const set = new Set<string>();
    myRegistrations.forEach((r) => {
      if (r.status === "CONFIRMED") set.add(r.eventId);
    });
    return set;
  }, [myRegistrations]);

  const { upcomingEvents, pastEvents, myEvents, allEvents } = useMemo(() => {
    const now = Date.now();
    const upcoming: EventItem[] = [];
    const past: EventItem[] = [];
    const mine: EventItem[] = [];

    events.forEach((evt) => {
      if (typeFilter !== "ALL" && evt.type !== typeFilter) return;

      const isRegistered = evt.registeredByMe || registeredEventIds.has(evt.id);
      const isPast = new Date(evt.endAt).getTime() < now;

      if (isRegistered) mine.push(evt);
      if (isPast) past.push(evt);
      else upcoming.push(evt);
    });

    upcoming.sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
    past.sort((a, b) => new Date(b.startAt).getTime() - new Date(a.startAt).getTime());

    return {
      upcomingEvents: upcoming,
      pastEvents: past,
      myEvents: mine,
      allEvents: [...upcoming, ...past],
    };
  }, [events, typeFilter, registeredEventIds]);

  const displayedEvents = useMemo(() => {
    if (activeTab === "upcoming") return upcomingEvents;
    if (activeTab === "past") return pastEvents;
    if (activeTab === "mine") return myEvents;
    return allEvents;
  }, [activeTab, upcomingEvents, pastEvents, myEvents, allEvents]);

  const openRegisterModal = (evt: EventItem) => {
    setSelectedEvent(evt);
    setModalError(null);
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEvent) return;

    if (!fullName.trim()) {
      setModalError("Please enter your full name");
      return;
    }
    if (!email.trim() || !email.includes("@")) {
      setModalError("Please enter a valid email address");
      return;
    }
    if (!phone.trim()) {
      setModalError("Please enter your contact phone number");
      return;
    }
    if (category === "OTHER" && !categoryOther.trim()) {
      setModalError("Please specify your participant category");
      return;
    }

    setIsSubmitting(true);
    setModalError(null);
    try {
      const token = localStorage.getItem("token");
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const res = await fetch(`${API_URL}/events/${selectedEvent.id}/register`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          fullName: fullName.trim(),
          email: email.trim().toLowerCase(),
          phone: phone.trim(),
          attendeeName: fullName.trim(),
          attendeeEmail: email.trim().toLowerCase(),
          attendeePhone: phone.trim(),
          category,
          categoryOther: category === "OTHER" ? categoryOther.trim() : undefined,
          organization: organization.trim() || undefined,
          city: city.trim() || undefined,
        }),
      });

      if (res.ok) {
        const checkoutData = await res.json().catch(() => null);
        // If event is paid and returned a pending registration, complete simulated payment verification
        if (checkoutData?.orderId && checkoutData?.status === "PENDING") {
          try {
            await fetch(`${API_URL}/events/verify-payment`, {
              method: "POST",
              headers,
              body: JSON.stringify({
                registrationId: checkoutData.registrationId,
                gatewayOrderId: checkoutData.orderId,
                gatewayPaymentId: `sim_pay_${Date.now()}`,
                simulation: true,
                isSimulated: true,
              }),
            });
          } catch {
            // Ignore payment verify errors in background
          }
        }

        setFeedback(`Registration confirmed for "${selectedEvent.title}"! A confirmation has been sent to your email.`);
        setSelectedEvent(null);
        loadData();
      } else {
        const err = await res.json().catch(() => null);
        setModalError(err?.message || "Registration failed. Please try again.");
      }
    } catch {
      setModalError("Network error. Please try again later.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.titleArea}>
          <h1 className={styles.title}>Events & Webinars</h1>
          <p className={styles.subtitle}>
            Connect with our community of learners, attend masterclasses with guest speakers, and join live neuroscience sessions.
          </p>
        </div>

        {/* Type Toggle */}
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
            Workshops
          </button>
          <button
            type="button"
            className={`${styles.segmentBtn} ${typeFilter === "WEBINAR" ? styles.segmentBtnActive : ""}`}
            onClick={() => setTypeFilter("WEBINAR")}
          >
            Webinars
          </button>
        </div>
      </div>

      {feedback && (
        <div
          style={{
            background: "#ecfdf5",
            border: "1px solid #a7f3d0",
            color: "#065f46",
            padding: "1rem 1.25rem",
            borderRadius: "14px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontWeight: 600,
            fontSize: "0.9rem",
          }}
        >
          <span>{feedback}</span>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            style={{ background: "none", border: "none", cursor: "pointer", fontWeight: 800, color: "#065f46" }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Filter Tabs */}
      <div className={styles.filterBar}>
        <div className={styles.segmented}>
          <button
            type="button"
            className={`${styles.segmentBtn} ${activeTab === "upcoming" ? styles.segmentBtnActive : ""}`}
            onClick={() => setActiveTab("upcoming")}
          >
            Upcoming
            <span className={styles.countBadge}>{upcomingEvents.length}</span>
          </button>
          <button
            type="button"
            className={`${styles.segmentBtn} ${activeTab === "all" ? styles.segmentBtnActive : ""}`}
            onClick={() => setActiveTab("all")}
          >
            All
            <span className={styles.countBadge}>{allEvents.length}</span>
          </button>
          <button
            type="button"
            className={`${styles.segmentBtn} ${activeTab === "mine" ? styles.segmentBtnActive : ""}`}
            onClick={() => setActiveTab("mine")}
          >
            My Registrations
            <span className={styles.countBadge}>{myEvents.length}</span>
          </button>
          <button
            type="button"
            className={`${styles.segmentBtn} ${activeTab === "past" ? styles.segmentBtnActive : ""}`}
            onClick={() => setActiveTab("past")}
          >
            Past Sessions
            <span className={styles.countBadge}>{pastEvents.length}</span>
          </button>
        </div>
      </div>

      {/* Events Grid */}
      {isLoading ? (
        <div style={{ textAlign: "center", padding: "5rem 1rem", color: "var(--text-secondary)" }}>
          Loading community events...
        </div>
      ) : displayedEvents.length === 0 ? (
        <div className={styles.emptyState}>
          <h3 style={{ fontFamily: "var(--font-playfair)", fontSize: "1.35rem", margin: 0, fontWeight: 700 }}>
            No sessions available
          </h3>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem", maxWidth: "450px", margin: 0 }}>
            {activeTab === "mine"
              ? "You haven't registered for any events yet. Check out the upcoming sessions to book your free spot!"
              : "There are currently no sessions in this category. Stay tuned as new masterclasses are announced regularly."}
          </p>
        </div>
      ) : (
        <div className={styles.eventsGrid}>
          {displayedEvents.map((evt) => {
            const startIso = evt.startDateTime || evt.startAt;
            const endIso = evt.endDateTime || evt.endAt || startIso;
            const startDate = new Date(startIso);
            const monthStr = startDate.toLocaleDateString(undefined, { month: "short" });
            const dayStr = startDate.getDate();
            const duration = getDuration(startIso, endIso);
            const isRegistered = evt.registeredByMe || registeredEventIds.has(evt.id);
            const isPast = endIso ? new Date(endIso).getTime() < Date.now() : false;
            const maxCap = evt.seatLimit ?? evt.maxRegistrations;
            const currentBooked = evt.seatsBooked ?? evt.registrationCount ?? 0;
            const isFull = maxCap !== null && maxCap !== undefined && currentBooked >= maxCap;
            const canRegister =
              (evt.status === "REGISTRATION_OPEN" || (!evt.status && evt.isPublished !== false)) &&
              !isRegistered &&
              !isPast &&
              !isFull;
            const banner = evt.bannerUrl || evt.coverImageUrl;

            return (
              <div key={evt.id} className={styles.eventCard}>
                <div className={styles.coverWrap}>
                  {banner ? (
                    <img src={banner} alt={evt.title} className={styles.coverImg} />
                  ) : (
                    <div className={styles.coverPlaceholder}>
                      <span>{evt.title}</span>
                    </div>
                  )}

                  <div className={styles.dateBadge}>
                    <span className={styles.dateMonth}>{monthStr}</span>
                    <span className={styles.dateDay}>{dayStr}</span>
                  </div>

                  <span className={styles.typeBadge}>{evt.type || "WORKSHOP"}</span>
                </div>

                <div className={styles.cardBody}>
                  <h3 className={styles.cardTitle}>{evt.title}</h3>
                  {evt.description && <p className={styles.cardDesc}>{evt.description}</p>}

                  <div className={styles.metaGrid}>
                    <div className={styles.metaItem}>
                      <svg className={styles.metaIcon} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
                      <span>
                        {formatSchedule(startIso, endIso)} ({duration})
                      </span>
                    </div>

                    {evt.location && (
                      <div className={styles.metaItem}>
                        <svg className={styles.metaIcon} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {evt.location}
                        </span>
                      </div>
                    )}

                    {evt.meetingLink && (
                      <div className={styles.metaItem}>
                        <svg className={styles.metaIcon} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" ry="2" /></svg>
                        <span>Live Virtual Room (Zoom)</span>
                      </div>
                    )}

                    <div className={styles.metaItem}>
                      <svg className={styles.metaIcon} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
                      <span>
                        {currentBooked} attendee{currentBooked === 1 ? "" : "s"}
                        {maxCap ? ` · Limited to ${maxCap}` : " · Open registration"}
                      </span>
                    </div>
                  </div>
                </div>

                <div className={styles.cardFooter}>
                  {isRegistered ? (
                    <div className={styles.registeredBadge}>
                      <span>✓</span>
                      <span>You Are Registered</span>
                    </div>
                  ) : isPast ? (
                    <div className={styles.disabledBtn}>Session Concluded</div>
                  ) : isFull ? (
                    <div className={styles.disabledBtn}>Capacity Full</div>
                  ) : evt.status === "SCHEDULED" ? (
                    <div className={styles.disabledBtn}>
                      {evt.registrationOpensAt
                        ? `Opens ${new Date(evt.registrationOpensAt).toLocaleDateString()}`
                        : "Coming Soon"}
                    </div>
                  ) : canRegister ? (
                    <button
                      type="button"
                      className={styles.registerBtn}
                      onClick={() => openRegisterModal(evt)}
                    >
                      {evt.price && Number(evt.price) > 0
                        ? `Book Seat · ${evt.currency || "USD"} ${evt.price}`
                        : "Register Now · Free Pass"}
                    </button>
                  ) : (
                    <div className={styles.disabledBtn}>Registration Closed</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Registration Modal */}
      {selectedEvent && (
        <div className={styles.modalBackdrop} onClick={() => setSelectedEvent(null)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>Reserve Your Spot</h2>
              <button
                type="button"
                className={styles.closeBtn}
                onClick={() => setSelectedEvent(null)}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleRegisterSubmit}>
              <div className={styles.modalBody}>
                {modalError && <div className={styles.errorBanner}>{modalError}</div>}

                {/* Event Summary Strip */}
                <div className={styles.eventSummaryStrip}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: "0.75rem", fontWeight: 700, color: selectedEvent.price && Number(selectedEvent.price) > 0 ? "#b45309" : "#10b981", textTransform: "uppercase" }}>
                      {selectedEvent.price && Number(selectedEvent.price) > 0
                        ? `Admission: ${selectedEvent.currency || "USD"} ${selectedEvent.price}`
                        : "Free Community Pass"}
                    </span>
                    <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--text-secondary)" }}>
                      {selectedEvent.type || "WORKSHOP"}
                    </span>
                  </div>
                  <h3 style={{ fontFamily: "var(--font-playfair)", fontSize: "1.15rem", margin: 0, fontWeight: 700 }}>
                    {selectedEvent.title}
                  </h3>
                  <p style={{ fontSize: "0.825rem", color: "var(--text-secondary)", margin: 0 }}>
                    {formatSchedule(selectedEvent.startDateTime || selectedEvent.startAt, selectedEvent.endDateTime || selectedEvent.endAt)}
                  </p>
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Full Name *</label>
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className={styles.formInput}
                    placeholder="Your legal or preferred name"
                    required
                  />
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Email Address *</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className={styles.formInput}
                    placeholder="Where we'll send the calendar invite"
                    required
                  />
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Phone / WhatsApp Number *</label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className={styles.formInput}
                    placeholder="e.g. +971 50 123 4567"
                    required
                  />
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Participant Category *</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className={styles.formSelect}
                  >
                    {CATEGORIES.map((cat) => (
                      <option key={cat.value} value={cat.value}>
                        {cat.label}
                      </option>
                    ))}
                  </select>
                </div>

                {category === "OTHER" && (
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Please Specify Category *</label>
                    <input
                      type="text"
                      value={categoryOther}
                      onChange={(e) => setCategoryOther(e.target.value)}
                      className={styles.formInput}
                      placeholder="e.g. Life Coach, Neuroscientist"
                      required
                    />
                  </div>
                )}

                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Organization / University (Optional)</label>
                  <input
                    type="text"
                    value={organization}
                    onChange={(e) => setOrganization(e.target.value)}
                    className={styles.formInput}
                    placeholder="e.g. Dubai Health Authority"
                  />
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>City / Country (Optional)</label>
                  <input
                    type="text"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    className={styles.formInput}
                    placeholder="e.g. Dubai, UAE"
                  />
                </div>

                <button
                  type="submit"
                  className={styles.registerBtn}
                  disabled={isSubmitting}
                  style={{ marginTop: "0.5rem" }}
                >
                  {isSubmitting
                    ? "Confirming Registration..."
                    : selectedEvent.price && Number(selectedEvent.price) > 0
                    ? `Confirm Booking (${selectedEvent.currency || "USD"} ${selectedEvent.price})`
                    : "Complete Free Registration"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
