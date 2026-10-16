import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFImage,
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
const MARGIN = 56;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const FOOTER_Y = 36;
const BOTTOM_LIMIT = MARGIN + 24;

const INK = rgb(0.1, 0.1, 0.11);
const MUTED = rgb(0.45, 0.45, 0.47);
const RULE = rgb(0.85, 0.83, 0.79);

/**
 * The PDF standard fonts use WinAnsi encoding, which cannot represent every
 * Unicode code point. Unmapped characters throw during `drawText`, so
 * typographic punctuation is mapped to ASCII and anything else becomes `?`
 * rather than crashing generation for an otherwise valid agreement.
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
  return date.toISOString().replace('T', ' ').replace('.000Z', ' UTC');
}

function resolveSignatureDataUrl(
  signatureDataUrl: string | null,
): { kind: 'png' | 'jpeg'; dataUrl: string } | null {
  const raw = (signatureDataUrl ?? '').trim();
  if (!raw) return null;

  if (/^data:image\/png;base64,/i.test(raw)) return { kind: 'png', dataUrl: raw };
  if (/^data:image\/jpe?g;base64,/i.test(raw)) return { kind: 'jpeg', dataUrl: raw };

  // Some historical rows store bare base64 without the data-URI prefix.
  if (!raw.startsWith('data:') && raw.length > 100) {
    return { kind: 'png', dataUrl: `data:image/png;base64,${raw}` };
  }

  return null;
}

/**
 * Renders a signed agreement record to a self-contained A4 PDF.
 *
 * Runs synchronously on demand (the admin download is low-volume); it does not
 * touch object storage, BullMQ, or the database schema.
 */
