import React from "react";

/**
 * Strips basic markdown and HTML tags so plain text previews (like card summaries)
 * do not show raw markup syntax.
 */
export function stripFormatting(text?: string | null): string {
  if (!text) return "";
  return text
    .replace(/<[^>]*>/g, "") // strip HTML tags like <u>, <b>, etc.
    .replace(/\*\*([^*]+)\*\*/g, "$1") // strip **bold**
    .replace(/__([^_]+)__/g, "$1") // strip __bold__
    .replace(/\*([^*]+)\*/g, "$1") // strip *italic*
    .replace(/_([^_]+)_/g, "$1") // strip _italic_
    .replace(/~~([^~]+)~~/g, "$1") // strip ~~strikethrough~~
    .replace(/`([^`]+)`/g, "$1") // strip `code`
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // strip [link](url)
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Simple formatted text renderer.
 */
export default function FormattedText({
  text,
  className,
}: {
  text?: string | null;
  className?: string;
}) {
  if (!text) return null;
  return <span className={className}>{stripFormatting(text)}</span>;
}
