"use client";

import React, { useState } from "react";
import Image from "next/image";
import styles from "../curriculum.module.css";
import { uploadFile } from "../../../lib/api";
import { CustomSelect } from "../../../components";
import { parseCourseInfo } from "../../courseInfo";

interface Step1CourseSetupProps {
  programData: any;
  onSaveAndContinue: (updatedData: {
    title: string;
    description: string;
    shortDescription?: string;
    thumbnailUrl?: string;
    category?: string;
    level?: string;
    price?: number;
    currency?: "USD" | "AED" | "INR";
    priceUSD?: number;
    priceAED?: number;
    priceINR?: number;
    earlyBirdPrice?: number | null;
    earlyBirdCurrency?: "USD" | "AED" | "INR" | null;
    earlyBirdDeadline?: string | null;
    hasCertificate?: boolean;
    faqs?: Array<{
      id?: string;
      question: string;
      answer: string;
      sortOrder?: number;
    }>;
  }) => Promise<void>;
  isSaving: boolean;
}

export default function Step1CourseSetup({
  programData,
  onSaveAndContinue,
  isSaving,
}: Step1CourseSetupProps) {
  const courseInfo = parseCourseInfo(programData?.description);
  const rawInitialThumb = programData?.thumbnailUrl || courseInfo.image || "";
  const initialThumb =
    rawInitialThumb.startsWith("http://") || rawInitialThumb.startsWith("https://") || rawInitialThumb.startsWith("/")
      ? rawInitialThumb
      : rawInitialThumb ? `/${rawInitialThumb}` : "";

  const [title, setTitle] = useState(programData?.title || "");
  const [description, setDescription] = useState(programData?.description || "");
  const [shortDescription, setShortDescription] = useState(
    programData?.shortDescription || courseInfo.summary?.slice(0, 120) || programData?.description?.slice(0, 120) || ""
  );
  const [thumbnailUrl, setThumbnailUrl] = useState(initialThumb);
  const [category, setCategory] = useState(programData?.category || courseInfo.type || "Leadership & Mindset");
  const [level, setLevel] = useState(programData?.level || "Beginner");

  // Multi-Currency Pricing State
  const [currency, setCurrency] = useState<"USD" | "AED" | "INR">(
    programData?.currency || "USD"
  );
  const [priceUSD, setPriceUSD] = useState<string>(
    programData?.priceUSD !== undefined && programData?.priceUSD !== null
      ? String(programData.priceUSD)
      : programData?.currency === "USD"
      ? String(programData?.price || 199)
      : "199"
  );
  const [priceAED, setPriceAED] = useState<string>(
    programData?.priceAED !== undefined && programData?.priceAED !== null
      ? String(programData.priceAED)
      : programData?.currency === "AED"
      ? String(programData?.price || 749)
      : "749"
  );
  const [priceINR, setPriceINR] = useState<string>(
    programData?.priceINR !== undefined && programData?.priceINR !== null
      ? String(programData.priceINR)
      : programData?.currency === "INR"
      ? String(programData?.price || 14999)
      : "14999"
  );

  // Early Bird State
  const [hasEarlyBird, setHasEarlyBird] = useState(
    Boolean(programData?.earlyBirdPrice)
  );
  const [earlyBirdPrice, setEarlyBirdPrice] = useState<string>(
    programData?.earlyBirdPrice ? String(programData.earlyBirdPrice) : ""
  );
  const [earlyBirdCurrency, setEarlyBirdCurrency] = useState<"USD" | "AED" | "INR">(
    programData?.earlyBirdCurrency || programData?.currency || "USD"
  );
  const [earlyBirdDeadline, setEarlyBirdDeadline] = useState<string>(
    programData?.earlyBirdDeadline
      ? programData.earlyBirdDeadline.split("T")[0]
      : ""
  );

  const [hasCertificate, setHasCertificate] = useState(programData?.hasCertificate ?? true);

  // Course-Specific FAQs State
  const initialFaqs = (() => {
    if (Array.isArray(programData?.faqs) && programData.faqs.length > 0) {
      return programData.faqs.map((f: any, idx: number) => ({
        id: f.id || `faq-${idx}-${Math.random().toString(36).slice(2, 6)}`,
        question: f.question || f.q || "",
        answer: f.answer || f.a || "",
        sortOrder: typeof f.sortOrder === "number" ? f.sortOrder : idx,
      }));
    }
    if (Array.isArray(courseInfo.faqs) && courseInfo.faqs.length > 0) {
      return courseInfo.faqs.map((f: any, idx: number) => ({
        id: f.id || `faq-${idx}-${Math.random().toString(36).slice(2, 6)}`,
        question: f.question || f.q || "",
        answer: f.answer || f.a || "",
        sortOrder: typeof f.sortOrder === "number" ? f.sortOrder : idx,
      }));
    }
    return [];
  })();

  const [faqs, setFaqs] = useState<Array<{
    id: string;
    question: string;
    answer: string;
    sortOrder: number;
  }>>(initialFaqs);

  const handleAddFaq = () => {
    setFaqs((prev) => [
      ...prev,
      {
        id: `faq-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        question: "",
        answer: "",
        sortOrder: prev.length,
      },
    ]);
  };

  const handleFaqChange = (index: number, field: "question" | "answer", value: string) => {
    setFaqs((prev) =>
      prev.map((item, idx) => (idx === index ? { ...item, [field]: value } : item))
    );
  };

  const handleDeleteFaq = (index: number) => {
    setFaqs((prev) =>
      prev
        .filter((_, idx) => idx !== index)
        .map((item, idx) => ({ ...item, sortOrder: idx }))
    );
  };

  const handleMoveFaq = (index: number, direction: "UP" | "DOWN") => {
    const targetIndex = direction === "UP" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= faqs.length) return;

    setFaqs((prev) => {
      const item1 = prev[index];
      const item2 = prev[targetIndex];
      if (!item1 || !item2) return prev;
      const copy = [...prev];
      copy[index] = item2;
      copy[targetIndex] = item1;
      return copy.map((item, idx) => ({ ...item, sortOrder: idx }));
    });
  };

  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingImage(true);
    try {
      const url = await uploadFile(file);
      setThumbnailUrl(url);
    } catch (err: any) {
      console.warn("Could not upload cover image", err);
      const localUrl = URL.createObjectURL(file);
      setThumbnailUrl(localUrl);
    } finally {
      setIsUploadingImage(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setErrorMsg("Course Title is required.");
      return;
    }
    setErrorMsg(null);

    const activeBasePrice =
      currency === "USD"
        ? Number(priceUSD) || 0
        : currency === "AED"
        ? Number(priceAED) || 0
        : Number(priceINR) || 0;

    // Edge case check: Prevent saving an FAQ item with an empty question or empty answer
    for (let i = 0; i < faqs.length; i++) {
      const item = faqs[i];
      if (!item) continue;
      const q = item.question.trim();
      const a = item.answer.trim();
      if (!q && !a) {
        setErrorMsg(`FAQ Item #${i + 1} has an empty question and answer. Please complete it or remove it.`);
        return;
      }
      if (!q) {
        setErrorMsg(`FAQ Item #${i + 1} is missing a question.`);
        return;
      }
      if (!a) {
        setErrorMsg(`FAQ Item #${i + 1} is missing an answer.`);
        return;
      }
    }

    const cleanedFaqs = faqs.map((f, idx) => ({
      id: f.id,
      question: f.question.trim(),
      answer: f.answer.trim(),
      sortOrder: idx,
    }));

    await onSaveAndContinue({
      title: title.trim(),
      description: description.trim(),
      shortDescription: shortDescription.trim(),
      thumbnailUrl,
      category,
      level,
      price: activeBasePrice,
      currency,
      priceUSD: priceUSD ? Number(priceUSD) : undefined,
      priceAED: priceAED ? Number(priceAED) : undefined,
      priceINR: priceINR ? Number(priceINR) : undefined,
      earlyBirdPrice: hasEarlyBird && earlyBirdPrice ? Number(earlyBirdPrice) : null,
      earlyBirdCurrency: hasEarlyBird ? earlyBirdCurrency : null,
      earlyBirdDeadline: hasEarlyBird && earlyBirdDeadline ? earlyBirdDeadline : null,
      hasCertificate,
      faqs: cleanedFaqs,
    });
  };

  return (
    <section className={styles.cardSurface}>
      {/* Header */}
      <div className={styles.cardHeaderArea}>
        <div className={styles.stepEyebrow}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
          <span>STEP 1: COURSE SETUP</span>
        </div>
        <h2 className={styles.stepTitle}>Course Basic Details</h2>
        <p className={styles.stepSubtitle}>
          Enter the core title, cover imagery, classification, and credentials for your curriculum track.
        </p>
      </div>

      {errorMsg && (
        <div
          role="alert"
          style={{
            background: "#fef2f2",
            border: "1px solid #fecdd3",
            color: "#991b1b",
            padding: "12px 16px",
            borderRadius: 12,
            fontSize: "0.88rem",
            marginBottom: "1.5rem",
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span>{errorMsg}</span>
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className={styles.twoColLayout}>
          {/* =========================================================
              Left Column: Form Fields
              ========================================================= */}
          <div>
            {/* Panel 1: General Course Info */}
            <div className={styles.formSectionPanel}>
              <h3 className={styles.sectionPanelTitle}>
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--accent-primary, #c97a1e)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                  <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                </svg>
                <span>General Course Information</span>
              </h3>
              <p className={styles.sectionPanelSubtitle}>
                Primary identifiers displayed across learner portals, searches, and enrollment catalogues.
              </p>

              <div className={styles.formGroup}>
                <label className={styles.formLabel}>
                  <span>
                    Course Title <span style={{ color: "#dc2626" }}>*</span>
                  </span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. One-Day Corporate Workshop"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className={styles.formInput}
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1.35rem" }}>
                <div>
                  <label className={styles.formLabel}>Category</label>
                  <CustomSelect
                    value={category}
                    onChange={setCategory}
                    fullWidth
                    ariaLabel="Select Category"
                    options={[
                      { value: "Leadership & Mindset", label: "Leadership & Mindset" },
                      { value: "Web Development", label: "Web Development" },
                      { value: "UI/UX & Product Design", label: "UI/UX & Product Design" },
                      { value: "Business Strategy", label: "Business Strategy" },
                      { value: "Personal Growth", label: "Personal Growth" },
                    ]}
                  />
                </div>

                <div>
                  <label className={styles.formLabel}>Skill Level</label>
                  <CustomSelect
                    value={level}
                    onChange={setLevel}
                    fullWidth
                    ariaLabel="Select Skill Level"
                    options={[
                      { value: "Beginner", label: "Beginner" },
                      { value: "Intermediate", label: "Intermediate" },
                      { value: "Advanced", label: "Advanced" },
                      { value: "All Levels", label: "All Levels" },
                    ]}
                  />
                </div>
              </div>

              <div className={styles.formGroup}>
                <label className={styles.formLabel}>
                  <span>Short Description</span>
                  <span className={styles.formLabelOptional}>{shortDescription.length}/140 chars</span>
                </label>
                <input
                  type="text"
                  placeholder="A concise summary of what this curriculum delivers..."
                  value={shortDescription}
                  onChange={(e) => setShortDescription(e.target.value)}
                  className={styles.formInput}
                  maxLength={160}
                />
                <p className={styles.formHelperText}>
                  Shown on course cards and catalog listings. Keep it punchy and engaging.
                </p>
              </div>

              <div className={styles.formGroup}>
                <label className={styles.formLabel}>
                  <span>Full Description &amp; Syllabus Overview</span>
                </label>
                <textarea
                  rows={5}
                  placeholder="Detail the curriculum structure, prerequisites, takeaways, and outcomes..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className={styles.formTextarea}
                />
              </div>
            </div>

            {/* Panel 2: Multi-Currency Pricing & Certification */}
            <div className={styles.formSectionPanel}>
              <h3 className={styles.sectionPanelTitle}>
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--accent-primary, #c97a1e)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="8" r="7" />
                  <polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88" />
                </svg>
                <span>Multi-Currency Pricing &amp; Certification</span>
              </h3>
              <p className={styles.sectionPanelSubtitle}>
                Configure tuition rates across USD, AED, and INR along with early-bird discounts and completion credentials.
              </p>

              <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "1.25rem" }}>
                {/* Default / Primary Currency */}
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>
                    <span>Primary Store Currency</span>
                  </label>
                  <CustomSelect
                    value={currency}
                    onChange={(val) => setCurrency(val as "USD" | "AED" | "INR")}
                    options={[
                      { value: "USD", label: "USD ($) — International / US" },
                      { value: "AED", label: "AED (AED) — United Arab Emirates (VAT 5%)" },
                      { value: "INR", label: "INR (₹) — India (GST 18%)" },
                    ]}
                    ariaLabel="Primary Store Currency"
                  />
                  <p className={styles.formHelperText}>
                    Selected currency will be the default checkout currency presented to learners.
                  </p>
                </div>

                {/* 3 Multi-Currency Pricing Inputs */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "1rem" }}>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Tuition (USD)</label>
                    <div className={styles.priceInputWrap}>
                      <span className={styles.currencyPrefix}>$</span>
                      <input
                        type="number"
                        min={0}
                        value={priceUSD}
                        onChange={(e) => setPriceUSD(e.target.value)}
                        className={`${styles.formInput} ${styles.priceInput}`}
                        placeholder="199"
                      />
                    </div>
                  </div>

                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Tuition (AED)</label>
                    <div className={styles.priceInputWrap}>
                      <span className={styles.currencyPrefix}>AED</span>
                      <input
                        type="number"
                        min={0}
                        value={priceAED}
                        onChange={(e) => setPriceAED(e.target.value)}
                        className={`${styles.formInput} ${styles.priceInput}`}
                        placeholder="749"
                      />
                    </div>
                  </div>

                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Tuition (INR)</label>
                    <div className={styles.priceInputWrap}>
                      <span className={styles.currencyPrefix}>₹</span>
                      <input
                        type="number"
                        min={0}
                        value={priceINR}
                        onChange={(e) => setPriceINR(e.target.value)}
                        className={`${styles.formInput} ${styles.priceInput}`}
                        placeholder="14999"
                      />
                    </div>
                  </div>
                </div>

                {/* Early-Bird Discount Card */}
                <div
                  style={{
                    border: "1px solid var(--border-light, #e7e0d6)",
                    borderRadius: "12px",
                    padding: "1.25rem",
                    background: hasEarlyBird ? "rgba(184, 107, 17, 0.04)" : "var(--bg-surface, #ffffff)",
                    transition: "all 0.2s ease",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      cursor: "pointer",
                    }}
                    onClick={() => setHasEarlyBird(!hasEarlyBird)}
                  >
                    <div>
                      <div style={{ fontWeight: 600, color: "var(--text-primary, #1c1917)", fontSize: "0.95rem" }}>
                        Early-Bird Discount Pricing
                      </div>
                      <div style={{ fontSize: "0.82rem", color: "var(--text-muted, #78716a)", marginTop: "2px" }}>
                        Offer a promotional discounted rate with an automated expiration date.
                      </div>
                    </div>
                    <div className={styles.toggleSwitch}>
                      <input
                        type="checkbox"
                        checked={hasEarlyBird}
                        onChange={(e) => setHasEarlyBird(e.target.checked)}
                        tabIndex={-1}
                        aria-hidden="true"
                      />
                      <span className={styles.toggleSlider}></span>
                    </div>
                  </div>

                  {hasEarlyBird && (
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr 1fr",
                        gap: "1rem",
                        marginTop: "1.25rem",
                        paddingTop: "1.25rem",
                        borderTop: "1px dashed var(--border-light, #e7e0d6)",
                      }}
                    >
                      <div className={styles.formGroup}>
                        <label className={styles.formLabel}>Early-Bird Price</label>
                        <input
                          type="number"
                          min={0}
                          value={earlyBirdPrice}
                          onChange={(e) => setEarlyBirdPrice(e.target.value)}
                          className={styles.formInput}
                          placeholder="99"
                        />
                      </div>

                      <div className={styles.formGroup}>
                        <label className={styles.formLabel}>Currency</label>
                        <CustomSelect
                          value={earlyBirdCurrency}
                          onChange={(val) => setEarlyBirdCurrency(val as "USD" | "AED" | "INR")}
                          options={[
                            { value: "USD", label: "USD ($)" },
                            { value: "AED", label: "AED" },
                            { value: "INR", label: "INR (₹)" },
                          ]}
                          ariaLabel="Early-Bird Currency"
                        />
                      </div>

                      <div className={styles.formGroup}>
                        <label className={styles.formLabel}>Offer Valid Until</label>
                        <input
                          type="date"
                          value={earlyBirdDeadline}
                          onChange={(e) => setEarlyBirdDeadline(e.target.value)}
                          className={styles.formInput}
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Certificate Award Card */}
                <div
                  className={`${styles.certCard} ${hasCertificate ? styles.certCardActive : ""}`}
                  onClick={() => setHasCertificate(!hasCertificate)}
                  role="checkbox"
                  aria-checked={hasCertificate}
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === " " || e.key === "Enter") {
                      e.preventDefault();
                      setHasCertificate(!hasCertificate);
                    }
                  }}
                >
                  <div className={styles.certCardLeft}>
                    <div className={styles.certIconBox}>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <circle cx="12" cy="8" r="6" />
                        <path d="M15.4 13.8L18 22l-6-3-6 3 2.6-8.2" />
                      </svg>
                    </div>
                    <div className={styles.certTextCol}>
                      <span className={styles.certTitle}>Official Completion Certificate</span>
                      <span className={styles.certDesc}>
                        Automatically issues an accredited PDF certificate upon 100% curriculum completion.
                      </span>
                    </div>
                  </div>

                  <div className={styles.toggleSwitch}>
                    <input
                      type="checkbox"
                      checked={hasCertificate}
                      onChange={(e) => setHasCertificate(e.target.checked)}
                      tabIndex={-1}
                      aria-hidden="true"
                    />
                    <span className={styles.toggleSlider}></span>
                  </div>
                </div>
              </div>
            </div>

            {/* Panel 5: Course-Specific FAQs */}
            <div className={styles.formSectionPanel}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "10px", marginBottom: "0.5rem" }}>
                <div>
                  <h3 className={styles.sectionPanelTitle} style={{ marginBottom: "0.25rem" }}>
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--accent-primary, #c97a1e)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <circle cx="12" cy="12" r="10" />
                      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                      <line x1="12" y1="17" x2="12.01" y2="17" />
                    </svg>
                    <span>Course-Specific FAQs</span>
                  </h3>
                  <p className={styles.sectionPanelSubtitle} style={{ margin: 0 }}>
                    Repeatable question and answer pairs displayed in an accordion on this course&apos;s public landing page.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleAddFaq}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    padding: "7px 14px",
                    borderRadius: "8px",
                    background: "var(--accent-primary, #c97a1e)",
                    color: "#ffffff",
                    fontSize: "0.82rem",
                    fontWeight: 700,
                    border: "none",
                    cursor: "pointer",
                    boxShadow: "0 1px 2px rgba(0,0,0,0.06)",
                    transition: "all 0.15s ease",
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                  <span>Add FAQ Item</span>
                </button>
              </div>

              {faqs.length === 0 ? (
                <div style={{
                  padding: "24px 20px",
                  borderRadius: "12px",
                  background: "var(--bg-soft, #fdfbf7)",
                  border: "1px dashed var(--border-light, #e7dfd5)",
                  textAlign: "center",
                  marginTop: "1rem",
                }}>
                  <p style={{ margin: "0 0 6px", fontSize: "0.9rem", fontWeight: 600, color: "var(--text-primary, #14110f)" }}>
                    No course-specific FAQs added yet.
                  </p>
                  <p style={{ margin: 0, fontSize: "0.82rem", color: "var(--text-muted, #78716a)" }}>
                    Click &ldquo;Add FAQ Item&rdquo; above to add questions about prerequisites, scheduling, or materials.
                  </p>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "14px", marginTop: "1rem" }}>
                  {faqs.map((faq, index) => (
                    <div
                      key={faq.id || index}
                      style={{
                        padding: "16px 18px",
                        borderRadius: "12px",
                        background: "#ffffff",
                        border: "1px solid var(--border-light, #e7dfd5)",
                        boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <span style={{
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            width: "24px",
                            height: "24px",
                            borderRadius: "50%",
                            background: "var(--bg-soft, #f5ece1)",
                            color: "var(--accent-primary, #c97a1e)",
                            fontSize: "0.78rem",
                            fontWeight: 800,
                          }}>
                            {index + 1}
                          </span>
                          <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--text-primary, #14110f)" }}>
                            FAQ Item #{index + 1}
                          </span>
                        </div>

                        <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                          <button
                            type="button"
                            disabled={index === 0}
                            onClick={() => handleMoveFaq(index, "UP")}
                            title="Move Question Up"
                            aria-label="Move Question Up"
                            style={{
                              padding: "4px 8px",
                              borderRadius: "6px",
                              border: "1px solid #e7dfd5",
                              background: "#ffffff",
                              cursor: index === 0 ? "not-allowed" : "pointer",
                              opacity: index === 0 ? 0.4 : 1,
                              display: "inline-flex",
                              alignItems: "center",
                            }}
                          >
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <polyline points="18 15 12 9 6 15" />
                            </svg>
                          </button>

                          <button
                            type="button"
                            disabled={index === faqs.length - 1}
                            onClick={() => handleMoveFaq(index, "DOWN")}
                            title="Move Question Down"
                            aria-label="Move Question Down"
                            style={{
                              padding: "4px 8px",
                              borderRadius: "6px",
                              border: "1px solid #e7dfd5",
                              background: "#ffffff",
                              cursor: index === faqs.length - 1 ? "not-allowed" : "pointer",
                              opacity: index === faqs.length - 1 ? 0.4 : 1,
                              display: "inline-flex",
                              alignItems: "center",
                            }}
                          >
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <polyline points="6 9 12 15 18 9" />
                            </svg>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleDeleteFaq(index)}
                            title="Delete FAQ Item"
                            aria-label="Delete FAQ Item"
                            style={{
                              padding: "4px 8px",
                              borderRadius: "6px",
                              border: "1px solid #fee2e2",
                              background: "#fef2f2",
                              color: "#dc2626",
                              cursor: "pointer",
                              display: "inline-flex",
                              alignItems: "center",
                              marginLeft: "4px",
                            }}
                          >
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <polyline points="3 6 5 6 21 6" />
                              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                            </svg>
                          </button>
                        </div>
                      </div>

                      <div className={styles.formGroup} style={{ marginBottom: "10px" }}>
                        <label className={styles.formLabel} style={{ fontSize: "0.8rem", marginBottom: "4px" }}>
                          Question <span style={{ color: "#dc2626" }}>*</span>
                        </label>
                        <input
                          type="text"
                          value={faq.question}
                          onChange={(e) => handleFaqChange(index, "question", e.target.value)}
                          placeholder="e.g. Do I receive a certificate upon finishing?"
                          className={styles.formInput}
                          style={{ fontSize: "0.88rem" }}
                        />
                      </div>

                      <div className={styles.formGroup} style={{ marginBottom: 0 }}>
                        <label className={styles.formLabel} style={{ fontSize: "0.8rem", marginBottom: "4px" }}>
                          Answer <span style={{ color: "#dc2626" }}>*</span>
                        </label>
                        <textarea
                          rows={3}
                          value={faq.answer}
                          onChange={(e) => handleFaqChange(index, "answer", e.target.value)}
                          placeholder="e.g. Yes! Once all 11 steps and final exam are submitted, an accredited PDF certificate is generated automatically."
                          className={styles.formTextarea}
                          style={{ fontSize: "0.88rem", minHeight: "72px" }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* =========================================================
              Right Column: Media & Live Card Preview
              ========================================================= */}
          <div className={styles.stickySidebar}>
            {/* 1. Cover Image Upload Box */}
            <div className={styles.sidebarCard}>
              <div className={styles.sidebarCardHeader}>
                <h4 className={styles.sidebarCardTitle}>Course Cover Image</h4>
                <span className={styles.sidebarBadge}>16:9 Ratio</span>
              </div>

              <label className={styles.coverUploadBox}>
                {thumbnailUrl ? (
                  <>
                    <Image
                      src={thumbnailUrl}
                      alt="Course Cover Preview"
                      width={320}
                      height={180}
                      quality={80}
                      loading="lazy"
                      unoptimized={!thumbnailUrl.startsWith("/")}
                      className={styles.coverPreviewImg}
                      onError={() => setThumbnailUrl("")}
                    />
                    <div className={styles.coverOverlay}>
                      <span style={{ fontSize: "0.85rem", fontWeight: 700 }}>Cover Image Selected</span>
                      <div style={{ display: "flex", gap: "0.5rem" }}>
                        <span className={styles.coverActionBtn}>Change Image</span>
                        <button
                          type="button"
                          className={styles.coverActionBtn}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setThumbnailUrl("");
                          }}
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <div className={styles.uploadIconWrap}>
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="17 8 12 3 7 8" />
                        <line x1="12" y1="3" x2="12" y2="15" />
                      </svg>
                    </div>
                    <div className={styles.uploadTitle}>
                      {isUploadingImage ? "Uploading..." : "Click or drag to upload"}
                    </div>
                    <div className={styles.uploadHint}>PNG, JPG or WebP (max 5MB)</div>
                  </>
                )}
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  style={{ display: "none" }}
                />
              </label>
            </div>

            {/* 2. Live Student Catalog Preview */}
            <div className={styles.livePreviewWrap}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted, #78716a)" }}>
                  Learner Catalog Preview
                </span>
                <span className={styles.liveBadgePulse}>
                  <span className={styles.pulseDot}></span>
                  <span>Live</span>
                </span>
              </div>

              <div className={styles.mockCourseCard}>
                <div className={styles.mockCoverWrap}>
                  {thumbnailUrl ? (
                    <Image
                      src={thumbnailUrl}
                      alt="Catalog preview"
                      width={280}
                      height={150}
                      quality={80}
                      loading="lazy"
                      unoptimized={!thumbnailUrl.startsWith("/")}
                      className={styles.mockCoverImg}
                    />
                  ) : (
                    <div className={styles.mockCoverFallback}>
                      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: "6px" }} aria-hidden="true">
                        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                      </svg>
                      <span>{title || "Course Cover"}</span>
                    </div>
                  )}
                </div>

                <div className={styles.mockCardBody}>
                  <div className={styles.mockTagRow}>
                    <span className={styles.mockCategoryPill}>{category}</span>
                    <span className={styles.mockLevelPill}>{level}</span>
                  </div>

                  <h5 className={styles.mockTitle}>
                    {title || "Course Title"}
                  </h5>

                  <p className={styles.mockSummary}>
                    {shortDescription || description?.slice(0, 100) || "No summary provided yet."}
                  </p>

                  <div className={styles.mockFooter}>
                    <div style={{ display: "flex", flexDirection: "column" }}>
                      <span className={styles.mockPrice}>
                        {currency === "USD"
                          ? Number(priceUSD) > 0 ? `$${Number(priceUSD).toLocaleString()}` : "Free"
                          : currency === "AED"
                          ? Number(priceAED) > 0 ? `AED ${Number(priceAED).toLocaleString()}` : "Free"
                          : Number(priceINR) > 0 ? `₹${Number(priceINR).toLocaleString("en-IN")}` : "Free"}
                      </span>
                      {hasEarlyBird && earlyBirdPrice && (
                        <span style={{ fontSize: "0.72rem", color: "#b86b11", fontWeight: 600 }}>
                          Early Bird: {earlyBirdCurrency === "USD" ? `$${earlyBirdPrice}` : earlyBirdCurrency === "AED" ? `AED ${earlyBirdPrice}` : `₹${earlyBirdPrice}`}
                        </span>
                      )}
                    </div>
                    {hasCertificate && (
                      <span className={styles.mockCertTag}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                        <span>Certificate</span>
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* 3. Action Box */}
            <div className={styles.sidebarCard}>
              <button
                type="submit"
                disabled={isSaving}
                className={styles.btnPrimary}
              >
                {isSaving ? (
                  <span>Saving Changes...</span>
                ) : (
                  <>
                    <span>Save &amp; Continue to Modules</span>
                    <span aria-hidden="true">&rarr;</span>
                  </>
                )}
              </button>
              <div style={{ textAlign: "center", marginTop: "0.75rem", fontSize: "0.75rem", color: "var(--text-muted, #78716a)" }}>
                Changes are automatically synced to the cloud.
              </div>
            </div>
          </div>
        </div>
      </form>
    </section>
  );
}
