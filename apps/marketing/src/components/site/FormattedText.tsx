import React from "react";

/**
 * Strips basic markdown, bullet symbols, and HTML tags so plain text previews
 * (like card summaries, metadata descriptions) do not show raw markup syntax.
 */
export function stripFormatting(text?: string | null): string {
  if (!text) return "";
  return text
    .replace(/<[^>]*>/g, "") // strip HTML tags like <u>, <b>, <i>, etc.
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // strip markdown links
    .replace(/\*\*([^*]+)\*\*/g, "$1") // strip **bold**
    .replace(/__([^_]+)__/g, "$1") // strip __bold__
    .replace(/\*([^*]+)\*/g, "$1") // strip *italic*
    .replace(/_([^_]+)_/g, "$1") // strip _italic_
    .replace(/~~([^~]+)~~/g, "$1") // strip ~~strikethrough~~
    .replace(/`([^`]+)`/g, "$1") // strip `code`
    .replace(/^[#>-]+\s*/gm, "") // strip leading headers, blockquotes, dashes
    .replace(/^[•⁃‣]\s*/gm, "") // strip leading bullet symbols
    .replace(/[•⁃‣]/g, " ") // replace inline bullet symbols with space
    .replace(/\s+/g, " ") // normalize whitespace
    .trim();
}

/**
 * Regex to parse inline formatted tokens:
 * - Links: [label](url), <a href="url">label</a>
 * - Bold: **text**, __text__, <strong>text</strong>, <b>text</b>
 * - Italic: *text*, _text_, <em>text</em>, <i>text</i>
 * - Underline: <u>text</u>, <ins>text</ins>
 * - Strikethrough: ~~text~~, <del>text</del>, <s>text</s>
 * - Code: `code`, <code>code</code>
 * - Bullet symbol: •, ⁃, ‣
 */
const TOKEN_REGEX =
  /(?:<a\s+(?:[^>]*?\s+)?href=["']([^"']*)["'][^>]*>(.*?)<\/a>|\[([^\]]+)\]\(([^)]+)\)|<\s*(?:strong|b)\s*>(.*?)<\s*\/\s*(?:strong|b)\s*>|\*\*([^*]+)\*\*|__([^_]+)__|<\s*(?:em|i)\s*>(.*?)<\s*\/\s*(?:em|i)\s*>|\*([^*]+)\*|_([^_]+)_|<\s*(?:u|ins)\s*>(.*?)<\s*\/\s*(?:u|ins)\s*>|~~([^~]+)~~|<\s*(?:del|s)\s*>(.*?)<\s*\/\s*(?:del|s)\s*>|`([^`]+)`|<\s*code\s*>(.*?)<\s*\/\s*code\s*>|([•⁃‣]))/gi;

/**
 * Safely parses inline markdown and rich tags into React nodes without dangerouslySetInnerHTML.
 * Supports recursion for nested styles (e.g. <u>**bold underlined**</u>).
 */
export function renderInline(
  text: string,
  keyPrefix: string | number,
  depth = 0
): React.ReactNode[] {
  if (!text) return [];
  if (depth > 5) return [text];

  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let tokenIdx = 0;

  TOKEN_REGEX.lastIndex = 0;

  while ((match = TOKEN_REGEX.exec(text)) !== null) {
    const matchStart = match.index;
    const matchEnd = TOKEN_REGEX.lastIndex;

    // Push any text preceding the token
    if (matchStart > lastIndex) {
      nodes.push(text.slice(lastIndex, matchStart));
    }

    const key = `${keyPrefix}-tok-${tokenIdx++}`;

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
            className="text-amber-700 underline underline-offset-2 hover:text-amber-900 transition-colors font-medium"
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
            className="text-amber-700 underline underline-offset-2 hover:text-amber-900 transition-colors font-medium"
          >
            {renderInline(mdLinkLabel, `${key}-l`, depth + 1)}
          </a>
        );
      } else {
        nodes.push(renderInline(mdLinkLabel, `${key}-l`, depth + 1));
      }
    } else if (boldText !== undefined) {
      nodes.push(
        <strong key={key} className="font-bold text-ink">
          {renderInline(boldText, `${key}-b`, depth + 1)}
        </strong>
      );
    } else if (italicText !== undefined) {
      nodes.push(
        <em key={key} className="italic text-ink">
          {renderInline(italicText, `${key}-i`, depth + 1)}
        </em>
      );
    } else if (underlineText !== undefined) {
      nodes.push(
        <u
          key={key}
          className="underline underline-offset-4 decoration-amber-600/70 text-ink"
        >
          {renderInline(underlineText, `${key}-u`, depth + 1)}
        </u>
      );
    } else if (strikeText !== undefined) {
      nodes.push(
        <s key={key} className="line-through text-ink/60">
          {renderInline(strikeText, `${key}-s`, depth + 1)}
        </s>
      );
    } else if (codeText !== undefined) {
      nodes.push(
        <code
          key={key}
          className="rounded bg-sand/60 px-1.5 py-0.5 font-mono text-[0.88em] text-ink border border-line/60"
        >
          {codeText}
        </code>
      );
    } else if (bulletSymbol !== undefined) {
      nodes.push(
        <span
          key={key}
          className="inline-block mx-1.5 h-1.5 w-1.5 rounded-full bg-amber-600 align-middle"
          aria-hidden="true"
        />
      );
    } else {
      nodes.push(match[0]);
    }

    lastIndex = matchEnd;
  }

  // Trailing text after the last token
  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes;
}

