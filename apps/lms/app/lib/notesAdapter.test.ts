import { describe, it, expect } from 'vitest';
import {
  normalizeStudentNote,
  serializeCreateNotePayload,
  serializeUpdateNotePayload,
  extractPlainTextPreview,
  getLessonPlayerUrl,
  getCourseLearningPathUrl,
  getMyNotesExplorerUrl,
} from './notesAdapter';
import { StudentNote } from './api';

describe('notesAdapter', () => {
  it('normalizes legacy plain text note correctly with auto-derived title', () => {
    const rawNote: StudentNote = {
      id: 'note-1',
      userId: 'user-1',
      programId: 'course-123',
      stepId: 'step-456',
      lessonId: 'lesson-789',
      noteText: 'Download Node.js from the official website.\nMake sure to select LTS release.',
      videoTimestampSeconds: 155,
      createdAt: '2026-10-27T10:00:00Z',
      updatedAt: '2026-10-27T10:05:00Z',
      program: { id: 'course-123', title: 'Sigma 1', slug: 'sigma-1' },
      step: { id: 'step-456', sequence: 1, title: 'Introduction' },
      lesson: { id: 'lesson-789', title: 'Tools & Setup', type: 'VIDEO' },
    };

    const normalized = normalizeStudentNote(rawNote);

    expect(normalized.noteId).toBe('note-1');
    expect(normalized.noteTitle).toBe('Download Node.js from the official website.');
    expect(normalized.plainTextPreview).toContain('Download Node.js');
    expect(normalized.videoTimestampSec).toBe(155);
    expect(normalized.formattedTimestamp).toBe('2:35');
    expect(normalized.courseId).toBe('course-123');
    expect(normalized.courseName).toBe('Sigma 1');
    expect(normalized.moduleId).toBe('step-456');
    expect(normalized.lessonId).toBe('lesson-789');
    expect(normalized.tags).toEqual([]);
    expect(normalized.isFavorite).toBe(false);
    expect(normalized.sourceRoute).toBe('/steps/step-456?lessonId=lesson-789&t=155');
  });

  it('normalizes structured envelope note with custom title, tags, and favorite status', () => {
    const envelope = {
      wbm_note: true,
      title: 'Installation Steps',
      body: '### Node.js\n1. Download installer\n2. Run setup wizard',
      tags: ['Installation', 'Node.js', 'Setup'],
      isFavorite: true,
      sourcePage: 'lesson_player',
    };

    const rawNote: StudentNote = {
      id: 'note-2',
      userId: 'user-1',
      programId: 'course-1',
      stepId: 'step-1',
      lessonId: 'lesson-1',
      noteText: JSON.stringify(envelope),
      videoTimestampSeconds: 310,
      createdAt: '2026-10-27T11:00:00Z',
      updatedAt: '2026-10-27T11:00:00Z',
      program: { id: 'course-1', title: 'Sigma 1' },
      step: { id: 'step-1', sequence: 1, title: 'Introduction' },
      lesson: { id: 'lesson-1', title: 'Tools & Setup', type: 'VIDEO' },
    };

    const normalized = normalizeStudentNote(rawNote);

    expect(normalized.noteTitle).toBe('Installation Steps');
    expect(normalized.noteContent).toContain('### Node.js');
    expect(normalized.plainTextPreview).toContain('Node.js 1. Download installer');
    expect(normalized.tags).toEqual(['Installation', 'Node.js', 'Setup']);
    expect(normalized.isFavorite).toBe(true);
    expect(normalized.videoTimestampSec).toBe(310);
    expect(normalized.formattedTimestamp).toBe('5:10');
  });

  it('serializes create and update payloads maintaining backward compatibility with API', () => {
    const createPayload = serializeCreateNotePayload({
      courseId: 'course-1',
      moduleId: 'step-1',
      lessonId: 'lesson-2',
      noteTitle: 'Key Concept',
      noteContent: '<p>React components are pure functions</p>',
      tags: ['React', 'Frontend'],
      isFavorite: true,
      videoTimestampSec: 125,
      sourcePage: 'lesson_player',
    });

    expect(createPayload.programId).toBe('course-1');
    expect(createPayload.stepId).toBe('step-1');
    expect(createPayload.lessonId).toBe('lesson-2');
    expect(createPayload.videoTimestampSeconds).toBe(125);

    const parsed = JSON.parse(createPayload.noteText);
    expect(parsed.wbm_note).toBe(true);
    expect(parsed.title).toBe('Key Concept');
    expect(parsed.tags).toEqual(['React', 'Frontend']);
    expect(parsed.isFavorite).toBe(true);

    const updatePayload = serializeUpdateNotePayload({
      noteTitle: 'Updated Concept',
      noteContent: 'New content',
      tags: ['React'],
      isFavorite: false,
    });
    const parsedUpdate = JSON.parse(updatePayload.noteText as string);
    expect(parsedUpdate.title).toBe('Updated Concept');
    expect(parsedUpdate.tags).toEqual(['React']);
    expect(parsedUpdate.isFavorite).toBe(false);
  });

  it('generates correct URLs for deep linking across views', () => {
    expect(getLessonPlayerUrl('sigma-1', 'tools-setup', 155, 'step-1')).toBe('/steps/step-1?lessonId=tools-setup&t=155');
    expect(getLessonPlayerUrl('sigma-1', 'tools-setup', null, 'step-1')).toBe('/steps/step-1?lessonId=tools-setup');
    expect(getCourseLearningPathUrl('sigma-1')).toBe('/programs/sigma-1/steps');
    expect(getMyNotesExplorerUrl({ courseId: 'c1', moduleId: 'm1', lessonId: 'l1', noteId: 'n1' }))
      .toBe('/notes?courseId=c1&moduleId=m1&lessonId=l1&noteId=n1');
  });
});
