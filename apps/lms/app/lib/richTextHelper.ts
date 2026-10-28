// apps/lms/app/lib/richTextHelper.ts

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
 * If the content is already HTML, it passes it through directly.
 */
export function markdownToHtml(input: string): string {
  if (!input) return '';
  const trimmed = input.trim();
  if (!trimmed) return '';

  // If already formatted HTML containing common tags, return as is
  if (/<(p|div|h[1-6]|ul|ol|li|blockquote|strong|b|em|i|u|mark|span)[^>]*>/i.test(trimmed)) {
    return trimmed;
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

  const inlineFormat = (str: string) => {
    return str
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/__(.*?)__/g, '<u>$1</u>')
      .replace(/`([^`]+)`/g, '<mark style="background:#fef08a;padding:1px 4px;border-radius:3px;">$1</mark>');
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
  return result.join('') || '<p><br></p>';
}

/**
 * Basic sanitizer for rendering student notes HTML safely in read-only panels.
 */
export function sanitizeNoteHtml(html: string): string {
  if (!html) return '';
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/on\w+="[^"]*"/gi, '')
    .replace(/on\w+='[^']*'/gi, '')
    .replace(/javascript:/gi, '');
}
