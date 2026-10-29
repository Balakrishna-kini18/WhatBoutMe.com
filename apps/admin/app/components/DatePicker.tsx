"use client";

import React, { useState, useEffect, useRef, useId, useMemo, useCallback } from "react";
import styles from "./DatePicker.module.css";

export interface DatePickerProps {
  value: string; // ISO format "YYYY-MM-DD" or ""
  onChange: (date: string) => void;
  placeholder?: string;
  minWidth?: string;
  size?: "sm" | "md";
  ariaLabel?: string;
  disabled?: boolean;
  minDate?: string; // "YYYY-MM-DD"
  maxDate?: string; // "YYYY-MM-DD"
  id?: string;
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const WEEKDAY_NAMES = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

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

function getTodayString(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function DatePicker({
  value,
  onChange,
  placeholder = "dd-mm-yyyy",
  minWidth = "145px",
  size = "md",
  ariaLabel = "Select date",
  disabled = false,
  minDate,
  maxDate,
  id,
  isOpen: controlledIsOpen,
  onOpenChange,
}: DatePickerProps) {
  const [internalIsOpen, setInternalIsOpen] = useState(false);
  const isControlled = controlledIsOpen !== undefined;
  const isOpen = isControlled ? controlledIsOpen : internalIsOpen;

  const setIsOpen = useCallback((open: boolean) => {
    if (!isControlled) {
      setInternalIsOpen(open);
    }
    onOpenChange?.(open);
  }, [isControlled, onOpenChange]);

  const [openUpwards, setOpenUpwards] = useState(false);
  const [alignRight, setAlignRight] = useState(false);

  // Initialize view month/year based on value or today
  const initialDate = useMemo<{ year: number; month: number }>(() => {
    if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const parts = value.split("-");
      const y = parseInt(parts[0] ?? "", 10);
      const m = parseInt(parts[1] ?? "", 10) - 1;
      if (!isNaN(y) && !isNaN(m)) {
        return { year: y, month: m };
      }
    }
    const today = new Date();
    return { year: today.getFullYear(), month: today.getMonth() };
  }, [value]);

  const [viewYear, setViewYear] = useState<number>(initialDate.year);
  const [viewMonth, setViewMonth] = useState<number>(initialDate.month);

  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const calendarRef = useRef<HTMLDivElement>(null);
  const generatedId = useId();
  const pickerId = id || generatedId;

  // Update view when value changes externally
  useEffect(() => {
    if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const parts = value.split("-");
      const y = parseInt(parts[0] ?? "", 10);
      const m = parseInt(parts[1] ?? "", 10) - 1;
      if (!isNaN(y) && !isNaN(m)) {
        setViewYear(y);
        setViewMonth(m);
      }
    }
  }, [value]);

  // Check positioning bounds when opened
  useEffect(() => {
    if (isOpen && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const estimatedHeight = 320;
      const shouldOpenUpwards = spaceBelow < estimatedHeight + 16 && rect.top > estimatedHeight + 16;
      const calendarWidth = 290;
      const shouldAlignRight = rect.left + calendarWidth > window.innerWidth - 16;
      setOpenUpwards(shouldOpenUpwards);
      setAlignRight(shouldAlignRight);
    }
  }, [isOpen]);

