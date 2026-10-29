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
  | "converted"
  | "diagnostic"
  | "comprehension"
  | "online"
  | "physical"
  | "inProgress"
  | "notStarted"
  | "locked"
  | "passed"
  | "failed"
  | "availableNext"
  | "optional"
  | "required"
  | "roleSuperAdmin"
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
  if (normalized === "ACTIVE" || normalized === "PUBLISHED") return "active";
  if (normalized === "CONVERTED") return "converted";
  if (normalized === "BEFORE_VIDEO" || normalized === "DIAGNOSTIC") return "diagnostic";
  if (normalized === "AFTER_VIDEO" || normalized === "COMPREHENSION") return "comprehension";
  if (normalized === "ONLINE" || normalized === "VIRTUAL") return "online";
  if (normalized === "PHYSICAL" || normalized === "IN_PERSON") return "physical";

  // Standardized Learner Status Labels
  if (normalized === "IN_PROGRESS" || normalized === "INPROGRESS") return "inProgress";
  if (normalized === "NOT_STARTED" || normalized === "NOTSTARTED") return "notStarted";
  if (normalized === "LOCKED") return "locked";
  if (normalized === "PASSED") return "passed";
  if (normalized === "FAILED") return "failed";
  if (normalized === "AVAILABLE_NEXT" || normalized === "AVAILABLENEXT") return "availableNext";
  if (normalized === "OPTIONAL") return "optional";
  if (normalized === "REQUIRED") return "required";

  if (
    normalized === "COMPLETED" ||
    normalized === "PAID" ||
    normalized === "SIGNED"
  ) {
    return "completed";
  }
  if (
    normalized === "PENDING" ||
    normalized === "PENDING_PAYMENT" ||
    normalized === "PENDING_AGREEMENT" ||
    normalized === "SCHEDULED" ||
    normalized === "CONTACTED" ||
    normalized === "DRAFT" ||
    normalized === "UPCOMING"
  ) {
    return "pending";
  }
  if (normalized === "WAITLIST") return "info";
  if (normalized === "INACTIVE" || normalized === "ARCHIVED" || normalized === "DISABLED") return "inactive";
  if (normalized === "SUSPENDED") return "error";
  if (
    normalized === "CANCELLED" ||
    normalized === "REJECTED" ||
    normalized === "REVOKED" ||
    normalized === "CLOSED" ||
    normalized === "ERROR"
  ) {
    return "error";
  }
  if (normalized === "NEW") {
    return "neutral";
  }
  if (normalized === "SUPER_ADMIN") return "roleSuperAdmin";
  if (normalized === "ADMIN") return "roleAdmin";
  if (normalized === "MANAGER") return "roleManager";
  if (normalized === "TEACHER") return "roleTeacher";
  if (normalized === "USER" || normalized === "LEARNER" || normalized.includes("USER") || normalized.includes("LEARNER")) return "roleUser";
  return "active";
}

function normalizeStatusLabel(rawStatus?: string | null): string {
  if (!rawStatus) return "Active";
  const trimmed = rawStatus.trim();
  const words = trimmed.replace(/[_-]+/g, " ").split(/\s+/);
  return words
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
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