export async function renderSignedAgreementPdf(
  input: SignedAgreementPdfInput,
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  let page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let cursorY = PAGE_HEIGHT - MARGIN;

  const ensureSpace = (needed: number) => {
    if (cursorY - needed < BOTTOM_LIMIT) {
      page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      cursorY = PAGE_HEIGHT - MARGIN;
    }
  };

  const drawParagraph = (
    text: string,
    options: { font?: PDFFont; size?: number; color?: ReturnType<typeof rgb>; gap?: number } = {},
  ) => {
    const usedFont = options.font ?? font;
    const size = options.size ?? 10;
    const gap = options.gap ?? 4;
    const safe = sanitizeForWinAnsi(text);

    for (const line of wrapText(safe, usedFont, size, CONTENT_WIDTH)) {
      ensureSpace(size + gap);
      if (line) {
        page.drawText(line, {
          x: MARGIN,
          y: cursorY - size,
          size,
          font: usedFont,
          color: options.color ?? INK,
        });
      }
      cursorY -= size + gap;
    }
  };

  const drawAuditRow = (label: string, value: string) => {
    const size = 9.5;
    ensureSpace(size + 5);
    page.drawText(sanitizeForWinAnsi(label), {
      x: MARGIN,
      y: cursorY - size,
      size,
      font: fontBold,
      color: MUTED,
    });
    const labelWidth = fontBold.widthOfTextAtSize(sanitizeForWinAnsi(label), size);
    const valueX = MARGIN + Math.max(labelWidth + 10, 150);

    const valueLines = wrapText(
      sanitizeForWinAnsi(value || '—'),
      font,
      size,
      PAGE_WIDTH - MARGIN - valueX,
    );

    valueLines.forEach((line, index) => {
      if (index > 0) ensureSpace(size + 5);
      page.drawText(line, {
        x: valueX,
        y: cursorY - size,
        size,
        font,
        color: INK,
      });
      if (index < valueLines.length - 1) cursorY -= size + 5;
    });

    cursorY -= size + 5;
  };

  const drawSectionTitle = (text: string) => {
    ensureSpace(34);
    cursorY -= 8;
    page.drawText(sanitizeForWinAnsi(text), {
      x: MARGIN,
      y: cursorY - 11,
      size: 11.5,
      font: fontBold,
      color: INK,
    });
    cursorY -= 16;
    page.drawLine({
      start: { x: MARGIN, y: cursorY },
      end: { x: PAGE_WIDTH - MARGIN, y: cursorY },
      thickness: 0.75,
      color: RULE,
    });
    cursorY -= 14;
  };

  // ── Header ────────────────────────────────────────────────────────────────
  drawParagraph(input.templateTitle || 'Program Agreement', {
    font: fontBold,
    size: 17,
    gap: 6,
  });
  drawParagraph(
    `${input.programTitle} · Version ${input.templateVersion}`,
    { size: 9.5, color: MUTED, gap: 5 },
  );
  cursorY -= 6;
  page.drawLine({
    start: { x: MARGIN, y: cursorY },
    end: { x: PAGE_WIDTH - MARGIN, y: cursorY },
    thickness: 1,
    color: RULE,
  });
  cursorY -= 18;

  // ── Audit block ───────────────────────────────────────────────────────────
  drawSectionTitle('Signature & Consent Audit Record');
  drawAuditRow('Legal name', input.typedName ?? '—');
  drawAuditRow('Account email', input.signerEmail ?? '—');
  drawAuditRow('Signature method', input.signatureType === 'UPLOADED' ? 'Uploaded image' : 'Drawn signature');
  drawAuditRow('Agreement version', input.templateVersion);
  drawAuditRow('Consent version', input.consentVersion ?? input.templateVersion);
  drawAuditRow('Consent recorded', formatTimestamp(input.consentTimestamp));
  drawAuditRow('Signed at', formatTimestamp(input.signedAt));
  drawAuditRow('Signer IP', input.signerIp ?? '—');
  drawAuditRow('User agent', input.userAgent ?? '—');

  // ── Digital Consent Statement (verbatim) ──────────────────────────────────
  cursorY -= 4;
  drawSectionTitle('Digital Consent & Acknowledgement');
  drawParagraph(
    input.consentStatement?.trim() || DEFAULT_CONSENT_STATEMENT,
    { size: 9, gap: 3.5, color: INK },
  );
  cursorY -= 6;


  // ── Signature image (best-effort) ─────────────────────────────────────────
  const resolvedSignature = resolveSignatureDataUrl(input.signatureDataUrl);
  if (resolvedSignature) {
    let image: PDFImage | null = null;
    try {
      image =
        resolvedSignature.kind === 'jpeg'
          ? await pdf.embedJpg(resolvedSignature.dataUrl)
          : await pdf.embedPng(resolvedSignature.dataUrl);
    } catch {
      image = null;
    }

    if (image) {
      const maxWidth = 220;
      const maxHeight = 90;
      const scale = Math.min(maxWidth / image.width, maxHeight / image.height, 1);
      const width = image.width * scale;
      const height = image.height * scale;

      ensureSpace(height + 14);
      page.drawImage(image, {
        x: MARGIN,
        y: cursorY - height,
        width,
        height,
      });
      cursorY -= height + 8;
      drawParagraph('Signature captured at signing time.', {
        size: 8,
        color: MUTED,
        gap: 4,
      });
    }
  }

  // ── Agreement body (verbatim) ─────────────────────────────────────────────
  cursorY -= 6;
  drawSectionTitle('Agreement Terms');
  drawParagraph(input.agreementContent, { size: 10, gap: 4.5 });

  // ── Footer page numbers ───────────────────────────────────────────────────
  const pages = pdf.getPages();
  pages.forEach((currentPage, index) => {
    currentPage.drawText(
      sanitizeForWinAnsi('whatboutme.com — signed agreement record'),
      { x: MARGIN, y: FOOTER_Y, size: 8, font, color: MUTED },
    );
    const label = `Page ${index + 1} of ${pages.length}`;
    const labelWidth = font.widthOfTextAtSize(label, 8);
    currentPage.drawText(label, {
      x: PAGE_WIDTH - MARGIN - labelWidth,
      y: FOOTER_Y,
      size: 8,
      font,
      color: MUTED,
    });
  });

  return pdf.save();
}
