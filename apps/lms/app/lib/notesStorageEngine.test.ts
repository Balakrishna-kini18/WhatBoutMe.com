import { describe, it, expect, beforeEach } from 'vitest';
import {
  saveNoteDraft,
  getNoteDraft,
  clearNoteDraft,
  saveLastNotesContext,
  getLastNotesContext,
  addRecentSearch,
  getRecentSearches,
} from './notesStorageEngine';

class MemoryStorage {
  private store = new Map<string, string>();
  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }
  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  clear(): void {
    this.store.clear();
  }
}

describe('notesStorageEngine', () => {
  beforeEach(() => {
    (global as any).window = { location: { origin: 'http://localhost:3003' } };
    (global as any).localStorage = new MemoryStorage();
  });

  it('saves, retrieves, and clears in-progress note drafts', () => {
    expect(getNoteDraft('lesson-123')).toBeNull();

    saveNoteDraft('lesson-123', {
      courseId: 'course-1',
      moduleId: 'mod-1',
      noteTitle: 'Draft Title',
      noteContent: 'Unsaved thoughts on Node.js',
      tags: ['Node.js'],
      isFavorite: true,
      videoTimestampSec: 145,
    });

    const draft = getNoteDraft('lesson-123');
    expect(draft).not.toBeNull();
    expect(draft?.title).toBe('Draft Title');
    expect(draft?.content).toBe('Unsaved thoughts on Node.js');
    expect(draft?.tags).toEqual(['Node.js']);
    expect(draft?.isFavorite).toBe(true);
    expect(draft?.videoTimestampSec).toBe(145);

    clearNoteDraft('lesson-123');
    expect(getNoteDraft('lesson-123')).toBeNull();
  });

  it('persists and restores last viewed 3-pane navigation context', () => {
    expect(getLastNotesContext()).toBeNull();

    saveLastNotesContext({
      courseId: 'sigma-1',
      moduleId: 'mod-1',
      lessonId: 'tools-setup',
      view: 'favorites',
    });

    const ctx = getLastNotesContext();
    expect(ctx?.courseId).toBe('sigma-1');
    expect(ctx?.moduleId).toBe('mod-1');
    expect(ctx?.lessonId).toBe('tools-setup');
    expect(ctx?.view).toBe('favorites');
  });

  it('records recent search queries without duplicates', () => {
    addRecentSearch('Node.js');
    addRecentSearch('React setup');
    addRecentSearch('Node.js'); // duplicate should move to front

    const searches = getRecentSearches();
    expect(searches).toEqual(['Node.js', 'React setup']);
  });
});
