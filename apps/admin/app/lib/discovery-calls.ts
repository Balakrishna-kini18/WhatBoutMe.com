import { parseLeadMessage } from "./lead-parser";
import { getSystemTimezone, getSessionDateInTz, formatShortTimeInTz } from "./timezone";

export interface DiscoveryCallItem {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  scheduledAt: string;
  startTime: number;
  formattedTime: string;
  zoomUrl: string | null;
  isCourseInquiry: boolean;
  courseTitle?: string;
  isJoinable: boolean;
  isLive: boolean;
  isPendingAcceptance?: boolean;
}

export interface FilterDiscoveryCallsOptions {
  now?: Date;
  timezone?: string;
  maxCount?: number;
}

/**
 * Filters and sorts unconverted discovery calls scheduled strictly for today in the target timezone.
 * Rules:
 * 1. Excludes calls from previous days or future days.
 * 2. Excludes converted or closed leads.
 * 3. Authoritative call duration: 15 minutes.
 * 4. Completion grace period: 15 minutes after end time (startTime + 30 mins total). After this, call is marked stale.
 * 5. Early join window: joinable starting 15 minutes before scheduled start time.
 * 6. Sorted chronologically, limited to maxCount (default 3).
 */
export function filterUpcomingDiscoveryCalls(
  leads: any[],
  options?: FilterDiscoveryCallsOptions
): DiscoveryCallItem[] {
  if (!Array.isArray(leads) || leads.length === 0) {
    return [];
  }

  const currentTz = options?.timezone || getSystemTimezone();
  const now = options?.now || new Date();
  const nowMs = now.getTime();
  const todayDateStr = getSessionDateInTz(now.toISOString(), currentTz);
  const maxCount = options?.maxCount ?? 3;

  // 15-min discovery call authoritative duration (v2.0 Master Spec / discovery.service.ts)
  const DISCOVERY_CALL_DURATION_MS = 15 * 60 * 1000;
  // 15-minute grace period for concluding active calls before marking stale/expired
  const DISCOVERY_CALL_EXPIRY_GRACE_MS = 15 * 60 * 1000;

  return leads
    .map((lead): DiscoveryCallItem | null => {
      if (!lead) return null;
      const parsed = parseLeadMessage(lead.message);
      const isConverted = lead.status === "CONVERTED" || Boolean(parsed.conversion);
      const isClosed = lead.status === "CLOSED";
      const scheduledAt = parsed.discovery?.scheduledAt;
      const zoomUrl = parsed.discovery?.zoomUrl;

      // Skip non-discovery or closed/converted leads immediately
      if (!scheduledAt || isConverted || isClosed) {
        return null;
      }

      const startDate = new Date(scheduledAt);
      const startTime = startDate.getTime();
      if (isNaN(startTime)) {
        return null;
      }

      // Timezone-aware date matching: strictly today's calls in current timezone
      const callDateStr = getSessionDateInTz(scheduledAt, currentTz);
      if (callDateStr !== todayDateStr) {
        return null;
      }

      // Expiry check: A call expires 15 minutes after its duration ends (startTime + 30 mins total)
      // If the call start time has passed, but it is within the 15-min duration or 15-min grace window,
      // it remains visible as an active/concluding session.
      const expiryTime = startTime + DISCOVERY_CALL_DURATION_MS + DISCOVERY_CALL_EXPIRY_GRACE_MS;
      if (nowMs > expiryTime) {
        return null;
      }

      // Early join window: joinable from 15 mins before start time through expiry
      const isJoinable = nowMs >= startTime - (15 * 60 * 1000) && nowMs <= expiryTime;
      const isLive = nowMs >= startTime && nowMs <= startTime + DISCOVERY_CALL_DURATION_MS;
      const formattedTime = formatShortTimeInTz(scheduledAt, currentTz);

      return {
        id: lead.id,
        name: lead.name || "Prospective Learner",
        email: lead.email,
        phone: lead.phone || null,
        scheduledAt,
        startTime,
        formattedTime,
        zoomUrl: zoomUrl && zoomUrl.startsWith("http") ? zoomUrl : null,
        isCourseInquiry: parsed.isCourseInquiry,
        courseTitle: parsed.courseInquiry?.title,
        isJoinable,
        isLive,
        isPendingAcceptance: !zoomUrl || !zoomUrl.startsWith("http"),
      };
    })
    .filter((item): item is DiscoveryCallItem => item !== null)
    .sort((a, b) => a.startTime - b.startTime)
    .slice(0, maxCount);
}
