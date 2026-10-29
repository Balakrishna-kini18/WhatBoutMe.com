import React from "react";

export type SortOrder = "asc" | "desc";

export interface SortIndicatorProps {
  active: boolean;
  order?: SortOrder;
  className?: string;
  style?: React.CSSProperties;
}

export function SortIndicator({
  active,
  order = "asc",
  className,
  style,
}: SortIndicatorProps) {
  return (
    <span
      className={className}
      style={{
        display: "inline-flex",
        flexDirection: "column",
        gap: "1px",
        marginLeft: "0.35rem",
        verticalAlign: "middle",
        flexShrink: 0,
        ...style,
      }}
      aria-hidden="true"
    >
      <svg
        width="7"
        height="4"
        viewBox="0 0 7 4"
        fill="none"
        style={{
          color: active && order === "asc" ? "var(--accent-primary, #c97a1e)" : "#b8b0a5",
          transition: "color 0.15s ease",
        }}
      >
        <path d="M3.5 0.5L6.5 3.5H0.5L3.5 0.5Z" fill="currentColor" />
      </svg>
      <svg
        width="7"
        height="4"
        viewBox="0 0 7 4"
        fill="none"
        style={{
          color: active && order === "desc" ? "var(--accent-primary, #c97a1e)" : "#b8b0a5",
          transition: "color 0.15s ease",
        }}
      >
        <path d="M3.5 3.5L0.5 0.5H6.5L3.5 3.5Z" fill="currentColor" />
      </svg>
    </span>
  );
}
