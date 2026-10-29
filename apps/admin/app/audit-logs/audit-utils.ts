export interface AuditLogItem {
  id: string;
  actorId: string | null;
  actorName: string;
  actorEmail: string | null;
  actorRole: string;
  action: string;
  entity: string;
  entityId: string;
  targetLabel?: string;
  targetSubLabel?: string;
  summaryNote?: string;
  meta: Record<string, any> | null;
  ip: string | null;
  createdAt: string;
}

export const ACTION_FILTER_OPTIONS = [
  { value: "ALL", label: "All Actions" },
  { value: "LOGIN", label: "Login" },
  { value: "LOGOUT", label: "Logout" },
  { value: "USER_REGISTERED", label: "User Registered" },
  { value: "STAFF_USER_CREATED", label: "Staff User Created" },
  { value: "STEP_MANUAL_UNLOCKED", label: "Step Manual Unlock" },
  { value: "STEP_MANUAL_LOCKED", label: "Step Manual Lock" },
  { value: "STEP_UNLOCK_OVERRIDE", label: "Step Unlock Override" },
  { value: "STAGE_UNLOCK_OVERRIDE", label: "Stage Unlock Override" },
  { value: "STEP_OVERRIDE_RESET", label: "Step Override Reset" },
  { value: "QUIZ_ATTEMPTS_RESET", label: "Quiz Attempts Reset" },
  { value: "QUIZ_OVERRIDE", label: "Quiz Override" },
  { value: "EXAM_ATTEMPTS_RESET", label: "Exam Attempts Reset" },
  { value: "MISSION_STATEMENT_SUBMITTED", label: "Mission Statement Submitted" },
  { value: "MISSION_STATEMENT_APPROVED", label: "Mission Statement Approved" },
  { value: "MISSION_STATEMENT_REJECTED", label: "Mission Statement Rejected" },
  { value: "ONE_ON_ONE_REQUESTED", label: "1-on-1 Call Requested" },
  { value: "ONE_ON_ONE_APPROVED", label: "1-on-1 Call Approved" },
  { value: "ONE_ON_ONE_REJECTED", label: "1-on-1 Call Rejected" },
  { value: "ONE_ON_ONE_SCHEDULED", label: "1-on-1 Call Scheduled" },
  { value: "ONE_ON_ONE_COMPLETED", label: "1-on-1 Call Completed" },
  { value: "ONE_ON_ONE_RESCHEDULED", label: "1-on-1 Call Rescheduled" },
  { value: "CERTIFICATE_APPROVED", label: "Certificate Approved" },
  { value: "CERTIFICATE_REJECTED", label: "Certificate Rejected" },
  { value: "CERTIFICATE_REVOCATION", label: "Certificate Revoked" },
  { value: "ATTENDANCE_MARKED_MANUAL", label: "Attendance Marked" },
  { value: "ATTENDANCE_MANUAL_OVERRIDE", label: "Attendance Override" },
  { value: "ATTENDANCE_CORRECTED", label: "Attendance Corrected" },
  { value: "ATTENDANCE_RECONCILED", label: "Attendance Reconciled" },
  { value: "CREATE_CREDIT_NOTE", label: "Credit Note / Refund" },
  { value: "REFUND_ISSUED", label: "Refund Issued" },
  { value: "LEAD_CONVERT", label: "Lead Converted" },
  { value: "SESSION_CREATED", label: "Session Created" },
  { value: "SESSION_COMPLETED", label: "Session Completed" },
  { value: "SESSION_CANCELLED", label: "Session Cancelled" },
  { value: "SESSION_UPDATED", label: "Session Updated" },
  { value: "SESSION_DELETED", label: "Session Deleted" },
  { value: "ORAL_ASSESSMENT_GRADED", label: "Oral Assessment Graded" },
  { value: "AGREEMENT_SIGNED", label: "Agreement Signed" },
  { value: "CERTIFICATE_ISSUED", label: "Certificate Issued" },
  { value: "COUPON_CREATED", label: "Coupon Created" },
  { value: "COUPON_UPDATED", label: "Coupon Updated" },
  { value: "ENROLMENT_CREATED", label: "Enrolment Created" },
  { value: "ENROLMENT_CANCELLED", label: "Enrolment Cancelled" },
  { value: "USER_ROLE_CHANGED", label: "User Role Changed" },
  { value: "LEARNER_ACCESS_REVOKED", label: "Learner Access Revoked" },
  { value: "BATCH_TRANSFERRED", label: "Batch Transferred" },
  { value: "BATCH_CREATED", label: "Batch Created" },
  { value: "BATCH_MANAGER_ASSIGNED", label: "Batch Manager Assigned" },
  { value: "BATCH_STATUS_CHANGED", label: "Batch Status Changed" },
  { value: "PROGRAM_PUBLISHED", label: "Program Published" },
  { value: "PROGRAM_PRICING_UPDATED", label: "Program Pricing Updated" },
  { value: "UNUSUAL_LOGIN_DETECTED", label: "Security & Login Alert" },
  { value: "PASSWORD_RESET", label: "Password Reset" },
  { value: "NOTIFICATION_BROADCAST", label: "Announcement Broadcast" },
];

