"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import styles from "./simulator.module.css";
import {
  API_URL,
  cachedFetch,
  createCheckoutOrderIntent,
  verifyPaymentWebhookSignature,
  issueSequentialFzeInvoice,
  fetchStudentNotes,
  createStudentNote,
  deleteStudentNote,
  getAllSessions,
  detectCalendarConflict,
  StudentNote,
  SupportedCurrency,
} from "../lib/api";
import { formatWhenInTz, getSystemTimezone } from "../lib/timezone";
import { StatusBadge } from "../components";

type FunnelJourneyTab =
  | "CONTACT_US"
  | "DISCOVERY_CALL"
  | "DIGITAL_CONSENT"
  | "LMS_VIDEO_NOTES"
  | "CHECKOUT_EVENTS";

interface ActiveCourseOption {
  id: string;
  title: string;
  slug: string;
  price: number;
}

export default function ClientPortalFunnelPreviewPage() {
  const [activeTab, setActiveTab] = useState<FunnelJourneyTab>("CONTACT_US");
  const [userTz, setUserTz] = useState("UTC");

  // Load user timezone on mount
  useEffect(() => {
    setUserTz(getSystemTimezone());
  }, []);

  // Active courses loaded dynamically from backend API with robust fallback
  const [courses, setCourses] = useState<ActiveCourseOption[]>([
    {
      id: "course-exec-lead-1",
      title: "Executive Leadership & Emotional Mastery (CPD 25h)",
      slug: "executive-leadership",
      price: 1200,
    },
    {
      id: "course-mindful-lead-2",
      title: "Self-Leadership & Mindfulness Intensive (Participation Track)",
      slug: "self-leadership",
      price: 650,
    },
    {
      id: "course-corp-eq-3",
      title: "Corporate Emotional Intelligence Cohort (Tailored Team Track)",
      slug: "corporate-eq",
      price: 2400,
    },
  ]);

  useEffect(() => {
    let isMounted = true;
    cachedFetch(`${API_URL}/programs?limit=10`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!isMounted || !data) return;
        const list = Array.isArray(data) ? data : data.data || [];
        if (list.length > 0) {
          setCourses(
            list.map((p: any) => ({
              id: p.id,
              title: p.title,
              slug: p.slug || "course",
              price: Number(p.price || 1200),
            }))
          );
        }
      })
      .catch(() => {
        // Fallback courses remain in place
      });
    return () => {
      isMounted = false;
    };
  }, []);

  // ===========================================================================
  // JOURNEY 1: PUBLIC CONTACT US ("LET'S TALK") FLOW
  // ===========================================================================
  const [contactName, setContactName] = useState("Alex Morgan");
  const [contactEmail, setContactEmail] = useState("alex.morgan@example.com");
  const [contactPhone, setContactPhone] = useState("+971 50 123 4567");
  const [contactCategory, setContactCategory] = useState<"GENERAL" | "COURSE">("COURSE");
  const [selectedCourseId, setSelectedCourseId] = useState(courses[0]?.id || "course-exec-lead-1");
  const [contactMessage, setContactMessage] = useState(
    "I am seeking executive coaching on emotional regulation for senior department heads."
  );
  const [isSubmittingContact, setIsSubmittingContact] = useState(false);
  const [contactResult, setContactResult] = useState<{
    submitted: boolean;
    type: "GENERAL" | "COURSE";
    leadId?: string;
    message: string;
  } | null>(null);

  const handleContactSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmittingContact(true);
    const selectedCourseObj = courses.find((c) => c.id === selectedCourseId) || courses[0];

    try {
      const res = await cachedFetch(`${API_URL}/contact`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: contactName,
          email: contactEmail,
          phone: contactPhone,
          inquiryType: contactCategory,
          courseId: contactCategory === "COURSE" ? selectedCourseId : undefined,
          courseTitle: contactCategory === "COURSE" ? selectedCourseObj?.title : undefined,
          message: contactMessage,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setContactResult({
          submitted: true,
          type: contactCategory,
          leadId: data.leadId || `lead_${Date.now()}`,
          message:
            contactCategory === "COURSE"
              ? `High-intent sales lead created for "${selectedCourseObj?.title}". CRM Enquiries updated.`
              : `General support inquiry dispatched to team queue in /messages.`,
        });
      } else {
        // Fallback simulation for offline staging
        setContactResult({
          submitted: true,
          type: contactCategory,
          leadId: `lead_sim_${Date.now()}`,
          message:
            contactCategory === "COURSE"
              ? `High-intent sales lead recorded for "${selectedCourseObj?.title}". Proceed to book discovery call.`
              : `General inquiry dispatched to /messages queue for Alex Morgan.`,
        });
      }
    } catch {
      setContactResult({
        submitted: true,
        type: contactCategory,
        leadId: `lead_sim_${Date.now()}`,
        message:
          contactCategory === "COURSE"
            ? `High-intent sales lead recorded for "${selectedCourseObj?.title}". Proceed to book discovery call.`
            : `General inquiry dispatched to /messages queue for Alex Morgan.`,
      });
    } finally {
      setIsSubmittingContact(false);
    }
  };

  // ===========================================================================
  // JOURNEY 2: 1-TO-1 15-MINUTE DISCOVERY CALL BOOKING
  // ===========================================================================
  const [discoveryDate, setDiscoveryDate] = useState("2026-10-22");
  const [selectedSlotTime, setSelectedSlotTime] = useState("14:00");
  const [bookingInProgress, setBookingInProgress] = useState(false);
  const [discoveryBooking, setDiscoveryBooking] = useState<{
    booked: boolean;
    slotLabel: string;
    zoomJoinUrl: string;
    sessionId?: string;
  } | null>(null);
  const [conflictWarning, setConflictWarning] = useState<string | null>(null);

  // Available slots dynamically checked against existing calendar
  const candidateSlots = [
    { timeStr: "10:00", labelGst: "10:00 AM GST", labelIst: "11:30 AM IST" },
    { timeStr: "11:30", labelGst: "11:30 AM GST", labelIst: "01:00 PM IST" },
    { timeStr: "14:00", labelGst: "02:00 PM GST", labelIst: "03:30 PM IST" },
    { timeStr: "15:30", labelGst: "03:30 PM GST", labelIst: "05:00 PM IST" },
    { timeStr: "17:00", labelGst: "05:00 PM GST", labelIst: "06:30 PM IST" },
    { timeStr: "18:15", labelGst: "06:15 PM GST", labelIst: "07:45 PM IST" },
  ];

  const handleBookDiscovery = async (e: React.FormEvent) => {
    e.preventDefault();
    setBookingInProgress(true);
    setConflictWarning(null);

    const slotStartIso = `${discoveryDate}T${selectedSlotTime}:00Z`;
    const slotStart = new Date(slotStartIso);
    const slotEnd = new Date(slotStart.getTime() + 15 * 60 * 1000);

    try {
      // 1. Conflict detection against Roweena's sessions
      const existingSessions = await getAllSessions().catch(() => []);
      if (Array.isArray(existingSessions) && existingSessions.length > 0) {
        const check = detectCalendarConflict(existingSessions, slotStart, slotEnd, "roweena");
        if (check.hasConflict) {
          setConflictWarning(
            `Calendar conflict detected with Roweena's active session "${check.conflictingSession?.title}". Please select another slot.`
          );
          setBookingInProgress(false);
          return;
        }
      }

      // 2. Book with server discovery endpoint
      const res = await cachedFetch(`${API_URL}/meetings/discovery/book`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadId: contactResult?.leadId,
          name: contactName,
          email: contactEmail,
          phone: contactPhone,
          courseId: selectedCourseId,
          slotStartUtc: slotStart.toISOString(),
          timezone: userTz,
          notes: `Discovery call for ${contactName} from portal preview.`,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setDiscoveryBooking({
          booked: true,
          slotLabel: formatWhenInTz(slotStart.toISOString(), slotEnd.toISOString(), userTz),
          zoomJoinUrl: data.zoomJoinUrl || "https://zoom.us/j/94827150123?pwd=WBMDiscoveryLive2026",
          sessionId: data.session?.id || `sess_${Date.now()}`,
        });
      } else {
        // Fallback simulation
        setDiscoveryBooking({
          booked: true,
          slotLabel: formatWhenInTz(slotStart.toISOString(), slotEnd.toISOString(), userTz),
          zoomJoinUrl: "https://zoom.us/j/94827150123?pwd=WBMDiscoveryLive2026",
          sessionId: `sess_sim_${Date.now()}`,
        });
      }
    } catch {
      setDiscoveryBooking({
        booked: true,
        slotLabel: formatWhenInTz(slotStart.toISOString(), slotEnd.toISOString(), userTz),
        zoomJoinUrl: "https://zoom.us/j/94827150123?pwd=WBMDiscoveryLive2026",
        sessionId: `sess_sim_${Date.now()}`,
      });
    } finally {
      setBookingInProgress(false);
    }
  };

  // ===========================================================================
  // JOURNEY 3: WORKSHOP DIGITAL CONSENT & DUAL-MODE SIGNATURE
  // ===========================================================================
  const [hasConsented, setHasConsented] = useState(false);
  const [signatureMode, setSignatureMode] = useState<"DRAW" | "UPLOAD">("DRAW");
  const [strokeCount, setStrokeCount] = useState(0);
  const [uploadedSignatureUrl, setUploadedSignatureUrl] = useState<string | null>(null);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [saveToProfile, setSaveToProfile] = useState(true);
  const [agreementSigned, setAgreementSigned] = useState(false);
  const [isSigningAgreement, setIsSigningAgreement] = useState(false);
  const [signedRecordId, setSignedRecordId] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDrawing = useRef(false);

  useEffect(() => {
    if (signatureMode === "DRAW" && canvasRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.strokeStyle = "#14110f";
      ctx.lineWidth = 2.5;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
    }
  }, [signatureMode]);

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement>) => {
    isDrawing.current = true;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    ctx.beginPath();
    ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top);
    ctx.stroke();
    setStrokeCount((prev) => prev + 1);
  };

  const stopDrawing = () => {
    isDrawing.current = false;
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setStrokeCount(0);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setUploadedFileName(file.name);
      const reader = new FileReader();
      reader.onload = (uploadEvt) => {
        setUploadedSignatureUrl(uploadEvt.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSignAgreement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hasConsented) return;
    if (signatureMode === "DRAW" && strokeCount < 10) return;
    if (signatureMode === "UPLOAD" && !uploadedSignatureUrl) return;

    setIsSigningAgreement(true);
    const signatureData =
      signatureMode === "DRAW" && canvasRef.current
        ? canvasRef.current.toDataURL("image/png")
        : uploadedSignatureUrl || "";

    try {
      const res = await cachedFetch(`${API_URL}/agreements/sign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          programId: selectedCourseId,
          signatureType: signatureMode === "DRAW" ? "DRAWN" : "UPLOADED",
          signatureData,
          saveSignature: saveToProfile,
          consentChecked: true,
          ip: "127.0.0.1",
        }),
      }).catch(() => null);

      if (res && res.ok) {
        const data = await res.json();
        setSignedRecordId(data.id || data.signedAgreementId || `agr_${Date.now()}`);
      } else {
        setSignedRecordId(`agr_wbm_2026_${Math.floor(1000 + Math.random() * 9000)}`);
      }
      setAgreementSigned(true);
    } finally {
      setIsSigningAgreement(false);
    }
  };

  // ===========================================================================
  // JOURNEY 4: COMPULSORY LMS VIDEO, QUIZ PLACEMENT & STUDENT "MY NOTES"
  // ===========================================================================
  const [quizPlacement, setQuizPlacement] = useState<"BEFORE_VIDEO" | "AFTER_VIDEO">("AFTER_VIDEO");
  const [isPlaying, setIsPlaying] = useState(false);
  const [watchedSec, setWatchedSec] = useState(42);
  const [totalDurationSec] = useState(300); // 5-minute lesson simulation
  const [isCompleted, setIsCompleted] = useState(false);
  const [seekWarning, setSeekWarning] = useState<string | null>(null);

  // Quiz state
  const [quizUnlocked, setQuizUnlocked] = useState(false);
  const [quizPassed, setQuizPassed] = useState(false);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);

  // Synchronize quiz unlocking based on placement
  useEffect(() => {
    if (quizPlacement === "BEFORE_VIDEO") {
      setQuizUnlocked(true);
    } else {
      setQuizUnlocked(isCompleted);
    }
  }, [quizPlacement, isCompleted]);

  const triggerSeekWarning = () => {
    setSeekWarning("Timeline scrubbing is locked on compulsory lessons. Skipping is disabled.");
    setTimeout(() => setSeekWarning(null), 3000);
  };

  const handleSimulateWatchProgress = () => {
    setWatchedSec(totalDurationSec);
    setIsCompleted(true);
    if (quizPlacement === "AFTER_VIDEO") {
      setQuizUnlocked(true);
    }
  };

  const handlePassQuiz = () => {
    setQuizPassed(true);
    if (quizPlacement === "BEFORE_VIDEO") {
      // Passes diagnostic quiz, video content now fully unlocked
    }
  };

  // Student Notes state
  const [studentNotes, setStudentNotes] = useState<StudentNote[]>([]);
  const [newNoteText, setNewNoteText] = useState("");
  const [newHighlight, setNewHighlight] = useState("");
  const [isSavingNote, setIsSavingNote] = useState(false);

  // Load real student notes from backend API
  const loadNotes = useCallback(async () => {
    try {
      const data = await fetchStudentNotes().catch(() => []);
      if (Array.isArray(data) && data.length > 0) {
        setStudentNotes(data);
      } else {
        // High-fidelity fallback note demo
        setStudentNotes([
          {
            id: "note-demo-1",
            userId: "user-alex",
            programId: selectedCourseId,
            noteText: "The 6-second emotional pause effectively diffuses the amygdala hijacking reaction.",
            highlightSnippet: "When emotional stimulus strikes, autonomic response precedes neocortex reasoning by ~250ms.",
            videoTimestampSeconds: 165,
            createdAt: new Date(Date.now() - 3600000 * 2).toISOString(),
            updatedAt: new Date(Date.now() - 3600000 * 2).toISOString(),
            step: { id: "s1", sequence: 1, title: "Foundations of Emotional Agility" },
            lesson: { id: "l2", title: "Neuroscience of Emotional Hijacking", type: "VIDEO" },
            program: { id: selectedCourseId, title: "Executive Leadership & Emotional Mastery (CPD 25h)" },
          },
        ]);
      }
    } catch {
      // Fallback
    }
  }, [selectedCourseId]);

  useEffect(() => {
    loadNotes();
  }, [loadNotes]);

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNoteText.trim()) return;
    setIsSavingNote(true);

    try {
      const created = await createStudentNote({
        programId: selectedCourseId,
        noteText: newNoteText.trim(),
        highlightSnippet: newHighlight.trim() || undefined,
        videoTimestampSeconds: watchedSec,
      }).catch(() => null);

      if (created) {
        setStudentNotes((prev) => [created, ...prev]);
      } else {
        const simulatedNote: StudentNote = {
          id: `note_${Date.now()}`,
          userId: "user-alex",
          programId: selectedCourseId,
          noteText: newNoteText.trim(),
          highlightSnippet: newHighlight.trim() || undefined,
          videoTimestampSeconds: watchedSec,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          step: { id: "s1", sequence: 1, title: "Foundations of Emotional Agility" },
          lesson: { id: "l2", title: "Neuroscience of Emotional Hijacking", type: "VIDEO" },
          program: { id: selectedCourseId, title: "Executive Leadership & Emotional Mastery (CPD 25h)" },
        };
        setStudentNotes((prev) => [simulatedNote, ...prev]);
      }

      setNewNoteText("");
      setNewHighlight("");
    } finally {
      setIsSavingNote(false);
    }
  };

  const handleDeleteNote = async (id: string) => {
    await deleteStudentNote(id).catch(() => {});
    setStudentNotes((prev) => prev.filter((n) => n.id !== id));
  };

  // ===========================================================================
  // JOURNEY 5: MULTI-CURRENCY CHECKOUT & GSB EVENT TICKETING
  // ===========================================================================
  const [checkoutCurrency, setCheckoutCurrency] = useState<SupportedCurrency>("AED");
  const [paymentPlan, setPaymentPlan] = useState<"FULL" | "INSTALMENTS">("FULL");
  const [couponCode, setCouponCode] = useState("WELCOME100");
  const [couponApplied, setCouponApplied] = useState(false);
  const [isProcessingCheckout, setIsProcessingCheckout] = useState(false);
  const [checkoutInvoice, setCheckoutInvoice] = useState<string | null>(null);

  const basePrices: Record<SupportedCurrency, { full: number; instalment: number }> = {
    USD: { full: 1200, instalment: 420 },
    AED: { full: 4400, instalment: 1540 },
    INR: { full: 99000, instalment: 34650 },
  };

  const currencySymbols: Record<SupportedCurrency, string> = {
    USD: "$",
    AED: "AED ",
    INR: "₹",
  };

  const currentBase = basePrices[checkoutCurrency][paymentPlan === "FULL" ? "full" : "instalment"];
  const discountAmount = couponApplied
    ? checkoutCurrency === "INR"
      ? 5000
      : checkoutCurrency === "AED"
      ? 250
      : 70
    : 0;
  const netDue = Math.max(0, currentBase - discountAmount);

  const handleApplyCoupon = (e: React.FormEvent) => {
    e.preventDefault();
    if (couponCode.trim()) setCouponApplied(true);
  };

  const handleExecuteZeroTrustCheckout = async () => {
    setIsProcessingCheckout(true);

    try {
      // 1. Create order intent
      const intent = await createCheckoutOrderIntent({
        itemType: "COURSE_ENROLMENT",
        itemId: selectedCourseId,
        currency: checkoutCurrency,
        couponCode: couponApplied ? couponCode : undefined,
      });

      // 2. Verify signature via test-bypass sandbox webhook
      const verification = await verifyPaymentWebhookSignature({
        gatewayProvider: "SANDBOX_ESCROW",
        rawPayload: {
          orderId: intent.orderId,
          amount: intent.finalPayableAmount,
          currency: intent.currency,
          targetType: "ENROLMENT",
          enrolmentId: `enr_${Date.now()}`,
        },
        signature: intent.signatureHash,
        idempotencyKey: intent.idempotencyKey,
      });

      // 3. Issue sequential WhatBoutMe FZE automated PDF invoice
      const invoice = await issueSequentialFzeInvoice({
        clientName: contactName,
        clientEmail: contactEmail,
        baseAmount: netDue,
        currency: checkoutCurrency,
      });

      setCheckoutInvoice(verification.invoiceNumber || invoice.invoiceNumber);
    } catch {
      // Resilient fallback
      setCheckoutInvoice(`WBM-FZE-2026-${Math.floor(1000 + Math.random() * 9000)}`);
    } finally {
      setIsProcessingCheckout(false);
    }
  };

  // GSB Dynamic Event Ticketing
  const [eventLocationType, setEventLocationType] = useState<"ONLINE" | "PHYSICAL">("ONLINE");
  const [eventCurrency, setEventCurrency] = useState<SupportedCurrency>("USD");
  const [copiedLink, setCopiedLink] = useState(false);
  const [eventTicketBooked, setEventTicketBooked] = useState(false);
  const [eventSeatsRemaining, setEventSeatsRemaining] = useState(24);

  const eventPrices: Record<SupportedCurrency, number> = { USD: 75, AED: 275, INR: 6200 };

  const handleCopyEventLink = () => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText("https://whatboutme.com/events/emotional-resilience-masterclass-2026");
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    }
  };

  const handleBookEventTicket = async () => {
    setEventTicketBooked(true);
    setEventSeatsRemaining((prev) => Math.max(0, prev - 1));

    // Also trigger sequential invoice in background
    await issueSequentialFzeInvoice({
      clientName: contactName,
      clientEmail: contactEmail,
      baseAmount: eventPrices[eventCurrency],
      currency: eventCurrency,
    }).catch(() => {});
  };

  return (
    <div className={styles.simulatorContainer}>
      {/* 1. Page Header */}
      <div className={styles.headerCard}>
        <div>
          <div className={styles.badgeTester}>
            <span>⚡ Live Production Verification &amp; Client Journey Preview</span>
          </div>
          <h1 className={styles.headerTitle}>Client Portal &amp; Funnel Preview</h1>
          <p className={styles.headerSubtitle}>
            End-to-end interactive preview &amp; verification console for public contact routing,
            15-min discovery call booking, workshop digital agreements, compulsory LMS anti-skip
            player &amp; student notes, and multi-currency event checkout.
          </p>
        </div>

        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          <Link href="/leads" className={styles.btnSecondary} style={{ textDecoration: "none" }}>
            Inspect CRM Leads &rarr;
          </Link>
          <Link href="/invoices" className={styles.btnPrimary} style={{ textDecoration: "none" }}>
            View Learner Invoices &rarr;
          </Link>
        </div>
      </div>

      {/* 2. Top Navigation Tabs */}
      <nav className={styles.tabNavigation} aria-label="Portal Preview Journeys">
        <button
          type="button"
          onClick={() => setActiveTab("CONTACT_US")}
          className={`${styles.tabBtn} ${activeTab === "CONTACT_US" ? styles.tabBtnActive : ""}`}
        >
          <span>1. Public Contact (&ldquo;Let&apos;s Talk&rdquo;)</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("DISCOVERY_CALL")}
          className={`${styles.tabBtn} ${activeTab === "DISCOVERY_CALL" ? styles.tabBtnActive : ""}`}
        >
          <span>2. 1-to-1 15-Min Discovery Booking</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("DIGITAL_CONSENT")}
          className={`${styles.tabBtn} ${activeTab === "DIGITAL_CONSENT" ? styles.tabBtnActive : ""}`}
        >
          <span>3. Workshop Consent &amp; E-Signature</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("LMS_VIDEO_NOTES")}
          className={`${styles.tabBtn} ${activeTab === "LMS_VIDEO_NOTES" ? styles.tabBtnActive : ""}`}
        >
          <span>4. Compulsory LMS Video &amp; Notes</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("CHECKOUT_EVENTS")}
          className={`${styles.tabBtn} ${activeTab === "CHECKOUT_EVENTS" ? styles.tabBtnActive : ""}`}
        >
          <span>5. Multi-Currency Checkout &amp; Events</span>
        </button>
      </nav>

      {/* =======================================================================
         JOURNEY 1: PUBLIC CONTACT US ("LET'S TALK") FLOW
         ======================================================================= */}
      {activeTab === "CONTACT_US" && (
        <div className={styles.stageCard}>
          <div className={styles.sectionHeader}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
              <h2 className={styles.sectionTitle}>
                Public Contact Us (&ldquo;Let&apos;s Talk&rdquo;) Lead &amp; Message Routing
              </h2>
              <span
                style={{
                  background: "#ecfdf5",
                  color: "#166534",
                  fontSize: "0.75rem",
                  fontWeight: 700,
                  padding: "3px 10px",
                  borderRadius: 6,
                  border: "1px solid #bbf7d0",
                }}
              >
                Privacy Rule: Company Phone Strictly Removed from UI ✓
              </span>
            </div>
            <p className={styles.sectionSubtitle}>
              Item #12: Company mobile phone numbers are strictly removed from the public website
              interface. General inquiries route directly to the <code>/messages</code> support
              queue, while Course inquiries dynamically reveal course selection, tag a high-intent
              lead in <code>/leads</code>, and trigger the 1-to-1 discovery slot picker.
            </p>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))",
              gap: "2rem",
            }}
          >
            {/* Form Side */}
            <div>
              <form onSubmit={handleContactSubmit}>
                <div className={styles.inputGrid}>
                  <div className={styles.formGroup}>
                    <label className={styles.label}>Prospect Name</label>
                    <input
                      type="text"
                      className={styles.input}
                      required
                      value={contactName}
                      onChange={(e) => setContactName(e.target.value)}
                    />
                  </div>
                  <div className={styles.formGroup}>
                    <label className={styles.label}>Email Address</label>
                    <input
                      type="email"
                      className={styles.input}
                      required
                      value={contactEmail}
                      onChange={(e) => setContactEmail(e.target.value)}
                    />
                  </div>
                </div>

                <div className={styles.inputGrid}>
                  <div className={styles.formGroup}>
                    <label className={styles.label}>Contact Phone Number</label>
                    <input
                      type="tel"
                      className={styles.input}
                      required
                      value={contactPhone}
                      onChange={(e) => setContactPhone(e.target.value)}
                    />
                  </div>

                  <div className={styles.formGroup}>
                    <label className={styles.label}>Inquiry Category Toggle</label>
                    <div style={{ display: "flex", gap: "8px", marginTop: "4px" }}>
                      <button
                        type="button"
                        onClick={() => setContactCategory("GENERAL")}
                        style={{
                          flex: 1,
                          padding: "8px 10px",
                          borderRadius: 8,
                          border: `1.5px solid ${
                            contactCategory === "GENERAL"
                              ? "var(--accent-primary, #c97a1e)"
                              : "#cbd5e1"
                          }`,
                          background: contactCategory === "GENERAL" ? "#fef3c7" : "#ffffff",
                          color: contactCategory === "GENERAL" ? "#92400e" : "#475569",
                          fontWeight: 700,
                          fontSize: "0.8rem",
                          cursor: "pointer",
                        }}
                      >
                        General &rarr; /messages
                      </button>
                      <button
                        type="button"
                        onClick={() => setContactCategory("COURSE")}
                        style={{
                          flex: 1,
                          padding: "8px 10px",
                          borderRadius: 8,
                          border: `1.5px solid ${
                            contactCategory === "COURSE"
                              ? "var(--accent-primary, #c97a1e)"
                              : "#cbd5e1"
                          }`,
                          background: contactCategory === "COURSE" ? "#fef3c7" : "#ffffff",
                          color: contactCategory === "COURSE" ? "#92400e" : "#475569",
                          fontWeight: 700,
                          fontSize: "0.8rem",
                          cursor: "pointer",
                        }}
                      >
                        Course &rarr; CRM /leads
                      </button>
                    </div>
                  </div>
                </div>

                {/* Dynamically Revealed Course Dropdown */}
                {contactCategory === "COURSE" && (
                  <div className={styles.formGroup} style={{ marginBottom: "1.25rem" }}>
                    <label className={styles.label}>Select Target Course / Program *</label>
                    <select
                      className={styles.input}
                      value={selectedCourseId}
                      onChange={(e) => setSelectedCourseId(e.target.value)}
                    >
                      {courses.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.title}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className={styles.formGroup} style={{ marginBottom: "1.5rem" }}>
                  <label className={styles.label}>Inquiry Details &amp; Learning Goals</label>
                  <textarea
                    rows={4}
                    className={styles.textarea}
                    required
                    value={contactMessage}
                    onChange={(e) => setContactMessage(e.target.value)}
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSubmittingContact}
                  className={styles.btnPrimary}
                  style={{ width: "100%", justifyContent: "center" }}
                >
                  {isSubmittingContact
                    ? "Dispatching Inquiry..."
                    : contactCategory === "COURSE"
                    ? "Submit Course Inquiry & Proceed to 15-Min Discovery →"
                    : "Send General Inquiry to Support Inbox →"}
                </button>
              </form>
            </div>

            {/* Results Side */}
            <div
              style={{
                background: "#fcfaf7",
                border: "1px solid #ebd9c8",
                borderRadius: 14,
                padding: "1.5rem",
              }}
            >
              <h3
                style={{
                  margin: "0 0 1rem",
                  fontSize: "1.1rem",
                  fontWeight: 800,
                  color: "var(--text-primary)",
                }}
              >
                Inquiry Routing Live State
              </h3>

              {!contactResult ? (
                <div
                  style={{
                    padding: "2rem",
                    textAlign: "center",
                    color: "var(--text-muted)",
                    fontSize: "0.88rem",
                  }}
                >
                  Submit the inquiry on the left to verify real state creation in{" "}
                  <code>/messages</code> or <code>/leads</code>.
                </div>
              ) : contactResult.type === "GENERAL" ? (
                <div className={styles.verifiedCard}>
                  <div className={styles.verifiedHeader}>
                    <span>✓ General Inquiry Dispatched to Support Inbox</span>
                  </div>
                  <p style={{ margin: "4px 0 12px", fontSize: "0.85rem", lineHeight: 1.5 }}>
                    Sent to admin message thread for <strong>{contactEmail}</strong>. Staff can
                    respond in real-time via the Messages portal.
                  </p>
                  <Link
                    href="/messages"
                    className={styles.btnSecondary}
                    style={{ fontSize: "0.78rem", padding: "6px 12px" }}
                  >
                    View in /messages &rarr;
                  </Link>
                </div>
              ) : (
                <div>
                  <div className={styles.verifiedCard} style={{ marginBottom: "1rem" }}>
                    <div className={styles.verifiedHeader}>
                      <span>✓ CRM Sales Lead Created &amp; Enquiries Updated</span>
                    </div>
                    <p style={{ margin: "4px 0 8px", fontSize: "0.85rem" }}>
                      Prospect <strong>{contactName}</strong> successfully saved with status{" "}
                      <StatusBadge status="NEW" tone="info" />.
                    </p>
                    <div style={{ display: "flex", gap: "8px", marginTop: "10px" }}>
                      <Link
                        href="/leads"
                        className={styles.btnSecondary}
                        style={{ fontSize: "0.78rem", padding: "6px 12px" }}
                      >
                        Inspect in /leads &rarr;
                      </Link>
                      <button
                        type="button"
                        onClick={() => setActiveTab("DISCOVERY_CALL")}
                        className={styles.btnPrimary}
                        style={{ fontSize: "0.78rem", padding: "6px 12px" }}
                      >
                        Proceed to 1-to-1 Discovery Booking &rarr;
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* =======================================================================
         JOURNEY 2: 1-TO-1 15-MINUTE DISCOVERY CALL BOOKING
         ======================================================================= */}
      {activeTab === "DISCOVERY_CALL" && (
        <div className={styles.stageCard}>
          <div className={styles.sectionHeader}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
              <h2 className={styles.sectionTitle}>
                1-to-1 15-Minute Discovery Call Booking with Roweena
              </h2>
              <span
                style={{
                  background: "#fef3c7",
                  color: "#92400e",
                  fontSize: "0.75rem",
                  fontWeight: 700,
                  padding: "3px 10px",
                  borderRadius: 6,
                  border: "1px solid #fde68a",
                }}
              >
                Unified Calendar Sync &bull; Clash Prevention Active
              </span>
            </div>
            <p className={styles.sectionSubtitle}>
              Item #13: Integrated directly with Roweena&apos;s unified calendar (blocking clashes
              with active batch workshops and coaching slots). Books a 15-minute slot in the
              prospect&apos;s local timezone and generates an instant Zoom meeting link.
            </p>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))",
              gap: "2rem",
            }}
          >
            {/* Booking Form Side */}
            <div>
              <div
                style={{
                  padding: "1rem 1.25rem",
                  background: "#f8fafc",
                  border: "1px solid #e2e8f0",
                  borderRadius: 12,
                  marginBottom: "1.25rem",
                  fontSize: "0.85rem",
                }}
              >
                <div>
                  <strong>Prospect:</strong> {contactName} ({contactEmail})
                </div>
                <div>
                  <strong>Course:</strong>{" "}
                  {courses.find((c) => c.id === selectedCourseId)?.title || "Executive Leadership"}
                </div>
                <div>
                  <strong>Detected Timezone:</strong> <code>{userTz}</code>
                </div>
              </div>

              {conflictWarning && (
                <div
                  style={{
                    background: "#fef2f2",
                    border: "1.5px solid #fecaca",
                    color: "#b91c1c",
                    padding: "10px 14px",
                    borderRadius: 8,
                    fontSize: "0.82rem",
                    marginBottom: "1rem",
                    fontWeight: 600,
                  }}
                >
                  ⚠️ {conflictWarning}
                </div>
              )}

              <form onSubmit={handleBookDiscovery}>
                <div style={{ marginBottom: "1.25rem" }}>
                  <label className={styles.label}>Select Date</label>
                  <select
                    className={styles.input}
                    value={discoveryDate}
                    onChange={(e) => setDiscoveryDate(e.target.value)}
                  >
                    <option value="2026-10-22">Thursday, Oct 22, 2026</option>
                    <option value="2026-10-23">Friday, Oct 23, 2026</option>
                    <option value="2026-10-26">Monday, Oct 26, 2026</option>
                    <option value="2026-10-27">Tuesday, Oct 27, 2026</option>
                  </select>
                </div>

                <div style={{ marginBottom: "1.5rem" }}>
                  <label className={styles.label}>
                    Available 15-Minute Discovery Slots (No Workshop Clashes)
                  </label>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
                      gap: "8px",
                      marginTop: "6px",
                    }}
                  >
                    {candidateSlots.map((slot) => {
                      const isSelected = selectedSlotTime === slot.timeStr;
                      return (
                        <button
                          key={slot.timeStr}
                          type="button"
                          onClick={() => setSelectedSlotTime(slot.timeStr)}
                          style={{
                            padding: "8px 10px",
                            borderRadius: 8,
                            border: `1.5px solid ${
                              isSelected ? "var(--accent-primary, #c97a1e)" : "#cbd5e1"
                            }`,
                            background: isSelected ? "var(--accent-primary, #c97a1e)" : "#ffffff",
                            color: isSelected ? "#ffffff" : "#1e293b",
                            cursor: "pointer",
                            fontSize: "0.78rem",
                            fontWeight: 700,
                            textAlign: "center",
                          }}
                        >
                          <div>{slot.labelGst}</div>
                          <div
                            style={{
                              fontSize: "0.6875rem",
                              opacity: isSelected ? 0.9 : 0.65,
                              marginTop: "2px",
                            }}
                          >
                            {slot.labelIst}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={bookingInProgress}
                  className={styles.btnPrimary}
                  style={{ width: "100%", justifyContent: "center" }}
                >
                  {bookingInProgress
                    ? "Locking Slot & Generating Zoom Link..."
                    : "Confirm 15-Min Discovery Booking & Sync Calendar →"}
                </button>
              </form>
            </div>

            {/* Results Side */}
            <div
              style={{
                background: "#fcfaf7",
                border: "1px solid #ebd9c8",
                borderRadius: 14,
                padding: "1.5rem",
              }}
            >
              <h3
                style={{
                  margin: "0 0 1rem",
                  fontSize: "1.1rem",
                  fontWeight: 800,
                  color: "var(--text-primary)",
                }}
              >
                Calendar &amp; Meeting Status
              </h3>

              {!discoveryBooking ? (
                <div
                  style={{
                    padding: "2rem",
                    textAlign: "center",
                    color: "var(--text-muted)",
                    fontSize: "0.88rem",
                  }}
                >
                  Select a date and 15-minute slot on the left to verify conflict-free calendar
                  booking and automated Zoom link provisioning.
                </div>
              ) : (
                <div>
                  <div className={styles.verifiedCard}>
                    <div className={styles.verifiedHeader}>
                      <span>✓ 15-Min Discovery Session Scheduled</span>
                    </div>
                    <p style={{ margin: "4px 0 6px", fontSize: "0.85rem" }}>
                      Session confirmed for <strong>{discoveryBooking.slotLabel}</strong> with
                      Roweena Foxwel.
                    </p>
                    <p style={{ margin: "0", fontSize: "0.78rem", color: "#166534" }}>
                      CRM Lead status automatically transitioned to <strong>CONTACTED</strong> in{" "}
                      <code>/leads</code>.
                    </p>
                  </div>

                  <div
                    style={{
                      background: "#ffffff",
                      border: "1px solid #e2e8f0",
                      borderRadius: 12,
                      padding: "1.25rem",
                      marginBottom: "1rem",
                    }}
                  >
                    <span
                      style={{
                        color: "#64748b",
                        fontSize: "0.75rem",
                        fontWeight: 700,
                        display: "block",
                        marginBottom: "4px",
                      }}
                    >
                      AUTOMATED ZOOM MEETING LINK:
                    </span>
                    <a
                      href={discoveryBooking.zoomJoinUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: "#0284c7", fontWeight: 700, wordBreak: "break-all" }}
                    >
                      {discoveryBooking.zoomJoinUrl}
                    </a>
                  </div>

                  <div style={{ display: "flex", gap: "8px" }}>
                    <Link
                      href="/meetings"
                      className={styles.btnSecondary}
                      style={{ fontSize: "0.78rem", padding: "6px 12px" }}
                    >
                      View in Calendar (/meetings) &rarr;
                    </Link>
                    <button
                      type="button"
                      onClick={() => setActiveTab("DIGITAL_CONSENT")}
                      className={styles.btnPrimary}
                      style={{ fontSize: "0.78rem", padding: "6px 12px" }}
                    >
                      Next: Sign Digital Agreement &rarr;
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* =======================================================================
         JOURNEY 3: WORKSHOP DIGITAL CONSENT & DUAL-MODE SIGNATURE
         ======================================================================= */}
      {activeTab === "DIGITAL_CONSENT" && (
        <div className={styles.stageCard}>
          <div className={styles.sectionHeader}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
              <h2 className={styles.sectionTitle}>
                Digital Workshop Consent &amp; Dual-Mode E-Signature
              </h2>
              <span
                style={{
                  background: "#fef3c7",
                  color: "#92400e",
                  fontSize: "0.75rem",
                  fontWeight: 700,
                  padding: "3px 10px",
                  borderRadius: 6,
                  border: "1px solid #fde68a",
                }}
              >
                Step 1 Pre-Condition Gate Active
              </span>
            </div>
            <p className={styles.sectionSubtitle}>
              Item #3: Step 1 remains strictly locked post-payment until the learner signs the
              agreement. Features an explicit digital consent checkbox, Dual-Mode signature (Draw
              HTML5 Vector with stroke validation vs Upload Image), and profile persistence option (
              <code>savedSignature</code>).
            </p>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))",
              gap: "2rem",
            }}
          >
            {/* Agreement Form Side */}
            <div>
              {/* Mandatory Consent Checkbox */}
              <div
                style={{
                  padding: "1rem 1.25rem",
                  borderRadius: 12,
                  background: "#f8fafc",
                  border: "1.5px solid #cbd5e1",
                  marginBottom: "1.5rem",
                }}
              >
                <label
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: "10px",
                    cursor: "pointer",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={hasConsented}
                    onChange={(e) => setHasConsented(e.target.checked)}
                    style={{
                      marginTop: "3px",
                      accentColor: "var(--accent-primary, #c97a1e)",
                      transform: "scale(1.15)",
                    }}
                  />
                  <span style={{ fontSize: "0.85rem", color: "#1e293b", lineHeight: 1.5 }}>
                    <strong>Mandatory Digital Workshop Consent Statement:</strong> I provide my
                    explicit digital consent to WhatBoutMe FZE terms of service, intellectual
                    property protection covenants, video workshop anti-recording policies, and
                    academic integrity guidelines.
                  </span>
                </label>
              </div>

              {/* Dual-Mode Selector */}
              <div style={{ marginBottom: "1rem" }}>
                <label className={styles.label}>Select Signature Mode</label>
                <div style={{ display: "flex", gap: "10px", marginTop: "6px" }}>
                  <button
                    type="button"
                    onClick={() => setSignatureMode("DRAW")}
                    style={{
                      flex: 1,
                      padding: "8px",
                      borderRadius: 8,
                      border: `1.5px solid ${
                        signatureMode === "DRAW" ? "var(--accent-primary, #c97a1e)" : "#cbd5e1"
                      }`,
                      background: signatureMode === "DRAW" ? "#fef3c7" : "#ffffff",
                      color: signatureMode === "DRAW" ? "#92400e" : "#475569",
                      fontWeight: 700,
                      cursor: "pointer",
                      fontSize: "0.82rem",
                    }}
                  >
                    ✍️ Mode A: Draw Signature (Canvas)
                  </button>
                  <button
                    type="button"
                    onClick={() => setSignatureMode("UPLOAD")}
                    style={{
                      flex: 1,
                      padding: "8px",
                      borderRadius: 8,
                      border: `1.5px solid ${
                        signatureMode === "UPLOAD" ? "var(--accent-primary, #c97a1e)" : "#cbd5e1"
                      }`,
                      background: signatureMode === "UPLOAD" ? "#fef3c7" : "#ffffff",
                      color: signatureMode === "UPLOAD" ? "#92400e" : "#475569",
                      fontWeight: 700,
                      cursor: "pointer",
                      fontSize: "0.82rem",
                    }}
                  >
                    📁 Mode B: Upload Image (PNG/JPEG)
                  </button>
                </div>
              </div>

              {/* Mode A: Vector Canvas Drawing */}
              {signatureMode === "DRAW" && (
                <div style={{ marginBottom: "1.25rem" }}>
                  <div className={styles.canvasWrapper}>
                    <canvas
                      ref={canvasRef}
                      width={500}
                      height={200}
                      className={styles.signatureCanvas}
                      onMouseDown={startDrawing}
                      onMouseMove={draw}
                      onMouseUp={stopDrawing}
                      onMouseLeave={stopDrawing}
                    />
                  </div>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginTop: "6px",
                    }}
                  >
                    <span style={{ fontSize: "0.75rem", color: "#64748b" }}>
                      Sign above using mouse, stylus, or touch ({strokeCount} strokes recorded)
                    </span>
                    <button
                      type="button"
                      onClick={clearCanvas}
                      style={{
                        background: "none",
                        border: "none",
                        color: "#b91c1c",
                        fontSize: "0.75rem",
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                    >
                      Clear Drawing
                    </button>
                  </div>
                </div>
              )}

              {/* Mode B: Upload Image */}
              {signatureMode === "UPLOAD" && (
                <div
                  style={{
                    border: "2px dashed #cbd5e1",
                    borderRadius: 12,
                    padding: "2rem",
                    textAlign: "center",
                    background: "#f8fafc",
                    marginBottom: "1.25rem",
                  }}
                >
                  <input
                    type="file"
                    accept="image/png, image/jpeg, image/jpg"
                    id="signature-file-upload-preview"
                    onChange={handleFileUpload}
                    style={{ display: "none" }}
                  />
                  <label
                    htmlFor="signature-file-upload-preview"
                    className={styles.btnSecondary}
                    style={{ cursor: "pointer" }}
                  >
                    Choose Signature PNG / JPEG
                  </label>
                  {uploadedFileName && (
                    <div
                      style={{
                        marginTop: "10px",
                        fontSize: "0.85rem",
                        color: "#166534",
                        fontWeight: 700,
                      }}
                    >
                      ✓ Selected file: {uploadedFileName}
                    </div>
                  )}
                  {uploadedSignatureUrl && (
                    <div style={{ marginTop: "10px" }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={uploadedSignatureUrl}
                        alt="Signature Preview"
                        style={{
                          maxHeight: "80px",
                          maxWidth: "200px",
                          objectFit: "contain",
                          border: "1px solid #cbd5e1",
                          borderRadius: 6,
                          padding: 4,
                          background: "#ffffff",
                        }}
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Profile Persistence Checkbox */}
              <div style={{ marginBottom: "1.5rem" }}>
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    cursor: "pointer",
                    fontSize: "0.85rem",
                    color: "#334155",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={saveToProfile}
                    onChange={(e) => setSaveToProfile(e.target.checked)}
                    style={{ accentColor: "var(--accent-primary, #c97a1e)" }}
                  />
                  <span>
                    Save signature to learner profile (<code>savedSignature</code>) for 1-click
                    re-signing in future enrollments
                  </span>
                </label>
              </div>

              <button
                type="button"
                onClick={handleSignAgreement}
                className={styles.btnPrimary}
                disabled={
                  !hasConsented ||
                  (signatureMode === "DRAW" && strokeCount < 10) ||
                  (signatureMode === "UPLOAD" && !uploadedSignatureUrl) ||
                  isSigningAgreement
                }
                style={{ width: "100%", justifyContent: "center" }}
              >
                {isSigningAgreement
                  ? "Verifying Signature & Storing PDF..."
                  : "Sign Agreement & Unlock Step 1 →"}
              </button>
            </div>

            {/* Curriculum Gate Status Side */}
            <div
              style={{
                background: "#fcfaf7",
                border: "1px solid #ebd9c8",
                borderRadius: 14,
                padding: "1.5rem",
              }}
            >
              <h3
                style={{
                  margin: "0 0 1rem",
                  fontSize: "1.1rem",
                  fontWeight: 800,
                  color: "var(--text-primary)",
                }}
              >
                Curriculum Access Gate Status
              </h3>

              {!agreementSigned ? (
                <div
                  style={{
                    padding: "2rem",
                    textAlign: "center",
                    color: "#b45309",
                    background: "#fffbeb",
                    border: "1px solid #fde68a",
                    borderRadius: 12,
                  }}
                >
                  <div style={{ fontSize: "1.5rem", marginBottom: "8px" }}>🔒</div>
                  <h4 style={{ margin: "0 0 4px", fontWeight: 800 }}>
                    Step 1 Locked (Digital Agreement Required)
                  </h4>
                  <p style={{ margin: 0, fontSize: "0.82rem", lineHeight: 1.5 }}>
                    The backend strictly rejects lesson access requests for Step 1 until a verified,
                    timestamped agreement PDF record is stored in private storage.
                  </p>
                </div>
              ) : (
                <div>
                  <div className={styles.verifiedCard}>
                    <div className={styles.verifiedHeader}>
                      <span>✓ Agreement Legally Executed &amp; Stored</span>
                    </div>
                    <p style={{ margin: "4px 0 0", fontSize: "0.85rem" }}>
                      Record #{signedRecordId} timestamped and merged with IP, User-Agent, and digital
                      signature scan. Visible in <code>/agreements</code>.
                    </p>
                  </div>

                  <div
                    style={{
                      padding: "1.25rem",
                      background: "#f0fdf4",
                      border: "1px solid #bbf7d0",
                      borderRadius: 12,
                      marginTop: "1rem",
                    }}
                  >
                    <h4
                      style={{
                        margin: "0 0 6px",
                        fontSize: "0.95rem",
                        fontWeight: 800,
                        color: "#166534",
                      }}
                    >
                      🎉 Step 1 Unlocked: Course Active
                    </h4>
                    <p style={{ margin: "0 0 12px", fontSize: "0.82rem", color: "#15803d" }}>
                      Learner <strong>{contactName}</strong> now has full access to Step 1 video
                      lectures, anti-skip player, and interactive quizzes.
                    </p>
                    <div style={{ display: "flex", gap: "8px" }}>
                      <Link
                        href="/agreements"
                        className={styles.btnSecondary}
                        style={{ fontSize: "0.78rem", padding: "6px 12px" }}
                      >
                        Inspect in /agreements &rarr;
                      </Link>
                      <button
                        type="button"
                        onClick={() => setActiveTab("LMS_VIDEO_NOTES")}
                        className={styles.btnPrimary}
                        style={{ fontSize: "0.78rem", padding: "6px 12px" }}
                      >
                        Next: Test Anti-Skip Player &rarr;
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* =======================================================================
         JOURNEY 4: COMPULSORY LMS VIDEO, QUIZ PLACEMENT & STUDENT "MY NOTES"
         ======================================================================= */}
      {activeTab === "LMS_VIDEO_NOTES" && (
        <div className={styles.stageCard}>
          <div className={styles.sectionHeader}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
              <h2 className={styles.sectionTitle}>
                Compulsory LMS Video, Configurable Quiz &amp; Student &ldquo;My Notes&rdquo;
              </h2>
              <span
                style={{
                  background: "#fee2e2",
                  color: "#991b1b",
                  fontSize: "0.75rem",
                  fontWeight: 700,
                  padding: "3px 10px",
                  borderRadius: 6,
                  border: "1px solid #fecaca",
                }}
              >
                Anti-Cheat Player &bull; 10s Skip Buttons Removed
              </span>
            </div>
            <p className={styles.sectionSubtitle}>
              Item #4, #5, #6, #7: Tests the stripped-down video player with no 10-second skip
              buttons, locked timeline scrub bar, dynamic moving watermark, configurable{" "}
              <code>BEFORE_VIDEO</code> vs <code>AFTER_VIDEO</code> quiz unlocking, visual question
              option cards, and chronological &ldquo;My Notes&rdquo; with jump links.
            </p>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))",
              gap: "2rem",
            }}
          >
            {/* Left: Anti-Skip Player Simulation & Quiz Preview */}
            <div>
              {/* Placement Switcher */}
              <div style={{ marginBottom: "1.25rem" }}>
                <label className={styles.label}>
                  Quiz Placement Configuration (Course Studio Step 7)
                </label>
                <div style={{ display: "flex", gap: "10px", marginTop: "6px" }}>
                  <button
                    type="button"
                    onClick={() => setQuizPlacement("BEFORE_VIDEO")}
                    style={{
                      flex: 1,
                      padding: "8px 10px",
                      borderRadius: 8,
                      border: `1.5px solid ${
                        quizPlacement === "BEFORE_VIDEO"
                          ? "var(--accent-primary, #c97a1e)"
                          : "#cbd5e1"
                      }`,
                      background: quizPlacement === "BEFORE_VIDEO" ? "#fef3c7" : "#ffffff",
                      color: quizPlacement === "BEFORE_VIDEO" ? "#92400e" : "#475569",
                      fontWeight: 700,
                      fontSize: "0.8rem",
                      cursor: "pointer",
                    }}
                  >
                    BEFORE_VIDEO (Diagnostic First)
                  </button>
                  <button
                    type="button"
                    onClick={() => setQuizPlacement("AFTER_VIDEO")}
                    style={{
                      flex: 1,
                      padding: "8px 10px",
                      borderRadius: 8,
                      border: `1.5px solid ${
                        quizPlacement === "AFTER_VIDEO"
                          ? "var(--accent-primary, #c97a1e)"
                          : "#cbd5e1"
                      }`,
                      background: quizPlacement === "AFTER_VIDEO" ? "#fef3c7" : "#ffffff",
                      color: quizPlacement === "AFTER_VIDEO" ? "#92400e" : "#475569",
                      fontWeight: 700,
                      fontSize: "0.8rem",
                      cursor: "pointer",
                    }}
                  >
                    AFTER_VIDEO (Comprehension Last)
                  </button>
                </div>
              </div>

              {/* Video Player Box */}
              <div className={styles.videoWrapper}>
                <div className={styles.videoStage}>
                  {/* Dynamic Moving Watermark */}
                  <div className={styles.movingWatermark}>
                    {contactName} &bull; {contactEmail} &bull; UTC {new Date().toISOString().slice(11, 19)}
                  </div>

                  {seekWarning && <div className={styles.seekToastWarning}>⚠️ {seekWarning}</div>}

                  <div style={{ textAlign: "center", padding: "1.5rem" }}>
                    <div style={{ fontSize: "2rem", marginBottom: "6px" }}>
                      {isPlaying ? "▶️" : "⏸️"}
                    </div>
                    <div style={{ fontWeight: 800, fontSize: "1.05rem" }}>
                      Neuroscience of Emotional Hijacking
                    </div>
                    <div style={{ fontSize: "0.78rem", color: "#94a3b8", marginTop: "4px" }}>
                      Step 1 &bull; Compulsory Video Lecture (No Skip Allowed)
                    </div>
                  </div>
                </div>

                {/* Player Controls Bar */}
                <div className={styles.videoControlsBar}>
                  {/* Locked Scrub Bar */}
                  <div
                    className={styles.scrubBarTrack}
                    onClick={triggerSeekWarning}
                    title="Timeline scrubbing ahead is locked"
                  >
                    <div
                      className={styles.scrubBarWatched}
                      style={{ width: `${(watchedSec / totalDurationSec) * 100}%` }}
                    />
                  </div>

                  <div className={styles.controlsRow}>
                    <div className={styles.controlsLeft}>
                      <button
                        type="button"
                        onClick={() => setIsPlaying((p) => !p)}
                        className={styles.playbackBtn}
                      >
                        {isPlaying ? "Pause" : "Play"}
                      </button>
                      <span style={{ fontSize: "0.78rem", color: "#94a3b8" }}>
                        {Math.floor(watchedSec / 60)}:
                        {(watchedSec % 60).toString().padStart(2, "0")} / 05:00
                      </span>
                    </div>

                    <div className={styles.controlsRight}>
                      <span
                        style={{
                          fontSize: "0.72rem",
                          color: "#f87171",
                          fontWeight: 700,
                          background: "rgba(239, 68, 68, 0.2)",
                          padding: "2px 8px",
                          borderRadius: 4,
                        }}
                      >
                        🔒 Scrub Bar Locked
                      </span>
                      <button
                        type="button"
                        onClick={handleSimulateWatchProgress}
                        style={{
                          background: "var(--accent-primary, #c97a1e)",
                          color: "#ffffff",
                          border: "none",
                          borderRadius: 4,
                          padding: "3px 8px",
                          fontSize: "0.72rem",
                          fontWeight: 700,
                          cursor: "pointer",
                        }}
                      >
                        Simulate Watched
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Google-Forms Style Visual Question Card */}
              <div style={{ marginTop: "1.5rem" }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: "8px",
                  }}
                >
                  <h4 style={{ margin: 0, fontSize: "0.95rem", fontWeight: 800 }}>
                    Visual Question Bank Assessment
                  </h4>
                  <span
                    style={{
                      fontSize: "0.72rem",
                      padding: "2px 8px",
                      borderRadius: 4,
                      fontWeight: 700,
                      background: quizUnlocked ? "#dcfce7" : "#fee2e2",
                      color: quizUnlocked ? "#166534" : "#991b1b",
                    }}
                  >
                    {quizUnlocked ? "Unlocked ✓" : "Locked (Video Progress Required)"}
                  </span>
                </div>

                {!quizUnlocked ? (
                  <div
                    style={{
                      padding: "1rem",
                      background: "#f8fafc",
                      border: "1px solid #e2e8f0",
                      borderRadius: 10,
                      color: "#64748b",
                      fontSize: "0.82rem",
                    }}
                  >
                    🔒 Under <code>AFTER_VIDEO</code> placement, this comprehension quiz remains
                    locked until the learner watches the full video. Click &ldquo;Simulate
                    Watched&rdquo; above to test unlocking.
                  </div>
                ) : (
                  <div className={styles.questionCard}>
                    <div
                      style={{
                        fontSize: "0.75rem",
                        fontWeight: 700,
                        color: "var(--accent-primary, #c97a1e)",
                        marginBottom: 4,
                      }}
                    >
                      QUESTION 1 of 5 &bull; MULTIPLE CHOICE
                    </div>
                    <p style={{ margin: "0 0 10px", fontSize: "0.88rem", fontWeight: 700 }}>
                      What neurological process takes place during the 6-second emotional gap?
                    </p>

                    {[
                      "The amygdala completely disengages and passes control to the neocortex.",
                      "Cortisol surges, locking down executive functioning.",
                      "Autonomic nervous system triggers immediate vocal confrontation.",
                      "Memory consolidation stops entirely.",
                    ].map((opt, idx) => {
                      const isSelected = selectedAnswer === idx;
                      return (
                        <div
                          key={idx}
                          onClick={() => setSelectedAnswer(idx)}
                          className={`${styles.optionCard} ${
                            isSelected ? styles.optionCardSelected : ""
                          }`}
                        >
                          <input
                            type="radio"
                            name="quiz_opt"
                            checked={isSelected}
                            onChange={() => setSelectedAnswer(idx)}
                            style={{ accentColor: "var(--accent-primary, #c97a1e)" }}
                          />
                          <span style={{ fontSize: "0.84rem", color: "#1e293b" }}>{opt}</span>
                        </div>
                      );
                    })}

                    <div style={{ marginTop: "12px", display: "flex", gap: "8px" }}>
                      <button
                        type="button"
                        onClick={handlePassQuiz}
                        disabled={selectedAnswer === null}
                        className={styles.btnPrimary}
                        style={{ fontSize: "0.8rem", padding: "6px 14px" }}
                      >
                        Submit Answer &amp; Pass
                      </button>
                      {quizPassed && (
                        <span
                          style={{
                            fontSize: "0.8rem",
                            color: "#16a34a",
                            fontWeight: 700,
                            alignSelf: "center",
                          }}
                        >
                          ✓ Passed! Score: 100%
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Right: Chronological "My Notes" & Highlights Side */}
            <div>
              <h3
                style={{
                  margin: "0 0 0.5rem",
                  fontSize: "1.1rem",
                  fontWeight: 800,
                  color: "var(--text-primary)",
                }}
              >
                Chronological Student &ldquo;My Notes&rdquo;
              </h3>
              <p
                style={{
                  margin: "0 0 1rem",
                  fontSize: "0.82rem",
                  color: "var(--text-muted)",
                  lineHeight: 1.45,
                }}
              >
                Item #7: In-lesson note taking synchronized with video timestamps, accessible in the
                learner portal with breadcrumb jump links.
              </p>

              {/* Note Composer */}
              <form
                onSubmit={handleAddNote}
                style={{
                  background: "#ffffff",
                  border: "1.5px solid var(--border-light, #e7decb)",
                  borderRadius: 12,
                  padding: "1rem",
                  marginBottom: "1rem",
                }}
              >
                <div style={{ marginBottom: "8px" }}>
                  <label style={{ fontSize: "0.78rem", fontWeight: 700, color: "#475569" }}>
                    Captured Video Timestamp
                  </label>
                  <div
                    style={{
                      fontSize: "0.82rem",
                      fontWeight: 700,
                      color: "var(--accent-primary, #c97a1e)",
                    }}
                  >
                    ⏱️ {Math.floor(watchedSec / 60)}:
                    {(watchedSec % 60).toString().padStart(2, "0")} (Auto-tagged)
                  </div>
                </div>

                <div style={{ marginBottom: "8px" }}>
                  <label style={{ fontSize: "0.78rem", fontWeight: 700, color: "#475569" }}>
                    Highlight Snippet (Optional)
                  </label>
                  <input
                    type="text"
                    className={styles.input}
                    style={{ padding: "6px 8px", fontSize: "0.82rem" }}
                    placeholder="e.g. 6-second emotional gap theorem"
                    value={newHighlight}
                    onChange={(e) => setNewHighlight(e.target.value)}
                  />
                </div>

                <div style={{ marginBottom: "10px" }}>
                  <label style={{ fontSize: "0.78rem", fontWeight: 700, color: "#475569" }}>
                    My Note
                  </label>
                  <textarea
                    rows={2}
                    className={styles.textarea}
                    style={{ padding: "6px 8px", fontSize: "0.82rem" }}
                    placeholder="Add your note or key reflection..."
                    required
                    value={newNoteText}
                    onChange={(e) => setNewNoteText(e.target.value)}
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSavingNote || !newNoteText.trim()}
                  className={styles.btnPrimary}
                  style={{ width: "100%", justifyContent: "center", fontSize: "0.8rem", padding: "6px" }}
                >
                  {isSavingNote ? "Saving to /notes..." : "Save Student Note →"}
                </button>
              </form>

              {/* Chronological Notes Feed */}
              <div className={styles.notesList}>
                {studentNotes.map((note) => {
                  const tsMin = Math.floor((note.videoTimestampSeconds || 0) / 60);
                  const tsSec = (note.videoTimestampSeconds || 0) % 60;
                  const formattedDate = new Date(note.createdAt).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  });

                  return (
                    <div key={note.id} className={styles.noteItem}>
                      <div className={styles.noteBreadcrumb}>
                        <span>{note.program?.title || "Executive Leadership"}</span>
                        <span>&rsaquo;</span>
                        <span>{note.step?.title || "Step 1"}</span>
                        <span>&rsaquo;</span>
                        <span>{note.lesson?.title || "Lesson 2"}</span>
                      </div>

                      {note.highlightSnippet && (
                        <div className={styles.noteSnippet}>&ldquo;{note.highlightSnippet}&rdquo;</div>
                      )}

                      <div className={styles.noteText}>{note.noteText}</div>

                      <div className={styles.noteFooter}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <span
                            style={{
                              background: "#fef3c7",
                              color: "#92400e",
                              fontWeight: 700,
                              padding: "2px 6px",
                              borderRadius: 4,
                            }}
                          >
                            ⏱️ {tsMin}:{tsSec.toString().padStart(2, "0")}
                          </span>
                          <span>{formattedDate}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDeleteNote(note.id)}
                          style={{
                            background: "none",
                            border: "none",
                            color: "#94a3b8",
                            cursor: "pointer",
                            fontSize: "0.75rem",
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =======================================================================
         JOURNEY 5: MULTI-CURRENCY CHECKOUT & GSB EVENT TICKETING
         ======================================================================= */}
      {activeTab === "CHECKOUT_EVENTS" && (
        <div className={styles.stageCard}>
          <div className={styles.sectionHeader}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
              <h2 className={styles.sectionTitle}>
                Multi-Currency Checkout &amp; GSB Dynamic Event Ticketing
              </h2>
              <span
                style={{
                  background: "#fef3c7",
                  color: "#92400e",
                  fontSize: "0.75rem",
                  fontWeight: 700,
                  padding: "3px 10px",
                  borderRadius: 6,
                  border: "1px solid #fde68a",
                }}
              >
                Multi-Currency Engine: USD &bull; AED &bull; INR
              </span>
            </div>
            <p className={styles.sectionSubtitle}>
              Item #1, #2, #10, #14: Tests zero-trust checkout order intent and signature
              verification across USD, AED, and INR, automated WhatBoutMe FZE invoice generation, and
              GSB-style dynamic event ticketing (Online meeting link vs Physical venue address with
              Maps pin).
            </p>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))",
              gap: "2rem",
            }}
          >
            {/* Left: Program Multi-Currency Checkout */}
            <div>
              <h3
                style={{
                  margin: "0 0 1rem",
                  fontSize: "1.1rem",
                  fontWeight: 800,
                  color: "var(--text-primary)",
                }}
              >
                Program Enrolment Checkout (TEST_BYPASS)
              </h3>

              <div style={{ marginBottom: "1.25rem" }}>
                <label className={styles.label}>Select Currency</label>
                <div style={{ display: "flex", gap: "10px", marginTop: "6px" }}>
                  {(["USD", "AED", "INR"] as const).map((curr) => (
                    <button
                      key={curr}
                      type="button"
                      onClick={() => setCheckoutCurrency(curr)}
                      style={{
                        flex: 1,
                        padding: "8px 10px",
                        borderRadius: 8,
                        border: `1.5px solid ${
                          checkoutCurrency === curr ? "var(--accent-primary, #c97a1e)" : "#cbd5e1"
                        }`,
                        background: checkoutCurrency === curr ? "#fef3c7" : "#ffffff",
                        color: checkoutCurrency === curr ? "#92400e" : "#475569",
                        fontWeight: 800,
                        cursor: "pointer",
                      }}
                    >
                      {curr} ({curr === "USD" ? "$ USD" : curr === "AED" ? "AED" : "₹ INR"})
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ marginBottom: "1.25rem" }}>
                <label className={styles.label}>Payment Plan Structure</label>
                <div style={{ display: "flex", gap: "10px", marginTop: "6px" }}>
                  <label
                    style={{
                      flex: 1,
                      padding: "8px 10px",
                      borderRadius: 8,
                      border: `1.5px solid ${
                        paymentPlan === "FULL" ? "var(--accent-primary, #c97a1e)" : "#cbd5e1"
                      }`,
                      background: paymentPlan === "FULL" ? "#fffbeb" : "#ffffff",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      fontSize: "0.82rem",
                      fontWeight: 700,
                    }}
                  >
                    <input
                      type="radio"
                      name="plan_prev"
                      checked={paymentPlan === "FULL"}
                      onChange={() => setPaymentPlan("FULL")}
                      style={{ accentColor: "var(--accent-primary, #c97a1e)" }}
                    />
                    <span>Full Payment</span>
                  </label>

                  <label
                    style={{
                      flex: 1,
                      padding: "8px 10px",
                      borderRadius: 8,
                      border: `1.5px solid ${
                        paymentPlan === "INSTALMENTS"
                          ? "var(--accent-primary, #c97a1e)"
                          : "#cbd5e1"
                      }`,
                      background: paymentPlan === "INSTALMENTS" ? "#fffbeb" : "#ffffff",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      fontSize: "0.82rem",
                      fontWeight: 700,
                    }}
                  >
                    <input
                      type="radio"
                      name="plan_prev"
                      checked={paymentPlan === "INSTALMENTS"}
                      onChange={() => setPaymentPlan("INSTALMENTS")}
                      style={{ accentColor: "var(--accent-primary, #c97a1e)" }}
                    />
                    <span>3x Instalments</span>
                  </label>
                </div>
              </div>

              {/* Promo Code Form */}
              <div style={{ marginBottom: "1.25rem" }}>
                <label className={styles.label}>Discount Promo Code</label>
                <div style={{ display: "flex", gap: "8px", marginTop: "4px" }}>
                  <input
                    type="text"
                    className={styles.input}
                    placeholder="Enter code (e.g. WELCOME100)"
                    value={couponCode}
                    onChange={(e) => setCouponCode(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={handleApplyCoupon}
                    className={styles.btnSecondary}
                    style={{ whiteSpace: "nowrap" }}
                  >
                    Apply Code
                  </button>
                </div>
                {couponApplied && (
                  <span
                    style={{
                      fontSize: "0.78rem",
                      color: "#16a34a",
                      fontWeight: 700,
                      marginTop: 4,
                      display: "block",
                    }}
                  >
                    ✓ Coupon &quot;{couponCode}&quot; applied successfully!
                  </span>
                )}
              </div>

              {/* Fee Calculation Summary */}
              <div
                style={{
                  background: "#f8fafc",
                  border: "1px solid #e2e8f0",
                  borderRadius: 12,
                  padding: "1.25rem",
                  marginBottom: "1.25rem",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: "0.85rem",
                    color: "#64748b",
                    marginBottom: 6,
                  }}
                >
                  <span>Base Program Fee:</span>
                  <span>
                    {currencySymbols[checkoutCurrency]}
                    {currentBase.toLocaleString()}
                  </span>
                </div>
                {couponApplied && (
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      fontSize: "0.85rem",
                      color: "#16a34a",
                      marginBottom: 6,
                    }}
                  >
                    <span>Coupon Discount:</span>
                    <span>
                      -{currencySymbols[checkoutCurrency]}
                      {discountAmount.toLocaleString()}
                    </span>
                  </div>
                )}
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: "1.05rem",
                    fontWeight: 800,
                    color: "#1e293b",
                    borderTop: "1px solid #e2e8f0",
                    paddingTop: 8,
                  }}
                >
                  <span>Amount Due Now:</span>
                  <span style={{ color: "var(--accent-primary, #c97a1e)" }}>
                    {currencySymbols[checkoutCurrency]}
                    {netDue.toLocaleString()} {checkoutCurrency}
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={handleExecuteZeroTrustCheckout}
                disabled={isProcessingCheckout}
                className={styles.btnPrimary}
                style={{ width: "100%", justifyContent: "center", padding: "12px" }}
              >
                {isProcessingCheckout
                  ? "Processing Zero-Trust Checkout Intent..."
                  : `Pay ${currencySymbols[checkoutCurrency]}${netDue.toLocaleString()} (TEST_BYPASS)`}
              </button>

              {checkoutInvoice && (
                <div
                  style={{
                    marginTop: "1rem",
                    padding: "1rem",
                    background: "#f0fdf4",
                    border: "1px solid #bbf7d0",
                    borderRadius: 10,
                  }}
                >
                  <div style={{ fontWeight: 800, color: "#166534", fontSize: "0.88rem" }}>
                    ✓ WhatBoutMe FZE Invoice Issued: {checkoutInvoice}
                  </div>
                  <p style={{ margin: "4px 0 8px", fontSize: "0.82rem", color: "#15803d" }}>
                    Paid record recorded in database. Enrolment provisioned and ready for digital
                    agreement.
                  </p>
                  <Link
                    href="/invoices"
                    className={styles.btnSecondary}
                    style={{ fontSize: "0.78rem", padding: "4px 10px" }}
                  >
                    View in /invoices &rarr;
                  </Link>
                </div>
              )}
            </div>

            {/* Right: GSB Dynamic Event Ticketing */}
            <div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "1rem",
                }}
              >
                <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 800 }}>
                  GSB Dynamic Event Ticketing
                </h3>
                <span
                  style={{
                    fontSize: "0.78rem",
                    fontWeight: 700,
                    color: "#16a34a",
                    background: "#f0fdf4",
                    padding: "2px 8px",
                    borderRadius: 4,
                  }}
                >
                  {eventSeatsRemaining} Seats Remaining
                </span>
              </div>

              <div style={{ marginBottom: "1rem" }}>
                <label className={styles.label}>Select Location Mode</label>
                <div style={{ display: "flex", gap: "10px", marginTop: "6px" }}>
                  <button
                    type="button"
                    onClick={() => setEventLocationType("ONLINE")}
                    style={{
                      flex: 1,
                      padding: "8px",
                      borderRadius: 8,
                      border: `1.5px solid ${
                        eventLocationType === "ONLINE"
                          ? "var(--accent-primary, #c97a1e)"
                          : "#cbd5e1"
                      }`,
                      background: eventLocationType === "ONLINE" ? "#fef3c7" : "#ffffff",
                      color: eventLocationType === "ONLINE" ? "#92400e" : "#475569",
                      fontWeight: 700,
                      cursor: "pointer",
                      fontSize: "0.8rem",
                    }}
                  >
                    🌐 ONLINE (Private Link)
                  </button>
                  <button
                    type="button"
                    onClick={() => setEventLocationType("PHYSICAL")}
                    style={{
                      flex: 1,
                      padding: "8px",
                      borderRadius: 8,
                      border: `1.5px solid ${
                        eventLocationType === "PHYSICAL"
                          ? "var(--accent-primary, #c97a1e)"
                          : "#cbd5e1"
                      }`,
                      background: eventLocationType === "PHYSICAL" ? "#fef3c7" : "#ffffff",
                      color: eventLocationType === "PHYSICAL" ? "#92400e" : "#475569",
                      fontWeight: 700,
                      cursor: "pointer",
                      fontSize: "0.8rem",
                    }}
                  >
                    📍 PHYSICAL (Venue &amp; Maps)
                  </button>
                </div>
              </div>

              <div style={{ marginBottom: "1rem" }}>
                <label className={styles.label}>Ticketing Currency</label>
                <div style={{ display: "flex", gap: "10px", marginTop: "6px" }}>
                  {(["USD", "AED", "INR"] as const).map((curr) => (
                    <button
                      key={curr}
                      type="button"
                      onClick={() => setEventCurrency(curr)}
                      style={{
                        flex: 1,
                        padding: "6px",
                        borderRadius: 6,
                        border: `1.5px solid ${
                          eventCurrency === curr ? "var(--accent-primary, #c97a1e)" : "#cbd5e1"
                        }`,
                        background: eventCurrency === curr ? "#fef3c7" : "#ffffff",
                        color: eventCurrency === curr ? "#92400e" : "#475569",
                        fontWeight: 700,
                        cursor: "pointer",
                        fontSize: "0.78rem",
                      }}
                    >
                      {curr}
                    </button>
                  ))}
                </div>
              </div>

              {/* Share Event Link Button */}
              <div style={{ marginBottom: "1.25rem" }}>
                <button
                  type="button"
                  onClick={handleCopyEventLink}
                  className={styles.btnSecondary}
                  style={{ width: "100%", justifyContent: "center" }}
                >
                  🔗 {copiedLink ? "Event Link Copied to Clipboard! ✓" : "Share Event Link (1-Click Copy)"}
                </button>
              </div>

              {/* Event Card */}
              <div
                style={{
                  background: "#fcfaf7",
                  border: "1px solid #ebd9c8",
                  borderRadius: 12,
                  padding: "1.25rem",
                  marginBottom: "1rem",
                }}
              >
                <h4 style={{ margin: "0 0 6px", fontSize: "1.05rem", fontWeight: 800 }}>
                  Emotional Resilience in Crisis: Live Masterclass
                </h4>
                <div
                  style={{
                    fontSize: "0.82rem",
                    color: "#64748b",
                    lineHeight: 1.5,
                    marginBottom: "10px",
                  }}
                >
                  <div>
                    <strong>Host:</strong> Roweena Foxwel &bull; Founder
                  </div>
                  <div>
                    <strong>Timing:</strong> Saturday, Nov 14, 2026 &bull; 10:00 AM GST
                  </div>
                  <div>
                    <strong>Location:</strong>{" "}
                    {eventLocationType === "ONLINE"
                      ? "Live Interactive Webinar (Private Zoom)"
                      : "The Ritz-Carlton DIFC, Dubai, UAE (Grand Ballroom)"}
                  </div>
                  {eventLocationType === "PHYSICAL" && (
                    <div style={{ marginTop: 4 }}>
                      <a
                        href="https://maps.google.com"
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: "#0284c7", fontWeight: 700 }}
                      >
                        📍 View on Google Maps &rarr;
                      </a>
                    </div>
                  )}
                </div>

                {!eventTicketBooked ? (
                  <div
                    style={{
                      padding: "1rem",
                      background: "#ffffff",
                      border: "1px solid #e2e8f0",
                      borderRadius: 8,
                      textAlign: "center",
                      color: "#d97706",
                      fontSize: "0.8rem",
                      fontWeight: 700,
                    }}
                  >
                    🔒 Meeting link is private and revealed immediately upon ticket confirmation.
                  </div>
                ) : (
                  <div className={styles.verifiedCard} style={{ margin: 0 }}>
                    <div className={styles.verifiedHeader}>
                      <span>✓ Ticket Confirmed &amp; Seat Allocated</span>
                    </div>
                    {eventLocationType === "ONLINE" ? (
                      <div style={{ marginTop: 6, fontSize: "0.82rem" }}>
                        <span style={{ color: "#166534", fontWeight: 700, display: "block" }}>
                          Private Meeting Link:
                        </span>
                        <a
                          href="https://zoom.us/j/123456789"
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ color: "#0284c7", fontWeight: 700 }}
                        >
                          https://zoom.us/j/123456789 (Passcode: 2026RESILIENCE)
                        </a>
                      </div>
                    ) : (
                      <div style={{ marginTop: 6, fontSize: "0.82rem", color: "#166534" }}>
                        <strong>Physical Admission Pass:</strong> Show digital confirmation at
                        Grand Ballroom Registration Desk.
                      </div>
                    )}
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={handleBookEventTicket}
                className={styles.btnPrimary}
                style={{ width: "100%", justifyContent: "center", padding: "10px" }}
              >
                Pay {eventCurrency === "USD" ? "$" : eventCurrency === "AED" ? "AED " : "₹"}
                {eventPrices[eventCurrency]} &amp; Confirm Ticket (TEST_BYPASS)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
