"use client";

import { useEffect, useState, useSyncExternalStore, type FormEvent } from "react";
import {
  ArrowRight,
  CheckCircle2,
  Calendar,
  Clock,
  Video,
  Copy,
  Download,
  ExternalLink,
  MessageCircle,
  AlertCircle,
  Sparkles,
} from "lucide-react";
import { API_BASE_URL } from "@/lib/api";
import {
  getTimezoneOptions,
  getSystemTimezone,
  formatMultiTimezoneSummary,
} from "@/lib/timezone";
import { buildWhatsAppEnquiryUrl, openWhatsAppSafely } from "@/lib/whatsapp";

const FIELD =
  "w-full rounded-xl border border-line bg-cream px-4 py-3 text-ink outline-none transition-colors focus:border-gold-deep focus:bg-white text-sm sm:text-base";

// URL course subscription
const subscribe = () => () => {};
const getCourseFromUrl = () => {
  if (typeof window === "undefined") return "";
  const params = new URLSearchParams(window.location.search);
  return params.get("course") || params.get("programId") || "";
};
const getServerCourse = () => "";

interface ProgramOption {
  id: string;
  title: string;
  slug?: string;
}

interface AvailableSlot {
  slotStartUtc: string;
  slotEndUtc: string;
  timeLocal: string;
  timeGst: string;
  timeIst: string;
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

export default function ContactForm() {
  const urlCourseParam = useSyncExternalStore(subscribe, getCourseFromUrl, getServerCourse);

  // 1. Shared Form State (Persists across Enquiry Type toggling)
  const [inquiryType, setInquiryType] = useState<"GENERAL" | "COURSE">("GENERAL");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [honeypot, setHoneypot] = useState("");

  // 2. Course Selection State
  const [courses, setCourses] = useState<ProgramOption[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState("");
  const [isLoadingCourses, setIsLoadingCourses] = useState(false);

  // 3. 1-on-1 Discovery Slot Picker State
  const [selectedTz, setSelectedTz] = useState<string>(getSystemTimezone());
  const tzOptions = getTimezoneOptions();

  // Next 14 calendar days (starting tomorrow)
  const dateOptions = Array.from({ length: 14 }).map((_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i + 1);
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

  // 4. Submission & Result State
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [generalSubmitted, setGeneralSubmitted] = useState(false);
  const [waUrl, setWaUrl] = useState("");
  const [bookingResult, setBookingResult] = useState<BookingResponse | null>(null);
  const [copiedZoom, setCopiedZoom] = useState(false);

  // URL query parameter pre-selection
  useEffect(() => {
    if (typeof window !== "undefined") {
      const sp = new URLSearchParams(window.location.search);
      const typeParam = sp.get("type") || sp.get("enquiryType");
      if (typeParam?.toUpperCase() === "COURSE" || urlCourseParam) {
        setInquiryType("COURSE");
      }
    }
  }, [urlCourseParam]);

  // Fetch active public courses for course dropdown
  useEffect(() => {
    let isMounted = true;
    const fetchCourses = async () => {
      setIsLoadingCourses(true);
      try {
        let res = await fetch(`${API_BASE_URL}/programs/public`);
        if (!res.ok) {
          res = await fetch(`${API_BASE_URL}/programs`);
        }
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data) && isMounted) {
            setCourses(data);

            // Pre-select matching course from url parameter if present
            if (urlCourseParam) {
              const paramLower = urlCourseParam.toLowerCase();
              const matched = data.find(
                (p) =>
                  p.slug?.toLowerCase() === paramLower ||
                  p.title?.toLowerCase() === paramLower ||
                  p.id === urlCourseParam,
              );
              if (matched) {
                setSelectedCourseId(matched.id);
              }
            } else if (data.length > 0 && !selectedCourseId) {
              setSelectedCourseId(data[0]!.id);
            }
          }
        }
      } catch (err) {
        console.warn("Could not fetch active programs:", err);
      } finally {
        if (isMounted) setIsLoadingCourses(false);
      }
    };

    fetchCourses();
    return () => {
      isMounted = false;
    };
  }, [urlCourseParam]);

  // Fetch available discovery slots whenever date, timezone, or course mode changes
  const fetchDiscoverySlots = async () => {
    if (inquiryType !== "COURSE") return;
    setIsLoadingSlots(true);
    setSelectedSlot(null);

    try {
      const res = await fetch(
        `${API_BASE_URL}/meetings/discovery/slots?date=${encodeURIComponent(
          selectedDate,
        )}&timezone=${encodeURIComponent(selectedTz)}`,
      );
      if (res.ok) {
        const data = await res.json();
        setSlots(data.slots || []);
      } else {
        const fallback = await fetch(
          `${API_BASE_URL}/sessions/discovery/slots?date=${encodeURIComponent(
            selectedDate,
          )}&timezone=${encodeURIComponent(selectedTz)}`,
        );
        if (fallback.ok) {
          const data = await fallback.json();
          setSlots(data.slots || []);
        }
      }
    } catch (err) {
      console.warn("Could not fetch discovery slots:", err);
    } finally {
      setIsLoadingSlots(false);
    }
  };

