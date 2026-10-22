"use client";

import React, { useState } from "react";
import styles from "../curriculum.module.css";
import { CustomSelect } from "../../../components";

interface Step3PricingAccessProps {
  programData: any;
  onSaveAndContinue: (updatedPricingData: {
    price: number;
    currency: "USD" | "AED" | "INR";
    priceUSD?: number;
    priceAED?: number;
    priceINR?: number;
    comparePrice?: number;
    earlyBirdPrice?: number | null;
    earlyBirdCurrency?: "USD" | "AED" | "INR" | null;
    earlyBirdDeadline?: string | null;
    enrollmentType?: string;
    accessDuration?: string;
    targetAudience?: string;
    dripContent?: boolean;
    requiresApproval?: boolean;
  }) => Promise<void>;
  onPrevious: () => void;
  isSaving: boolean;
}

export default function Step3PricingAccess({
  programData,
  onSaveAndContinue,
  onPrevious,
  isSaving,
}: Step3PricingAccessProps) {
  // Currency & Primary Price
  const [currency, setCurrency] = useState<"USD" | "AED" | "INR">(
    programData?.currency || "USD"
  );
  const [price, setPrice] = useState<string>(
    programData?.price !== undefined && programData?.price !== null
      ? String(programData.price)
      : "199"
  );
  const [comparePrice, setComparePrice] = useState<string>(
    programData?.comparePrice ? String(programData.comparePrice) : ""
  );

  // Early Bird Toggle & Fields
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

  // Multi-Currency Pricing Toggle & Currency Inputs
  const [hasMultiCurrency, setHasMultiCurrency] = useState(
    Boolean(programData?.priceUSD || programData?.priceAED || programData?.priceINR)
  );
  const [priceUSD, setPriceUSD] = useState<string>(
    programData?.priceUSD !== undefined && programData?.priceUSD !== null
      ? String(programData.priceUSD)
      : currency === "USD"
      ? String(programData?.price || 199)
      : "199"
  );
  const [priceAED, setPriceAED] = useState<string>(
    programData?.priceAED !== undefined && programData?.priceAED !== null
      ? String(programData.priceAED)
      : currency === "AED"
      ? String(programData?.price || 749)
      : "749"
  );
  const [priceINR, setPriceINR] = useState<string>(
    programData?.priceINR !== undefined && programData?.priceINR !== null
      ? String(programData.priceINR)
      : currency === "INR"
      ? String(programData?.price || 14999)
      : "14999"
  );

  // Access Settings
  const [enrollmentType, setEnrollmentType] = useState(
    programData?.enrollmentType || "Paid Enrollment"
  );
  const [accessDuration, setAccessDuration] = useState(
    programData?.accessDuration || "Lifetime Access"
  );
  const [targetAudience, setTargetAudience] = useState(
    programData?.targetAudience || ""
  );
  const [dripContent, setDripContent] = useState(
    Boolean(programData?.dripContent)
  );
  const [requiresApproval, setRequiresApproval] = useState(
    Boolean(programData?.requiresApproval)
  );

  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const activePrice = Number(price) || 0;
    if (activePrice < 0) {
      setErrorMsg("Price must be a non-negative number.");
      return;
    }

    setErrorMsg(null);
    await onSaveAndContinue({
      price: activePrice,
      currency,
      comparePrice: comparePrice ? Number(comparePrice) : undefined,
      priceUSD: hasMultiCurrency ? Number(priceUSD) || 0 : undefined,
      priceAED: hasMultiCurrency ? Number(priceAED) || 0 : undefined,
      priceINR: hasMultiCurrency ? Number(priceINR) || 0 : undefined,
      earlyBirdPrice: hasEarlyBird && earlyBirdPrice ? Number(earlyBirdPrice) : null,
      earlyBirdCurrency: hasEarlyBird ? earlyBirdCurrency : null,
      earlyBirdDeadline: hasEarlyBird && earlyBirdDeadline ? earlyBirdDeadline : null,
      enrollmentType,
      accessDuration,
      targetAudience: targetAudience.trim(),
      dripContent,
      requiresApproval,
    });
  };

  return (
    <section className={styles.cardSurface}>
      {/* Screen 3 Header */}
      <div className={styles.cardHeaderArea}>
        <div className={styles.stepEyebrow}>
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span>STEP 3: PRICING &amp; ACCESS</span>
        </div>
        <h2 className={styles.stepTitle}>Pricing &amp; Access Settings</h2>
        <p className={styles.stepSubtitle}>
          Configure course tuition, multi-currency rates, early-bird deadlines, and learner enrollment rules.
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
          }}
        >
          {errorMsg}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className={styles.pricingTwoColGrid}>
          {/* =========================================================
              Left Card: Pricing Information
              ========================================================= */}
          <div className={styles.pricingCard}>
            <h3 className={styles.pricingCardTitle}>Pricing Information</h3>
            <p className={styles.pricingCardSubtitle}>
              Set baseline course tuition, discounts, and regional currency conversions.
            </p>

            {/* Tuition / Price */}
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>
                <span>Tuition / Price *</span>
              </label>
              <div style={{ display: "grid", gridTemplateColumns: "110px 1fr", gap: "0.75rem" }}>
                <CustomSelect
                  value={currency}
                  onChange={(val) => setCurrency(val as "USD" | "AED" | "INR")}
                  fullWidth
                  ariaLabel="Select Currency"
                  options={[
                    { value: "USD", label: "USD ($)" },
                    { value: "AED", label: "AED (د.إ)" },
                    { value: "INR", label: "INR (₹)" },
                  ]}
                />
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  required
                  placeholder="e.g. 199"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  className={styles.formInput}
                />
              </div>
            </div>

            {/* Compare Price */}
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>
                <span>Compare Price (Optional)</span>
                <span className={styles.formLabelOptional}>Shows strikethrough original price</span>
              </label>
              <div style={{ display: "grid", gridTemplateColumns: "110px 1fr", gap: "0.75rem" }}>
                <CustomSelect
                  value={currency}
                  onChange={(val) => setCurrency(val as "USD" | "AED" | "INR")}
                  fullWidth
                  ariaLabel="Compare Price Currency"
                  options={[
                    { value: "USD", label: "USD ($)" },
                    { value: "AED", label: "AED (د.إ)" },
                    { value: "INR", label: "INR (₹)" },
                  ]}
                />
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="e.g. 299"
                  value={comparePrice}
                  onChange={(e) => setComparePrice(e.target.value)}
                  className={styles.formInput}
                />
              </div>
            </div>

            {/* Early Bird Discount Toggle */}
            <div className={styles.settingRow}>
              <div className={styles.settingLabelGroup}>
                <span className={styles.settingLabelTitle}>Early Bird Discount</span>
                <span className={styles.settingLabelDesc}>Enable early bird pricing for limited time.</span>
              </div>
              <label className={styles.toggleSwitch}>
                <input
                  type="checkbox"
                  checked={hasEarlyBird}
                  onChange={(e) => setHasEarlyBird(e.target.checked)}
                />
                <span className={styles.toggleSlider} />
              </label>
            </div>

            {/* Early Bird Inputs */}
            {hasEarlyBird && (
              <div
                style={{
                  background: "#faf7f2",
                  border: "1px solid #ece6dd",
                  borderRadius: 10,
                  padding: "1rem",
                  marginTop: "0.75rem",
                  marginBottom: "1rem",
                }}
              >
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", marginBottom: "0.75rem" }}>
                  <div>
                    <label className={styles.formLabel} style={{ fontSize: "0.8rem" }}>
                      Early Bird Price
                    </label>
                    <div style={{ display: "grid", gridTemplateColumns: "90px 1fr", gap: "0.5rem" }}>
                      <CustomSelect
                        value={earlyBirdCurrency}
                        onChange={(val) => setEarlyBirdCurrency(val as "USD" | "AED" | "INR")}
                        fullWidth
                        ariaLabel="Early Bird Currency"
                        options={[
                          { value: "USD", label: "USD" },
                          { value: "AED", label: "AED" },
                          { value: "INR", label: "INR" },
                        ]}
                      />
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="149"
                        value={earlyBirdPrice}
                        onChange={(e) => setEarlyBirdPrice(e.target.value)}
                        className={styles.formInput}
                      />
                    </div>
                  </div>

                  <div>
                    <label className={styles.formLabel} style={{ fontSize: "0.8rem" }}>
                      Deadline Date
                    </label>
                    <input
                      type="date"
                      value={earlyBirdDeadline}
                      onChange={(e) => setEarlyBirdDeadline(e.target.value)}
                      className={styles.formInput}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Multi-Currency Pricing Toggle */}
            <div className={styles.settingRow}>
              <div className={styles.settingLabelGroup}>
                <span className={styles.settingLabelTitle}>Multi-Currency Pricing</span>
                <span className={styles.settingLabelDesc}>Allow multiple currency (USD, AED, INR, etc.)</span>
              </div>
              <label className={styles.toggleSwitch}>
                <input
                  type="checkbox"
                  checked={hasMultiCurrency}
                  onChange={(e) => setHasMultiCurrency(e.target.checked)}
                />
                <span className={styles.toggleSlider} />
              </label>
            </div>

            {/* Multi-Currency Inputs */}
            {hasMultiCurrency && (
              <div
                style={{
                  background: "#faf7f2",
                  border: "1px solid #ece6dd",
                  borderRadius: 10,
                  padding: "1rem",
                  marginTop: "0.75rem",
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.75rem",
                }}
              >
                <div>
                  <label className={styles.formLabel} style={{ fontSize: "0.8rem" }}>
                    USD ($) Rate
                  </label>
                  <input
                    type="number"
                    min="0"
                    placeholder="199"
                    value={priceUSD}
                    onChange={(e) => setPriceUSD(e.target.value)}
                    className={styles.formInput}
                  />
                </div>
                <div>
                  <label className={styles.formLabel} style={{ fontSize: "0.8rem" }}>
                    AED (د.إ) Rate
                  </label>
                  <input
                    type="number"
                    min="0"
                    placeholder="749"
                    value={priceAED}
                    onChange={(e) => setPriceAED(e.target.value)}
                    className={styles.formInput}
                  />
                </div>
                <div>
                  <label className={styles.formLabel} style={{ fontSize: "0.8rem" }}>
                    INR (₹) Rate
                  </label>
                  <input
                    type="number"
                    min="0"
                    placeholder="14999"
                    value={priceINR}
                    onChange={(e) => setPriceINR(e.target.value)}
                    className={styles.formInput}
                  />
                </div>
              </div>
            )}
          </div>

          {/* =========================================================
              Right Card: Access Settings
              ========================================================= */}
          <div className={styles.pricingCard}>
            <h3 className={styles.pricingCardTitle}>Access Settings</h3>
            <p className={styles.pricingCardSubtitle}>
              Control enrollment permissions, access lifespan, and release schedules.
            </p>

            {/* Enrollment Type */}
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>
                <span>Enrollment Type</span>
              </label>
              <CustomSelect
                value={enrollmentType}
                onChange={setEnrollmentType}
                fullWidth
                ariaLabel="Select Enrollment Type"
                options={[
                  { value: "Paid Enrollment", label: "Paid Enrollment" },
                  { value: "Free Enrollment", label: "Free Enrollment" },
                  { value: "Corporate / Invite Only", label: "Corporate / Invite Only" },
                ]}
              />
            </div>

            {/* Access Duration */}
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>
                <span>Access Duration</span>
              </label>
              <CustomSelect
                value={accessDuration}
                onChange={setAccessDuration}
                fullWidth
                ariaLabel="Select Access Duration"
                options={[
                  { value: "Lifetime Access", label: "Lifetime Access" },
                  { value: "Cohort Duration", label: "Cohort Duration" },
                  { value: "Time-Limited (1 Year)", label: "Time-Limited (1 Year)" },
                  { value: "Time-Limited (6 Months)", label: "Time-Limited (6 Months)" },
                ]}
              />
            </div>

            {/* Target Audience */}
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>
                <span>Target Audience</span>
              </label>
              <input
                type="text"
                placeholder="e.g. Students, Working Professionals"
                value={targetAudience}
                onChange={(e) => setTargetAudience(e.target.value)}
                className={styles.formInput}
              />
            </div>

            {/* Drip Content Release Toggle */}
            <div className={styles.settingRow}>
              <div className={styles.settingLabelGroup}>
                <span className={styles.settingLabelTitle}>Drip Content Release</span>
                <span className={styles.settingLabelDesc}>Release lessons gradually on a scheduled cadence.</span>
              </div>
              <label className={styles.toggleSwitch}>
                <input
                  type="checkbox"
                  checked={dripContent}
                  onChange={(e) => setDripContent(e.target.checked)}
                />
                <span className={styles.toggleSlider} />
              </label>
            </div>

            {/* Requires Approval Toggle */}
            <div className={styles.settingRow}>
              <div className={styles.settingLabelGroup}>
                <span className={styles.settingLabelTitle}>Requires Approval</span>
                <span className={styles.settingLabelDesc}>Manually approve enrollments before course access.</span>
              </div>
              <label className={styles.toggleSwitch}>
                <input
                  type="checkbox"
                  checked={requiresApproval}
                  onChange={(e) => setRequiresApproval(e.target.checked)}
                />
                <span className={styles.toggleSlider} />
              </label>
            </div>
          </div>
        </div>

        {/* Bottom Footer: Previous on Left, Warm-Orange Save & Continue on Right */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginTop: "2.5rem",
            paddingTop: "1.5rem",
            borderTop: "1px solid #ece6dd",
          }}
        >
          <button
            type="button"
            className={styles.secondaryActionBtn}
            onClick={onPrevious}
            disabled={isSaving}
          >
            &lt;- Previous
          </button>

          <button
            type="submit"
            className={styles.btnPrimary}
            disabled={isSaving}
          >
            {isSaving ? "Saving Pricing..." : "Save & Continue ->"}
          </button>
        </div>
      </form>
    </section>
  );
}
