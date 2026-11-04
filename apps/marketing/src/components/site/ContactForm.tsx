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
  Globe,
  User,
  Mail,
  Phone,
  FileText,
  ChevronDown,
} from "lucide-react";
import { API_BASE_URL } from "@/lib/api";
import {
  getTimezoneOptions,
  getSystemTimezone,
  formatMultiTimezoneSummary,
} from "@/lib/timezone";
import { buildWhatsAppEnquiryUrl, openWhatsAppSafely } from "@/lib/whatsapp";
import { useUser } from "@/lib/auth";

// URL course subscription
const subscribe = () => () => { };
const getCourseFromUrl = () => {
  if (typeof window === "undefined") return "";
  const params = new URLSearchParams(window.location.search);
  return params.get("course") || params.get("programId") || "";
};
const getServerCourse = () => "";

export interface ProgramOption {
  id: string;
  title: string;
  slug?: string;
  image?: string;
  category?: string;
  duration?: string;
}

export interface ContactFormProps {
  initialCourses?: ProgramOption[];
  onCourseChange?: (course: ProgramOption | null) => void;
}

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
  leadName?: string;
  leadEmail?: string;
  status?: string;
  isPendingApproval?: boolean;
}

/**
 * Architectural vector illustration of calendar & clock for the card header
 */
