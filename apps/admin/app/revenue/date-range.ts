export type DateRangeFilter =
  | "all" | "ALL"
  | "today" | "TODAY"
  | "yesterday" | "YESTERDAY"
  | "week" | "last_7_days" | "LAST_7_DAYS"
  | "last_30_days" | "LAST_30_DAYS"
  | "month" | "this_month" | "THIS_MONTH"
  | "year" | "this_year" | "THIS_YEAR"
  | "custom" | "CUSTOM";

export function calculateRevenuePeriodDates(
  period: string,
  now = new Date()
): { startDate: string; endDate: string } {
  const formatIso = (d: Date) => {
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };

  const todayStr = formatIso(now);
  const p = period.toUpperCase();

  switch (p) {
    case "TODAY":
      return { startDate: todayStr, endDate: todayStr };
    case "YESTERDAY": {
      const yest = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1));
      const yestStr = formatIso(yest);
      return { startDate: yestStr, endDate: yestStr };
    }
    case "LAST_7_DAYS":
    case "WEEK": {
      const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 6));
      return { startDate: formatIso(start), endDate: todayStr };
    }
    case "LAST_30_DAYS": {
      const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 29));
      return { startDate: formatIso(start), endDate: todayStr };
    }
    case "THIS_MONTH":
    case "MONTH": {
      const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
      return { startDate: formatIso(start), endDate: todayStr };
    }
    case "THIS_YEAR":
    case "YEAR": {
      const start = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
      return { startDate: formatIso(start), endDate: todayStr };
    }
    case "ALL":
    default:
      return { startDate: "", endDate: "" };
  }
}

export function isDateInRange(
  dateStrOrObj: string | Date | undefined,
  filter: DateRangeFilter,
  now = new Date(),
  customRange?: { startDate?: string; endDate?: string }
): boolean {
  if (filter === "all" || filter === "ALL") return true;
  if (!dateStrOrObj) return false;
  const d = new Date(dateStrOrObj);
  if (isNaN(d.getTime())) return true;

  const f = String(filter).toUpperCase();

  if (f === "CUSTOM") {
    if (customRange?.startDate) {
      const parts = customRange.startDate.split("-").map(Number);
      if (parts.length === 3 && parts[0] && parts[1] && parts[2]) {
        const start = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2], 0, 0, 0, 0));
        if (d.getTime() < start.getTime()) return false;
      }
    }
    if (customRange?.endDate) {
      const parts = customRange.endDate.split("-").map(Number);
      if (parts.length === 3 && parts[0] && parts[1] && parts[2]) {
        const end = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2], 23, 59, 59, 999));
        if (d.getTime() > end.getTime()) return false;
      }
    }
    return true;
  }

  if (f === "TODAY") {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
    return d.getTime() >= start.getTime();
  }
  if (f === "YESTERDAY") {
    const yestStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1, 0, 0, 0, 0));
    const yestEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1, 23, 59, 59, 999));
    return d.getTime() >= yestStart.getTime() && d.getTime() <= yestEnd.getTime();
  }
  if (f === "WEEK" || f === "LAST_7_DAYS") {
    if (filter === "week") {
      const day = now.getUTCDay();
      const diff = now.getUTCDate() - day + (day === 0 ? -6 : 1);
      const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), diff, 0, 0, 0, 0));
      return d.getTime() >= start.getTime();
    }
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 6, 0, 0, 0, 0));
    return d.getTime() >= start.getTime();
  }
  if (f === "LAST_30_DAYS") {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 29, 0, 0, 0, 0));
    return d.getTime() >= start.getTime();
  }
  if (f === "MONTH" || f === "THIS_MONTH") {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
    return d.getTime() >= start.getTime();
  }
  if (f === "YEAR" || f === "THIS_YEAR") {
    const start = new Date(Date.UTC(now.getUTCFullYear(), 0, 1, 0, 0, 0, 0));
    return d.getTime() >= start.getTime();
  }
  return true;
}
