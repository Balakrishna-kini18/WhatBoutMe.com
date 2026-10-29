// apps/lms/app/notes/page.tsx
'use client';

import React, { Suspense, useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { MyNotesThreePaneExplorer } from './MyNotesThreePaneExplorer';
import { loadAllEnrolledCourses } from '../lib/curriculumLoader';
import { useNotesStore } from '../lib/useNotesStore';
import { EnrolledCourse, ContextualNote } from '../types/learner-flow';
import { getLessonPlayerUrl } from '../lib/notesAdapter';
import NotesLoading from './loading';

export default function MyNotesPage() {
  return (
    <Suspense fallback={<NotesLoading />}>
      <MyNotesContent />
    </Suspense>
  );
}

function MyNotesContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const queryCourseId = searchParams.get('courseId') || undefined;
  const queryModuleId = searchParams.get('moduleId') || undefined;
  const queryLessonId = searchParams.get('lessonId') || undefined;
  const queryNoteId = searchParams.get('noteId') || undefined;

  const [courses, setCourses] = useState<EnrolledCourse[]>([]);
  const [coursesLoading, setCoursesLoading] = useState(true);

  const {
    notes,
    loading: notesLoading,
    error,
    addNote,
    editNote,
    removeNote,
    toggleFavorite,
    noteCounts,
  } = useNotesStore();

  // Load enrolled courses once on initial mount
  useEffect(() => {
    let active = true;
    async function fetchEnrolled() {
      setCoursesLoading(true);
      const data = await loadAllEnrolledCourses(noteCounts.byLesson);
      if (active) {
        setCourses(data);
        setCoursesLoading(false);
      }
    }
    fetchEnrolled();
    return () => {
      active = false;
    };
  }, []);

  // When noteCounts updates (e.g. note added/removed), update note counts on already-loaded courses in memory
  // without triggering duplicate network waterfall re-fetches
  useEffect(() => {
    if (courses.length === 0) return;
    setCourses((prevCourses) =>
      prevCourses.map((c) => ({
        ...c,
        modules: c.modules.map((m) => ({
          ...m,
          lessons: m.lessons.map((l) => ({
            ...l,
            notesCount: noteCounts.byLesson[l.lessonId] || 0,
          })),
        })),
      }))
    );
  }, [noteCounts.byLesson]);

  return (
    <MyNotesThreePaneExplorer
      courses={courses}
      notes={notes}
      coursesLoading={coursesLoading}
      notesLoading={notesLoading}
      initialCourseId={queryCourseId}
      initialModuleId={queryModuleId}
      initialLessonId={queryLessonId}
      initialNoteId={queryNoteId}
      onNavigateLevel={(params) => {
        const sp = new URLSearchParams();
        if (params.courseId) sp.set('courseId', params.courseId);
        if (params.moduleId) sp.set('moduleId', params.moduleId);
        if (params.lessonId) sp.set('lessonId', params.lessonId);
        const qs = sp.toString();
        router.push(qs ? `/notes?${qs}` : '/notes');
      }}
      onSelectNoteForEdit={(note: ContextualNote) => {
        router.push(`/notes/${note.noteId}`);
      }}
      onSaveNote={async (noteData) => {
        if (noteData.noteId) {
          await editNote(noteData.noteId, {
            noteTitle: noteData.noteTitle,
            noteContent: noteData.noteContent,
            tags: noteData.tags,
            isFavorite: noteData.isFavorite,
            videoTimestampSec: noteData.videoTimestampSec,
          });
        } else if (noteData.courseId && noteData.moduleId && noteData.lessonId) {
          await addNote({
            courseId: noteData.courseId,
            courseName: noteData.courseName,
            moduleId: noteData.moduleId,
            moduleName: noteData.moduleName,
            lessonId: noteData.lessonId,
            lessonName: noteData.lessonName,
            noteTitle: noteData.noteTitle || 'Untitled Note',
            noteContent: noteData.noteContent || '',
            tags: noteData.tags,
            isFavorite: noteData.isFavorite,
            videoTimestampSec: noteData.videoTimestampSec,
            sourcePage: 'my_notes',
          });
        }
      }}
      onDeleteNote={async (noteId) => {
        await removeNote(noteId);
      }}
      onToggleFavorite={async (noteId) => {
        return toggleFavorite(noteId);
      }}
      onJumpToLessonPlayer={(cId, lId, ts, mId) => {
        router.push(getLessonPlayerUrl(cId, lId, ts, mId));
      }}
    />
  );
}