/**
 * Rich block markdown and text renderer for program overviews, descriptions,
 * FAQs, and syllabi. Fully supports bold, italic, underline, headings, lists,
 * quotes, and dividers.
 */
export function RichMarkdown({
  content,
  className,
  style,
}: {
  content?: string | null;
  className?: string;
  style?: React.CSSProperties;
}) {
  if (!content) return null;

  const lines = content.split(/\r?\n/);
  const elements: React.ReactNode[] = [];

  let currentBulletList: string[] = [];
  let currentNumberedList: string[] = [];
  let currentQuote: string[] = [];
  let currentParagraph: string[] = [];

  const flushParagraph = (key: string | number) => {
    if (currentParagraph.length > 0) {
      const pKey = `p-${key}`;
      elements.push(
        <p key={pKey} className="mb-3 text-base leading-relaxed text-ink-soft">
          {currentParagraph.map((lineText, lIdx) => (
            <React.Fragment key={lIdx}>
              {lIdx > 0 && <br />}
              {renderInline(lineText, `${pKey}-${lIdx}`)}
            </React.Fragment>
          ))}
        </p>
      );
      currentParagraph = [];
    }
  };

  const flushBulletList = (key: string | number) => {
    if (currentBulletList.length > 0) {
      const ulKey = `ul-${key}`;
      elements.push(
        <ul key={ulKey} className="my-3 space-y-2 pl-1">
          {currentBulletList.map((item, idx) => (
            <li
              key={`ul-item-${idx}`}
              className="flex items-start gap-2.5 text-base leading-relaxed text-ink-soft"
            >
              <span
                className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-600"
                aria-hidden="true"
              />
              <span className="flex-1">
                {renderInline(item, `${ulKey}-${idx}`)}
              </span>
            </li>
          ))}
        </ul>
      );
      currentBulletList = [];
    }
  };

  const flushNumberedList = (key: string | number) => {
    if (currentNumberedList.length > 0) {
      const olKey = `ol-${key}`;
      elements.push(
        <ol key={olKey} className="my-3 space-y-2 pl-1">
          {currentNumberedList.map((item, idx) => (
            <li
              key={`ol-item-${idx}`}
              className="flex items-start gap-2.5 text-base leading-relaxed text-ink-soft"
            >
              <span className="font-semibold text-amber-700 text-sm mt-0.5 min-w-[1.25rem]">
                {idx + 1}.
              </span>
              <span className="flex-1">
                {renderInline(item, `${olKey}-${idx}`)}
              </span>
            </li>
          ))}
        </ol>
      );
      currentNumberedList = [];
    }
  };

  const flushQuote = (key: string | number) => {
    if (currentQuote.length > 0) {
      const qKey = `quote-${key}`;
      elements.push(
        <blockquote
          key={qKey}
          className="my-4 border-l-4 border-amber-600 bg-sand/30 py-2 pl-4 pr-3 italic text-ink-soft rounded-r-lg"
        >
          {currentQuote.map((q, qIdx) => (
            <p key={qIdx} className="my-1 text-base leading-relaxed">
              {renderInline(q, `${qKey}-${qIdx}`)}
            </p>
          ))}
        </blockquote>
      );
      currentQuote = [];
    }
  };

  const flushAll = (key: string | number) => {
    flushParagraph(key);
    flushBulletList(key);
    flushNumberedList(key);
    flushQuote(key);
  };

  lines.forEach((line, idx) => {
    const trimmed = line.trim();

    // Check for Horizontal Rule (---, ***, ___)
    if (/^(\-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      flushAll(idx);
      elements.push(<hr key={`hr-${idx}`} className="my-6 border-line" />);
      return;
    }

    // Check for Headings
    if (trimmed.startsWith("# ")) {
      flushAll(idx);
      elements.push(
        <h2
          key={`h2-${idx}`}
          className="mt-8 mb-4 text-2xl font-bold tracking-tight text-ink md:text-3xl"
        >
          {renderInline(trimmed.replace(/^#\s+/, ""), `h2-${idx}`)}
        </h2>
      );
      return;
    }

    if (trimmed.startsWith("## ")) {
      flushAll(idx);
      elements.push(
        <h3
          key={`h3-${idx}`}
          className="mt-6 mb-3 text-xl font-bold tracking-tight text-ink md:text-2xl"
        >
          {renderInline(trimmed.replace(/^##\s+/, ""), `h3-${idx}`)}
        </h3>
      );
      return;
    }

    if (trimmed.startsWith("### ")) {
      flushAll(idx);
      elements.push(
        <h4
          key={`h4-${idx}`}
          className="mt-5 mb-2 text-lg font-semibold text-ink"
        >
          {renderInline(trimmed.replace(/^###\s+/, ""), `h4-${idx}`)}
        </h4>
      );
      return;
    }

    if (trimmed.startsWith("#### ")) {
      flushAll(idx);
      elements.push(
        <h5
          key={`h5-${idx}`}
          className="mt-4 mb-2 text-base font-semibold text-ink uppercase tracking-wide text-xs"
        >
          {renderInline(trimmed.replace(/^####\s+/, ""), `h5-${idx}`)}
        </h5>
      );
      return;
    }

    // Bullet List Item (-, *, +, •, ⁃, ‣)
    if (/^[-*+•⁃‣]\s+/.test(trimmed)) {
      flushParagraph(idx);
      flushNumberedList(idx);
      flushQuote(idx);
      currentBulletList.push(trimmed.replace(/^[-*+•⁃‣]\s+/, ""));
      return;
    }

    // Numbered List Item (1. , 2. )
    if (/^\d+\.\s+/.test(trimmed)) {
      flushParagraph(idx);
      flushBulletList(idx);
      flushQuote(idx);
      currentNumberedList.push(trimmed.replace(/^\d+\.\s+/, ""));
      return;
    }

    // Blockquote (> )
    if (trimmed.startsWith(">")) {
      flushParagraph(idx);
      flushBulletList(idx);
      flushNumberedList(idx);
      currentQuote.push(trimmed.replace(/^>\s*/, ""));
      return;
    }

    // Empty line separates blocks
    if (trimmed.length === 0) {
      flushAll(idx);
      return;
    }

    // Regular paragraph text
    flushBulletList(idx);
    flushNumberedList(idx);
    flushQuote(idx);
    currentParagraph.push(trimmed);
  });

  flushAll(lines.length);

  return (
    <div className={className} style={{ wordBreak: "break-word", ...style }}>
      {elements}
    </div>
  );
}

/**
 * Universal Formatted Text component.
 * - When inline=true: renders formatted inline nodes within a span.
 * - When inline=false and text is multiline: renders full rich block structure.
 */
export default function FormattedText({
  text,
  className,
  inline = false,
  style,
}: {
  text?: string | null;
  className?: string;
  inline?: boolean;
  style?: React.CSSProperties;
}) {
  if (!text) return null;

  if (inline) {
    return (
      <span className={className} style={style}>
        {renderInline(text, "ft-inline")}
      </span>
    );
  }

  // If text contains line breaks or list/heading markers, use RichMarkdown
  if (text.includes("\n") || /^[-*+•⁃‣#>]/.test(text.trim())) {
    return <RichMarkdown content={text} className={className} style={style} />;
  }

  return (
    <span className={className} style={style}>
      {renderInline(text, "ft")}
    </span>
  );
}
