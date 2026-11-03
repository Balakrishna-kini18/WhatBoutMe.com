"use client";

import React, { useState, useEffect, useRef, useId, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";
import styles from "./TimePicker.module.css";

export interface TimePickerProps {
  /** 24-hour time string in "HH:mm" format (e.g. "19:00", "07:30") */
  value: string;
  /** Callback invoked when the time changes, returning "HH:mm" */
  onChange: (value: string) => void;
  disabled?: boolean;
  id?: string;
  minuteStep?: number;
  size?: "sm" | "md";
  className?: string;
  ariaLabel?: string;
}

const HOURS_12 = ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"];

interface TimeDropdownProps {
  value: string;
  onChange: (val: string) => void;
  options: { value: string; label: string }[];
  ariaLabel: string;
  disabled?: boolean;
  size?: "sm" | "md";
}

function TimeDropdown({
  value,
  onChange,
  options,
  ariaLabel,
  disabled = false,
  size = "md",
}: TimeDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [menuPos, setMenuPos] = useState<{
    top?: number;
    bottom?: number;
    left: number;
    width: number;
    maxHeight: number;
  } | null>(null);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const selectedItemRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const closeMenu = useCallback(() => {
    setIsOpen(false);
  }, []);

  const openMenu = () => {
    if (disabled) return;
    const btn = triggerRef.current;
    if (!btn) return;

    const rect = btn.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const maxH = 210;
    const openUpwards = spaceBelow < maxH + 10 && spaceAbove > spaceBelow;

    const effectiveMaxH = openUpwards
      ? Math.min(maxH, Math.max(90, spaceAbove - 16))
      : Math.min(maxH, Math.max(90, spaceBelow - 16));

    const triggerWidth = rect.width;
    const menuWidth = Math.max(triggerWidth, 74);
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - menuWidth - 8));

    if (openUpwards) {
      setMenuPos({
        bottom: window.innerHeight - rect.top + 4,
        left,
        width: menuWidth,
        maxHeight: effectiveMaxH,
      });
    } else {
      setMenuPos({
        top: rect.bottom + 4,
        left,
        width: menuWidth,
        maxHeight: effectiveMaxH,
      });
    }

    setIsOpen(true);
  };

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isOpen) {
      closeMenu();
    } else {
      openMenu();
    }
  };

  // Scroll active item into view when dropdown opens
  useEffect(() => {
    if (isOpen && selectedItemRef.current) {
      selectedItemRef.current.scrollIntoView({ block: "nearest" });
    }
  }, [isOpen]);

  // Outside click and window events
  useEffect(() => {
    if (!isOpen) return;

    const handleOutsideClick = (e: MouseEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node)
      ) {
        closeMenu();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeMenu();
        triggerRef.current?.focus();
      }
    };

    const handleScrollOrResize = (e: Event) => {
      if (menuRef.current && menuRef.current.contains(e.target as Node)) {
        return;
      }
      closeMenu();
    };

    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("scroll", handleScrollOrResize, true);
    window.addEventListener("resize", handleScrollOrResize);

    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("scroll", handleScrollOrResize, true);
      window.removeEventListener("resize", handleScrollOrResize);
    };
  }, [isOpen, closeMenu]);

  const selectedOption = options.find((o) => o.value === value) || options[0];

  return (
    <div className={styles.selectWrapper}>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        className={`${styles.trigger} ${isOpen ? styles.triggerOpen : ""} ${disabled ? styles.triggerDisabled : ""}`}
        onClick={handleToggle}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <span className={styles.triggerValue}>{selectedOption ? selectedOption.label : value}</span>
        <svg
          className={styles.chevron}
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {mounted &&
        isOpen &&
        menuPos &&
        createPortal(
          <div
            ref={menuRef}
            role="listbox"
            className={styles.menuPortal}
            style={{
              top: menuPos.top !== undefined ? `${menuPos.top}px` : undefined,
              bottom: menuPos.bottom !== undefined ? `${menuPos.bottom}px` : undefined,
              left: `${menuPos.left}px`,
              width: `${menuPos.width}px`,
              maxHeight: `${menuPos.maxHeight}px`,
            }}
          >
            {options.map((opt) => {
              const isSelected = opt.value === value;
              return (
                <div
                  key={opt.value}
                  ref={isSelected ? selectedItemRef : undefined}
                  role="option"
                  aria-selected={isSelected}
                  className={`${styles.option} ${isSelected ? styles.optionSelected : ""}`}
                  onClick={() => {
                    onChange(opt.value);
                    closeMenu();
                    triggerRef.current?.focus();
                  }}
                >
                  <span>{opt.label}</span>
                  {isSelected && (
                    <svg
                      className={styles.checkmark}
                      width="13"
                      height="13"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </div>
              );
            })}
          </div>,
          document.body
        )}
    </div>
  );
}

function parseTime24(timeStr: string): { hour12: string; minute: string; ampm: "AM" | "PM" } {
  if (!timeStr || !timeStr.includes(":")) {
    return { hour12: "07", minute: "00", ampm: "PM" };
  }
  const [hPart, mPart] = timeStr.split(":");
  let h = parseInt(hPart || "0", 10);
  let m = parseInt(mPart || "0", 10);
  if (isNaN(h)) h = 19;
  if (isNaN(m)) m = 0;

  const ampm: "AM" | "PM" = h >= 12 ? "PM" : "AM";
  const displayH = h % 12 === 0 ? 12 : h % 12;
  const hour12 = displayH < 10 ? `0${displayH}` : String(displayH);
  const minute = m < 10 ? `0${m}` : String(m);

  return { hour12, minute, ampm };
}

function formatToTime24(hour12: string, minute: string, ampm: "AM" | "PM"): string {
  let hNum = parseInt(hour12, 10);
  if (isNaN(hNum)) hNum = 12;
  if (ampm === "PM" && hNum < 12) hNum += 12;
  if (ampm === "AM" && hNum === 12) hNum = 0;
  const h24 = hNum < 10 ? `0${hNum}` : String(hNum);
  const normM = minute.length === 1 ? `0${minute}` : minute;
  return `${h24}:${normM}`;
}

export function TimePicker({
  value,
  onChange,
  disabled = false,
  id,
  minuteStep = 5,
  size = "md",
  className = "",
  ariaLabel = "Time picker",
}: TimePickerProps) {
  const generatedId = useId();
  const pickerId = id || generatedId;

  const { hour12, minute, ampm } = useMemo(() => {
    return parseTime24(value);
  }, [value]);

  const hourOptions = useMemo(() => {
    return HOURS_12.map((h) => ({ value: h, label: h }));
  }, []);

  const minuteOptions = useMemo(() => {
    const step = Math.max(1, Math.min(60, minuteStep));
    const mins: string[] = [];
    for (let m = 0; m < 60; m += step) {
      mins.push(m < 10 ? `0${m}` : String(m));
    }
    // If current minute isn't on the step interval, include it sorted
    if (!mins.includes(minute)) {
      mins.push(minute);
      mins.sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
    }
    return mins.map((m) => ({ value: m, label: m }));
  }, [minuteStep, minute]);

  const handleHourChange = (newHour: string) => {
    const nextTime = formatToTime24(newHour, minute, ampm);
    onChange(nextTime);
  };

  const handleMinuteChange = (newMinute: string) => {
    const nextTime = formatToTime24(hour12, newMinute, ampm);
    onChange(nextTime);
  };

  const handleAmPmToggle = (newAmPm: "AM" | "PM") => {
    if (newAmPm === ampm) return;
    const nextTime = formatToTime24(hour12, minute, newAmPm);
    onChange(nextTime);
  };

  return (
    <div
      id={pickerId}
      className={`${styles.timePickerContainer} ${size === "sm" ? styles.sm : ""} ${className}`}
      aria-label={ariaLabel}
    >
      {/* 12-Hour Dropdown */}
      <TimeDropdown
        value={hour12}
        onChange={handleHourChange}
        options={hourOptions}
        ariaLabel="Select hour"
        disabled={disabled}
        size={size}
      />

      {/* Minute Dropdown */}
      <TimeDropdown
        value={minute}
        onChange={handleMinuteChange}
        options={minuteOptions}
        ariaLabel="Select minute"
        disabled={disabled}
        size={size}
      />

      {/* AM / PM Segmented Toggle */}
      <div className={styles.ampmGroup} role="group" aria-label="AM or PM">
        {(["AM", "PM"] as const).map((period) => {
          const isActive = ampm === period;
          return (
            <button
              key={period}
              type="button"
              disabled={disabled}
              className={`${styles.ampmBtn} ${isActive ? styles.ampmBtnActive : ""}`}
              onClick={() => handleAmPmToggle(period)}
              aria-pressed={isActive}
            >
              {period}
            </button>
          );
        })}
      </div>
    </div>
  );
}