export const PERIOD_FILTER_OPTIONS = [
  { value: "ALL", label: "All Time" },
  { value: "TODAY", label: "Today" },
  { value: "YESTERDAY", label: "Yesterday" },
  { value: "LAST_7_DAYS", label: "Last 7 Days" },
  { value: "LAST_30_DAYS", label: "Last 30 Days" },
  { value: "THIS_MONTH", label: "This Month" },
  { value: "CUSTOM", label: "Custom Range" },
];

export function calculatePeriodDates(period: string): { startDate: string; endDate: string } {
  const now = new Date();
  const formatIso = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };

  const todayStr = formatIso(now);

  switch (period) {
    case "TODAY":
      return { startDate: todayStr, endDate: todayStr };
    case "YESTERDAY": {
      const yest = new Date(now);
      yest.setDate(yest.getDate() - 1);
      const yestStr = formatIso(yest);
      return { startDate: yestStr, endDate: yestStr };
    }
    case "LAST_7_DAYS": {
      const start = new Date(now);
      start.setDate(start.getDate() - 6);
      return { startDate: formatIso(start), endDate: todayStr };
    }
    case "LAST_30_DAYS": {
      const start = new Date(now);
      start.setDate(start.getDate() - 29);
      return { startDate: formatIso(start), endDate: todayStr };
    }
    case "THIS_MONTH": {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      return { startDate: formatIso(start), endDate: todayStr };
    }
    case "ALL":
    default:
      return { startDate: "", endDate: "" };
  }
}

/**
 * Resolves context-aware activity details and explanations for audit log entries.
 * Ensures that routine lifecycle actions (e.g., Login, Logout, Session Completed, Role Changes)
 * provide clear human-readable descriptions rather than blank values.
 */
