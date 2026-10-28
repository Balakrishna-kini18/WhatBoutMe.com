// apps/lms/app/components/notes/RichNoteEditorView.tsx
'use client';

import React, { useState } from 'react';
import { ContextualNote, formatSecondsToTimestamp } from '../../types/learner-flow';
import { extractPlainTextPreview } from '../../lib/notesAdapter';
import { ConfirmModal } from '../ui/ConfirmModal';
import { VisualRichTextEditor } from './VisualRichTextEditor';
import { isEditorEmpty } from '../../lib/richTextHelper';

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
    <div style={{ minHeight: '100vh', background: '#faf9f6', padding: '2rem 1rem' }}>
      <div
        style={{
          maxWidth: 900,
          margin: '0 auto',
          background: '#ffffff',
          borderRadius: 20,
          border: '1px solid #e5e7eb',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
          padding: '2rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '1.75rem',
        }}
      >
        {/* Top Navigation & Delete Bar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <button
            type="button"
            onClick={onBackToNotes}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '0.88rem',
              fontWeight: 600,
              color: '#64748b',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <span>&larr;</span> Back to Notes
          </button>

          <button
            type="button"
            onClick={handleDeleteClick}
            disabled={isDeleting}
            style={{
              padding: '0.45rem 0.9rem',
              borderRadius: 8,
              background: '#fef2f2',
              border: '1px solid #fecaca',
              color: '#dc2626',
              fontSize: '0.82rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {isDeleting ? 'Deleting...' : '🗑 Delete Note'}
          </button>
        </div>

        {/* Context Provenance Header Card */}
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 16,
            paddingBottom: '1.5rem',
            borderBottom: '1px solid #f1f5f9',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, flex: 1 }}>
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: 14,
                background: '#ffedd5',
                color: '#ea580c',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.4rem',
                fontWeight: 'bold',
                flexShrink: 0,
              }}
            >
              📄
            </div>

            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Note title (e.g. Installation Steps)..."
                style={{
                  fontSize: '1.4rem',
                  fontWeight: 800,
                  color: '#0f172a',
                  border: 'none',
                  outline: 'none',
                  width: '100%',
                }}
              />

              {/* Interactive Course > Module > Lesson Breadcrumb */}
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, fontSize: '0.85rem', color: '#64748b' }}>
                <button
                  type="button"
                  onClick={() => onJumpToLesson(note.courseId, note.lessonId, null, note.moduleId)}
                  style={{ background: 'none', border: 'none', color: '#ea580c', fontWeight: 600, cursor: 'pointer', padding: 0 }}
                >
                  {note.courseName}
                </button>
                <span>&rsaquo;</span>
                <span>{note.moduleName}</span>
                <span>&rsaquo;</span>
                <button
                  type="button"
                  onClick={() => onJumpToLesson(note.courseId, note.lessonId, note.videoTimestampSec, note.moduleId)}
                  style={{ background: 'none', border: 'none', color: '#334155', fontWeight: 600, cursor: 'pointer', padding: 0 }}
                >
                  {note.lessonName}
                </button>
              </div>

              {/* Video Timestamp Chip + Last Updated */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4, fontSize: '0.78rem', color: '#94a3b8' }}>
                {timestampDisplay && (
                  <button
                    type="button"
                    onClick={() => onJumpToLesson(note.courseId, note.lessonId, note.videoTimestampSec, note.moduleId)}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      padding: '3px 10px',
                      borderRadius: 6,
                      background: '#ffedd5',
                      color: '#c2410c',
                      border: '1px solid #fed7aa',
                      fontFamily: 'monospace',
                      fontSize: '0.8rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    ⏱ {timestampDisplay}
                  </button>
                )}
                <span>Last updated {new Date(note.updatedAt).toLocaleString()}</span>
              </div>
            </div>
          </div>

          {/* Star / Favorite Toggle */}
          <button
            type="button"
            onClick={() => setIsFavorite(!isFavorite)}
            style={{
              width: 40,
              height: 40,
              borderRadius: 10,
              border: `1px solid ${isFavorite ? '#fde68a' : '#e2e8f0'}`,
              background: isFavorite ? '#fffbeb' : '#f8fafc',
              color: isFavorite ? '#f59e0b' : '#94a3b8',
              fontSize: '1.25rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            aria-label="Toggle favorite"
          >
            ★
          </button>
        </div>

        {/* Visual Rich Text Canvas */}
        <VisualRichTextEditor
          initialContent={content}
          onChange={handleEditorChange}
          placeholder="Write your thoughts, reflections, insights, or key takeaways here..."
          minHeight={260}
        />

        {/* Tags Section */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#475569' }}>Tags</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
            {tags.map((tag) => (
              <span
                key={tag}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '4px 12px',
                  borderRadius: 999,
                  background: '#ffedd5',
                  color: '#9a3412',
                  border: '1px solid #fed7aa',
                  fontSize: '0.78rem',
                  fontWeight: 600,
                }}
              >
                #{tag}
                <button
                  type="button"
                  onClick={() => handleRemoveTag(tag)}
                  style={{ background: 'none', border: 'none', color: '#ea580c', cursor: 'pointer', fontSize: '0.95rem', padding: 0 }}
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
              style={{
                borderRadius: 999,
                border: '1px dashed #cbd5e1',
                padding: '4px 12px',
                fontSize: '0.78rem',
                outline: 'none',
                width: 120,
              }}
            />
          </div>
        </div>

        {/* Sticky Footer Bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: 12,
            paddingTop: '1.25rem',
            borderTop: '1px solid #f1f5f9',
          }}
        >
          <button
            type="button"
            onClick={onBackToNotes}
            style={{
              padding: '0.65rem 1.25rem',
              borderRadius: 10,
              border: '1px solid #cbd5e1',
              background: '#ffffff',
              color: '#475569',
              fontSize: '0.88rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={isSaving || (isEditorEmpty(content) && !title.trim())}
            onClick={handleSave}
            style={{
              padding: '0.65rem 1.5rem',
              borderRadius: 10,
              border: 'none',
              background: '#f97316',
              color: '#ffffff',
              fontSize: '0.88rem',
              fontWeight: 700,
              cursor: isSaving || (isEditorEmpty(content) && !title.trim()) ? 'not-allowed' : 'pointer',
              opacity: isSaving || (isEditorEmpty(content) && !title.trim()) ? 0.6 : 1,
              boxShadow: '0 2px 4px rgba(249, 115, 22, 0.3)',
            }}
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