  const closeCalendar = useCallback(() => {
    setIsOpen(false);
  }, [setIsOpen]);

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (disabled) return;
    setIsOpen(!isOpen);
  };

  // Click outside and escape key listener
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        containerRef.current &&
        !containerRef.current.contains(target)
      ) {
        closeCalendar();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        closeCalendar();
        triggerRef.current?.focus();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, closeCalendar]);

  // Navigate months
  const goToPrevMonth = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((prev: number) => prev - 1);
    } else {
      setViewMonth((prev: number) => prev - 1);
    }
  };

  const goToNextMonth = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((prev: number) => prev + 1);
    } else {
      setViewMonth((prev: number) => prev + 1);
    }
  };

  // Generate calendar days
  const calendarDays = useMemo(() => {
    const firstDayOfWeek = new Date(viewYear, viewMonth, 1).getDay(); // 0 is Sunday
    const daysInCurrentMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const daysInPrevMonth = new Date(viewYear, viewMonth, 0).getDate();

    const days: Array<{
      day: number;
      month: number;
      year: number;
      isCurrentMonth: boolean;
      isoString: string;
      isDisabled: boolean;
    }> = [];

    // Prev month padding
    for (let i = firstDayOfWeek - 1; i >= 0; i--) {
      const day = daysInPrevMonth - i;
      const m = viewMonth === 0 ? 11 : viewMonth - 1;
      const y = viewMonth === 0 ? viewYear - 1 : viewYear;
      const iso = `${y}-${String(m + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      days.push({
        day,
        month: m,
        year: y,
        isCurrentMonth: false,
        isoString: iso,
        isDisabled: Boolean((minDate && iso < minDate) || (maxDate && iso > maxDate)),
      });
    }

    // Current month days
    for (let day = 1; day <= daysInCurrentMonth; day++) {
      const iso = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      days.push({
        day,
        month: viewMonth,
        year: viewYear,
        isCurrentMonth: true,
        isoString: iso,
        isDisabled: Boolean((minDate && iso < minDate) || (maxDate && iso > maxDate)),
      });
    }

    // Next month padding to fill out 35 or 42 cells (exact 7-column rows)
    const totalFilled = days.length;
    const totalNeeded = totalFilled <= 35 ? 35 : 42;
    const remaining = totalNeeded - totalFilled;
    for (let day = 1; day <= remaining; day++) {
      const m = viewMonth === 11 ? 0 : viewMonth + 1;
      const y = viewMonth === 11 ? viewYear + 1 : viewYear;
      const iso = `${y}-${String(m + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      days.push({
        day,
        month: m,
        year: y,
        isCurrentMonth: false,
        isoString: iso,
        isDisabled: Boolean((minDate && iso < minDate) || (maxDate && iso > maxDate)),
      });
    }

    return days;
  }, [viewYear, viewMonth, minDate, maxDate]);

  const handleSelectDay = (isoString: string) => {
    onChange(isoString);
    closeCalendar();
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange("");
    closeCalendar();
  };

  const handleSelectToday = (e: React.MouseEvent) => {
    e.stopPropagation();
    const today = getTodayString();
    if (!((minDate && today < minDate) || (maxDate && today > maxDate))) {
      onChange(today);
      closeCalendar();
    }
  };

  const todayStr = getTodayString();
  const displayLabel = value ? formatToDisplay(value) : "";

  return (
    <div className={styles.container} ref={containerRef} style={{ minWidth }}>
      <button
        ref={triggerRef}
        type="button"
        id={pickerId}
        onClick={handleToggle}
        className={`${styles.trigger} ${styles[size]} ${isOpen ? styles.triggerOpen : ""} ${
          disabled ? styles.triggerDisabled : ""
        }`}
        aria-label={ariaLabel}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        disabled={disabled}
      >
        <span className={styles.triggerValue}>
          {displayLabel ? (
            displayLabel
          ) : (
            <span className={styles.placeholder}>{placeholder}</span>
          )}
        </span>

        <span className={styles.iconGroup}>
          {value && !disabled && (
            <span
              role="button"
              tabIndex={0}
              className={styles.clearBtn}
              onClick={(e) => {
                e.stopPropagation();
                onChange("");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  e.stopPropagation();
                  onChange("");
                }
              }}
              title="Clear date"
              aria-label="Clear date"
            >
              ✕
            </span>
          )}

          {/* Warm Theme Calendar SVG Icon */}
          <svg
            className={styles.calendarIcon}
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
        </span>
      </button>

      {/* Anchored Calendar Dropdown Dialog */}
      {isOpen && (
        <div
          ref={calendarRef}
          className={`${styles.calendarPortal} ${
            openUpwards ? styles.calendarOpenUpwards : ""
          } ${alignRight ? styles.calendarAlignRight : ""}`}
          role="dialog"
          aria-label="Calendar date picker"
        >
          {/* Header: Month & Year with Navigation Chevrons */}
          <div className={styles.calendarHeader}>
            <span className={styles.monthYearDisplay}>
              {MONTH_NAMES[viewMonth]} {viewYear}
            </span>
            <div className={styles.navButtonGroup}>
              <button
                type="button"
                className={styles.navButton}
                onClick={goToPrevMonth}
                title="Previous month"
                aria-label="Previous month"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              </button>
              <button
                type="button"
                className={styles.navButton}
                onClick={goToNextMonth}
                title="Next month"
                aria-label="Next month"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>
            </div>
          </div>

          {/* Weekdays Row */}
          <div className={styles.weekdaysRow}>
            {WEEKDAY_NAMES.map((w) => (
              <div key={w} className={styles.weekdayCell}>
                {w}
              </div>
            ))}
          </div>

          {/* Days Grid */}
          <div className={styles.daysGrid}>
            {calendarDays.map((item) => {
              const isSelected = item.isoString === value;
              const isToday = item.isoString === todayStr;
              const isPast = item.isoString < todayStr && item.isCurrentMonth;

              return (
                <button
                  key={item.isoString}
                  type="button"
                  disabled={item.isDisabled}
                  onClick={() => !item.isDisabled && handleSelectDay(item.isoString)}
                  className={`${styles.dayButton} ${
                    !item.isCurrentMonth ? styles.dayOutside : ""
                  } ${isToday ? styles.dayToday : ""} ${
                    isPast ? styles.dayPast : ""
                  } ${isSelected ? styles.daySelected : ""} ${
                    item.isDisabled ? styles.dayDisabled : ""
                  }`}
                  aria-label={item.isoString}
                >
                  {item.day}
                </button>
              );
            })}
          </div>

          {/* Footer Quick Actions */}
          <div className={styles.calendarFooter}>
            <button
              type="button"
              className={`${styles.footerActionBtn} ${styles.footerClearBtn}`}
              onClick={handleClear}
            >
              Clear
            </button>
            <button
              type="button"
              className={styles.footerActionBtn}
              onClick={handleSelectToday}
            >
              Today
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
