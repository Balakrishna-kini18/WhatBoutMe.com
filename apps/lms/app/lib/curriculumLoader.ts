// apps/lms/app/lib/curriculumLoader.ts

import { API_URL, getAuthHeaders, cachedFetch } from './api';
import { courseImageFor } from './courseImage';
import {
  EnrolledCourse,
  CourseModule,
  LessonItem,
  formatSecondsToTimestamp,
  LessonStatus,
} from '../types/learner-flow';

/**
 * Loads the curriculum tree and progression for a specific program/course.
 */
export async function loadCourseCurriculum(
  programId: string,
  noteCountsByLesson: Record<string, number> = {}
): Promise<EnrolledCourse | null> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  if (!token) return null;

  try {
    const [programRes, progRes] = await Promise.all([
      cachedFetch(`${API_URL}/programs/${programId}/steps`, {
        headers: getAuthHeaders(),
        ttlMs: 60_000,
      }),
      cachedFetch(`${API_URL}/progression/me/${programId}`, {
        headers: getAuthHeaders(),
        ttlMs: 20_000,
      }).catch(() => null),
    ]);

    if (!programRes.ok) {
      return null;
    }

    const stepsData = await programRes.json();
    const progressionData = progRes && progRes.ok ? await progRes.json() : null;

    const programTitle = progressionData?.programTitle || 'Course';
    const thumbnailUrl = courseImageFor(programTitle);

    const stepsArray = Array.isArray(stepsData) ? stepsData : [];
    const stepProgressMap: Record<string, any> = {};

    if (progressionData?.steps) {
      for (const s of progressionData.steps) {
        stepProgressMap[s.stepId] = s;
      }
    }

    let totalLessonsCount = 0;
    let completedLessonsCount = 0;
    let lastAccessedLessonId: string | undefined;

    const modules: CourseModule[] = stepsArray.map((step: any, modIdx: number) => {
      const stepProg = stepProgressMap[step.id];
      const isLocked = stepProg ? !stepProg.isUnlocked : modIdx > 0;
      const rawLessons = Array.isArray(step.lessons) ? step.lessons : [];

      let modCompletedLessons = 0;

      const lessons: LessonItem[] = rawLessons.map((l: any, lessonIdx: number) => {
        totalLessonsCount++;
        const progLesson = stepProg?.lessons?.find((pl: any) => pl.lessonId === l.id);
        const isCompleted = Boolean(progLesson?.isCompleted);
        if (isCompleted) {
          completedLessonsCount++;
          modCompletedLessons++;
        } else if (!lastAccessedLessonId && !isLocked) {
          lastAccessedLessonId = l.id;
        }

        let status: LessonStatus = 'unlocked';
        if (isLocked) {
          status = 'locked';
        } else if (isCompleted) {
          status = 'completed';
        } else if (lastAccessedLessonId === l.id || (!lastAccessedLessonId && lessonIdx === 0)) {
          status = 'current';
        }

        const durationSec = l.durationSec || 750; // default 12m30s if not set
        const notesCount = noteCountsByLesson[l.id] || 0;

        // Default overview & takeaways based on lesson title if not stored in DB
        const overview = l.description ||
          `In this lesson, you will master the core foundations of ${l.title}. Learn best practices, key architecture patterns, and practical implementation details.`;

        const keyTakeaways = [
          `Understanding the core lifecycle and patterns of ${l.title}`,
          `Avoiding common configuration pitfalls and anti-patterns`,
          `Writing scalable, clean, and production-tested code`,
        ];

        return {
          lessonId: l.id,
          lessonOrder: l.orderIndex || lessonIdx + 1,
          title: l.title,
          durationFormatted: formatSecondsToTimestamp(durationSec) || '12:30',
          durationSec,
          difficulty: lessonIdx === 0 ? 'Beginner' : lessonIdx < 3 ? 'Intermediate' : 'Advanced',
          status,
          videoUrl: l.videoUrl || '',
          overview,
          keyTakeaways,
          notesCount,
          resourcesCount: Array.isArray(l.resources) ? l.resources.length : 1,
        };
      });

      // If a step has no lessons attached in DB, generate standard interactive lessons
      const finalLessons: LessonItem[] = lessons.length > 0 ? lessons : [
        {
          lessonId: `${step.id}-lesson-1`,
          lessonOrder: 1,
          title: `${step.title}: Overview & Foundations`,
          durationFormatted: '08:12',
          durationSec: 492,
          difficulty: 'Beginner',
          status: isLocked ? 'locked' : stepProg?.isCompleted ? 'completed' : 'current',
          videoUrl: '',
          overview: `Comprehensive introduction to ${step.title}. Understand the principles and outcomes.`,
          keyTakeaways: [
            'Core mental models and practical context',
            'Step-by-step walkthrough of fundamental mechanics',
          ],
          notesCount: noteCountsByLesson[`${step.id}-lesson-1`] || 0,
          resourcesCount: 1,
        },
        {
          lessonId: `${step.id}-lesson-2`,
          lessonOrder: 2,
          title: `${step.title}: Practical Implementation`,
          durationFormatted: '12:30',
          durationSec: 750,
          difficulty: 'Intermediate',
          status: isLocked ? 'locked' : 'unlocked',
          videoUrl: '',
          overview: `Deep dive and hands-on exercises for ${step.title}.`,
          keyTakeaways: [
            'Hands-on execution and real-world scenarios',
            'Key performance checkpoints and validation tips',
          ],
          notesCount: noteCountsByLesson[`${step.id}-lesson-2`] || 0,
          resourcesCount: 2,
        },
      ];

      return {
        moduleId: step.id,
        moduleOrder: step.sequence || modIdx + 1,
        title: `Module ${step.sequence || modIdx + 1}: ${step.title}`,
        isLocked,
        lockReason: isLocked
          ? `Complete Module ${modIdx}: ${stepsArray[modIdx - 1]?.title || 'prerequisites'} to unlock this module.`
          : undefined,
        completedLessonsCount: modCompletedLessons,
        totalLessonsCount: finalLessons.length,
        lessons: finalLessons,
      };
    });

    const progressPercent = totalLessonsCount > 0
      ? Math.round((completedLessonsCount / totalLessonsCount) * 100)
      : progressionData?.overallPercent || 0;

    return {
      courseId: programId,
      title: programTitle,
      thumbnailUrl,
      status: progressPercent >= 100 ? 'completed' : 'in_progress',
      completedLessons: completedLessonsCount,
      totalLessons: totalLessonsCount,
      progressPercent,
      lastAccessedLessonId: lastAccessedLessonId || modules[0]?.lessons[0]?.lessonId,
      lastAccessedAt: new Date().toISOString(),
      modules,
    };
  } catch (err) {
    console.error('Error loading course curriculum:', err);
    return null;
  }
}

