"use client";

import React, { useState, useEffect, useRef, useId } from "react";
import { createPortal } from "react-dom";
import styles from "./CustomSelect.module.css";

export interface CustomSelectOption {
  value: string;
  label: string;
  icon?: React.ReactNode;
  disabled?: boolean;
}

export interface CustomSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: CustomSelectOption[];
  minWidth?: string;
  width?: string;
  fullWidth?: boolean;
  size?: "sm" | "md";
  ariaLabel?: string;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  id?: string;
  menuMaxHeight?: string;
}

export function CustomSelect({
  value,
  onChange,
  options,
  minWidth = "160px",
  width,
  fullWidth = false,
  size = "md",
  ariaLabel,
  placeholder = "Select...",
  className = "",
  disabled = false,
  id,
  menuMaxHeight = "280px",
}: CustomSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [menuPos, setMenuPos] = useState<{
    top?: number;
    bottom?: number;
    left: number;
    width: number;
    openUpwards: boolean;
  } | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const generatedId = useId();
  const selectId = id || generatedId;

  useEffect(() => {
    setMounted(true);
  }, []);

  const closeMenu = () => {
    setIsOpen(false);
    setMenuPos(null);
  };

  const handleToggle = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (disabled) return;

    if (isOpen) {
      closeMenu();
    } else {
      const button = triggerRef.current;
      if (!button) return;
      const rect = button.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const parsedMaxH = parseInt(menuMaxHeight, 10) || 280;
      const estimatedHeight = Math.min(options.length * 36 + 12, parsedMaxH);
      const openUpwards =
        spaceBelow < estimatedHeight + 16 && rect.top > estimatedHeight + 16;

      const triggerWidth = rect.width;
      const left = Math.max(8, Math.min(rect.left, window.innerWidth - triggerWidth - 8));

      if (openUpwards) {
        const bottom = window.innerHeight - rect.top + 4;
        setMenuPos({
          bottom,
          left,
          width: triggerWidth,
          openUpwards: true,
        });
      } else {
        const top = rect.bottom + 4;
        setMenuPos({
          top,
          left,
          width: triggerWidth,
          openUpwards: false,
        });
      }
      setIsOpen(true);
    }
  };

  useEffect(() => {
    if (!isOpen) return;

    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (
        menuRef.current &&
        !menuRef.current.contains(target) &&
        triggerRef.current &&
        !triggerRef.current.contains(target)
      ) {
        closeMenu();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
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
  }, [isOpen]);

  const selectedOption = options.find((o) => o.value === value);
  const displayLabel = selectedOption ? selectedOption.label : placeholder;
  const isPlaceholder = !selectedOption;

  const containerStyle: React.CSSProperties = {
    minWidth: fullWidth ? "100%" : width ? undefined : minWidth,
    width: fullWidth ? "100%" : width || undefined,
  };

  return (
    <div
      ref={containerRef}
      className={`${styles.container} ${fullWidth ? styles.fullWidth : ""} ${className}`}
      style={containerStyle}
    >
      <button
        ref={triggerRef}
        id={selectId}
        type="button"
        disabled={disabled}
        className={`${styles.trigger} ${styles[size]} ${isOpen ? styles.triggerOpen : ""} ${disabled ? styles.triggerDisabled : ""}`}
        onClick={handleToggle}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={ariaLabel || displayLabel}
      >
        <div className={styles.triggerContent}>
          {selectedOption?.icon && (
            <span className={styles.optionIcon}>{selectedOption.icon}</span>
          )}
          <span
            className={`${styles.label} ${isPlaceholder ? styles.placeholderText : ""}`}
          >
            {displayLabel}
          </span>
        </div>
        <svg
          className={`${styles.chevron} ${isOpen ? styles.chevronOpen : ""}`}
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
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
            className={styles.menuPortal}
            style={{
              ...(menuPos.openUpwards
                ? { bottom: `${menuPos.bottom}px` }
                : { top: `${menuPos.top}px` }),
              left: `${menuPos.left}px`,
              minWidth: `${Math.max(menuPos.width, 160)}px`,
              width: `${menuPos.width}px`,
              maxHeight: menuMaxHeight,
            }}
            role="listbox"
            aria-label={ariaLabel || displayLabel}
          >
            {options.map((opt) => {
              const isSelected = opt.value === value;
              return (
                <div
                  key={opt.value}
                  role="option"
                  aria-selected={isSelected}
                  aria-disabled={opt.disabled}
                  tabIndex={opt.disabled ? -1 : 0}
                  className={`${styles.option} ${isSelected ? styles.optionSelected : ""} ${opt.disabled ? styles.optionDisabled : ""}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (opt.disabled) return;
                    onChange(opt.value);
                    closeMenu();
                  }}
                  onKeyDown={(e) => {
                    if (opt.disabled) return;
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onChange(opt.value);
                      closeMenu();
                    }
                  }}
                >
                  <div className={styles.optionTextWrapper}>
                    {opt.icon && (
                      <span className={styles.optionIcon}>{opt.icon}</span>
                    )}
                    <span className={styles.optionLabel}>{opt.label}</span>
                  </div>
                  {isSelected && (
                    <svg
                      className={styles.checkmark}
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
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

export default CustomSelect;
