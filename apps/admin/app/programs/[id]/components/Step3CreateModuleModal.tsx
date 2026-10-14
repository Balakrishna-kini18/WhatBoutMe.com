"use client";

import React, { useState } from "react";
import styles from "../curriculum.module.css";

interface Step3CreateModuleModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultSequence: number;
  onCreateModule: (data: { title: string; description: string; sequence: number }) => Promise<void>;
  isCreating: boolean;
}

export default function Step3CreateModuleModal({
  isOpen,
  onClose,
  defaultSequence,
  onCreateModule,
  isCreating,
}: Step3CreateModuleModalProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [sequence, setSequence] = useState<number>(defaultSequence);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError("Module title is required.");
      return;
    }
    setError(null);

    await onCreateModule({
      title: title.trim(),
      description: description.trim(),
      sequence: defaultSequence,
    });
  };

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h3 className={styles.modalTitle}>Create New Module</h3>
          <button
            type="button"
            className={styles.modalCloseBtn}
            onClick={onClose}
            title="Close (Esc)"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className={styles.modalBody}>
            {error && (
              <div
                style={{
                  background: "#fee2e2",
                  color: "#991b1b",
                  padding: "8px 12px",
                  borderRadius: 8,
                  fontSize: "0.85rem",
                  marginBottom: "1rem",
                }}
              >
                {error}
              </div>
            )}

            <div className={styles.formGroup}>
              <label className={styles.formLabel}>
                Module Title <span style={{ color: "#dc2626" }}>*</span>
              </label>
              <input
                type="text"
                required
                autoFocus
                placeholder="e.g. Module 1: Introduction to Web Development"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className={styles.formInput}
              />
            </div>

            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Module Description</label>
              <textarea
                rows={3}
                placeholder="What students will learn in this module..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className={styles.formTextarea}
              />
            </div>

            <div className={styles.formGroup} style={{ marginBottom: 0 }}>
              <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                This module will be automatically positioned as <strong>Module #{defaultSequence}</strong> in the curriculum sequence.
              </p>
            </div>
          </div>

          <div className={styles.modalFooter}>
            <button
              type="button"
              className={styles.secondaryActionBtn}
              onClick={onClose}
              disabled={isCreating}
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={isCreating}
              className={styles.btnPrimary}
              style={{ padding: "0.6rem 1.4rem", fontSize: "0.88rem" }}
            >
              {isCreating ? "Creating..." : "Create Module"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
