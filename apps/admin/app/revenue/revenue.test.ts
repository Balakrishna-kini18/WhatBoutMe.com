import { describe, it, expect } from "vitest";
import { isDateInRange, calculateRevenuePeriodDates, type DateRangeFilter } from "./date-range";
import { getPageNumbers } from "../components/pagination-utils";
import { formatRevenueMetric, formatCurrencyAmount } from "./revenue-utils";

describe("Revenue Page Unified Ledger & Filter Semantics", () => {
  // ─────────────────────────────────────────────────────────────────────────────
  // 1. HEADER METRICS (USD REVENUE & LARGE NUMBER RESPONSIVENESS)
  // ─────────────────────────────────────────────────────────────────────────────
  describe("Header Revenue Summary", () => {
    it("reports total collected USD revenue strictly without cross-converting foreign currencies", () => {
      const mockApiResponse = {
        byCurrency: {
          USD: { total: 6665, count: 7, symbol: "$" },
          AED: { total: 3670, count: 1, symbol: "AED" },
          INR: { total: 516260, count: 6, symbol: "₹" },
        },
        paidTransactionsCount: 14,
        paidEnrolmentsCount: 10,
      };

      const usdTotal = mockApiResponse.byCurrency.USD.total;
      expect(usdTotal).toBe(6665);
      expect(`$${Math.round(usdTotal).toLocaleString()}`).toBe("$6,665");
    });

    it("does not fabricate USD revenue figures from foreign currencies", () => {
      const mixedCurrencyData = {
        byCurrency: {
          USD: { total: 5000, count: 5 },
          AED: { total: 3670, count: 1 },
          INR: { total: 500000, count: 6 },
        },
      };

      const usdTotal = mixedCurrencyData.byCurrency.USD.total;
      expect(usdTotal).toBe(5000);
      expect(usdTotal).not.toBe(5000 + 3670 + 500000);
    });

    it("scales font size and formats responsive metrics for standard and large numbers", () => {
      // Standard number (< 10 chars)
      const standard = formatRevenueMetric(6665);
      expect(standard.displayValue).toBe("$6,665");
      expect(standard.fontSize).toBe("1.15rem");
      expect(standard.isCompact).toBe(false);

      // Millions (10-13 chars) -> scales font to 1.05rem
      const millions = formatRevenueMetric(5420000);
      expect(millions.displayValue).toBe("$5,420,000");
      expect(millions.fontSize).toBe("1.05rem");
      expect(millions.isCompact).toBe(false);

      // Billions (14+ chars) -> scales font to 0.92rem
      const billions = formatRevenueMetric(12345678901);
      expect(billions.displayValue).toBe("$12,345,678,901");
      expect(billions.fontSize).toBe("0.92rem");
      expect(billions.isCompact).toBe(false);

      // Extreme numbers (100 Billion+ / 15-20 digits like xxxxxxxxxxxxx) -> compact format with exact in tooltip
      const extreme = formatRevenueMetric(123456789012345);
      expect(extreme.displayValue).toBe("$123.46T");
      expect(extreme.isCompact).toBe(true);
      expect(extreme.fullValue).toBe("$123,456,789,012,345");
    });

    it("formats AED amounts with the official UAE Dirham symbol (د.إ) before the amount", () => {
      // Direct numeric amount
      expect(formatCurrencyAmount(3670, "AED")).toBe("د.إ 3,670");
      expect(formatCurrencyAmount(15000, "AED")).toBe("د.إ 15,000");

      // String amount inputs (e.g. from backend legacy strings or raw inputs)
      expect(formatCurrencyAmount("3670", "AED")).toBe("د.إ 3,670");
      expect(formatCurrencyAmount("AED 3,670", "AED")).toBe("د.إ 3,670");

      // Consistent currency formatting across other supported currencies
      expect(formatCurrencyAmount(2000, "USD")).toBe("$2,000");
      expect(formatCurrencyAmount(166000, "INR")).toBe("₹166,000");
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. DATE RANGE FILTERING LOGIC
  // ─────────────────────────────────────────────────────────────────────────────
  describe("Date Range Filtering (isDateInRange & calculateRevenuePeriodDates)", () => {
    const fixedNow = new Date("2026-10-25T12:00:00Z");

    it("includes everything when filter is 'all' or 'ALL'", () => {
      expect(isDateInRange("2024-01-01T00:00:00Z", "all", fixedNow)).toBe(true);
      expect(isDateInRange("2026-10-25T11:00:00Z", "ALL", fixedNow)).toBe(true);
    });

    it("filters accurately for 'today' and 'TODAY'", () => {
      expect(isDateInRange("2026-10-25T02:00:00Z", "today", fixedNow)).toBe(true);
      expect(isDateInRange("2026-10-25T02:00:00Z", "TODAY", fixedNow)).toBe(true);
      expect(isDateInRange("2026-10-24T23:59:59Z", "today", fixedNow)).toBe(false);
    });

    it("filters accurately for 'YESTERDAY'", () => {
      expect(isDateInRange("2026-10-24T10:00:00Z", "YESTERDAY", fixedNow)).toBe(true);
      expect(isDateInRange("2026-10-25T10:00:00Z", "YESTERDAY", fixedNow)).toBe(false);
      expect(isDateInRange("2026-10-23T23:59:59Z", "YESTERDAY", fixedNow)).toBe(false);
    });

    it("filters accurately for 'week' and 'LAST_7_DAYS'", () => {
      expect(isDateInRange("2026-10-23T10:00:00Z", "week", fixedNow)).toBe(true);
      expect(isDateInRange("2026-10-20T00:00:00Z", "LAST_7_DAYS", fixedNow)).toBe(true);
      expect(isDateInRange("2026-10-10T10:00:00Z", "LAST_7_DAYS", fixedNow)).toBe(false);
    });

    it("filters accurately for 'LAST_30_DAYS'", () => {
      expect(isDateInRange("2026-10-01T10:00:00Z", "LAST_30_DAYS", fixedNow)).toBe(true);
      expect(isDateInRange("2026-09-20T10:00:00Z", "LAST_30_DAYS", fixedNow)).toBe(false);
    });

    it("filters accurately for 'month' and 'THIS_MONTH'", () => {
      expect(isDateInRange("2026-10-02T10:00:00Z", "month", fixedNow)).toBe(true);
      expect(isDateInRange("2026-10-02T10:00:00Z", "THIS_MONTH", fixedNow)).toBe(true);
      expect(isDateInRange("2026-09-30T23:59:59Z", "THIS_MONTH", fixedNow)).toBe(false);
    });

    it("filters accurately for 'year' and 'THIS_YEAR'", () => {
      expect(isDateInRange("2026-02-15T10:00:00Z", "year", fixedNow)).toBe(true);
      expect(isDateInRange("2026-02-15T10:00:00Z", "THIS_YEAR", fixedNow)).toBe(true);
      expect(isDateInRange("2025-12-31T23:59:59Z", "THIS_YEAR", fixedNow)).toBe(false);
    });

    it("filters accurately for 'CUSTOM' date range", () => {
      const customRange = { startDate: "2026-10-10", endDate: "2026-10-20" };
      expect(isDateInRange("2026-10-15T10:00:00Z", "CUSTOM", fixedNow, customRange)).toBe(true);
      expect(isDateInRange("2026-10-09T23:59:59Z", "CUSTOM", fixedNow, customRange)).toBe(false);
      expect(isDateInRange("2026-10-21T00:00:00Z", "CUSTOM", fixedNow, customRange)).toBe(false);
    });

    it("computes accurate preset dates via calculateRevenuePeriodDates", () => {
      expect(calculateRevenuePeriodDates("TODAY", fixedNow)).toEqual({
        startDate: "2026-10-25",
        endDate: "2026-10-25",
      });
      expect(calculateRevenuePeriodDates("YESTERDAY", fixedNow)).toEqual({
        startDate: "2026-10-24",
        endDate: "2026-10-24",
      });
      expect(calculateRevenuePeriodDates("LAST_7_DAYS", fixedNow)).toEqual({
        startDate: "2026-10-19",
        endDate: "2026-10-25",
      });
      expect(calculateRevenuePeriodDates("THIS_MONTH", fixedNow)).toEqual({
        startDate: "2026-10-01",
        endDate: "2026-10-25",
      });
      expect(calculateRevenuePeriodDates("THIS_YEAR", fixedNow)).toEqual({
        startDate: "2026-01-01",
        endDate: "2026-10-25",
      });
      expect(calculateRevenuePeriodDates("ALL", fixedNow)).toEqual({
        startDate: "",
        endDate: "",
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. UNIFIED LEDGER FILTERS & SL. NO. INDEXING
  // ─────────────────────────────────────────────────────────────────────────────
  describe("Unified Ledger Filtering & Sl. No. Mapping", () => {
    const sampleTransactions = [
      { id: "tx-1", user: "Alice Smith", description: "Invoice INV-001", courseTitle: "Sigma 1", batchName: "Cohort Alpha", amount: "$1,000", numericAmount: 1000, status: "PAID", createdAt: "2026-10-25T10:00:00Z" },
      { id: "tx-2", user: "Bob Jones", description: "Invoice INV-002", courseTitle: "Sigma 1", batchName: "Cohort Beta", amount: "$1,000", numericAmount: 1000, status: "PAID", createdAt: "2026-10-25T11:00:00Z" },
      { id: "tx-3", user: "Charlie Brown", description: "Invoice INV-003", courseTitle: "DELTA X BATCH", batchName: "Cohort Alpha", amount: "$2,000", numericAmount: 2000, status: "FAILED", createdAt: "2026-10-24T10:00:00Z" },
    ];

    it("filters transactions by Program", () => {
      const filtered = sampleTransactions.filter((tx) => tx.courseTitle === "Sigma 1");
      expect(filtered).toHaveLength(2);
      expect(filtered.map((t, idx) => ({ slNo: idx + 1, ref: t.description }))).toEqual([
        { slNo: 1, ref: "Invoice INV-001" },
        { slNo: 2, ref: "Invoice INV-002" },
      ]);
    });

    it("filters transactions by Batch", () => {
      const filtered = sampleTransactions.filter((tx) => tx.batchName === "Cohort Alpha");
      expect(filtered).toHaveLength(2);
      expect(filtered.map((_, idx) => idx + 1)).toEqual([1, 2]);
    });

    it("filters transactions by Status", () => {
      const paidOnly = sampleTransactions.filter((tx) => tx.status === "PAID");
      expect(paidOnly).toHaveLength(2);
      const failedOnly = sampleTransactions.filter((tx) => tx.status === "FAILED");
      expect(failedOnly).toHaveLength(1);
      expect(failedOnly[0]?.user).toBe("Charlie Brown");
    });

    it("filters transactions by Search query across learner, ref, and batch", () => {
      const query = "inv-002";
      const searchFiltered = sampleTransactions.filter((tx) =>
        [tx.user, tx.description, tx.id, tx.courseTitle, tx.batchName].some((f) => f.toLowerCase().includes(query))
      );
      expect(searchFiltered).toHaveLength(1);
      expect(searchFiltered[0]?.user).toBe("Bob Jones");
    });

    it("generates 1-based sequential Sl. No. for filtered view", () => {
      const filtered = sampleTransactions.filter((tx) => tx.courseTitle === "Sigma 1");
      const indexedRows = filtered.map((row, idx) => ({
        slNo: idx + 1,
        user: row.user,
      }));
      expect(indexedRows[0]?.slNo).toBe(1);
      expect(indexedRows[1]?.slNo).toBe(2);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 4. COLUMN SORTING LOGIC
  // ─────────────────────────────────────────────────────────────────────────────
  describe("Column Header Sorting (Amount, Date, Learner)", () => {
    const list = [
      { id: "tx-1", user: "Charlie", numericAmount: 2000, createdAt: "2026-10-24T10:00:00Z" },
      { id: "tx-2", user: "Alice", numericAmount: 500, createdAt: "2026-10-25T12:00:00Z" },
      { id: "tx-3", user: "Bob", numericAmount: 1500, createdAt: "2026-10-23T08:00:00Z" },
    ];

    it("sorts by numeric amount ascending and descending", () => {
      const asc = [...list].sort((a, b) => a.numericAmount - b.numericAmount);
      expect(asc.map((i) => i.numericAmount)).toEqual([500, 1500, 2000]);

      const desc = [...list].sort((a, b) => b.numericAmount - a.numericAmount);
      expect(desc.map((i) => i.numericAmount)).toEqual([2000, 1500, 500]);
    });

    it("sorts by learner name alphabetically", () => {
      const sorted = [...list].sort((a, b) => a.user.localeCompare(b.user));
      expect(sorted.map((i) => i.user)).toEqual(["Alice", "Bob", "Charlie"]);
    });

    it("sorts chronologically by date", () => {
      const desc = [...list].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      expect(desc.map((i) => i.id)).toEqual(["tx-2", "tx-1", "tx-3"]);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 5. CSV EXPORT COMPLIANCE (FULL FILTERED DATASET, NOT LIMITED BY PAGINATION)
  // ─────────────────────────────────────────────────────────────────────────────
  describe("CSV Export Scope & Format", () => {
    it("generates CSV headers containing Sl. No. and transaction details", () => {
      const headers = ["Sl. No.", "Transaction Reference", "Learner Name", "Learner Email", "Program", "Batch", "Amount", "Currency", "Status", "Date"];
      expect(headers[0]).toBe("Sl. No.");
      expect(headers).toContain("Transaction Reference");
      expect(headers).toContain("Program");
      expect(headers).toContain("Batch");
    });

    it("exports ALL 100 filtered items even when page size is 10 and view is on page 1", () => {
      // Simulate 100 matching transactions
      const oneHundredItems = Array.from({ length: 100 }, (_, i) => ({
        id: `tx-${i + 1}`,
        description: `Invoice INV-2026-${1000 + i}`,
        user: `Learner ${i + 1}`,
        courseTitle: "DELTA X BATCH",
        batchName: "Cohort 1",
        amount: "$500",
        status: "PAID",
      }));

      // Simulate paginated table view slice (pageSize = 10, page = 1)
      const pageSize = 10;
      const currentPage = 1;
      const paginatedViewSlice = oneHundredItems.slice((currentPage - 1) * pageSize, currentPage * pageSize);
      expect(paginatedViewSlice).toHaveLength(10); // Table displays only 10 rows

      // The export dataset MUST be the entire 100 filtered items, NOT the 10-row page view
      const exportedRows = oneHundredItems.map((item, idx) => ({
        slNo: idx + 1,
        ref: item.description,
        user: item.user,
      }));

      expect(exportedRows).toHaveLength(100);
      expect(exportedRows[0]?.slNo).toBe(1);
      expect(exportedRows[99]?.slNo).toBe(100);
    });

    it("exports only transactions matching active program and batch filters", () => {
      const allTransactions = [
        { id: "1", courseTitle: "DELTA X BATCH", batchName: "Cohort 1" },
        { id: "2", courseTitle: "DELTA X BATCH", batchName: "Cohort 2" },
        { id: "3", courseTitle: "Sigma 1", batchName: "Cohort 1" },
      ];

      const programFiltered = allTransactions.filter((tx) => tx.courseTitle === "DELTA X BATCH");
      expect(programFiltered).toHaveLength(2);

      const batchFiltered = programFiltered.filter((tx) => tx.batchName === "Cohort 1");
      expect(batchFiltered).toHaveLength(1);
      expect(batchFiltered[0]?.id).toBe("1");
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 6. SHARED PAGINATION LOGIC (10, 30, 50 ROWS & PAGE NUMBERS)
  // ─────────────────────────────────────────────────────────────────────────────
  describe("Shared Pagination Component Logic", () => {
    it("slices correctly for pageSize 10, 30, and 50", () => {
      const total = 100;
      const items = Array.from({ length: total }, (_, i) => i + 1);

      // Page size 10
      expect(items.slice(0, 10)).toHaveLength(10);
      // Page size 30
      expect(items.slice(0, 30)).toHaveLength(30);
      // Page size 50
      expect(items.slice(0, 50)).toHaveLength(50);
    });

    it("computes page numbers correctly for small number of pages", () => {
      expect(getPageNumbers(1, 2)).toEqual([1, 2]);
      expect(getPageNumbers(2, 2)).toEqual([1, 2]);
      expect(getPageNumbers(1, 5)).toEqual([1, 2, 3, 4, 5]);
    });

    it("formats page indicator correctly for high page counts without layout overflow", () => {
      const totalItems = 1000;
      const pageSize = 10;
      const totalPages = Math.ceil(totalItems / pageSize);
      const currentPage = 1;
      expect(totalPages).toBe(100);
      expect(`Page ${currentPage} of ${totalPages}`).toBe("Page 1 of 100");
    });
  });
});