function ConsultationHeaderGraphic() {
  return (
    <svg width="96" height="68" viewBox="0 0 96 68" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Ambient warm glow */}
      <ellipse cx="52" cy="34" rx="42" ry="28" fill="#fff5e6" fillOpacity="0.85" />

      {/* Speech Bubble */}
      <g transform="translate(6, 8)">
        <rect x="0" y="0" width="30" height="22" rx="7" fill="#fffbf2" stroke="#f6deb5" strokeWidth="1.2" />
        <path d="M10 22L8 26L14 22H10Z" fill="#fffbf2" />
        <path d="M8 26L10 22" stroke="#f6deb5" strokeWidth="1.2" />
        <circle cx="9" cy="11" r="1.5" fill="#efa944" />
        <circle cx="15" cy="11" r="1.5" fill="#efa944" />
        <circle cx="21" cy="11" r="1.5" fill="#efa944" />
      </g>

      {/* Calendar body */}
      <g transform="translate(36, 4)">
        <rect x="2" y="4" width="48" height="44" rx="9" fill="#14110f" fillOpacity="0.04" />
        <rect x="0" y="3" width="48" height="44" rx="9" fill="#ffffff" stroke="#f0eae1" strokeWidth="1.3" />

        {/* Calendar Header Bar */}
        <path d="M0 12C0 7.02944 4.02944 3 9 3H39C43.9706 3 48 7.02944 48 12V14H0V12Z" fill="#fff5e6" />
        <rect x="10" y="1" width="2.5" height="5" rx="1.25" fill="#efa944" />
        <rect x="35" y="1" width="2.5" height="5" rx="1.25" fill="#efa944" />

        {/* Minimal Grid Dots */}
        <circle cx="12" cy="22" r="1.8" fill="#f3eee6" />
        <circle cx="24" cy="22" r="1.8" fill="#f3eee6" />
        <circle cx="36" cy="22" r="1.8" fill="#f3eee6" />
        <circle cx="12" cy="30" r="1.8" fill="#f3eee6" />
        <circle cx="24" cy="30" r="1.8" fill="#efa944" />
        <circle cx="36" cy="30" r="1.8" fill="#f3eee6" />
        <circle cx="12" cy="38" r="1.8" fill="#f3eee6" />
        <circle cx="24" cy="38" r="1.8" fill="#f3eee6" />
        <circle cx="36" cy="38" r="1.8" fill="#f3eee6" />

        {/* Clock Badge */}
        <g transform="translate(31, 30)">
          <circle cx="11" cy="11" r="10" fill="#ea580c" stroke="#ffffff" strokeWidth="2" />
          <circle cx="11" cy="11" r="8" fill="#f97316" />
          <path d="M11 7V11L14 13" stroke="#ffffff" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      </g>
    </svg>
  );
}

  export default function ContactForm({
    initialCourses,
    onCourseChange,
  }: ContactFormProps = {}) {
    const urlCourseParam = useSyncExternalStore(subscribe, getCourseFromUrl, getServerCourse);
    const user = useUser();
    const [showEnquiryForm, setShowEnquiryForm] = useState(false);

    // 1. Shared Form State
    const [inquiryType, setInquiryType] = useState<"GENERAL" | "COURSE">("GENERAL");
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [phone, setPhone] = useState("");
    const [message, setMessage] = useState("");
    const [honeypot, setHoneypot] = useState("");

    // 2. Course Selection State
    const [courses, setCourses] = useState<ProgramOption[]>(initialCourses || []);
    const [selectedCourseId, setSelectedCourseId] = useState("");
    const [isLoadingCourses, setIsLoadingCourses] = useState(false);


    // Synchronize initialCourses if passed
    useEffect(() => {
      if (initialCourses && initialCourses.length > 0) {
        setCourses(initialCourses);
        if (urlCourseParam) {
          const paramLower = urlCourseParam.toLowerCase();
          const matched = initialCourses.find(
            (p) =>
              p.slug?.toLowerCase() === paramLower ||
              p.title?.toLowerCase() === paramLower ||
              p.id === urlCourseParam,
          );
          if (matched) {
            setSelectedCourseId(matched.id);
            onCourseChange?.(matched);
          }
        } else if (!selectedCourseId) {
          setSelectedCourseId(initialCourses[0]!.id);
          onCourseChange?.(initialCourses[0]!);
        }
      }
    }, [initialCourses, urlCourseParam]);

    // Notify parent on course selection change
    useEffect(() => {
      if (selectedCourseId && courses.length > 0) {
        const matched = courses.find((p) => p.id === selectedCourseId) || null;
        onCourseChange?.(matched);
      }
    }, [selectedCourseId, courses, onCourseChange]);

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

    // Synchronize logged-in user details into form fields
    useEffect(() => {
      if (user?.name && !name) setName(user.name);
      if (user?.email && !email) setEmail(user.email);
    }, [user]);

    // Check for existing upcoming 1-to-1 discovery session on mount
    useEffect(() => {
      let isMounted = true;

      // 1. Check local storage for immediate display
      if (typeof window !== "undefined") {
        try {
          const localRaw = localStorage.getItem("wbm_discovery_call");
          if (localRaw) {
            const parsed = JSON.parse(localRaw);
            if (parsed?.startTimeUtc) {
              const startTime = new Date(parsed.startTimeUtc).getTime();
              if (startTime > Date.now() - 24 * 3600 * 1000) {
                setBookingResult(parsed);
                if (parsed.leadName && !name) setName(parsed.leadName);
                if (parsed.leadEmail && !email) setEmail(parsed.leadEmail);
              }
            }
          }
        } catch {}
      }

      // 2. Fetch fresh status from backend API
      const lookupEmail = user?.email || (typeof window !== "undefined" ? localStorage.getItem("wbm_user_email") || "" : "");
      let lookupSessionId = "";
      if (typeof window !== "undefined") {
        try {
          const localRaw = localStorage.getItem("wbm_discovery_call");
          if (localRaw) lookupSessionId = JSON.parse(localRaw)?.sessionId || "";
        } catch {}
      }

      if (lookupEmail || lookupSessionId || user?.id) {
        const query = new URLSearchParams();
        if (lookupEmail) query.set("email", lookupEmail);
        if (user?.id) query.set("userId", user.id);
        if (lookupSessionId) query.set("sessionId", lookupSessionId);
        query.set("timezone", selectedTz || getSystemTimezone());

        fetch(`${API_BASE_URL}/meetings/discovery/my-call?${query.toString()}`, {
          headers: {
            ...(typeof window !== "undefined" && localStorage.getItem("wbm_token")
              ? { Authorization: `Bearer ${localStorage.getItem("wbm_token")}` }
              : {}),
          },
        })
          .then((res) => (res.ok ? res.json() : null))
          .then((data) => {
            if (isMounted && data?.hasBooking && data?.booking) {
              setBookingResult(data.booking);
              if (data.booking.leadName && !name) setName(data.booking.leadName);
              if (data.booking.leadEmail && !email) setEmail(data.booking.leadEmail);
              try {
                localStorage.setItem("wbm_discovery_call", JSON.stringify(data.booking));
              } catch {}
            }
          })
          .catch((err) => {
            console.warn("Could not check existing discovery booking:", err);
          });
      }

      return () => {
        isMounted = false;
      };
    }, [user?.email, user?.id]);

    // Polling interval if call is pending coach acceptance (reveals Zoom link as soon as accepted)
    useEffect(() => {
      if (!bookingResult || bookingResult.zoomJoinUrl) return;

      const interval = setInterval(async () => {
        try {
          const lookupEmail = user?.email || (typeof window !== "undefined" ? localStorage.getItem("wbm_user_email") || "" : "");
          const query = new URLSearchParams();
          if (lookupEmail) query.set("email", lookupEmail);
          if (bookingResult.sessionId) query.set("sessionId", bookingResult.sessionId);
          query.set("timezone", selectedTz || getSystemTimezone());

          const res = await fetch(`${API_BASE_URL}/meetings/discovery/my-call?${query.toString()}`).catch(() => null);
          if (res && res.ok) {
            const data = await res.json();
            if (data?.hasBooking && data?.booking) {
              setBookingResult(data.booking);
              try {
                localStorage.setItem("wbm_discovery_call", JSON.stringify(data.booking));
              } catch {}
            }
          }
        } catch {}
      }, 15000);

      return () => clearInterval(interval);
    }, [bookingResult?.sessionId, bookingResult?.zoomJoinUrl, user?.email, selectedTz]);


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

      // PATH A: GENERAL ENQUIRY -> Lead Persistence + WhatsApp Redirect
      if (inquiryType === "GENERAL") {
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

          openWhatsAppSafely(targetWaUrl, popupWin);
          setGeneralSubmitted(true);
        } catch (err: any) {
          console.warn("Could not dispatch lead record:", err);
          openWhatsAppSafely(targetWaUrl, popupWin);
          setGeneralSubmitted(true);
        } finally {
          setBusy(false);
        }
        return;
      }

      // PATH B: COURSE ENQUIRY -> Course Validation + 1-on-1 Discovery Booking
      if (!selectedCourseId) {
        setError("Please select the course you are enquiring about.");
        return;
      }

      if (!selectedSlot || selectedSlot.isBooked) {
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
          setShowEnquiryForm(false);
          try {
            localStorage.setItem("wbm_discovery_call", JSON.stringify({
              ...data,
              leadName: name.trim(),
              leadEmail: email.trim().toLowerCase(),
            }));
            localStorage.setItem("wbm_user_email", email.trim().toLowerCase());
          } catch {}
        } else if (res.status === 409) {
          const errJson = await res.json().catch(() => null);
          setError(
            errJson?.message ||
            "This 15-minute slot was just claimed by another prospect. Please select another time from the refreshed slots below.",
          );
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
      setShowEnquiryForm(true);
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
        <div role="status" className="rounded-3xl bg-[#fffbf2] border border-[#f0eae1] p-6 sm:p-10 text-center animate-fadeIn text-ink">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 mb-4 shadow-xs">
            <MessageCircle className="h-8 w-8" />
          </div>
          <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-ink">
            Thank You, {name}!
          </h2>
          <p className="mt-3 text-sm sm:text-base text-ink-soft max-w-md mx-auto leading-relaxed">
            Your general enquiry has been saved. We are redirecting you to WhatsApp to connect directly with Roweena and our coaching team.
          </p>

          <div className="mt-7 flex flex-col items-center justify-center gap-3">
            <a
              href={waUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-8 py-3.5 text-sm sm:text-base font-bold text-white shadow-md hover:bg-emerald-700 transition"
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
    if (bookingResult && !showEnquiryForm) {
      const timeSummary = formatMultiTimezoneSummary(
        bookingResult.startTimeUtc,
        bookingResult.timezone,
      );

      return (
        <div className="rounded-3xl bg-[#fffbf2] border border-[#f0eae1] p-6 sm:p-10 animate-fadeIn text-ink">
          {bookingResult.zoomJoinUrl ? (
            <>
              <div className="flex items-center gap-3.5 mb-5">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 shrink-0">
                  <CheckCircle2 className="h-6 w-6" />
                </div>
                <div>
                  <h2 className="text-xl sm:text-2xl font-extrabold tracking-tight text-ink">
                    1-to-1 Discovery Call Confirmed
                  </h2>
                  <p className="text-xs sm:text-sm text-ink-soft mt-0.5">
                    Synced to Roweena&apos;s unified calendar
                  </p>
                </div>
              </div>

              <p className="text-sm text-ink-soft mb-6 leading-relaxed">
                Thank you, <strong className="text-ink">{name || bookingResult.leadName || "there"}</strong>! Your 15-minute discovery consultation has been confirmed.
              </p>

              {/* Multi-Timezone Schedule Card */}
              <div className="rounded-2xl border border-line bg-white p-4 sm:p-5 mb-5 space-y-3.5 shadow-xs">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-ink-soft">
                  <Clock className="h-4 w-4 text-gold-deep" />
                  <span>Scheduled Meeting Time</span>
                </div>

                <div className="text-base sm:text-lg font-extrabold text-ink">
                  {timeSummary.fullDate}
                </div>

                <div className="grid gap-2.5 sm:grid-cols-3 pt-1 text-xs">
                  <div className="p-3 rounded-xl bg-cream border border-sand">
                    <span className="text-[11px] font-semibold text-ink-soft block">Your Timezone</span>
                    <span className="font-bold text-ink text-sm block mt-0.5">{timeSummary.local}</span>
                  </div>
                  <div className="p-3 rounded-xl bg-cream border border-sand">
                    <span className="text-[11px] font-semibold text-ink-soft block">Dubai Time</span>
                    <span className="font-bold text-ink text-sm block mt-0.5">{timeSummary.gst}</span>
                  </div>
                  <div className="p-3 rounded-xl bg-cream border border-sand">
                    <span className="text-[11px] font-semibold text-ink-soft block">India Time</span>
                    <span className="font-bold text-ink text-sm block mt-0.5">{timeSummary.ist}</span>
                  </div>
                </div>
              </div>

              {/* Zoom Link Container */}
              <div className="rounded-2xl border border-gold/40 bg-gold/10 p-4 sm:p-5 mb-5 space-y-3 shadow-xs">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-gold-deep flex items-center gap-1.5">
                    <Video className="h-4 w-4" />
                    <span>Zoom Meeting Link</span>
                  </span>
                  <span className="text-[11px] font-semibold text-ink-soft bg-white/80 px-2.5 py-0.5 rounded-full border border-gold/30">
                    Duration: 15 Mins
                  </span>
                </div>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                  <input
                    readOnly
                    value={bookingResult.zoomJoinUrl}
                    className="w-full rounded-xl border border-line bg-white px-3.5 py-2.5 text-xs font-mono text-ink outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleCopyZoomLink}
                    className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl border border-line bg-white px-4 py-2.5 text-xs font-bold text-ink hover:border-gold-deep transition"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    <span>{copiedZoom ? "Copied!" : "Copy Link"}</span>
                  </button>
                  <a
                    href={bookingResult.zoomJoinUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl bg-ink px-4 py-2.5 text-xs font-bold text-cream hover:bg-gold hover:text-ink transition"
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
                  className="inline-flex items-center gap-2 rounded-2xl border border-line bg-white px-5 py-3 text-xs font-bold text-ink hover:border-gold-deep transition shadow-xs"
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
            </>
          ) : (
            <>
              {/* PENDING COACH ACCEPTANCE (Zoom link generated only after coach accepts) */}
              <div className="flex items-center gap-3.5 mb-5">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-amber-700 shrink-0">
                  <Clock className="h-6 w-6" />
                </div>
                <div>
                  <h2 className="text-xl sm:text-2xl font-extrabold tracking-tight text-ink">
                    1-to-1 Discovery Call Requested
                  </h2>
                  <p className="text-xs sm:text-sm text-ink-soft mt-0.5">
                    Request submitted &amp; pending coach confirmation
                  </p>
                </div>
              </div>

              {/* Pending Notice Banner */}
              <div className="rounded-2xl border border-amber-300/80 bg-amber-50/70 p-4 mb-5 text-xs text-amber-950 leading-relaxed shadow-xs flex items-start gap-3">
                <Clock className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold text-amber-950 text-sm">Status: Pending Coach Confirmation</p>
                  <p className="mt-1 text-amber-900">
                    Thank you, <strong>{name || bookingResult.leadName || "there"}</strong>! We have received your consultation request. Roweena and our team will review the slot and confirm your request. Once accepted, your official Zoom meeting link and calendar invite will be emailed to <strong>{email || bookingResult.leadEmail}</strong>.
                  </p>
                </div>
              </div>

              {/* Multi-Timezone Schedule Card */}
              <div className="rounded-2xl border border-line bg-white p-4 sm:p-5 mb-5 space-y-3.5 shadow-xs">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-ink-soft">
                  <Clock className="h-4 w-4 text-gold-deep" />
                  <span>Requested Meeting Time</span>
                </div>

                <div className="text-base sm:text-lg font-extrabold text-ink">
                  {timeSummary.fullDate}
                </div>

                <div className="grid gap-2.5 sm:grid-cols-3 pt-1 text-xs">
                  <div className="p-3 rounded-xl bg-cream border border-sand">
                    <span className="text-[11px] font-semibold text-ink-soft block">Your Timezone</span>
                    <span className="font-bold text-ink text-sm block mt-0.5">{timeSummary.local}</span>
                  </div>
                  <div className="p-3 rounded-xl bg-cream border border-sand">
                    <span className="text-[11px] font-semibold text-ink-soft block">Dubai Time</span>
                    <span className="font-bold text-ink text-sm block mt-0.5">{timeSummary.gst}</span>
                  </div>
                  <div className="p-3 rounded-xl bg-cream border border-sand">
                    <span className="text-[11px] font-semibold text-ink-soft block">India Time</span>
                    <span className="font-bold text-ink text-sm block mt-0.5">{timeSummary.ist}</span>
                  </div>
                </div>
              </div>

              {/* Zoom Link Info (Before Acceptance) */}
              <div className="rounded-2xl border border-line bg-white/90 p-4 sm:p-5 mb-5 space-y-2 text-xs shadow-xs">
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
                <button
                  type="button"
                  onClick={handleReset}
                  className="text-xs text-ink-soft hover:text-ink ml-auto underline"
                >
                  Submit another enquiry
                </button>
              </div>
            </>
          )}
        </div>
      );
    }

    // ── MAIN INTERACTIVE CONSULTATION FORM ────────────────────────────────
    return (
      <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-4.5" noValidate>
        {bookingResult && (
          <div className="rounded-2xl border border-amber-300/80 bg-amber-50/90 p-3.5 mb-4 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2 shadow-xs">
            <div className="flex items-center gap-2 text-amber-950 font-medium">
              <Calendar className="h-4 w-4 text-amber-600 shrink-0" />
              <span>
                You have a 1-to-1 discovery call {bookingResult.zoomJoinUrl ? "confirmed" : "requested"} for <strong>{bookingResult.dateFormatted || formatMultiTimezoneSummary(bookingResult.startTimeUtc, bookingResult.timezone).fullDate}</strong>.
              </span>
            </div>
            <button
              type="button"
              onClick={() => setShowEnquiryForm(false)}
              className="inline-flex items-center justify-center gap-1 shrink-0 rounded-xl bg-ink text-white px-3.5 py-1.5 text-xs font-bold hover:bg-gold hover:text-ink transition cursor-pointer"
            >
              <span>View Meeting &amp; Zoom Link</span>
              <ArrowRight className="h-3 w-3" />
            </button>
          </div>
        )}
        {/* 1. Card Header with Floating Graphic */}
        <div className="relative pb-0.5">
          {/* Top-Right Decorative Vector Graphic (hidden on small phones to preserve title width) */}
          <div className="absolute right-0 top-0 hidden sm:block pointer-events-none">
            <ConsultationHeaderGraphic />
          </div>

          {/* Title & Badge with safe clearance */}
          <div className="sm:pr-28">
            <div className="inline-flex items-center gap-1.5 rounded-md border border-amber-300/80 bg-[#FFF7ED] px-2.5 py-0.5 text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-amber-900 mb-2">
              <Calendar className="h-3 w-3 text-amber-700" />
              <span>Book a Consultation</span>
            </div>

            <h2 className="text-xl sm:text-2xl md:text-[1.7rem] font-black tracking-tight text-[#1A1412] leading-tight">
              Book a 1-on-1 Course Consultation
            </h2>
            <p className="mt-1 text-xs sm:text-sm text-stone-500 leading-relaxed font-normal">
              Fill in the details below and choose a convenient time slot. Our team will connect with you.
            </p>
          </div>
        </div>

        {/* 2. Enquiry Type Segmented Cards */}
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-stone-700">
            Enquiry Type *
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3">
            {/* Option 1: General Enquiry */}
            <button
              type="button"
              onClick={() => {
                setInquiryType("GENERAL");
                setError("");
              }}
              className={`relative flex items-center gap-3 rounded-2xl p-3 text-left border transition-all ${inquiryType === "GENERAL"
                  ? "bg-[#FFFBF5] border-[#E5A84B] ring-1 ring-[#E5A84B]/40 shadow-xs"
                  : "bg-white border-stone-200/90 hover:border-amber-400/60 hover:bg-[#FFFBF5]/30"
                }`}
            >
              <div
                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${inquiryType === "GENERAL" ? "border-[#D97706] bg-white" : "border-stone-300"
                  }`}
              >
                {inquiryType === "GENERAL" && (
                  <div className="h-2 w-2 rounded-full bg-[#D97706]" />
                )}
              </div>

              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#FFEDD0] text-[#9A4C0A]">
                <MessageCircle className="h-4 w-4" />
              </div>

              <div className="min-w-0 flex-1">
                <span className="block text-xs sm:text-sm font-bold text-[#1A1412]">General Enquiry</span>
                <span className="block text-[11px] text-stone-500 mt-0.5 leading-tight">
                  General questions about our programs
                </span>
              </div>
            </button>

            {/* Option 2: Course Enquiry */}
            <button
              type="button"
              onClick={() => {
                setInquiryType("COURSE");
                setError("");
              }}
              className={`relative flex items-center gap-3 rounded-2xl p-3 text-left border transition-all ${inquiryType === "COURSE"
                  ? "bg-[#FFFBF5] border-[#E5A84B] ring-1 ring-[#E5A84B]/40 shadow-xs"
                  : "bg-white border-stone-200/90 hover:border-amber-400/60 hover:bg-[#FFFBF5]/30"
                }`}
            >
              <div
                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${inquiryType === "COURSE" ? "border-[#D97706] bg-white" : "border-stone-300"
                  }`}
              >
                {inquiryType === "COURSE" && (
                  <div className="h-2 w-2 rounded-full bg-[#D97706]" />
                )}
              </div>

              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#FFEDD0] text-[#9A4C0A]">
                <Video className="h-4 w-4" />
              </div>

              <div className="min-w-0 flex-1">
                <span className="block text-xs sm:text-sm font-bold text-[#1A1412]">Course Enquiry (1-on-1 Zoom)</span>
                <span className="block text-[11px] text-stone-500 mt-0.5 leading-tight">
                  Book a personalised consultation call
                </span>
              </div>
            </button>
          </div>
        </div>

        {/* 3. PATH B: COURSE ENQUIRY CONDITIONAL FIELDS */}
        {inquiryType === "COURSE" && (
          <div className="space-y-3.5 pt-0.5 animate-fadeIn">
            {/* Target Course Selector */}
            <div>
              <label htmlFor="courseSelect" className="mb-1 block text-xs font-semibold text-stone-700">
                Target Course *
              </label>
              <div className="relative">
                <select
                  id="courseSelect"
                  required
                  value={selectedCourseId}
                  onChange={(e) => {
                    const val = e.target.value;
                    setSelectedCourseId(val);
                    const matched = courses.find((c) => c.id === val) || null;
                    onCourseChange?.(matched);
                  }}
                  className="w-full h-11 sm:h-12 appearance-none rounded-xl border border-stone-200 bg-white px-3.5 text-xs sm:text-sm font-medium text-[#1A1412] outline-none transition focus:border-amber-600 focus:ring-2 focus:ring-amber-500/20 pr-10"
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
                <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-400" />
              </div>
            </div>

            {/* Timezone Selector */}
            <div>
              <label htmlFor="tzSelect" className="mb-1 block text-xs font-semibold text-stone-700">
                Your Timezone *
              </label>
              <div className="relative">
                <div className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400">
                  <Globe className="h-4 w-4" />
                </div>
                <select
                  id="tzSelect"
                  value={selectedTz}
                  onChange={(e) => setSelectedTz(e.target.value)}
                  className="w-full h-11 sm:h-12 appearance-none rounded-xl border border-stone-200 bg-white pl-10 pr-10 text-xs sm:text-sm font-medium text-[#1A1412] outline-none transition focus:border-amber-600 focus:ring-2 focus:ring-amber-500/20"
                >
                  {tzOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-400" />
              </div>
            </div>

            {/* Date Selector Carousel */}
            <div>
              <label className="mb-1 block text-xs font-semibold text-stone-700">
                Select Date for 1-on-1 Consultation *
              </label>
              <div className="flex gap-2 overflow-x-auto pb-1 pt-0.5 snap-x snap-mandatory [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {dateOptions.map((d) => {
                  const isSelected = selectedDate === d.iso;
                  return (
                    <button
                      key={d.iso}
                      type="button"
                      onClick={() => setSelectedDate(d.iso)}
                      className={`shrink-0 snap-start rounded-full px-3.5 py-1.5 text-xs font-medium border transition text-center min-h-[36px] flex items-center justify-center ${isSelected
                          ? "bg-[#1C1816] text-white border-[#1C1816] shadow-xs"
                          : "bg-white text-stone-700 border-stone-200/90 hover:border-amber-400 hover:bg-[#FFFBF5]/40"
                        }`}
                    >
                      <span>{d.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Available Slots Grid */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-semibold text-stone-700">
                  Available 15-Minute Slots ({selectedDate}) *
                </label>
                {slots.length > 0 && !isLoadingSlots && (
                  <div className="flex items-center gap-2.5 text-[10px] text-stone-500 font-medium">
                    <span className="inline-flex items-center gap-1">
                      <span className="h-2 w-2 rounded-full bg-amber-500 ring-2 ring-amber-500/20" />
                      <span>Available</span>
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <span className="h-2 w-2 rounded-full bg-rose-500" />
                      <span>Already Booked</span>
                    </span>
                  </div>
                )}
              </div>

              {isLoadingSlots ? (
                <div className="py-6 text-center text-xs text-stone-500 bg-stone-50/70 rounded-xl border border-stone-200 flex items-center justify-center gap-2">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-amber-600 border-t-transparent" />
                  <span>Checking Roweena&apos;s unified calendar availability...</span>
                </div>
              ) : slots.length === 0 ? (
                <div className="py-6 text-center text-xs text-stone-500 bg-stone-50/70 rounded-xl border border-stone-200">
                  No 15-minute slots on this date. Please pick another date above.
                </div>
              ) : (
                <>
                  {slots.length > 0 && slots.every((s) => s.isBooked) && (
                    <div className="mb-2 p-2.5 rounded-xl bg-amber-50/80 border border-amber-200/80 text-xs text-amber-800 flex items-center gap-2">
                      <Clock className="h-4 w-4 shrink-0 text-amber-700" />
                      <span>All slots on this date are already booked. Please choose another date from the calendar above.</span>
                    </div>
                  )}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-2.5 pt-0.5">
                    {slots.map((slot) => {
                      const isBooked = Boolean(slot.isBooked);
                      const isSelected = !isBooked && selectedSlot?.slotStartUtc === slot.slotStartUtc;
                      return (
                        <button
                          key={slot.slotStartUtc}
                          type="button"
                          disabled={isBooked}
                          aria-disabled={isBooked}
                          title={isBooked ? "Already booked for this time period" : `Select 15-minute slot at ${slot.timeLocal}`}
                          onClick={() => {
                            if (isBooked) return;
                            setSelectedSlot(slot);
                          }}
                          className={`p-2.5 rounded-xl border text-left transition flex flex-col justify-between min-h-[58px] relative ${
                            isBooked
                              ? "bg-stone-50/90 border-stone-200/90 text-stone-400 cursor-not-allowed select-none"
                              : isSelected
                                ? "bg-[#FFFBF5] border-[#E5A84B] ring-1 ring-[#E5A84B]/40 text-[#1A1412] font-semibold shadow-xs"
                                : "bg-white border-stone-200 text-[#1A1412] hover:border-amber-400/80 hover:bg-[#FFFBF5]/30 cursor-pointer"
                          }`}
                        >
                          <div className="flex items-center justify-between w-full">
                            <span className={`text-xs sm:text-sm font-bold flex items-center gap-1.5 ${isBooked ? "text-stone-400 line-through decoration-stone-300" : "text-stone-900"}`}>
                              <Clock className={`h-3.5 w-3.5 shrink-0 ${isBooked ? "text-stone-300" : isSelected ? "text-[#E5A84B]" : "text-amber-600"}`} />
                              <span>{slot.timeLocal}</span>
                            </span>
                            {isBooked ? (
                              <span className="text-[9px] font-bold uppercase tracking-tight px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200/80 leading-none">
                                Already Booked
                              </span>
                            ) : isSelected ? (
                              <span className="text-[9px] font-bold uppercase tracking-tight px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-300/80 leading-none">
                                Selected
                              </span>
                            ) : null}
                          </div>
                          <span className={`text-[10px] block mt-1 font-normal leading-tight ${isBooked ? "text-rose-600/70" : "text-stone-400"}`}>
                            {isBooked ? "Already booked for this time period" : `${slot.timeGst} · ${slot.timeIst}`}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* 4. SHARED VISITOR FIELDS (Preserved across Enquiry Toggle) */}
        <div className="grid gap-3 sm:grid-cols-2 pt-0.5">
          <div>
            <label htmlFor="fullName" className="mb-1 block text-xs font-semibold text-stone-700">
              Full Name *
            </label>
            <div className="relative">
              <div className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400">
                <User className="h-4 w-4" />
              </div>
              <input
                id="fullName"
                required
                maxLength={120}
                autoComplete="name"
                placeholder="e.g. Jane Doe"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full h-11 sm:h-12 rounded-xl border border-stone-200 bg-white pl-10 pr-4 text-xs sm:text-sm font-medium text-[#1A1412] placeholder:text-stone-400 outline-none transition focus:border-amber-600 focus:ring-2 focus:ring-amber-500/20"
              />
            </div>
          </div>

          <div>
            <label htmlFor="emailAddr" className="mb-1 block text-xs font-semibold text-stone-700">
              Email Address *
            </label>
            <div className="relative">
              <div className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400">
                <Mail className="h-4 w-4" />
              </div>
              <input
                id="emailAddr"
                type="email"
                required
                autoComplete="email"
                placeholder="e.g. jane@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full h-11 sm:h-12 rounded-xl border border-stone-200 bg-white pl-10 pr-4 text-xs sm:text-sm font-medium text-[#1A1412] placeholder:text-stone-400 outline-none transition focus:border-amber-600 focus:ring-2 focus:ring-amber-500/20"
              />
            </div>
          </div>
        </div>

        <div>
          <label htmlFor="phoneNum" className="mb-1 block text-xs font-semibold text-stone-700">
            Phone / WhatsApp Number (with Country Code) *
          </label>
          <div className="relative">
            <div className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400">
              <Phone className="h-4 w-4" />
            </div>
            <input
              id="phoneNum"
              type="tel"
              required
              maxLength={40}
              autoComplete="tel"
              placeholder="e.g. +971 50 123 4567 or +91 98765 43210"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full h-11 sm:h-12 rounded-xl border border-stone-200 bg-white pl-10 pr-4 text-xs sm:text-sm font-medium text-[#1A1412] placeholder:text-stone-400 outline-none transition focus:border-amber-600 focus:ring-2 focus:ring-amber-500/20"
            />
          </div>
          <span className="mt-1 block text-[11px] text-stone-500">
            {inquiryType === "COURSE"
              ? "Used for sending calendar reminders and Zoom consultation details."
              : "Include your country dial code for connecting on WhatsApp."}
          </span>
        </div>

        <div>
          <label htmlFor="tellUsMessage" className="mb-1 block text-xs font-semibold text-stone-700">
            {inquiryType === "COURSE"
              ? "Your Goals & Topics for Consultation *"
              : "Tell us about your enquiry *"}
          </label>
          <div className="relative">
            <div className="pointer-events-none absolute left-3.5 top-3.5 text-stone-400">
              <FileText className="h-4 w-4" />
            </div>
            <textarea
              id="tellUsMessage"
              required
              rows={3}
              maxLength={500}
              placeholder={
                inquiryType === "COURSE"
                  ? "Tell us about your mental wellness journey, what you hope to achieve through this course, or questions for Roweena..."
                  : "Tell us about your goals, corporate workshop, speaking engagement, or general questions..."
              }
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="w-full rounded-xl border border-stone-200 bg-white pl-10 pr-4 pt-3 pb-7 text-xs sm:text-sm font-medium text-[#1A1412] placeholder:text-stone-400 outline-none transition focus:border-amber-600 focus:ring-2 focus:ring-amber-500/20 resize-y min-h-[96px]"
            />
            <span className="absolute right-3.5 bottom-2 text-[10px] font-mono text-stone-400">
              {message.length}/500
            </span>
          </div>
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
          <div role="alert" className="flex items-start gap-2.5 rounded-xl bg-red-50 border border-red-200 px-4 py-2.5 text-xs sm:text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0 text-red-600 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Dynamic CTA Button based on Enquiry Type */}
        <button
          type="submit"
          disabled={busy}
          className={`group flex w-full h-11 sm:h-12 items-center justify-center gap-2 rounded-xl sm:rounded-2xl px-6 text-xs sm:text-sm font-medium transition-all disabled:opacity-60 shadow-xs hover:shadow-md active:scale-[0.99] ${inquiryType === "GENERAL"
              ? "bg-emerald-600 text-white hover:bg-emerald-700"
              : "bg-[#1C1815] text-white hover:bg-black"
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
              <Calendar className="h-4 w-4 text-stone-300" />
              <span>
                {busy
                  ? "Reserving slot & booking Zoom…"
                  : selectedSlot
                    ? `Book 1-on-1 Course Consultation (${selectedSlot.timeLocal})`
                    : "Book 1-on-1 Course Consultation"}
              </span>
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </>
          )}
        </button>
      </form>
    );
  }
