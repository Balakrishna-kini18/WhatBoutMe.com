"use client";

import React from "react";
import styles from "./Pagination.module.css";

export interface PaginationProps {
  currentPage: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  pageSizeOptions?: number[];
  itemLabel?: string;
  className?: string;
}

const ChevronLeft = () => (
  <svg
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
    <polyline points="15 18 9 12 15 6" />
  </svg>
);

const ChevronRight = () => (
  <svg
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
    <polyline points="9 18 15 12 9 6" />
  </svg>
);

export function Pagination({
  currentPage,
  totalItems,
  pageSize,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 30, 50],
  itemLabel = "records",
  className = "",
}: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(Math.max(1, currentPage), totalPages);

  const startItem = totalItems === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const endItem = Math.min(safePage * pageSize, totalItems);

  if (totalItems === 0) return null;

  return (
    <div
      className={`${styles.container} ${className}`}
      aria-label="Table pagination"
    >
      {/* Left: Results Summary */}
      <div className={styles.itemSummary}>
        Showing <span className={styles.highlight}>{startItem}–{endItem}</span> of{" "}
        <span className={styles.highlight}>{totalItems.toLocaleString()}</span> {itemLabel}
      </div>

      {/* Center: Rows per page Segmented Control */}
      {onPageSizeChange && pageSizeOptions.length > 0 && (
        <div className={styles.pageSizeSection}>
          <span className={styles.pageSizeLabel}>Rows per page:</span>
          <div className={styles.segmentedTrack} role="group" aria-label="Rows per page">
            {pageSizeOptions.map((size) => {
              const isActive = pageSize === size;
              return (
                <button
                  key={size}
                  type="button"
                  className={`${styles.segmentBtn} ${isActive ? styles.segmentBtnActive : ""}`}
                  onClick={() => {
                    if (pageSize !== size) {
                      onPageSizeChange(size);
                    }
                  }}
                  aria-pressed={isActive}
                  title={`Show ${size} rows per page`}
                >
                  {size}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Right: Bulletproof Compact Navigation (< Previous  Page X of Y  Next >) */}
      <div className={styles.controls}>
        <button
          type="button"
          onClick={() => onPageChange(Math.max(1, safePage - 1))}
          disabled={safePage <= 1}
          className={styles.navBtn}
          aria-label="Previous page"
        >
          <ChevronLeft />
          <span>Previous</span>
        </button>

        <span className={styles.pageIndicator}>
          Page <strong className={styles.highlight}>{safePage}</strong> of{" "}
          <strong className={styles.highlight}>{totalPages.toLocaleString()}</strong>
        </span>

        <button
          type="button"
          onClick={() => onPageChange(Math.min(totalPages, safePage + 1))}
          disabled={safePage >= totalPages}
          className={styles.navBtn}
          aria-label="Next page"
        >
          <span>Next</span>
          <ChevronRight />
        </button>
      </div>
    </div>
  );
}

export default Pagination;
