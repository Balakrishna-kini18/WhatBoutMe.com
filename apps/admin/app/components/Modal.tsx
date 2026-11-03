"use client";

import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import styles from "./Modal.module.css";

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  maxWidth?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  ariaLabel?: string;
  onSubmit?: (e: React.FormEvent) => void;
  headerActions?: React.ReactNode;
  bodyStyle?: React.CSSProperties;
  containerStyle?: React.CSSProperties;
}

export function Modal({
  isOpen,
  onClose,
  title,
  subtitle,
  maxWidth = "620px",
  children,
  footer,
  ariaLabel,
  onSubmit,
  headerActions,
  bodyStyle,
  containerStyle,
}: ModalProps) {
  const [mounted, setMounted] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen || !mounted) return null;

  const headerContent = (
    <div className={styles.modalHeader}>
      <div className={styles.modalHeaderText}>
        <h2 className={styles.modalTitle}>{title}</h2>
        {subtitle && <p className={styles.modalSubtitle}>{subtitle}</p>}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
        {headerActions}
        <button
          type="button"
          className={styles.closeBtn}
          onClick={onClose}
          aria-label="Close dialog"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
    </div>
  );

  const bodyContent = <div className={styles.modalBody} style={bodyStyle}>{children}</div>;
  const footerContent = footer ? (
    <div className={styles.modalFooter}>{footer}</div>
  ) : null;

  return createPortal(
    <div
      className={styles.modalOverlay}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel || (typeof title === "string" ? title : "Dialog")}
    >
      <div
        className={styles.modalContainer}
        style={{ maxWidth, ...containerStyle }}
        onClick={(e) => e.stopPropagation()}
        ref={containerRef}
      >
        {headerContent}
        {onSubmit ? (
          <form onSubmit={onSubmit} className={styles.modalFormWrapper}>
            {bodyContent}
            {footerContent}
          </form>
        ) : (
          <>
            {bodyContent}
            {footerContent}
          </>
        )}
      </div>
    </div>,
    document.body
  );
}

export default Modal;