export function getAuditDetails(log: AuditLogItem): string {
  if (log.summaryNote && typeof log.summaryNote === "string" && log.summaryNote.trim()) {
    return log.summaryNote.trim();
  }
  const meta = log.meta;

  // 1. Explicit reason or administrative explanation
  if (meta?.reason && typeof meta.reason === "string" && meta.reason.trim()) {
    return meta.reason.trim();
  }
  if (meta?.feedback && typeof meta.feedback === "string" && meta.feedback.trim()) {
    return meta.feedback.trim();
  }
  if (meta?.note && typeof meta.note === "string" && meta.note.trim()) {
    return meta.note.trim();
  }
  if (meta?.description && typeof meta.description === "string" && meta.description.trim()) {
    return meta.description.trim();
  }

  // 2. Title of the related object (e.g. Session Title or Course Title)
  if (meta?.title && typeof meta.title === "string" && meta.title.trim()) {
    const trimmedTitle = meta.title.trim();
    if (trimmedTitle.length <= 3) {
      return `Session: "${trimmedTitle}"`;
    }
    return trimmedTitle;
  }

  // 3. User & Role actions
  if (log.action === "USER_ROLE_CHANGED") {
    if (meta?.oldRole && meta?.newRole) {
      return `Role updated from ${meta.oldRole} to ${meta.newRole}`;
    }
    return "User role updated";
  }
  if (log.action === "STAFF_USER_CREATED") {
    return meta?.role ? `Created staff member (${meta.role})` : "Staff user created";
  }
  if (log.action === "USER_REGISTERED") {
    return meta?.email ? `New account registered (${meta.email})` : "New learner account registered";
  }
  if (log.action === "LEARNER_ACCESS_REVOKED") {
    return meta?.targetUserEmail ? `Access revoked for ${meta.targetUserEmail}` : "Learner access revoked";
  }
  if (log.action === "BATCH_TRANSFERRED") {
    return meta?.batchName ? `Transferred to batch ${meta.batchName}` : "Batch assignment transferred";
  }
  if (log.action === "BATCH_CREATED") {
    const name = meta?.batchName ? `"${meta.batchName}"` : "Batch";
    const cap = meta?.capacity ? ` (${meta.capacity} capacity)` : "";
    return `Created batch ${name}${cap}`;
  }
  if (log.action === "BATCH_MANAGER_ASSIGNED") {
    const mgr = meta?.newManagerName || (meta?.newManagerId ? `ID: ${meta.newManagerId}` : "Unassigned");
    const batch = meta?.batchName ? ` for "${meta.batchName}"` : "";
    return `Manager assigned${batch}: ${mgr}`;
  }
  if (log.action === "BATCH_STATUS_CHANGED") {
    const batch = meta?.batchName ? `"${meta.batchName}"` : "Batch";
    const status = meta?.newStatus || "updated";
    return `${batch} status transitioned to ${status}`;
  }
  if (log.action === "PROGRAM_PUBLISHED") {
    const title = meta?.programTitle ? `"${meta.programTitle}"` : "Program";
    return `${title} published to catalog`;
  }
  if (log.action === "PROGRAM_PRICING_UPDATED") {
    const title = meta?.programTitle ? `"${meta.programTitle}"` : "Program";
    const newPrice = meta?.newPricing?.price;
    const currency = meta?.newPricing?.currency || "USD";
    return newPrice !== undefined ? `${title} pricing updated: ${currency} ${newPrice}` : `${title} pricing updated`;
  }

  // 4. Authentication & Security events
  if (log.action === "LOGOUT") {
    return "User session signed out";
  }
  if (log.action === "LOGOUT_ALL" || log.action === "LOGOUT_ALL_SESSIONS") {
    return "All active user sessions signed out";
  }
  if (log.action === "LOGIN") {
    return "User signed in successfully";
  }
  if (log.action === "REVOKE_SESSION") {
    return "User session revoked";
  }
  if (log.action === "PASSWORD_RESET") {
    return "Password reset confirmed via token";
  }
  if (log.action === "UNUSUAL_LOGIN_DETECTED") {
    return meta?.alert || meta?.reason || "Unusual security / login event flagged";
  }

  // 5. Session events
  if (log.action === "SESSION_ACTIVATED") {
    return "Live session activated";
  }
  if (log.action === "SESSION_COMPLETED") {
    return "Live session concluded";
  }
  if (log.action === "SESSION_BOOKED") {
    return "1-to-1 discovery session booked";
  }
  if (log.action === "SESSION_CANCELLED") {
    return "Session cancelled";
  }
  if (log.action === "SESSION_CREATED") {
    return "Live class or session created";
  }
  if (log.action === "SESSION_UPDATED") {
    if (meta?.title) return `Updated session: "${meta.title}"`;
    if (log.targetLabel && log.targetLabel !== "Session") return `Updated session: ${log.targetLabel}`;
    return "Session schedule or details updated";
  }
  if (log.action === "SESSION_DELETED") {
    if (meta?.title) return `Deleted session: "${meta.title}"`;
    return "Session deleted";
  }

  // 6. Curriculum & Progress Overrides
  if (log.action === "STEP_MANUAL_UNLOCKED") {
    const stepLabel = meta?.stepSequence ? `Step ${meta.stepSequence}` : meta?.stepTitle || "Step";
    return `Manually unlocked ${stepLabel}`;
  }
  if (log.action === "STEP_MANUAL_LOCKED") {
    const stepLabel = meta?.stepSequence ? `Step ${meta.stepSequence}` : meta?.stepTitle || "Step";
    return `Manually re-locked ${stepLabel}`;
  }
  if (log.action === "STEP_UNLOCK_OVERRIDE") {
    return meta?.stepTitle ? `Step override: ${meta.stepTitle}` : "Step unlock override applied";
  }
  if (log.action === "STAGE_UNLOCK_OVERRIDE") {
    const stageName = meta?.stage ? formatMetaKey(String(meta.stage)) : "Stage";
    return meta?.reason ? `Stage override (${stageName}): ${meta.reason}` : `Stage unlock override applied (${stageName})`;
  }
  if (log.action === "STEP_OVERRIDE_RESET") {
    return "Step override reset to automatic";
  }
  if (log.action === "QUIZ_OVERRIDE") {
    return "Quiz assessment score override";
  }
  if (log.action === "QUIZ_ATTEMPTS_RESET") {
    return "Quiz attempt limit reset by instructor";
  }
  if (log.action === "EXAM_ATTEMPTS_RESET") {
    return "Final exam attempt limit reset by instructor";
  }
  if (log.action === "ORAL_ASSESSMENT_GRADED") {
    const score = meta?.overallScore !== undefined ? ` (${meta.overallScore}%)` : "";
    const passStatus = meta?.passed ? "Passed" : "Needs Retake";
    return `Oral assessment graded: ${passStatus}${score}`;
  }

  // 6b. Mission Statements & 1-on-1 Ro Sessions
  if (log.action === "MISSION_STATEMENT_SUBMITTED") {
    return meta?.fileName ? `Submitted mission statement: ${meta.fileName}` : "Mission statement document submitted";
  }
  if (log.action === "MISSION_STATEMENT_APPROVED") {
    return meta?.feedback ? `Mission statement approved: ${meta.feedback}` : "Mission statement reviewed and approved";
  }
  if (log.action === "MISSION_STATEMENT_REJECTED") {
    return meta?.feedback ? `Mission statement rejected: ${meta.feedback}` : "Mission statement rejected";
  }
  if (log.action === "ONE_ON_ONE_REQUESTED") {
    return "1-on-1 coaching call requested";
  }
  if (log.action === "ONE_ON_ONE_APPROVED") {
    return "1-on-1 coaching call scheduled & approved";
  }
  if (log.action === "ONE_ON_ONE_REJECTED") {
    return meta?.reason ? `1-on-1 call rejected: ${meta.reason}` : "1-on-1 call request rejected";
  }
  if (log.action === "ONE_ON_ONE_SCHEDULED") {
    return "1-on-1 call scheduled";
  }
  if (log.action === "ONE_ON_ONE_COMPLETED") {
    return "1-on-1 call completed";
  }
  if (log.action === "ONE_ON_ONE_RESCHEDULED") {
    return "1-on-1 call rescheduled";
  }

  // 7. Certificates & Invoices
  if (log.action === "CERTIFICATE_APPROVED") {
    return meta?.certificateCode ? `Certificate approved (${meta.certificateCode})` : "Certificate reviewed and approved";
  }
  if (log.action === "CERTIFICATE_ISSUED") {
    return meta?.certificateCode ? `Certificate issued (${meta.certificateCode})` : "Official certificate issued to learner";
  }
  if (log.action === "CERTIFICATE_REQUESTED") {
    return "Certificate issuance requested";
  }
  if (log.action === "CERTIFICATE_REJECTED") {
    return "Certificate application rejected";
  }
  if (log.action === "CERTIFICATE_REVOCATION" || log.action === "CERTIFICATE_REVOKED") {
    return "Issued certificate revoked";
  }
  if (log.action === "CREATE_CREDIT_NOTE") {
    return meta?.creditNoteNumber ? `Credit note #${meta.creditNoteNumber} issued` : "Credit note issued";
  }
  if (log.action === "REFUND_ISSUED") {
    return meta?.amount ? `Refund of ${meta.amount} ${meta.currency || "USD"} issued` : "Refund processed";
  }

  // 8. Agreements & Signatures
  if (log.action === "AGREEMENT_SIGNED") {
    return meta?.programTitle ? `Agreement signed for ${meta.programTitle}` : "Digital workshop agreement signed by learner";
  }
  if (log.action === "AGREEMENT_VERSION_PUBLISHED") {
    return meta?.version ? `Published agreement terms (${meta.version})` : "Workshop agreement terms published";
  }
  if (log.action === "PROFILE_SIGNATURE_UPDATED") {
    return "Learner saved e-signature to profile";
  }
  if (log.action === "AGREEMENT_TEMPLATE_CREATED") {
    return meta?.title ? `Agreement created: "${meta.title}"` : "Agreement template created";
  }

  // 9. Payment Testing & Billing
  if (log.action === "PAYMENT_TEST_SIMULATE_SUCCEEDED" || log.action === "PAYMENT_SUCCEEDED") {
    return meta?.amount ? `Test payment verified (${meta.amount} ${meta.currency || "USD"})` : "Test payment simulation verified successfully";
  }
  if (log.action === "PAYMENT_TEST_SIMULATE_FAILED" || log.action === "PAYMENT_FAILED") {
    return "Payment simulation failed";
  }

  // 10. Attendance Tracking
  if (log.action === "ATTENDANCE_MARKED_MANUAL") {
    return "Session attendance marked manually";
  }
  if (log.action === "ATTENDANCE_MANUAL_OVERRIDE") {
    return "Attendance status override applied";
  }
  if (log.action === "ATTENDANCE_CORRECTED") {
    return "Attendance record corrected";
  }
  if (log.action === "ATTENDANCE_RECONCILED") {
    return "Unmatched participant attendance reconciled";
  }
  if (log.action === "UNMATCHED_ATTENDANCE_DISMISSED") {
    return "Unmatched attendance entry dismissed";
  }

  // 11. Marketing & Leads
  if (log.action === "LEAD_CONVERT") {
    return "Prospect converted and checkout link sent";
  }
  if (log.action === "COUPON_CREATED") {
    return meta?.code ? `Created coupon: ${meta.code}` : "Marketing coupon created";
  }
  if (log.action === "COUPON_UPDATED") {
    return meta?.code ? `Updated coupon: ${meta.code}` : "Marketing coupon updated";
  }
  if (log.action === "COUPON_ARCHIVED") {
    return meta?.code ? `Archived coupon: ${meta.code}` : "Marketing coupon archived";
  }
  if (log.action === "ENROLMENT_CREATED") {
    return "Learner enrolled into program";
  }
  if (log.action === "ENROLMENT_STATUS_TRANSITIONED") {
    return meta?.newStatus ? `Enrolment transitioned to ${meta.newStatus}` : "Enrolment status updated";
  }
  if (log.action === "ENROLMENT_CANCELLED") {
    return "Enrolment cancelled";
  }
  if (log.action === "NOTIFICATION_BROADCAST") {
    return "Broadcast announcement sent";
  }
  if (meta?.programTitle && typeof meta.programTitle === "string" && meta.programTitle.trim()) {
    return `Course: ${meta.programTitle.trim()}`;
  }
  if (meta?.batchName && typeof meta.batchName === "string" && meta.batchName.trim()) {
    return `Batch: ${meta.batchName.trim()}`;
  }

  return "—";
}

