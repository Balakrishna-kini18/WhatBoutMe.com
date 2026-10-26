"use client";

import React, { useState, useEffect, useCallback } from "react";
import styles from "../curriculum.module.css";
import {
  API_URL,
  cachedFetch,
  fetchExamConfig,
  createExam,
  updateExam,
  publishExam,
  ExamConfig,
} from "../../../lib/api";
import { ConfirmDialog, useToast, StatusBadge, CustomSelect } from "../../../components";

interface FinalExamPanelProps {
  programId: string;
  programTitle?: string;
}

export default function FinalExamPanel({ programId, programTitle }: FinalExamPanelProps) {
  const toast = useToast();

  const [exam, setExam] = useState<ExamConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [activePoolCount, setActivePoolCount] = useState<number>(0);
  const [confirmPublishOpen, setConfirmPublishOpen] = useState(false);

  // Form Fields
  const [title, setTitle] = useState("Final Comprehensive Assessment");
  const [description, setDescription] = useState("");
  const [questionCount, setQuestionCount] = useState<number>(50);
  const [passMark, setPassMark] = useState<number>(75);
  const [timeLimitMin, setTimeLimitMin] = useState<number>(90);
  const [maxAttempts, setMaxAttempts] = useState<number>(3);
  const [cooldownHours, setCooldownHours] = useState<number>(24);
  const [shuffleQuestions, setShuffleQuestions] = useState<boolean>(true);
  const [retryGuidance, setRetryGuidance] = useState<string>("");

  // Fetch Exam Config and Available Question Pool
  const loadExamAndPool = useCallback(async () => {
    setIsLoading(true);
    try {
      const [examData, questionsRes] = await Promise.all([
        fetchExamConfig(programId).catch(() => null),
        cachedFetch(`${API_URL}/questions?programId=${programId}`, { skipCache: true }).catch(() => null),
      ]);

      if (examData) {
        setExam(examData);
        setTitle(examData.title || "Final Comprehensive Assessment");
        setDescription(examData.description || "");
        setQuestionCount(examData.questionCount || 50);
        setPassMark(examData.passMark || 75);
        setTimeLimitMin(examData.timeLimitMin || 90);
        setMaxAttempts(examData.maxAttempts || 3);
        setCooldownHours(examData.cooldownHours ?? 24);
        setShuffleQuestions(examData.shuffleQuestions ?? true);
        setRetryGuidance(examData.retryGuidance || "");
      }

      if (questionsRes && questionsRes.ok) {
        const qList = await questionsRes.json();
        setActivePoolCount(Array.isArray(qList) ? qList.length : 0);
      }
    } catch (err: any) {
      console.warn("Failed to load exam data:", err);
    } finally {
      setIsLoading(false);
    }
  }, [programId]);

  useEffect(() => {
    loadExamAndPool();
  }, [loadExamAndPool]);

  // Save / Update Exam Configuration
  const handleSave = async () => {
    setIsSaving(true);
    try {
      if (exam) {
        const updated = await updateExam(exam.id, {
          title,
          description,
          questionCount,
          passMark,
          timeLimitMin,
          maxAttempts,
          cooldownHours,
          shuffleQuestions,
          retryGuidance,
        });
        setExam(updated);
        toast.success("Final Exam settings saved successfully.");
      } else {
        const created = await createExam({
          programId,
          title,
          description,
          questionCount,
          passMark,
          timeLimitMin,
          maxAttempts,
          cooldownHours,
          shuffleQuestions,
          retryGuidance,
        });
        setExam(created);
        toast.success("Final Exam created successfully.");
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to save exam settings.");
    } finally {
      setIsSaving(false);
    }
  };

  // Publish Exam (Validates Pool Size >= questionCount)
  const handlePublishConfirm = async () => {
    if (!exam) return;
    setIsPublishing(true);
    try {
      const published = await publishExam(exam.id);
      setExam(published);
      toast.success("Final Exam published! Learners who complete all modules can now take it.");
      setConfirmPublishOpen(false);
    } catch (err: any) {
      toast.error(err.message || "Failed to publish exam.");
    } finally {
      setIsPublishing(false);
    }
  };

  const isPoolSufficient = activePoolCount >= questionCount;

  if (isLoading) {
    return (
      <section className={styles.cardSurface} style={{ padding: "3rem", textAlign: "center" }}>
        <p style={{ color: "#78716a" }}>Loading Final Exam configuration...</p>
      </section>
    );
  }

  return (
    <section className={styles.cardSurface}>
      {/* Header Area */}
      <div className={styles.cardHeaderArea} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "1rem" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.5rem" }}>
            <h2 className={styles.stepTitle} style={{ margin: 0 }}>Final Comprehensive Assessment</h2>
            <StatusBadge status={exam?.status || "DRAFT"} />
          </div>
          <p className={styles.stepSubtitle} style={{ margin: 0 }}>
            Configure the Stage 2 capstone examination for {programTitle || "this curriculum"}. Questions are dynamically sampled across program question banks using Fisher-Yates randomization.
          </p>
        </div>

        <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
          <button
            type="button"
            className={styles.secondaryBtn}
            onClick={handleSave}
            disabled={isSaving}
          >
            {isSaving ? "Saving..." : "Save Settings"}
          </button>

          {exam && exam.status !== "PUBLISHED" && (
            <button
              type="button"
              className={styles.primaryBtn}
              onClick={() => setConfirmPublishOpen(true)}
              disabled={isPublishing || !isPoolSufficient}
              title={!isPoolSufficient ? `Cannot publish: Pool has ${activePoolCount} questions, but requires ${questionCount}` : "Publish Exam"}
            >
              {isPublishing ? "Publishing..." : "Publish Exam"}
            </button>
          )}
        </div>
      </div>

      {/* Health Check Pool Banner */}
      <div
        style={{
          marginTop: "1.5rem",
          padding: "1rem 1.25rem",
          borderRadius: "8px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          backgroundColor: isPoolSufficient ? "rgba(16, 185, 129, 0.08)" : "rgba(239, 68, 68, 0.08)",
          border: `1px solid ${isPoolSufficient ? "rgba(16, 185, 129, 0.3)" : "rgba(239, 68, 68, 0.3)"}`,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <span style={{ fontSize: "1.25rem" }}>{isPoolSufficient ? "✓" : "⚠️"}</span>
          <div>
            <strong style={{ color: isPoolSufficient ? "#065f46" : "#991b1b" }}>
              {isPoolSufficient ? "Question Pool Validated" : "Insufficient Question Pool"}
            </strong>
            <p style={{ margin: "0.2rem 0 0", fontSize: "0.85rem", color: isPoolSufficient ? "#047857" : "#b91c1c" }}>
              {activePoolCount} questions available across curriculum question banks. {questionCount} questions will be randomly sampled per learner attempt.
            </p>
          </div>
        </div>

        {!isPoolSufficient && (
          <span style={{ fontSize: "0.8rem", fontWeight: 600, color: "#b91c1c" }}>
            Needs {questionCount - activePoolCount} more questions to publish
          </span>
        )}
      </div>

      {/* Configuration Form */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1.5rem", marginTop: "2rem" }}>
        {/* Title */}
        <div className={styles.formGroup} style={{ gridColumn: "1 / -1" }}>
          <label className={styles.formLabel}>Exam Title</label>
          <input
            type="text"
            className={styles.textInput}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Master Practitioner Final Certification Exam"
          />
        </div>

        {/* Description */}
        <div className={styles.formGroup} style={{ gridColumn: "1 / -1" }}>
          <label className={styles.formLabel}>Description & Instructions for Learner</label>
          <textarea
            className={styles.textAreaInput}
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Explain instructions, time limits, and passing requirements displayed before the student begins..."
          />
        </div>

        {/* Question Count */}
        <div className={styles.formGroup}>
          <label className={styles.formLabel}>Questions per Attempt</label>
          <input
            type="number"
            min={5}
            max={100}
            className={styles.textInput}
            value={questionCount}
            onChange={(e) => setQuestionCount(Number(e.target.value))}
          />
          <small style={{ color: "#78716a", fontSize: "0.75rem", marginTop: "0.25rem", display: "block" }}>
            Default: 50 questions randomly chosen from bank.
          </small>
        </div>

        {/* Pass Mark */}
        <div className={styles.formGroup}>
          <label className={styles.formLabel}>Pass Mark (%)</label>
          <input
            type="number"
            min={50}
            max={100}
            className={styles.textInput}
            value={passMark}
            onChange={(e) => setPassMark(Number(e.target.value))}
          />
          <small style={{ color: "#78716a", fontSize: "0.75rem", marginTop: "0.25rem", display: "block" }}>
            Percentage required to pass and unlock Stage 3.
          </small>
        </div>

        {/* Time Limit */}
        <div className={styles.formGroup}>
          <label className={styles.formLabel}>Time Limit (Minutes)</label>
          <input
            type="number"
            min={10}
            max={300}
            className={styles.textInput}
            value={timeLimitMin}
            onChange={(e) => setTimeLimitMin(Number(e.target.value))}
          />
          <small style={{ color: "#78716a", fontSize: "0.75rem", marginTop: "0.25rem", display: "block" }}>
            Timed execution. Attempts auto-submit upon expiry.
          </small>
        </div>

        {/* Max Attempts */}
        <div className={styles.formGroup}>
          <label className={styles.formLabel}>Max Attempts</label>
          <input
            type="number"
            min={1}
            max={10}
            className={styles.textInput}
            value={maxAttempts}
            onChange={(e) => setMaxAttempts(Number(e.target.value))}
          />
          <small style={{ color: "#78716a", fontSize: "0.75rem", marginTop: "0.25rem", display: "block" }}>
            Maximum attempts allowed before requiring admin reset.
          </small>
        </div>

        {/* Cooldown Hours */}
        <div className={styles.formGroup}>
          <label className={styles.formLabel}>Cooldown Between Retries (Hours)</label>
          <input
            type="number"
            min={0}
            max={168}
            className={styles.textInput}
            value={cooldownHours}
            onChange={(e) => setCooldownHours(Number(e.target.value))}
          />
          <small style={{ color: "#78716a", fontSize: "0.75rem", marginTop: "0.25rem", display: "block" }}>
            Mandatory wait period after a failed attempt (default: 24h).
          </small>
        </div>

        {/* Shuffle Toggle */}
        <div className={styles.formGroup} style={{ display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <label className={styles.formLabel} style={{ marginBottom: "0.5rem" }}>Randomize Options</label>
          <label style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem", cursor: "pointer", fontSize: "0.9rem" }}>
            <input
              type="checkbox"
              checked={shuffleQuestions}
              onChange={(e) => setShuffleQuestions(e.target.checked)}
              style={{ width: "18px", height: "18px" }}
            />
            <span>Shuffle answer options for every attempt</span>
          </label>
        </div>

        {/* Retry Guidance */}
        <div className={styles.formGroup} style={{ gridColumn: "1 / -1" }}>
          <label className={styles.formLabel}>Retry Guidance & Weak-Area Guidance</label>
          <textarea
            className={styles.textAreaInput}
            rows={2}
            value={retryGuidance}
            onChange={(e) => setRetryGuidance(e.target.value)}
            placeholder="Advice shown to learners who do not pass on their first attempt..."
          />
        </div>
      </div>

      {/* Confirmation Modal */}
      <ConfirmDialog
        isOpen={confirmPublishOpen}
        title="Publish Final Assessment"
        description={
          <div>
            <p>
              Are you sure you want to publish this final exam? Once published, learners who complete all 11 curriculum steps and quizzes will be eligible to begin Stage 2.
            </p>
            <p style={{ marginTop: "0.5rem", fontSize: "0.85rem", color: "#78716a" }}>
              Active pool: <strong>{activePoolCount} questions</strong> (requires {questionCount}).
            </p>
          </div>
        }
        confirmText="Publish Assessment"
        onConfirm={handlePublishConfirm}
        onClose={() => setConfirmPublishOpen(false)}
      />
    </section>
  );
}
