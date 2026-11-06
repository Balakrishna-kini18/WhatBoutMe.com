"use client";

import React, { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  Calendar,
  Clock,
  MapPin,
  Video,
  Users,
  CheckCircle2,
  AlertCircle,
  X,
  Share2,
  Check,
  CreditCard,
  ArrowLeft,
  ExternalLink,
  Printer,
  Copy,
} from "lucide-react";
import {
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
      weekday: "long",
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


export default function EventDetailClient({ initialEvent }: { initialEvent: EventItem }) {
  const user = useUser();
  const [event, setEvent] = useState<EventItem>(initialEvent);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
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
    } catch { }
  }, []);

  useEffect(() => {
    if (user) {
      if (!attendeeName && user.name) setAttendeeName(user.name);
      if (!attendeeEmail && user.email) setAttendeeEmail(user.email);
    }
  }, [user, attendeeName, attendeeEmail]);

  // Handle return from Stripe hosted checkout for paid events
  useEffect(() => {
    if (typeof window === "undefined") return;
    const urlParams = new URLSearchParams(window.location.search);
    const sessionId = urlParams.get("session_id");
    const regId = urlParams.get("registrationId");

    if (sessionId && regId) {
      setIsModalOpen(true);
      setIsSubmitting(true);
      verifyEventPayment({
        registrationId: regId,
        gatewayOrderId: sessionId,
        gatewayPaymentId: sessionId,
        isSimulated: false,
      })
        .then((verifyRes) => {
          if (verifyRes.registration) {
            setConfirmedRegistration(verifyRes.registration);
            const link = verifyRes.meetingLink || verifyRes.event?.meetingLink || event.meetingLink || null;
            if (link) setUnlockedMeetingLink(link);
            try {
              localStorage.setItem(`wbm_reg_${event.id}`, JSON.stringify(verifyRes.registration));
            } catch { }
            setRegisteredEventIds((prev) => new Set(prev).add(event.id));
            setEvent((prev) => ({ ...prev, registeredByMe: true }));
            showToast("Payment verified! Your event ticket is ready.");
          }
        })
        .catch((err) => {
          console.error("Event payment verification error:", err);
          showToast("Payment confirmation in progress. Check your email or try refreshing.");
        })
        .finally(() => {
          setIsSubmitting(false);
          window.history.replaceState({}, "", window.location.pathname);
        });
    }
  }, [event.id, event.meetingLink]);

  const handleShare = async () => {
    const shareUrl = typeof window !== "undefined" ? window.location.href : "";
    if (navigator.share) {
      try {
        await navigator.share({
          title: event.title,
          text: `Register for ${event.title} on WhatBoutMe!`,
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

  const openRegistrationModal = () => {
    let savedReg: EventRegistrationItem | null = null;
    try {
      const stored = localStorage.getItem(`wbm_reg_${event.id}`);
      if (stored) savedReg = JSON.parse(stored);
    } catch { }

    if (event.registeredByMe || savedReg || registeredEventIds.has(event.id)) {
      setConfirmedRegistration(
        savedReg || {
          id: `CONFIRMED-${event.id.slice(0, 8)}`,
          eventId: event.id,
          attendeeName: user?.name || "Registered Learner",
          attendeeEmail: user?.email || attendeeEmail || "Verified Attendee",
          attendeePhone: attendeePhone || "",
          amount: event.price,
          currency: event.currency,
          paymentStatus: "PAID",
          createdAt: new Date().toISOString(),
        }
      );
      setUnlockedMeetingLink(savedReg?.meetingLink || event.meetingLink || null);
      setIsModalOpen(true);
      return;
    }

    setConfirmedRegistration(null);
    setUnlockedMeetingLink(null);
    setModalFeedback(null);
    setIsModalOpen(true);
  };

  const handlePayNowSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!attendeeName.trim() || !attendeeEmail.trim() || !attendeePhone.trim()) {
      setModalFeedback({
        type: "error",
        message: "Please fill in your name, email, and mobile number.",
      });
      return;
    }

    setIsSubmitting(true);
    setModalFeedback(null);

    try {
      // Step A: Initiate checkout (creates PENDING registration or returns alreadyRegistered)
      const checkoutRes = await checkoutEvent(event.slug || event.id, {
        attendeeName: attendeeName.trim(),
        attendeeEmail: attendeeEmail.trim().toLowerCase(),
        attendeePhone: attendeePhone.trim(),
        origin: typeof window !== "undefined" ? window.location.origin : undefined,
        returnUrl: typeof window !== "undefined" ? `${window.location.origin}/events/${event.slug || event.id}` : undefined,
        cancelUrl: typeof window !== "undefined" ? `${window.location.origin}/events/${event.slug || event.id}?cancelled=1` : undefined,
      } as any);

    // If user is already registered for this event
    if (checkoutRes.alreadyRegistered && checkoutRes.registration) {
      setConfirmedRegistration(checkoutRes.registration);
      const link = checkoutRes.meetingLink || checkoutRes.event?.meetingLink || event.meetingLink || null;
      if (link) setUnlockedMeetingLink(link);

      try {
        localStorage.setItem(`wbm_reg_${event.id}`, JSON.stringify(checkoutRes.registration));
      } catch { }
      setRegisteredEventIds((prev) => new Set(prev).add(event.id));
      setEvent((prev) => ({ ...prev, registeredByMe: true }));
      showToast("You are already registered for this event! Here is your invoice & link.");
      return;
    }

    // If free RSVP
    if (checkoutRes.status === "PAID" && checkoutRes.registration) {
      setConfirmedRegistration(checkoutRes.registration);
      const link = checkoutRes.meetingLink || checkoutRes.event?.meetingLink || event.meetingLink || null;
      if (link) setUnlockedMeetingLink(link);

      try {
        localStorage.setItem(`wbm_reg_${event.id}`, JSON.stringify(checkoutRes.registration));
      } catch { }
      setRegisteredEventIds((prev) => new Set(prev).add(event.id));
      setEvent((prev) => ({
        ...prev,
        registeredByMe: true,
        seatsBooked: prev.seatsBooked + 1,
        seatsRemaining:
          prev.seatLimit !== null && prev.seatLimit !== undefined
            ? Math.max(0, prev.seatLimit - (prev.seatsBooked + 1))
            : null,
      }));
      showToast("Free registration confirmed!");
      return;
    }

    // If Stripe Checkout URL returned, redirect directly to Stripe hosted checkout
    if ((checkoutRes as any).checkoutUrl) {
      window.location.href = (checkoutRes as any).checkoutUrl;
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
      eventId: event.id,
      attendeeName: attendeeName.trim(),
      attendeeEmail: attendeeEmail.trim().toLowerCase(),
      attendeePhone: attendeePhone.trim(),
      amount: event.price,
      currency: event.currency,
      gatewayOrderId: checkoutRes.orderId,
      gatewayPaymentId: simulatedPaymentId,
      paymentStatus: "PAID",
      createdAt: new Date().toISOString(),
    };

    setConfirmedRegistration(confirmed);
    const meetingLink = verifyRes.meetingLink || verifyRes.event?.meetingLink || event.meetingLink || null;
    if (meetingLink) {
      setUnlockedMeetingLink(meetingLink);
    }

    try {
      localStorage.setItem(`wbm_reg_${event.id}`, JSON.stringify(confirmed));
    } catch { }
    setRegisteredEventIds((prev) => new Set(prev).add(event.id));

    // Update seat counts
    setEvent((prev) => ({
      ...prev,
      registeredByMe: true,
      seatsBooked: prev.seatsBooked + 1,
      seatsRemaining:
        prev.seatLimit !== null && prev.seatLimit !== undefined
          ? Math.max(0, prev.seatLimit - (prev.seatsBooked + 1))
          : null,
    }));
    showToast("Payment & Booking Confirmed!");
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Payment checkout failed. Please try again.";
    setModalFeedback({ type: "error", message: msg });
  } finally {
    setIsSubmitting(false);
  }
};

const startIso = event.startDateTime || event.startAt;
const endIso = event.endDateTime || event.endAt;
const duration = getDuration(startIso, endIso);
const schedule = formatSchedule(startIso, endIso);
const isOnline = event.locationType === "ONLINE";
const isPast = endIso ? new Date(endIso).getTime() < Date.now() : false;
const isFull = event.isSoldOut || (event.seatLimit && event.seatsBooked >= event.seatLimit);
const canRegister = event.isPublished && !isPast && !isFull;
const banner = event.bannerUrl || event.coverImageUrl;

return (
  <div className="mx-auto max-w-[1240px] px-5 pb-20 pt-20 sm:pt-32 md:px-10 md:pb-28 md:pt-36">
    {/* Toast Notification */}
    {toastMessage && (
      <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-xl bg-ink px-4 py-3 text-xs font-semibold text-cream shadow-2xl transition-all">
        <Check className="h-4 w-4 text-emerald-400" />
        <span>{toastMessage}</span>
      </div>
    )}

    {/* Navigation & Header */}
    <div className="flex flex-wrap items-center justify-between gap-4">
      <Link
        href="/events"
        className="inline-flex items-center gap-2 text-sm font-medium text-ink-soft transition-colors hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4" />
        All Events &amp; Webinars
      </Link>

      <button
        type="button"
        onClick={handleShare}
        className="inline-flex items-center gap-2 rounded-full border border-sand bg-white/80 px-4 py-2 text-xs font-semibold text-ink transition hover:bg-cream-deep hover:text-gold-deep"
      >
        <Share2 className="h-3.5 w-3.5" />
        <span>Share Event Link</span>
      </button>
    </div>

    {/* Main Grid */}
    <div className="mt-6 grid gap-8 lg:grid-cols-[1.5fr_1fr] lg:gap-10">
      {/* Left Column: Event Details */}
      <div>
        {/* Cover Banner */}
        <div className="relative aspect-[16/9] overflow-hidden rounded-3xl bg-gradient-to-tr from-warm-sand/80 to-cream-deep">
          {banner ? (
            <Image
              src={banner}
              alt={event.title}
              fill
              priority
              className="object-cover"
            />
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center p-8 text-center">
              <span className="text-sm text-ink-soft">
                {isOnline ? "Virtual Interactive Session" : "In-Person Masterclass"}
              </span>
            </div>
          )}

          <div className="absolute left-4 top-4">
            <span
              className={`rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider shadow-md backdrop-blur-md ${isOnline ? "bg-emerald-600/90 text-white" : "bg-gold-deep text-white"
                }`}
            >
              {isOnline ? "Online Live Session" : "In-Person Event"}
            </span>
          </div>
        </div>

        <h1 className="mt-8 text-2xl font-bold tracking-tight sm:text-3xl md:text-5xl">
          {event.title}
        </h1>

        <div className="mt-4 flex flex-wrap items-center gap-4 text-xs font-medium text-ink-soft">
          <div className="flex items-center gap-1.5">
            <Calendar className="h-4 w-4 text-gold-deep" />
            <span>{schedule}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Clock className="h-4 w-4 text-gold-deep" />
            <span>Duration: {duration}</span>
          </div>
        </div>

        <div className="mt-8 border-t border-sand/60 pt-6">
          <h2 className="text-xl font-bold tracking-tight md:text-2xl">About This Session</h2>
          <p className="mt-4 whitespace-pre-line leading-relaxed text-ink-soft md:text-lg">
            {event.description}
          </p>
        </div>

        {/* Location Specific Info */}
        <div className="mt-8 rounded-2xl border border-sand bg-white/70 p-6">
          <h3 className="text-base font-bold text-ink">
            {isOnline ? "Virtual Session Access" : "Venue & Location Information"}
          </h3>
          {isOnline ? (
            <p className="mt-2 text-sm leading-relaxed text-ink-soft">
              This session will be hosted live online via secure video conference (Zoom).
              Your private meeting access room link and calendar invite will be automatically dispatched
              to your registered email address upon payment confirmation.
            </p>
          ) : (
            <div className="mt-3 space-y-1.5 text-sm text-ink-soft">
              <p>
                <strong className="text-ink">Venue:</strong> {event.venueName || "Official Venue"}
              </p>
              <p>
                <strong className="text-ink">Address:</strong> {event.venueAddress || event.location || "Full address provided upon confirmation."}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Right Column: Checkout & Summary Card */}
      <aside className="h-fit rounded-3xl border border-line bg-white p-6 md:p-8 lg:sticky lg:top-28 shadow-sm">
        <div className="flex justify-between items-baseline">
          <span className="text-xs font-bold uppercase tracking-wider text-ink-soft">Ticket Price</span>
          <span className="text-2xl font-bold text-ink">
            {formatPrice(event.price, event.currency)}
          </span>
        </div>

        <dl className="mt-6 divide-y divide-line text-xs">
          <div className="py-3 flex justify-between items-center">
            <dt className="text-ink-soft">Format</dt>
            <dd className="font-semibold text-ink">
              {isOnline ? "Online Live Session" : "In-Person"}
            </dd>
          </div>
          <div className="py-3 flex justify-between items-center">
            <dt className="text-ink-soft">Availability</dt>
            <dd className="font-semibold text-ink">
              {event.seatLimit
                ? `${event.seatsRemaining ?? Math.max(0, event.seatLimit - event.seatsBooked)} seats left`
                : "Open Capacity"}
            </dd>
          </div>
          <div className="py-3 flex justify-between items-center">
            <dt className="text-ink-soft">Confirmation</dt>
            <dd className="font-semibold text-emerald-700">Instant Email Delivery</dd>
          </div>
        </dl>

        <div className="mt-6 space-y-3">
          {event.registeredByMe || registeredEventIds.has(event.id) ? (
            <button
              type="button"
              onClick={openRegistrationModal}
              className="group flex w-full items-center justify-center gap-2 rounded-full bg-emerald-700 py-3.5 text-sm font-semibold uppercase tracking-wider text-white shadow-sm transition hover:bg-emerald-800"
            >
              <CheckCircle2 className="h-4 w-4 text-emerald-200" />
              <span>Ticket Confirmed (View Invoice)</span>
            </button>
          ) : canRegister ? (
            <button
              type="button"
              onClick={openRegistrationModal}
              className="group flex w-full items-center justify-center gap-2 rounded-full bg-ink py-3.5 text-sm font-semibold uppercase tracking-wider text-cream transition-colors duration-200 hover:bg-gold-deep hover:text-white"
            >
              <span>
                {event.price === 0 ? "Reserve Free Pass" : `Pay Now — ${formatPrice(event.price, event.currency)}`}
              </span>
              <CreditCard className="h-4 w-4" />
            </button>
          ) : (
            <button
              type="button"
              disabled
              className="w-full rounded-full bg-sand/40 py-3.5 text-sm font-semibold text-ink-soft cursor-not-allowed"
            >
              {isPast ? "Event Concluded" : isFull ? "Sold Out" : "Registration Closed"}
            </button>
          )}

          <button
            type="button"
            onClick={handleShare}
            className="flex w-full items-center justify-center gap-2 rounded-full border border-sand bg-cream-deep/40 py-3 text-xs font-semibold text-ink transition hover:bg-cream-deep hover:text-gold-deep"
          >
            <Share2 className="h-4 w-4" />
            <span>Share Event Link</span>
          </button>
        </div>

        <p className="mt-4 text-center text-[11px] text-ink-soft">
          100% secure payment checkout. Your access credentials are guaranteed.
        </p>
      </aside>
    </div>

    {/* Pay Now / Registration Modal */}
    {isModalOpen && (
      <div
        role="dialog"
        aria-modal="true"
        className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm"
      >
        <div className="relative w-full max-w-xl rounded-3xl border border-sand bg-cream p-6 shadow-2xl md:p-8">
          <button
            type="button"
            onClick={() => setIsModalOpen(false)}
            className="absolute right-5 top-5 rounded-full p-2 text-ink-soft transition hover:bg-sand/40 hover:text-ink"
          >
            <X className="h-5 w-5" />
          </button>

          {confirmedRegistration ? (
            <div className="py-2 text-center">
              <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 shadow-sm">
                <CheckCircle2 className="h-7 w-7" />
              </div>
              <h3 className="text-xl font-bold tracking-tight text-ink md:text-2xl">
                {event.price === 0 ? "Registration Confirmed!" : "Payment & Registration Confirmed!"}
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
                      <p className="font-semibold text-ink text-[13px]">{event.title}</p>
                      <p className="text-[11px] text-ink-soft mt-0.5">{schedule}</p>
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
                  {isOnline ? (
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
                        {event.venueName ? `${event.venueName} — ` : ""}
                        {event.venueAddress || event.location}
                      </p>
                      <div className="flex flex-col items-center justify-center p-3 bg-white rounded-xl border border-sand">
                        <span className="text-[11px] font-bold text-ink uppercase tracking-wider mb-2">Express Check-in QR Pass</span>
                        <img
                          src={`https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent(`whatboutme://checkin/event/${event.id}/reg/${confirmedRegistration.id}`)}`}
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
                  onClick={() => setIsModalOpen(false)}
                  className="rounded-full bg-ink px-8 py-2 text-xs font-semibold uppercase tracking-wider text-cream transition hover:bg-gold-deep hover:text-white"
                >
                  Done
                </button>
              </div>
              <p className="mt-3 text-[11px] text-ink-soft">
                You are officially registered. Further duplicate payments for this event are blocked.
              </p>
            </div>
          ) : (
            <div>
              <div className="mb-6">
                <h3 className="text-xl font-bold tracking-tight text-ink md:text-2xl">
                  {event.title}
                </h3>
                <p className="mt-1 text-xs text-ink-soft">{schedule}</p>
              </div>

              {modalFeedback && (
                <div
                  className={`mb-4 flex items-start gap-2.5 rounded-xl p-3 text-xs ${modalFeedback.type === "error"
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
                  <label className="block text-xs font-semibold text-ink mb-1">Full Name *</label>
                  <input
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
                    <label className="block text-xs font-semibold text-ink mb-1">Email Address *</label>
                    <input
                      type="email"
                      required
                      value={attendeeEmail}
                      onChange={(e) => setAttendeeEmail(e.target.value)}
                      placeholder="jane@example.com"
                      className="w-full rounded-xl border border-sand bg-white px-3.5 py-2.5 text-xs text-ink outline-none transition focus:border-gold focus:ring-1 focus:ring-gold"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-ink mb-1">Mobile Number *</label>
                    <input
                      type="tel"
                      required
                      value={attendeePhone}
                      onChange={(e) => setAttendeePhone(e.target.value)}
                      placeholder="+971 50 123 4567"
                      className="w-full rounded-xl border border-sand bg-white px-3.5 py-2.5 text-xs text-ink outline-none transition focus:border-gold focus:ring-1 focus:ring-gold"
                    />
                  </div>
                </div>

                <div className="rounded-xl border border-sand bg-white/60 p-3 text-xs text-ink-soft space-y-1">
                  <div className="flex justify-between">
                    <span>Registration Amount:</span>
                    <span className="font-bold text-ink">
                      {formatPrice(event.price, event.currency)}
                    </span>
                  </div>
                  <div className="flex justify-between text-[11px]">
                    <span>Session Delivery:</span>
                    <span>{isOnline ? "Online Live Room" : "Physical Venue"}</span>
                  </div>
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="flex w-full items-center justify-center gap-2 rounded-full bg-ink py-3 text-xs font-bold uppercase tracking-wider text-cream shadow-md transition hover:bg-gold-deep hover:text-white disabled:opacity-50"
                  >
                    <CreditCard className="h-4 w-4" />
                    {isSubmitting
                      ? "Processing Payment..."
                      : event.price === 0
                        ? "Confirm Free Reservation"
                        : `Pay Now — ${formatPrice(event.price, event.currency)}`}
                  </button>
                  <p className="mt-2 text-center text-[11px] text-ink-soft">
                    Secure checkout with instant ticket &amp; calendar invite email.
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
