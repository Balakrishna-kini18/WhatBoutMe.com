"use client";

import { useEffect, useState } from "react";
import {
  Calendar,
  Clock,
  Video,
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  ChevronRight,
} from "lucide-react";
import { API_BASE_URL } from "@/lib/api";
import {
  getTimezoneOptions,
  getSystemTimezone,
  formatMultiTimezoneSummary,
} from "@/lib/timezone";

interface AvailableSlot {
  slotStartUtc: string;
  slotEndUtc: string;
  timeLocal: string;
  timeGst: string;
  timeIst: string;
  isBooked?: boolean;
}

interface BookingResponse {
  success: boolean;
  sessionId: string;
  title: string;
  startTimeUtc: string;
  endTimeUtc: string;
  dateFormatted: string;
  timeLocal: string;
  timeGst: string;
  timeIst: string;
  timezone: string;
  zoomJoinUrl: string;
  icsContent: string;
  message: string;
}

interface DiscoveryCallBookingProps {
  leadId?: string;
  name: string;
  email: string;
  phone: string;
  courseId?: string;
  courseTitle?: string;
  onBack?: () => void;
}

export default function DiscoveryCallBooking({
  leadId,
  name,
  email,
  phone,
  courseId,
  courseTitle,
  onBack,
}: DiscoveryCallBookingProps) {
  const [selectedTz, setSelectedTz] = useState<string>(getSystemTimezone());
  const tzOptions = getTimezoneOptions();

  // Next 14 business/calendar days
  const today = new Date();
  const dateOptions = Array.from({ length: 14 }).map((_, i) => {
    const d = new Date();
    d.setDate(today.getDate() + i + 1); // Start from tomorrow
    return {
      iso: d.toISOString().split("T")[0]!,
      label: d.toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
      }),
    };
  });

  const [selectedDate, setSelectedDate] = useState<string>(
    dateOptions[0]?.iso || new Date().toISOString().split("T")[0]!,
  );
  const [slots, setSlots] = useState<AvailableSlot[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<AvailableSlot | null>(null);
  const [isLoadingSlots, setIsLoadingSlots] = useState(false);
  const [bookingBusy, setBookingBusy] = useState(false);
  const [bookingError, setBookingError] = useState("");
  const [bookingResult, setBookingResult] = useState<BookingResponse | null>(null);
  const [copiedZoom, setCopiedZoom] = useState(false);

  // Fetch slots whenever selectedDate or selectedTz changes
  useEffect(() => {
    let isMounted = true;
    const fetchSlots = async () => {
      setIsLoadingSlots(true);
      setSelectedSlot(null);
      setBookingError("");
      try {
        const res = await fetch(
          `${API_BASE_URL}/meetings/discovery/slots?date=${encodeURIComponent(
            selectedDate,
          )}&timezone=${encodeURIComponent(selectedTz)}`,
        );
        if (res.ok) {
          const data = await res.json();
          if (isMounted) {
            setSlots(data.slots || []);
          }
        } else {
          // Fallback to /sessions/discovery/slots
          const fallback = await fetch(
            `${API_BASE_URL}/sessions/discovery/slots?date=${encodeURIComponent(
              selectedDate,
            )}&timezone=${encodeURIComponent(selectedTz)}`,
          );
          if (fallback.ok && isMounted) {
            const data = await fallback.json();
            setSlots(data.slots || []);
          }
        }
      } catch (err) {
        console.warn("Could not fetch discovery slots:", err);
      } finally {
        if (isMounted) setIsLoadingSlots(false);
      }
    };

    fetchSlots();
    return () => {
      isMounted = false;
    };
  }, [selectedDate, selectedTz]);

  const handleConfirmBooking = async () => {
    if (!selectedSlot || selectedSlot.isBooked) return;
    setBookingBusy(true);
    setBookingError("");

    try {
      const payload = {
        leadId,
        name,
        email,
        phone,
        courseId,
        slotStartUtc: selectedSlot.slotStartUtc,
        timezone: selectedTz,
      };

      let res = await fetch(`${API_BASE_URL}/meetings/discovery/book`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        res = await fetch(`${API_BASE_URL}/sessions/discovery/book`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }

      if (res.ok) {
        const data: BookingResponse = await res.json();
        setBookingResult(data);
      } else {
        const err = await res.json().catch(() => null);
        setBookingError(
          err?.message ||
            "This slot was just claimed by another prospect. Please select another time.",
        );
      }
    } catch {
      setBookingError("Server connection error. Please try again.");
    } finally {
      setBookingBusy(false);
    }
  };

  const handleCopyZoomLink = async () => {
    if (!bookingResult?.zoomJoinUrl) return;
    try {
      await navigator.clipboard.writeText(bookingResult.zoomJoinUrl);
      setCopiedZoom(true);
      setTimeout(() => setCopiedZoom(false), 2500);
    } catch {
      // ignore
    }
  };

  const handleDownloadIcs = () => {
    if (!bookingResult?.icsContent) return;
    const blob = new Blob([bookingResult.icsContent], {
      type: "text/calendar;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Roweena-Discovery-Call-${bookingResult.sessionId.slice(0, 8)}.ics`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // CONFIRMED BOOKING VIEW
  if (bookingResult) {
    const timeSummary = formatMultiTimezoneSummary(
      bookingResult.startTimeUtc,
      bookingResult.timezone,
    );

    return (
      <div className="rounded-2xl bg-cream-deep p-6 sm:p-8 animate-fadeIn text-ink">
        {bookingResult.zoomJoinUrl ? (
          <>
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100 text-green-700">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <div>
                <h2 className="text-lg sm:text-xl font-bold tracking-tight text-ink">
                  1-to-1 Discovery Call Confirmed
                </h2>
              </div>
            </div>

            <p className="text-sm text-ink-soft mb-6 leading-relaxed">
              Thank you, <strong className="text-ink">{name}</strong>! Your 15-minute discovery consultation has been confirmed and synced to Roweena&apos;s calendar.
            </p>

            {/* Multi-Timezone Schedule Card */}
            <div className="rounded-xl border border-sand bg-white p-5 mb-5 space-y-3">
              <div className="flex items-center gap-2 text-sm text-ink-soft">
                <Clock className="h-4 w-4" />
                <span>Scheduled Meeting Time</span>
              </div>

              <div className="text-sm sm:text-base font-bold text-ink">
                {timeSummary.fullDate}
              </div>

              <div className="grid gap-2 sm:grid-cols-3 pt-1 text-xs sm:text-sm">
                <div className="p-2.5 rounded-lg bg-cream border border-sand">
                  <span className="text-xs text-ink-soft block">Your Timezone</span>
                  <span className="font-bold text-ink">{timeSummary.local}</span>
                </div>
                <div className="p-2.5 rounded-lg bg-cream border border-sand">
                  <span className="text-xs text-ink-soft block">Dubai Time</span>
                  <span className="font-bold text-ink">{timeSummary.gst}</span>
                </div>
                <div className="p-2.5 rounded-lg bg-cream border border-sand">
                  <span className="text-xs text-ink-soft block">India Time</span>
                  <span className="font-bold text-ink">{timeSummary.ist}</span>
                </div>
              </div>
            </div>

            {/* Zoom Link Container */}
            <div className="rounded-xl border border-gold/40 bg-gold/10 p-5 mb-5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-ink-soft flex items-center gap-1.5">
                  <Video className="h-4 w-4" />
                  <span>Zoom Meeting Link</span>
                </span>
                <span className="text-[11px] font-semibold text-ink-soft">Duration: 15 Minutes</span>
              </div>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                <input
                  readOnly
                  value={bookingResult.zoomJoinUrl}
                  className="w-full rounded-lg border border-line bg-white px-3 py-2 text-xs font-mono text-ink outline-none"
                />
                <button
                  type="button"
                  onClick={handleCopyZoomLink}
                  className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg border border-line bg-white px-4 py-2 text-xs font-semibold text-ink hover:border-gold-deep transition"
                >
                  <Copy className="h-3.5 w-3.5" />
                  <span>{copiedZoom ? "Copied!" : "Copy Link"}</span>
                </button>
                <a
                  href={bookingResult.zoomJoinUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg bg-ink px-4 py-2 text-xs font-semibold text-cream hover:bg-gold hover:text-ink transition"
                >
                  <span>Join Zoom</span>
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </div>
            </div>

            {/* Calendar Add & ICS Download */}
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <button
                type="button"
                onClick={handleDownloadIcs}
                className="inline-flex items-center gap-2 rounded-full border border-line bg-white px-5 py-2.5 text-xs font-semibold text-ink hover:border-gold-deep transition"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Download .ics Calendar Invite</span>
              </button>

              {onBack && (
                <button
                  type="button"
                  onClick={onBack}
                  className="text-xs text-ink-soft hover:text-ink ml-auto underline"
                >
                  Submit another enquiry
                </button>
              )}
            </div>
          </>
        ) : (
          <>
            {/* PENDING COACH CONFIRMATION */}
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-amber-700">
                <Clock className="h-6 w-6" />
              </div>
              <div>
                <h2 className="text-lg sm:text-xl font-bold tracking-tight text-ink">
                  1-to-1 Discovery Call Requested
                </h2>
                <p className="text-xs text-ink-soft">Pending coach review &amp; confirmation</p>
              </div>
            </div>

            <div className="rounded-xl border border-amber-300 bg-amber-50/80 p-4 mb-5 text-xs text-amber-950 leading-relaxed shadow-xs flex items-start gap-3">
              <Clock className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-amber-950 text-sm">Status: Pending Coach Confirmation</p>
                <p className="mt-1 text-amber-900">
                  Thank you, <strong>{name}</strong>! We have received your consultation request. Roweena and our team will review the slot and confirm. Once accepted, your official Zoom meeting link and calendar invite will be emailed to <strong>{email}</strong>.
                </p>
              </div>
            </div>

            {/* Multi-Timezone Schedule Card */}
            <div className="rounded-xl border border-sand bg-white p-5 mb-5 space-y-3">
              <div className="flex items-center gap-2 text-sm text-ink-soft">
                <Clock className="h-4 w-4" />
                <span>Requested Meeting Time</span>
              </div>

              <div className="text-sm sm:text-base font-bold text-ink">
                {timeSummary.fullDate}
              </div>

              <div className="grid gap-2 sm:grid-cols-3 pt-1 text-xs sm:text-sm">
                <div className="p-2.5 rounded-lg bg-cream border border-sand">
                  <span className="text-xs text-ink-soft block">Your Timezone</span>
                  <span className="font-bold text-ink">{timeSummary.local}</span>
                </div>
                <div className="p-2.5 rounded-lg bg-cream border border-sand">
                  <span className="text-xs text-ink-soft block">Dubai Time</span>
                  <span className="font-bold text-ink">{timeSummary.gst}</span>
                </div>
                <div className="p-2.5 rounded-lg bg-cream border border-sand">
                  <span className="text-xs text-ink-soft block">India Time</span>
                  <span className="font-bold text-ink">{timeSummary.ist}</span>
                </div>
              </div>
            </div>

            {/* Zoom Link Container (Pending) */}
            <div className="rounded-xl border border-line bg-white/90 p-5 mb-5 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-ink flex items-center gap-1.5">
                  <Video className="h-4 w-4 text-gold-deep" />
                  <span>Zoom Meeting Link</span>
                </span>
                <span className="text-[11px] font-semibold text-amber-700 bg-amber-100/80 px-2.5 py-0.5 rounded-full border border-amber-300/60">
                  Generated Upon Coach Acceptance
                </span>
              </div>
              <p className="text-xs text-ink-soft leading-relaxed pt-1">
                To ensure coach availability, private Zoom meeting rooms are generated directly upon coach acceptance. You will receive an email confirmation with the join link as soon as your slot is confirmed.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-1">
              {onBack && (
                <button
                  type="button"
                  onClick={onBack}
                  className="text-xs text-ink-soft hover:text-ink ml-auto underline"
                >
                  Submit another enquiry
                </button>
              )}
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-cream-deep p-6 sm:p-8 animate-fadeIn text-ink">
      {/* Header */}
      <div className="mb-6">
        {courseTitle && (
          <p className="mb-2 hidden text-sm text-ink-soft sm:block">
            {courseTitle}
          </p>
        )}
        <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-ink">
          Book Your 1-to-1 Discovery Call with Roweena (15-Minute Slot)
        </h2>
        <p className="mt-1.5 text-xs sm:text-sm text-ink-soft leading-relaxed">
          Welcome, <strong className="text-ink">{name}</strong>. Select an available 15-minute slot. Availability is verified in real-time against Roweena&apos;s unified calendar.
        </p>
      </div>

      {/* Timezone Selector */}
      <div className="mb-5 p-3.5 rounded-xl border border-sand bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-ink-soft">
          <Clock className="h-4 w-4 text-gold-deep" />
          <span>Your Timezone:</span>
        </div>
        <select
          value={selectedTz}
          onChange={(e) => setSelectedTz(e.target.value)}
          className="rounded-lg border border-line bg-cream px-3 py-1.5 text-xs font-medium text-ink outline-none focus:border-gold-deep"
        >
          {tzOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* Date Selector Carousel */}
      <div className="mb-6">
        <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-ink-soft flex items-center gap-1.5">
          <Calendar className="h-3.5 w-3.5" />
          <span>Select Date *</span>
        </label>
        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none">
          {dateOptions.map((d) => (
            <button
              key={d.iso}
              type="button"
              onClick={() => setSelectedDate(d.iso)}
              className={`shrink-0 rounded-xl px-4 py-2.5 text-xs font-semibold border transition text-center ${
                selectedDate === d.iso
                  ? "bg-ink text-cream border-ink shadow-sm"
                  : "bg-white text-ink border-line hover:border-gold-deep"
              }`}
            >
              <span>{d.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Slots Grid */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <label className="block text-xs font-bold uppercase tracking-wider text-ink-soft">
            Available 15-Minute Slots ({selectedDate}) *
          </label>
          {slots.length > 0 && !isLoadingSlots && (
            <div className="flex items-center gap-2.5 text-[10px] text-ink-soft font-medium">
              <span className="inline-flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-gold-deep" />
                <span>Available</span>
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-sand" />
                <span>Booked</span>
              </span>
            </div>
          )}
        </div>

        {isLoadingSlots ? (
          <div className="py-8 text-center text-xs text-ink-soft bg-white rounded-xl border border-line">
            Checking Roweena&apos;s unified calendar availability...
          </div>
        ) : slots.length === 0 ? (
          <div className="py-8 text-center text-xs text-ink-soft bg-white rounded-xl border border-line">
            No open 15-minute slots on this date. Please pick another date above.
          </div>
        ) : (
          <>
            {slots.length > 0 && slots.every((s) => s.isBooked) && (
              <div className="mb-3 p-3 rounded-xl bg-amber-50/80 border border-amber-200/80 text-xs text-amber-800 flex items-center gap-2">
                <Clock className="h-4 w-4 shrink-0 text-amber-700" />
                <span>All slots on this date are already booked. Please choose another date above.</span>
              </div>
            )}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5 max-h-64 overflow-y-auto p-1 border border-sand bg-white/60 rounded-xl">
              {slots.map((slot) => {
                const isBooked = Boolean(slot.isBooked);
                const isSelected = !isBooked && selectedSlot?.slotStartUtc === slot.slotStartUtc;
                return (
                  <button
                    key={slot.slotStartUtc}
                    type="button"
                    disabled={isBooked}
                    aria-disabled={isBooked}
                    onClick={() => {
                      if (isBooked) return;
                      setSelectedSlot(slot);
                    }}
                    className={`p-2.5 rounded-xl border text-left transition flex flex-col justify-between ${
                      isBooked
                        ? "bg-sand/30 border-sand text-ink-soft/60 cursor-not-allowed select-none opacity-60"
                        : isSelected
                          ? "bg-gold/15 border-gold-deep text-ink ring-1 ring-gold-deep"
                          : "bg-white border-line text-ink hover:border-gold-deep cursor-pointer"
                    }`}
                  >
                    <div className="flex items-center justify-between w-full">
                      <span className={`text-xs sm:text-sm font-bold block ${isBooked ? "line-through text-ink-soft/60" : ""}`}>
                        {slot.timeLocal}
                      </span>
                      {isBooked && (
                        <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-sand/60 text-ink-soft leading-none">
                          Booked
                        </span>
                      )}
                    </div>
                    <span className={`text-[10px] block mt-1 ${isBooked ? "text-ink-soft/40" : "text-ink-soft"}`}>
                      {slot.timeGst} · {slot.timeIst}
                    </span>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Error alert */}
      {bookingError && (
        <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-xs text-red-700 mb-4">
          {bookingError}
        </div>
      )}

      {/* Confirmation Actions */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="text-xs text-ink-soft hover:text-ink underline"
          >
            ← Back to contact form
          </button>
        )}

        <button
          type="button"
          onClick={handleConfirmBooking}
          disabled={!selectedSlot || bookingBusy}
          className="inline-flex w-full sm:w-auto ml-auto items-center justify-center gap-2 rounded-full bg-ink px-8 py-3.5 text-sm font-semibold text-cream transition hover:bg-gold hover:text-ink disabled:opacity-50 shadow-sm"
        >
          <span>
            {bookingBusy
              ? "Locking slot & generating Zoom…"
              : selectedSlot
              ? `Confirm 15-Min Slot (${selectedSlot.timeLocal})`
              : "Select a 15-Minute Slot"}
          </span>
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
