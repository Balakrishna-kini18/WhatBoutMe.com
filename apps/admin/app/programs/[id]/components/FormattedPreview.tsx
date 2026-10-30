"use client";

import React from "react";

interface FormattedPreviewProps {
  text?: string | null;
  className?: string;
}

/**
 * Strips markdown and HTML formatting tags for plain text usage.
 */
export function stripFormatting(text?: string | null): string {
  if (!text) return "";
  return text
    .replace(/<[^>]*>/g, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    .replace(/~~([^~]+)~~/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Parses inline formatting: bold, italic, underline, link, inline code.
 */
function renderInlineFormatting(rawText: string): React.ReactNode[] {
  const regex = /(\*\*[^*]+\*\*|\*[^*]+\*|<u>.*?<\/u>|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;
  const parts = rawText.split(regex);

  return parts.map((part, idx) => {
    if (!part) return null;

    if (part.startsWith("**") && part.endsWith("**") && part.length >= 4) {
      return (
        <strong key={idx} style={{ fontWeight: 700, color: "#0f172a" }}>
          {part.slice(2, -2)}
        </strong>
      );
    }

    if (part.startsWith("*") && part.endsWith("*") && part.length >= 2) {
      return (
        <em key={idx} style={{ fontStyle: "italic" }}>
          {part.slice(1, -1)}
        </em>
      );
    }

    if (part.startsWith("<u>") && part.endsWith("</u>") && part.length >= 7) {
      return (
        <u key={idx} style={{ textDecoration: "underline" }}>
          {part.slice(3, -4)}
        </u>
      );
    }

    if (part.startsWith("`") && part.endsWith("`") && part.length >= 2) {
      return (
        <code
          key={idx}
          style={{
            background: "#f1f5f9",
            padding: "2px 5px",
            borderRadius: "4px",
            fontSize: "0.85em",
            fontFamily: "monospace",
            color: "#b45309",
          }}
        >
          {part.slice(1, -1)}
        </code>
      );
    }

    const linkMatch = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (linkMatch) {
      return (
        <a
          key={idx}
          href={linkMatch[2]}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: "#c97a1e", textDecoration: "underline" }}
        >
          {linkMatch[1]}
        </a>
      );
    }

    return <React.Fragment key={idx}>{part}</React.Fragment>;
  });
}

/**
 * FormattedPreview renders formatted text previewing markdown and inline HTML tags.
 */
export default function FormattedPreview({ text, className }: FormattedPreviewProps) {
  if (!text || !text.trim()) {
    return null;
  }

  const lines = text.split("\n");

  return (
    <div
      className={className}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "0.45rem",
        wordBreak: "break-word",
      }}
    >
      {lines.map((line, lineIdx) => {
        const trimmed = line.trim();

        if (!trimmed) {
          return <div key={lineIdx} style={{ height: "0.5rem" }} />;
        }

        // Bullet point
        if (trimmed.startsWith("• ") || trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
          const content = trimmed.replace(/^[•\-*]\s+/, "");
          return (
            <div
              key={lineIdx}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: "8px",
                paddingLeft: "0.5rem",
              }}
            >
              <span style={{ color: "#c97a1e", fontWeight: 700 }}>•</span>
              <div>{renderInlineFormatting(content)}</div>
            </div>
          );
        }

        // Numbered item
        const numberMatch = trimmed.match(/^(\d+)\.\s+(.*)$/);
        if (numberMatch && numberMatch[1] && numberMatch[2] !== undefined) {
          return (
            <div
              key={lineIdx}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: "8px",
                paddingLeft: "0.5rem",
              }}
            >
              <span style={{ color: "#78716c", fontWeight: 600, minWidth: "1.25rem" }}>
                {numberMatch[1]}.
              </span>
              <div>{renderInlineFormatting(numberMatch[2])}</div>
            </div>
          );
        }

        return <p key={lineIdx} style={{ margin: 0 }}>{renderInlineFormatting(line)}</p>;
      })}
    </div>
  );
}
