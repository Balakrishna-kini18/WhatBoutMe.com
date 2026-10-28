"use client";

import React, { useEffect, useState, useRef } from "react";
import { API_URL } from "../../../lib/api";
import { StepIcons } from "./StepIcons";
import styles from "../step.module.css";

interface PdfViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  documentId: string;
  title: string;
  mediaUrl?: string | null;
  downloadUrl?: string | null;
  isRead?: boolean;
  onMarkAsRead?: (documentId: string) => void;
  onNextSection?: (documentId: string) => void;
}

export default function PdfViewerModal({
  isOpen,
  onClose,
  documentId,
  title,
  mediaUrl,
  downloadUrl,
  isRead = false,
  onMarkAsRead,
  onNextSection,
}: PdfViewerModalProps) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const activeBlobRef = useRef<string | null>(null);

  // Clean up blob URL helper
  const cleanupBlob = () => {
    if (activeBlobRef.current) {
      URL.revokeObjectURL(activeBlobRef.current);
      activeBlobRef.current = null;
    }
  };

  // Automatically mark as read when learner opens and views the document
  useEffect(() => {
    if (isOpen && documentId && onMarkAsRead) {
      const timer = setTimeout(() => {
        onMarkAsRead(documentId);
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [isOpen, documentId, onMarkAsRead]);

  useEffect(() => {
    if (!isOpen || !documentId) {
      setBlobUrl(null);
      cleanupBlob();
      return;
    }

    let isMounted = true;
    setLoading(true);
    setError(null);

    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    const streamUrl = `${API_URL}/media/document/${encodeURIComponent(documentId)}${
      token ? `?token=${encodeURIComponent(token)}` : ""
    }`;

    // Fetch PDF securely with auth headers and create an uncorrupted blob URL for the iframe
    const fetchPdf = async () => {
      try {
        const headers: Record<string, string> = {
          Accept: "application/pdf",
        };
        if (token) {
          headers["Authorization"] = `Bearer ${token}`;
        }

        const rawFetch =
          typeof window !== "undefined" && (window as any).__rawOriginalFetch
            ? (window as any).__rawOriginalFetch
            : fetch;

        const res = await rawFetch(streamUrl, {
          method: "GET",
          headers,
        });

        if (!res.ok) {
          throw new Error(`Failed to load document (${res.status})`);
        }

        const blob = await res.blob();
        if (!isMounted) return;

        // Force application/pdf blob type so browser viewer recognizes it
        const pdfBlob = new Blob([blob], { type: "application/pdf" });
        const objectUrl = URL.createObjectURL(pdfBlob);

        // Safely rotate to new blob URL
        cleanupBlob();
        activeBlobRef.current = objectUrl;
        setBlobUrl(objectUrl);
        setLoading(false);
      } catch (err: any) {
        if (!isMounted) return;
        console.warn("Direct blob load failed, falling back to direct stream URL:", err);
        // Fallback to direct streaming URL with query token
        setBlobUrl(streamUrl);
        setLoading(false);
      }
    };

    fetchPdf();

    // Close on Escape key
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      isMounted = false;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, documentId]);

  // Clean up blob only when the modal is closed or unmounted
  useEffect(() => {
    if (!isOpen) {
      cleanupBlob();
      setBlobUrl(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
  const directStreamUrl = `${API_URL}/media/document/${encodeURIComponent(documentId)}${
    token ? `?token=${encodeURIComponent(token)}` : ""
  }`;
  const effectiveDownloadUrl = directStreamUrl;
  const viewInNewTabUrl = directStreamUrl;

  return (
    <div
      className={styles.pdfModalBackdrop}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
      role="dialog"
      aria-modal="true"
      aria-label={`PDF Viewer - ${title}`}
    >
      <div
        className={`${styles.pdfModalContainer} ${
          isFullscreen ? styles.pdfModalFullscreen : ""
        }`}
      >
        {/* Modal Header */}
        <div className={styles.pdfModalHeader}>
          <div className={styles.pdfModalHeaderLeft}>
            <div className={styles.pdfHeaderBadge}>
              <StepIcons.FilePdf size={18} />
              <span>PDF</span>
            </div>
            {isRead && (
              <span
                style={{
                  background: "#dcfce7",
                  color: "#15803d",
                  border: "1px solid #bbf7d0",
                  padding: "3px 8px",
                  borderRadius: 6,
                  fontSize: "0.75rem",
                  fontWeight: 700,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                ✓ Read
              </span>
            )}
            <div className={styles.pdfModalTitleGroup}>
              <h3 className={styles.pdfModalTitle}>{title}</h3>
              <span className={styles.pdfModalSub}>In-Browser Document Reader</span>
            </div>
          </div>

          <div className={styles.pdfModalActions}>
            {/* Mark as Read & Next Section */}
            <button
              type="button"
              onClick={() => {
                if (onNextSection) {
                  onNextSection(documentId);
                } else if (onMarkAsRead) {
                  onMarkAsRead(documentId);
                  onClose();
                } else {
                  onClose();
                }
              }}
              className={styles.pdfNextSectionBtn}
              title="Mark document as read and go to next section"
            >
              <span>{isRead ? "Next Section →" : "✓ Mark as Read & Next Section →"}</span>
            </button>

            {/* Open in New Browser Tab */}
            <a
              href={viewInNewTabUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.pdfActionBtn}
              title="Open PDF in a new browser tab"
            >
              <StepIcons.ExternalLink size={14} />
              <span>Open in New Tab</span>
            </a>

            {/* Download PDF button */}
            <a
              href={effectiveDownloadUrl}
              download={`${title}.pdf`}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.pdfActionBtn}
              title="Download PDF to your computer"
            >
              <StepIcons.Download size={14} />
              <span>Download</span>
            </a>

            {/* Fullscreen Toggle */}
            <button
              type="button"
              onClick={() => setIsFullscreen(!isFullscreen)}
              className={styles.pdfActionBtnIcon}
              title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
              aria-label={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
            >
              {isFullscreen ? <StepIcons.Minimize size={16} /> : <StepIcons.Maximize size={16} />}
            </button>

            {/* Close Button */}
            <button
              type="button"
              onClick={onClose}
              className={styles.pdfCloseBtn}
              title="Close viewer (Esc)"
              aria-label="Close viewer"
            >
              <StepIcons.Close size={18} />
            </button>
          </div>
        </div>

        {/* Modal Body / Viewer Frame */}
        <div className={styles.pdfModalBody}>
          {loading && (
            <div className={styles.pdfLoadingState}>
              <div className={styles.pdfLoadingSpinner} />
              <p>Loading document in browser...</p>
            </div>
          )}

          {error && (
            <div className={styles.pdfErrorState}>
              <p>{error}</p>
              <a
                href={effectiveDownloadUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.btnPrimaryView}
              >
                Download Document Directly
              </a>
            </div>
          )}

          {blobUrl && !error && (
            <iframe
              src={blobUrl}
              title={title}
              className={styles.pdfFrame}
            />
          )}
        </div>
      </div>
    </div>
  );
}
