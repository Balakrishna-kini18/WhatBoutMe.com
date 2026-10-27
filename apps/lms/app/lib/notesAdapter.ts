// apps/lms/app/lib/notesAdapter.ts

import { StudentNote, CreateStudentNotePayload, UpdateStudentNotePayload } from './api';
import { ContextualNote, formatSecondsToTimestamp } from '../types/learner-flow';

export interface NoteStructuredEnvelope {
  wbm_note: true;
  title: string;
  body: string;
  tags?: string[];
  isFavorite?: boolean;
  sourcePage?: 'lesson_player' | 'my_notes' | 'course_notes_tab';
}

/**
 * Strips HTML tags and markdown symbols to generate a clean 2-line preview.
 */
export function extractPlainTextPreview(text: string, maxLength = 160): string {
  if (!text) return '';
  const cleaned = text
    .replace(/<[^>]+>/g, ' ')
    .replace(/[#*_~`>[\]()]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.length > maxLength ? `${cleaned.slice(0, maxLength)}…` : cleaned;
}

/**
 * Normalizes a raw StudentNote from the backend API into the canonical ContextualNote model.
 * Seamlessly handles both new structured notes and legacy raw text notes.
 */
export function normalizeStudentNote(raw: StudentNote): ContextualNote {
  let noteTitle = '';
  let noteContent = raw.noteText || '';
  let tags: string[] = [];
  let isFavorite = false;
  let sourcePage: 'lesson_player' | 'my_notes' | 'course_notes_tab' = 'lesson_player';

  if (raw.noteText && raw.noteText.trim().startsWith('{')) {
    try {
      const parsed = JSON.parse(raw.noteText);
      if (parsed && typeof parsed === 'object' && parsed.wbm_note === true) {
        noteTitle = parsed.title || '';
        noteContent = parsed.body || '';
        tags = Array.isArray(parsed.tags) ? parsed.tags : [];
        isFavorite = Boolean(parsed.isFavorite);
        if (parsed.sourcePage) {
          sourcePage = parsed.sourcePage;
        }
      }
    } catch {
      // Fallback to plain text parsing
    }
  }

  // If no explicit title was deserialized, derive one from the first line of content
  if (!noteTitle) {
    const lines = noteContent
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length > 0 && lines[0]) {
      const firstLine = lines[0].replace(/^[#*\-•\d.]+\s*/, '').trim();
      noteTitle = firstLine.length > 60 ? `${firstLine.slice(0, 60)}…` : firstLine;
    } else {
      noteTitle = 'Untitled Note';
    }
  }

  const plainTextPreview = extractPlainTextPreview(noteContent);
  const courseId = raw.programId || raw.program?.id || '';
  const courseName = raw.program?.title || 'Course';
  const moduleId = raw.stepId || raw.step?.id || '';
  const moduleName = raw.step?.title ? `Module ${raw.step.sequence || 1}: ${raw.step.title}` : 'Module';
  const moduleOrder = raw.step?.sequence || 1;
  const lessonId = raw.lessonId || raw.lesson?.id || raw.stepId || '';
  const lessonName = raw.lesson?.title || raw.step?.title || 'Lesson';
  const lessonOrder = 1;
  const videoTimestampSec = raw.videoTimestampSeconds ?? null;

  const stepTarget = moduleId || raw.stepId || lessonId;
  const sourceRoute = stepTarget
    ? `/steps/${stepTarget}${lessonId && lessonId !== stepTarget ? `?lessonId=${lessonId}` : ''}${videoTimestampSec !== null ? `${lessonId && lessonId !== stepTarget ? '&' : '?'}t=${videoTimestampSec}` : ''}`
    : '/notes';

  return {
    noteId: raw.id,
    userId: raw.userId,
    courseId,
    courseName,
    moduleId,
    moduleName,
    moduleOrder,
    lessonId,
    lessonName,
    lessonOrder,
    videoTimestampSec,
    formattedTimestamp: formatSecondsToTimestamp(videoTimestampSec),
    sourcePage,
    sourceRoute,
    noteTitle,
    noteContent,
    plainTextPreview,
    tags,
    isFavorite,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  };
}

/**
 * Serializes ContextualNote fields into the backward-compatible CreateStudentNotePayload.
 */
export function serializeCreateNotePayload(input: {
  courseId?: string;
  moduleId?: string;
  lessonId?: string;
  noteTitle: string;
  noteContent: string;
  tags?: string[];
  isFavorite?: boolean;
  videoTimestampSec?: number | null;
  sourcePage?: 'lesson_player' | 'my_notes' | 'course_notes_tab';
}): CreateStudentNotePayload {
  const envelope: NoteStructuredEnvelope = {
    wbm_note: true,
    title: input.noteTitle.trim() || 'Untitled Note',
    body: input.noteContent,
    tags: input.tags || [],
    isFavorite: Boolean(input.isFavorite),
    sourcePage: input.sourcePage || 'lesson_player',
  };

  return {
    programId: input.courseId,
    stepId: input.moduleId,
    lessonId: input.lessonId,
    noteText: JSON.stringify(envelope),
    highlightSnippet: extractPlainTextPreview(input.noteContent, 100),
    videoTimestampSeconds: input.videoTimestampSec ?? undefined,
  };
}

/**
 * Serializes ContextualNote updates into the backward-compatible UpdateStudentNotePayload.
 */
export function serializeUpdateNotePayload(input: {
  noteTitle?: string;
  noteContent?: string;
  tags?: string[];
  isFavorite?: boolean;
  videoTimestampSec?: number | null;
  sourcePage?: 'lesson_player' | 'my_notes' | 'course_notes_tab';
}): UpdateStudentNotePayload {
  const envelope: NoteStructuredEnvelope = {
    wbm_note: true,
    title: (input.noteTitle ?? '').trim() || 'Untitled Note',
    body: input.noteContent ?? '',
    tags: input.tags || [],
    isFavorite: Boolean(input.isFavorite),
    sourcePage: input.sourcePage || 'lesson_player',
  };

  return {
    noteText: JSON.stringify(envelope),
    highlightSnippet: extractPlainTextPreview(input.noteContent ?? '', 100),
    videoTimestampSeconds: input.videoTimestampSec ?? undefined,
  };
}

/**
 * Helper to build the canonical Lesson Player route with optional timestamp.
 */
export function getLessonPlayerUrl(
  courseId: string,
  lessonId: string,
  timestampSec?: number | null,
  moduleId?: string
): string {
  const stepTarget = moduleId || lessonId;
  const params = new URLSearchParams();
  if (lessonId && lessonId !== stepTarget) {
    params.set('lessonId', lessonId);
  }
  if (timestampSec != null) {
    params.set('t', String(Math.floor(timestampSec)));
  }
  const qs = params.toString();
  return `/steps/${encodeURIComponent(stepTarget)}${qs ? `?${qs}` : ''}`;
}

/**
 * Helper to build the canonical Course Steps route.
 */
export function getCourseLearningPathUrl(courseId: string): string {
  return `/programs/${encodeURIComponent(courseId)}/steps`;
}

/**
 * Helper to build the 3-Pane My Notes Explorer route.
 */
export function getMyNotesExplorerUrl(params?: {
  courseId?: string;
  moduleId?: string;
  lessonId?: string;
  noteId?: string;
  view?: 'all' | 'by_course' | 'favorites' | 'recent';
}): string {
  const searchParams = new URLSearchParams();
  if (params?.courseId) searchParams.set('courseId', params.courseId);
  if (params?.moduleId) searchParams.set('moduleId', params.moduleId);
  if (params?.lessonId) searchParams.set('lessonId', params.lessonId);
  if (params?.noteId) searchParams.set('noteId', params.noteId);
  if (params?.view) searchParams.set('view', params.view);
  const qs = searchParams.toString();
  return qs ? `/notes?${qs}` : '/notes';
}
