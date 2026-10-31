"use client";

import React, { useState } from "react";
import styles from "../curriculum.module.css";
import { MediaPreviewModal, HelpTooltip, type MediaPreviewConfig } from "../../../components";

interface ProgramCertificatePanelProps {
  programId: string;
  programTitle: string;
  hasCertificate: boolean;
  onUpdateCertificate: (settings: { hasCertificate: boolean; certificateTemplate?: string }) => Promise<void>;
}

export default function ProgramCertificatePanel({
  programId,
  programTitle,
  hasCertificate,
  onUpdateCertificate,
}: ProgramCertificatePanelProps) {
  const [enabled, setEnabled] = useState(hasCertificate);
  const [template, setTemplate] = useState("CLASSIC_GOLD");
  const [isSaving, setIsSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [previewConfig, setPreviewConfig] = useState<MediaPreviewConfig | null>(null);

  const handleSave = async () => {
    setIsSaving(true);
    setSavedSuccess(false);
    try {
      await onUpdateCertificate({
        hasCertificate: enabled,
        certificateTemplate: template,
      });
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3000);
    } finally {
      setIsSaving(false);
    }
  };

  const openPreview = () => {
    setPreviewConfig({
      isOpen: true,
      type: "CERTIFICATE",
      title: `${programTitle} Certificate`,
      certificateData: {
        programTitle,
        studentName: "Alexandra Vance",
        completionDate: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
        certificateNumber: `WBM-CERT-${programId.substring(0, 6).toUpperCase()}-001`,
      },
    });
  };

  return (
    <section className={styles.cardSurface}>
      {/* Header */}
      <div className={styles.cardHeaderArea}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "1rem" }}>
          <div>
            <div className={styles.stepEyebrow}>CREDENTIALS &amp; ACCREDITATION</div>
            <h2 className={styles.stepTitle}>Certificate of Completion</h2>
            <p className={styles.stepSubtitle}>
              Configure and preview the official completion credential issued for <strong>{programTitle}</strong>.
            </p>
          </div>

          <button
            type="button"
            onClick={openPreview}
            style={{
              background: "#fffbeb",
              border: "1px solid #fde68a",
              color: "#b45309",
              padding: "0.55rem 1.15rem",
              borderRadius: 8,
              fontSize: "0.85rem",
              fontWeight: 700,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              boxShadow: "0 1px 3px rgba(180, 83, 9, 0.12)",
            }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
            <span>Live Visual Preview</span>
          </button>
        </div>
      </div>

      {savedSuccess && (
        <div
          style={{
            background: "#ecfdf5",
            border: "1px solid #6ee7b7",
            color: "#065f46",
            padding: "10px 16px",
            borderRadius: 10,
            fontSize: "0.88rem",
            marginBottom: "1.25rem",
          }}
        >
          ✓ Certificate configuration saved successfully.
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 340px", gap: "1.5rem", alignItems: "start" }}>
        {/* Left: Configuration form */}
        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          {/* Certificate Toggle */}
          <div
            style={{
              padding: "1.15rem",
              borderRadius: 12,
              background: enabled ? "#fdfbf7" : "#fafafa",
              border: enabled ? "1px solid #ebd9c4" : "1px solid #e2e8f0",
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              gap: "1rem",
            }}
          >
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <strong style={{ fontSize: "0.95rem", color: "#14110f" }}>
                  Issue Official Certificate of Completion
                </strong>
                <HelpTooltip text="When enabled, learners who successfully satisfy all program curriculum steps, assessments, and attendance milestones receive an official signed PDF credential and verification link." />
              </div>
              <p style={{ margin: "4px 0 0", fontSize: "0.8rem", color: "#78716a" }}>
                Accredited with WhatBoutMe digital verification seal and serial number.
              </p>
            </div>

            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              style={{ width: 18, height: 18, accentColor: "#c97a1e", cursor: "pointer", marginTop: 4 }}
            />
          </div>

          {/* Template Selection */}
          {enabled && (
            <div style={{ background: "#ffffff", border: "1px solid #ece4d7", borderRadius: 12, padding: "1.15rem" }}>
              <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 700, color: "#14110f", marginBottom: 6 }}>
                Certificate Template Design
              </label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                <div
                  onClick={() => setTemplate("CLASSIC_GOLD")}
                  style={{
                    padding: "0.85rem",
                    borderRadius: 8,
                    border: template === "CLASSIC_GOLD" ? "2px solid #b45309" : "1px solid #e7decb",
                    background: template === "CLASSIC_GOLD" ? "#fffdfa" : "#ffffff",
                    cursor: "pointer",
                    textAlign: "center",
                  }}
                >
                  <strong style={{ fontSize: "0.88rem", color: "#b45309", display: "block" }}>
                    Executive Gold
                  </strong>
                  <span style={{ fontSize: "0.75rem", color: "#78716a" }}>
                    Double inner border, gold seal, warm serif
                  </span>
                </div>

                <div
                  onClick={() => setTemplate("MINIMALIST_MODERN")}
                  style={{
                    padding: "0.85rem",
                    borderRadius: 8,
                    border: template === "MINIMALIST_MODERN" ? "2px solid #b45309" : "1px solid #e7decb",
                    background: template === "MINIMALIST_MODERN" ? "#fffdfa" : "#ffffff",
                    cursor: "pointer",
                    textAlign: "center",
                  }}
                >
                  <strong style={{ fontSize: "0.88rem", color: "#14110f", display: "block" }}>
                    Modern Monogram
                  </strong>
                  <span style={{ fontSize: "0.75rem", color: "#78716a" }}>
                    Minimalist geometric header, QR code
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Save Action */}
          <div>
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              style={{
                background: "var(--accent-primary, #c97a1e)",
                color: "#ffffff",
                border: "none",
                padding: "0.6rem 1.35rem",
                borderRadius: 8,
                fontSize: "0.88rem",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              {isSaving ? "Saving..." : "Save Certificate Settings"}
            </button>
          </div>
        </div>

        {/* Right: Miniature Certificate Visual Preview */}
        <div
          onClick={openPreview}
          style={{
            background: "#ffffff",
            border: "1px solid #ece4d7",
            borderRadius: 12,
            padding: "1rem",
            cursor: "pointer",
            boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
            textAlign: "center",
            transition: "all 0.15s ease",
          }}
          title="Click to view full screen certificate preview"
        >
          <span style={{ fontSize: "0.74rem", fontWeight: 700, color: "#78716a", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 8 }}>
            Credential Snapshot
          </span>

          {/* Mini Replica */}
          <div
            style={{
              aspectRatio: "1.414",
              background: "#ffffff",
              border: "6px solid #14110f",
              padding: "1rem",
              borderRadius: 2,
              position: "relative",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div style={{ position: "absolute", inset: 4, border: "1px solid #d4a373", pointerEvents: "none" }} />
            <span style={{ fontSize: "0.6rem", fontWeight: 700, letterSpacing: "0.1em", color: "#b45309" }}>WHATBOUTME</span>
            <div style={{ fontSize: "0.85rem", fontWeight: 800, color: "#14110f" }}>Certificate of Completion</div>
            <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "#b45309" }}>Alexandra Vance</div>
            <div style={{ fontSize: "0.62rem", color: "#78716a" }}>{programTitle}</div>
            <div style={{ width: "100%", display: "flex", justifyContent: "space-between", fontSize: "0.55rem", color: "#78716a", borderTop: "1px solid #f2ede4", paddingTop: 4 }}>
              <span>Roweena · Master Coach</span>
              <span>Official Seal ✓</span>
            </div>
          </div>

          <span style={{ fontSize: "0.75rem", color: "var(--accent-primary, #c97a1e)", fontWeight: 600, display: "inline-block", marginTop: 8 }}>
            Click to enlarge full preview →
          </span>
        </div>
      </div>

      {/* Preview Modal */}
      <MediaPreviewModal
        config={previewConfig}
        onClose={() => setPreviewConfig(null)}
      />
    </section>
  );
}
