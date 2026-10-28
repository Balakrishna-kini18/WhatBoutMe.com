// apps/lms/app/components/notes/VisualRichTextEditor.tsx
'use client';

import React, { useRef, useEffect, useState, useCallback } from 'react';
import styles from './richNoteEditor.module.css';
import { markdownToHtml, isEditorEmpty, stripHtmlToPlainText } from '../../lib/richTextHelper';

interface VisualRichTextEditorProps {
  initialContent: string;
  onChange: (htmlContent: string, plainText: string) => void;
  placeholder?: string;
  minHeight?: number;
  autoFocus?: boolean;
}

export function VisualRichTextEditor({
  initialContent,
  onChange,
  placeholder = 'Write your thoughts, reflections, insights, or key takeaways here...',
  minHeight = 180,
  autoFocus = false,
}: VisualRichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const isInitializedRef = useRef(false);

  // Active format state for toolbar feedback
  const [isBold, setIsBold] = useState(false);
  const [isItalic, setIsItalic] = useState(false);
  const [setIsUnderlineState, setIsUnderline] = useState(false);
  const [isBullet, setIsBullet] = useState(false);
  const [isNumbered, setIsNumbered] = useState(false);
  const [currentBlock, setCurrentBlock] = useState<'p' | 'h2' | 'h3' | 'blockquote'>('p');
  const [isEmpty, setIsEmpty] = useState(true);

  // Syncs editor state and triggers parent onChange
  const triggerUpdate = useCallback(() => {
    if (!editorRef.current) return;
    const html = editorRef.current.innerHTML;
    const text = stripHtmlToPlainText(editorRef.current.innerText || editorRef.current.textContent || '');
    const empty = isEditorEmpty(html);
    setIsEmpty(empty);
    onChange(empty ? '' : html, text);
  }, [onChange]);

  // Inspects current cursor/selection formatting
  const checkActiveFormats = useCallback(() => {
    if (typeof document === 'undefined') return;
    try {
      setIsBold(document.queryCommandState('bold'));
      setIsItalic(document.queryCommandState('italic'));
      setIsUnderline(document.queryCommandState('underline'));
      setIsBullet(document.queryCommandState('insertUnorderedList'));
      setIsNumbered(document.queryCommandState('insertOrderedList'));

      const blockValue = (document.queryCommandValue('formatBlock') || '').toLowerCase();
      if (blockValue.includes('h2')) {
        setCurrentBlock('h2');
      } else if (blockValue.includes('h3')) {
        setCurrentBlock('h3');
      } else if (blockValue.includes('blockquote')) {
        setCurrentBlock('blockquote');
      } else {
        setCurrentBlock('p');
      }
    } catch {
      // Query command may safely throw if selection is outside
    }
  }, []);

  // Initialize or re-populate editor content
  useEffect(() => {
    if (!editorRef.current) return;

    // Convert any legacy markdown or raw text to clean semantic HTML
    const formattedHtml = markdownToHtml(initialContent || '');

    // Only update innerHTML if it differs from current content to prevent cursor jumping
    if (!isInitializedRef.current || (initialContent && editorRef.current.innerHTML !== formattedHtml)) {
      editorRef.current.innerHTML = formattedHtml;
      setIsEmpty(isEditorEmpty(formattedHtml));
      isInitializedRef.current = true;
    }

    if (autoFocus && editorRef.current) {
      editorRef.current.focus();
    }
  }, [initialContent, autoFocus]);

  // Keep track of selection changes for active formatting indicators
  useEffect(() => {
    const handleSelectionChange = () => {
      if (editorRef.current && document.activeElement === editorRef.current) {
        checkActiveFormats();
      }
    };
    document.addEventListener('selectionchange', handleSelectionChange);
    return () => {
      document.removeEventListener('selectionchange', handleSelectionChange);
    };
  }, [checkActiveFormats]);

  // Execute formatting command safely
  const executeCommand = (command: string, value: string | undefined = undefined) => {
    if (!editorRef.current) return;
    editorRef.current.focus();
    document.execCommand(command, false, value);
    triggerUpdate();
    checkActiveFormats();
  };

  // Block format dropdown change (Normal, Large Heading, Medium Heading, Quote)
  const handleBlockChange = (tag: 'p' | 'h2' | 'h3' | 'blockquote') => {
    if (!editorRef.current) return;
    editorRef.current.focus();
    setCurrentBlock(tag);
    if (tag === 'p') {
      document.execCommand('formatBlock', false, '<p>');
    } else if (tag === 'h2') {
      document.execCommand('formatBlock', false, '<h2>');
    } else if (tag === 'h3') {
      document.execCommand('formatBlock', false, '<h3>');
    } else if (tag === 'blockquote') {
      document.execCommand('formatBlock', false, '<blockquote>');
    }
    triggerUpdate();
    checkActiveFormats();
  };

  // Highlight action with soft yellow background
  const handleHighlight = () => {
    if (!editorRef.current) return;
    editorRef.current.focus();
    const currentColor = document.queryCommandValue('hiliteColor');
    if (currentColor && currentColor !== 'transparent' && currentColor !== 'rgba(0, 0, 0, 0)') {
      document.execCommand('hiliteColor', false, 'transparent');
    } else {
      document.execCommand('hiliteColor', false, '#fef08a');
    }
    triggerUpdate();
    checkActiveFormats();
  };

  // Clear formatting
  const handleClearFormat = () => {
    if (!editorRef.current) return;
    editorRef.current.focus();
    document.execCommand('removeFormat', false);
    document.execCommand('formatBlock', false, '<p>');
    setCurrentBlock('p');
    triggerUpdate();
    checkActiveFormats();
  };

  // Keyboard shortcuts (Ctrl/Cmd + B, I, U)
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.metaKey || e.ctrlKey) {
      if (e.key === 'b' || e.key === 'B') {
        e.preventDefault();
        executeCommand('bold');
      } else if (e.key === 'i' || e.key === 'I') {
        e.preventDefault();
        executeCommand('italic');
      } else if (e.key === 'u' || e.key === 'U') {
        e.preventDefault();
        executeCommand('underline');
      }
    }
  };

  return (
    <div className={styles.toolbarBox}>
      {/* HUMAN-FRIENDLY VISUAL TOOLBAR */}
      <div className={styles.toolbar} role="toolbar" aria-label="Text formatting options">
        {/* Style Dropdown */}
        <select
          value={currentBlock}
          onChange={(e) => handleBlockChange(e.target.value as any)}
          className={styles.toolSelect}
          title="Paragraph / Heading Style"
          aria-label="Text Style"
        >
          <option value="p">Normal Text</option>
          <option value="h2">Large Heading</option>
          <option value="h3">Medium Heading</option>
          <option value="blockquote">Quote</option>
        </select>

        <span className={styles.toolDivider} />

        {/* Bold */}
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            executeCommand('bold');
          }}
          className={`${styles.toolBtn} ${isBold ? styles.toolBtnActive : ''}`}
          title="Bold (Ctrl+B)"
          aria-label="Bold text"
        >
          <strong>B</strong>
        </button>

        {/* Italic */}
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            executeCommand('italic');
          }}
          className={`${styles.toolBtn} ${isItalic ? styles.toolBtnActive : ''}`}
          style={{ fontStyle: 'italic' }}
          title="Italic (Ctrl+I)"
          aria-label="Italic text"
        >
          <em>I</em>
        </button>

        {/* Underline */}
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            executeCommand('underline');
          }}
          className={`${styles.toolBtn} ${setIsUnderlineState ? styles.toolBtnActive : ''}`}
          style={{ textDecoration: 'underline' }}
          title="Underline (Ctrl+U)"
          aria-label="Underline text"
        >
          <u>U</u>
        </button>

        {/* Soft Highlighter */}
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            handleHighlight();
          }}
          className={styles.toolBtn}
          title="Highlight Takeaway"
          aria-label="Highlight takeaway"
        >
          🖍️ Highlight
        </button>

        <span className={styles.toolDivider} />

        {/* Bullet List */}
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            executeCommand('insertUnorderedList');
          }}
          className={`${styles.toolBtn} ${isBullet ? styles.toolBtnActive : ''}`}
          title="Bullet List"
          aria-label="Bullet list"
        >
          • Bullet List
        </button>

        {/* Numbered List */}
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            executeCommand('insertOrderedList');
          }}
          className={`${styles.toolBtn} ${isNumbered ? styles.toolBtnActive : ''}`}
          title="Numbered List"
          aria-label="Numbered list"
        >
          1. Numbered List
        </button>

        <span className={styles.toolDivider} />

        {/* Clear formatting */}
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            handleClearFormat();
          }}
          className={styles.toolBtn}
          title="Clear formatting"
          aria-label="Clear formatting"
        >
          ✕ Clear
        </button>
      </div>

      {/* VISUAL DOCUMENT SURFACE */}
      <div className={styles.editorCanvasWrapper}>
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          onInput={triggerUpdate}
          onKeyUp={checkActiveFormats}
          onMouseUp={checkActiveFormats}
          onKeyDown={handleKeyDown}
          style={{ minHeight }}
          className={styles.editorCanvas}
          role="textbox"
          aria-multiline="true"
          aria-label="Note content editor"
        />

        {isEmpty && (
          <div
            className={styles.placeholderOverlay}
            onClick={() => editorRef.current?.focus()}
          >
            {placeholder}
          </div>
        )}
      </div>
    </div>
  );
}
