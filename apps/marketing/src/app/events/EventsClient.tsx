"use client";

import React, { useState, useEffect, useMemo } from "react";
import Image from "next/image";
import Link from "next/link";
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
  Share2,
  Check,
  CreditCard,
  ExternalLink,
  Printer,
  Copy,
  FileText,
  ShieldCheck,
} from "lucide-react";
import {
  getPublicEvents,
  checkoutEvent,
  verifyEventPayment,
  type EventItem,
  type CurrencyCode,
  type EventRegistrationItem,
} from "@/lib/api";
import { useUser } from "@/lib/auth";

function getDuration(start?: string | null, end?: string | null) {
  if (!start) return "Live Session";
  if (!end) return "Live Session";
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

function formatSchedule(start?: string | null, end?: string | null) {
  if (!start) return "Schedule TBA";
  try {
    const s = new Date(start);
    const dateStr = s.toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    const sTime = s.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
    if (!end) return `${dateStr} · ${sTime}`;
    const e = new Date(end);
    const eTime = e.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
    return `${dateStr} · ${sTime} – ${eTime}`;
  } catch {
    return `${start}${end ? ` – ${end}` : ""}`;
  }
}

function formatPrice(price: number, currency?: CurrencyCode | string) {
  if (price === 0) return "Free RSVP";
  const curr = currency || "USD";
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: curr,
      minimumFractionDigits: price % 1 === 0 ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(price);
  } catch {
    return `${curr} ${price}`;
  }
}


