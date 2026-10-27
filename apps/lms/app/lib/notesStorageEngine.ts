// apps/lms/app/lib/notesStorageEngine.ts

import { ContextualNote } from '../types/learner-flow';

const DRAFT_KEY_PREFIX = 'wbm_draft_note_';
const OFFLINE_QUEUE_KEY = 'wbm_offline_notes_queue';
const LAST_VIEWED_CONTEXT_KEY = 'wbm_last_notes_context';
const RECENT_SEARCHES_KEY = 'wbm_recent_note_searches';

export interface NoteDraft {
  lessonId: string;
  courseId: string;
  moduleId: string;
  title: string;
  content: string;
  tags: string[];
  isFavorite: boolean;
  videoTimestampSec: number | null;
  savedAt: number;
}

export interface QueuedOfflineMutation {
  id: string;
  type: 'CREATE' | 'UPDATE' | 'DELETE';
  payload: any;
  timestamp: number;
}

export interface NotesContextProvenance {
  courseId?: string;
  moduleId?: string;
  lessonId?: string;
  noteId?: string;
  view?: string;
}

/**
 * Saves an auto-save draft for a specific lesson to prevent data loss.
 */
export function saveNoteDraft(
  lessonId: string,
  draft: Partial<ContextualNote>
): void {
  if (typeof window === 'undefined' || !lessonId) return;
  try {
    const data: NoteDraft = {
      lessonId,
      courseId: draft.courseId || '',
      moduleId: draft.moduleId || '',
      title: draft.noteTitle || '',
      content: draft.noteContent || '',
      tags: draft.tags || [],
      isFavorite: Boolean(draft.isFavorite),
      videoTimestampSec: draft.videoTimestampSec ?? null,
      savedAt: Date.now(),
    };
    localStorage.setItem(`${DRAFT_KEY_PREFIX}${lessonId}`, JSON.stringify(data));
  } catch (e) {
    console.warn('Failed to save note draft to localStorage', e);
  }
}

/**
 * Retrieves any saved draft for a lesson (valid within 7 days).
 */
export function getNoteDraft(lessonId: string): NoteDraft | null {
  if (typeof window === 'undefined' || !lessonId) return null;
  try {
    const raw = localStorage.getItem(`${DRAFT_KEY_PREFIX}${lessonId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const maxAgeMs = 7 * 24 * 60 * 60 * 1000;
    if (Date.now() - parsed.savedAt > maxAgeMs) {
      clearNoteDraft(lessonId);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Clears the saved draft for a lesson after successful persistence.
 */
export function clearNoteDraft(lessonId: string): void {
  if (typeof window === 'undefined' || !lessonId) return;
  try {
    localStorage.removeItem(`${DRAFT_KEY_PREFIX}${lessonId}`);
  } catch {}
}

/**
 * Saves the learner's last active 3-pane explorer navigation context.
 */
export function saveLastNotesContext(ctx: NotesContextProvenance): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(LAST_VIEWED_CONTEXT_KEY, JSON.stringify(ctx));
  } catch {}
}

/**
 * Retrieves the learner's last active 3-pane explorer navigation context.
 */
export function getLastNotesContext(): NotesContextProvenance | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(LAST_VIEWED_CONTEXT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/**
 * Appends a search term to recent searches for fast recall.
 */
export function addRecentSearch(term: string): void {
  if (typeof window === 'undefined' || !term.trim()) return;
  try {
    const raw = localStorage.getItem(RECENT_SEARCHES_KEY);
    const existing: string[] = raw ? JSON.parse(raw) : [];
    const updated = [term.trim(), ...existing.filter((t) => t !== term.trim())].slice(0, 8);
    localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updated));
  } catch {}
}

/**
 * Gets recent searches for note autocomplete.
 */
export function getRecentSearches(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(RECENT_SEARCHES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}
