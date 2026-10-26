"use client";

import React, { useState } from "react";
import Link from "next/link";
import styles from "../curriculum.module.css";
import { useToast } from "../../../components";
import type { ProgramTab } from "../page";

interface ProgramSettingsPanelProps {
  programId: string;
  programData: any;
  onUpdateProgram: (updatedData: any) => Promise<void>;
  onNavigateTab: (tab: ProgramTab) => void;
}

export default function ProgramSettingsPanel({
  programId,
  programData,
  onUpdateProgram,
  onNavigateTab,
}: ProgramSettingsPanelProps) {
  const toast = useToast();
  const [isSaving, setIsSaving] = useState(false);

  // Milestone & Progression State
  const [requireExam, setRequireExam] = useState<boolean>(
    programData?.requireExam !== false
  );
  const [requireCoaching, setRequireCoaching] = useState<boolean>(
    programData?.requireCoaching !== false
  );
  const [attendanceRequired, setAttendanceRequired] = useState<boolean>(
    programData?.attendanceRequired !== false
  );
  const [attendanceThreshold, setAttendanceThreshold] = useState<number>(
    programData?.attendanceThreshold ?? 80
  );
  const [requireMissionStatement, setRequireMissionStatement] = useState<boolean>(
    programData?.requireMissionStatement !== false
  );
  const [sequentialProgressionEnabled, setSequentialProgressionEnabled] = useState<boolean>(
    programData?.sequentialProgressionEnabled !== false
  );
  const [hasCertificate, setHasCertificate] = useState<boolean>(
    Boolean(programData?.hasCertificate)
  );
  const [certificateTemplate, setCertificateTemplate] = useState<string>(
    programData?.certificateTemplate || "Professional Certificate"
  );

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onUpdateProgram({
        requireExam,
        requireCoaching,
        attendanceRequired,
        attendanceThreshold: Number(attendanceThreshold) || 80,
        requireMissionStatement,
        sequentialProgressionEnabled,
        hasCertificate,
        certificateTemplate,
      });
      toast.success("Progression & completion requirements saved successfully.");
    } catch (err: any) {
      toast.error(err.message || "Failed to save progression settings.");
    } finally {
      setIsSaving(false);
    }
  };

  const toggleStyle = (active: boolean): React.CSSProperties => ({
    position: "relative",
    display: "inline-flex",
    alignItems: "center",
    width: "48px",
    height: "26px",
    borderRadius: "14px",
    backgroundColor: active ? "#c97a1e" : "#d1d5db",
    cursor: "pointer",
    transition: "background-color 0.2s ease",
    border: "none",
    padding: "2px",
    flexShrink: 0,
  });

  const toggleKnobStyle = (active: boolean): React.CSSProperties => ({
    display: "block",
    width: "22px",
    height: "22px",
    borderRadius: "50%",
    backgroundColor: "#ffffff",
    boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
    transform: active ? "translateX(22px)" : "translateX(0)",
    transition: "transform 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
  });

  return (
    <section className={styles.cardSurface} aria-label="Progression and Milestone Settings">
      {/* Header */}
      <div className={styles.cardHeaderArea}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "1rem" }}>
          <div>
            <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "#c97a1e", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Program Architecture
            </span>
            <h2 className={styles.stepTitle} style={{ margin: "4px 0 0" }}>
              Milestones &amp; Progression Settings
            </h2>
            <p className={styles.stepSubtitle}>
              Easily configure completion prerequisites, calling, assessments, mission statements, and certification rules for {programData?.title || "this program"}.
            </p>
          </div>

          <button
            type="button"
            className={styles.btnPrimary}
            onClick={handleSave}
            disabled={isSaving}
          >
            {isSaving ? "Saving Settings..." : "Save Milestone Settings"}
          </button>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem", marginTop: "1rem" }}>
        {/* 1. Sequential Progression State Machine Gating */}
        <div
          style={{
            background: "#ffffff",
            border: "1px solid #ece6dd",
            borderRadius: "12px",
            padding: "1.25rem",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "1.5rem",
            boxShadow: "0 1px 3px rgba(0,0,0,0.02)",
          }}
        >
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <span style={{ fontSize: "1.1rem" }}>🔒</span>
              <strong style={{ fontSize: "1rem", color: "#14110f" }}>
                Enforce Sequential Stage Gating
              </strong>
              <span
                style={{
                  fontSize: "0.7rem",
                  fontWeight: 700,
                  padding: "2px 8px",
                  borderRadius: "12px",
                  background: sequentialProgressionEnabled ? "#fef3c7" : "#f3f4f6",
                  color: sequentialProgressionEnabled ? "#92400e" : "#6b7280",
                }}
              >
                {sequentialProgressionEnabled ? "Strict Sequential" : "Flexible Completion"}
              </span>
            </div>
            <p style={{ margin: "0.35rem 0 0", fontSize: "0.85rem", color: "#78716a", maxWidth: "680px" }}>
              When enabled, each stage unlocks strictly after the previous stage is satisfied (Curriculum &rarr; Exam &rarr; Attendance &rarr; 1-on-1 Coaching &rarr; Mission Statement). When disabled, enrolled learners can complete milestones in any order.
            </p>
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={sequentialProgressionEnabled}
            style={toggleStyle(sequentialProgressionEnabled)}
            onClick={() => setSequentialProgressionEnabled(!sequentialProgressionEnabled)}
            title="Toggle sequential stage progression"
          >
            <span style={toggleKnobStyle(sequentialProgressionEnabled)} />
          </button>
        </div>

        {/* 2. Final Comprehensive Exam / Assessment */}
        <div
          style={{
            background: "#ffffff",
            border: "1px solid #ece6dd",
            borderRadius: "12px",
            padding: "1.25rem",
            boxShadow: "0 1px 3px rgba(0,0,0,0.02)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem" }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <span style={{ fontSize: "1.1rem" }}>📝</span>
                <strong style={{ fontSize: "1rem", color: "#14110f" }}>
                  Final Comprehensive Assessment (Exam)
                </strong>
                <span
                  style={{
                    fontSize: "0.7rem",
                    fontWeight: 700,
                    padding: "2px 8px",
                    borderRadius: "12px",
                    background: requireExam ? "#dcfce7" : "#f3f4f6",
                    color: requireExam ? "#166534" : "#6b7280",
                  }}
                >
                  {requireExam ? "Required" : "Optional / Disabled"}
                </span>
              </div>
              <p style={{ margin: "0.35rem 0 0", fontSize: "0.85rem", color: "#78716a", maxWidth: "680px" }}>
                Requires learners to pass the randomized final assessment pulled from the visual question bank before graduating.
              </p>
            </div>

            <button
              type="button"
              role="switch"
              aria-checked={requireExam}
              style={toggleStyle(requireExam)}
              onClick={() => setRequireExam(!requireExam)}
              title="Toggle final exam requirement"
            >
              <span style={toggleKnobStyle(requireExam)} />
            </button>
          </div>

          {requireExam && (
            <div style={{ marginTop: "1rem", paddingTop: "1rem", borderTop: "1px solid #f5ece1", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "0.75rem" }}>
              <span style={{ fontSize: "0.85rem", color: "#78716a" }}>
                Manage randomized pool sampling, passing marks, time limits, and question banks:
              </span>
              <button
                type="button"
                className={styles.btnSecondary}
                onClick={() => onNavigateTab("FINAL_EXAM")}
                style={{ fontSize: "0.85rem", padding: "0.4rem 0.85rem" }}
              >
                Configure Final Exam &amp; Pool &rarr;
              </button>
            </div>
          )}
        </div>

        {/* 3. 1-on-1 Coaching Session (Calling) */}
        <div
          style={{
            background: "#ffffff",
            border: "1px solid #ece6dd",
            borderRadius: "12px",
            padding: "1.25rem",
            boxShadow: "0 1px 3px rgba(0,0,0,0.02)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem" }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <span style={{ fontSize: "1.1rem" }}>📞</span>
                <strong style={{ fontSize: "1rem", color: "#14110f" }}>
                  1-on-1 Coaching Session (Calling)
                </strong>
                <span
                  style={{
                    fontSize: "0.7rem",
                    fontWeight: 700,
                    padding: "2px 8px",
                    borderRadius: "12px",
                    background: requireCoaching ? "#dcfce7" : "#f3f4f6",
                    color: requireCoaching ? "#166534" : "#6b7280",
                  }}
                >
                  {requireCoaching ? "Required" : "Optional / Disabled"}
                </span>
              </div>
              <p style={{ margin: "0.35rem 0 0", fontSize: "0.85rem", color: "#78716a", maxWidth: "680px" }}>
                Learners must schedule and complete a 1-on-1 video coaching or discovery call with Roweena or an assigned trainer before graduation.
              </p>
            </div>

            <button
              type="button"
              role="switch"
              aria-checked={requireCoaching}
              style={toggleStyle(requireCoaching)}
              onClick={() => setRequireCoaching(!requireCoaching)}
              title="Toggle 1-on-1 coaching requirement"
            >
              <span style={toggleKnobStyle(requireCoaching)} />
            </button>
          </div>

          <div style={{ marginTop: "1rem", paddingTop: "1rem", borderTop: "1px solid #f5ece1", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "0.75rem" }}>
            <span style={{ fontSize: "0.85rem", color: "#78716a" }}>
              Staff &amp; coach availability slots, Zoom integration, and meeting requests queue:
            </span>
            <Link
              href="/meetings"
              className={styles.btnSecondary}
              style={{ fontSize: "0.85rem", padding: "0.4rem 0.85rem", textDecoration: "none" }}
            >
              Manage 1-on-1 Calendar &amp; Requests &rarr;
            </Link>
          </div>
        </div>

        {/* 4. Hybrid Attendance & Live Classes */}
        <div
          style={{
            background: "#ffffff",
            border: "1px solid #ece6dd",
            borderRadius: "12px",
            padding: "1.25rem",
            boxShadow: "0 1px 3px rgba(0,0,0,0.02)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem" }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <span style={{ fontSize: "1.1rem" }}>🗓️</span>
                <strong style={{ fontSize: "1rem", color: "#14110f" }}>
                  Workshop &amp; Batch Attendance
                </strong>
                <span
                  style={{
                    fontSize: "0.7rem",
                    fontWeight: 700,
                    padding: "2px 8px",
                    borderRadius: "12px",
                    background: attendanceRequired ? "#dcfce7" : "#f3f4f6",
                    color: attendanceRequired ? "#166534" : "#6b7280",
                  }}
                >
                  {attendanceRequired ? "Required" : "Optional / Disabled"}
                </span>
              </div>
              <p style={{ margin: "0.35rem 0 0", fontSize: "0.85rem", color: "#78716a", maxWidth: "680px" }}>
                Calculates attendance compliance across live Zoom classes (&ge;50% duration) and verified session recording re-watches.
              </p>
            </div>

            <button
              type="button"
              role="switch"
              aria-checked={attendanceRequired}
              style={toggleStyle(attendanceRequired)}
              onClick={() => setAttendanceRequired(!attendanceRequired)}
              title="Toggle attendance requirement"
            >
              <span style={toggleKnobStyle(attendanceRequired)} />
            </button>
          </div>

          {attendanceRequired && (
            <div style={{ marginTop: "1rem", paddingTop: "1rem", borderTop: "1px solid #f5ece1", display: "flex", alignItems: "center", gap: "1.5rem", flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <label style={{ fontSize: "0.85rem", fontWeight: 600, color: "#14110f" }}>
                  Minimum Attendance Threshold:
                </label>
                <div style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
                  <input
                    type="number"
                    min={10}
                    max={100}
                    step={5}
                    value={attendanceThreshold}
                    onChange={(e) => setAttendanceThreshold(Number(e.target.value))}
                    className={styles.textInput}
                    style={{ width: "80px", padding: "0.3rem 0.5rem", textAlign: "center" }}
                  />
                  <span style={{ fontSize: "0.9rem", fontWeight: 700, color: "#78716a" }}>%</span>
                </div>
              </div>
              <span style={{ fontSize: "0.8rem", color: "#78716a" }}>
                (Default: 80%. Learners falling below this threshold will be flagged as attendance non-compliant).
              </span>
            </div>
          )}
        </div>

        {/* 5. Mission Statement (Capstone Project) */}
        <div
          style={{
            background: "#ffffff",
            border: "1px solid #ece6dd",
            borderRadius: "12px",
            padding: "1.25rem",
            boxShadow: "0 1px 3px rgba(0,0,0,0.02)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem" }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <span style={{ fontSize: "1.1rem" }}>⭐</span>
                <strong style={{ fontSize: "1rem", color: "#14110f" }}>
                  Mission Statement (Capstone Submission)
                </strong>
                <span
                  style={{
                    fontSize: "0.7rem",
                    fontWeight: 700,
                    padding: "2px 8px",
                    borderRadius: "12px",
                    background: requireMissionStatement ? "#dcfce7" : "#f3f4f6",
                    color: requireMissionStatement ? "#166534" : "#6b7280",
                  }}
                >
                  {requireMissionStatement ? "Required" : "Optional / Disabled"}
                </span>
              </div>
              <p style={{ margin: "0.35rem 0 0", fontSize: "0.85rem", color: "#78716a", maxWidth: "680px" }}>
                Requires learners to draft and upload their personal handwritten or digital mission statement for instructor review and approval.
              </p>
            </div>

            <button
              type="button"
              role="switch"
              aria-checked={requireMissionStatement}
              style={toggleStyle(requireMissionStatement)}
              onClick={() => setRequireMissionStatement(!requireMissionStatement)}
              title="Toggle mission statement requirement"
            >
              <span style={toggleKnobStyle(requireMissionStatement)} />
            </button>
          </div>

          <div style={{ marginTop: "1rem", paddingTop: "1rem", borderTop: "1px solid #f5ece1", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "0.75rem" }}>
            <span style={{ fontSize: "0.85rem", color: "#78716a" }}>
              Staff review queue for approving or requesting revisions on submitted mission statements:
            </span>
            <Link
              href="/approvals"
              className={styles.btnSecondary}
              style={{ fontSize: "0.85rem", padding: "0.4rem 0.85rem", textDecoration: "none" }}
            >
              View Approvals Queue &rarr;
            </Link>
          </div>
        </div>

        {/* 6. Official Certificate of Completion */}
        <div
          style={{
            background: "#ffffff",
            border: "1px solid #ece6dd",
            borderRadius: "12px",
            padding: "1.25rem",
            boxShadow: "0 1px 3px rgba(0,0,0,0.02)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem" }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <span style={{ fontSize: "1.1rem" }}>🎓</span>
                <strong style={{ fontSize: "1rem", color: "#14110f" }}>
                  Issue Official Certificate of Completion
                </strong>
                <span
                  style={{
                    fontSize: "0.7rem",
                    fontWeight: 700,
                    padding: "2px 8px",
                    borderRadius: "12px",
                    background: hasCertificate ? "#dcfce7" : "#f3f4f6",
                    color: hasCertificate ? "#166534" : "#6b7280",
                  }}
                >
                  {hasCertificate ? "Enabled" : "Disabled"}
                </span>
              </div>
              <p style={{ margin: "0.35rem 0 0", fontSize: "0.85rem", color: "#78716a", maxWidth: "680px" }}>
                When all required milestones above are satisfied, an official cryptographically verifiable completion certificate with QR code is generated.
              </p>
            </div>

            <button
              type="button"
              role="switch"
              aria-checked={hasCertificate}
              style={toggleStyle(hasCertificate)}
              onClick={() => setHasCertificate(!hasCertificate)}
              title="Toggle certificate issuance"
            >
              <span style={toggleKnobStyle(hasCertificate)} />
            </button>
          </div>

          {hasCertificate && (
            <div style={{ marginTop: "1rem", paddingTop: "1rem", borderTop: "1px solid #f5ece1", display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
              <label style={{ fontSize: "0.85rem", fontWeight: 600, color: "#14110f" }}>
                Certificate Template Name:
              </label>
              <input
                type="text"
                value={certificateTemplate}
                onChange={(e) => setCertificateTemplate(e.target.value)}
                className={styles.textInput}
                style={{ maxWidth: "340px", padding: "0.35rem 0.65rem" }}
                placeholder="e.g. Master Practitioner Certificate"
              />
            </div>
          )}
        </div>
      </div>

      {/* Bottom Save Action */}
      <div style={{ marginTop: "2rem", display: "flex", justifyContent: "flex-end", gap: "1rem" }}>
        <button
          type="button"
          className={styles.btnPrimary}
          onClick={handleSave}
          disabled={isSaving}
        >
          {isSaving ? "Saving Settings..." : "Save Milestone Settings"}
        </button>
      </div>
    </section>
  );
}