/**
 * Loads all enrolled courses with hydrated curriculum and note counts.
 */
export async function loadAllEnrolledCourses(
  noteCountsByLesson: Record<string, number> = {}
): Promise<EnrolledCourse[]> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  if (!token) return [];

  try {
    const res = await fetch(`${API_URL}/auth/me`, {
      headers: getAuthHeaders(),
    });
    if (!res.ok) return [];

    const data = await res.json();
    const enrolledList = data.enrolledPrograms || data.user?.enrolledPrograms || [];
    if (!Array.isArray(enrolledList) || enrolledList.length === 0) {
      return [];
    }

    const courses = await Promise.all(
      enrolledList.map(async (item: any) => {
        const programId = item.programId;
        if (!programId) return null;
        const course = await loadCourseCurriculum(programId, noteCountsByLesson);
        if (course) {
          if (item.programTitle) course.title = item.programTitle;
          return course;
        }

        // Fallback placeholder structure if curriculum steps fetch had an issue
        const progTitle = item.programTitle || 'Course';
        return {
          courseId: programId,
          title: progTitle,
          thumbnailUrl: courseImageFor(progTitle),
          status: (item.progress >= 100 ? 'completed' : 'in_progress') as 'in_progress' | 'completed',
          completedLessons: item.completedItems || 0,
          totalLessons: item.totalItems || 10,
          progressPercent: item.progress || 0,
          modules: [],
        };
      })
    );

    return courses.filter(Boolean) as EnrolledCourse[];
  } catch (err) {
    console.error('Failed to load enrolled courses', err);
    return [];
  }
}
