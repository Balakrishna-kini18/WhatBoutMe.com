"use client";

import React, { useState, useEffect, useRef, useId, useMemo } from "react";
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
  menuMinWidth?: string;
  fullWidth?: boolean;
  size?: "sm" | "md";
  ariaLabel?: string;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  id?: string;
  menuMaxHeight?: string;
  searchable?: boolean;
  searchPlaceholder?: string;
}

export function CustomSelect({
  value,
  onChange,
  options,
  minWidth = "160px",
  width,
  menuMinWidth,
  fullWidth = false,
  size = "md",
  ariaLabel,
  placeholder = "Select...",
  className = "",
  disabled = false,
  id,
  menuMaxHeight = "380px",
  searchable,
  searchPlaceholder = "Type to filter...",
}: CustomSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(0);
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
  const searchInputRef = useRef<HTMLInputElement>(null);
  const generatedId = useId();
  const selectId = id || generatedId;

  // Search activates automatically when there are 5 or more options
  // or if explicitly enabled via searchable={true}
  const isSearchable = searchable ?? options.length >= 5;

  useEffect(() => {
    setMounted(true);
  }, []);

  const filteredOptions = useMemo(() => {
    if (!isSearchable || !searchQuery.trim()) {
      return options;
    }
    const q = searchQuery.toLowerCase().trim();
    return options.filter(
      (opt) =>
        opt.label.toLowerCase().includes(q) ||
        opt.value.toLowerCase().includes(q)
    );
  }, [options, isSearchable, searchQuery]);

  const closeMenu = () => {
    setIsOpen(false);
    setMenuPos(null);
    setSearchQuery("");
    setHighlightedIndex(0);
  };

  const openMenu = (initialQuery?: string) => {
    if (disabled) return;
    const button = triggerRef.current;
    if (!button) return;

    const rect = button.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const parsedMaxH = parseInt(menuMaxHeight, 10) || 380;
    const estimatedHeight = Math.min(options.length * 36 + (isSearchable ? 52 : 12), parsedMaxH);
    const openUpwards =
      spaceBelow < estimatedHeight + 16 && rect.top > estimatedHeight + 16;

    const triggerWidth = rect.width;
    const parsedMenuMinWidth = menuMinWidth ? parseInt(menuMinWidth, 10) : triggerWidth;
    const estimatedMenuWidth = Math.max(triggerWidth, parsedMenuMinWidth);
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - estimatedMenuWidth - 8));

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

    if (typeof initialQuery === "string") {
      setSearchQuery(initialQuery);
    } else {
      setSearchQuery("");
    }
    setHighlightedIndex(0);
    setIsOpen(true);
  };

  const handleToggle = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (isOpen) {
      closeMenu();
    } else {
      openMenu();
    }
  };

  // Keyboard navigation when focused on the trigger button
  const handleTriggerKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") {
      e.preventDefault();
      if (!isOpen) {
        openMenu();
      }
    } else if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
      // Type-to-open: Typing any letter directly on the select opens the filter with that letter
      e.preventDefault();
      openMenu(e.key);
    }
  };

  // Auto-focus search input as soon as the popover opens
  useEffect(() => {
    if (isOpen && isSearchable) {
      const timer = setTimeout(() => {
        searchInputRef.current?.focus();
      }, 30);
      return () => clearTimeout(timer);
    }
  }, [isOpen, isSearchable]);

  // Outside click & global escape listener
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

  // Search input keyboard interactions (Arrow navigation, Enter to pick)
  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((prev) => {
        const next = prev + 1;
        return next >= filteredOptions.length ? 0 : next;
      });
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((prev) => {
        const next = prev - 1;
        return next < 0 ? filteredOptions.length - 1 : next;
      });
    } else if (e.key === "Enter") {
      e.preventDefault();
      const target =
        filteredOptions[highlightedIndex] || filteredOptions[0];
      if (target && !target.disabled) {
        onChange(target.value);
        closeMenu();
        triggerRef.current?.focus();
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      closeMenu();
      triggerRef.current?.focus();
    }
  };

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
        title={displayLabel}
        className={`${styles.trigger} ${styles[size]} ${isOpen ? styles.triggerOpen : ""} ${disabled ? styles.triggerDisabled : ""}`}
        onClick={handleToggle}
        onKeyDown={handleTriggerKeyDown}
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
              minWidth: menuMinWidth || `${menuPos.width}px`,
              width: "max-content",
              maxWidth: "min(480px, calc(100vw - 24px))",
              maxHeight: menuMaxHeight,
            }}
            role="listbox"
            aria-label={ariaLabel || displayLabel}
          >
            {/* Embedded In-Menu Search Input */}
            {isSearchable && (
              <div
                className={styles.searchContainer}
                onClick={(e) => e.stopPropagation()}
              >
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setHighlightedIndex(0);
                  }}
                  onKeyDown={handleSearchKeyDown}
                  placeholder={searchPlaceholder}
                  className={styles.searchInput}
                  aria-label="Filter options"
                />
                {searchQuery && (
                  <button
                    type="button"
                    className={styles.searchClearBtn}
                    onClick={() => {
                      setSearchQuery("");
                      setHighlightedIndex(0);
                      searchInputRef.current?.focus();
                    }}
                    title="Clear filter"
                    aria-label="Clear filter"
                  >
                    ✕
                  </button>
                )}
              </div>
            )}

            {/* Scrollable Options List */}
            <div className={styles.optionsList}>
              {filteredOptions.length === 0 ? (
                <div className={styles.noResults}>
                  No options matching &ldquo;{searchQuery}&rdquo;
                </div>
              ) : (
                filteredOptions.map((opt, idx) => {
                  const isSelected = opt.value === value;
                  const isHighlighted = idx === highlightedIndex;
                  return (
                    <div
                      key={opt.value}
                      role="option"
                      aria-selected={isSelected}
                      aria-disabled={opt.disabled}
                      tabIndex={opt.disabled ? -1 : 0}
                      title={opt.label}
                      className={`${styles.option} ${isSelected ? styles.optionSelected : ""} ${isHighlighted && !isSelected ? styles.optionHighlighted : ""} ${opt.disabled ? styles.optionDisabled : ""}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (opt.disabled) return;
                        onChange(opt.value);
                        closeMenu();
                        triggerRef.current?.focus();
                      }}
                      onMouseEnter={() => setHighlightedIndex(idx)}
                      onKeyDown={(e) => {
                        if (opt.disabled) return;
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onChange(opt.value);
                          closeMenu();
                          triggerRef.current?.focus();
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
                })
              )}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}

export default CustomSelect;
