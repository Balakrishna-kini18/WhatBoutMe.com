// apps/lms/app/notes/[noteId]/page.tsx
'use client';

import React, { use, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { RichNoteEditorView } from '../../components/notes/RichNoteEditorView';
import { useNotesStore } from '../../lib/useNotesStore';
import { getLessonPlayerUrl } from '../../lib/notesAdapter';
import styles from '../../components/notes/richNoteEditor.module.css';
import Link from 'next/link';

export default function NoteDetailPage({
  params,
}: {
  params: Promise<{ noteId: string }>;
}) {
  const unwrappedParams = use(params);
  const noteId = unwrappedParams.noteId;
  const router = useRouter();

  const { notes, loading, editNote, removeNote } = useNotesStore();

  const targetNote = notes.find((n) => n.noteId === noteId);

  if (loading) {
    return (
      <div className={styles.editorPageWrapper}>
        <div className={styles.editorPageCard}>
          <div className="skeleton" style={{ width: 140, height: 20, borderRadius: 4 }} />
          <div className="skeleton" style={{ width: '60%', height: 32, borderRadius: 6 }} />
          <div className="skeleton" style={{ width: '100%', height: 320, borderRadius: 12 }} />
        </div>
      </div>
    );
  }

  if (!targetNote) {
    return (
      <div style={{ maxWidth: 600, margin: '4rem auto', textAlign: 'center', padding: '2rem', background: '#ffffff', borderRadius: 16, border: '1px solid #e5e7eb' }}>
        <h2 style={{ fontSize: '1.25rem', color: '#0f172a', marginBottom: 8 }}>Note Not Found</h2>
        <p style={{ color: '#64748b', fontSize: '0.9rem', marginBottom: 20 }}>
          This note may have been deleted or moved.
        </p>
        <Link
          href="/notes"
          style={{
            display: 'inline-block',
            padding: '0.65rem 1.25rem',
            borderRadius: 8,
            background: '#f97316',
            color: '#ffffff',
            fontWeight: 600,
            textDecoration: 'none',
          }}
        >
          &larr; Return to My Notes
        </Link>
      </div>
    );
  }

  return (
    <RichNoteEditorView
      note={targetNote}
      onBackToNotes={() => router.push('/notes')}
      onSaveNote={async (updated) => {
        await editNote(updated.noteId, {
          noteTitle: updated.noteTitle,
          noteContent: updated.noteContent,
          tags: updated.tags,
          isFavorite: updated.isFavorite,
          videoTimestampSec: updated.videoTimestampSec,
        });
        router.push('/notes');
      }}
      onDeleteNote={async (id) => {
        await removeNote(id);
        router.push('/notes');
      }}
      onJumpToLesson={(courseId, lessonId, ts, moduleId) => {
        router.push(getLessonPlayerUrl(courseId, lessonId, ts, moduleId));
      }}
    />
  );
}
