"use client";

import React, { useState, useEffect } from "react";
import styles from "../curriculum.module.css";
import { HelpTooltip } from "../../../components";

interface Step3PricingAccessProps {
  programData: any;
  onSave?: (updatedPricingData: any) => Promise<void>;
  onSaveAndContinue?: (updatedPricingData: any) => Promise<void>;
  onPrevious?: () => void;
  isSaving: boolean;
}

export default function Step3PricingAccess({
  programData,
  onSave,
  onSaveAndContinue,
  isSaving,
}: Step3PricingAccessProps) {
  // USD Tuition & Price
  const [price, setPrice] = useState<string>(
    programData?.price !== undefined && programData?.price !== null
      ? String(programData.price)
      : "0"
  );

  // Early Bird Toggle & Fields (Standardized in USD)
  const [hasEarlyBird, setHasEarlyBird] = useState(
    Boolean(programData?.earlyBirdPrice)
  );
  const [earlyBirdPrice, setEarlyBirdPrice] = useState<string>(
    programData?.earlyBirdPrice ? String(programData.earlyBirdPrice) : ""
  );
  const [earlyBirdDeadline, setEarlyBirdDeadline] = useState<string>(
    programData?.earlyBirdDeadline
      ? programData.earlyBirdDeadline.split("T")[0]
      : ""
  );

  // Access & Progression Rules
  const [sequentialProgressionEnabled, setSequentialProgressionEnabled] = useState(
    programData?.sequentialProgressionEnabled !== false
  );
  const [attendanceRequired, setAttendanceRequired] = useState(
    programData?.attendanceRequired !== false
  );
  const [attendanceThreshold, setAttendanceThreshold] = useState<number>(
    programData?.attendanceThreshold !== undefined ? Number(programData.attendanceThreshold) : 80
  );

  // Milestone Completion Criteria
  const [requireExam, setRequireExam] = useState(
    programData?.requireExam !== false
  );
  const [requireCoaching, setRequireCoaching] = useState(
    programData?.requireCoaching !== false
  );
  const [requireMissionStatement, setRequireMissionStatement] = useState(
    programData?.requireMissionStatement !== false
  );
  const [hasCertificate, setHasCertificate] = useState(
    programData?.hasCertificate !== false
  );

  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Sync state when programData changes
  useEffect(() => {
    if (programData) {
      setPrice(programData.price !== undefined && programData.price !== null ? String(programData.price) : "0");
      setHasEarlyBird(Boolean(programData.earlyBirdPrice));
      setEarlyBirdPrice(programData.earlyBirdPrice ? String(programData.earlyBirdPrice) : "");
      setEarlyBirdDeadline(programData.earlyBirdDeadline ? programData.earlyBirdDeadline.split("T")[0] : "");
      setSequentialProgressionEnabled(programData.sequentialProgressionEnabled !== false);
      setAttendanceRequired(programData.attendanceRequired !== false);
      setAttendanceThreshold(programData.attendanceThreshold !== undefined ? Number(programData.attendanceThreshold) : 80);
      setRequireExam(programData.requireExam !== false);
      setRequireCoaching(programData.requireCoaching !== false);
      setRequireMissionStatement(programData.requireMissionStatement !== false);
      setHasCertificate(programData.hasCertificate !== false);
    }
  }, [programData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const activePrice = Number(price) || 0;
    if (activePrice < 0) {
      setErrorMsg("Tuition price must be a non-negative number.");
      return;
    }

    setErrorMsg(null);
    const payload = {
      price: activePrice,
      currency: "USD",
      priceUSD: activePrice,
      earlyBirdPrice: hasEarlyBird && earlyBirdPrice ? Number(earlyBirdPrice) : null,
      earlyBirdCurrency: hasEarlyBird ? "USD" : null,
      earlyBirdDeadline: hasEarlyBird && earlyBirdDeadline ? earlyBirdDeadline : null,
      sequentialProgressionEnabled,
      attendanceRequired,
      attendanceThreshold: Number(attendanceThreshold) || 80,
      requireExam,
      requireCoaching,
      requireMissionStatement,
      hasCertificate,
    };

    if (onSave) {
      await onSave(payload);
    } else if (onSaveAndContinue) {
      await onSaveAndContinue(payload);
    }
  };

  return (
    <section className={styles.cardSurface}>
      {/* Header */}
      <div className={styles.cardHeaderArea} style={{ marginBottom: "1.25rem" }}>
        <h2 className={styles.stepTitle}>Pricing &amp; Access</h2>
      </div>

      {errorMsg && (
        <div
          role="alert"
          style={{
            background: "#fef2f2",
            border: "1px solid #fecdd3",
            color: "#991b1b",
            padding: "10px 14px",
            borderRadius: 8,
            fontSize: "0.85rem",
            marginBottom: "1.25rem",
          }}
        >
          {errorMsg}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className={styles.pricingTwoColGrid} style={{ gap: "2rem" }}>
          {/* =========================================================
              Left Column: Tuition & Early Bird
              ========================================================= */}
          <div className={styles.pricingCard}>
            <h3 className={styles.pricingCardTitle} style={{ marginBottom: "1rem", fontSize: "1.1rem" }}>
              Tuition (USD)
            </h3>

            {/* Base Tuition / Price */}
            <div className={styles.formGroup} style={{ marginBottom: "1.25rem" }}>
              <label className={styles.formLabel} style={{ marginBottom: "0.4rem" }}>
                <span>Course Tuition ($ USD) *</span>
              </label>
              <div style={{ position: "relative" }}>
                <span
                  style={{
                    position: "absolute",
                    left: "12px",
                    top: "50%",
                    transform: "translateY(-50%)",
                    fontWeight: 700,
                    color: "var(--text-secondary, #78716a)",
                    fontSize: "0.95rem",
                  }}
                >
                  $
                </span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  required
                  placeholder="0 (Free)"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  className={styles.formInput}
                  style={{ paddingLeft: "26px" }}
                />
              </div>
            </div>

            {/* Early Bird Discount Toggle */}
            <div className={styles.settingRow} style={{ marginTop: "1rem", paddingTop: "0.75rem", borderTop: "1px solid var(--border-light, #ece6dd)" }}>
              <div className={styles.settingLabelGroup}>
                <span className={styles.settingLabelTitle}>Early Bird Pricing</span>
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
                  padding: "0.9rem",
                  marginTop: "0.75rem",
                  marginBottom: "1rem",
                }}
              >
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                  <div>
                    <label className={styles.formLabel} style={{ fontSize: "0.8rem", marginBottom: "0.3rem" }}>
                      Early Bird Price ($)
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="e.g. 149"
                      value={earlyBirdPrice}
                      onChange={(e) => setEarlyBirdPrice(e.target.value)}
                      className={styles.formInput}
                    />
                  </div>

                  <div>
                    <label className={styles.formLabel} style={{ fontSize: "0.8rem", marginBottom: "0.3rem" }}>
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

            {/* Digital Workshop Consent Policy Notice */}
            <div
              style={{
                marginTop: "1.5rem",
                padding: "0.85rem 1rem",
                background: "#f0fdf4",
                border: "1px solid #bbf7d0",
                borderRadius: 10,
                display: "flex",
                gap: "0.65rem",
                alignItems: "flex-start",
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 2 }}>
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
              <div style={{ fontSize: "0.8rem", color: "#166534", lineHeight: 1.45 }}>
                <strong>Digital Consent Gate:</strong> Step 1 remains strictly locked post-payment until the learner signs the agreement.
              </div>
            </div>
          </div>

          {/* =========================================================
              Right Column: Access & Progression Rules
              ========================================================= */}
          <div className={styles.pricingCard}>
            <h3 className={styles.pricingCardTitle} style={{ marginBottom: "1rem", fontSize: "1.1rem" }}>
              Progression &amp; Certification
            </h3>

            {/* Sequential Step Progression */}
            <div className={styles.settingRow}>
              <div className={styles.settingLabelGroup} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <span className={styles.settingLabelTitle}>Sequential Step Progression</span>
                <HelpTooltip text="When enabled, learners must complete Step N before Step N+1 unlocks (enforcing the 11 Steps to U pedagogy)." />
              </div>
              <label className={styles.toggleSwitch}>
                <input
                  type="checkbox"
                  checked={sequentialProgressionEnabled}
                  onChange={(e) => setSequentialProgressionEnabled(e.target.checked)}
                />
                <span className={styles.toggleSlider} />
              </label>
            </div>

            {/* Attendance Enforcement */}
            <div className={styles.settingRow} style={{ marginTop: "1rem", paddingTop: "0.75rem", borderTop: "1px solid var(--border-light, #ece6dd)" }}>
              <div className={styles.settingLabelGroup} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <span className={styles.settingLabelTitle}>Live Session Attendance</span>
                <HelpTooltip text="Requires learners to meet a minimum attendance percentage across scheduled live cohort sessions." />
              </div>
              <label className={styles.toggleSwitch}>
                <input
                  type="checkbox"
                  checked={attendanceRequired}
                  onChange={(e) => setAttendanceRequired(e.target.checked)}
                />
                <span className={styles.toggleSlider} />
              </label>
            </div>

            {attendanceRequired && (
              <div
                style={{
                  background: "#faf7f2",
                  border: "1px solid #ece6dd",
                  borderRadius: 10,
                  padding: "0.85rem 1rem",
                  marginTop: "0.65rem",
                  marginBottom: "0.5rem",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                  <span style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--text-primary, #14110f)" }}>
                    Minimum Threshold
                  </span>
                  <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "#d97706" }}>
                    {attendanceThreshold}%
                  </span>
                </div>
                <input
                  type="range"
                  min="50"
                  max="100"
                  step="5"
                  value={attendanceThreshold}
                  onChange={(e) => setAttendanceThreshold(Number(e.target.value))}
                  style={{ width: "100%", accentColor: "#d97706", cursor: "pointer" }}
                />
              </div>
            )}

            {/* Milestone Requirements Section */}
            <div style={{ marginTop: "1.25rem", paddingTop: "0.75rem", borderTop: "1px solid var(--border-light, #ece6dd)" }}>
              <div style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--text-muted, #78716a)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.75rem" }}>
                Certification Gates
              </div>

              {/* Require Final Exam */}
              <div className={styles.settingRow}>
                <div className={styles.settingLabelGroup}>
                  <span className={styles.settingLabelTitle}>Require Final Examination</span>
                </div>
                <label className={styles.toggleSwitch}>
                  <input
                    type="checkbox"
                    checked={requireExam}
                    onChange={(e) => setRequireExam(e.target.checked)}
                  />
                  <span className={styles.toggleSlider} />
                </label>
              </div>

              {/* Require Coaching */}
              <div className={styles.settingRow} style={{ marginTop: "0.75rem" }}>
                <div className={styles.settingLabelGroup}>
                  <span className={styles.settingLabelTitle}>Require 1-on-1 Coaching Session</span>
                </div>
                <label className={styles.toggleSwitch}>
                  <input
                    type="checkbox"
                    checked={requireCoaching}
                    onChange={(e) => setRequireCoaching(e.target.checked)}
                  />
                  <span className={styles.toggleSlider} />
                </label>
              </div>

              {/* Require Mission Statement */}
              <div className={styles.settingRow} style={{ marginTop: "0.75rem" }}>
                <div className={styles.settingLabelGroup}>
                  <span className={styles.settingLabelTitle}>Require Mission Statement</span>
                </div>
                <label className={styles.toggleSwitch}>
                  <input
                    type="checkbox"
                    checked={requireMissionStatement}
                    onChange={(e) => setRequireMissionStatement(e.target.checked)}
                  />
                  <span className={styles.toggleSlider} />
                </label>
              </div>

              {/* Has Certificate */}
              <div className={styles.settingRow} style={{ marginTop: "0.75rem" }}>
                <div className={styles.settingLabelGroup}>
                  <span className={styles.settingLabelTitle}>Issue Official Certificate</span>
                </div>
                <label className={styles.toggleSwitch}>
                  <input
                    type="checkbox"
                    checked={hasCertificate}
                    onChange={(e) => setHasCertificate(e.target.checked)}
                  />
                  <span className={styles.toggleSlider} />
                </label>
              </div>
            </div>
          </div>
        </div>

        {/* Save Button */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            marginTop: "2rem",
            paddingTop: "1.25rem",
            borderTop: "1px solid var(--border-light, #ece6dd)",
          }}
        >
          <button
            type="submit"
            className={styles.btnPrimary}
            disabled={isSaving}
            style={{ padding: "0.6rem 1.5rem" }}
          >
            {isSaving ? "Saving..." : "Save Pricing & Access Settings"}
          </button>
        </div>
      </form>
    </section>
  );
}
