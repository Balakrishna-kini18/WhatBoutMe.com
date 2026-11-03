import React from "react";

interface AgreementMarkdownProps {
  content: string;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Safely parses inline markdown (bold, italic, code, links) into React elements.
 * Never uses dangerouslySetInnerHTML to guarantee complete XSS safety.
 */
const TOKEN_PATTERN =
  "(?:<a\\s+(?:[^>]*?\\s+)?href=[\"']([^\"']*)[\"'][^>]*>(.*?)<\\/a>|\\[([^\\]]+)\\]\\(([^)]+)\\)|<\\s*(?:strong|b)\\s*>(.*?)<\\/\\s*(?:strong|b)\\s*>|\\*\\*([^*]+)\\*\\*|__([^_]+)__|\\*([^*]+)\\*|_([^_]+)_|<\\s*(?:em|i)\\s*>(.*?)<\\/\\s*(?:em|i)\\s*>|<\\s*(?:u|ins)\\s*>(.*?)<\\/\\s*(?:u|ins)\\s*>|~~([^~]+)~~|<\\s*(?:del|s)\\s*>(.*?)<\\/\\s*(?:del|s)\\s*>|`([^`]+)`|<\\s*code\\s*>(.*?)<\\/\\s*code\\s*>|([•⁃‣]))";

function renderInline(text: string, lineKey: string | number, depth = 0): React.ReactNode[] {
  if (!text) return [];
  if (depth > 5) return [text];

  const regex = new RegExp(TOKEN_PATTERN, "gi");
  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let tokenIdx = 0;

  while ((match = regex.exec(text)) !== null) {
    const matchStart = match.index;
    const matchEnd = regex.lastIndex;

    if (matchStart > lastIndex) {
      nodes.push(text.slice(lastIndex, matchStart));
    }

    const key = `${lineKey}-tok-${tokenIdx++}`;

    const htmlLinkUrl = match[1];
    const htmlLinkLabel = match[2];
    const mdLinkLabel = match[3];
    const mdLinkUrl = match[4];
    const boldText = match[5] ?? match[6] ?? match[7];
    const italicText = match[8] ?? match[9] ?? match[10];
    const underlineText = match[11];
    const strikeText = match[12] ?? match[13];
    const codeText = match[14] ?? match[15];
    const bulletSymbol = match[16];

    if (htmlLinkUrl !== undefined && htmlLinkLabel !== undefined) {
      const rawUrl = htmlLinkUrl.trim();
      const isSafe = /^(https?:\/\/|mailto:|\/|#)/i.test(rawUrl);
      if (isSafe) {
        nodes.push(
          <a
            key={key}
            href={rawUrl}
            target={rawUrl.startsWith("http") ? "_blank" : undefined}
            rel={rawUrl.startsWith("http") ? "noopener noreferrer" : undefined}
            style={{
              color: "var(--accent-primary, #b86b11)",
              textDecoration: "underline",
              fontWeight: 500,
            }}
          >
            {renderInline(htmlLinkLabel, `${key}-l`, depth + 1)}
          </a>
        );
      } else {
        nodes.push(renderInline(htmlLinkLabel, `${key}-l`, depth + 1));
      }
    } else if (mdLinkLabel !== undefined && mdLinkUrl !== undefined) {
      const rawUrl = mdLinkUrl.trim();
      const isSafe = /^(https?:\/\/|mailto:|\/|#)/i.test(rawUrl);
      if (isSafe) {
        nodes.push(
          <a
            key={key}
            href={rawUrl}
            target={rawUrl.startsWith("http") ? "_blank" : undefined}
            rel={rawUrl.startsWith("http") ? "noopener noreferrer" : undefined}
            style={{
              color: "var(--accent-primary, #b86b11)",
              textDecoration: "underline",
              fontWeight: 500,
            }}
          >
            {renderInline(mdLinkLabel, `${key}-l`, depth + 1)}
          </a>
        );
      } else {
        nodes.push(renderInline(mdLinkLabel, `${key}-l`, depth + 1));
      }
    } else if (boldText !== undefined) {
      nodes.push(
        <strong key={key} style={{ fontWeight: 700, color: "var(--text-primary, #1c1917)" }}>
          {renderInline(boldText, `${key}-b`, depth + 1)}
        </strong>
      );
    } else if (italicText !== undefined) {
      nodes.push(
        <em key={key} style={{ fontStyle: "italic" }}>
          {renderInline(italicText, `${key}-i`, depth + 1)}
        </em>
      );
    } else if (underlineText !== undefined) {
      nodes.push(
        <u key={key} style={{ textDecoration: "underline", textUnderlineOffset: "3px" }}>
          {renderInline(underlineText, `${key}-u`, depth + 1)}
        </u>
      );
    } else if (strikeText !== undefined) {
      nodes.push(
        <s key={key} style={{ textDecoration: "line-through", opacity: 0.7 }}>
          {renderInline(strikeText, `${key}-s`, depth + 1)}
        </s>
      );
    } else if (codeText !== undefined) {
      nodes.push(
        <code
          key={key}
          style={{
            fontFamily: "monospace",
            fontSize: "0.85em",
            background: "var(--bg-soft, #f7f3ec)",
            border: "1px solid var(--border-light, #e7decb)",
            padding: "1px 5px",
            borderRadius: "4px",
            color: "var(--text-primary, #1c1917)",
          }}
        >
          {codeText}
        </code>
      );
    } else if (bulletSymbol !== undefined) {
      nodes.push(
        <span
          key={key}
          style={{
            display: "inline-block",
            margin: "0 6px",
            width: "6px",
            height: "6px",
            borderRadius: "50%",
            background: "var(--accent-primary, #b86b11)",
            verticalAlign: "middle",
          }}
          aria-hidden="true"
        />
      );
    } else {
      nodes.push(match[0]);
    }

    lastIndex = matchEnd;
    if (regex.lastIndex <= matchStart) {
      regex.lastIndex = matchStart + 1;
    }
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes;
}

export function AgreementMarkdown({ content, className, style }: AgreementMarkdownProps) {
  if (!content) return null;

  const lines = content.split(/\r?\n/);
  const elements: React.ReactNode[] = [];

  let currentBulletList: string[] = [];
  let currentNumberedList: string[] = [];
  let currentQuote: string[] = [];

  const flushBulletList = (key: string | number) => {
    if (currentBulletList.length > 0) {
      elements.push(
        <ul
          key={`ul-${key}`}
          style={{
            paddingLeft: "1.35rem",
            margin: "0.5rem 0 0.85rem",
            color: "var(--text-primary, #1c1917)",
            listStyleType: "disc",
          }}
        >
          {currentBulletList.map((item, idx) => (
            <li key={`ul-item-${idx}`} style={{ marginBottom: "0.35rem", lineHeight: 1.65 }}>
              {renderInline(item, `ul-${key}-${idx}`)}
            </li>
          ))}
        </ul>
      );
      currentBulletList = [];
    }
  };

  const flushNumberedList = (key: string | number) => {
    if (currentNumberedList.length > 0) {
      elements.push(
        <ol
          key={`ol-${key}`}
          style={{
            paddingLeft: "1.35rem",
            margin: "0.5rem 0 0.85rem",
            color: "var(--text-primary, #1c1917)",
            listStyleType: "decimal",
          }}
        >
          {currentNumberedList.map((item, idx) => (
            <li key={`ol-item-${idx}`} style={{ marginBottom: "0.35rem", lineHeight: 1.65 }}>
              {renderInline(item, `ol-${key}-${idx}`)}
            </li>
          ))}
        </ol>
      );
      currentNumberedList = [];
    }
  };

  const flushQuote = (key: string | number) => {
    if (currentQuote.length > 0) {
      elements.push(
        <blockquote
          key={`quote-${key}`}
          style={{
            margin: "0.75rem 0",
            padding: "0.5rem 1rem",
            borderLeft: "3px solid var(--accent-primary, #b86b11)",
            background: "var(--bg-soft, #fdfbf7)",
            borderRadius: "0 6px 6px 0",
            color: "var(--text-secondary, #44403c)",
            fontStyle: "italic",
            lineHeight: 1.6,
          }}
        >
          {currentQuote.map((q, idx) => (
            <p key={`quote-line-${idx}`} style={{ margin: "0.2rem 0" }}>
              {renderInline(q, `quote-${key}-${idx}`)}
            </p>
          ))}
        </blockquote>
      );
      currentQuote = [];
    }
  };

  const flushAll = (key: string | number) => {
    flushBulletList(key);
    flushNumberedList(key);
    flushQuote(key);
  };

  lines.forEach((line, idx) => {
    const trimmed = line.trim();

    // Check for Horizontal Rule
    if (/^(\-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      flushAll(idx);
      elements.push(
        <hr
          key={`hr-${idx}`}
          style={{
            border: "none",
            borderTop: "1px solid var(--border-light, #e7decb)",
            margin: "1.25rem 0",
          }}
        />
      );
      return;
    }

    // Check for Headings
    if (trimmed.startsWith("# ")) {
      flushAll(idx);
      elements.push(
        <h3
          key={`h3-${idx}`}
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: "1.25rem",
            fontWeight: 700,
            margin: "1.25rem 0 0.5rem",
            color: "var(--text-primary, #1c1917)",
            borderBottom: "1px solid var(--border-light, #e7decb)",
            paddingBottom: "0.4rem",
            lineHeight: 1.35,
          }}
        >
          {renderInline(trimmed.replace(/^#\s+/, ""), idx)}
        </h3>
      );
    } else if (trimmed.startsWith("## ")) {
      flushAll(idx);
      elements.push(
        <h4
          key={`h4-${idx}`}
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: "1.08rem",
            fontWeight: 600,
            margin: "1rem 0 0.4rem",
            color: "var(--text-primary, #1c1917)",
            lineHeight: 1.4,
          }}
        >
          {renderInline(trimmed.replace(/^##\s+/, ""), idx)}
        </h4>
      );
    } else if (trimmed.startsWith("### ")) {
      flushAll(idx);
      elements.push(
        <h5
          key={`h5-${idx}`}
          style={{
            fontSize: "0.96rem",
            fontWeight: 600,
            margin: "0.85rem 0 0.35rem",
            color: "var(--text-primary, #1c1917)",
            lineHeight: 1.4,
          }}
        >
          {renderInline(trimmed.replace(/^###\s+/, ""), idx)}
        </h5>
      );
    } else if (trimmed.startsWith("#### ")) {
      flushAll(idx);
      elements.push(
        <h6
          key={`h6-${idx}`}
          style={{
            fontSize: "0.88rem",
            fontWeight: 600,
            margin: "0.75rem 0 0.3rem",
            color: "var(--text-secondary, #44403c)",
            textTransform: "uppercase",
            letterSpacing: "0.03em",
          }}
        >
          {renderInline(trimmed.replace(/^####\s+/, ""), idx)}
        </h6>
      );
    } else if (/^[-*+•⁃‣]\s+/.test(trimmed)) {
      // Bullet list item
      flushNumberedList(idx);
      flushQuote(idx);
      currentBulletList.push(trimmed.replace(/^[-*+•⁃‣]\s+/, ""));
    } else if (/^\d+\.\s+/.test(trimmed)) {
      // Numbered list item
      flushBulletList(idx);
      flushQuote(idx);
      currentNumberedList.push(trimmed.replace(/^\d+\.\s+/, ""));
    } else if (trimmed.startsWith(">")) {
      // Blockquote
      flushBulletList(idx);
      flushNumberedList(idx);
      currentQuote.push(trimmed.replace(/^>\s*/, ""));
    } else if (trimmed.length === 0) {
      // Empty line closes active lists/quotes
      flushAll(idx);
    } else {
      // Standard paragraph text
      flushAll(idx);
      elements.push(
        <p
          key={`p-${idx}`}
          style={{
            margin: "0.45rem 0",
            lineHeight: 1.7,
            color: "var(--text-primary, #1c1917)",
            fontSize: "0.92rem",
            whiteSpace: "pre-line",
          }}
        >
          {renderInline(trimmed, idx)}
        </p>
      );
    }
  });

  flushAll(lines.length);

  return (
    <div className={className} style={{ wordBreak: "break-word", ...style }}>
      {elements}
    </div>
  );
}

export default AgreementMarkdown;
