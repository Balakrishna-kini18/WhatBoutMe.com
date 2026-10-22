"use client";

import React, { useState, useRef, useEffect } from "react";
import Link from "next/link";
import styles from "./simulator.module.css";
import { formatWhenInTz } from "../lib/timezone";
import LearnerPortalFlow, { LearnerStepView, StepModule } from "../components/LearnerPortalFlow";

export default function SimulatorPage() {
  const [activeTab, setActiveTab] = useState<
    "CONTACT_DISCOVERY" | "CHECKOUT" | "ESIGNATURE" | "LEARNER_PORTAL" | "EVENTS" | "FAQS_GALLERY"
  >("CONTACT_DISCOVERY");

  // ---------------------------------------------------------------------------
  // Top-Level Mode Switcher: Learner Portal Shell vs Public Funnel Flows
  // ---------------------------------------------------------------------------
  const [portalMode, setPortalMode] = useState<"LEARNER_FLOW" | "PUBLIC_FUNNEL">("LEARNER_FLOW");
  const [activeSidebarItem, setActiveSidebarItem] = useState<string>("MY_COURSES");
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [shellToast, setShellToast] = useState<string | null>(null);

  // ---------------------------------------------------------------------------
  // 6-Step Navigation State Machine
  // ---------------------------------------------------------------------------
  const [learningStep, setLearningStep] = useState<LearnerStepView>("MODULE_PAGE");
  const [selectedModuleId, setSelectedModuleId] = useState<string>("step-alex-1");
  const [selectedLessonId, setSelectedLessonId] = useState<string>("les-alex-1");
  const [activeQuizQuestionIndex, setActiveQuizQuestionIndex] = useState<number>(0);

  const triggerToast = (msg: string) => {
    setShellToast(msg);
    setTimeout(() => setShellToast(null), 3500);
  };

  // Helper transitions
  const goToModulePage = (moduleId?: string) => {
    if (moduleId) setSelectedModuleId(moduleId);
    setLearningStep("MODULE_PAGE");
    setActiveSidebarItem("MY_COURSES");
  };

  const goToVideoPage = (moduleId?: string, lessonId?: string) => {
    if (moduleId) setSelectedModuleId(moduleId);
    if (lessonId) setSelectedLessonId(lessonId);
    setLearningStep("VIDEO_PAGE");
    setActiveSidebarItem("MY_COURSES");
  };

  const goToResourcePage = (moduleId?: string, lessonId?: string) => {
    if (moduleId) setSelectedModuleId(moduleId);
    if (lessonId) setSelectedLessonId(lessonId);
    setLearningStep("RESOURCE_PAGE");
    setActiveSidebarItem("MY_COURSES");
  };

  const goToNotesPage = (moduleId?: string, lessonId?: string) => {
    if (moduleId) setSelectedModuleId(moduleId);
    if (lessonId) setSelectedLessonId(lessonId);
    setLearningStep("NOTES_PAGE");
    setActiveSidebarItem("MY_NOTES");
  };

  const goToQuizPage = (moduleId?: string, lessonId?: string) => {
    if (moduleId) setSelectedModuleId(moduleId);
    if (lessonId) setSelectedLessonId(lessonId);
    setActiveQuizQuestionIndex(0);
    setLearningStep("QUIZ_PAGE");
    setActiveSidebarItem("MY_COURSES");
  };

  const goToNextStepPage = (moduleId?: string, lessonId?: string) => {
    if (moduleId) setSelectedModuleId(moduleId);
    if (lessonId) setSelectedLessonId(lessonId);
    setLearningStep("NEXT_STEP_PAGE");
    setActiveSidebarItem("MY_COURSES");
  };

  const sampleModules: StepModule[] = [
    {
      id: "step-alex-1",
      sequence: 1,
      title: "Foundations of Emotional Intelligence & Stress Response",
      description: "Master the foundational emotional self-regulation techniques and trigger mapping methodologies required for modern executive leadership.",
      status: "In progress",
      lessons: [
        {
          id: "les-alex-1",
          title: "Foundations of Mindful Leadership & Emotional Baselines",
          type: "VIDEO",
          mediaUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
          durationSec: 492,
          durationFormatted: "08:12",
          status: "Completed",
        },
        {
          id: "les-alex-2",
          title: "Core Mindset Shift: The Emotional Response Matrix",
          type: "VIDEO",
          mediaUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
          durationSec: 860,
          durationFormatted: "14:20",
          status: "In progress",
        },
        {
          id: "les-alex-3v",
          title: "Advanced Somatic Regulation & Crisis De-escalation",
          type: "VIDEO",
          mediaUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
          durationSec: 705,
          durationFormatted: "11:45",
          status: "Locked",
        },
        {
          id: "les-alex-3",
          title: "Executive Leadership Framework & Trigger Mapping Worksheet",
          type: "PDF",
          mediaUrl: "/docs/Executive_Leadership_Matrix.pdf",
          durationSec: 665,
          durationFormatted: "11:05",
          status: "Locked",
        },
        {
          id: "les-alex-4",
          title: "Module 1 Mastery Knowledge Check Assessment",
          type: "QUIZ",
          mediaUrl: "",
          durationSec: 900,
          durationFormatted: "15:00",
          status: "Locked",
        },
      ],
      quiz: {
        id: "quiz-alex-1",
        title: "Module 1 Knowledge Check Assessment",
        passMark: 75,
        quizPlacement: "AFTER_VIDEO",
      },
    },
    {
      id: "step-alex-2",
      sequence: 2,
      title: "Strategic Influence & High-Stakes Communication",
      description: "Navigating complex stakeholder dynamics with structured persuasion.",
      status: "Completed",
      lessons: [
        {
          id: "les-alex-2-1",
          title: "Persuasive Architecture: High-Stakes Stakeholder Alignment",
          type: "VIDEO",
          mediaUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
          durationSec: 540,
          durationFormatted: "09:00",
          status: "Completed",
        },
        {
          id: "les-alex-2-2",
          title: "Cognitive Perspective Taking in Multi-Party Negotiations",
          type: "VIDEO",
          mediaUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
          durationSec: 672,
          durationFormatted: "11:12",
          status: "Completed",
        },
        {
          id: "les-alex-2-3",
          title: "Stakeholder Alignment & Executive Synthesis Playbook",
          type: "PDF",
          mediaUrl: "/docs/Executive_Leadership_Matrix.pdf",
          durationSec: null,
          durationFormatted: "07:30",
          status: "Completed",
        },
        {
          id: "les-alex-2-4",
          title: "Strategic Communication Practical Evaluation",
          type: "QUIZ",
          mediaUrl: "",
          durationSec: null,
          durationFormatted: "12:00",
          status: "Completed",
        },
      ],
    },
    {
      id: "step-alex-3",
      sequence: 3,
      title: "Executive Presence & Organizational Culture",
      description: "Instilling psychological safety and high-performance norms across cross-functional teams.",
      status: "Completed",
      lessons: [
        {
          id: "les-alex-3-1",
          title: "The Anatomy of Executive Gravitas & Vocal Presence",
          type: "VIDEO",
          mediaUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
          durationSec: 615,
          durationFormatted: "10:15",
          status: "Completed",
        },
        {
          id: "les-alex-3-2",
          title: "Cultivating Psychological Safety in Cross-Functional Teams",
          type: "VIDEO",
          mediaUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
          durationSec: 790,
          durationFormatted: "13:10",
          status: "Completed",
        },
        {
          id: "les-alex-3-3",
          title: "Culture Diagnostics & Behavioral Scorecard",
          type: "PDF",
          mediaUrl: "/docs/Executive_Leadership_Matrix.pdf",
          durationSec: null,
          durationFormatted: "08:45",
          status: "Completed",
        },
        {
          id: "les-alex-3-4",
          title: "Executive Presence Competency Review",
          type: "QUIZ",
          mediaUrl: "",
          durationSec: null,
          durationFormatted: "14:00",
          status: "Completed",
        },
      ],
    },
    {
      id: "step-alex-4",
      sequence: 4,
      title: "Conflict De-Escalation & Resolution Dynamics",
      description: "Systematic methodologies for navigating volatile interpersonal impasses and restoring collaborative alignment.",
      status: "Locked",
    },
    {
      id: "step-alex-5",
      sequence: 5,
      title: "Adaptive Decision-Making Under Cognitive Load",
      description: "Heuristics and stress-testing protocols to prevent decision fatigue and bias in high-velocity leadership environments.",
      status: "Locked",
    },
    {
      id: "step-alex-6",
      sequence: 6,
      title: "The Neuroscience of Trust & Relationship Capital",
      description: "Building durable social capital and authentic vulnerability to catalyze enterprise-wide alignment.",
      status: "Locked",
    },
    {
      id: "step-alex-7",
      sequence: 7,
      title: "High-Performance Coaching & Mentorship Protocols",
      description: "Transformative 1-on-1 coaching frameworks to elevate mid-tier managers into self-directed leaders.",
      status: "Locked",
    },
    {
      id: "step-alex-8",
      sequence: 8,
      title: "Navigating Enterprise Ambiguity & Strategic Agility",
      description: "Operating with clarity amidst incomplete data, shifting market conditions, and evolving business models.",
      status: "Locked",
    },
    {
      id: "step-alex-9",
      sequence: 9,
      title: "Cross-Cultural Intelligence & Global Leadership",
      description: "Bridging diverse cultural contexts and non-verbal cues across distributed international operations.",
      status: "Locked",
    },
    {
      id: "step-alex-10",
      sequence: 10,
      title: "Resilience Architectures & Burnout Prevention",
      description: "Sustaining personal stamina, cognitive acuity, and recovery rhythms during prolonged corporate crises.",
      status: "Locked",
    },
    {
      id: "step-alex-11",
      sequence: 11,
      title: "Visionary Storytelling & Public Keynote Delivery",
      description: "Inspiring stakeholders and external audiences with authentic, narrative-driven leadership communication.",
      status: "Locked",
    },
    {
      id: "step-alex-12",
      sequence: 12,
      title: "Capstone Leadership Portfolio & Final Oral Defense",
      description: "Synthesizing full-spectrum executive mastery into an integrated action plan with mentor review.",
      status: "Locked",
    },
  ];

  const currentModule = sampleModules.find((m) => m.id === selectedModuleId) || sampleModules[0]!;

  // ---------------------------------------------------------------------------
  // 1. "LET'S TALK" CONTACT US & 15-MIN DISCOVERY CALL (ITEMS #12, #13)
  // ---------------------------------------------------------------------------
  const [contactName, setContactName] = useState("Alex Morgan");
  const [contactEmail, setContactEmail] = useState("alex.morgan@example.com");
  const [contactPhone, setContactPhone] = useState("+971 50 123 4567");
  const [contactCategory, setContactCategory] = useState<"GENERAL" | "COURSE">("COURSE");
  const [selectedCourse, setSelectedCourse] = useState("Executive Leadership & Emotional Mastery (CPD 25h)");
  const [contactMessage, setContactMessage] = useState(
    "I am seeking executive coaching on emotional regulation for senior department heads."
  );

  const [contactSubmitted, setContactSubmitted] = useState(false);
  const [showDiscoveryModal, setShowDiscoveryModal] = useState(false);

  // Discovery Call Slot Picker
  const [selectedDate, setSelectedDate] = useState("2026-10-22");
  const [selectedSlot, setSelectedSlot] = useState("14:00 GST");
  const [discoveryBooked, setDiscoveryBooked] = useState(false);
  const [zoomLink, setZoomLink] = useState<string | null>(null);

  const handleContactSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setContactSubmitted(true);
    if (contactCategory === "COURSE") {
      setShowDiscoveryModal(true);
    }
  };

  const handleBookDiscovery = (e: React.FormEvent) => {
    e.preventDefault();
    setDiscoveryBooked(true);
    setZoomLink("https://zoom.us/j/94827150123?pwd=WBMDiscoveryLive2026");
  };

  // ---------------------------------------------------------------------------
  // 2. LEAD CONVERSION & TEST_BYPASS MULTI-CURRENCY CHECKOUT (ITEMS #1, #2, #14)
  // ---------------------------------------------------------------------------
  const [checkoutCurrency, setCheckoutCurrency] = useState<"USD" | "AED" | "INR">("AED");
  const [paymentPlan, setPaymentPlan] = useState<"FULL" | "INSTALMENTS">("FULL");
  const [couponCode, setCouponCode] = useState("WELCOME100");
  const [couponApplied, setCouponApplied] = useState(false);
  const [checkoutStatus, setCheckoutStatus] = useState<"IDLE" | "PROCESSING" | "PAID">("IDLE");
  const [generatedInvoice, setGeneratedInvoice] = useState<string | null>(null);

  const basePrices = {
    USD: { full: 1200, instalment: 420 },
    AED: { full: 4400, instalment: 1540 },
    INR: { full: 99000, instalment: 34650 },
  };

  const currencySymbols = { USD: "$", AED: "AED ", INR: "₹" };
  const currentBase = basePrices[checkoutCurrency][paymentPlan === "FULL" ? "full" : "instalment"];
  const discountAmount = couponApplied ? (checkoutCurrency === "INR" ? 5000 : checkoutCurrency === "AED" ? 250 : 70) : 0;
  const finalPrice = Math.max(0, currentBase - discountAmount);

  const handleApplyCoupon = (e: React.FormEvent) => {
    e.preventDefault();
    if (couponCode.trim()) {
      setCouponApplied(true);
    }
  };

  const handleSimulateCheckout = () => {
    setCheckoutStatus("PROCESSING");
    setTimeout(() => {
      setCheckoutStatus("PAID");
      const invNum = `WBM-INV-2026-${Math.floor(1000 + Math.random() * 9000)}`;
      setGeneratedInvoice(invNum);
    }, 1200);
  };

  // ---------------------------------------------------------------------------
  // 3. WORKSHOP DIGITAL CONSENT & DUAL-MODE SIGNATURE (ITEM #3)
  // ---------------------------------------------------------------------------
  const [hasConsented, setHasConsented] = useState(false);
  const [signatureMode, setSignatureMode] = useState<"DRAW" | "UPLOAD">("DRAW");
  const [signatureDrawn, setSignatureDrawn] = useState(false);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [saveToProfile, setSaveToProfile] = useState(true);
  const [agreementSigned, setAgreementSigned] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDrawing = useRef(false);

  // Setup HTML5 Vector Drawing Canvas
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
    setSignatureDrawn(true);
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
    setSignatureDrawn(false);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setUploadedFileName(file.name);
    }
  };

  const handleSignAgreement = (e: React.FormEvent) => {
    e.preventDefault();
    if (!hasConsented) return;
    if (signatureMode === "DRAW" && !signatureDrawn) return;
    if (signatureMode === "UPLOAD" && !uploadedFileName) return;
    setAgreementSigned(true);
  };

  // ---------------------------------------------------------------------------
  // 4. DYNAMIC EVENTS & TICKETING (GSB STYLE) (ITEMS #2, #10)
  // ---------------------------------------------------------------------------
  const [eventLocationType, setEventLocationType] = useState<"ONLINE" | "PHYSICAL">("ONLINE");
  const [eventCurrency, setEventCurrency] = useState<"USD" | "AED" | "INR">("USD");
  const [copiedLink, setCopiedLink] = useState(false);
  const [eventTicketBooked, setEventTicketBooked] = useState(false);
  const [seatsRemaining, setSeatsRemaining] = useState(24);

  const eventPrices = { USD: 75, AED: 275, INR: 6200 };

  const handleCopyEventLink = () => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText("https://whatboutme.com/events/emotional-resilience-masterclass-2026");
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    }
  };

  const handleBookEventTicket = () => {
    setEventTicketBooked(true);
    setSeatsRemaining((prev) => Math.max(0, prev - 1));
  };

  // ---------------------------------------------------------------------------
  // 5. COURSE FAQS & PUBLIC GALLERY PREVIEW (ITEMS #8, #9)
  // ---------------------------------------------------------------------------
  const [expandedFaq, setExpandedFaq] = useState<number | null>(0);
  const faqs = [
    {
      q: "Is this program accredited for official Continuing Professional Development (CPD)?",
      a: "Yes. Graduates of the 11-step program receive an official certificate verifying 25 hours of accredited CPD, complete with a unique verification hash verifiable on WhatBoutMe.com.",
    },
    {
      q: "What is the policy regarding live session attendance reconciliation?",
      a: "Batch participants must maintain at least 80% attendance across cohort workshops. If an emergency occurs, batch managers can reconcile your attendance through recorded review submissions.",
    },
    {
      q: "How does the anti-skip video player work?",
      a: "To preserve pedagogical integrity, video lectures cannot be fast-forwarded or scrubbed ahead beyond watched progress. Assessments unlock sequentially upon complete viewing.",
    },
  ];

  // ---------------------------------------------------------------------------
  // LEARNER PORTAL SHELL VIEW (Matching Reference Design: 240px Sidebar + Header)
  // ---------------------------------------------------------------------------
  if (portalMode === "LEARNER_FLOW") {
    return (
      <div className={styles.portalShell}>
        {/* Mobile Backdrop */}
        {isMobileSidebarOpen && (
          <div
            className={styles.sidebarBackdrop}
            onClick={() => setIsMobileSidebarOpen(false)}
            aria-hidden="true"
          />
        )}

        {/* 240px Fixed Left Sidebar */}
        <aside
          className={`${styles.portalSidebar} ${isMobileSidebarOpen ? styles.portalSidebarOpen : ""}`}
          aria-label="Learner Portal Sidebar"
        >
          {/* Top Brand */}
          <div className={styles.sidebarBrand}>
            <div className={styles.brandLogoGroup}>
              <svg className={styles.brandHeartIcon} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
              </svg>
              <span className={styles.brandText}>whatboutme</span>
            </div>
            <span className={styles.brandLmsBadge}>LMS</span>
          </div>

          {/* Learner Profile Summary */}
          <div className={styles.learnerProfileSummary}>
            <div className={styles.profileAvatar} aria-hidden="true">
              {(contactName || "Alex Morgan").charAt(0).toUpperCase()}
            </div>
            <div className={styles.profileInfo}>
              <span className={styles.profileName}>{contactName || "Alex Morgan"}</span>
              <span className={styles.profileCohort}>Sigma 1 - Cohort 1</span>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className={styles.sidebarNav} aria-label="Main Navigation">
            {/* Section LEARNING */}
            <div className={styles.navSectionGroup}>
              <span className={styles.navSectionTitle}>Learning</span>

              <button
                type="button"
                onClick={() => {
                  setActiveSidebarItem("DASHBOARD");
                  goToModulePage("step-alex-1");
                  setIsMobileSidebarOpen(false);
                }}
                className={`${styles.navLinkItem} ${activeSidebarItem === "DASHBOARD" ? styles.navLinkItemActive : ""}`}
              >
                <svg className={styles.navLinkIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect width="7" height="9" x="3" y="3" rx="1" />
                  <rect width="7" height="5" x="14" y="3" rx="1" />
                  <rect width="7" height="9" x="14" y="12" rx="1" />
                  <rect width="7" height="5" x="3" y="16" rx="1" />
                </svg>
                <span>Dashboard</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setActiveSidebarItem("MY_COURSES");
                  goToModulePage("step-alex-1");
                  setIsMobileSidebarOpen(false);
                }}
                className={`${styles.navLinkItem} ${activeSidebarItem === "MY_COURSES" ? styles.navLinkItemActive : ""}`}
              >
                <svg className={styles.navLinkIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z" />
                  <path d="M6 6h10" />
                  <path d="M6 10h10" />
                </svg>
                <span>My Courses</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setActiveSidebarItem("MY_NOTES");
                  goToNotesPage("step-alex-1", "les-alex-1");
                  setIsMobileSidebarOpen(false);
                }}
                className={`${styles.navLinkItem} ${activeSidebarItem === "MY_NOTES" ? styles.navLinkItemActive : ""}`}
              >
                <svg className={styles.navLinkIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                </svg>
                <span>My Notes</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setActiveSidebarItem("LIVE_SESSIONS");
                  triggerToast("Live Sessions: Cohort 1 interactive workshop meets Saturday at 10:00 AM GST via Zoom.");
                  setIsMobileSidebarOpen(false);
                }}
                className={`${styles.navLinkItem} ${activeSidebarItem === "LIVE_SESSIONS" ? styles.navLinkItemActive : ""}`}
              >
                <svg className={styles.navLinkIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.934a.5.5 0 0 0-.777-.416L16 11" />
                  <rect width="14" height="12" x="2" y="6" rx="2" />
                </svg>
                <span>Live Sessions</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setActiveSidebarItem("ATTENDANCE");
                  triggerToast("Attendance Record: 88% overall attendance confirmed & reconciled for Sigma 1.");
                  setIsMobileSidebarOpen(false);
                }}
                className={`${styles.navLinkItem} ${activeSidebarItem === "ATTENDANCE" ? styles.navLinkItemActive : ""}`}
              >
                <svg className={styles.navLinkIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M8 2v4" />
                  <path d="M16 2v4" />
                  <rect width="18" height="18" x="3" y="4" rx="2" />
                  <path d="M3 10h18" />
                  <path d="m9 16 2 2 4-4" />
                </svg>
                <span>Attendance</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setActiveSidebarItem("CERTIFICATES");
                  triggerToast("Accredited CPD Certificate: Unlocks automatically upon completing Step 11 & final evaluation.");
                  setIsMobileSidebarOpen(false);
                }}
                className={`${styles.navLinkItem} ${activeSidebarItem === "CERTIFICATES" ? styles.navLinkItemActive : ""}`}
              >
                <svg className={styles.navLinkIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="8" r="6" />
                  <path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11" />
                </svg>
                <span>Certificates</span>
              </button>
            </div>

            {/* Section COMMUNITY */}
            <div className={styles.navSectionGroup}>
              <span className={styles.navSectionTitle}>Community</span>

              <button
                type="button"
                onClick={() => {
                  setActiveSidebarItem("EVENTS");
                  setPortalMode("PUBLIC_FUNNEL");
                  setActiveTab("EVENTS");
                  setIsMobileSidebarOpen(false);
                }}
                className={`${styles.navLinkItem} ${activeSidebarItem === "EVENTS" ? styles.navLinkItemActive : ""}`}
              >
                <svg className={styles.navLinkIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M8 2v4" />
                  <path d="M16 2v4" />
                  <rect width="18" height="18" x="3" y="4" rx="2" />
                  <path d="M3 10h18" />
                </svg>
                <span>Events</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setActiveSidebarItem("MESSAGES");
                  triggerToast("Cohort Messages: 1 unread announcement from instructor Roweena Foxwel.");
                  setIsMobileSidebarOpen(false);
                }}
                className={`${styles.navLinkItem} ${activeSidebarItem === "MESSAGES" ? styles.navLinkItemActive : ""}`}
              >
                <svg className={styles.navLinkIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
                </svg>
                <span>Messages</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setActiveSidebarItem("MY_PROFILE");
                  triggerToast(`Profile: ${contactName || "Alex Morgan"} (${contactEmail || "alex.morgan@example.com"})`);
                  setIsMobileSidebarOpen(false);
                }}
                className={`${styles.navLinkItem} ${activeSidebarItem === "MY_PROFILE" ? styles.navLinkItemActive : ""}`}
              >
                <svg className={styles.navLinkIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
                <span>My Profile</span>
              </button>
            </div>

            {/* Section WEBSITE */}
            <div className={styles.navSectionGroup}>
              <span className={styles.navSectionTitle}>Website</span>

              <Link
                href="/programs"
                className={styles.navLinkItem}
                onClick={() => setIsMobileSidebarOpen(false)}
              >
                <svg className={styles.navLinkIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <path d="m4.93 4.93 4.24 4.24" />
                  <path d="m14.83 9.17 4.24-4.24" />
                  <path d="m14.83 14.83 4.24 4.24" />
                  <path d="m9.17 14.83-4.24 4.24" />
                </svg>
                <span>Explore Courses</span>
              </Link>
            </div>
          </nav>

          {/* Footer */}
          <div className={styles.sidebarFooter}>
            <button
              type="button"
              onClick={() => {
                triggerToast("Simulator: Signed out as Alex Morgan. Session reset.");
              }}
              className={styles.signOutBtn}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              <span>Sign Out</span>
            </button>
          </div>
        </aside>

        {/* Portal Main */}
        <div className={styles.portalMain}>
          {/* Top Header Bar */}
          <header className={styles.portalTopHeader}>
            <div className={styles.headerLeftCluster}>
              <button
                type="button"
                className={styles.hamburgerBtn}
                onClick={() => setIsMobileSidebarOpen(!isMobileSidebarOpen)}
                aria-label="Toggle Navigation Sidebar"
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="3" y1="12" x2="21" y2="12" />
                  <line x1="3" y1="6" x2="21" y2="6" />
                  <line x1="3" y1="18" x2="21" y2="18" />
                </svg>
              </button>

              <div className={styles.headerSearchBar}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#a8a29e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8" />
                  <path d="m21 21-4.3-4.3" />
                </svg>
                <input
                  type="text"
                  className={styles.headerSearchInput}
                  placeholder="Search your courses..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  aria-label="Search your courses"
                />
              </div>
            </div>

            <div className={styles.headerRightCluster}>
              {/* Mode Switcher Pill */}
              <div className={styles.modeSwitcherPill} role="group" aria-label="Portal Mode Switcher">
                <button
                  type="button"
                  onClick={() => setPortalMode("LEARNER_FLOW")}
                  className={`${styles.modeOptionBtn} ${styles.modeOptionBtnActive}`}
                >
                  Learner Course Flow
                </button>
                <button
                  type="button"
                  onClick={() => setPortalMode("PUBLIC_FUNNEL")}
                  className={styles.modeOptionBtn}
                >
                  Public Funnel Flows
                </button>
              </div>

              {/* Notification Bell */}
              <button
                type="button"
                className={styles.headerIconBtn}
                aria-label="2 unread notifications"
                onClick={() => triggerToast("Notifications: 1 new lesson unlocked • 1 live session reminder")}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
                  <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
                </svg>
                <span className={styles.notificationBadge}>2</span>
              </button>

              {/* User Avatar Dropdown */}
              <div
                className={styles.headerUserMenuBtn}
                onClick={() => triggerToast(`Signed in as ${contactName || "Alex Morgan"} (Sigma 1)`)}
                role="button"
                tabIndex={0}
              >
                <span className={styles.headerAvatarMini}>
                  {(contactName || "Alex Morgan").charAt(0).toUpperCase()}
                </span>
                <span className={styles.headerUserName}>
                  {contactName || "Alex Morgan"}
                </span>
              </div>
            </div>
          </header>

          {/* Content Area */}
          <main className={styles.portalContentArea}>
            <LearnerPortalFlow
              module={currentModule}
              allModules={sampleModules}
              courseTitle={selectedCourse || "Executive Leadership & Emotional Mastery (CPD 25h)"}
              cohortName="Sigma 1 — Cohort 1"
              totalStepsCount={12}
              completedStepsCount={3}
              overallProgressPercentage={25}
              learnerName={contactName || "Alex Morgan"}
              learnerEmail={contactEmail || "alex.morgan@example.com"}
              learningStep={learningStep}
              onStepChange={(st) => {
                setLearningStep(st);
                if (st === "NOTES_PAGE") setActiveSidebarItem("MY_NOTES");
                else setActiveSidebarItem("MY_COURSES");
              }}
              selectedModuleId={selectedModuleId}
              onModuleSelect={(mId) => setSelectedModuleId(mId)}
              selectedLessonId={selectedLessonId}
              onLessonSelect={(lId) => setSelectedLessonId(lId)}
              activeQuizQuestionIndex={activeQuizQuestionIndex}
              onQuizQuestionIndexChange={(idx) => setActiveQuizQuestionIndex(idx)}
              onBackToEdit={() => goToModulePage("step-alex-1")}
              onNextModule={() => {
                setSelectedModuleId("step-alex-2");
                setLearningStep("MODULE_PAGE");
                triggerToast("Step 2 Unlocked: Strategic Influence & High-Stakes Communication!");
              }}
              isSimulatorMode={true}
            />
          </main>
        </div>

        {/* Toast */}
        {shellToast && (
          <div className={styles.shellToastBanner} role="status" aria-live="polite">
            <span>{shellToast}</span>
          </div>
        )}
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // PUBLIC FUNNEL TEST LABORATORY VIEW
  // ---------------------------------------------------------------------------
  return (
    <div style={{ minHeight: "100vh", background: "#faf7f2" }}>
      {/* Top Header Bar with Mode Switcher */}
      <header className={styles.portalTopHeader}>
        <div className={styles.headerLeftCluster}>
          <div className={styles.brandLogoGroup}>
            <svg className={styles.brandHeartIcon} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
            </svg>
            <span className={styles.brandText}>whatboutme</span>
            <span className={styles.brandLmsBadge}>Funnel Tester</span>
          </div>
        </div>

        <div className={styles.headerRightCluster}>
          <div className={styles.modeSwitcherPill} role="group" aria-label="Portal Mode Switcher">
            <button
              type="button"
              onClick={() => setPortalMode("LEARNER_FLOW")}
              className={styles.modeOptionBtn}
            >
              Learner Course Flow
            </button>
            <button
              type="button"
              onClick={() => setPortalMode("PUBLIC_FUNNEL")}
              className={`${styles.modeOptionBtn} ${styles.modeOptionBtnActive}`}
            >
              Public Funnel Flows
            </button>
          </div>

          <div
            className={styles.headerUserMenuBtn}
            onClick={() => triggerToast(`Signed in as ${contactName || "Alex Morgan"} (Sigma 1)`)}
            role="button"
            tabIndex={0}
          >
            <span className={styles.headerAvatarMini}>
              {(contactName || "Alex Morgan").charAt(0).toUpperCase()}
            </span>
            <span className={styles.headerUserName}>
              {contactName || "Alex Morgan"}
            </span>
          </div>
        </div>
      </header>

      <div className={styles.simulatorContainer}>
        {/* 1. Page Header */}
        <div className={styles.headerCard}>
          <div>
            <div className={styles.badgeTester}>
              <span>Interactive Spec Verification Simulator</span>
            </div>
            <h1 className={styles.headerTitle}>Learner &amp; Public Funnel Test Simulator</h1>
            <p className={styles.headerSubtitle}>
              End-to-end verification laboratory for all audio-verified items from <strong>Developer note.pdf</strong>: Contact Us (no phone number), 15-Min Discovery Booking, Test-Bypass Multi-Currency Checkout, Workshop Digital Consent + Dual-Mode Signature, and GSB Event Ticketing.
            </p>
          </div>

          <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
            <Link
              href="/programs"
              className={styles.btnSecondary}
              style={{ textDecoration: "none" }}
            >
              &larr; Return to Curriculum
            </Link>
            <Link
              href="/users"
              className={styles.btnPrimary}
              style={{ textDecoration: "none" }}
            >
              Inspect Learners &rarr;
            </Link>
          </div>
        </div>

      {/* 2. Top Navigation Tabs */}
      <nav className={styles.tabNavigation} aria-label="Simulator Modules">
        <button
          type="button"
          onClick={() => setActiveTab("CONTACT_DISCOVERY")}
          className={`${styles.tabBtn} ${activeTab === "CONTACT_DISCOVERY" ? styles.tabBtnActive : ""}`}
        >
          <span>1. Contact Us &amp; 15-Min Discovery</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("CHECKOUT")}
          className={`${styles.tabBtn} ${activeTab === "CHECKOUT" ? styles.tabBtnActive : ""}`}
        >
          <span>2. Test-Bypass Checkout &amp; Invoices</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("ESIGNATURE")}
          className={`${styles.tabBtn} ${activeTab === "ESIGNATURE" ? styles.tabBtnActive : ""}`}
        >
          <span>3. Digital Consent &amp; E-Signature</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab("LEARNER_PORTAL");
            setPortalMode("LEARNER_FLOW");
          }}
          className={`${styles.tabBtn} ${activeTab === "LEARNER_PORTAL" ? styles.tabBtnActive : ""}`}
        >
          <span>4. Guided Learner Experience (6 Steps)</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("EVENTS")}
          className={`${styles.tabBtn} ${activeTab === "EVENTS" ? styles.tabBtnActive : ""}`}
        >
          <span>5. Dynamic Events &amp; Ticketing</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("FAQS_GALLERY")}
          className={`${styles.tabBtn} ${activeTab === "FAQS_GALLERY" ? styles.tabBtnActive : ""}`}
        >
          <span>6. Course FAQs &amp; Gallery</span>
        </button>
      </nav>

      {/* =========================================================================
         TAB 1: CONTACT US FLOW (ITEM #12) & 15-MIN DISCOVERY CALL (ITEM #13)
         ========================================================================= */}
      {activeTab === "CONTACT_DISCOVERY" && (
        <div className={styles.stageCard}>
          <div className={styles.sectionHeader}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <h2 className={styles.sectionTitle}>&ldquo;Let&apos;s Talk&rdquo; Contact Us &amp; 15-Min Discovery Booking</h2>
              <span style={{ background: "#ecfdf5", color: "#166534", fontSize: "0.75rem", fontWeight: 700, padding: "2px 8px", borderRadius: 6 }}>
                Privacy Rule: Phone Number Removed ✓
              </span>
            </div>
            <p className={styles.sectionSubtitle}>
              Item #12: Company mobile phone number is strictly removed from the public interface. General inquiries route to <code>/messages</code>, while Course inquiries dynamically reveal course selection and trigger the 1-to-1 15-minute slot picker synced with Roweena&apos;s calendar.
            </p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))", gap: "2rem" }}>
            {/* Form Side */}
            <div>
              <form onSubmit={handleContactSubmit}>
                <div className={styles.inputGrid}>
                  <div className={styles.formGroup}>
                    <label className={styles.label}>Your Name</label>
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
                    <div style={{ display: "flex", gap: "10px", marginTop: "4px" }}>
                      <button
                        type="button"
                        onClick={() => setContactCategory("GENERAL")}
                        style={{
                          flex: 1,
                          padding: "8px",
                          borderRadius: 8,
                          border: `1.5px solid ${contactCategory === "GENERAL" ? "var(--accent-primary, #c97a1e)" : "#cbd5e1"}`,
                          background: contactCategory === "GENERAL" ? "#fef3c7" : "#ffffff",
                          color: contactCategory === "GENERAL" ? "#92400e" : "#475569",
                          fontWeight: 700,
                          fontSize: "0.82rem",
                          cursor: "pointer",
                        }}
                      >
                        General Inquiry &rarr; Messages
                      </button>
                      <button
                        type="button"
                        onClick={() => setContactCategory("COURSE")}
                        style={{
                          flex: 1,
                          padding: "8px",
                          borderRadius: 8,
                          border: `1.5px solid ${contactCategory === "COURSE" ? "var(--accent-primary, #c97a1e)" : "#cbd5e1"}`,
                          background: contactCategory === "COURSE" ? "#fef3c7" : "#ffffff",
                          color: contactCategory === "COURSE" ? "#92400e" : "#475569",
                          fontWeight: 700,
                          fontSize: "0.82rem",
                          cursor: "pointer",
                        }}
                      >
                        Course Inquiry &rarr; CRM Lead
                      </button>
                    </div>
                  </div>
                </div>

                {/* Dynamically Revealed Course Dropdown */}
                {contactCategory === "COURSE" && (
                  <div className={styles.formGroup} style={{ marginBottom: "1.25rem" }}>
                    <label className={styles.label}>Select Target Course / Program of Interest *</label>
                    <select
                      className={styles.input}
                      value={selectedCourse}
                      onChange={(e) => setSelectedCourse(e.target.value)}
                    >
                      <option value="Executive Leadership & Emotional Mastery (CPD 25h)">
                        Executive Leadership &amp; Emotional Mastery (CPD 25h Accredited)
                      </option>
                      <option value="Self-Leadership & Mindfulness Intensive">
                        Self-Leadership &amp; Mindfulness Intensive (Participation Track)
                      </option>
                      <option value="Corporate Emotional Intelligence Cohort">
                        Corporate Emotional Intelligence Cohort (Tailored Team Track)
                      </option>
                    </select>
                  </div>
                )}

                <div className={styles.formGroup} style={{ marginBottom: "1.5rem" }}>
                  <label className={styles.label}>Tell Us About Yourself &amp; Objectives</label>
                  <textarea
                    rows={4}
                    className={styles.textarea}
                    required
                    value={contactMessage}
                    onChange={(e) => setContactMessage(e.target.value)}
                  />
                </div>

                <button type="submit" className={styles.btnPrimary}>
                  {contactCategory === "COURSE"
                    ? "Submit Inquiry & Book 15-Min Discovery Call →"
                    : "Send General Inquiry →"}
                </button>
              </form>
            </div>

            {/* Results / Interactive Booking Side */}
            <div style={{ background: "#fcfaf7", border: "1px solid #ebd9c8", borderRadius: 14, padding: "1.5rem" }}>
              <h3 style={{ margin: "0 0 1rem", fontSize: "1.1rem", fontWeight: 800, color: "var(--text-primary)" }}>
                Flow Live Evaluation
              </h3>

              {!contactSubmitted ? (
                <div style={{ padding: "2rem", textAlign: "center", color: "var(--text-muted)", fontSize: "0.88rem" }}>
                  Submit the form on the left to test the inquiry dispatch and automatic 15-minute slot picker trigger.
                </div>
              ) : contactCategory === "GENERAL" ? (
                <div className={styles.verifiedCard}>
                  <div className={styles.verifiedHeader}>
                    <span>✓ General Inquiry Dispatched to Support Inbox</span>
                  </div>
                  <p style={{ margin: "4px 0 12px", fontSize: "0.85rem", lineHeight: 1.5 }}>
                    Sent to staff message queue. Staff can respond to <strong>{contactEmail}</strong> directly via the Messages portal.
                  </p>
                  <Link href="/messages" className={styles.btnSecondary} style={{ fontSize: "0.78rem", padding: "6px 12px" }}>
                    View in /messages &rarr;
                  </Link>
                </div>
              ) : (
                <div>
                  <div className={styles.verifiedCard} style={{ marginBottom: "1rem" }}>
                    <div className={styles.verifiedHeader}>
                      <span>✓ CRM Lead Created &amp; Enquiries Updated</span>
                    </div>
                    <p style={{ margin: "4px 0 8px", fontSize: "0.85rem" }}>
                      Prospect <strong>{contactName}</strong> tagged for <em>{selectedCourse}</em>.
                    </p>
                    <Link href="/leads" className={styles.btnSecondary} style={{ fontSize: "0.78rem", padding: "4px 10px" }}>
                      Inspect in /leads &rarr;
                    </Link>
                  </div>

                  {/* 15-Minute Discovery Slot Picker (Item #13) */}
                  <div style={{ background: "#ffffff", border: "1.5px solid var(--accent-primary, #c97a1e)", borderRadius: 12, padding: "1.25rem", boxShadow: "0 4px 14px rgba(201,122,30,0.08)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
                      <h4 style={{ margin: 0, fontSize: "0.95rem", fontWeight: 800, color: "var(--text-primary)" }}>
                        15-Min 1-to-1 Discovery with Roweena
                      </h4>
                      <span style={{ fontSize: "0.72rem", background: "#fef3c7", color: "#92400e", padding: "2px 6px", borderRadius: 4, fontWeight: 700 }}>
                        Unified Calendar Sync ✓
                      </span>
                    </div>

                    {!discoveryBooked ? (
                      <form onSubmit={handleBookDiscovery}>
                        <div style={{ marginBottom: "10px" }}>
                          <label style={{ fontSize: "0.78rem", fontWeight: 700, color: "#475569" }}>Select Date</label>
                          <select
                            className={styles.input}
                            style={{ padding: "6px 10px", fontSize: "0.82rem" }}
                            value={selectedDate}
                            onChange={(e) => setSelectedDate(e.target.value)}
                          >
                            <option value="2026-10-22">Thursday, Oct 22, 2026</option>
                            <option value="2026-10-23">Friday, Oct 23, 2026</option>
                            <option value="2026-10-26">Monday, Oct 26, 2026</option>
                          </select>
                        </div>

                        <div style={{ marginBottom: "12px" }}>
                          <label style={{ fontSize: "0.78rem", fontWeight: 700, color: "#475569" }}>Available 15-Min Slots (No Workshop Clashes)</label>
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "6px", marginTop: "4px" }}>
                            {["10:00 GST", "11:30 GST", "14:00 GST", "15:30 GST", "17:00 GST", "18:15 GST"].map((slot) => (
                              <button
                                key={slot}
                                type="button"
                                onClick={() => setSelectedSlot(slot)}
                                style={{
                                  padding: "6px",
                                  borderRadius: 6,
                                  border: `1px solid ${selectedSlot === slot ? "var(--accent-primary, #c97a1e)" : "#cbd5e1"}`,
                                  background: selectedSlot === slot ? "var(--accent-primary, #c97a1e)" : "#f8fafc",
                                  color: selectedSlot === slot ? "#ffffff" : "#334155",
                                  fontSize: "0.75rem",
                                  fontWeight: 700,
                                  cursor: "pointer",
                                }}
                              >
                                {slot}
                              </button>
                            ))}
                          </div>
                        </div>

                        <button type="submit" className={styles.btnPrimary} style={{ width: "100%", justifyContent: "center" }}>
                          Confirm Discovery Booking &amp; Generate Zoom Link
                        </button>
                      </form>
                    ) : (
                      <div>
                        <div style={{ padding: "10px 12px", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, color: "#166534", fontSize: "0.82rem", marginBottom: "10px" }}>
                          <strong>Booking Confirmed!</strong> Session scheduled for {selectedDate} at {selectedSlot}.
                        </div>
                        <div style={{ padding: "8px 12px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: "0.82rem" }}>
                          <span style={{ color: "#64748b", fontSize: "0.75rem", display: "block" }}>Automated Zoom Meeting Link:</span>
                          <a href={zoomLink || "#"} target="_blank" rel="noopener noreferrer" style={{ color: "#0284c7", fontWeight: 700, wordBreak: "break-all" }}>
                            {zoomLink}
                          </a>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
         TAB 2: TEST_BYPASS CHECKOUT & INVOICES (ITEMS #1, #2, #14)
         ========================================================================= */}
      {activeTab === "CHECKOUT" && (
        <div className={styles.stageCard}>
          <div className={styles.sectionHeader}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <h2 className={styles.sectionTitle}>Test-Bypass Multi-Currency Checkout &amp; Invoices</h2>
              <span style={{ background: "#fef3c7", color: "#92400e", fontSize: "0.75rem", fontWeight: 700, padding: "2px 8px", borderRadius: 6 }}>
                Active Mode: TEST_BYPASS ✓
              </span>
            </div>
            <p className={styles.sectionSubtitle}>
              Item #1 &amp; #2 &amp; #14: Simulates verified server-to-server webhook transition (<code>PENDING</code> &rarr; <code>PAID</code>) in USD, AED, or INR for course enrollments, automatically creating the WhatBoutMe FZE invoice.
            </p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))", gap: "2rem" }}>
            {/* Checkout Form */}
            <div>
              <div style={{ marginBottom: "1.25rem" }}>
                <label className={styles.label}>Select Currency (Multi-Currency Engine)</label>
                <div style={{ display: "flex", gap: "10px", marginTop: "6px" }}>
                  {(["USD", "AED", "INR"] as const).map((curr) => (
                    <button
                      key={curr}
                      type="button"
                      onClick={() => setCheckoutCurrency(curr)}
                      style={{
                        flex: 1,
                        padding: "8px 12px",
                        borderRadius: 8,
                        border: `1.5px solid ${checkoutCurrency === curr ? "var(--accent-primary, #c97a1e)" : "#cbd5e1"}`,
                        background: checkoutCurrency === curr ? "#fef3c7" : "#ffffff",
                        color: checkoutCurrency === curr ? "#92400e" : "#475569",
                        fontWeight: 800,
                        cursor: "pointer",
                      }}
                    >
                      {curr} ({curr === "USD" ? "$ USD" : curr === "AED" ? "AED (Dubai)" : "₹ INR"})
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
                      padding: "10px 12px",
                      borderRadius: 8,
                      border: `1.5px solid ${paymentPlan === "FULL" ? "var(--accent-primary, #c97a1e)" : "#cbd5e1"}`,
                      background: paymentPlan === "FULL" ? "#fffbeb" : "#ffffff",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      fontSize: "0.85rem",
                      fontWeight: 700,
                    }}
                  >
                    <input
                      type="radio"
                      name="plan"
                      checked={paymentPlan === "FULL"}
                      onChange={() => setPaymentPlan("FULL")}
                      style={{ accentColor: "var(--accent-primary, #c97a1e)" }}
                    />
                    <span>Full One-Time Payment</span>
                  </label>

                  <label
                    style={{
                      flex: 1,
                      padding: "10px 12px",
                      borderRadius: 8,
                      border: `1.5px solid ${paymentPlan === "INSTALMENTS" ? "var(--accent-primary, #c97a1e)" : "#cbd5e1"}`,
                      background: paymentPlan === "INSTALMENTS" ? "#fffbeb" : "#ffffff",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      fontSize: "0.85rem",
                      fontWeight: 700,
                    }}
                  >
                    <input
                      type="radio"
                      name="plan"
                      checked={paymentPlan === "INSTALMENTS"}
                      onChange={() => setPaymentPlan("INSTALMENTS")}
                      style={{ accentColor: "var(--accent-primary, #c97a1e)" }}
                    />
                    <span>3x Monthly Instalments</span>
                  </label>
                </div>
              </div>

              {/* Coupon Form */}
              <div style={{ marginBottom: "1.5rem" }}>
                <label className={styles.label}>Discount Promo Code</label>
                <div style={{ display: "flex", gap: "8px", marginTop: "4px" }}>
                  <input
                    type="text"
                    className={styles.input}
                    placeholder="Enter code (e.g. WELCOME100)"
                    value={couponCode}
                    onChange={(e) => setCouponCode(e.target.value)}
                  />
                  <button type="button" onClick={handleApplyCoupon} className={styles.btnSecondary} style={{ whiteSpace: "nowrap" }}>
                    Apply Code
                  </button>
                </div>
                {couponApplied && (
                  <span style={{ fontSize: "0.78rem", color: "#16a34a", fontWeight: 700, marginTop: 4, display: "block" }}>
                    ✓ Coupon &quot;{couponCode}&quot; applied successfully!
                  </span>
                )}
              </div>

              {/* Price Calculation Summary */}
              <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 12, padding: "1.25rem", marginBottom: "1.5rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem", color: "#64748b", marginBottom: 6 }}>
                  <span>Base Program Fee:</span>
                  <span>{currencySymbols[checkoutCurrency]}{currentBase.toLocaleString()}</span>
                </div>
                {couponApplied && (
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem", color: "#16a34a", marginBottom: 6 }}>
                    <span>Coupon Discount:</span>
                    <span>-{currencySymbols[checkoutCurrency]}{discountAmount.toLocaleString()}</span>
                  </div>
                )}
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "1.1rem", fontWeight: 800, color: "#1e293b", borderTop: "1px solid #e2e8f0", paddingTop: 8 }}>
                  <span>Amount Due Now:</span>
                  <span style={{ color: "var(--accent-primary, #c97a1e)" }}>
                    {currencySymbols[checkoutCurrency]}{finalPrice.toLocaleString()} {checkoutCurrency}
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={handleSimulateCheckout}
                disabled={checkoutStatus === "PROCESSING"}
                className={styles.btnPrimary}
                style={{ width: "100%", justifyContent: "center", padding: "12px" }}
              >
                {checkoutStatus === "PROCESSING"
                  ? "Emulating Server Webhook..."
                  : `Pay ${currencySymbols[checkoutCurrency]}${finalPrice.toLocaleString()} (TEST_BYPASS)`}
              </button>
            </div>

            {/* Results Side */}
            <div style={{ background: "#fcfaf7", border: "1px solid #ebd9c8", borderRadius: 14, padding: "1.5rem" }}>
              <h3 style={{ margin: "0 0 1rem", fontSize: "1.1rem", fontWeight: 800, color: "var(--text-primary)" }}>
                Transaction &amp; Invoice State
              </h3>

              {checkoutStatus === "IDLE" && (
                <div style={{ padding: "2rem", textAlign: "center", color: "var(--text-muted)", fontSize: "0.88rem" }}>
                  Click &ldquo;Pay with TEST_BYPASS&rdquo; to simulate instant server-to-server payment confirmation.
                </div>
              )}

              {checkoutStatus === "PROCESSING" && (
                <div style={{ padding: "2rem", textAlign: "center", color: "#d97706", fontSize: "0.9rem", fontWeight: 700 }}>
                  Simulating payment gateway webhook transition (PENDING &rarr; PAID)...
                </div>
              )}

              {checkoutStatus === "PAID" && (
                <div>
                  <div className={styles.verifiedCard}>
                    <div className={styles.verifiedHeader}>
                      <span>✓ Payment Verified via TEST_BYPASS Webhook</span>
                    </div>
                    <p style={{ margin: "4px 0 0", fontSize: "0.85rem" }}>
                      Transaction state transitioned to <strong>PAID</strong>. Learner account provisioned and gated by Digital Agreement.
                    </p>
                  </div>

                  {/* Generated PDF Invoice */}
                  <div style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "1.25rem", marginTop: "1rem" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
                      <span style={{ fontSize: "0.75rem", fontWeight: 800, color: "var(--accent-primary, #c97a1e)" }}>
                        WHATBOUTME FZE AUTOMATED INVOICE
                      </span>
                      <span style={{ fontSize: "0.75rem", fontWeight: 700, padding: "2px 6px", borderRadius: 4, background: "#dcfce7", color: "#166534" }}>
                        PAID ✓
                      </span>
                    </div>

                    <div style={{ fontSize: "0.85rem", color: "#334155", lineHeight: 1.6 }}>
                      <div><strong>Invoice #:</strong> {generatedInvoice}</div>
                      <div><strong>Entity:</strong> WhatBoutMe FZE (Dubai, UAE)</div>
                      <div><strong>Billed To:</strong> Alex Morgan ({contactEmail})</div>
                      <div><strong>Total Amount:</strong> {currencySymbols[checkoutCurrency]}{finalPrice.toLocaleString()} {checkoutCurrency}</div>
                    </div>

                    <div style={{ display: "flex", gap: "8px", marginTop: "1rem" }}>
                      <Link href="/revenue" className={styles.btnSecondary} style={{ fontSize: "0.78rem", padding: "6px 12px" }}>
                        View in Revenue Analytics &rarr;
                      </Link>
                      <button
                        type="button"
                        onClick={() => setActiveTab("ESIGNATURE")}
                        className={styles.btnPrimary}
                        style={{ fontSize: "0.78rem", padding: "6px 12px" }}
                      >
                        Next: Sign Workshop Agreement &rarr;
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
         TAB 3: DIGITAL CONSENT & DUAL-MODE SIGNATURE (ITEM #3)
         ========================================================================= */}
      {activeTab === "ESIGNATURE" && (
        <div className={styles.stageCard}>
          <div className={styles.sectionHeader}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <h2 className={styles.sectionTitle}>Digital Workshop Consent &amp; Dual-Mode E-Signature</h2>
              <span style={{ background: "#fef3c7", color: "#92400e", fontSize: "0.75rem", fontWeight: 700, padding: "2px 8px", borderRadius: 6 }}>
                Step 1 Pre-Condition Gate Active
              </span>
            </div>
            <p className={styles.sectionSubtitle}>
              Item #3: Step 1 remains strictly locked post-payment until the learner signs the agreement. Features an explicit digital consent checkbox, Dual-Mode signature (Draw HTML5 Vector or Upload Image), and profile persistence option.
            </p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))", gap: "2rem" }}>
            {/* Agreement Form */}
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
                <label style={{ display: "flex", alignItems: "flex-start", gap: "10px", cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={hasConsented}
                    onChange={(e) => setHasConsented(e.target.checked)}
                    style={{ marginTop: "3px", accentColor: "var(--accent-primary, #c97a1e)", transform: "scale(1.15)" }}
                  />
                  <span style={{ fontSize: "0.85rem", color: "#1e293b", lineHeight: 1.5 }}>
                    <strong>Mandatory Digital Workshop Consent Statement:</strong> I provide my explicit digital consent to WhatBoutMe FZE terms of service, intellectual property protection covenants, video workshop anti-recording policies, and academic integrity guidelines.
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
                      border: `1.5px solid ${signatureMode === "DRAW" ? "var(--accent-primary, #c97a1e)" : "#cbd5e1"}`,
                      background: signatureMode === "DRAW" ? "#fef3c7" : "#ffffff",
                      color: signatureMode === "DRAW" ? "#92400e" : "#475569",
                      fontWeight: 700,
                      cursor: "pointer",
                      fontSize: "0.82rem",
                    }}
                  >
                    Mode A: Draw Signature (Canvas)
                  </button>
                  <button
                    type="button"
                    onClick={() => setSignatureMode("UPLOAD")}
                    style={{
                      flex: 1,
                      padding: "8px",
                      borderRadius: 8,
                      border: `1.5px solid ${signatureMode === "UPLOAD" ? "var(--accent-primary, #c97a1e)" : "#cbd5e1"}`,
                      background: signatureMode === "UPLOAD" ? "#fef3c7" : "#ffffff",
                      color: signatureMode === "UPLOAD" ? "#92400e" : "#475569",
                      fontWeight: 700,
                      cursor: "pointer",
                      fontSize: "0.82rem",
                    }}
                  >
                    Mode B: Upload Image (PNG/JPEG)
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
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "6px" }}>
                    <span style={{ fontSize: "0.75rem", color: "#64748b" }}>
                      Sign above using mouse, stylus, or touch
                    </span>
                    <button
                      type="button"
                      onClick={clearCanvas}
                      style={{ background: "none", border: "none", color: "#b91c1c", fontSize: "0.75rem", fontWeight: 700, cursor: "pointer" }}
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
                    accept="image/png, image/jpeg"
                    id="signature-file-upload"
                    onChange={handleFileUpload}
                    style={{ display: "none" }}
                  />
                  <label htmlFor="signature-file-upload" className={styles.btnSecondary} style={{ cursor: "pointer" }}>
                    Choose Signature PNG / JPEG
                  </label>
                  {uploadedFileName && (
                    <div style={{ marginTop: "10px", fontSize: "0.85rem", color: "#166534", fontWeight: 700 }}>
                      ✓ Selected file: {uploadedFileName}
                    </div>
                  )}
                </div>
              )}

              {/* Profile Persistence Checkbox */}
              <div style={{ marginBottom: "1.5rem" }}>
                <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", fontSize: "0.85rem", color: "#334155" }}>
                  <input
                    type="checkbox"
                    checked={saveToProfile}
                    onChange={(e) => setSaveToProfile(e.target.checked)}
                    style={{ accentColor: "var(--accent-primary, #c97a1e)" }}
                  />
                  <span>Save signature to learner profile (<code>savedSignature</code>) for 1-click re-signing in future enrollments</span>
                </label>
              </div>

              <button
                type="button"
                onClick={handleSignAgreement}
                className={styles.btnPrimary}
                disabled={!hasConsented || (signatureMode === "DRAW" && !signatureDrawn) || (signatureMode === "UPLOAD" && !uploadedFileName)}
                style={{ width: "100%", justifyContent: "center" }}
              >
                Sign Agreement &amp; Unlock Step 1 →
              </button>
            </div>

            {/* Results Side */}
            <div style={{ background: "#fcfaf7", border: "1px solid #ebd9c8", borderRadius: 14, padding: "1.5rem" }}>
              <h3 style={{ margin: "0 0 1rem", fontSize: "1.1rem", fontWeight: 800, color: "var(--text-primary)" }}>
                Curriculum Gate Status
              </h3>

              {!agreementSigned ? (
                <div style={{ padding: "2rem", textAlign: "center", color: "#b45309", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 12 }}>
                  <h4 style={{ margin: "0 0 4px", fontWeight: 800 }}>Step 1 Locked (Agreement Required)</h4>
                  <p style={{ margin: 0, fontSize: "0.82rem" }}>
                    The backend strictly rejects lesson access requests for Step 1 until a verified signed agreement PDF record is stored in private storage.
                  </p>
                </div>
              ) : (
                <div>
                  <div className={styles.verifiedCard}>
                    <div className={styles.verifiedHeader}>
                      <span>✓ Agreement Legally Executed &amp; Stored</span>
                    </div>
                    <p style={{ margin: "4px 0 0", fontSize: "0.85rem" }}>
                      Timestamped and merged with IP, User-Agent, and digital signature scan. Saved to <code>/agreements</code>.
                    </p>
                  </div>

                  <div style={{ padding: "1.25rem", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 12, marginTop: "1rem" }}>
                    <h4 style={{ margin: "0 0 6px", fontSize: "0.95rem", fontWeight: 800, color: "#166534" }}>
                      Step 1 Unlocked: Course Active
                    </h4>
                    <p style={{ margin: "0 0 12px", fontSize: "0.82rem", color: "#15803d" }}>
                      Learner <strong>Alex Morgan</strong> now has full access to Step 1 video lectures, worksheets, and anti-skip player.
                    </p>
                    <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
                      <Link href="/agreements" className={styles.btnSecondary} style={{ fontSize: "0.78rem", padding: "6px 12px" }}>
                        Inspect in /agreements &rarr;
                      </Link>
                      <button
                        type="button"
                        onClick={() => {
                          setPortalMode("LEARNER_FLOW");
                          goToModulePage("step-alex-1");
                        }}
                        className={styles.btnPrimary}
                        style={{ fontSize: "0.78rem", padding: "6px 14px" }}
                      >
                        Enter Step 1 Guided Learner Portal &rarr;
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
         TAB 4: GUIDED STEP-BY-STEP LEARNER EXPERIENCE (6 GUIDED SCREENS)
         ========================================================================= */}
      {activeTab === "LEARNER_PORTAL" && (
        <div className={styles.stageCard} style={{ padding: "1.5rem" }}>
          <div className={styles.sectionHeader} style={{ marginBottom: "1.25rem" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "10px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <h2 className={styles.sectionTitle}>Guided Step-by-Step Learner Experience</h2>
                <span style={{ background: "#dcfce7", color: "#15803d", fontSize: "0.75rem", fontWeight: 700, padding: "2px 8px", borderRadius: 6 }}>
                  6 Guided Step Screens Active ✓
                </span>
              </div>
              <button
                type="button"
                onClick={() => setPortalMode("LEARNER_FLOW")}
                className={styles.btnPrimary}
                style={{ fontSize: "0.82rem", padding: "6px 14px" }}
              >
                Switch to Full 240px Sidebar Shell &rarr;
              </button>
            </div>
            <p className={styles.sectionSubtitle}>
              Replaces crowded multi-widget dashboards with 6 focused, sequential screens: <strong>Module Overview</strong> &rarr; <strong>Video Theatre</strong> &rarr; <strong>PDF Resources</strong> &rarr; <strong>Lesson Notes</strong> &rarr; <strong>Knowledge Check Quiz</strong> &rarr; <strong>Completion Celebration</strong>.
            </p>
          </div>

          <LearnerPortalFlow
            module={currentModule}
            allModules={sampleModules}
            learnerName={contactName || "Alex Morgan"}
            learnerEmail={contactEmail || "alex.morgan@example.com"}
            learningStep={learningStep}
            onStepChange={(st) => {
              setLearningStep(st);
              if (st === "NOTES_PAGE") setActiveSidebarItem("MY_NOTES");
              else setActiveSidebarItem("MY_COURSES");
            }}
            selectedModuleId={selectedModuleId}
            onModuleSelect={(mId) => setSelectedModuleId(mId)}
            selectedLessonId={selectedLessonId}
            onLessonSelect={(lId) => setSelectedLessonId(lId)}
            activeQuizQuestionIndex={activeQuizQuestionIndex}
            onQuizQuestionIndexChange={(idx) => setActiveQuizQuestionIndex(idx)}
            onBackToEdit={() => goToModulePage("step-alex-1")}
            onNextModule={() => {
              setSelectedModuleId("step-alex-2");
              setLearningStep("MODULE_PAGE");
              triggerToast("Step 2 Unlocked: Strategic Influence & High-Stakes Communication!");
            }}
            isSimulatorMode={true}
          />
        </div>
      )}

      {/* =========================================================================
         TAB 4: DYNAMIC EVENTS & TICKETING (GSB STYLE) (ITEMS #2, #10)
         ========================================================================= */}
      {activeTab === "EVENTS" && (
        <div className={styles.stageCard}>
          <div className={styles.sectionHeader}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <h2 className={styles.sectionTitle}>Dynamic Events &amp; Ticketing (GSB Style)</h2>
              <span style={{ background: "#ede9fe", color: "#6d28d9", fontSize: "0.75rem", fontWeight: 700, padding: "2px 8px", borderRadius: 6 }}>
                Two Location Modes &bull; Social Share
              </span>
            </div>
            <p className={styles.sectionSubtitle}>
              Item #10: GSB-style dynamic ticketing supporting ONLINE (private link revealed upon payment) and PHYSICAL (venue, hall address, Google Maps pin), multi-currency pricing, and 1-click clipboard link sharing.
            </p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))", gap: "2rem" }}>
            {/* Event Setup Preview */}
            <div>
              <div style={{ marginBottom: "1.25rem" }}>
                <label className={styles.label}>Select Location Mode</label>
                <div style={{ display: "flex", gap: "10px", marginTop: "6px" }}>
                  <button
                    type="button"
                    onClick={() => setEventLocationType("ONLINE")}
                    style={{
                      flex: 1,
                      padding: "8px",
                      borderRadius: 8,
                      border: `1.5px solid ${eventLocationType === "ONLINE" ? "var(--accent-primary, #c97a1e)" : "#cbd5e1"}`,
                      background: eventLocationType === "ONLINE" ? "#fef3c7" : "#ffffff",
                      color: eventLocationType === "ONLINE" ? "#92400e" : "#475569",
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    ONLINE (Private Zoom/Meet Link)
                  </button>
                  <button
                    type="button"
                    onClick={() => setEventLocationType("PHYSICAL")}
                    style={{
                      flex: 1,
                      padding: "8px",
                      borderRadius: 8,
                      border: `1.5px solid ${eventLocationType === "PHYSICAL" ? "var(--accent-primary, #c97a1e)" : "#cbd5e1"}`,
                      background: eventLocationType === "PHYSICAL" ? "#fef3c7" : "#ffffff",
                      color: eventLocationType === "PHYSICAL" ? "#92400e" : "#475569",
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    PHYSICAL (Hall &amp; Google Maps)
                  </button>
                </div>
              </div>

              <div style={{ marginBottom: "1.25rem" }}>
                <label className={styles.label}>Select Ticketing Currency</label>
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
                        border: `1.5px solid ${eventCurrency === curr ? "var(--accent-primary, #c97a1e)" : "#cbd5e1"}`,
                        background: eventCurrency === curr ? "#fef3c7" : "#ffffff",
                        color: eventCurrency === curr ? "#92400e" : "#475569",
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                    >
                      {curr}
                    </button>
                  ))}
                </div>
              </div>

              {/* Share Event Link Button */}
              <div style={{ marginBottom: "1.5rem" }}>
                <button
                  type="button"
                  onClick={handleCopyEventLink}
                  className={styles.btnSecondary}
                  style={{ width: "100%", justifyContent: "center" }}
                >
                  {copiedLink ? "Event Link Copied to Clipboard! ✓" : "Share Event Link (1-Click Copy)"}
                </button>
              </div>

              <button
                type="button"
                onClick={handleBookEventTicket}
                className={styles.btnPrimary}
                style={{ width: "100%", justifyContent: "center", padding: "12px" }}
              >
                Pay {eventCurrency === "USD" ? "$" : eventCurrency === "AED" ? "AED " : "₹"}
                {eventPrices[eventCurrency]} &amp; Confirm Ticket (TEST_BYPASS)
              </button>
            </div>

            {/* Event Ticket Card Side */}
            <div style={{ background: "#fcfaf7", border: "1px solid #ebd9c8", borderRadius: 14, padding: "1.5rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
                <span style={{ fontSize: "0.75rem", fontWeight: 800, color: "var(--accent-primary, #c97a1e)" }}>
                  PUBLIC EVENT TICKET CARD
                </span>
                <span style={{ fontSize: "0.78rem", fontWeight: 700, color: "#16a34a", background: "#f0fdf4", padding: "2px 8px", borderRadius: 4 }}>
                  {seatsRemaining} Seats Remaining
                </span>
              </div>

              <h3 style={{ margin: "0 0 0.5rem", fontSize: "1.2rem", fontWeight: 800, color: "var(--text-primary)" }}>
                Emotional Resilience in Crisis: Live Masterclass
              </h3>

              <div style={{ fontSize: "0.85rem", color: "#64748b", marginBottom: "1rem", lineHeight: 1.5 }}>
                <div><strong>Host:</strong> Roweena Foxwel &bull; Founder</div>
                <div><strong>Timing:</strong> Saturday, Nov 14, 2026 &bull; 10:00 AM – 1:00 PM GST</div>
                <div>
                  <strong>Location:</strong>{" "}
                  {eventLocationType === "ONLINE"
                    ? "Live Interactive Webinar (Private Zoom)"
                    : "The Ritz-Carlton DIFC, Dubai, UAE (Grand Ballroom)"}
                </div>
                {eventLocationType === "PHYSICAL" && (
                  <div style={{ marginTop: 4 }}>
                    <a href="https://maps.google.com" target="_blank" rel="noopener noreferrer" style={{ color: "#0284c7", fontWeight: 700 }}>
                      View Location on Google Maps &rarr;
                    </a>
                  </div>
                )}
              </div>

              {!eventTicketBooked ? (
                <div style={{ padding: "1.25rem", background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 10, textAlign: "center" }}>
                  <div style={{ color: "#d97706", fontSize: "0.82rem", fontWeight: 700 }}>
                    Meeting link is private and revealed immediately upon ticket confirmation.
                  </div>
                </div>
              ) : (
                <div className={styles.verifiedCard}>
                  <div className={styles.verifiedHeader}>
                    <span>✓ Ticket Registered &amp; Confirmed</span>
                  </div>
                  <p style={{ margin: "4px 0 10px", fontSize: "0.85rem" }}>
                    Your registration has been confirmed and the seat availability has decremented.
                  </p>
                  {eventLocationType === "ONLINE" ? (
                    <div style={{ padding: "8px 12px", background: "#ffffff", borderRadius: 8, border: "1px solid #bbf7d0", fontSize: "0.82rem" }}>
                      <span style={{ color: "#166534", fontWeight: 700, display: "block" }}>Your Private Meeting Link:</span>
                      <a href="https://zoom.us/j/123456789" target="_blank" rel="noopener noreferrer" style={{ color: "#0284c7", fontWeight: 700 }}>
                        https://zoom.us/j/123456789 (Passcode: 2026RESILIENCE)
                      </a>
                    </div>
                  ) : (
                    <div style={{ padding: "8px 12px", background: "#ffffff", borderRadius: 8, border: "1px solid #bbf7d0", fontSize: "0.82rem" }}>
                      <span style={{ color: "#166534", fontWeight: 700, display: "block" }}>Physical Admission Pass:</span>
                      <span>Show this digital ticket at Grand Ballroom Reception Desk (Seat Confirmed).</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
         TAB 5: COURSE FAQS & PUBLIC GALLERY PREVIEW (ITEMS #8, #9)
         ========================================================================= */}
      {activeTab === "FAQS_GALLERY" && (
        <div className={styles.stageCard}>
          <div className={styles.sectionHeader}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <h2 className={styles.sectionTitle}>Course-Specific FAQs &amp; Public Photo Gallery</h2>
              <span style={{ background: "#fef3c7", color: "#92400e", fontSize: "0.75rem", fontWeight: 700, padding: "2px 8px", borderRadius: 6 }}>
                Items #8 &amp; #9 Preview
              </span>
            </div>
            <p className={styles.sectionSubtitle}>
              Item #8: Course-specific FAQs builder rendered dynamically in an accessible accordion. Item #9: Public website photo gallery showcasing high-res imagery, captions, tags, and context descriptions.
            </p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))", gap: "2rem" }}>
            {/* FAQs Accordion */}
            <div>
              <h3 style={{ margin: "0 0 1rem", fontSize: "1.1rem", fontWeight: 800, color: "var(--text-primary)" }}>
                Frequently Asked Questions (Accessible Accordion)
              </h3>
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {faqs.map((faq, idx) => {
                  const isOpen = expandedFaq === idx;
                  return (
                    <div
                      key={idx}
                      style={{
                        border: "1px solid var(--border-light, #e7decb)",
                        borderRadius: 10,
                        overflow: "hidden",
                        background: "#ffffff",
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => setExpandedFaq(isOpen ? null : idx)}
                        style={{
                          width: "100%",
                          textAlign: "left",
                          padding: "12px 16px",
                          background: isOpen ? "#fdfbf7" : "#ffffff",
                          border: "none",
                          fontWeight: 700,
                          fontSize: "0.9rem",
                          color: "var(--text-primary)",
                          cursor: "pointer",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                        }}
                      >
                        <span>{faq.q}</span>
                        <span style={{ fontSize: "1.1rem", color: "var(--accent-primary, #c97a1e)" }}>
                          {isOpen ? "−" : "+"}
                        </span>
                      </button>
                      {isOpen && (
                        <div style={{ padding: "12px 16px", fontSize: "0.85rem", color: "#475569", lineHeight: 1.5, borderTop: "1px solid #f1f5f9" }}>
                          {faq.a}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Gallery Showcase Grid */}
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
                <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 800, color: "var(--text-primary)" }}>
                  Public Photo Gallery Showcase (Item #9)
                </h3>
                <Link href="/website" className={styles.btnSecondary} style={{ fontSize: "0.75rem", padding: "4px 8px" }}>
                  Manage Gallery &rarr;
                </Link>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "12px" }}>
                {[
                  { title: "Dubai Leadership Retreat", tag: "Workshop", img: "/brand/roweena.png" },
                  { title: "Executive Cohort Circle", tag: "Mastermind", img: "/brand/logo-dark.png" },
                  { title: "Mindfulness Immersion", tag: "Wellness", img: "/brand/icon.png" },
                  { title: "Annual Graduation Gala", tag: "Ceremony", img: "/brand/logo-light.png" },
                ].map((item, idx) => (
                  <div
                    key={idx}
                    style={{
                      borderRadius: 10,
                      overflow: "hidden",
                      border: "1px solid var(--border-light, #e7decb)",
                      background: "#ffffff",
                    }}
                  >
                    <div style={{ height: "110px", background: "#f5ece1", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={item.img}
                        alt={item.title}
                        style={{ maxHeight: "80%", maxWidth: "80%", objectFit: "contain" }}
                      />
                    </div>
                    <div style={{ padding: "8px 10px" }}>
                      <span style={{ fontSize: "0.6875rem", fontWeight: 700, color: "var(--accent-primary, #c97a1e)", textTransform: "uppercase" }}>
                        {item.tag}
                      </span>
                      <h5 style={{ margin: "2px 0 0", fontSize: "0.82rem", fontWeight: 700, color: "var(--text-primary)" }}>
                        {item.title}
                      </h5>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
      </div>

      {shellToast && (
        <div className={styles.shellToastBanner} role="status" aria-live="polite">
          <span>{shellToast}</span>
        </div>
      )}
    </div>
  );
}
