// apps/lms/app/components/notes/RichNoteEditorModal.tsx
'use client';

import React, { useState, useEffect } from 'react';
import styles from './richNoteEditor.module.css';
import { ContextualNote, formatSecondsToTimestamp } from '../../types/learner-flow';
import { extractPlainTextPreview } from '../../lib/notesAdapter';
import { saveNoteDraft, getNoteDraft, clearNoteDraft } from '../../lib/notesStorageEngine';
import { ConfirmModal } from '../ui/ConfirmModal';
import { VisualRichTextEditor } from './VisualRichTextEditor';
import { isEditorEmpty } from '../../lib/richTextHelper';

interface RichNoteEditorModalProps {
  isOpen: boolean;
  initialNote: Partial<ContextualNote> | null;
  onClose: () => void;
  onSave: (noteData: Partial<ContextualNote>) => Promise<void>;
  onDelete?: (noteId: string) => Promise<void>;
  onJumpToLesson?: (courseId: string, lessonId: string, timestampSec: number | null, moduleId?: string) => void;
}

export default function RichNoteEditorModal({
  isOpen,
  initialNote,
  onClose,
  onSave,
  onDelete,
  onJumpToLesson,
}: RichNoteEditorModalProps) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [plainText, setPlainText] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [newTagInput, setNewTagInput] = useState('');
  const [isFavorite, setIsFavorite] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    if (initialNote) {
      if (!initialNote.noteId && initialNote.lessonId) {
        const savedDraft = getNoteDraft(initialNote.lessonId);
        if (savedDraft && (savedDraft.content || savedDraft.title)) {
          setTitle(savedDraft.title);
          setContent(savedDraft.content);
          setTags(savedDraft.tags);
          setIsFavorite(savedDraft.isFavorite);
          return;
        }
      }
      setTitle(initialNote.noteTitle || '');
      setContent(initialNote.noteContent || '');
      setTags(initialNote.tags || []);
      setIsFavorite(Boolean(initialNote.isFavorite));
    } else {
      setTitle('');
      setContent('');
      setPlainText('');
      setTags([]);
      setIsFavorite(false);
    }
  }, [initialNote, isOpen]);

  // Auto-save draft for new in-progress notes
  useEffect(() => {
    if (!initialNote?.noteId && initialNote?.lessonId && (content || title)) {
      const timer = setTimeout(() => {
        saveNoteDraft(initialNote.lessonId!, {
          courseId: initialNote.courseId,
          moduleId: initialNote.moduleId,
          noteTitle: title,
          noteContent: content,
          tags,
          isFavorite,
          videoTimestampSec: initialNote.videoTimestampSec,
        });
      }, 600);
      return () => clearTimeout(timer);
    }
  }, [initialNote, title, content, tags, isFavorite]);

  if (!isOpen || !initialNote) return null;

  const handleAddTag = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && newTagInput.trim()) {
      e.preventDefault();
      const clean = newTagInput.trim().replace(/^#/, '');
      if (!tags.includes(clean)) {
        setTags([...tags, clean]);
      }
      setNewTagInput('');
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter((t) => t !== tagToRemove));
  };

  const handleEditorChange = (html: string, text: string) => {
    setContent(html);
    setPlainText(text);
  };

  const handleSave = async () => {
    if (isEditorEmpty(content) && !title.trim()) return;
    setIsSaving(true);
    try {
      const derivedTitle =
        title.trim() ||
        plainText.split('\n')[0]?.replace(/^[#*\-•\d.]+\s*/, '').trim().slice(0, 60) ||
        'Untitled Note';

      const preview = extractPlainTextPreview(plainText || content);

      await onSave({
        ...initialNote,
        noteTitle: derivedTitle,
        noteContent: content,
        plainTextPreview: preview,
        tags,
        isFavorite,
      });
      if (initialNote.lessonId) {
        clearNoteDraft(initialNote.lessonId);
      }
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteClick = () => {
    setShowDeleteConfirm(true);
  };

  const handleConfirmDelete = async () => {
    if (!initialNote.noteId || !onDelete) return;
    setIsDeleting(true);
    try {
      await onDelete(initialNote.noteId);
      setShowDeleteConfirm(false);
      onClose();
    } finally {
      setIsDeleting(false);
    }
  };

  const timestampDisplay = formatSecondsToTimestamp(initialNote.videoTimestampSec);

  return (
    <div className={styles.overlay} onClick={onClose} role="dialog" aria-modal="true">
      <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
        {/* TOP BAR */}
        <div className={styles.topBar}>
          <button type="button" onClick={onClose} className={styles.backBtn}>
            <span>&larr;</span> Back to notes
          </button>

          {initialNote.noteId && onDelete && (
            <button
              type="button"
              onClick={handleDeleteClick}
              disabled={isDeleting}
              className={styles.deleteBtn}
            >
              {isDeleting ? (
                'Deleting...'
              ) : (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    <line x1="10" y1="11" x2="10" y2="17" />
                    <line x1="14" y1="11" x2="14" y2="17" />
                  </svg>
                  <span>Delete Note</span>
                </>
              )}
            </button>
          )}
        </div>

        {/* MAIN SCROLL AREA */}
        <div className={styles.scrollArea}>
          {/* CONTEXT HEADER */}
          <div className={styles.contextHeader}>
            <div className={styles.contextLeft}>
              <div className={styles.docIconBadge}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ea580c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                  <polyline points="10 9 9 9 8 9" />
                </svg>
              </div>

              <div className={styles.titleArea}>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Note title (e.g., Installation Steps)..."
                  className={styles.titleInput}
                  autoFocus={!title}
                />

                {/* BREADCRUMBS: Course > Module > Lesson */}
                <div className={styles.breadcrumbRow}>
                  <button
                    type="button"
                    onClick={() => {
                      if (initialNote.courseId && onJumpToLesson) {
                        onJumpToLesson(initialNote.courseId, initialNote.lessonId || '', null, initialNote.moduleId);
                      }
                    }}
                    className={styles.breadcrumbSegment}
                  >
                    {initialNote.courseName || 'Course'}
                  </button>
                  <span>&rsaquo;</span>
                  <span style={{ color: '#64748b' }}>
                    {initialNote.moduleName || 'Module'}
                  </span>
                  <span>&rsaquo;</span>
                  <button
                    type="button"
                    onClick={() => {
                      if (initialNote.courseId && initialNote.lessonId && onJumpToLesson) {
                        onJumpToLesson(
                          initialNote.courseId,
                          initialNote.lessonId,
                          initialNote.videoTimestampSec ?? null,
                          initialNote.moduleId
                        );
                      }
                    }}
                    className={styles.breadcrumbSegment}
                  >
                    {initialNote.lessonName || 'Lesson'}
                  </button>
                </div>

                {/* VIDEO TIMESTAMP PILL */}
                <div className={styles.timestampPillRow}>
                  {timestampDisplay && (
                    <button
                      type="button"
                      onClick={() => {
                        if (initialNote.courseId && initialNote.lessonId && onJumpToLesson) {
                          onJumpToLesson(
                            initialNote.courseId,
                            initialNote.lessonId,
                            initialNote.videoTimestampSec ?? null,
                            initialNote.moduleId
                          );
                        }
                      }}
                      className={styles.timestampPill}
                      title="Jump to video at this moment"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <circle cx="12" cy="12" r="10" />
                        <polyline points="12 6 12 12 16 14" />
                      </svg>
                      <span>{timestampDisplay}</span>
                    </button>
                  )}
                  <span>
                    {initialNote.updatedAt
                      ? `Updated ${new Date(initialNote.updatedAt).toLocaleDateString()}`
                      : 'New Note'}
                  </span>
                </div>
              </div>
            </div>

            {/* STAR / FAVORITE TOGGLE */}
            <button
              type="button"
              onClick={() => setIsFavorite(!isFavorite)}
              className={`${styles.starBtn} ${isFavorite ? styles.starBtnActive : ''}`}
              title={isFavorite ? 'Remove from favorites' : 'Mark as favorite'}
              aria-label="Toggle favorite"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill={isFavorite ? '#f59e0b' : 'none'} stroke={isFavorite ? '#f59e0b' : '#94a3b8'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
              </svg>
            </button>
          </div>

          {/* VISUAL RICH TEXT CANVAS */}
          <VisualRichTextEditor
            initialContent={content}
            onChange={handleEditorChange}
            placeholder="Write your thoughts, reflections, insights, or key takeaways here..."
            minHeight={190}
          />

          {/* TAGS SECTION */}
          <div className={styles.tagsSection}>
            <label className={styles.tagsLabel}>Tags</label>
            <div className={styles.tagsWrap}>
              {tags.map((tag) => (
                <span key={tag} className={styles.tagPill}>
                  #{tag}
                  <button
                    type="button"
                    onClick={() => handleRemoveTag(tag)}
                    className={styles.tagRemoveBtn}
                    aria-label={`Remove tag ${tag}`}
                  >
                    &times;
                  </button>
                </span>
              ))}

              <input
                type="text"
                value={newTagInput}
                onChange={(e) => setNewTagInput(e.target.value)}
                onKeyDown={handleAddTag}
                placeholder="+ Add tag..."
                className={styles.tagInput}
              />
            </div>
          </div>
        </div>

        {/* FOOTER ACTIONS */}
        <div className={styles.modalFooter}>
          <button type="button" onClick={onClose} className={styles.cancelBtn}>
            Cancel
          </button>
          <button
            type="button"
            disabled={isSaving || (isEditorEmpty(content) && !title.trim())}
            onClick={handleSave}
            className={styles.saveBtn}
          >
            {isSaving ? 'Saving...' : 'Save Note'}
          </button>
        </div>
      </div>

      <ConfirmModal
        isOpen={showDeleteConfirm}
        onClose={() => {
          if (!isDeleting) setShowDeleteConfirm(false);
        }}
        onConfirm={handleConfirmDelete}
        title="Delete Note"
        message="Are you sure you want to permanently delete this note? This action cannot be undone."
        confirmText="Delete Note"
        cancelText="Cancel"
        tone="danger"
        isLoading={isDeleting}
      />
    </div>
  );
}
