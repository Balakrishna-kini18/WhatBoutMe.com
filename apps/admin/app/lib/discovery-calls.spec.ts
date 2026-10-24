import { describe, it, expect } from "vitest";
import { filterUpcomingDiscoveryCalls } from "./discovery-calls";

describe("filterUpcomingDiscoveryCalls", () => {
  const FIXED_TIMEZONE = "Asia/Kolkata"; // UTC +05:30
  // Reference wall-clock time: Oct 24, 2026, 11:30:00 AM IST -> 2026-10-24T06:00:00.000Z
  const NOW = new Date("2026-10-24T06:00:00.000Z");

  const buildLead = (
    id: string,
    name: string,
    scheduledIso: string,
    zoomUrl: string | null = "https://zoom.us/j/1234567890",
    status: string = "CONTACTED",
    extraMessage: string = ""
  ) => ({
    id,
    name,
    email: `${id}@example.com`,
    phone: "+919876543210",
    status,
    message: [
      `Course Inquiry: Delta X Programme`,
      scheduledIso ? `📅 Discovery Call Scheduled: ${scheduledIso} | Zoom: ${zoomUrl || ""}` : "",
      extraMessage,
    ]
      .filter(Boolean)
      .join("\n\n"),
    createdAt: "2026-10-20T10:00:00.000Z",
  });

  it("Scenario 1: includes call scheduled later today in chronological order", () => {
    // 2:00 PM IST (08:30 UTC) and 4:30 PM IST (11:00 UTC)
    const call1 = buildLead("lead-2pm", "Later Caller 1", "2026-10-24T08:30:00.000Z");
    const call2 = buildLead("lead-4pm", "Later Caller 2", "2026-10-24T11:00:00.000Z");

    const result = filterUpcomingDiscoveryCalls([call2, call1], {
      now: NOW,
      timezone: FIXED_TIMEZONE,
    });

    expect(result).toHaveLength(2);
    expect(result[0]!.id).toBe("lead-2pm");
    expect(result[1]!.id).toBe("lead-4pm");
    expect(result[0]!.formattedTime).toContain("02:00");
  });

  it("Scenario 2: flags a call starting within 15-minute early-join window as joinable", () => {
    // Scheduled at 11:40 AM IST (06:10 UTC) -> 10 minutes from now (11:30 AM IST)
    const earlyCall = buildLead("lead-early", "Early Joiner", "2026-10-24T06:10:00.000Z");

    const result = filterUpcomingDiscoveryCalls([earlyCall], {
      now: NOW,
      timezone: FIXED_TIMEZONE,
    });

    expect(result).toHaveLength(1);
    expect(result[0]!.isJoinable).toBe(true);
    expect(result[0]!.isLive).toBe(false);
  });

  it("Scenario 3: strictly excludes calls scheduled for yesterday", () => {
    // Scheduled yesterday Oct 23, 2026 at 11:00 AM IST (05:30 UTC)
    const yesterdayCall = buildLead("lead-yest", "Yesterday Lead", "2026-10-23T05:30:00.000Z");

    const result = filterUpcomingDiscoveryCalls([yesterdayCall], {
      now: NOW,
      timezone: FIXED_TIMEZONE,
    });

    expect(result).toHaveLength(0);
  });

  it("Scenario 4: strictly excludes calls scheduled for a future date (tomorrow or next week)", () => {
    // Scheduled tomorrow Oct 25, 2026 at 11:00 AM IST (05:30 UTC)
    const tomorrowCall = buildLead("lead-tom", "Tomorrow Lead", "2026-10-25T05:30:00.000Z");
    const nextWeekCall = buildLead("lead-next-wk", "Next Week Lead", "2026-10-31T05:30:00.000Z");

    const result = filterUpcomingDiscoveryCalls([tomorrowCall, nextWeekCall], {
      now: NOW,
      timezone: FIXED_TIMEZONE,
    });

    expect(result).toHaveLength(0);
  });

  it("Scenario 5: preserves a call that is currently in progress (active)", () => {
    // Scheduled 5 minutes ago at 11:25 AM IST (05:55 UTC). Duration is 15 mins (ends 11:40 AM)
    const inProgressCall = buildLead("lead-live", "Live Caller", "2026-10-24T05:55:00.000Z");

    const result = filterUpcomingDiscoveryCalls([inProgressCall], {
      now: NOW,
      timezone: FIXED_TIMEZONE,
    });

    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe("lead-live");
    expect(result[0]!.isLive).toBe(true);
    expect(result[0]!.isJoinable).toBe(true);
  });

  it("Scenario 6: excludes a call that has genuinely ended or expired beyond grace period", () => {
    // Scheduled at 10:30 AM IST (05:00 UTC). Duration 15m + Grace 15m = expired at 11:00 AM IST.
    // Current time is 11:30 AM IST.
    const expiredCall = buildLead("lead-stale", "Stale Caller", "2026-10-24T05:00:00.000Z");

    const result = filterUpcomingDiscoveryCalls([expiredCall], {
      now: NOW,
      timezone: FIXED_TIMEZONE,
    });

    expect(result).toHaveLength(0);
  });

  it("Scenario 7: excludes converted leads even if scheduled for today", () => {
    // Scheduled for today at 12:00 PM IST, but lead status is CONVERTED
    const convertedStatusLead = buildLead(
      "lead-conv-status",
      "Converted 1",
      "2026-10-24T06:30:00.000Z",
      "https://zoom.us/j/123",
      "CONVERTED"
    );

    // Converted via message tag
    const convertedTagLead = buildLead(
      "lead-conv-tag",
      "Converted 2",
      "2026-10-24T06:30:00.000Z",
      "https://zoom.us/j/456",
      "CONTACTED",
      "[Converted to Enrolment: enr-123 | Course: Sigma 1 | Link: https://wbm.com/checkout]"
    );

    const result = filterUpcomingDiscoveryCalls([convertedStatusLead, convertedTagLead], {
      now: NOW,
      timezone: FIXED_TIMEZONE,
    });

    expect(result).toHaveLength(0);
  });

  it("Scenario 8: handles booking with missing or invalid Zoom link gracefully without crash", () => {
    const noLinkLead = buildLead("lead-no-link", "No Link Lead", "2026-10-24T07:00:00.000Z", "");
    const invalidLinkLead = buildLead("lead-bad-link", "Bad Link Lead", "2026-10-24T08:00:00.000Z", "not_a_valid_url");

    const result = filterUpcomingDiscoveryCalls([noLinkLead, invalidLinkLead], {
      now: NOW,
      timezone: FIXED_TIMEZONE,
    });

    expect(result).toHaveLength(2);
    expect(result[0]!.zoomUrl).toBeNull();
    expect(result[1]!.zoomUrl).toBeNull();
  });

  it("Scenario 9: returns empty list when no calls exist for today", () => {
    const result = filterUpcomingDiscoveryCalls([], {
      now: NOW,
      timezone: FIXED_TIMEZONE,
    });

    expect(result).toEqual([]);
  });

  it("Scenario 10: accurately handles dates around midnight across timezone boundaries", () => {
    // In UTC, 2026-10-24T19:00:00.000Z is 7:00 PM on Oct 24.
    // But in Asia/Kolkata (+05:30), that is 12:30 AM on Oct 25 (NEXT DAY).
    const midnightEdgeLead = buildLead("lead-midnight", "Midnight Boundary Lead", "2026-10-24T19:00:00.000Z");

    // When evaluated in Asia/Kolkata on Oct 24, it should be excluded because it belongs to Oct 25 wall-clock
    const resultKolkata = filterUpcomingDiscoveryCalls([midnightEdgeLead], {
      now: NOW,
      timezone: "Asia/Kolkata",
    });
    expect(resultKolkata).toHaveLength(0);

    // But if evaluated in UTC on Oct 24 18:00 UTC (where today is Oct 24), it should match
    const resultUtc = filterUpcomingDiscoveryCalls([midnightEdgeLead], {
      now: new Date("2026-10-24T18:00:00.000Z"),
      timezone: "UTC",
    });
    expect(resultUtc).toHaveLength(1);
    expect(resultUtc[0]!.id).toBe("lead-midnight");
  });
});
