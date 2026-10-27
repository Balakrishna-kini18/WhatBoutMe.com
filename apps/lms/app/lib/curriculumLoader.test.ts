import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loadCourseCurriculum } from './curriculumLoader';

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

describe('curriculumLoader', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    const storage = new MemoryStorage();
    storage.setItem('token', 'fake-jwt-token');
    (global as any).window = { location: { origin: 'http://localhost:3003' } };
    (global as any).localStorage = storage;
  });

  it('transforms backend steps and progression into hierarchical EnrolledCourse model', async () => {
    const mockSteps = [
      {
        id: 'step-1',
        sequence: 1,
        title: 'Introduction',
        lessons: [
          {
            id: 'lesson-1',
            orderIndex: 1,
            title: 'What is Web Development?',
            durationSec: 492,
            videoUrl: 'https://stream.example.com/video1.mp4',
            resources: [{ id: 'res-1' }],
          },
          {
            id: 'lesson-2',
            orderIndex: 2,
            title: 'Tools & Setup',
            durationSec: 750,
            videoUrl: 'https://stream.example.com/video2.mp4',
            resources: [{ id: 'res-2' }, { id: 'res-3' }],
          },
        ],
      },
      {
        id: 'step-2',
        sequence: 2,
        title: 'HTML Fundamentals',
        lessons: [
          {
            id: 'lesson-3',
            orderIndex: 1,
            title: 'HTML Document Structure',
            durationSec: 600,
            videoUrl: 'https://stream.example.com/video3.mp4',
          },
        ],
      },
    ];

    const mockProgression = {
      programId: 'course-sigma-1',
      programTitle: 'Sigma 1',
      overallPercent: 50,
      steps: [
        {
          stepId: 'step-1',
          isUnlocked: true,
          isCompleted: false,
          lessons: [
            { lessonId: 'lesson-1', isCompleted: true },
            { lessonId: 'lesson-2', isCompleted: false },
          ],
        },
        {
          stepId: 'step-2',
          isUnlocked: false,
          isCompleted: false,
          lessons: [{ lessonId: 'lesson-3', isCompleted: false }],
        },
      ],
    };

    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/steps')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockSteps),
        });
      }
      if (url.includes('/progression/me')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockProgression),
        });
      }
      return Promise.reject(new Error(`Unhandled URL: ${url}`));
    }) as any;

    const noteCountsByLesson = {
      'lesson-1': 2,
      'lesson-2': 1,
    };

    const course = await loadCourseCurriculum('course-sigma-1', noteCountsByLesson);

    expect(course).not.toBeNull();
    expect(course?.courseId).toBe('course-sigma-1');
    expect(course?.title).toBe('Sigma 1');
    expect(course?.modules.length).toBe(2);

    // Module 1 checks
    const mod1 = course!.modules[0]!;
    expect(mod1.title).toBe('Module 1: Introduction');
    expect(mod1.isLocked).toBe(false);
    expect(mod1.completedLessonsCount).toBe(1);
    expect(mod1.totalLessonsCount).toBe(2);

    // Lesson 1 checks
    const les1 = mod1.lessons[0]!;
    expect(les1.title).toBe('What is Web Development?');
    expect(les1.status).toBe('completed');
    expect(les1.durationFormatted).toBe('8:12');
    expect(les1.notesCount).toBe(2);

    // Lesson 2 checks
    const les2 = mod1.lessons[1]!;
    expect(les2.title).toBe('Tools & Setup');
    expect(les2.status).toBe('current');
    expect(les2.durationFormatted).toBe('12:30');
    expect(les2.notesCount).toBe(1);

    // Module 2 (locked) checks
    const mod2 = course!.modules[1]!;
    expect(mod2.isLocked).toBe(true);
    expect(mod2.lockReason).toContain('Complete Module 1');
    expect(mod2.lessons[0]!.status).toBe('locked');
  });
});
