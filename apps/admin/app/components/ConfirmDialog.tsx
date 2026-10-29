"use client";

import React, { FormEvent } from "react";
import { Modal } from "./Modal";
import styles from "./ConfirmDialog.module.css";

export interface DetailItem {
  label: string;
  value: React.ReactNode;
}

export interface CalloutConfig {
  tone?: "warning" | "info" | "success";
  text: string;
  icon?: React.ReactNode;
}

export interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void> | void;
  title: string;
  subtitle?: string;
  description?: React.ReactNode;
  tone?: "danger" | "warning" | "info";
  confirmText?: string;
  cancelText?: string;
  isLoading?: boolean;
  error?: string | null;
  itemDetails?: DetailItem[];
  callout?: CalloutConfig;
  children?: React.ReactNode;
  maxWidth?: string;
}

export function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  subtitle,
  description,
  tone = "danger",
  confirmText = "Confirm",
  cancelText = "Cancel",
  isLoading = false,
  error = null,
  itemDetails = [],
  callout,
  children,
  maxWidth = "520px",
}: ConfirmDialogProps) {
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (isLoading) return;
    await onConfirm();
  };

  const header = (
    <div className={styles.headerIconRow}>
      <div
        className={`${styles.iconBadge} ${
          tone === "danger"
            ? styles.iconBadgeDanger
            : tone === "warning"
            ? styles.iconBadgeWarning
            : styles.iconBadgeInfo
        }`}
        aria-hidden="true"
      >
        {tone === "danger" && (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        )}
        {tone === "warning" && (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        )}
        {tone === "info" && (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="16" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12.01" y2="8" />
          </svg>
        )}
      </div>
      <div className={styles.titleGroup}>
        <h2 className={styles.title}>{title}</h2>
        {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
      </div>
    </div>
  );

  const footer = (
    <div className={styles.footerActions}>
      <button
        type="button"
        className={styles.btnCancel}
        onClick={onClose}
        disabled={isLoading}
      >
        {cancelText}
      </button>
      <button
        type="submit"
        className={`${styles.btnConfirm} ${
          tone === "danger"
            ? styles.btnConfirmDanger
            : tone === "warning"
            ? styles.btnConfirmWarning
            : styles.btnConfirmInfo
        }`}
        disabled={isLoading}
      >
        {isLoading && (
          <svg className={styles.spinner} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
            <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
          </svg>
        )}
        <span>{confirmText}</span>
      </button>
    </div>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        if (!isLoading) onClose();
      }}
      title={header}
      maxWidth={maxWidth}
      footer={footer}
      onSubmit={handleSubmit}
      ariaLabel={title}
    >
      <div className={styles.dialogContent}>
        {error && (
          <div className={styles.errorBanner} role="alert">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span>{error}</span>
          </div>
        )}

        {description && <div className={styles.description}>{description}</div>}

        {itemDetails && itemDetails.length > 0 && (
          <div className={styles.detailsCard}>
            {itemDetails.map((detail, idx) => (
              <div key={idx} className={styles.detailRow}>
                <span className={styles.detailLabel}>{detail.label}</span>
                <span className={styles.detailValue}>{detail.value}</span>
              </div>
            ))}
          </div>
        )}

        {callout && (
          <div
            className={`${styles.calloutCard} ${
              callout.tone === "success"
                ? styles.calloutSuccess
                : callout.tone === "info"
                ? styles.calloutInfo
                : styles.calloutWarning
            }`}
          >
            {callout.icon ? (
              callout.icon
            ) : callout.tone === "success" ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                <polyline points="9 12 11 14 15 10" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="16" x2="12" y2="12" />
                <line x1="12" y1="8" x2="12.01" y2="8" />
              </svg>
            )}
            <span>{callout.text}</span>
          </div>
        )}

        {children}
      </div>
    </Modal>
  );
}
