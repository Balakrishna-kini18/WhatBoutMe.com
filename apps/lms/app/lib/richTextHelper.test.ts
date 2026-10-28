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
});
