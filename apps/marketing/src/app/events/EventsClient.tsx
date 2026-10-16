"use client";

import React, { useState, useEffect, useMemo } from "react";
import Image from "next/image";
import {
  Calendar,
  Clock,
  MapPin,
  Video,
  Users,
  Search,
  CheckCircle2,
  AlertCircle,
  X,
  Sparkles,
  ArrowRight,
  Filter,
} from "lucide-react";
import {
  getPublicEvents,
  registerForEvent,
  type EventItem,
  type RegisterEventPayload,
} from "@/lib/api";
import { useUser } from "@/lib/auth";

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
    return `${dateStr} · ${sTime} – ${eTime}`;
  } catch {
    return `${start} – ${end}`;
  }
}

export default function EventsClient() {
  const user = useUser();
  const [events, setEvents] = useState<EventItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<"ALL" | "EVENT" | "WEBINAR">("ALL");
  const [timeFilter, setTimeFilter] = useState<"upcoming" | "all">("upcoming");

  // Registration modal
  const [selectedEvent, setSelectedEvent] = useState<EventItem | null>(null);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [category, setCategory] = useState("PROFESSIONAL");
  const [categoryOther, setCategoryOther] = useState("");
  const [organization, setOrganization] = useState("");
  const [designation, setDesignation] = useState("");
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [modalFeedback, setModalFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [registeredSuccess, setRegisteredSuccess] = useState<boolean>(false);

  useEffect(() => {
    let mounted = true;
    async function load() {
      setIsLoading(true);
      try {
        const data = await getPublicEvents({
          type: typeFilter !== "ALL" ? typeFilter : undefined,
          upcoming: timeFilter === "upcoming",
        });
        if (mounted) {
          setEvents(data);
        }
      } catch (err) {
        console.error("Failed to load events:", err);
      } finally {
        if (mounted) setIsLoading(false);
      }
    }
    load();
    return () => {
      mounted = false;
    };
  }, [typeFilter, timeFilter]);

  // Pre-fill user details if logged in
  useEffect(() => {
    if (user && selectedEvent) {
      if (!fullName && user.name) setFullName(user.name);
      if (!email && user.email) setEmail(user.email);
    }
  }, [user, selectedEvent, fullName, email]);

  const filteredEvents = useMemo(() => {
    return events.filter((ev) => {
      const q = searchQuery.toLowerCase().trim();
      if (!q) return true;
      const matchTitle = ev.title.toLowerCase().includes(q);
      const matchDesc = ev.description.toLowerCase().includes(q);
      const matchLoc = ev.location ? ev.location.toLowerCase().includes(q) : false;
      return matchTitle || matchDesc || matchLoc;
    });
  }, [events, searchQuery]);

  const openRegisterModal = (ev: EventItem) => {
    setSelectedEvent(ev);
    setRegisteredSuccess(false);
    setModalFeedback(null);
    if (user) {
      if (user.name) setFullName(user.name);
      if (user.email) setEmail(user.email);
    }
  };

  const closeRegisterModal = () => {
    setSelectedEvent(null);
    setRegisteredSuccess(false);
    setModalFeedback(null);
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEvent) return;

    if (!fullName.trim() || !email.trim() || !phone.trim()) {
      setModalFeedback({ type: "error", message: "Please fill in your name, email address, and phone number." });
      return;
    }

    if (category === "OTHER" && !categoryOther.trim()) {
      setModalFeedback({ type: "error", message: "Please specify your category in the other field." });
      return;
    }

    setIsSubmitting(true);
    setModalFeedback(null);

    const payload: RegisterEventPayload = {
      fullName: fullName.trim(),
      email: email.trim().toLowerCase(),
      phone: phone.trim(),
      category,
      categoryOther: category === "OTHER" ? categoryOther.trim() : undefined,
      organization: organization.trim() || undefined,
      designation: designation.trim() || undefined,
      notes: notes.trim() || undefined,
    };

    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("wbm_token") || undefined : undefined;
      await registerForEvent(selectedEvent.id, payload, token);
      setRegisteredSuccess(true);
      // Update local registration count
      setEvents((prev) =>
        prev.map((item) =>
          item.id === selectedEvent.id
            ? { ...item, registrationCount: (item.registrationCount || 0) + 1, registeredByMe: true }
            : item
        )
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Registration failed. Please try again.";
      setModalFeedback({ type: "error", message: msg });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="relative mx-auto max-w-[1240px] px-5 pb-24 pt-6 md:px-10 md:pb-32">
      {/* Controls Bar: Type tabs + Search + Time toggle */}
      <div className="mb-10 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        {/* Type pills */}
        <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Event type selector">
          <button
            type="button"
            id="tab-all-types"
            onClick={() => setTypeFilter("ALL")}
            className={`rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-wider transition-all sm:text-sm ${
              typeFilter === "ALL"
                ? "bg-ink text-cream shadow-sm"
                : "bg-cream-deep/70 text-ink-soft hover:bg-cream-deep hover:text-ink"
            }`}
          >
            All Formats
          </button>
          <button
            type="button"
            id="tab-workshops"
            onClick={() => setTypeFilter("EVENT")}
            className={`rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-wider transition-all sm:text-sm ${
              typeFilter === "EVENT"
                ? "bg-ink text-cream shadow-sm"
                : "bg-cream-deep/70 text-ink-soft hover:bg-cream-deep hover:text-ink"
            }`}
          >
            Workshops &amp; In-Person
          </button>
          <button
            type="button"
            id="tab-webinars"
            onClick={() => setTypeFilter("WEBINAR")}
            className={`rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-wider transition-all sm:text-sm ${
              typeFilter === "WEBINAR"
                ? "bg-ink text-cream shadow-sm"
                : "bg-cream-deep/70 text-ink-soft hover:bg-cream-deep hover:text-ink"
            }`}
          >
            Online Webinars
          </button>
        </div>

        {/* Right controls: search & time filter */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft/70" />
            <input
              type="text"
              id="event-search-input"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by topic or venue..."
              className="w-full rounded-full border border-sand bg-white/70 py-2 pl-9 pr-4 text-sm text-ink outline-none transition focus:border-gold focus:bg-white focus:ring-1 focus:ring-gold sm:w-64"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-soft hover:text-ink"
                aria-label="Clear search"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <div className="inline-flex rounded-full border border-sand bg-white/50 p-0.5">
            <button
              type="button"
              id="filter-upcoming"
              onClick={() => setTimeFilter("upcoming")}
              className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition ${
                timeFilter === "upcoming" ? "bg-sand/60 font-semibold text-ink" : "text-ink-soft hover:text-ink"
              }`}
            >
              Upcoming
            </button>
            <button
              type="button"
              id="filter-all-time"
              onClick={() => setTimeFilter("all")}
              className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition ${
                timeFilter === "all" ? "bg-sand/60 font-semibold text-ink" : "text-ink-soft hover:text-ink"
              }`}
            >
              Archive
            </button>
          </div>
        </div>
      </div>

      {/* Loading Skeleton */}
      {isLoading && (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((n) => (
            <div
              key={n}
              className="animate-pulse rounded-2xl border border-sand/60 bg-white/60 p-6 shadow-sm backdrop-blur-sm"
            >
              <div className="mb-4 h-44 w-full rounded-xl bg-sand/40" />
              <div className="mb-3 h-6 w-3/4 rounded bg-sand/50" />
              <div className="mb-2 h-4 w-1/2 rounded bg-sand/30" />
              <div className="h-16 w-full rounded bg-sand/20" />
            </div>
          ))}
        </div>
      )}

      {/* Empty State */}
      {!isLoading && filteredEvents.length === 0 && (
        <div className="rounded-3xl border border-dashed border-sand bg-white/40 px-6 py-16 text-center">
          <Calendar className="mx-auto mb-4 h-12 w-12 text-ink-soft/40" />
          <h3 className="text-xl font-bold text-ink">No events match your criteria</h3>
          <p className="mx-auto mt-2 max-w-md text-sm text-ink-soft">
            {searchQuery
              ? `No sessions found matching "${searchQuery}". Try a different keyword.`
              : "Check back soon for upcoming masterclasses and workshops with Roweena Britto."}
          </p>
          {(searchQuery || typeFilter !== "ALL" || timeFilter !== "upcoming") && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery("");
                setTypeFilter("ALL");
                setTimeFilter("upcoming");
              }}
              className="mt-6 rounded-full bg-ink px-6 py-2.5 text-xs font-semibold uppercase tracking-wider text-cream transition hover:bg-ink/90"
            >
              Reset Filters
            </button>
          )}
        </div>
      )}

      {/* Events Grid */}
      {!isLoading && filteredEvents.length > 0 && (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {filteredEvents.map((ev) => {
            const isWebinar = ev.type === "WEBINAR";
            const duration = getDuration(ev.startAt, ev.endAt);
            const schedule = formatSchedule(ev.startAt, ev.endAt);
            const isPast = new Date(ev.endAt).getTime() < Date.now();
            const isFull =
              ev.maxRegistrations !== null &&
              ev.maxRegistrations !== undefined &&
              ev.registrationCount >= ev.maxRegistrations;
            const canRegister =
              (ev.status === "REGISTRATION_OPEN" || ev.status === "SCHEDULED") && !isPast && !isFull;

            return (
              <article
                key={ev.id}
                className="group flex flex-col justify-between overflow-hidden rounded-2xl border border-sand/70 bg-white/80 p-5 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-gold/60 hover:shadow-md"
              >
                <div>
                  {/* Cover image or gradient header */}
                  <div className="relative mb-4 h-48 w-full overflow-hidden rounded-xl bg-gradient-to-tr from-warm-sand/80 to-cream-deep">
                    {ev.coverImageUrl ? (
                      <Image
                        src={ev.coverImageUrl}
                        alt={ev.title}
                        fill
                        className="object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                    ) : (
                      <div className="flex h-full w-full flex-col items-center justify-center p-6 text-center">
                        <Sparkles className="mb-2 h-8 w-8 text-gold-deep/60" />
                        <span className="text-xs font-semibold uppercase tracking-widest text-ink-soft">
                          {isWebinar ? "Interactive Webinar" : "Live Workshop"}
                        </span>
                      </div>
                    )}

                    {/* Top badging */}
                    <div className="absolute left-3 top-3 flex items-center gap-1.5">
                      <span
                        className={`rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider shadow-sm backdrop-blur-md ${
                          isWebinar ? "bg-blue-600/90 text-white" : "bg-gold-deep text-white"
                        }`}
                      >
                        {isWebinar ? "Webinar" : "Event"}
                      </span>
                    </div>

                    <div className="absolute right-3 top-3">
                      <span
                        className={`rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider shadow-sm backdrop-blur-md ${
                          isPast
                            ? "bg-stone-600/80 text-white"
                            : isFull
                            ? "bg-rose-600/90 text-white"
                            : ev.status === "REGISTRATION_OPEN"
                            ? "bg-emerald-600/90 text-white"
                            : "bg-amber-600/90 text-white"
                        }`}
                      >
                        {isPast
                          ? "Ended"
                          : isFull
                          ? "Full"
                          : ev.status === "REGISTRATION_OPEN"
                          ? "Open"
                          : "Scheduled"}
                      </span>
                    </div>
                  </div>

                  {/* Title & Description */}
                  <h3 className="line-clamp-2 text-lg font-bold leading-snug tracking-tight text-ink transition-colors group-hover:text-gold-deep">
                    {ev.title}
                  </h3>
                  <p className="mt-2 line-clamp-3 text-xs leading-relaxed text-ink-soft">
                    {ev.description}
                  </p>

                  {/* Schedule & Location Details */}
                  <div className="mt-4 space-y-2 border-t border-sand/50 pt-3 text-xs text-ink-soft">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-3.5 w-3.5 shrink-0 text-gold-deep" />
                      <span className="font-medium text-ink">{schedule}</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <Clock className="h-3.5 w-3.5 shrink-0 text-gold-deep" />
                      <span>Duration: {duration}</span>
                    </div>

                    <div className="flex items-center gap-2">
                      {isWebinar ? (
                        <>
                          <Video className="h-3.5 w-3.5 shrink-0 text-gold-deep" />
                          <span>Online interactive Zoom session</span>
                        </>
                      ) : (
                        <>
                          <MapPin className="h-3.5 w-3.5 shrink-0 text-gold-deep" />
                          <span className="truncate">{ev.location || "Venue details sent upon registration"}</span>
                        </>
                      )}
                    </div>

                    {ev.maxRegistrations && (
                      <div className="flex items-center gap-2">
                        <Users className="h-3.5 w-3.5 shrink-0 text-gold-deep" />
                        <span>
                          {ev.registrationCount} / {ev.maxRegistrations} seats reserved
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Card Action */}
                <div className="mt-6 border-t border-sand/40 pt-4">
                  {canRegister ? (
                    <button
                      type="button"
                      id={`btn-register-${ev.id}`}
                      onClick={() => openRegisterModal(ev)}
                      className="flex w-full items-center justify-center gap-2 rounded-xl bg-ink py-2.5 text-xs font-semibold uppercase tracking-wider text-cream shadow-sm transition hover:bg-gold-deep hover:text-white"
                    >
                      Reserve Free Pass
                      <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled
                      className="w-full rounded-xl bg-sand/40 py-2.5 text-center text-xs font-medium text-ink-soft/70 cursor-not-allowed"
                    >
                      {isPast ? "Session Concluded" : isFull ? "Fully Booked" : "Registration Closed"}
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Registration Modal */}
      {selectedEvent && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-event-title"
          className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm"
        >
          <div className="relative w-full max-w-xl rounded-3xl border border-sand bg-cream p-6 shadow-2xl md:p-8">
            <button
              type="button"
              onClick={closeRegisterModal}
              className="absolute right-5 top-5 rounded-full p-2 text-ink-soft transition hover:bg-sand/40 hover:text-ink"
              aria-label="Close dialog"
            >
              <X className="h-5 w-5" />
            </button>

            {registeredSuccess ? (
              <div className="py-6 text-center">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                  <CheckCircle2 className="h-8 w-8" />
                </div>
                <h3 className="text-2xl font-bold tracking-tight text-ink">Registration Confirmed!</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-soft">
                  Thank you for registering for{" "}
                  <strong className="text-ink">{selectedEvent.title}</strong>. A confirmation email with
                  your session access details and calendar invite has been sent to{" "}
                  <strong className="text-ink">{email}</strong>.
                </p>
                <div className="mt-6 rounded-2xl border border-sand bg-white/70 p-4 text-left text-xs space-y-1.5 text-ink-soft">
                  <p>
                    <strong className="text-ink">Format:</strong>{" "}
                    {selectedEvent.type === "WEBINAR" ? "Live Online Webinar" : "In-Person Event"}
                  </p>
                  <p>
                    <strong className="text-ink">Schedule:</strong>{" "}
                    {formatSchedule(selectedEvent.startAt, selectedEvent.endAt)}
                  </p>
                  {selectedEvent.location && (
                    <p>
                      <strong className="text-ink">Location:</strong> {selectedEvent.location}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={closeRegisterModal}
                  className="mt-6 rounded-full bg-ink px-8 py-2.5 text-xs font-semibold uppercase tracking-wider text-cream transition hover:bg-gold-deep hover:text-white"
                >
                  Done
                </button>
              </div>
            ) : (
              <div>
                <div className="mb-6">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-gold-deep">
                    {selectedEvent.type === "WEBINAR" ? "Online Webinar Registration" : "Workshop Registration"}
                  </span>
                  <h3 id="modal-event-title" className="mt-1 text-xl font-bold tracking-tight text-ink md:text-2xl">
                    {selectedEvent.title}
                  </h3>
                  <p className="mt-1 text-xs text-ink-soft">
                    {formatSchedule(selectedEvent.startAt, selectedEvent.endAt)}
                  </p>
                </div>

                {modalFeedback && (
                  <div
                    className={`mb-4 flex items-start gap-2.5 rounded-xl p-3 text-xs ${
                      modalFeedback.type === "error"
                        ? "bg-rose-50 text-rose-700 border border-rose-200"
                        : "bg-emerald-50 text-emerald-700 border border-emerald-200"
                    }`}
                  >
                    <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>{modalFeedback.message}</span>
                  </div>
                )}

                <form onSubmit={handleRegisterSubmit} className="space-y-4">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label htmlFor="reg-fullname" className="block text-xs font-semibold text-ink mb-1">
                        Full Name *
                      </label>
                      <input
                        id="reg-fullname"
                        type="text"
                        required
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        placeholder="Jane Doe"
                        className="w-full rounded-xl border border-sand bg-white px-3.5 py-2 text-xs text-ink outline-none transition focus:border-gold focus:ring-1 focus:ring-gold"
                      />
                    </div>

                    <div>
                      <label htmlFor="reg-email" className="block text-xs font-semibold text-ink mb-1">
                        Email Address *
                      </label>
                      <input
                        id="reg-email"
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="jane@example.com"
                        className="w-full rounded-xl border border-sand bg-white px-3.5 py-2 text-xs text-ink outline-none transition focus:border-gold focus:ring-1 focus:ring-gold"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label htmlFor="reg-phone" className="block text-xs font-semibold text-ink mb-1">
                        Mobile Number *
                      </label>
                      <input
                        id="reg-phone"
                        type="tel"
                        required
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="+971 50 123 4567"
                        className="w-full rounded-xl border border-sand bg-white px-3.5 py-2 text-xs text-ink outline-none transition focus:border-gold focus:ring-1 focus:ring-gold"
                      />
                    </div>

                    <div>
                      <label htmlFor="reg-category" className="block text-xs font-semibold text-ink mb-1">
                        Category *
                      </label>
                      <select
                        id="reg-category"
                        value={category}
                        onChange={(e) => setCategory(e.target.value)}
                        className="w-full rounded-xl border border-sand bg-white px-3.5 py-2 text-xs text-ink outline-none transition focus:border-gold focus:ring-1 focus:ring-gold"
                      >
                        {CATEGORIES.map((cat) => (
                          <option key={cat.value} value={cat.value}>
                            {cat.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {category === "OTHER" && (
                    <div>
                      <label htmlFor="reg-other" className="block text-xs font-semibold text-ink mb-1">
                        Please Specify Category *
                      </label>
                      <input
                        id="reg-other"
                        type="text"
                        required
                        value={categoryOther}
                        onChange={(e) => setCategoryOther(e.target.value)}
                        placeholder="Your occupation or background"
                        className="w-full rounded-xl border border-sand bg-white px-3.5 py-2 text-xs text-ink outline-none transition focus:border-gold focus:ring-1 focus:ring-gold"
                      />
                    </div>
                  )}

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label htmlFor="reg-org" className="block text-xs font-semibold text-ink mb-1">
                        Organization / University <span className="font-normal text-ink-soft">(Optional)</span>
                      </label>
                      <input
                        id="reg-org"
                        type="text"
                        value={organization}
                        onChange={(e) => setOrganization(e.target.value)}
                        placeholder="Company or institution"
                        className="w-full rounded-xl border border-sand bg-white px-3.5 py-2 text-xs text-ink outline-none transition focus:border-gold focus:ring-1 focus:ring-gold"
                      />
                    </div>

                    <div>
                      <label htmlFor="reg-role" className="block text-xs font-semibold text-ink mb-1">
                        Designation / Role <span className="font-normal text-ink-soft">(Optional)</span>
                      </label>
                      <input
                        id="reg-role"
                        type="text"
                        value={designation}
                        onChange={(e) => setDesignation(e.target.value)}
                        placeholder="e.g. Lead Strategist"
                        className="w-full rounded-xl border border-sand bg-white px-3.5 py-2 text-xs text-ink outline-none transition focus:border-gold focus:ring-1 focus:ring-gold"
                      />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="reg-notes" className="block text-xs font-semibold text-ink mb-1">
                      Notes or Questions for Roweena <span className="font-normal text-ink-soft">(Optional)</span>
                    </label>
                    <textarea
                      id="reg-notes"
                      rows={2}
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="What would you like to get out of this session?"
                      className="w-full rounded-xl border border-sand bg-white px-3.5 py-2 text-xs text-ink outline-none transition focus:border-gold focus:ring-1 focus:ring-gold"
                    />
                  </div>

                  <div className="pt-2">
                    <button
                      type="submit"
                      id="btn-submit-registration"
                      disabled={isSubmitting}
                      className="flex w-full items-center justify-center gap-2 rounded-full bg-ink py-3 text-xs font-bold uppercase tracking-wider text-cream shadow-md transition hover:bg-gold-deep hover:text-white disabled:opacity-50"
                    >
                      {isSubmitting ? "Securing Your Pass..." : "Confirm Free Registration"}
                    </button>
                    <p className="mt-2 text-center text-[11px] text-ink-soft">
                      No spam. We will only send your access credentials and reminder details.
                    </p>
                  </div>
                </form>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
