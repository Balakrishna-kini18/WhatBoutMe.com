"use client";

import React, { useState, useRef, useEffect } from "react";
import Link from "next/link";
import styles from "./simulator.module.css";
import { formatWhenInTz } from "../lib/timezone";

export default function SimulatorPage() {
  const [activeTab, setActiveTab] = useState<
    "CONTACT_DISCOVERY" | "CHECKOUT" | "ESIGNATURE" | "EVENTS" | "FAQS_GALLERY"
  >("CONTACT_DISCOVERY");

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

  return (
    <div className={styles.simulatorContainer}>
      {/* 1. Page Header */}
      <div className={styles.headerCard}>
        <div>
          <div className={styles.badgeTester}>
            <span>Interactive Spec Verification Simulator</span>
          </div>
          <h1 className={styles.headerTitle}>Learner &amp; Public Funnel Test Simulator</h1>
          {/* <p className={styles.headerSubtitle}>
            End-to-end verification laboratory for all audio-verified items from <strong>Developer note.pdf</strong>: Contact Us (no phone number), 15-Min Discovery Booking, Test-Bypass Multi-Currency Checkout, Workshop Digital Consent + Dual-Mode Signature, and GSB Event Ticketing.
          </p> */}
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
          onClick={() => setActiveTab("EVENTS")}
          className={`${styles.tabBtn} ${activeTab === "EVENTS" ? styles.tabBtnActive : ""}`}
        >
          <span>4. Dynamic Events &amp; Ticketing</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("FAQS_GALLERY")}
          className={`${styles.tabBtn} ${activeTab === "FAQS_GALLERY" ? styles.tabBtnActive : ""}`}
        >
          <span>5. Course FAQs &amp; Gallery</span>
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
                    <Link href="/agreements" className={styles.btnSecondary} style={{ fontSize: "0.78rem", padding: "6px 12px" }}>
                      Inspect in /agreements &rarr;
                    </Link>
                  </div>
                </div>
              )}
            </div>
          </div>
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
  );
}
