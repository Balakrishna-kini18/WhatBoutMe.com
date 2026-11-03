"use client";

import React, { useState } from "react";
import styles from "../curriculum.module.css";
import Certificate from "../../../certificates/Certificate";
import { MediaPreviewModal, HelpTooltip, type MediaPreviewConfig } from "../../../components";

interface ProgramCertificatePanelProps {
  programId: string;
  programTitle: string;
  hasCertificate: boolean;
  certificateTemplate?: string | null;
  onUpdateCertificate: (settings: { hasCertificate: boolean; certificateTemplate?: string }) => Promise<void>;
}

export default function ProgramCertificatePanel({
  programId,
  programTitle,
  hasCertificate,
  certificateTemplate,
  onUpdateCertificate,
}: ProgramCertificatePanelProps) {
  const [enabled, setEnabled] = useState<boolean>(hasCertificate);
  const [template, setTemplate] = useState<string>(
    certificateTemplate === "PARTICIPATION" || certificateTemplate === "CORPORATE_PARTICIPATION"
      ? "PARTICIPATION"
      : "CPD_25_HOURS"
  );
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [savedSuccess, setSavedSuccess] = useState<boolean>(false);
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
      title: `${programTitle || "Program"} Certificate`,
      certificateData: {
        programTitle: programTitle || "11 Steps to U Certification Programme",
        studentName: "Alexandra Vance",
        completionDate: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
        certificateNumber: `WBM-CERT-${programId.substring(0, 6).toUpperCase()}-001`,
        templateType: template,
      },
    });
  };

  return (
    <section className={styles.cardSurface}>
      {/* Clean Header - No redundant subtitle or eyebrow */}
      <div style={{ marginBottom: "1.25rem" }}>
        <h2 className={styles.stepTitle} style={{ margin: 0 }}>
          Certificate of Completion
        </h2>
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
            display: "flex",
            alignItems: "center",
            gap: "8px",
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          <span>Certificate configuration saved successfully.</span>
        </div>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(320px, 1fr) minmax(380px, 1.25fr)",
          gap: "1.75rem",
          alignItems: "start",
        }}
      >
        {/* Left: Configuration Form */}
        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          {/* Certificate Toggle */}
          <div
            style={{
              padding: "1.15rem",
              borderRadius: 12,
              background: enabled ? "#fdfbf7" : "#fafafa",
              border: enabled ? "1px solid #ebd9c4" : "1px solid #e2e8f0",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "1rem",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <strong style={{ fontSize: "0.95rem", color: "#14110f" }}>
                Issue Official Certificate of Completion
              </strong>
              <HelpTooltip text="When enabled, learners who successfully satisfy all program curriculum steps, assessments, and attendance milestones receive an official signed PDF credential and verification link." />
            </div>

            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              aria-label="Issue Official Certificate of Completion"
              style={{ width: 18, height: 18, accentColor: "#c97a1e", cursor: "pointer" }}
            />
          </div>

          {/* Template Selection */}
          {enabled && (
            <div style={{ background: "#ffffff", border: "1px solid #ece4d7", borderRadius: 12, padding: "1.15rem" }}>
              <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 700, color: "#14110f", marginBottom: "0.75rem" }}>
                Certificate Template
              </label>

              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                {/* Option 1: 25 CPD Hours */}
                <div
                  onClick={() => setTemplate("CPD_25_HOURS")}
                  style={{
                    padding: "0.9rem 1rem",
                    borderRadius: 10,
                    border: template === "CPD_25_HOURS" ? "2px solid #b45309" : "1px solid #e7decb",
                    background: template === "CPD_25_HOURS" ? "#fffdfa" : "#ffffff",
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
                    <strong style={{ fontSize: "0.9rem", color: template === "CPD_25_HOURS" ? "#b45309" : "#14110f" }}>
                      25 CPD Hours Professional
                    </strong>
                    <span
                      style={{
                        fontSize: "0.7rem",
                        fontWeight: 700,
                        padding: "2px 7px",
                        borderRadius: 4,
                        background: template === "CPD_25_HOURS" ? "#fef3c7" : "#f5f5f4",
                        color: template === "CPD_25_HOURS" ? "#92400e" : "#78716a",
                      }}
                    >
                      Accredited
                    </span>
                  </div>
                  <span style={{ fontSize: "0.78rem", color: "#78716a", display: "block", lineHeight: 1.4 }}>
                    Official Certificate of Completion with 25 CPD UK Hours, gold award seal, and QR verification.
                  </span>
                </div>

                {/* Option 2: Participation */}
                <div
                  onClick={() => setTemplate("PARTICIPATION")}
                  style={{
                    padding: "0.9rem 1rem",
                    borderRadius: 10,
                    border: template === "PARTICIPATION" ? "2px solid #b45309" : "1px solid #e7decb",
                    background: template === "PARTICIPATION" ? "#fffdfa" : "#ffffff",
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
                    <strong style={{ fontSize: "0.9rem", color: template === "PARTICIPATION" ? "#b45309" : "#14110f" }}>
                      Certificate of Participation
                    </strong>
                    <span
                      style={{
                        fontSize: "0.7rem",
                        fontWeight: 700,
                        padding: "2px 7px",
                        borderRadius: 4,
                        background: template === "PARTICIPATION" ? "#fef3c7" : "#f5f5f4",
                        color: template === "PARTICIPATION" ? "#92400e" : "#78716a",
                      }}
                    >
                      Workshop
                    </span>
                  </div>
                  <span style={{ fontSize: "0.78rem", color: "#78716a", display: "block", lineHeight: 1.4 }}>
                    Official executive workshop credential with lead facilitator signature and verification.
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
                padding: "0.6rem 1.4rem",
                borderRadius: 8,
                fontSize: "0.88rem",
                fontWeight: 700,
                cursor: isSaving ? "not-allowed" : "pointer",
                opacity: isSaving ? 0.7 : 1,
              }}
            >
              {isSaving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </div>

        {/* Right: Authentic Certificate Live Visual Preview matching Approvals & Gates */}
        <div
          style={{
            background: "#ffffff",
            border: "1px solid #ece4d7",
            borderRadius: 12,
            padding: "1rem",
            boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
          }}
        >
          {/* Card Header with single clean preview expand action */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "0.75rem",
              paddingBottom: "0.5rem",
              borderBottom: "1px solid #f2ede4",
            }}
          >
            <span
              style={{
                fontSize: "0.75rem",
                fontWeight: 700,
                color: "#78716a",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
            >
              Live Certificate Preview
            </span>

            {enabled && (
              <button
                type="button"
                onClick={openPreview}
                style={{
                  background: "#fffbeb",
                  border: "1px solid #fde68a",
                  color: "#b45309",
                  padding: "0.3rem 0.65rem",
                  borderRadius: 6,
                  fontSize: "0.76rem",
                  fontWeight: 600,
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
                </svg>
                <span>Expand</span>
              </button>
            )}
          </div>

          {enabled ? (
            <div
              onClick={openPreview}
              style={{
                cursor: "pointer",
                borderRadius: 8,
                overflow: "hidden",
                transition: "transform 0.15s ease, box-shadow 0.15s ease",
              }}
              title="Click to view full-screen certificate preview"
            >
              {/* Authentic Certificate component matching Approvals & Gates */}
              <Certificate
                recipientName="Alexandra Vance"
                courseName={programTitle || "11 Steps to U Certification Programme"}
                issueDate={new Date().toISOString()}
                certificateNumber={`WBM-CERT-${programId.substring(0, 6).toUpperCase()}-001`}
                templateType={template === "PARTICIPATION" ? "PARTICIPATION" : "CPD_25_HOURS"}
                certificateType={template === "PARTICIPATION" ? "PARTICIPATION" : "CPD_25_HOURS"}
                cpdHours={25}
                showLinkedInShare={false}
              />
            </div>
          ) : (
            <div
              style={{
                aspectRatio: "1.414",
                borderRadius: 8,
                border: "1px dashed #d6d3d1",
                background: "#fafaf9",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                padding: "2rem",
                textAlign: "center",
                color: "#78716a",
              }}
            >
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#a8a29e" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ marginBottom: "0.75rem" }}>
                <rect x="3" y="4" width="18" height="16" rx="2" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
              <strong style={{ fontSize: "0.88rem", color: "#44403c", marginBottom: 4 }}>
                Certificates Disabled
              </strong>
              <span style={{ fontSize: "0.78rem", maxWidth: 280 }}>
                Enable the toggle on the left to configure and preview the official credential for this program.
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Full-Screen Preview Modal */}
      <MediaPreviewModal
        config={previewConfig}
        onClose={() => setPreviewConfig(null)}
      />
    </section>
  );
}
