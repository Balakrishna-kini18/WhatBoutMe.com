import React from "react";
import Link from "next/link";

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  actionHref?: string;
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  onAction,
  actionHref,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={className}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "3.5rem 1.5rem",
        textAlign: "center",
        width: "100%",
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          width: 52,
          height: 52,
          borderRadius: "50%",
          background: "var(--bg-soft, #f5ece1)",
          color: "var(--accent-primary, #c97a1e)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: "1rem",
          fontSize: "1.5rem",
          border: "1px solid var(--border-light, #ece4d7)",
        }}
      >
        {icon || "📋"}
      </div>

      <h3
        style={{
          fontSize: "1.05rem",
          fontWeight: 700,
          color: "var(--text-primary, #14110f)",
          margin: "0 0 0.35rem",
          letterSpacing: "-0.01em",
        }}
      >
        {title}
      </h3>

      <p
        style={{
          fontSize: "0.84rem",
          color: "var(--text-muted, #78716a)",
          margin: "0 0 1.25rem",
          maxWidth: 420,
          lineHeight: 1.45,
        }}
      >
        {description}
      </p>

      {actionLabel && actionHref && (
        <Link
          href={actionHref}
          style={{
            background: "var(--accent-primary, #c97a1e)",
            color: "#ffffff",
            padding: "0.6rem 1.25rem",
            borderRadius: "8px",
            fontSize: "0.82rem",
            fontWeight: 700,
            textDecoration: "none",
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
            boxShadow: "0 1px 3px rgba(201, 122, 30, 0.25)",
            transition: "opacity 0.15s ease",
          }}
        >
          {actionLabel}
        </Link>
      )}

      {actionLabel && onAction && !actionHref && (
        <button
          type="button"
          onClick={onAction}
          style={{
            background: "var(--accent-primary, #c97a1e)",
            color: "#ffffff",
            border: "none",
            padding: "0.6rem 1.25rem",
            borderRadius: "8px",
            fontSize: "0.82rem",
            fontWeight: 700,
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
            boxShadow: "0 1px 3px rgba(201, 122, 30, 0.25)",
            transition: "opacity 0.15s ease",
          }}
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
