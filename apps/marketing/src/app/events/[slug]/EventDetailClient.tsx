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
  Sparkles,
  ExternalLink,
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

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((cur) => (cur === msg ? null : cur));
    }, 3500);
  };

  useEffect(() => {
    if (user) {
      if (!attendeeName && user.name) setAttendeeName(user.name);
      if (!attendeeEmail && user.email) setAttendeeEmail(user.email);
    }
  }, [user, attendeeName, attendeeEmail]);

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
      // Step A: Initiate checkout (creates PENDING registration)
      const checkoutRes = await checkoutEvent(event.slug || event.id, {
        attendeeName: attendeeName.trim(),
        attendeeEmail: attendeeEmail.trim().toLowerCase(),
        attendeePhone: attendeePhone.trim(),
      });

      // Step B: Payment Verification (Simulated mode for testing, ready for Razorpay/Stripe live webhook)
      const simulatedPaymentId = `sim_pay_${Date.now()}`;
      const verifyRes = await verifyEventPayment({
        registrationId: checkoutRes.registrationId,
        gatewayOrderId: checkoutRes.orderId,
        gatewayPaymentId: simulatedPaymentId,
        isSimulated: true,
      });

      setConfirmedRegistration(verifyRes.registration);
      if (verifyRes.event?.meetingLink) {
        setUnlockedMeetingLink(verifyRes.event.meetingLink);
      }

      // Update seat counts
      setEvent((prev) => ({
        ...prev,
        seatsBooked: prev.seatsBooked + 1,
        seatsRemaining:
          prev.seatLimit !== null && prev.seatLimit !== undefined
            ? Math.max(0, prev.seatLimit - (prev.seatsBooked + 1))
            : null,
      }));
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
                <Sparkles className="mb-3 h-10 w-10 text-gold-deep/60" />
                <span className="text-sm font-semibold uppercase tracking-widest text-ink-soft">
                  {isOnline ? "Virtual Interactive Session" : "In-Person Masterclass"}
                </span>
              </div>
            )}

            <div className="absolute left-4 top-4">
              <span
                className={`rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider shadow-md backdrop-blur-md ${
                  isOnline ? "bg-emerald-600/90 text-white" : "bg-gold-deep text-white"
                }`}
              >
                {isOnline ? "🟢 Online Live Session" : "📍 In-Person Event"}
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
                This session will be hosted live online via secure video conference (Zoom / Google Meet).
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
            {canRegister ? (
              <button
                type="button"
                onClick={() => {
                  setConfirmedRegistration(null);
                  setUnlockedMeetingLink(null);
                  setModalFeedback(null);
                  setIsModalOpen(true);
                }}
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
            🔒 100% secure payment checkout. Your access credentials are guaranteed.
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
              <div className="py-4 text-center">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                  <CheckCircle2 className="h-8 w-8" />
                </div>
                <h3 className="text-2xl font-bold tracking-tight text-ink">
                  {event.price === 0 ? "Registration Confirmed!" : "Payment & Registration Confirmed!"}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-soft">
                  Thank you, <strong className="text-ink">{confirmedRegistration.attendeeName}</strong>! Your seat has
                  been reserved. A confirmation email with calendar invite has been sent to{" "}
                  <strong className="text-ink">{confirmedRegistration.attendeeEmail}</strong>.
                </p>

                <div className="mt-6 rounded-2xl border border-sand bg-white/80 p-5 text-left text-xs space-y-2 text-ink-soft">
                  <div className="flex justify-between border-b border-sand/40 pb-2">
                    <span className="font-semibold text-ink">Amount:</span>
                    <span className="font-bold text-ink">
                      {formatPrice(confirmedRegistration.amount, confirmedRegistration.currency)} (PAID)
                    </span>
                  </div>

                  {isOnline ? (
                    <div className="pt-1">
                      <span className="font-semibold text-ink block mb-1">Virtual Meeting Room:</span>
                      {unlockedMeetingLink ? (
                        <a
                          href={unlockedMeetingLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700"
                        >
                          <Video className="h-4 w-4" />
                          <span>Join Online Session</span>
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : (
                        <p className="text-emerald-700 font-medium">
                          Secure meeting link has been dispatched to {confirmedRegistration.attendeeEmail}.
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="pt-1">
                      <span className="font-semibold text-ink block mb-1">Physical Venue:</span>
                      <p className="text-ink font-medium">
                        {event.venueName ? `${event.venueName} — ` : ""}
                        {event.venueAddress || event.location}
                      </p>
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="mt-6 rounded-full bg-ink px-8 py-2.5 text-xs font-semibold uppercase tracking-wider text-cream transition hover:bg-gold-deep hover:text-white"
                >
                  Done
                </button>
              </div>
            ) : (
              <div>
                <div className="mb-6">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-gold-deep">
                    {isOnline ? "Online Live Session Registration" : "In-Person Workshop Ticket"}
                  </span>
                  <h3 className="mt-1 text-xl font-bold tracking-tight text-ink md:text-2xl">
                    {event.title}
                  </h3>
                  <p className="mt-1 text-xs text-ink-soft">{schedule}</p>
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
                      🔒 Secure checkout with instant ticket &amp; calendar invite email.
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
