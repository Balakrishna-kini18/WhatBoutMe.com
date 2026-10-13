import React from "react";
import styles from "./StatusBadge.module.css";

export type StatusTone =
  | "active"
  | "completed"
  | "pending"
  | "inactive"
  | "error"
  | "info"
  | "neutral"
  | "roleAdmin"
  | "roleManager"
  | "roleTeacher"
  | "roleUser";

export interface StatusBadgeProps {
  status?: string | null;
  tone?: StatusTone;
  className?: string;
  ariaLabel?: string;
}

function resolveTone(rawStatus: string): StatusTone {
  const normalized = rawStatus.trim().toUpperCase().replace(/[\s-]+/g, "_");
  if (normalized === "ACTIVE") return "active";
  if (
    normalized === "COMPLETED" ||
    normalized === "PASSED" ||
    normalized === "PAID" ||
    normalized === "CONVERTED"
  ) {
    return "completed";
  }
  if (
    normalized === "PENDING" ||
    normalized === "PENDING_PAYMENT" ||
    normalized === "PENDING_AGREEMENT" ||
    normalized === "SCHEDULED" ||
    normalized === "CONTACTED"
  ) {
    return "pending";
  }
  if (normalized === "WAITLIST") return "info";
  if (normalized === "INACTIVE") return "inactive";
  if (
    normalized === "FAILED" ||
    normalized === "CANCELLED" ||
    normalized === "REJECTED" ||
    normalized === "REVOKED" ||
    normalized === "CLOSED" ||
    normalized === "ERROR"
  ) {
    return "error";
  }
  if (
    normalized === "DRAFT" ||
    normalized === "ARCHIVED" ||
    normalized === "NEW"
  ) {
    return "neutral";
  }
  if (normalized === "ADMIN" || normalized === "SUPER_ADMIN") return "roleAdmin";
  if (normalized === "MANAGER") return "roleManager";
  if (normalized === "TEACHER") return "roleTeacher";
  if (normalized === "USER" || normalized === "LEARNER") return "roleUser";
  return "active";
}

function normalizeStatusLabel(rawStatus?: string | null): string {
  if (!rawStatus) return "ACTIVE";
  const trimmed = rawStatus.trim();
  if (trimmed.toUpperCase() === "ACTIVE") {
    return "ACTIVE";
  }
  return trimmed.replace(/_/g, " ").toUpperCase();
}

export function StatusBadge({
  status,
  tone,
  className,
  ariaLabel,
}: StatusBadgeProps) {
  const displayLabel = normalizeStatusLabel(status);
  const activeTone = tone || resolveTone(status || "ACTIVE");
  const toneClass = styles[activeTone] || styles.active;

  return (
    <span
      className={`${styles.statusBadge} ${toneClass}${
        className ? ` ${className}` : ""
      }`}
      aria-label={ariaLabel || displayLabel}
    >
      {displayLabel}
    </span>
  );
}

export default StatusBadge;
