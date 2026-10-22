"use client";

import { useEffect, useState, useSyncExternalStore, type FormEvent } from "react";
import { ArrowRight, CheckCircle2, Calendar } from "lucide-react";
import { API_BASE_URL } from "@/lib/api";
import DiscoveryCallBooking from "./DiscoveryCallBooking";

const FIELD =
  "w-full rounded-xl border border-line bg-cream px-4 py-3 text-ink outline-none transition-colors focus:border-gold-deep focus:bg-white text-sm sm:text-base";

// URL course subscription
const subscribe = () => () => {};
const getCourseFromUrl = () => {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get("course") ?? "";
};
const getServerCourse = () => "";

interface ProgramOption {
  id: string;
  title: string;
  slug?: string;
}

interface SubmissionResult {
  success: boolean;
  inquiryType: "GENERAL" | "COURSE";
  leadId?: string;
  courseTitle?: string;
  courseId?: string;
}

export default function ContactForm() {
  const urlCourseParam = useSyncExternalStore(subscribe, getCourseFromUrl, getServerCourse);

  const [inquiryType, setInquiryType] = useState<"GENERAL" | "COURSE">("GENERAL");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [selectedCourseId, setSelectedCourseId] = useState("");
  const [message, setMessage] = useState("");
  const [honeypot, setHoneypot] = useState("");

  const [courses, setCourses] = useState<ProgramOption[]>([]);
  const [isLoadingCourses, setIsLoadingCourses] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<SubmissionResult | null>(null);

  // Auto-switch to COURSE if URL parameter ?course=... is provided
  useEffect(() => {
    if (urlCourseParam) {
      setInquiryType("COURSE");
    }
  }, [urlCourseParam]);

  // Check for direct discovery scheduler query params (?discovery=true)
  useEffect(() => {
    if (typeof window !== "undefined") {
      const sp = new URLSearchParams(window.location.search);
      if (sp.get("discovery") === "true") {
        const leadId = sp.get("leadId") || undefined;
        const cId = sp.get("courseId") || undefined;
        const cTitle = sp.get("courseTitle") || undefined;
        const n = sp.get("name") || "";
        const e = sp.get("email") || "";
        const p = sp.get("phone") || "";
        if (n) setName(n);
        if (e) setEmail(e);
        if (p) setPhone(p);
        setInquiryType("COURSE");
        setResult({
          success: true,
          inquiryType: "COURSE",
          leadId,
          courseId: cId,
          courseTitle: cTitle,
        });
      }
    }
  }, []);

  // Fetch active public courses for the conditional dropdown
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

            // Pre-select matching course from url parameter
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
            }
          }
        }
      } catch (err) {
        console.warn("Could not fetch active programs roster:", err);
      } finally {
        if (isMounted) setIsLoadingCourses(false);
      }
    };

    fetchCourses();
    return () => {
      isMounted = false;
    };
  }, [urlCourseParam]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");

    // 1. Validation checks
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

    if (inquiryType === "COURSE" && !selectedCourseId) {
      setError("Please select the course you are enquiring about from the dropdown.");
      return;
    }

    if (!message.trim()) {
      setError("Please tell us about yourself or your enquiry.");
      return;
    }

    const selectedCourse = courses.find((c) => c.id === selectedCourseId);
    setBusy(true);

    try {
      const payload = {
        name: name.trim(),
        email: email.trim().toLowerCase(),
        phone: phone.trim(),
        inquiryType,
        courseId: inquiryType === "COURSE" ? selectedCourseId : undefined,
        selectedCourseId: inquiryType === "COURSE" ? selectedCourseId : undefined,
        courseTitle: selectedCourse?.title,
        message: message.trim(),
        honeypot: honeypot.trim() || undefined,
      };

      // Send to /contact with fallback to /leads
      let res = await fetch(`${API_BASE_URL}/contact`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok && res.status === 404) {
        res = await fetch(`${API_BASE_URL}/leads`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }

      if (res.ok) {
        const json = await res.json().catch(() => ({}));
        setResult({
          success: true,
          inquiryType,
          leadId: json.leadId || json.id,
          courseTitle: selectedCourse?.title,
          courseId: selectedCourseId,
        });
      } else if (res.status === 429) {
        setError("Too many messages submitted. Please wait a minute and try again.");
      } else {
        const data = await res.json().catch(() => null);
        setError(data?.message || data?.error?.message || "Could not submit enquiry. Please try again.");
      }
    } catch {
      setError("Network error connecting to the server. Please try again in a moment.");
    } finally {
      setBusy(false);
    }
  };

  const handleReset = () => {
    setResult(null);
    setMessage("");
    setError("");
  };

  // SUCCESS CONFIRMATION STATE
  if (result) {
    if (result.inquiryType === "COURSE") {
      return (
        <DiscoveryCallBooking
          leadId={result.leadId}
          name={name}
          email={email}
          phone={phone}
          courseId={result.courseId}
          courseTitle={result.courseTitle}
          onBack={handleReset}
        />
      );
    }

    // General Inquiry Success Card
    return (
      <div role="status" className="rounded-2xl bg-cream-deep p-6 sm:p-8 text-center animate-fadeIn">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-green-100 text-green-700 mb-4">
          <CheckCircle2 className="h-7 w-7" />
        </div>
        <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-ink">Thank You, {name}!</h2>
        <p className="mt-2 text-sm sm:text-base text-ink-soft max-w-md mx-auto leading-relaxed">
          Your general enquiry has been delivered directly to Roweena and the coaching team. We will review your message and reply to <strong className="text-ink">{email}</strong> within 24 hours.
        </p>
        <button
          type="button"
          onClick={handleReset}
          className="mt-6 inline-flex items-center justify-center gap-1.5 rounded-full border border-line bg-white px-6 py-2.5 text-xs font-semibold text-ink transition hover:border-gold-deep"
        >
          Send another enquiry
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      {/* Enquiry Type Toggle */}
      <div>
        <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-ink-soft">
          Enquiry Type *
        </label>
        <div className="grid grid-cols-2 gap-2 rounded-2xl bg-cream p-1.5 border border-line">
          <button
            type="button"
            onClick={() => setInquiryType("GENERAL")}
            className={`flex items-center justify-center gap-2 rounded-xl py-2.5 px-3 text-xs sm:text-sm font-semibold transition-all ${
              inquiryType === "GENERAL"
                ? "bg-white text-ink shadow-sm border border-sand"
                : "text-ink-soft hover:text-ink"
            }`}
          >
            <span>General Enquiry</span>
          </button>

          <button
            type="button"
            onClick={() => setInquiryType("COURSE")}
            className={`flex items-center justify-center gap-2 rounded-xl py-2.5 px-3 text-xs sm:text-sm font-semibold transition-all ${
              inquiryType === "COURSE"
                ? "bg-white text-ink shadow-sm border border-sand"
                : "text-ink-soft hover:text-ink"
            }`}
          >
            <span>Course Enquiry</span>
          </button>
        </div>
      </div>

      {/* Conditional Course Dropdown (Rendered strictly when Course Inquiry is active) */}
      {inquiryType === "COURSE" && (
        <div className="rounded-xl border border-gold/40 bg-gold/5 p-4 transition-all">
          <label htmlFor="courseSelect" className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-gold-deep">
            Select Course *
          </label>
          <select
            id="courseSelect"
            required
            value={selectedCourseId}
            onChange={(e) => setSelectedCourseId(e.target.value)}
            className="w-full rounded-xl border border-line bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-gold-deep focus:ring-1 focus:ring-gold-deep"
          >
            <option value="">
              {isLoadingCourses ? "Loading active courses..." : "-- Choose an Active Course --"}
            </option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
          <span className="mt-1.5 block text-xs text-ink-soft">
            Submitting a course enquiry instantly reserves your prospect priority and triggers a 15-minute discovery consultation.
          </span>
        </div>
      )}

      {/* Visitor Details */}
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
          Phone Number (with Country Code) *
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
          Include your country dial code for discovery call WhatsApp / Zoom scheduling.
        </span>
      </div>

      <div>
        <label htmlFor="tellUsMessage" className="mb-1.5 block text-sm font-semibold text-ink">
          Tell us about yourself *
        </label>
        <textarea
          id="tellUsMessage"
          required
          rows={4}
          maxLength={3500}
          placeholder={
            inquiryType === "COURSE"
              ? "Tell us about your mental wellness journey, what you hope to achieve through this course, or any questions..."
              : "Tell us about your goals, corporate enquiry, speaking engagement, or questions..."
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
        <div role="alert" className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={busy}
        className="group flex w-full items-center justify-center gap-2 rounded-full bg-ink py-3.5 px-8 text-sm font-semibold text-cream transition hover:bg-gold hover:text-ink disabled:opacity-60 shadow-sm"
      >
        <span>{busy ? "Sending…" : "Send Message"}</span>
        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
      </button>
    </form>
  );
}
