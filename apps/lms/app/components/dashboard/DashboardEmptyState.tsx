"use client";

import React from "react";
import Link from "next/link";
import styles from "../../page.module.css";

interface DashboardEmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description: string;
  actionHref?: string;
  actionText?: string;
}

export default function DashboardEmptyState({
  icon,
  title,
  description,
  actionHref,
  actionText,
}: DashboardEmptyStateProps) {
  return (
    <div style={{ textAlign: "center", padding: "48px 20px" }}>
      <div
        style={{
          width: 48,
          height: 48,
          borderRadius: "50%",
          background: "#fff7ed",
          color: "#ea580c",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 14,
        }}
        aria-hidden="true"
      >
        {icon || (
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
            <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
          </svg>
        )}
      </div>
      <h3
        style={{
          fontSize: "1.1rem",
          fontWeight: 700,
          margin: "0 0 6px",
          color: "#0f172a",
        }}
      >
        {title}
      </h3>
      <p
        style={{
          fontSize: "0.875rem",
          color: "#64748b",
          margin: "0 0 18px",
          maxWidth: 360,
          marginLeft: "auto",
          marginRight: "auto",
          lineHeight: 1.5,
        }}
      >
        {description}
      </p>
      {actionHref && actionText && (
        <Link
          href={actionHref}
          className={styles.viewCourseBtn}
          style={{ width: "auto", display: "inline-flex", padding: "0 22px" }}
        >
          {actionText} &rarr;
        </Link>
      )}
    </div>
  );
}
