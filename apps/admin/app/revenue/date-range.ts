export type DateRangeFilter = "all" | "today" | "week" | "month" | "year";

export function isDateInRange(
  dateStrOrObj: string | Date | undefined,
  filter: DateRangeFilter,
  now = new Date()
): boolean {
  if (filter === "all") return true;
  if (!dateStrOrObj) return false;
  const d = new Date(dateStrOrObj);
  if (isNaN(d.getTime())) return true;

  if (filter === "today") {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
    return d.getTime() >= start.getTime();
  }
  if (filter === "week") {
    const day = now.getUTCDay();
    const diff = now.getUTCDate() - day + (day === 0 ? -6 : 1);
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), diff, 0, 0, 0, 0));
    return d.getTime() >= start.getTime();
  }
  if (filter === "month") {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
    return d.getTime() >= start.getTime();
  }
  if (filter === "year") {
    const start = new Date(Date.UTC(now.getUTCFullYear(), 0, 1, 0, 0, 0, 0));
    return d.getTime() >= start.getTime();
  }
  return true;
}