export default function EventsClient() {
  const user = useUser();
  const [events, setEvents] = useState<EventItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [locationFilter, setLocationFilter] = useState<"ALL" | "ONLINE" | "PHYSICAL">("ALL");
  const [timeFilter, setTimeFilter] = useState<"upcoming" | "all">("upcoming");

  // Toast state
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Registration & Pay Now modal
  const [selectedEvent, setSelectedEvent] = useState<EventItem | null>(null);
  const [attendeeName, setAttendeeName] = useState("");
  const [attendeeEmail, setAttendeeEmail] = useState("");
  const [attendeePhone, setAttendeePhone] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [modalFeedback, setModalFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [confirmedRegistration, setConfirmedRegistration] = useState<EventRegistrationItem | null>(null);
  const [unlockedMeetingLink, setUnlockedMeetingLink] = useState<string | null>(null);
  const [registeredEventIds, setRegisteredEventIds] = useState<Set<string>>(new Set());
  const [copiedLink, setCopiedLink] = useState(false);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((cur) => (cur === msg ? null : cur));
    }, 3500);
  };

  useEffect(() => {
    try {
      const ids = new Set<string>();
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith("wbm_reg_")) {
          ids.add(key.replace("wbm_reg_", ""));
        }
      }
      setRegisteredEventIds(ids);
    } catch {}
  }, []);

  useEffect(() => {
    let mounted = true;
    async function load() {
      setIsLoading(true);
      try {
        const data = await getPublicEvents({
          locationType: locationFilter !== "ALL" ? locationFilter : undefined,
          upcoming: timeFilter === "upcoming",
        });
        if (mounted) {
          setEvents(Array.isArray(data) ? data : []);
        }
      } catch (err) {
        console.error("Failed to load events:", err);
        if (mounted) setEvents([]);
      } finally {
        if (mounted) setIsLoading(false);
      }
    }
    load();
    return () => {
      mounted = false;
    };
  }, [locationFilter, timeFilter]);

  // Pre-fill user details if logged in
  useEffect(() => {
    if (user && selectedEvent) {
      if (!attendeeName && user.name) setAttendeeName(user.name);
      if (!attendeeEmail && user.email) setAttendeeEmail(user.email);
    }
  }, [user, selectedEvent, attendeeName, attendeeEmail]);

  const filteredEvents = useMemo(() => {
    const list = Array.isArray(events) ? events : [];
    return list.filter((ev) => {
      const q = searchQuery.toLowerCase().trim();
      if (!q) return true;
      const matchTitle = (ev.title || "").toLowerCase().includes(q);
      const matchDesc = (ev.description || "").toLowerCase().includes(q);
      const matchLoc = ev.venueName
        ? ev.venueName.toLowerCase().includes(q)
        : ev.location
        ? ev.location.toLowerCase().includes(q)
        : false;
      return matchTitle || matchDesc || matchLoc;
    });
  }, [events, searchQuery]);

  const handleShare = async (e: React.MouseEvent, ev: EventItem) => {
    e.stopPropagation();
    const shareUrl = `${window.location.origin}/events/${ev.slug || ev.id}`;
    if (navigator.share) {
      try {
        await navigator.share({
          title: ev.title,
          text: `Register for ${ev.title} on WhatBoutMe!`,
          url: shareUrl,
        });
        return;
      } catch {
        // Fallback to clipboard
      }
    }

    try {
      await navigator.clipboard.writeText(shareUrl);
      showToast("Shareable event link copied to clipboard!");
    } catch {
      showToast("Unable to copy link.");
    }
  };

  const openCheckoutModal = (ev: EventItem) => {
    setSelectedEvent(ev);
    setModalFeedback(null);
    setCopiedLink(false);

    let savedReg: EventRegistrationItem | null = null;
    try {
      const stored = localStorage.getItem(`wbm_reg_${ev.id}`);
      if (stored) savedReg = JSON.parse(stored);
    } catch {}

    if (ev.registeredByMe || savedReg || registeredEventIds.has(ev.id)) {
      setConfirmedRegistration(
        savedReg || {
          id: `CONFIRMED-${ev.id.slice(0, 8)}`,
          eventId: ev.id,
          attendeeName: user?.name || "Registered Learner",
          attendeeEmail: user?.email || attendeeEmail || "Verified Attendee",
          attendeePhone: attendeePhone || "",
          amount: ev.price,
          currency: ev.currency,
          paymentStatus: "PAID",
          createdAt: new Date().toISOString(),
        }
      );
      setUnlockedMeetingLink(savedReg?.meetingLink || ev.meetingLink || null);
      return;
    }

    setConfirmedRegistration(null);
    setUnlockedMeetingLink(null);
    if (user) {
      if (!attendeeName && user.name) setAttendeeName(user.name);
      if (!attendeeEmail && user.email) setAttendeeEmail(user.email);
    }
  };

  const closeCheckoutModal = () => {
    setSelectedEvent(null);
    setConfirmedRegistration(null);
    setUnlockedMeetingLink(null);
    setModalFeedback(null);
    setCopiedLink(false);
  };

  const handlePayNowSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEvent) return;

    if (!attendeeName.trim() || !attendeeEmail.trim() || !attendeePhone.trim()) {
      setModalFeedback({
        type: "error",
        message: "Please fill in your full name, email address, and mobile number.",
      });
      return;
    }

    setIsSubmitting(true);
    setModalFeedback(null);

    try {
      // Step A: Initiate checkout (creates PENDING registration or returns alreadyRegistered)
      const checkoutRes = await checkoutEvent(selectedEvent.slug || selectedEvent.id, {
        attendeeName: attendeeName.trim(),
        attendeeEmail: attendeeEmail.trim().toLowerCase(),
        attendeePhone: attendeePhone.trim(),
      });

      // If user is already registered for this event
      if (checkoutRes.alreadyRegistered && checkoutRes.registration) {
        setConfirmedRegistration(checkoutRes.registration);
        const link = checkoutRes.meetingLink || checkoutRes.event?.meetingLink || selectedEvent.meetingLink || null;
        if (link) setUnlockedMeetingLink(link);

        try {
          localStorage.setItem(`wbm_reg_${selectedEvent.id}`, JSON.stringify(checkoutRes.registration));
        } catch {}
        setRegisteredEventIds((prev) => new Set(prev).add(selectedEvent.id));
        setEvents((prev) =>
          prev.map((item) => (item.id === selectedEvent.id ? { ...item, registeredByMe: true } : item))
        );
        showToast("You are already registered for this event! Here is your invoice & link.");
        return;
      }

      // If free RSVP
      if (checkoutRes.status === "PAID" && checkoutRes.registration) {
        setConfirmedRegistration(checkoutRes.registration);
        const link = checkoutRes.meetingLink || checkoutRes.event?.meetingLink || selectedEvent.meetingLink || null;
        if (link) setUnlockedMeetingLink(link);

        try {
          localStorage.setItem(`wbm_reg_${selectedEvent.id}`, JSON.stringify(checkoutRes.registration));
        } catch {}
        setRegisteredEventIds((prev) => new Set(prev).add(selectedEvent.id));
        setEvents((prev) =>
          prev.map((item) =>
            item.id === selectedEvent.id
              ? {
                  ...item,
                  seatsBooked: item.seatsBooked + 1,
                  seatsRemaining:
                    item.seatLimit !== null && item.seatLimit !== undefined
                      ? Math.max(0, item.seatLimit - (item.seatsBooked + 1))
                      : null,
                  registeredByMe: true,
                }
              : item
          )
        );
        showToast("Free registration confirmed!");
        return;
      }

      // Step B: Payment Verification (Simulated mode for testing, bypassing live gateway)
      const simulatedPaymentId = `sim_pay_${Date.now()}`;
      const verifyRes = await verifyEventPayment({
        registrationId: checkoutRes.registrationId,
        gatewayOrderId: checkoutRes.orderId || `sim_ord_${Date.now()}`,
        gatewayPaymentId: simulatedPaymentId,
        isSimulated: true,
      });

      const confirmed: EventRegistrationItem = verifyRes.registration || {
        id: checkoutRes.registrationId,
        eventId: selectedEvent.id,
        attendeeName: attendeeName.trim(),
        attendeeEmail: attendeeEmail.trim().toLowerCase(),
        attendeePhone: attendeePhone.trim(),
        amount: selectedEvent.price,
        currency: selectedEvent.currency,
        gatewayOrderId: checkoutRes.orderId,
        gatewayPaymentId: simulatedPaymentId,
        paymentStatus: "PAID",
        createdAt: new Date().toISOString(),
      };

      setConfirmedRegistration(confirmed);
      const meetingLink = verifyRes.meetingLink || verifyRes.event?.meetingLink || selectedEvent.meetingLink || null;
      if (meetingLink) {
        setUnlockedMeetingLink(meetingLink);
      }

      try {
        localStorage.setItem(`wbm_reg_${selectedEvent.id}`, JSON.stringify(confirmed));
      } catch {}
      setRegisteredEventIds((prev) => new Set(prev).add(selectedEvent.id));

      // Increment booked seats locally
      setEvents((prev) =>
        prev.map((item) =>
          item.id === selectedEvent.id
            ? {
                ...item,
                seatsBooked: item.seatsBooked + 1,
                seatsRemaining:
                  item.seatLimit !== null && item.seatLimit !== undefined
                    ? Math.max(0, item.seatLimit - (item.seatsBooked + 1))
                    : null,
                registeredByMe: true,
              }
            : item
        )
      );
      showToast("Payment & Booking Confirmed!");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Payment checkout failed. Please try again.";
      setModalFeedback({ type: "error", message: msg });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="relative mx-auto max-w-[1240px] px-5 pb-24 pt-6 md:px-10 md:pb-32">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-xl bg-ink px-4 py-3 text-xs font-semibold text-cream shadow-2xl transition-all">
          <Check className="h-4 w-4 text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Controls Bar: Type tabs + Search + Time toggle */}
      <div className="mb-10 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        {/* Format pills */}
        <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Event format selector">
          <button
            type="button"
            id="tab-all-formats"
            onClick={() => setLocationFilter("ALL")}
            className={`rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-wider transition-all sm:text-sm ${
              locationFilter === "ALL"
                ? "bg-ink text-cream shadow-sm"
                : "bg-cream-deep/70 text-ink-soft hover:bg-cream-deep hover:text-ink"
            }`}
          >
            All Sessions
          </button>
          <button
            type="button"
            id="tab-online"
            onClick={() => setLocationFilter("ONLINE")}
            className={`rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-wider transition-all sm:text-sm ${
              locationFilter === "ONLINE"
                ? "bg-ink text-cream shadow-sm"
                : "bg-cream-deep/70 text-ink-soft hover:bg-cream-deep hover:text-ink"
            }`}
          >
            🟢 Online Live
          </button>
          <button
            type="button"
            id="tab-physical"
            onClick={() => setLocationFilter("PHYSICAL")}
            className={`rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-wider transition-all sm:text-sm ${
              locationFilter === "PHYSICAL"
                ? "bg-ink text-cream shadow-sm"
                : "bg-cream-deep/70 text-ink-soft hover:bg-cream-deep hover:text-ink"
            }`}
          >
            📍 In-Person Workshops
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
              placeholder="Search by title or venue..."
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
              All Events
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
          <h3 className="text-xl font-bold text-ink">No sessions match your search</h3>
          <p className="mx-auto mt-2 max-w-md text-sm text-ink-soft">
            {searchQuery
              ? `No sessions found matching "${searchQuery}". Try a different keyword.`
              : "Check back soon for upcoming masterclasses and workshops with Roweena Britto."}
          </p>
          {(searchQuery || locationFilter !== "ALL" || timeFilter !== "upcoming") && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery("");
                setLocationFilter("ALL");
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
            const startIso = ev.startDateTime || ev.startAt;
            const endIso = ev.endDateTime || ev.endAt;
            const duration = getDuration(startIso, endIso);
            const schedule = formatSchedule(startIso, endIso);
            const isOnline = ev.locationType === "ONLINE";
            const isPast = endIso ? new Date(endIso).getTime() < Date.now() : false;
            const isFull = ev.isSoldOut || (ev.seatLimit && ev.seatsBooked >= ev.seatLimit);
            const canRegister = ev.isPublished && !isPast && !isFull;
            const banner = ev.bannerUrl || ev.coverImageUrl;

            return (
              <article
                key={ev.id}
                className="group flex flex-col justify-between overflow-hidden rounded-2xl border border-sand/70 bg-white/80 p-5 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-gold/60 hover:shadow-md"
              >
                <div>
                  {/* Cover image or gradient header */}
                  <div className="relative mb-4 h-48 w-full overflow-hidden rounded-xl bg-gradient-to-tr from-warm-sand/80 to-cream-deep">
                    {banner ? (
                      <Image
                        src={banner}
                        alt={ev.title}
                        fill
                        className="object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                    ) : (
                      <div className="flex h-full w-full flex-col items-center justify-center p-6 text-center">
                        <Sparkles className="mb-2 h-8 w-8 text-gold-deep/60" />
                        <span className="text-xs font-semibold uppercase tracking-widest text-ink-soft">
                          {isOnline ? "Virtual Interactive Session" : "In-Person Masterclass"}
                        </span>
                      </div>
                    )}

                    {/* Top badging */}
                    <div className="absolute left-3 top-3 flex items-center gap-1.5">
                      <span
                        className={`rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider shadow-sm backdrop-blur-md ${
                          isOnline ? "bg-emerald-600/90 text-white" : "bg-gold-deep text-white"
                        }`}
                      >
                        {isOnline ? "🟢 Online" : "📍 In-Person"}
                      </span>
                    </div>

                    <div className="absolute right-3 top-3">
                      <span className="rounded-full bg-ink/80 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-cream shadow-sm backdrop-blur-md">
                        {formatPrice(ev.price, ev.currency)}
                      </span>
                    </div>
                  </div>

                  {/* Title & Description */}
                  <Link href={`/events/${ev.slug || ev.id}`} className="block">
                    <h3 className="line-clamp-2 text-lg font-bold leading-snug tracking-tight text-ink transition-colors group-hover:text-gold-deep">
                      {ev.title}
                    </h3>
                  </Link>
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
                      {isOnline ? (
                        <>
                          <Video className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                          <span className="text-emerald-700 font-medium">
                            Live online session (link emailed after payment)
                          </span>
                        </>
                      ) : (
                        <>
                          <MapPin className="h-3.5 w-3.5 shrink-0 text-gold-deep" />
                          <span className="truncate">
                            {ev.venueName ? `${ev.venueName} · ` : ""}
                            {ev.venueAddress || ev.location || "Venue details provided upon booking"}
                          </span>
                        </>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <Users className="h-3.5 w-3.5 shrink-0 text-gold-deep" />
                      <span>
                        {ev.seatLimit
                          ? `${ev.seatsBooked} / ${ev.seatLimit} seats filled (${ev.seatsRemaining ?? Math.max(0, ev.seatLimit - ev.seatsBooked)} remaining)`
                          : `${ev.seatsBooked} attendees registered (open capacity)`}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Card Action & Share Row */}
                <div className="mt-6 border-t border-sand/40 pt-4 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={(e) => handleShare(e, ev)}
                    className="flex items-center justify-center gap-1.5 rounded-xl border border-sand bg-cream-deep/50 px-3 py-2.5 text-xs font-semibold text-ink transition hover:bg-cream-deep hover:text-gold-deep"
                    title="Share Event Link"
                    aria-label="Share Event Link"
                  >
                    <Share2 className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Share Event Link</span>
                  </button>

                  {ev.registeredByMe || registeredEventIds.has(ev.id) ? (
                    <button
                      type="button"
                      id={`btn-view-ticket-${ev.id}`}
                      onClick={() => openCheckoutModal(ev)}
                      className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-700 py-2.5 text-xs font-semibold uppercase tracking-wider text-white shadow-sm transition hover:bg-emerald-800"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-200" />
                      <span>Ticket Confirmed (View Invoice)</span>
                    </button>
                  ) : canRegister ? (
                    <button
                      type="button"
                      id={`btn-register-${ev.id}`}
                      onClick={() => openCheckoutModal(ev)}
                      className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-ink py-2.5 text-xs font-semibold uppercase tracking-wider text-cream shadow-sm transition hover:bg-gold-deep hover:text-white"
                    >
                      <span>
                        {ev.price === 0 ? "Reserve Free Pass" : `Pay Now — ${formatPrice(ev.price, ev.currency)}`}
                      </span>
                      <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled
                      className="flex-1 rounded-xl bg-sand/40 py-2.5 text-center text-xs font-medium text-ink-soft/70 cursor-not-allowed"
                    >
                      {isPast ? "Session Concluded" : isFull ? "Sold Out" : "Registration Closed"}
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Pay Now / Registration Modal */}
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
              onClick={closeCheckoutModal}
              className="absolute right-5 top-5 rounded-full p-2 text-ink-soft transition hover:bg-sand/40 hover:text-ink"
              aria-label="Close dialog"
            >
              <X className="h-5 w-5" />
            </button>

            {confirmedRegistration ? (
              <div className="py-2 text-center">
                <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 shadow-sm">
                  <CheckCircle2 className="h-7 w-7" />
                </div>
                <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-emerald-800 border border-emerald-200 mb-2">
                  <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                  <span>Confirmed &amp; Secured · Cannot Pay Twice</span>
                </div>
                <h3 className="text-xl font-bold tracking-tight text-ink md:text-2xl">
                  {selectedEvent.price === 0 ? "Registration Confirmed!" : "Payment & Registration Confirmed!"}
                </h3>
                <p className="mt-1 text-xs text-ink-soft">
                  Attendee: <strong className="text-ink">{confirmedRegistration.attendeeName}</strong> ({confirmedRegistration.attendeeEmail})
                </p>

                {/* Official Tax Invoice & Booking Summary Box */}
                <div className="mt-5 overflow-hidden rounded-2xl border border-sand bg-white shadow-sm text-left text-xs">
                  {/* Invoice Header */}
                  <div className="border-b border-sand/60 bg-cream-deep/40 px-4 py-3 flex flex-wrap justify-between items-center gap-2">
                    <div>
                      <span className="font-bold text-ink block text-[13px]">Booking Receipt &amp; Invoice</span>
                      <span className="text-[11px] text-ink-soft">
                        Ref: <strong className="font-mono text-ink">#BK-{confirmedRegistration.id.slice(0, 8).toUpperCase()}</strong>
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="inline-block rounded-md bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                        STATUS: PAID
                      </span>
                      <span className="text-[10px] text-ink-soft block mt-0.5">
                        Inv #{confirmedRegistration.gatewayOrderId || `INV-${confirmedRegistration.id.slice(0, 6).toUpperCase()}`}
                      </span>
                    </div>
                  </div>

                  {/* Invoice Items Table */}
                  <div className="p-4 space-y-2.5">
                    <div className="flex justify-between items-start border-b border-sand/40 pb-2">
                      <div>
                        <p className="font-semibold text-ink text-[13px]">{selectedEvent.title}</p>
                        <p className="text-[11px] text-ink-soft mt-0.5">
                          {formatSchedule(selectedEvent.startDateTime || selectedEvent.startAt, selectedEvent.endDateTime || selectedEvent.endAt)}
                        </p>
                      </div>
                      <span className="font-bold text-ink text-sm">
                        {formatPrice(confirmedRegistration.amount, confirmedRegistration.currency)}
                      </span>
                    </div>

                    <div className="flex justify-between text-ink-soft text-[11px]">
                      <span>Platform &amp; Service Fee:</span>
                      <span className="font-medium text-emerald-700">Free ($0.00)</span>
                    </div>

                    <div className="flex justify-between items-center pt-1 border-t border-sand/40 text-sm">
                      <span className="font-bold text-ink">Total Amount Paid:</span>
                      <span className="font-extrabold text-ink text-base">
                        {formatPrice(confirmedRegistration.amount, confirmedRegistration.currency)}
                      </span>
                    </div>
                  </div>

                  {/* Access / Meeting Room Link Banner */}
                  <div className="border-t border-sand/60 bg-emerald-50/70 p-4">
                    {selectedEvent.locationType === "ONLINE" ? (
                      <div className="space-y-2.5">
                        <div className="flex items-center gap-2 text-emerald-900 font-bold text-xs">
                          <Video className="h-4 w-4 text-emerald-600" />
                          <span>Live Virtual Session Access Link</span>
                        </div>

                        {unlockedMeetingLink ? (
                          <div className="space-y-2">
                            <div className="flex items-center gap-2">
                              <a
                                href={unlockedMeetingLink}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-emerald-800 transition"
                              >
                                <Video className="h-4 w-4" />
                                <span>Join Online Session</span>
                                <ExternalLink className="h-3.5 w-3.5" />
                              </a>
                              <button
                                type="button"
                                onClick={() => {
                                  if (unlockedMeetingLink) {
                                    navigator.clipboard.writeText(unlockedMeetingLink);
                                    setCopiedLink(true);
                                    setTimeout(() => setCopiedLink(false), 2500);
                                  }
                                }}
                                className="flex items-center gap-1.5 rounded-xl border border-emerald-300 bg-white px-3 py-2.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 transition"
                                title="Copy Meeting Link"
                              >
                                {copiedLink ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                                <span>{copiedLink ? "Copied" : "Copy Link"}</span>
                              </button>
                            </div>
                            <p className="text-[11px] text-emerald-800 break-all font-mono bg-white/70 p-2 rounded-lg border border-emerald-200/80">
                              {unlockedMeetingLink}
                            </p>
                          </div>
                        ) : (
                          <p className="text-xs text-emerald-800">
                            Your private session access link is reserved and sent to <strong>{confirmedRegistration.attendeeEmail}</strong>.
                          </p>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-3 text-ink">
                        <span className="font-bold text-xs flex items-center gap-1.5 text-ink">
                          <MapPin className="h-4 w-4 text-gold-deep" />
                          <span>Venue Admission Pass</span>
                        </span>
                        <p className="font-semibold text-xs mt-1">
                          {selectedEvent.venueName ? `${selectedEvent.venueName} — ` : ""}
                          {selectedEvent.venueAddress || selectedEvent.location}
                        </p>
                        <div className="flex flex-col items-center justify-center p-3 bg-white rounded-xl border border-sand">
                          <span className="text-[11px] font-bold text-ink uppercase tracking-wider mb-2">Express Check-in QR Pass</span>
                          <img
                            src={`https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent(`whatboutme://checkin/event/${selectedEvent.id}/reg/${confirmedRegistration.id}`)}`}
                            alt="Check-in QR Code"
                            width={140}
                            height={140}
                            className="rounded-lg shadow-sm"
                          />
                          <span className="text-[10px] text-ink-soft mt-1.5">Present at door for instant attendance check-in</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Modal Footer Actions */}
                <div className="mt-5 flex flex-wrap justify-center items-center gap-3">
                  <button
                    type="button"
                    onClick={() => window.print()}
                    className="inline-flex items-center gap-1.5 rounded-full border border-sand bg-white px-5 py-2 text-xs font-semibold text-ink shadow-sm hover:bg-cream-deep transition"
                  >
                    <Printer className="h-3.5 w-3.5" />
                    <span>Print Invoice</span>
                  </button>
                  <button
                    type="button"
                    onClick={closeCheckoutModal}
                    className="rounded-full bg-ink px-8 py-2 text-xs font-semibold uppercase tracking-wider text-cream transition hover:bg-gold-deep hover:text-white"
                  >
                    Done
                  </button>
                </div>
                <p className="mt-3 text-[11px] text-ink-soft">
                  🔒 You are officially registered. Further duplicate payments for this event are blocked.
                </p>
              </div>
            ) : (
              <div>
                <div className="mb-6">
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                        selectedEvent.locationType === "ONLINE"
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-amber-100 text-amber-800"
                      }`}
                    >
                      {selectedEvent.locationType === "ONLINE" ? "Online Session" : "In-Person Workshop"}
                    </span>
                    <span className="text-xs font-bold text-gold-deep">
                      {formatPrice(selectedEvent.price, selectedEvent.currency)}
                    </span>
                  </div>

                  <h3 id="modal-event-title" className="mt-2 text-xl font-bold tracking-tight text-ink md:text-2xl">
                    {selectedEvent.title}
                  </h3>
                  <p className="mt-1 text-xs text-ink-soft">
                    {formatSchedule(
                      selectedEvent.startDateTime || selectedEvent.startAt,
                      selectedEvent.endDateTime || selectedEvent.endAt
                    )}
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

                <form onSubmit={handlePayNowSubmit} className="space-y-4">
                  <div>
                    <label htmlFor="reg-name" className="block text-xs font-semibold text-ink mb-1">
                      Full Name *
                    </label>
                    <input
                      id="reg-name"
                      type="text"
                      required
                      value={attendeeName}
                      onChange={(e) => setAttendeeName(e.target.value)}
                      placeholder="e.g. Jane Doe"
                      className="w-full rounded-xl border border-sand bg-white px-3.5 py-2.5 text-xs text-ink outline-none transition focus:border-gold focus:ring-1 focus:ring-gold"
                    />
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label htmlFor="reg-email" className="block text-xs font-semibold text-ink mb-1">
                        Email Address (for ticket &amp; link) *
                      </label>
                      <input
                        id="reg-email"
                        type="email"
                        required
                        value={attendeeEmail}
                        onChange={(e) => setAttendeeEmail(e.target.value)}
                        placeholder="jane@example.com"
                        className="w-full rounded-xl border border-sand bg-white px-3.5 py-2.5 text-xs text-ink outline-none transition focus:border-gold focus:ring-1 focus:ring-gold"
                      />
                    </div>

                    <div>
                      <label htmlFor="reg-phone" className="block text-xs font-semibold text-ink mb-1">
                        Mobile Number *
                      </label>
                      <input
                        id="reg-phone"
                        type="tel"
                        required
                        value={attendeePhone}
                        onChange={(e) => setAttendeePhone(e.target.value)}
                        placeholder="+971 50 123 4567"
                        className="w-full rounded-xl border border-sand bg-white px-3.5 py-2.5 text-xs text-ink outline-none transition focus:border-gold focus:ring-1 focus:ring-gold"
                      />
                    </div>
                  </div>

                  {/* Summary Box */}
                  <div className="rounded-xl border border-sand bg-white/60 p-3 text-xs text-ink-soft space-y-1">
                    <div className="flex justify-between">
                      <span>Registration Amount:</span>
                      <span className="font-bold text-ink">
                        {formatPrice(selectedEvent.price, selectedEvent.currency)}
                      </span>
                    </div>
                    <div className="flex justify-between text-[11px]">
                      <span>Access Details:</span>
                      <span>
                        {selectedEvent.locationType === "ONLINE"
                          ? "Meeting URL sent to inbox"
                          : "Hall pass emailed"}
                      </span>
                    </div>
                  </div>

                  <div className="pt-2">
                    <button
                      type="submit"
                      id="btn-submit-pay-now"
                      disabled={isSubmitting}
                      className="flex w-full items-center justify-center gap-2 rounded-full bg-ink py-3 text-xs font-bold uppercase tracking-wider text-cream shadow-md transition hover:bg-gold-deep hover:text-white disabled:opacity-50"
                    >
                      <CreditCard className="h-4 w-4" />
                      {isSubmitting
                        ? "Processing Payment..."
                        : selectedEvent.price === 0
                        ? "Confirm Free Reservation"
                        : `Pay Now — ${formatPrice(selectedEvent.price, selectedEvent.currency)}`}
                    </button>
                    <p className="mt-2 text-center text-[11px] text-ink-soft">
                      🔒 Secure 256-bit encrypted checkout. Instant confirmation &amp; calendar invite.
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