  useEffect(() => {
    if (inquiryType === "COURSE") {
      fetchDiscoverySlots();
    }
  }, [inquiryType, selectedDate, selectedTz]);

  // Handle Form Submission
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");

    // 1. Common Validation
    if (!name.trim()) {
      setError("Please enter your full name.");
      return;
    }

    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError("Please provide a valid email address.");
      return;
    }

    if (!phone.trim()) {
      setError("Please provide your phone number with country code.");
      return;
    }

    if (!message.trim()) {
      setError(
        inquiryType === "COURSE"
          ? "Please share your mental wellness goals or topics you would like to discuss with Roweena."
          : "Please tell us about your goals or enquiry.",
      );
      return;
    }

    // 2. PATH A: GENERAL ENQUIRY -> Lead Persistence + WhatsApp Redirect
    if (inquiryType === "GENERAL") {
      // Mobile Safari popup-blocker mitigation: open blank reference synchronously inside user click tick
      let popupWin: Window | null = null;
      if (typeof window !== "undefined") {
        try {
          popupWin = window.open("about:blank", "_blank");
        } catch {
          popupWin = null;
        }
      }

      setBusy(true);

      const targetWaUrl = buildWhatsAppEnquiryUrl({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        userPhone: phone.trim(),
        message: message.trim(),
      });
      setWaUrl(targetWaUrl);

      try {
        const payload = {
          name: name.trim(),
          email: email.trim().toLowerCase(),
          phone: phone.trim(),
          inquiryType: "GENERAL",
          message: message.trim(),
          honeypot: honeypot.trim() || undefined,
        };

        // Persist lead in backend so Admin sees it in apps/admin/app/leads/page.tsx
        await fetch(`${API_BASE_URL}/contact`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }).catch(async () => {
          return fetch(`${API_BASE_URL}/leads`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
        });

        // Trigger WhatsApp redirect safely
        openWhatsAppSafely(targetWaUrl, popupWin);
        setGeneralSubmitted(true);
      } catch (err: any) {
        console.warn("Could not dispatch lead record:", err);
        // Even if network fails, ensure prospect reaches WhatsApp
        openWhatsAppSafely(targetWaUrl, popupWin);
        setGeneralSubmitted(true);
      } finally {
        setBusy(false);
      }
      return;
    }

    // 3. PATH B: COURSE ENQUIRY -> Course Validation + 1-on-1 Discovery Booking
    if (!selectedCourseId) {
      setError("Please select the course you are enquiring about.");
      return;
    }

    if (!selectedSlot) {
      setError("Please select an available 15-minute time slot from the calendar.");
      return;
    }

    setBusy(true);

    try {
      const payload = {
        name: name.trim(),
        email: email.trim().toLowerCase(),
        phone: phone.trim(),
        courseId: selectedCourseId,
        slotStartUtc: selectedSlot.slotStartUtc,
        timezone: selectedTz,
        notes: message.trim(),
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
      } else if (res.status === 409) {
        // Edge Case: Slot taken while filling form
        const errJson = await res.json().catch(() => null);
        setError(
          errJson?.message ||
            "This 15-minute slot was just claimed by another prospect. Please select another time from the refreshed slots below.",
        );
        // Refresh available slots without losing user input
        fetchDiscoverySlots();
      } else {
        const errJson = await res.json().catch(() => null);
        setError(
          errJson?.message ||
            "Could not complete your 1-on-1 consultation booking. Please try again.",
        );
      }
    } catch {
      setError("Network connection error. Please check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  const handleReset = () => {
    setGeneralSubmitted(false);
    setBookingResult(null);
    setError("");
    setMessage("");
    setSelectedSlot(null);
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

  // SUCCESS STATE: General Enquiry (WhatsApp)
  if (generalSubmitted && waUrl) {
    return (
      <div role="status" className="rounded-2xl bg-cream-deep p-6 sm:p-8 text-center animate-fadeIn text-ink">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 mb-4">
          <MessageCircle className="h-7 w-7" />
        </div>
        <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-ink">Thank You, {name}!</h2>
        <p className="mt-2 text-sm sm:text-base text-ink-soft max-w-md mx-auto leading-relaxed">
          Your general enquiry has been saved. We are redirecting you to WhatsApp to connect directly with Roweena and our coaching team.
        </p>

        {/* Fallback open button for mobile popup blockers */}
        <div className="mt-6 flex flex-col items-center justify-center gap-3">
          <a
            href={waUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 rounded-full bg-emerald-600 px-7 py-3 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 transition"
          >
            <MessageCircle className="h-4 w-4" />
            <span>Open WhatsApp Chat Now</span>
          </a>
          <span className="text-xs text-ink-soft">
            If WhatsApp didn&apos;t open automatically, click the button above.
          </span>
        </div>

        <button
          type="button"
          onClick={handleReset}
          className="mt-8 inline-flex items-center justify-center gap-1.5 rounded-full border border-line bg-white px-5 py-2 text-xs font-semibold text-ink transition hover:border-gold-deep"
        >
          Send another enquiry
        </button>
      </div>
    );
  }

  // SUCCESS STATE: Course Enquiry (Confirmed 1-on-1 Discovery Call)
  if (bookingResult) {
    const timeSummary = formatMultiTimezoneSummary(
      bookingResult.startTimeUtc,
      bookingResult.timezone,
    );

    return (
      <div className="rounded-2xl bg-cream-deep p-6 sm:p-8 animate-fadeIn text-ink">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100 text-green-700">
            <CheckCircle2 className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-lg sm:text-xl font-bold tracking-tight text-ink">
              1-to-1 Discovery Call Confirmed with Roweena
            </h2>
          </div>
        </div>

        <p className="text-sm text-ink-soft mb-6 leading-relaxed">
          Thank you, <strong className="text-ink">{name}</strong>! Your 15-minute discovery consultation has been confirmed and synced to Roweena&apos;s unified calendar.
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

          <button
            type="button"
            onClick={handleReset}
            className="text-xs text-ink-soft hover:text-ink ml-auto underline"
          >
            Submit another enquiry
          </button>
        </div>
      </div>
    );
  }

  // INTERACTIVE SMART CONDITIONAL ROUTER FORM
  return (
    <form onSubmit={handleSubmit} className="space-y-5" noValidate>
      {/* 1. Enquiry Type Dropdown Toggle */}
      <div>
        <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-ink-soft">
          Enquiry Type *
        </label>
        <div className="grid grid-cols-2 gap-2 rounded-2xl bg-cream p-1.5 border border-line">
          <button
            type="button"
            onClick={() => {
              setInquiryType("GENERAL");
              setError("");
            }}
            className={`flex items-center justify-center gap-2 rounded-xl py-2.5 px-3 text-xs sm:text-sm font-semibold transition-all ${
              inquiryType === "GENERAL"
                ? "bg-white text-ink shadow-sm border border-sand"
                : "text-ink-soft hover:text-ink"
            }`}
          >
            <MessageCircle className="h-4 w-4 text-emerald-600" />
            <span>General Enquiry</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setInquiryType("COURSE");
              setError("");
            }}
            className={`flex items-center justify-center gap-2 rounded-xl py-2.5 px-3 text-xs sm:text-sm font-semibold transition-all ${
              inquiryType === "COURSE"
                ? "bg-white text-ink shadow-sm border border-sand"
                : "text-ink-soft hover:text-ink"
            }`}
          >
            <Video className="h-4 w-4 text-gold-deep" />
            <span>Course Enquiry (1-on-1 Zoom)</span>
          </button>
        </div>
      </div>

      {/* 2. PATH B: COURSE ENQUIRY CONDITIONAL FIELDS */}
      {inquiryType === "COURSE" && (
        <div className="rounded-2xl border border-gold/40 bg-gold/5 p-4 sm:p-5 space-y-4 animate-fadeIn">
          {/* Target Course Selector */}
          <div>
            <label htmlFor="courseSelect" className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-gold-deep">
              Target Course *
            </label>
            <select
              id="courseSelect"
              required
              value={selectedCourseId}
              onChange={(e) => setSelectedCourseId(e.target.value)}
              className="w-full rounded-xl border border-line bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-gold-deep focus:ring-1 focus:ring-gold-deep"
            >
              <option value="">
                {isLoadingCourses ? "Loading active courses..." : "-- Choose a Course --"}
              </option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
          </div>

          {/* Timezone Selector */}
          <div className="rounded-xl border border-sand bg-white p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
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
          <div>
            <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-ink-soft flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5" />
              <span>Select Date for 1-on-1 Consultation *</span>
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

          {/* Available Slots Grid */}
          <div>
            <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-ink-soft">
              Available 15-Minute Slots ({selectedDate}) *
            </label>

            {isLoadingSlots ? (
              <div className="py-6 text-center text-xs text-ink-soft bg-white rounded-xl border border-line">
                Checking Roweena&apos;s unified calendar availability...
              </div>
            ) : slots.length === 0 ? (
              <div className="py-6 text-center text-xs text-ink-soft bg-white rounded-xl border border-line">
                No open 15-minute slots on this date. Please pick another date above.
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 max-h-56 overflow-y-auto p-1.5 border border-sand bg-white/70 rounded-xl">
                {slots.map((slot) => {
                  const isSelected = selectedSlot?.slotStartUtc === slot.slotStartUtc;
                  return (
                    <button
                      key={slot.slotStartUtc}
                      type="button"
                      onClick={() => setSelectedSlot(slot)}
                      className={`p-2 rounded-xl border text-left transition flex flex-col justify-between ${
                        isSelected
                          ? "bg-gold/20 border-gold-deep text-ink ring-1 ring-gold-deep font-semibold"
                          : "bg-white border-line text-ink hover:border-gold-deep"
                      }`}
                    >
                      <span className="text-xs sm:text-sm font-bold block">{slot.timeLocal}</span>
                      <span className="text-[10px] text-ink-soft block mt-0.5">
                        {slot.timeGst} · {slot.timeIst}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 3. SHARED VISITOR FIELDS (Preserved on Switch) */}
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="fullName" className="mb-1.5 block text-sm font-semibold text-ink">
            Full Name *
          </label>
          <input
            id="fullName"
            required
            maxLength={120}
            autoComplete="name"
            placeholder="e.g. Jane Doe"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={FIELD}
          />
        </div>
        <div>
          <label htmlFor="emailAddr" className="mb-1.5 block text-sm font-semibold text-ink">
            Email Address *
          </label>
          <input
            id="emailAddr"
            type="email"
            required
            autoComplete="email"
            placeholder="e.g. jane@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={FIELD}
          />
        </div>
      </div>

      <div>
        <label htmlFor="phoneNum" className="mb-1.5 block text-sm font-semibold text-ink">
          Phone / WhatsApp Number (with Country Code) *
        </label>
        <input
          id="phoneNum"
          type="tel"
          required
          maxLength={40}
          autoComplete="tel"
          placeholder="e.g. +971 50 123 4567 or +91 98765 43210"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className={FIELD}
        />
        <span className="mt-1 block text-xs text-ink-soft">
          {inquiryType === "COURSE"
            ? "Used for sending calendar reminders and Zoom consultation details."
            : "Include your country dial code for connecting on WhatsApp."}
        </span>
      </div>

      <div>
        <label htmlFor="tellUsMessage" className="mb-1.5 block text-sm font-semibold text-ink">
          {inquiryType === "COURSE"
            ? "Your Goals & Topics for Consultation *"
            : "Tell us about your enquiry *"}
        </label>
        <textarea
          id="tellUsMessage"
          required
          rows={4}
          maxLength={3500}
          placeholder={
            inquiryType === "COURSE"
              ? "Tell us about your mental wellness journey, what you hope to achieve through this course, or questions for Roweena..."
              : "Tell us about your goals, corporate workshop, speaking engagement, or general questions..."
          }
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          className={FIELD}
        />
      </div>

      {/* Honeypot field (hidden visually from real users) */}
      <div aria-hidden="true" className="opacity-0 absolute -z-50 pointer-events-none h-0 w-0 overflow-hidden">
        <label htmlFor="botHoneypot">Do not fill this field</label>
        <input
          id="botHoneypot"
          tabIndex={-1}
          autoComplete="off"
          value={honeypot}
          onChange={(e) => setHoneypot(e.target.value)}
        />
      </div>

      {error && (
        <div role="alert" className="flex items-start gap-2 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          <AlertCircle className="h-5 w-5 shrink-0 text-red-600 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Dynamic CTA Button based on Enquiry Type */}
      <button
        type="submit"
        disabled={busy}
        className={`group flex w-full items-center justify-center gap-2 rounded-full py-3.5 px-8 text-sm font-semibold transition disabled:opacity-60 shadow-sm ${
          inquiryType === "GENERAL"
            ? "bg-emerald-600 text-white hover:bg-emerald-700"
            : "bg-ink text-cream hover:bg-gold hover:text-ink"
        }`}
      >
        {inquiryType === "GENERAL" ? (
          <>
            <MessageCircle className="h-4 w-4" />
            <span>{busy ? "Saving & Redirecting…" : "Continue to WhatsApp"}</span>
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </>
        ) : (
          <>
            <Video className="h-4 w-4" />
            <span>
              {busy
                ? "Reserving slot & booking Zoom…"
                : selectedSlot
                ? `Book 1-on-1 Consultation (${selectedSlot.timeLocal})`
                : "Book 1-on-1 Course Consultation"}
            </span>
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </>
        )}
      </button>
    </form>
  );
}
