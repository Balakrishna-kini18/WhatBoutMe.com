// apps/lms/app/components/notes/RichNoteEditorModal.tsx
'use client';

import React, { useState, useEffect } from 'react';
import styles from './richNoteEditor.module.css';
import { ContextualNote, formatSecondsToTimestamp } from '../../types/learner-flow';
import { extractPlainTextPreview } from '../../lib/notesAdapter';
import { saveNoteDraft, getNoteDraft, clearNoteDraft } from '../../lib/notesStorageEngine';
import { ConfirmModal } from '../ui/ConfirmModal';

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

  const handleApplyFormatting = (prefix: string, suffix = '') => {
    setContent((prev) => `${prev}${prefix} ${suffix}`);
  };

  const handleSave = async () => {
    if (!content.trim() && !title.trim()) return;
    setIsSaving(true);
    try {
      const derivedTitle = title.trim() ||
        content.split('\n')[0]?.replace(/^[#*\-•\d.]+\s*/, '').trim().slice(0, 60) ||
        'Untitled Note';

      const preview = extractPlainTextPreview(content);

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
              {isDeleting ? 'Deleting...' : '🗑 Delete Note'}
            </button>
          )}
        </div>

        {/* MAIN SCROLL AREA */}
        <div className={styles.scrollArea}>
          {/* CONTEXT HEADER */}
          <div className={styles.contextHeader}>
            <div className={styles.contextLeft}>
              <div className={styles.docIconBadge}>📄</div>

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
                      ⏱ {timestampDisplay}
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
              ★
            </button>
          </div>

          {/* FORMATTING TOOLBAR & CANVAS */}
          <div className={styles.toolbarBox}>
            <div className={styles.toolbar}>
              <select
                onChange={(e) => handleApplyFormatting(e.target.value)}
                className={styles.toolSelect}
                defaultValue="Normal"
              >
                <option value="">Normal</option>
                <option value="## ">Heading 2</option>
                <option value="### ">Heading 3</option>
              </select>

              <button
                type="button"
                onClick={() => handleApplyFormatting('**', '**')}
                className={styles.toolBtn}
                title="Bold"
              >
                B
              </button>
              <button
                type="button"
                onClick={() => handleApplyFormatting('*', '*')}
                className={styles.toolBtn}
                title="Italic"
              >
                I
              </button>
              <button
                type="button"
                onClick={() => handleApplyFormatting('- ')}
                className={styles.toolBtn}
                title="Bullet List"
              >
                • List
              </button>
              <button
                type="button"
                onClick={() => handleApplyFormatting('1. ')}
                className={styles.toolBtn}
                title="Numbered List"
              >
                1. List
              </button>
              <button
                type="button"
                onClick={() => handleApplyFormatting('```\n', '\n```')}
                className={styles.toolBtn}
                title="Code Block"
              >
                &lt;/&gt; Code
              </button>
            </div>

            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={8}
              placeholder="Write your personal notes, insights, code snippets, or takeaways here..."
              className={styles.editorTextarea}
            />
          </div>

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
            disabled={isSaving || (!content.trim() && !title.trim())}
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
