// apps/lms/app/types/learner-flow.ts

export type LessonStatus = 'completed' | 'current' | 'unlocked' | 'locked';

export interface LessonItem {
  lessonId: string;
  lessonOrder: number;
  title: string;
  durationFormatted: string; // e.g., "12:30"
  durationSec: number;
  difficulty: 'Beginner' | 'Intermediate' | 'Advanced';
  status: LessonStatus;
  videoUrl: string;
  overview: string;
  keyTakeaways: string[];
  notesCount: number;
  resourcesCount: number;
}

export interface CourseModule {
  moduleId: string;
  moduleOrder: number;
  title: string;             // e.g., "Module 1: Introduction"
  isLocked: boolean;
  lockReason?: string;       // e.g., "Complete Module 1: Introduction to unlock this module."
  completedLessonsCount: number;
  totalLessonsCount: number;
  lessons: LessonItem[];
}

export interface EnrolledCourse {
  courseId: string;
  title: string;             // e.g., "Sigma 1"
  thumbnailUrl: string;
  status: 'in_progress' | 'completed';
  completedLessons: number;  // e.g., 15
  totalLessons: number;      // e.g., 32
  progressPercent: number;   // e.g., 46
  lastAccessedLessonId?: string;
  lastAccessedAt?: string;
  modules: CourseModule[];
}

export interface ContextualNote {
  noteId: string;
  userId: string;
  // Hierarchical Provenance
  courseId: string;
  courseName: string;
  moduleId: string;
  moduleName: string;
  moduleOrder: number;
  lessonId: string;        // maps to stepId / lessonId
  lessonName: string;
  lessonOrder: number;
  // Playback & Source Context
  videoTimestampSec: number | null; // e.g., 155 for "2:35"
  formattedTimestamp: string | null; // e.g., "2:35"
  sourcePage: 'lesson_player' | 'my_notes' | 'course_notes_tab';
  sourceRoute: string;     // e.g., "/courses/sigma-1/lessons/tools-setup?t=155"
  // Content & Organization
  noteTitle: string;       // Explicit title or auto-derived from first line
  noteContent: string;     // Rich text HTML / Markdown body
  plainTextPreview: string;// 2-line stripped preview for NoteCard
  tags: string[];          // e.g., ["Installation", "Node.js", "Setup"]
  isFavorite: boolean;
  // Audit Timestamps
  createdAt: string;       // ISO-8601
  updatedAt: string;       // ISO-8601
}

export function formatSecondsToTimestamp(seconds: number | null | undefined): string | null {
  if (seconds === null || seconds === undefined || Number.isNaN(seconds) || seconds < 0) {
    return null;
  }
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

export function parseTimestampToSeconds(ts: string | null | undefined): number | null {
  if (!ts) return null;
  const parts = ts.trim().split(':');
  if (parts.length === 2) {
    const mins = parseInt(parts[0] || '0', 10);
    const secs = parseInt(parts[1] || '0', 10);
    if (!isNaN(mins) && !isNaN(secs)) {
      return mins * 60 + secs;
    }
  } else if (parts.length === 3) {
    const hours = parseInt(parts[0] || '0', 10);
    const mins = parseInt(parts[1] || '0', 10);
    const secs = parseInt(parts[2] || '0', 10);
    if (!isNaN(hours) && !isNaN(mins) && !isNaN(secs)) {
      return hours * 3600 + mins * 60 + secs;
    }
  }
  const parsed = parseInt(ts, 10);
  return isNaN(parsed) ? null : parsed;
}
