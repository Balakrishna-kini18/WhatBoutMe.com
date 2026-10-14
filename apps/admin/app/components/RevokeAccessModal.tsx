"use client";

import React, { useState, useEffect } from "react";
import { ConfirmDialog } from "./ConfirmDialog";
import { useToast } from "./Toast";
import styles from "./RevokeAccessModal.module.css";

export interface UserEnrolment {
  id: string;
  batchId: string | null;
  batchName: string | null;
  programTitle: string | null;
  status: string;
}

export interface RevokeUser {
  id: string;
  name: string;
  email: string;
  role: string;
  cohort?: string;
  batchId?: string | null;
  enrolmentId?: string | null;
  enrolments?: UserEnrolment[];
}

export interface RevokeAccessModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: RevokeUser | null;
  onSuccess: () => void;
}

export function RevokeAccessModal({
  isOpen,
  onClose,
  user,
  onSuccess,
}: RevokeAccessModalProps) {
  const { success: toastSuccess, error: toastError } = useToast();
  const [selectedEnrolmentId, setSelectedEnrolmentId] = useState<string>("");
  const [reason, setReason] = useState<string>("Administrative revocation");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  // Filter active enrolments
  const allEnrolments = user?.enrolments || [];
  const activeEnrolments = allEnrolments.filter(
    (e) => e.status !== "REVOKED" && e.status !== "COMPLETED"
  );

  useEffect(() => {
    if (isOpen && user) {
      setApiError(null);
      setReason("Administrative revocation");
      if (activeEnrolments.length > 0) {
        const preferred = activeEnrolments.find((e) => e.id === user.enrolmentId) || activeEnrolments[0];
        if (preferred) {
          setSelectedEnrolmentId(preferred.id);
        }
      } else if (user.enrolmentId) {
        setSelectedEnrolmentId(user.enrolmentId);
      } else {
        setSelectedEnrolmentId("");
      }
    }
  }, [isOpen, user]);

  if (!user) return null;

  const selectedEnrolment =
    allEnrolments.find((e) => e.id === selectedEnrolmentId) ||
    activeEnrolments[0] ||
    null;

  const initials = (user.name || user.email || "U")
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const handleRevoke = async () => {
    if (activeEnrolments.length === 0 && !selectedEnrolmentId) {
      setApiError("Learner has no active enrolments to revoke.");
      return;
    }

    setIsSubmitting(true);
    setApiError(null);

    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

      const res = await fetch(`${apiUrl}/users/${user.id}/revoke-access`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          enrolmentId: selectedEnrolmentId || undefined,
          reason: reason.trim() || "ADMIN_PORTAL_REVOCATION",
        }),
      });

      const data = await res.json().catch(() => null);

      if (res.ok) {
        const courseName = selectedEnrolment?.programTitle || "course";
        toastSuccess(
          data?.message || `Access to ${courseName} revoked. Learner account and records preserved.`,
          "Course Access Revoked"
        );
        onSuccess();
        onClose();
      } else {
        const rawMsg = data?.error?.message ?? data?.message ?? `Server returned status ${res.status}`;
        const messageText = Array.isArray(rawMsg) ? rawMsg.join(", ") : rawMsg;
        setApiError(messageText);
        toastError(messageText, "Revocation Failed");
      }
    } catch (err: any) {
      console.error("Failed to revoke access:", err);
      const networkMsg = "Network error: could not connect to server to revoke access.";
      setApiError(networkMsg);
      toastError(networkMsg, "Connection Error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const hasMultipleActive = activeEnrolments.length > 1;
  const hasNoActive = activeEnrolments.length === 0 && allEnrolments.length > 0;

  return (
    <ConfirmDialog
      isOpen={isOpen}
      onClose={onClose}
      onConfirm={handleRevoke}
      title="Revoke Course Access?"
      subtitle="Access control & cohort roster management"
      description="The learner will lose access to the selected course and will no longer appear as actively enrolled in that cohort. Their account, payment records, and learning history will be preserved."
      tone="danger"
      confirmText={isSubmitting ? "Revoking..." : "Revoke Access"}
      cancelText="Cancel"
      isLoading={isSubmitting}
      error={apiError}
      maxWidth="540px"
      callout={{
        tone: "success",
        text: "Account & records preserved: The learner's user account, login credentials, payment records, invoices, and certificates will remain intact. Only access to the selected course will be revoked.",
      }}
    >
      <div className={styles.contentContainer}>
        {/* Learner Info Card */}
        <div className={styles.learnerCard}>
          <div className={styles.learnerAvatar} aria-hidden="true">
            {initials}
          </div>
          <div className={styles.learnerMeta}>
            <p className={styles.learnerName}>{user.name || "Learner"}</p>
            <p className={styles.learnerEmail}>{user.email}</p>
          </div>
        </div>

        {/* Enrolment / Cohort Selection */}
        {hasNoActive && (
          <div className={styles.noEnrolmentAlert}>
            This learner does not have any active course enrolments to revoke.
          </div>
        )}

        {hasMultipleActive ? (
          <div className={styles.enrolmentSection}>
            <label htmlFor="enrolment-select" className={styles.sectionLabel}>
              Select Course / Cohort to Revoke:
            </label>
            <select
              id="enrolment-select"
              className={styles.enrolmentSelect}
              value={selectedEnrolmentId}
              onChange={(e) => setSelectedEnrolmentId(e.target.value)}
              disabled={isSubmitting}
            >
              {activeEnrolments.map((enr) => (
                <option key={enr.id} value={enr.id}>
                  {enr.programTitle || "Program"} — {enr.batchName || "Cohort"} ({enr.status})
                </option>
              ))}
            </select>
          </div>
        ) : selectedEnrolment ? (
          <div className={styles.enrolmentSection}>
            <span className={styles.sectionLabel}>Affected Course & Cohort:</span>
            <div className={styles.enrolmentInfoBox}>
              <div className={styles.enrolmentRow}>
                <span className={styles.enrolmentRowLabel}>Course / Program:</span>
                <span className={styles.enrolmentRowValue}>
                  {selectedEnrolment.programTitle || "Assigned Program"}
                </span>
              </div>
              <div className={styles.enrolmentRow}>
                <span className={styles.enrolmentRowLabel}>Cohort:</span>
                <span className={styles.enrolmentRowValue}>
                  {selectedEnrolment.batchName || user.cohort || "Assigned Cohort"}
                </span>
              </div>
            </div>
          </div>
        ) : null}

        {/* Revocation Reason */}
        <div className={styles.enrolmentSection}>
          <label htmlFor="revocation-reason" className={styles.sectionLabel}>
            Reason for Revocation (optional):
          </label>
          <input
            id="revocation-reason"
            type="text"
            className={styles.reasonInput}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g., Course withdrawal, payment default, administrative request"
            disabled={isSubmitting}
          />
        </div>
      </div>
    </ConfirmDialog>
  );
}
