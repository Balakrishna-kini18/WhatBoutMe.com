// apps/lms/app/lib/useNotesStore.ts
'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  fetchStudentNotes,
  createStudentNote,
  updateStudentNote,
  deleteStudentNote,
} from './api';
import {
  normalizeStudentNote,
  serializeCreateNotePayload,
  serializeUpdateNotePayload,
} from './notesAdapter';
import { ContextualNote } from '../types/learner-flow';

export function useNotesStore(initialCourseId?: string) {
  const [notes, setNotes] = useState<ContextualNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadNotes = useCallback(async () => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    if (!token) {
      setNotes([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const rawNotes = await fetchStudentNotes({
        programId: initialCourseId,
        sort: 'desc',
      });
      const normalized = rawNotes.map(normalizeStudentNote);
      setNotes(normalized);
    } catch (err: any) {
      console.error('Failed to load notes', err);
      setError(err.message || 'Failed to load notes');
    } finally {
      setLoading(false);
    }
  }, [initialCourseId]);

  useEffect(() => {
    loadNotes();
  }, [loadNotes]);

  const addNote = useCallback(async (input: {
    courseId: string;
    courseName?: string;
    moduleId: string;
    moduleName?: string;
    lessonId: string;
    lessonName?: string;
    noteTitle: string;
    noteContent: string;
    tags?: string[];
    isFavorite?: boolean;
    videoTimestampSec?: number | null;
    sourcePage?: 'lesson_player' | 'my_notes' | 'course_notes_tab';
  }): Promise<ContextualNote> => {
    const payload = serializeCreateNotePayload(input);
    const createdRaw = await createStudentNote(payload);
    const normalized = normalizeStudentNote(createdRaw);
    
    // Ensure course and lesson labels are preserved if backend only returned IDs
    if (!normalized.courseName && input.courseName) normalized.courseName = input.courseName;
    if (!normalized.moduleName && input.moduleName) normalized.moduleName = input.moduleName;
    if (!normalized.lessonName && input.lessonName) normalized.lessonName = input.lessonName;

    setNotes((prev) => [normalized, ...prev]);
    return normalized;
  }, []);

  const editNote = useCallback(async (
    noteId: string,
    updates: {
      noteTitle?: string;
      noteContent?: string;
      tags?: string[];
      isFavorite?: boolean;
      videoTimestampSec?: number | null;
    }
  ): Promise<ContextualNote> => {
    const payload = serializeUpdateNotePayload(updates);
    const updatedRaw = await updateStudentNote(noteId, payload);
    const normalized = normalizeStudentNote(updatedRaw);

    setNotes((prev) =>
      prev.map((n) => {
        if (n.noteId !== noteId) return n;
        return {
          ...n,
          ...normalized,
          courseName: normalized.courseName && normalized.courseName !== 'Course' ? normalized.courseName : n.courseName,
          moduleName: normalized.moduleName && normalized.moduleName !== 'Module' ? normalized.moduleName : n.moduleName,
          lessonName: normalized.lessonName && normalized.lessonName !== 'Lesson' ? normalized.lessonName : n.lessonName,
        };
      })
    );
    return normalized;
  }, []);

  const removeNote = useCallback(async (noteId: string): Promise<void> => {
    await deleteStudentNote(noteId);
    setNotes((prev) => prev.filter((n) => n.noteId !== noteId));
  }, []);

  const toggleFavorite = useCallback(async (noteId: string): Promise<boolean> => {
    const target = notes.find((n) => n.noteId === noteId);
    if (!target) return false;
    const newFavorite = !target.isFavorite;

    // Optimistic update
    setNotes((prev) =>
      prev.map((n) => (n.noteId === noteId ? { ...n, isFavorite: newFavorite } : n))
    );

    try {
      await editNote(noteId, {
        noteTitle: target.noteTitle,
        noteContent: target.noteContent,
        tags: target.tags,
        isFavorite: newFavorite,
        videoTimestampSec: target.videoTimestampSec,
      });
      return newFavorite;
    } catch (e) {
      // Rollback on error
      setNotes((prev) =>
        prev.map((n) => (n.noteId === noteId ? { ...n, isFavorite: !newFavorite } : n))
      );
      throw e;
    }
  }, [notes, editNote]);

  const noteCounts = useMemo(() => {
    const byCourse: Record<string, number> = {};
    const byModule: Record<string, number> = {};
    const byLesson: Record<string, number> = {};

    for (const n of notes) {
      if (n.courseId) byCourse[n.courseId] = (byCourse[n.courseId] || 0) + 1;
      if (n.moduleId) byModule[n.moduleId] = (byModule[n.moduleId] || 0) + 1;
      if (n.lessonId) byLesson[n.lessonId] = (byLesson[n.lessonId] || 0) + 1;
    }
    return { byCourse, byModule, byLesson };
  }, [notes]);

  return {
    notes,
    loading,
    error,
    refreshNotes: loadNotes,
    addNote,
    editNote,
    removeNote,
    toggleFavorite,
    noteCounts,
  };
}
