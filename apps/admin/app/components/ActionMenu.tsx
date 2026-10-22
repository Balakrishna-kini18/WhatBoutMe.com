"use client";

import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import styles from "./ActionMenu.module.css";

export interface ActionMenuItem {
  id?: string;
  label: string;
  icon?: React.ReactNode;
  href?: string;
  onClick?: () => void;
  danger?: boolean;
  dividerAbove?: boolean;
}

export interface ActionMenuProps {
  items: ActionMenuItem[];
  ariaLabel?: string;
  align?: "right" | "left";
  triggerText?: string;
}

export function ActionMenu({
  items,
  ariaLabel = "More actions",
  align = "right",
  triggerText,
}: ActionMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [menuPos, setMenuPos] = useState<{
    top?: number;
    bottom?: number;
    right?: number;
    left?: number;
    openUpwards: boolean;
  } | null>(null);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const closeMenu = () => {
    setIsOpen(false);
    setMenuPos(null);
  };

  const handleToggle = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (isOpen) {
      closeMenu();
    } else {
      const button = e.currentTarget;
      const rect = button.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      // Calculate estimated menu height based on item count + dividers
      const estimatedHeight = items.length * 36 + 20;
      const openUpwards =
        spaceBelow < estimatedHeight + 16 && rect.top > estimatedHeight + 16;

      const right = Math.max(12, Math.min(window.innerWidth - 180, window.innerWidth - rect.right));
      const left = Math.max(12, rect.left);

      if (openUpwards) {
        const bottom = window.innerHeight - rect.top + 4;
        setMenuPos(
          align === "right"
            ? { bottom, right, openUpwards: true }
            : { bottom, left, openUpwards: true }
        );
      } else {
        const top = rect.bottom + 4;
        setMenuPos(
          align === "right"
            ? { top, right, openUpwards: false }
            : { top, left, openUpwards: false }
        );
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

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={`${styles.triggerBtn} ${triggerText ? styles.triggerBtnText : ""} ${isOpen ? styles.triggerBtnActive : ""}`}
        title={ariaLabel}
        aria-label={ariaLabel}
        aria-expanded={isOpen}
        aria-haspopup="menu"
        onClick={handleToggle}
      >
        {triggerText ? (
          <>
            <span>{triggerText}</span>
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              style={{
                transition: "transform 0.15s ease",
                transform: isOpen ? "rotate(180deg)" : "none",
              }}
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </>
        ) : (
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="1" />
            <circle cx="19" cy="12" r="1" />
            <circle cx="5" cy="12" r="1" />
          </svg>
        )}
      </button>

      {mounted &&
        isOpen &&
        menuPos &&
        createPortal(
          <div
            ref={menuRef}
            className={styles.menuPortal}
            style={
              menuPos.openUpwards
                ? {
                    bottom: `${menuPos.bottom}px`,
                    ...(menuPos.right !== undefined
                      ? { right: `${menuPos.right}px` }
                      : { left: `${menuPos.left}px` }),
                  }
                : {
                    top: `${menuPos.top}px`,
                    ...(menuPos.right !== undefined
                      ? { right: `${menuPos.right}px` }
                      : { left: `${menuPos.left}px` }),
                  }
            }
            role="menu"
            aria-label={ariaLabel}
          >
            {items.map((item, idx) => (
              <React.Fragment key={item.id || item.label || idx}>
                {item.dividerAbove && <div className={styles.divider} />}
                {item.href ? (
                  <Link
                    href={item.href}
                    className={`${styles.menuItem} ${item.danger ? styles.menuItemDanger : ""}`}
                    role="menuitem"
                    onClick={closeMenu}
                  >
                    {item.icon && (
                      <span className={styles.itemIcon}>{item.icon}</span>
                    )}
                    <span>{item.label}</span>
                  </Link>
                ) : (
                  <button
                    type="button"
                    className={`${styles.menuItem} ${item.danger ? styles.menuItemDanger : ""}`}
                    role="menuitem"
                    onClick={() => {
                      closeMenu();
                      item.onClick?.();
                    }}
                  >
                    {item.icon && (
                      <span className={styles.itemIcon}>{item.icon}</span>
                    )}
                    <span>{item.label}</span>
                  </button>
                )}
              </React.Fragment>
            ))}
          </div>,
          document.body
        )}
    </>
  );
}

export default ActionMenu;
