import fs from 'fs';
import path from 'path';
import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFImage,
  type PDFPage,
} from 'pdf-lib';

/**
 * Everything the signed-agreement PDF needs. Values are taken from the
 * denormalised `SignedAgreement` record (immutable snapshots), never from the
 * live template, so a re-rendered copy always matches what was signed.
 */
export interface SignedAgreementPdfInput {
  templateTitle: string;
  templateVersion: string;
  programTitle: string;
  typedName: string | null;
  typedAcknowledgement?: string | null;
  agreementId?: string | null;
  signerEmail: string | null;
  consentVersion: string | null;
  consentTimestamp: string | null;
  /** Verbatim digital consent statement agreed to at signing time. */
  consentStatement?: string | null;
  signedAt: string | null;
  signatureType: string | null;
  signerIp: string | null;
  userAgent: string | null;
  /** Verbatim published agreement body. Never shortened or rewritten. */
  agreementContent: string;
  /** `data:image/png;base64,...` or `data:image/jpeg;base64,...`, best-effort. */
  signatureDataUrl: string | null;
}

/**
 * Exact default verbatim consent statement agreed to by the learner.
 * Used when a custom statement is not stored on the template.
 */
export const DEFAULT_CONSENT_STATEMENT =
  'I consent to WhatBoutMe collecting and processing my personal information for workshop registration, communication and related services, as described in the Privacy Policy. I acknowledge that I have read and accepted the applicable Terms and Conditions and the Program Agreement terms set forth above.';

const PAGE_WIDTH = 595.28; // A4 portrait, points
const PAGE_HEIGHT = 841.89;
const MARGIN = 42;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const FOOTER_Y = 24;
const BOTTOM_LIMIT = 42;

// Clean monochromatic legal palette
const COLOR_INK_PRIMARY = rgb(0.08, 0.08, 0.08); // Primary dark charcoal/black
const COLOR_INK_BODY = rgb(0.18, 0.18, 0.18);    // High-contrast readable body
const COLOR_LABEL = rgb(0.42, 0.42, 0.42);       // Neutral metadata label gray
const COLOR_BORDER = rgb(0.82, 0.82, 0.82);      // Subtle hairline border
const COLOR_PANEL_BG = rgb(0.985, 0.985, 0.985); // Light clean schedule fill

/**
 * Maps non-WinAnsi Unicode characters to compatible ASCII representations.
 */
const WIN_ANSI_REPLACEMENTS: Record<string, string> = {
  '\u2018': "'",
  '\u2019': "'",
  '\u201A': ',',
  '\u201B': "'",
  '\u201C': '"',
  '\u201D': '"',
  '\u201E': '"',
  '\u2013': '-',
  '\u2014': '--',
  '\u2015': '--',
  '\u2026': '...',
  '\u2022': '*',
  '\u2713': 'v',
  '\u2714': 'v',
  '\u00A0': ' ',
  '\u2122': '(TM)',
  '\u00AE': '(R)',
  '\u00A9': '(C)',
  '\u20AC': 'EUR',
  '\u2192': '->',
  '\u2190': '<-',
  '\u2264': '<=',
  '\u2265': '>=',
  '\u2212': '-',
  '\u00D7': 'x',
  '\u00F7': '/',
  '\u00B7': '.',
  '\u2028': '\n',
  '\u2029': '\n',
};

export function sanitizeForWinAnsi(text: string | null | undefined): string {
  if (!text) return '';
  let out = '';
  for (const ch of text) {
    const replacement = WIN_ANSI_REPLACEMENTS[ch];
    if (replacement !== undefined) {
      out += replacement;
      continue;
    }
    if (ch === '\n' || ch === '\r' || ch === '\t') {
      out += ch === '\r' ? '\n' : ch;
      continue;
    }
    const code = ch.codePointAt(0) ?? 0;
    if ((code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff)) {
      out += ch;
      continue;
    }
    out += '?';
  }
  return out;
}

/**
 * Strips or converts inline markdown artifacts (links, bold/italic asterisks, code backticks)
 * for clean, professional PDF typography.
 */
