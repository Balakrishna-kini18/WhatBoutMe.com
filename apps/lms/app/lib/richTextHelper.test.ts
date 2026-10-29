import { describe, it, expect } from 'vitest';
import {
  isEditorEmpty,
  stripHtmlToPlainText,
  markdownToHtml,
  sanitizeNoteHtml,
} from './richTextHelper';

describe('richTextHelper', () => {
  it('detects empty editor content accurately', () => {
    expect(isEditorEmpty('')).toBe(true);
    expect(isEditorEmpty('<p><br></p>')).toBe(true);
    expect(isEditorEmpty('   ')).toBe(true);
    expect(isEditorEmpty('&nbsp;&nbsp;')).toBe(true);
    expect(isEditorEmpty('<p>&nbsp;</p>')).toBe(true);
    expect(isEditorEmpty('<p>Real note text</p>')).toBe(false);
    expect(isEditorEmpty('Some insights')).toBe(false);
  });

  it('strips HTML and markdown formatting to plain text', () => {
    const html = '<h2>My Title</h2><p>Here is <strong>bold</strong> and <em>italic</em>.</p>';
    expect(stripHtmlToPlainText(html)).toBe('My Title Here is bold and italic.');

    const markdown = '## Heading\n**Takeaway:** Always meditate.';
    expect(stripHtmlToPlainText(markdown)).toBe('Heading Takeaway: Always meditate.');
  });

  it('converts legacy markdown into clean visual HTML without programmer symbols', () => {
    const input = `## Core Insight
### Sub-point
**Bold statement** and *italic concept*
- First item
- Second item
1. Step one
2. Step two`;

    const html = markdownToHtml(input);
    expect(html).toContain('<h2>Core Insight</h2>');
    expect(html).toContain('<h3>Sub-point</h3>');
    expect(html).toContain('<strong>Bold statement</strong>');
    expect(html).toContain('<em>italic concept</em>');
    expect(html).toContain('<ul><li>First item</li><li>Second item</li></ul>');
    expect(html).toContain('<ol><li>Step one</li><li>Step two</li></ol>');
    expect(html).not.toContain('##');
    expect(html).not.toContain('**');
  });

  it('removes code fences completely (no developer tokens for learners)', () => {
    const input = '```\nconsole.log("hello");\n```\nRemember to stay hydrated.';
    const html = markdownToHtml(input);
    expect(html).not.toContain('```');
    expect(html).toContain('Remember to stay hydrated.');
  });

  it('passes existing HTML through cleanly', () => {
    const html = '<p>Already rich <strong>text</strong></p>';
    expect(markdownToHtml(html)).toBe(html);
  });

  it('sanitizes script tags from notes', () => {
    const dangerous = '<p>Safe note</p><script>alert("hack")</script>';
    const cleaned = sanitizeNoteHtml(dangerous);
    expect(cleaned).not.toContain('<script>');
    expect(cleaned).toContain('Safe note');
  });

  it('neutralizes unquoted event handlers, svg, iframe, and dangerous style exploits', () => {
    const imgPayload = '<p>Note text</p><img src=x onerror=alert(1)>';
    const cleanedImg = sanitizeNoteHtml(imgPayload);
    expect(cleanedImg).not.toContain('onerror');
    expect(cleanedImg).not.toContain('<img');
    expect(cleanedImg).toContain('Note text');

    const svgPayload = '<h3>Insight</h3><svg onload=alert(2)><circle r=10/></svg>';
    const cleanedSvg = sanitizeNoteHtml(svgPayload);
    expect(cleanedSvg).not.toContain('onload');
    expect(cleanedSvg).not.toContain('<svg');
    expect(cleanedSvg).toContain('<h3>Insight</h3>');

    const iframePayload = '<iframe src="javascript:alert(3)"></iframe><p>Lesson learned</p>';
    const cleanedIframe = sanitizeNoteHtml(iframePayload);
    expect(cleanedIframe).not.toContain('<iframe');
    expect(cleanedIframe).toContain('<p>Lesson learned</p>');

    const badStyle = '<span style="background: url(http://evil.com/xss); position: fixed;">Text</span>';
    const cleanedStyle = sanitizeNoteHtml(badStyle);
    expect(cleanedStyle).not.toContain('url');
    expect(cleanedStyle).not.toContain('position');
  });

  it('ensures markdownToHtml sanitizes incoming HTML input', () => {
    const rawHtmlWithXss = '<p>Key thought <img src=x onerror=alert("xss")></p>';
    const converted = markdownToHtml(rawHtmlWithXss);
    expect(converted).not.toContain('onerror');
    expect(converted).not.toContain('<img');
    expect(converted).toContain('Key thought');
  });

  it('converts programmer-syntax tags like <u>***Text** *</u> into user-understandable visual formatting', () => {
    const input1 = '<u>***Text** *</u>';
    const html1 = markdownToHtml(input1);
    expect(html1).toContain('<u>');
    expect(html1).toContain('<strong>');
    expect(html1).toContain('<em>Text</em>');
    expect(html1).not.toContain('***');
    expect(html1).not.toContain('**');

    const input2 = '<u>***Text** \n*\n</u>';
    const html2 = markdownToHtml(input2);
    expect(html2).toContain('<u>');
    expect(html2).toContain('Text');
    expect(html2).not.toContain('***');

    const input3 = '<u>**Bold Underlined**</u>';
    const html3 = markdownToHtml(input3);
    expect(html3).toContain('<u><strong>Bold Underlined</strong></u>');

    const input4 = '<p>Here is **bold** text</p>';
    const html4 = markdownToHtml(input4);
    expect(html4).toBe('<p>Here is <strong>bold</strong> text</p>');
  });
});