/**
 * Concise, human-friendly action badges to prevent cell overflow on data tables.
 */
export const ACTION_SHORT_NAMES: Record<string, string> = {
  PAYMENT_TEST_SIMULATE_SUCCEEDED: "Payment Passed",
  PAYMENT_TEST_SIMULATE_FAILED: "Payment Failed",
  AGREEMENT_VERSION_PUBLISHED: "Agreement Published",
  PROFILE_SIGNATURE_UPDATED: "Signature Updated",
  AGREEMENT_SIGNED: "Agreement Signed",
  AGREEMENT_TEMPLATE_CREATED: "Agreement Created",
  STEP_MANUAL_UNLOCKED: "Step Unlocked",
  STEP_MANUAL_LOCKED: "Step Locked",
  STEP_UNLOCK_OVERRIDE: "Step Override",
  STAGE_UNLOCK_OVERRIDE: "Stage Override",
  STEP_OVERRIDE_RESET: "Override Reset",
  QUIZ_ATTEMPTS_RESET: "Quiz Reset",
  QUIZ_OVERRIDE: "Quiz Override",
  EXAM_ATTEMPTS_RESET: "Exam Reset",
  MISSION_STATEMENT_SUBMITTED: "Mission Submitted",
  MISSION_STATEMENT_APPROVED: "Mission Approved",
  MISSION_STATEMENT_REJECTED: "Mission Rejected",
  ONE_ON_ONE_REQUESTED: "1:1 Requested",
  ONE_ON_ONE_APPROVED: "1:1 Approved",
  ONE_ON_ONE_REJECTED: "1:1 Rejected",
  ONE_ON_ONE_SCHEDULED: "1:1 Scheduled",
  ONE_ON_ONE_COMPLETED: "1:1 Completed",
  ONE_ON_ONE_RESCHEDULED: "1:1 Rescheduled",
  CERTIFICATE_APPROVED: "Cert Approved",
  CERTIFICATE_REJECTED: "Cert Rejected",
  CERTIFICATE_REVOCATION: "Cert Revoked",
  CERTIFICATE_REVOKED: "Cert Revoked",
  ATTENDANCE_MARKED_MANUAL: "Attendance Marked",
  ATTENDANCE_MANUAL_OVERRIDE: "Attendance Override",
  ATTENDANCE_CORRECTED: "Attendance Corrected",
  ATTENDANCE_RECONCILED: "Attendance Reconciled",
  UNMATCHED_ATTENDANCE_DISMISSED: "Attendance Dismissed",
  CREATE_CREDIT_NOTE: "Credit Note",
  REFUND_ISSUED: "Refund Issued",
  LEAD_CONVERT: "Lead Convert",
  SESSION_CREATED: "Session Created",
  SESSION_ACTIVATED: "Session Activated",
  SESSION_COMPLETED: "Session Completed",
  SESSION_CANCELLED: "Session Cancelled",
  SESSION_UPDATED: "Session Updated",
  SESSION_DELETED: "Session Deleted",
  ORAL_ASSESSMENT_GRADED: "Oral Graded",
  CERTIFICATE_ISSUED: "Cert Issued",
  CERTIFICATE_REQUESTED: "Cert Requested",
  COUPON_CREATED: "Coupon Created",
  COUPON_UPDATED: "Coupon Updated",
  COUPON_ARCHIVED: "Coupon Archived",
  COUPON_DELETED: "Coupon Deleted",
  ENROLMENT_CREATED: "Enrolled",
  ENROLMENT_STATUS_TRANSITIONED: "Enrolment Status",
  ENROLMENT_CANCELLED: "Enrolment Cancelled",
  LOGOUT_ALL_SESSIONS: "Logout All",
  STAFF_USER_CREATED: "Staff Created",
  USER_STATUS_CHANGED: "Status Changed",
  USER_DELETED: "User Deleted",
  SESSIONS_REVOKED: "Sessions Revoked",
  SESSION_BOOKED: "Session Booked",
  USER_ROLE_CHANGED: "Role Changed",
  LEARNER_ACCESS_REVOKED: "Access Revoked",
  BATCH_TRANSFERRED: "Batch Transfer",
  BATCH_CREATED: "Batch Created",
  BATCH_MANAGER_ASSIGNED: "Manager Assigned",
  BATCH_STATUS_CHANGED: "Batch Status",
  PROGRAM_PUBLISHED: "Program Published",
  PROGRAM_PRICING_UPDATED: "Pricing Updated",
  UNUSUAL_LOGIN_DETECTED: "Security Alert",
  PASSWORD_RESET: "Password Reset",
  NOTIFICATION_BROADCAST: "Broadcast Sent",
  USER_REGISTERED: "User Registered",
  LOGIN: "Login",
  LOGOUT: "Logout",
  LOGOUT_ALL: "Logout All",
};

