// apps/lms/app/components/notes/RichNoteEditorView.tsx
'use client';

import React, { useState } from 'react';
import { ContextualNote, formatSecondsToTimestamp } from '../../types/learner-flow';
import { extractPlainTextPreview } from '../../lib/notesAdapter';
import { ConfirmModal } from '../ui/ConfirmModal';
import { VisualRichTextEditor } from './VisualRichTextEditor';
import { isEditorEmpty } from '../../lib/richTextHelper';
import styles from './richNoteEditor.module.css';

interface RichNoteEditorViewProps {
  note: ContextualNote;
  onBackToNotes: () => void;
  onSaveNote: (updated: ContextualNote) => Promise<void>;
  onDeleteNote: (noteId: string) => Promise<void>;
  onJumpToLesson: (courseId: string, lessonId: string, timestampSec: number | null, moduleId?: string) => void;
}

export function RichNoteEditorView({
  note,
  onBackToNotes,
  onSaveNote,
  onDeleteNote,
  onJumpToLesson,
}: RichNoteEditorViewProps) {
  const [title, setTitle] = useState(note.noteTitle);
  const [content, setContent] = useState(note.noteContent);
  const [plainText, setPlainText] = useState('');
  const [tags, setTags] = useState<string[]>(note.tags || []);
  const [newTagInput, setNewTagInput] = useState('');
  const [isFavorite, setIsFavorite] = useState(note.isFavorite);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

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
    setIsSaving(true);
    try {
      const strippedPreview = extractPlainTextPreview(plainText || content);
      await onSaveNote({
        ...note,
        noteTitle: title.trim() || 'Untitled Note',
        noteContent: content,
        plainTextPreview: strippedPreview,
        tags,
        isFavorite,
        updatedAt: new Date().toISOString(),
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteClick = () => {
    setShowDeleteConfirm(true);
  };

  const handleConfirmDelete = async () => {
    setIsDeleting(true);
    try {
      await onDeleteNote(note.noteId);
      setShowDeleteConfirm(false);
      onBackToNotes();
    } finally {
      setIsDeleting(false);
    }
  };

  const timestampDisplay = formatSecondsToTimestamp(note.videoTimestampSec);

  return (
    <div className={styles.editorPageWrapper}>
      <div className={styles.editorPageCard}>
        {/* Mobile Sheet Drag Handle */}
        <div className={styles.sheetHandle} aria-hidden="true" />

        {/* Top Navigation & Delete Bar */}
        <div className={styles.editorPageTopBar}>
          <button
            type="button"
            onClick={onBackToNotes}
            className={styles.editorPageBackBtn}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="19" y1="12" x2="5" y2="12" />
              <polyline points="12 19 5 12 12 5" />
            </svg>
            <span>Back to notes</span>
          </button>

          <button
            type="button"
            onClick={handleDeleteClick}
            disabled={isDeleting}
            className={styles.editorPageDeleteBtn}
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
        </div>

        {/* Context Provenance Header Card */}
        <div className={styles.editorPageHeader}>
          <div className={styles.headerLeftContainer}>
            <div className={styles.docIconBadge}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ea580c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
                <polyline points="10 9 9 9 8 9" />
              </svg>
            </div>

            <div className={styles.headerInfoCol}>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Note title (e.g., Inst)"
                className={styles.editorPageTitleInput}
              />

              {/* Course Badge (shown on mobile directly below title) */}
              <div className={styles.courseBadgeRow}>
                <span className={styles.courseBadge}>{note.courseName}</span>
              </div>

              {/* Interactive Course > Module > Lesson Breadcrumb (Desktop) */}
              <div className={styles.breadcrumbDesktop}>
                <button
                  type="button"
                  onClick={() => onJumpToLesson(note.courseId, note.lessonId, null, note.moduleId)}
                  className={styles.breadcrumbCourseLink}
                >
                  {note.courseName}
                </button>
                <span className={styles.breadcrumbSep}>&rsaquo;</span>
                <span className={styles.breadcrumbModuleText}>{note.moduleName}</span>
                <span className={styles.breadcrumbSep}>&rsaquo;</span>
                <button
                  type="button"
                  onClick={() => onJumpToLesson(note.courseId, note.lessonId, note.videoTimestampSec, note.moduleId)}
                  className={styles.breadcrumbLessonLink}
                >
                  {note.lessonName}
                </button>
              </div>

            </div>
          </div>

          {/* Star / Favorite Toggle */}
          <button
            type="button"
            onClick={() => setIsFavorite(!isFavorite)}
            className={`${styles.starBtn} ${isFavorite ? styles.starBtnActive : ''}`}
            aria-label="Toggle favorite"
            title={isFavorite ? 'Remove from favorites' : 'Mark as favorite'}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill={isFavorite ? '#f59e0b' : 'none'} stroke={isFavorite ? '#f59e0b' : '#94a3b8'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
          </button>
        </div>

        {/* Section Divider */}
        <div className={styles.sectionDivider} />

        {/* Visual Rich Text Canvas */}
        <VisualRichTextEditor
          initialContent={content}
          onChange={handleEditorChange}
          placeholder="Write your thoughts, reflections..."
          minHeight={150}
        />

        {/* Tags Section */}
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

        {/* Sticky Footer Bar */}
        <div className={styles.editorPageFooter}>
          <button
            type="button"
            onClick={onBackToNotes}
            className={styles.cancelBtn}
          >
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