export function stripMarkdownFormatting(text: string | null | undefined): string {
  if (!text) return '';
  return text
    // Replace markdown links [label](url) -> label (url)
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)')
    // Bold asterisks or underscores **text** or __text__
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    // Italic asterisks or underscores *text* or _text_
    .replace(/(?<!\*)\*(?!\*)([^*]+)\*(?!\*)/g, '$1')
    .replace(/(?<!_)_(?!_)([^_]+)_(?!_)/g, '$1')
    // Inline code `code` -> code
    .replace(/`([^`]+)`/g, '$1')
    // Strikethrough ~~text~~ -> text
    .replace(/~~(.*?)~~/g, '$1');
}

/**
 * Formats raw technical browser strings into a clean client environment summary.
 */
export function formatUserAgent(ua: string | null | undefined): string {
  if (!ua || ua.trim() === '' || ua.trim() === 'unknown') return 'Web Browser / Verified Client';
  const raw = ua.trim();

  let browser = '';
  if (/Edg\//i.test(raw)) browser = 'Microsoft Edge';
  else if (/Chrome\//i.test(raw) && !/Chromium\//i.test(raw)) browser = 'Google Chrome';
  else if (/Safari\//i.test(raw) && !/Chrome\//i.test(raw)) browser = 'Apple Safari';
  else if (/Firefox\//i.test(raw)) browser = 'Mozilla Firefox';
  else if (/MSIE|Trident/i.test(raw)) browser = 'Internet Explorer';
  else browser = 'Web Browser';

  let os = '';
  if (/Windows/i.test(raw)) os = 'Windows';
  else if (/iPhone|iPad|iPod/i.test(raw)) os = 'iOS';
  else if (/Mac OS X|Macintosh/i.test(raw)) os = 'macOS';
  else if (/Android/i.test(raw)) os = 'Android';
  else if (/Linux/i.test(raw)) os = 'Linux';

  if (browser && os) return `${browser} (${os})`;
  if (browser) return browser;
  if (os) return `Web Client (${os})`;
  return raw.length > 40 ? `${raw.slice(0, 37)}...` : raw;
}

/** Greedy word wrap that hard-splits any single word wider than the column. */
export function wrapText(
  text: string,
  font: PDFFont,
  size: number,
  maxWidth: number,
): string[] {
  const lines: string[] = [];

  for (const rawLine of text.split('\n')) {
    if (rawLine.trim() === '') {
      lines.push('');
      continue;
    }

    let current = '';
    for (const word of rawLine.split(/\s+/)) {
      const candidate = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        current = candidate;
        continue;
      }

      if (current) lines.push(current);

      if (font.widthOfTextAtSize(word, size) <= maxWidth) {
        current = word;
        continue;
      }

      let chunk = '';
      for (const ch of word) {
        if (chunk && font.widthOfTextAtSize(chunk + ch, size) > maxWidth) {
          lines.push(chunk);
          chunk = ch;
        } else {
          chunk += ch;
        }
      }
      current = chunk;
    }

    if (current) lines.push(current);
  }

  return lines;
}

function formatTimestamp(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, ' UTC');
}

function resolveSignatureDataUrl(
  signatureDataUrl: string | null,
): { kind: 'png' | 'jpeg' | 'auto'; dataUrl: string } | null {
  const raw = (signatureDataUrl ?? '').trim();
  if (!raw) return null;

  if (/^data:image\/png;base64,/i.test(raw)) return { kind: 'png', dataUrl: raw };
  if (/^data:image\/jpe?g;base64,/i.test(raw)) return { kind: 'jpeg', dataUrl: raw };
  if (/^data:image\/[a-z0-9.-]+;base64,/i.test(raw)) return { kind: 'auto', dataUrl: raw };

  // Some historical rows store bare base64 without data URI prefix.
  if (!raw.startsWith('data:') && raw.length > 100) {
    return { kind: 'auto', dataUrl: `data:image/png;base64,${raw}` };
  }

  return null;
}

/**
 * Loads the official WhatBoutMe brand logo bytes from standard locations.
 */
function loadBrandLogoBytes(): Uint8Array | null {
  const candidates: string[] = [
    path.join(process.cwd(), 'src', 'modules', 'agreements', 'assets', 'logo-dark.png'),
    path.join(process.cwd(), 'dist', 'modules', 'agreements', 'assets', 'logo-dark.png'),
    path.join(process.cwd(), '..', 'marketing', 'public', 'brand', 'logo-dark.png'),
    path.join(process.cwd(), 'apps', 'marketing', 'public', 'brand', 'logo-dark.png'),
    path.join(process.cwd(), '..', 'admin', 'public', 'brand', 'logo-dark.png'),
    path.join(process.cwd(), 'apps', 'admin', 'public', 'brand', 'logo-dark.png'),
  ];
  try {
    if (typeof __dirname !== 'undefined') {
      candidates.unshift(path.join(__dirname, 'assets', 'logo-dark.png'));
    }
  } catch {}
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) {
        return new Uint8Array(fs.readFileSync(p));
      }
    } catch {}
  }
  return null;
}

/**
 * Renders an authoritative, clean, executive legal agreement document.
 * Adheres to professional contract typography, fixed grid alignments,
 * structured clause hierarchy, and clean execution records.
 */
export async function renderSignedAgreementPdf(
  input: SignedAgreementPdfInput,
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const fontOblique = await pdf.embedFont(StandardFonts.HelveticaOblique);

  let pageNumber = 1;
  let page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let cursorY = PAGE_HEIGHT - MARGIN;

  const drawRunningHeader = (targetPage: PDFPage) => {
    targetPage.drawText(
      sanitizeForWinAnsi(input.programTitle || 'Program Participation Agreement'),
      {
        x: MARGIN,
        y: PAGE_HEIGHT - 28,
        size: 7.5,
        font: fontBold,
        color: COLOR_LABEL,
      },
    );
    targetPage.drawLine({
      start: { x: MARGIN, y: PAGE_HEIGHT - 33 },
      end: { x: PAGE_WIDTH - MARGIN, y: PAGE_HEIGHT - 33 },
      thickness: 0.5,
      color: COLOR_BORDER,
    });
  };

  const ensureSpace = (needed: number) => {
    if (cursorY - needed < BOTTOM_LIMIT) {
      page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      pageNumber += 1;
      drawRunningHeader(page);
      cursorY = PAGE_HEIGHT - MARGIN - 10;
    }
  };

  const drawParagraph = (
    text: string,
    options: {
      font?: PDFFont;
      size?: number;
      color?: ReturnType<typeof rgb>;
      gap?: number;
      indent?: number;
    } = {},
  ) => {
    const usedFont = options.font ?? font;
    const size = options.size ?? 8.5;
    const gap = options.gap ?? 2.8;
    const indent = options.indent ?? 0;
    const maxWidth = CONTENT_WIDTH - indent;
    const safe = sanitizeForWinAnsi(text);

    for (const line of wrapText(safe, usedFont, size, maxWidth)) {
      ensureSpace(size + gap);
      if (line) {
        page.drawText(line, {
          x: MARGIN + indent,
          y: cursorY - size,
          size,
          font: usedFont,
          color: options.color ?? COLOR_INK_BODY,
        });
      }
      cursorY -= size + gap;
    }
  };

  const drawSectionHeading = (title: string) => {
    ensureSpace(28);
    cursorY -= 8;
    page.drawText(sanitizeForWinAnsi(title), {
      x: MARGIN,
      y: cursorY - 10,
      size: 9.5,
      font: fontBold,
      color: COLOR_INK_PRIMARY,
    });
    cursorY -= 14;

    page.drawLine({
      start: { x: MARGIN, y: cursorY },
      end: { x: PAGE_WIDTH - MARGIN, y: cursorY },
      thickness: 0.5,
      color: COLOR_BORDER,
    });
    cursorY -= 8;
  };

  // ═════════════════════════════════════════════════════════════════════════════
  // 1. FORMAL DOCUMENT HEADER (Page 1)
  // ═════════════════════════════════════════════════════════════════════════════
  const logoBytes = loadBrandLogoBytes();
  let logoEmbedded = false;
  if (logoBytes) {
    try {
      const logoImage = await pdf.embedPng(logoBytes);
      const targetHeight = 18;
      const targetWidth = targetHeight * (logoImage.width / logoImage.height);
      page.drawImage(logoImage, {
        x: MARGIN,
        y: cursorY - targetHeight,
        width: targetWidth,
        height: targetHeight,
      });
      cursorY -= targetHeight + 10;
      logoEmbedded = true;
    } catch (err: any) {
      console.warn('[PDF] Failed to embed brand logo:', err?.message);
    }
  }
  if (!logoEmbedded) {
    page.drawText(sanitizeForWinAnsi('WHATBOUTME'), {
      x: MARGIN,
      y: cursorY - 10,
      size: 10,
      font: fontBold,
      color: COLOR_INK_PRIMARY,
    });
    cursorY -= 15;
  }

  page.drawText(
    sanitizeForWinAnsi(input.templateTitle || 'Program Participation & Workshop Agreement'),
    {
      x: MARGIN,
      y: cursorY - 14,
      size: 14.5,
      font: fontBold,
      color: COLOR_INK_PRIMARY,
    },
  );
  cursorY -= 20;

  // Header separator rule
  page.drawLine({
    start: { x: MARGIN, y: cursorY },
    end: { x: PAGE_WIDTH - MARGIN, y: cursorY },
    thickness: 1,
    color: COLOR_INK_PRIMARY,
  });
  cursorY -= 10;

  // ═════════════════════════════════════════════════════════════════════════════
  // 2. PARTICIPANT & ENROLMENT SCHEDULE (Clean Bordered Grid Table)
  // ═════════════════════════════════════════════════════════════════════════════
  const tableX = MARGIN;
  const tableW = CONTENT_WIDTH;
  const tableH = 54;
  const colMid = tableX + tableW / 2;

  ensureSpace(tableH + 10);

  // Table bounding box
  page.drawRectangle({
    x: tableX,
    y: cursorY - tableH,
    width: tableW,
    height: tableH,
    color: COLOR_PANEL_BG,
    borderColor: COLOR_BORDER,
    borderWidth: 0.75,
  });

  // Vertical center dividing line
  page.drawLine({
    start: { x: colMid, y: cursorY },
    end: { x: colMid, y: cursorY - tableH },
    thickness: 0.5,
    color: COLOR_BORDER,
  });

  // Fixed Column Coordinates for razor-sharp alignment
  const col1LabelX = tableX + 10;
  const col1ValueX = tableX + 96;
  const col2LabelX = colMid + 10;
  const col2ValueX = colMid + 86;

  let rowY = cursorY - 14;

  const drawTableRow = (
    label1: string,
    val1: string,
    label2: string,
    val2: string,
  ) => {
    // Left column
    page.drawText(sanitizeForWinAnsi(label1), {
      x: col1LabelX,
      y: rowY,
      size: 8,
      font: fontBold,
      color: COLOR_LABEL,
    });
    page.drawText(sanitizeForWinAnsi(val1), {
      x: col1ValueX,
      y: rowY,
      size: 8,
      font,
      color: COLOR_INK_PRIMARY,
    });

    // Right column
    page.drawText(sanitizeForWinAnsi(label2), {
      x: col2LabelX,
      y: rowY,
      size: 8,
      font: fontBold,
      color: COLOR_LABEL,
    });
    page.drawText(sanitizeForWinAnsi(val2), {
      x: col2ValueX,
      y: rowY,
      size: 8,
      font,
      color: COLOR_INK_PRIMARY,
    });

    rowY -= 14;
  };

  drawTableRow(
    'Participant Name:',
    input.typedName || '—',
    'Program Title:',
    input.programTitle || '—',
  );

  drawTableRow(
    'Account Email:',
    input.signerEmail || '—',
    'Signed Date:',
    formatTimestamp(input.signedAt),
  );

  drawTableRow(
    'Agreement ID:',
    input.agreementId || '—',
    'Legal Status:',
    'Executed & Legally Binding',
  );

  cursorY -= tableH + 10;

  // ═════════════════════════════════════════════════════════════════════════════
  // 3. OPERATIVE TERMS AND CONDITIONS
  // ═════════════════════════════════════════════════════════════════════════════
  drawSectionHeading('1. TERMS AND CONDITIONS');

  const rawTerms = input.agreementContent?.trim()
    ? input.agreementContent
    : 'No customized agreement text was provided for this program.';

  const paragraphs = rawTerms.split(/\n\s*\n/);
  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed) continue;

    // Detect Markdown Headings: # Heading, ## Heading, ### Heading
    const headingMatch = trimmed.match(/^(#{1,4})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const headingText = stripMarkdownFormatting(headingMatch[2].trim());
      const headingSize = level === 1 ? 10.5 : level === 2 ? 9.5 : 8.5;
      const topSpace = level === 1 ? 26 : 20;

      ensureSpace(topSpace);
      cursorY -= 4;
      page.drawText(sanitizeForWinAnsi(headingText), {
        x: MARGIN,
        y: cursorY - headingSize,
        size: headingSize,
        font: fontBold,
        color: COLOR_INK_PRIMARY,
      });
      cursorY -= headingSize + 5;
      continue;
    }

    // Split clause heading from clause body if structured with a title line
    const firstNewline = trimmed.indexOf('\n');
    const isNumberedTitle = /^\d+\.\s+/.test(trimmed);

    if (isNumberedTitle && firstNewline !== -1) {
      const heading = stripMarkdownFormatting(trimmed.slice(0, firstNewline).trim());
      const body = stripMarkdownFormatting(trimmed.slice(firstNewline + 1).trim());

      ensureSpace(24);
      cursorY -= 3;
      page.drawText(sanitizeForWinAnsi(heading), {
        x: MARGIN,
        y: cursorY - 9,
        size: 8.5,
        font: fontBold,
        color: COLOR_INK_PRIMARY,
      });
      cursorY -= 13;

      drawParagraph(body, {
        size: 8,
        color: COLOR_INK_BODY,
        gap: 2.5,
        indent: 10,
      });
      cursorY -= 4;
    } else if (isNumberedTitle) {
      // Single line numbered clause
      ensureSpace(18);
      cursorY -= 2;
      page.drawText(sanitizeForWinAnsi(stripMarkdownFormatting(trimmed)), {
        x: MARGIN,
        y: cursorY - 9,
        size: 8.5,
        font: fontBold,
        color: COLOR_INK_PRIMARY,
      });
      cursorY -= 13;
    } else {
      // Check if bullet lines
      const lines = trimmed.split('\n');
      const isBulletBlock = lines.every((l) => /^\s*[-*]\s+/.test(l));
      if (isBulletBlock) {
        for (const line of lines) {
          const itemText = stripMarkdownFormatting(line.replace(/^\s*[-*]\s+/, '').trim());
          drawParagraph(`• ${itemText}`, {
            size: 8,
            color: COLOR_INK_BODY,
            gap: 2.5,
            indent: 8,
          });
        }
        cursorY -= 3;
      } else {
        // Standard narrative clause paragraph
        drawParagraph(stripMarkdownFormatting(trimmed), {
          size: 8,
          color: COLOR_INK_BODY,
          gap: 2.5,
        });
        cursorY -= 4;
      }
    }
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // 4. ACKNOWLEDGMENT & DIGITAL EXECUTION BLOCK
  // ═════════════════════════════════════════════════════════════════════════════
  const executionHeight = 145;
  ensureSpace(executionHeight);

  cursorY -= 6;
  drawSectionHeading('2. ACKNOWLEDGMENT & DIGITAL SIGNATURE');

  // Verbatim consent statement affirmation
  const consentText = input.consentStatement?.trim() || DEFAULT_CONSENT_STATEMENT;
  drawParagraph(consentText, {
    font,
    size: 7.5,
    color: COLOR_INK_BODY,
    gap: 2.2,
  });
  cursorY -= 8;

  // Two-column Execution & Verification Grid
  const execBoxY = cursorY;
  const execBoxH = 70;
  const execMidX = MARGIN + CONTENT_WIDTH * 0.52;

  // Left Side: Participant Signature Box
  const resolvedSignature = resolveSignatureDataUrl(input.signatureDataUrl);
  let signatureEmbedded = false;

  if (resolvedSignature) {
    try {
      const base64Data = resolvedSignature.dataUrl.replace(
        /^data:image\/[a-z0-9.-]+;base64,/i,
        '',
      );
      const rawBuffer = Buffer.from(base64Data, 'base64');
      const imageBytes = new Uint8Array(rawBuffer.length);
      imageBytes.set(rawBuffer);

      const isJpg =
        imageBytes.length >= 3 &&
        imageBytes[0] === 0xff &&
        imageBytes[1] === 0xd8 &&
        imageBytes[2] === 0xff;

      let image: PDFImage | null = null;
      if (isJpg || resolvedSignature.kind === 'jpeg') {
        image = await pdf.embedJpg(imageBytes).catch(() => null);
        if (!image) image = await pdf.embedPng(imageBytes).catch(() => null);
      } else {
        image = await pdf.embedPng(imageBytes).catch(() => null);
        if (!image) image = await pdf.embedJpg(imageBytes).catch(() => null);
      }

      if (image) {
        const maxWidth = 190;
        const maxHeight = 34;
        const scale = Math.min(maxWidth / image.width, maxHeight / image.height, 1);
        const width = image.width * scale;
        const height = image.height * scale;

        page.drawImage(image, {
          x: MARGIN,
          y: execBoxY - 36 - ((height - 28) / 2),
          width,
          height,
        });
        signatureEmbedded = true;
      }
    } catch (err: any) {
      console.warn('[renderSignedAgreementPdf] Failed to embed signature:', err?.message);
    }
  }

  if (!signatureEmbedded) {
    page.drawText(sanitizeForWinAnsi('[ Electronic Signature Captured on File ]'), {
      x: MARGIN,
      y: execBoxY - 26,
      size: 8,
      font: fontOblique,
      color: COLOR_LABEL,
    });
  }

  // Formal Signature Baseline
  page.drawLine({
    start: { x: MARGIN, y: execBoxY - 40 },
    end: { x: MARGIN + 210, y: execBoxY - 40 },
    thickness: 0.75,
    color: COLOR_INK_PRIMARY,
  });

  page.drawText(sanitizeForWinAnsi(`Signed by: ${input.typedName || 'Participant'}`), {
    x: MARGIN,
    y: execBoxY - 50,
    size: 8,
    font: fontBold,
    color: COLOR_INK_PRIMARY,
  });

  page.drawText(sanitizeForWinAnsi(`Signed At: ${formatTimestamp(input.signedAt)}`), {
    x: MARGIN,
    y: execBoxY - 60,
    size: 7.5,
    font,
    color: COLOR_LABEL,
  });

  // Right Side: Digital Verification Record Panel
  const panelW = CONTENT_WIDTH - (execMidX - MARGIN);
  page.drawRectangle({
    x: execMidX,
    y: execBoxY - execBoxH + 4,
    width: panelW,
    height: execBoxH - 4,
    color: COLOR_PANEL_BG,
    borderColor: COLOR_BORDER,
    borderWidth: 0.75,
  });

  let panelY = execBoxY - 14;
  page.drawText(sanitizeForWinAnsi('DIGITAL VERIFICATION AUDIT RECORD'), {
    x: execMidX + 10,
    y: panelY,
    size: 7.5,
    font: fontBold,
    color: COLOR_INK_PRIMARY,
  });

  panelY -= 12;
  const ackText = (input.typedAcknowledgement || 'I AGREE').trim();
  page.drawText(sanitizeForWinAnsi(`Typed Confirmation: "${ackText}"`), {
    x: execMidX + 10,
    y: panelY,
    size: 7.5,
    font: fontBold,
    color: COLOR_INK_PRIMARY,
  });

  panelY -= 11;
  page.drawText(
    sanitizeForWinAnsi(
      `Capture: ${input.signatureType === 'UPLOADED' ? 'Uploaded Image' : 'Drawn Signature'}`,
    ),
    {
      x: execMidX + 10,
      y: panelY,
      size: 7,
      font,
      color: COLOR_LABEL,
    },
  );

  panelY -= 10;
  page.drawText(sanitizeForWinAnsi(`Signer IP: ${input.signerIp || '127.0.0.1'}`), {
    x: execMidX + 10,
    y: panelY,
    size: 7,
    font,
    color: COLOR_LABEL,
  });

  panelY -= 10;
  page.drawText(sanitizeForWinAnsi(`Environment: ${formatUserAgent(input.userAgent)}`), {
    x: execMidX + 10,
    y: panelY,
    size: 7,
    font,
    color: COLOR_LABEL,
  });

  cursorY = execBoxY - execBoxH - 12;

  // ═════════════════════════════════════════════════════════════════════════════
  // 5. RUNNING FOOTER (Across all pages)
  // ═════════════════════════════════════════════════════════════════════════════
  const pages = pdf.getPages();
  pages.forEach((currentPage, index) => {
    currentPage.drawLine({
      start: { x: MARGIN, y: FOOTER_Y + 12 },
      end: { x: PAGE_WIDTH - MARGIN, y: FOOTER_Y + 12 },
      thickness: 0.5,
      color: COLOR_BORDER,
    });

    currentPage.drawText(
      sanitizeForWinAnsi('Program Participation & Workshop Agreement | Official Legal Record'),
      {
        x: MARGIN,
        y: FOOTER_Y,
        size: 7.5,
        font,
        color: COLOR_LABEL,
      },
    );

    const pageLabel = `Page ${index + 1} of ${pages.length}`;
    const labelW = font.widthOfTextAtSize(pageLabel, 7.5);
    currentPage.drawText(pageLabel, {
      x: PAGE_WIDTH - MARGIN - labelW,
      y: FOOTER_Y,
      size: 7.5,
      font: fontBold,
      color: COLOR_LABEL,
    });
  });

  return pdf.save();
}