/**
 * Formats camelCase or snake_case metadata keys into human-friendly titles
 * e.g., 'programTitle' -> 'Program Title', 'lead_email' -> 'Lead Email'
 */
export function formatMetaKey(key: string): string {
  if (/^[A-Z0-9]+(_[A-Z0-9]+)+$/.test(key)) {
    return key
      .split("_")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(" ");
  }
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/_/g, " ")
    .replace(/^\w/, (c) => c.toUpperCase())
    .trim();
}

/**
 * Formats metadata values for display in executive audit cards.
 */
export function formatMetaValue(val: unknown): string {
  if (val === null || val === undefined) return "—";
  if (typeof val === "boolean") return val ? "Yes" : "No";
  if (typeof val === "object") {
    if (Array.isArray(val)) {
      return val.map((item) => (typeof item === "object" ? JSON.stringify(item) : String(item))).join(", ");
    }
    return JSON.stringify(val);
  }
  return String(val);
}

/**
 * Executive metadata structure separating readable key-value properties
 * from actionable external/internal links.
 */
export interface ExecutiveAuditMetadata {
  usefulProperties: Array<{ key: string; label: string; value: string }>;
  actionLinks: Array<{ label: string; url: string }>;
}

/**
 * Filters raw audit metadata down to human-actionable executive properties.
 * Removes internal database UUIDs (e.g., leadId, userId, enrolmentId),
 * cryptographic tokens/nonces, timestamps, and internal lifecycle fields.
 * Extracts special fields like URLs and combined financial amounts.
 */
