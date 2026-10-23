import { describe, it, expect } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import {
  renderSignedAgreementPdf,
  sanitizeForWinAnsi,
  stripMarkdownFormatting,
  type SignedAgreementPdfInput,
} from './signed-agreement-pdf.js';

const baseInput: SignedAgreementPdfInput = {
  templateTitle: 'Program Agreement & Digital Consent',
  templateVersion: 'v1.0',
  programTitle: '11 Steps to U',
  typedName: 'Ada Lovelace',
  signerEmail: 'ada@example.com',
  consentVersion: 'v1.0',
  consentTimestamp: '2026-10-15T12:00:00.000Z',
  signedAt: '2026-10-15T12:00:05.000Z',
  signatureType: 'DRAWN',
  signerIp: '203.0.113.7',
  userAgent: 'Mozilla/5.0',
  agreementContent: 'These are the terms.',
  signatureDataUrl: null,
};

const magic = (bytes: Uint8Array) => new TextDecoder().decode(bytes.slice(0, 5));

describe('renderSignedAgreementPdf', () => {
  it('produces a parseable PDF document', async () => {
    const bytes = await renderSignedAgreementPdf(baseInput);
    expect(magic(bytes)).toBe('%PDF-');

    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);
  });

  it('paginates a very long agreement body across more than one page', async () => {
    const longBody = Array.from(
      { length: 900 },
      (_, i) =>
        `Clause ${i + 1}: ${'The learner agrees to the terms set out in this agreement. '.repeat(3)}`,
    ).join('\n');

    expect(longBody.length).toBeGreaterThan(60_000);

    const bytes = await renderSignedAgreementPdf({
      ...baseInput,
      agreementContent: longBody,
    });

    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBeGreaterThan(1);
  });

  it('does not crash on characters the standard fonts cannot encode', async () => {
    const bytes = await renderSignedAgreementPdf({
      ...baseInput,
      agreementContent: 'Emoji \u{1F600} and curly “quotes” — dashes \u2026 done.',
    });
    expect(magic(bytes)).toBe('%PDF-');
  });

  it('still renders when audit fields are missing', async () => {
    const bytes = await renderSignedAgreementPdf({
      ...baseInput,
      typedName: null,
      signerEmail: null,
      consentVersion: null,
      consentTimestamp: null,
      signedAt: null,
      signerIp: null,
      userAgent: null,
      agreementContent: '',
    });
    expect(magic(bytes)).toBe('%PDF-');
  });

  it('renders with custom or default verbatim consent statement', async () => {
    const bytes = await renderSignedAgreementPdf({
      ...baseInput,
      consentStatement: 'Digital Consent: Custom verbatim consent wording provided by program.',
    });
    expect(magic(bytes)).toBe('%PDF-');
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);
  });

  it('renders and embeds an uploaded JPEG signature data URL', async () => {
    const jpegDataUrl =
      'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';
    const bytesWithoutSig = await renderSignedAgreementPdf({
      ...baseInput,
      signatureType: 'UPLOADED',
      signatureDataUrl: null,
    });
    const bytesWithSig = await renderSignedAgreementPdf({
      ...baseInput,
      signatureType: 'UPLOADED',
      signatureDataUrl: jpegDataUrl,
    });
    expect(magic(bytesWithSig)).toBe('%PDF-');
    expect(bytesWithSig.length).toBeGreaterThan(bytesWithoutSig.length);
    const doc = await PDFDocument.load(bytesWithSig);
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);
  });

  it('renders and embeds an uploaded PNG signature data URL', async () => {
    const pngDataUrl =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const bytesWithoutSig = await renderSignedAgreementPdf({
      ...baseInput,
      signatureType: 'DRAWN',
      signatureDataUrl: null,
    });
    const bytesWithSig = await renderSignedAgreementPdf({
      ...baseInput,
      signatureType: 'DRAWN',
      signatureDataUrl: pngDataUrl,
    });
    expect(magic(bytesWithSig)).toBe('%PDF-');
    expect(bytesWithSig.length).toBeGreaterThan(bytesWithoutSig.length);
    const doc = await PDFDocument.load(bytesWithSig);
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);
  });

  it('renders markdown headings, lists, and formatted text cleanly in PDF', async () => {
    const markdownContent = `
# Workshop Terms & Agreement
Welcome to the program. Please read carefully.

## 1. Attendance & Conduct
All participants are expected to attend scheduled sessions.

- Respect instructors and fellow learners
- Do not record or distribute course material
- Maintain academic honesty

### 1.1 Non-Disclosure
You agree **not to share** confidential program resources. For details see [Terms](https://whatboutme.com/terms).
`;
    const bytes = await renderSignedAgreementPdf({
      ...baseInput,
      agreementContent: markdownContent,
    });
    expect(magic(bytes)).toBe('%PDF-');
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);
  });
});

describe('stripMarkdownFormatting', () => {
  it('strips bold and italic asterisks and underscores', () => {
    expect(stripMarkdownFormatting('This is **bold** and *italic* text.')).toBe(
      'This is bold and italic text.',
    );
    expect(stripMarkdownFormatting('This is __bold__ and _italic_ text.')).toBe(
      'This is bold and italic text.',
    );
  });

  it('converts markdown links to readable text', () => {
    expect(stripMarkdownFormatting('Review our [Terms](https://whatboutme.com/terms).')).toBe(
      'Review our Terms (https://whatboutme.com/terms).',
    );
  });

  it('strips inline code backticks', () => {
    expect(stripMarkdownFormatting('Use the `code` block.')).toBe(
      'Use the code block.',
    );
  });
});

describe('sanitizeForWinAnsi', () => {
  it('maps typographic punctuation to ASCII', () => {
    expect(sanitizeForWinAnsi('“smart” — dash \u2026 ok')).toBe(
      '"smart" -- dash ... ok',
    );
  });

  it('replaces unencodable code points with a placeholder', () => {
    expect(sanitizeForWinAnsi('a\u{1F600}b')).toBe('a?b');
  });

  it('keeps latin-1 accented characters', () => {
    expect(sanitizeForWinAnsi('café')).toBe('café');
  });
});

