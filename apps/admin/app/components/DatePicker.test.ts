import { describe, it, expect } from "vitest";

describe("Theme-Aligned DatePicker Specification", () => {
  it("formats ISO string YYYY-MM-DD into human-readable display date", () => {
    const MONTH_NAMES = [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December",
    ];

    function formatToDisplay(isoDateStr: string): string {
      if (!isoDateStr) return "";
      const parts = isoDateStr.split("-");
      if (parts.length !== 3) return isoDateStr;
      const year = parseInt(parts[0] ?? "", 10);
      const month = parseInt(parts[1] ?? "", 10) - 1;
      const day = parseInt(parts[2] ?? "", 10);

      if (isNaN(year) || isNaN(month) || isNaN(day)) return isoDateStr;
      const monthName = MONTH_NAMES[month];
      const monthShort = monthName ? monthName.slice(0, 3) : "";
      return `${day < 10 ? `0${day}` : day} ${monthShort} ${year}`;
    }

    expect(formatToDisplay("2026-10-26")).toBe("26 Oct 2026");
    expect(formatToDisplay("2026-01-05")).toBe("05 Jan 2026");
    expect(formatToDisplay("")).toBe("");
  });

  it("calculates correct calendar days grid for a month", () => {
    const year = 2026;
    const month = 9; // October (0-indexed)

    const firstDayOfWeek = new Date(year, month, 1).getDay(); // Thursday = 4
    const daysInCurrentMonth = new Date(year, month + 1, 0).getDate(); // 31 days

    expect(firstDayOfWeek).toBe(4); // Oct 1, 2026 is Thursday
    expect(daysInCurrentMonth).toBe(31);

    // Padding + current month + trailing should be divisible by 7
    const totalLeading = firstDayOfWeek;
    const totalRemaining = (7 - ((totalLeading + daysInCurrentMonth) % 7)) % 7;
    const totalCells = totalLeading + daysInCurrentMonth + totalRemaining;

    expect(totalCells % 7).toBe(0);
    expect(totalCells).toBe(35);
  });

  it("enforces date boundary constraints (minDate and maxDate)", () => {
    const minDate = "2026-10-10";
    const maxDate = "2026-10-25";

    const isDateDisabled = (iso: string) => {
      return Boolean((minDate && iso < minDate) || (maxDate && iso > maxDate));
    };

    expect(isDateDisabled("2026-10-09")).toBe(true);
    expect(isDateDisabled("2026-10-10")).toBe(false);
    expect(isDateDisabled("2026-10-20")).toBe(false);
    expect(isDateDisabled("2026-10-25")).toBe(false);
    expect(isDateDisabled("2026-10-26")).toBe(true);
  });
});
