// apps/lms/app/lib/richTextHelper.ts

const ALLOWED_NOTE_TAGS = new Set([
  'p',
  'br',
  'h2',
  'h3',
  'h4',
  'blockquote',
  'ul',
  'ol',
  'li',
  'strong',
  'b',
  'em',
  'i',
  'u',
  'mark',
  'span',
  'div',
]);

/**
 * Validates that an inline CSS style on mark or span only contains safe highlighting properties.
 * Strictly forbids url(), expression(), javascript:, position, behavioral hacks, and external resources.
 */
function isSafeHighlightStyle(styleText: string): boolean {
  if (!styleText) return false;
  const lower = styleText.toLowerCase().trim();
  if (
    lower.includes('url(') ||
    lower.includes('expression(') ||
    lower.includes('javascript:') ||
    lower.includes('behavior') ||
    lower.includes('position') ||
    lower.includes('fixed') ||
    lower.includes('-moz-binding') ||
    lower.includes('@import')
  ) {
    return false;
  }
  // Only allow combinations of background / background-color, padding, border-radius, color, and font-weight
  const declarations = lower.split(';').map((s) => s.trim()).filter(Boolean);
  return declarations.every((decl) => {
    const [prop, val] = decl.split(':').map((s) => s.trim());
    if (!prop || !val) return false;
    if (prop === 'background' || prop === 'background-color') {
      return /^(#[0-9a-f]{3,8}|rgba?\([0-9,\s.%]+\)|transparent|[a-z]+)$/i.test(val);
    }
    if (prop === 'padding') {
      return /^[0-9]+(px|em|rem)?(\s+[0-9]+(px|em|rem)?)*$/i.test(val);
    }
    if (prop === 'border-radius') {
      return /^[0-9]+(px|em|rem)?$/i.test(val);
    }
    if (prop === 'color') {
      return /^(#[0-9a-f]{3,8}|rgba?\([0-9,\s.%]+\)|[a-z]+)$/i.test(val);
    }
    if (prop === 'font-weight') {
      return /^(bold|normal|[1-9]00)$/i.test(val);
    }
    return false;
  });
}

/**
 * Strict allowlist HTML sanitizer for rendering student notes and reflections safely.
 * Strips all dangerous tags (<script>, <iframe>, <svg>, <object>, <embed>, <form>, <link>, etc.)
 * and strips any event handlers (on*) or dangerous URL protocols (javascript:, data:).
 */
export function sanitizeNoteHtml(html: string): string {
  if (!html || typeof html !== 'string') return '';
  const trimmed = html.trim();
  if (!trimmed) return '';

  // 1. Browser DOMParser sanitization (when DOM environment is available)
  if (typeof window !== 'undefined' && typeof DOMParser !== 'undefined') {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(trimmed, 'text/html');

      const cleanNode = (node: Node) => {
        const toRemove: Node[] = [];
        const children = Array.from(node.childNodes);

        for (const child of children) {
          if (child.nodeType === 1) { // ELEMENT_NODE
            const el = child as HTMLElement;
            const tagName = el.tagName.toLowerCase();

            // Discard hazardous non-renderable containers completely
            if (
              ['script', 'style', 'iframe', 'object', 'embed', 'svg', 'form', 'noscript', 'template'].includes(
                tagName
              )
            ) {
              toRemove.push(child);
              continue;
            }

            if (!ALLOWED_NOTE_TAGS.has(tagName)) {
              // Disallowed tag: lift text children up and remove the wrapper
              cleanNode(el);
              const parent = el.parentNode;
              if (parent) {
                while (el.firstChild) {
                  parent.insertBefore(el.firstChild, el);
                }
                toRemove.push(el);
              }
              continue;
            }

            // Remove all disallowed or dangerous attributes
            const attrs = Array.from(el.attributes);
            for (const attr of attrs) {
              const attrName = attr.name.toLowerCase();
              if (attrName.startsWith('on') || attrName.includes(':')) {
                el.removeAttribute(attr.name);
              } else if (attrName === 'style' && (tagName === 'mark' || tagName === 'span')) {
                if (!isSafeHighlightStyle(attr.value)) {
                  el.removeAttribute(attr.name);
                }
              } else {
                // Strip all other attributes for clean semantic note rendering
                el.removeAttribute(attr.name);
              }
            }

            cleanNode(el);
          } else if (child.nodeType !== 3) { // Not TEXT_NODE (e.g. comments, CDATA)
            toRemove.push(child);
          }
        }

        for (const dead of toRemove) {
          dead.parentNode?.removeChild(dead);
        }
      };

      cleanNode(doc.body);
      return doc.body.innerHTML;
    } catch {
      // Fallback to regex allowlist parser below if DOMParser throws
    }
  }

  // 2. Deterministic Regex / Tokenizing Allowlist Sanitizer (Node/SSR/vitest safe)
  // Drop entire dangerous blocks and their contents
  let sanitized = trimmed
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
    .replace(/<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, '')
    .replace(/<embed\b[^>]*>/gi, '')
    .replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, '')
    .replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, '');

  // Process all HTML tags against our allowlist
  sanitized = sanitized.replace(/<\/?([a-zA-Z0-9]+)([^>]*)>/g, (match, rawTagName, rawAttrs) => {
    const tagName = String(rawTagName).toLowerCase();
    if (!ALLOWED_NOTE_TAGS.has(tagName)) {
      return ''; // Strip disallowed tags
    }

    if (match.startsWith('</')) {
      return `</${tagName}>`;
    }

    // Only allow mark and span to retain safe style attributes
    if ((tagName === 'mark' || tagName === 'span') && rawAttrs) {
      const styleMatch = /style=(["'])(.*?)\1/i.exec(rawAttrs);
      const styleValue = styleMatch?.[2];
      if (styleValue && isSafeHighlightStyle(styleValue)) {
        return `<${tagName} style="${styleValue}">`;
      }
    }

    // All other tags rendered without raw attributes
    return `<${tagName}>`;
  });

  return sanitized;
}

/**
 * Checks if HTML or text content is effectively empty.
 */
export function isEditorEmpty(htmlOrText: string): boolean {
  if (!htmlOrText) return true;
  const stripped = htmlOrText
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .trim();
  return stripped.length === 0;
}

/**
 * Extracts plain text from HTML or Markdown, stripping tags and formatting symbols.
 */
export function stripHtmlToPlainText(text: string): string {
  if (!text) return '';
  return text
    .replace(/<[^>]+>/g, ' ')
    .replace(/[#*_~`>[\]()]/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+([.,!?;:])/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Converts legacy markdown (or plain text lines) to clean, semantic HTML for visual editing.
 * If the content is already HTML, it sanitizes and passes it through directly.
 */
export function markdownToHtml(input: string): string {
  if (!input) return '';
  const trimmed = input.trim();
  if (!trimmed) return '';

  const inlineFormat = (str: string) => {
    return str
      // Bold + Italic combined: ***text*** or malformed button stacks like ***text** * / ***text***
      .replace(/\*{3}([\s\S]*?)\*{2,3}\s*\*?/g, (_match, group) => {
        const clean = group.trim();
        return clean ? `<strong><em>${clean}</em></strong>` : '';
      })
      // Bold: **text**
      .replace(/\*{2}([\s\S]*?)\*{2}/g, '<strong>$1</strong>')
      // Italic: *text*
      .replace(/(^|[^\*])\*([^\*\s][^\*]*?)\*(?!\*)/g, '$1<em>$2</em>')
      // Underline: __text__
      .replace(/_{2}([\s\S]*?)_{2}/g, '<u>$1</u>')
      // Code / Highlight: `text`
      .replace(/`([^`]+)`/g, '<mark style="background:#fef08a;padding:1px 4px;border-radius:3px;">$1</mark>')
      // Clean any stray dangling asterisks so learners never see programmer symbols
      .replace(/(^|\s)\*(?=\s|$)/g, '$1');
  };

  // If already formatted HTML containing common tags, sanitize and return
  if (/<(p|div|h[1-6]|ul|ol|li|blockquote|strong|b|em|i|u|mark|span)[^>]*>/i.test(trimmed)) {
    // If it also contains raw markdown asterisks, underscores, or backticks, format them first so raw programmer tokens don't leak to learners
    if (/[\*_`~]/.test(trimmed)) {
      return sanitizeNoteHtml(inlineFormat(trimmed));
    }
    return sanitizeNoteHtml(trimmed);
  }

  const lines = trimmed.split('\n');
  const result: string[] = [];
  let inUl = false;
  let inOl = false;

  const closeLists = () => {
    if (inUl) {
      result.push('</ul>');
      inUl = false;
    }
    if (inOl) {
      result.push('</ol>');
      inOl = false;
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();

    // Strip code fence markers completely (no programmer syntax)
    if (line.startsWith('```')) {
      closeLists();
      continue;
    }

    if (line.startsWith('### ')) {
      closeLists();
      result.push(`<h3>${inlineFormat(line.slice(4))}</h3>`);
    } else if (line.startsWith('## ')) {
      closeLists();
      result.push(`<h2>${inlineFormat(line.slice(3))}</h2>`);
    } else if (line.startsWith('# ')) {
      closeLists();
      result.push(`<h2>${inlineFormat(line.slice(2))}</h2>`);
    } else if (line.startsWith('> ')) {
      closeLists();
      result.push(`<blockquote>${inlineFormat(line.slice(2))}</blockquote>`);
    } else if (/^[-*•]\s+/.test(line)) {
      if (inOl) {
        result.push('</ol>');
        inOl = false;
      }
      if (!inUl) {
        result.push('<ul>');
        inUl = true;
      }
      const itemText = line.replace(/^[-*•]\s+/, '');
      result.push(`<li>${inlineFormat(itemText)}</li>`);
    } else if (/^\d+\.\s+/.test(line)) {
      if (inUl) {
        result.push('</ul>');
        inUl = false;
      }
      if (!inOl) {
        result.push('<ol>');
        inOl = true;
      }
      const itemText = line.replace(/^\d+\.\s+/, '');
      result.push(`<li>${inlineFormat(itemText)}</li>`);
    } else if (line === '') {
      closeLists();
      if (result.length > 0 && result[result.length - 1] !== '<p><br></p>') {
        result.push('<p><br></p>');
      }
    } else {
      closeLists();
      result.push(`<p>${inlineFormat(line)}</p>`);
    }
  }

  closeLists();
  return sanitizeNoteHtml(result.join('') || '<p><br></p>');
}
