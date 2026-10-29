import React from "react";
import Link from "next/link";
import { resolveEmptyStateIcon } from "./empty-state-icons";

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  actionHref?: string;
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
  secondaryActionHref?: string;
  children?: React.ReactNode;
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  onAction,
  actionHref,
  secondaryActionLabel,
  onSecondaryAction,
  secondaryActionHref,
  children,
  className,
}: EmptyStateProps) {
  const hasActions = Boolean(actionLabel || secondaryActionLabel || children);

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
        {resolveEmptyStateIcon(icon)}
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

      {hasActions && (
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "0.65rem",
            flexWrap: "wrap",
          }}
        >
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

          {secondaryActionLabel && secondaryActionHref && (
            <Link
              href={secondaryActionHref}
              style={{
                background: "#ffffff",
                color: "var(--text-primary, #14110f)",
                border: "1px solid var(--border-light, #e7decb)",
                padding: "0.6rem 1.15rem",
                borderRadius: "8px",
                fontSize: "0.82rem",
                fontWeight: 600,
                textDecoration: "none",
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                transition: "all 0.15s ease",
              }}
            >
              {secondaryActionLabel}
            </Link>
          )}

          {secondaryActionLabel && onSecondaryAction && !secondaryActionHref && (
            <button
              type="button"
              onClick={onSecondaryAction}
              style={{
                background: "#ffffff",
                color: "var(--text-primary, #14110f)",
                border: "1px solid var(--border-light, #e7decb)",
                padding: "0.6rem 1.15rem",
                borderRadius: "8px",
                fontSize: "0.82rem",
                fontWeight: 600,
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                transition: "all 0.15s ease",
              }}
            >
              {secondaryActionLabel}
            </button>
          )}

          {children}
        </div>
      )}
    </div>
  );
}