export function extractExecutiveMetadata(meta: Record<string, unknown> | null | undefined): ExecutiveAuditMetadata {
  if (!meta || typeof meta !== "object") {
    return { usefulProperties: [], actionLinks: [] };
  }

  const BLACKLISTED_EXACT_KEYS = new Set([
    "id",
    "actorId",
    "entityId",
    "targetUserId",
    "createdAt",
    "updatedAt",
    "deletedAt",
    "title",
    "reason",
    "note",
    "feedback",
    "activatedAt",
    "recordedAtUtc",
    "recorded_at_utc",
    "recordedAt",
    "timestamp",
    "ts",
    "nonce",
    "token",
    "jwt",
  ]);

  const usefulProperties: Array<{ key: string; label: string; value: string }> = [];
  const actionLinks: Array<{ label: string; url: string }> = [];

  // Check if amount and currency can be combined into one financial metric
  const hasAmount = meta.amount !== undefined && meta.amount !== null && meta.amount !== "";
  const hasCurrency = meta.currency !== undefined && meta.currency !== null && meta.currency !== "";

  for (const [key, val] of Object.entries(meta)) {
    if (BLACKLISTED_EXACT_KEYS.has(key)) continue;
    if (val === null || val === undefined || val === "" || val === "N/A") continue;

    // Filter out internal foreign keys, UUIDs, and database relations (e.g., leadId, programId, batchId, courseId)
    if (key.endsWith("Id") || key.endsWith("_id") || key.endsWith("ID")) continue;

    // Filter out crypto tokens and nonces
    if (key.toLowerCase().includes("token") || key.toLowerCase().includes("nonce")) continue;

    // Detect action links (checkout URLs, zoom meeting links, external documents)
    if (
      key.toLowerCase().includes("url") ||
      key.toLowerCase().includes("link") ||
      (typeof val === "string" && (val.startsWith("http://") || val.startsWith("https://") || val.startsWith("/")))
    ) {
      actionLinks.push({
        label: formatMetaKey(key),
        url: String(val),
      });
      continue;
    }

    // Combine amount + currency into a single clean financial entry if both exist
    if (key === "currency" && hasAmount) {
      continue;
    }
    if (key === "amount" && hasCurrency) {
      usefulProperties.push({
        key,
        label: "Amount",
        value: `${formatMetaValue(val)} ${String(meta.currency)}`,
      });
      continue;
    }

    // Format ISO timestamps gracefully
    let formattedValue: string;
    if (typeof val === "string" && val.includes("T") && (val.endsWith("Z") || val.includes("+"))) {
      try {
        const d = new Date(val);
        if (!isNaN(d.getTime())) {
          formattedValue = d.toLocaleString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          });
        } else {
          formattedValue = formatMetaValue(val);
        }
      } catch {
        formattedValue = formatMetaValue(val);
      }
    } else {
      formattedValue = formatMetaValue(val);
    }

    usefulProperties.push({
      key,
      label: formatMetaKey(key),
      value: formattedValue,
    });
  }

  return { usefulProperties, actionLinks };
}

