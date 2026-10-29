// apps/lms/app/notes/MyNotesThreePaneExplorer.tsx
'use client';

import React, { useState, useMemo, useEffect } from 'react';
import Image from 'next/image';
import styles from './notes.module.css';
import {
  EnrolledCourse,
  ContextualNote,
  formatSecondsToTimestamp,
} from '../types/learner-flow';
import RichNoteEditorModal from '../components/notes/RichNoteEditorModal';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import { saveLastNotesContext } from '../lib/notesStorageEngine';

export interface MyNotesThreePaneExplorerProps {
  courses: EnrolledCourse[];
  notes: ContextualNote[];
  coursesLoading?: boolean;
  notesLoading?: boolean;
  initialCourseId?: string;
  initialModuleId?: string;
  initialLessonId?: string;
  initialNoteId?: string;
  onSelectNoteForEdit: (note: ContextualNote) => void;
  onSaveNote: (noteData: Partial<ContextualNote>) => Promise<void>;
  onDeleteNote: (noteId: string) => Promise<void>;
  onToggleFavorite: (noteId: string) => Promise<boolean>;
  onJumpToLessonPlayer: (
    courseId: string,
    lessonId: string,
    timestampSec: number | null,
    moduleId?: string
  ) => void;
  onNavigateLevel?: (params: {
    courseId?: string;
    moduleId?: string;
    lessonId?: string;
  }) => void;
}

/** Progressive image with skeleton placeholder and smooth fade-in */
function ProgressiveCourseThumbnail({ src, alt }: { src: string; alt: string }) {
  const [isLoaded, setIsLoaded] = useState(false);

  return (
    <div className={styles.thumbWrap}>
      {!isLoaded && (
        <div
          className={styles.skeletonPulse}
          style={{ position: 'absolute', inset: 0, borderRadius: 14 }}
          aria-hidden="true"
        />
      )}
      <Image
        src={src}
        alt={alt}
        width={52}
        height={52}
        loading="lazy"
        decoding="async"
        className={`${styles.thumbImg} ${isLoaded ? styles.thumbLoaded : styles.thumbLoading}`}
        onLoad={() => setIsLoaded(true)}
      />
    </div>
  );
}

/** Progressive skeleton grid for course cards */
function CourseCardsSkeletonList() {
  return (
    <div className={styles.courseCardsGrid} aria-label="Loading courses" aria-busy="true">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className={styles.courseCardSkeleton}>
          <div className={styles.courseCardTop}>
            <div className={styles.skeletonPulse} style={{ width: 52, height: 52, borderRadius: 10, flexShrink: 0 }} />
            <div className={styles.courseCardContent}>
              <div className={styles.skeletonPulse} style={{ width: '60%', height: 18, marginBottom: 8, borderRadius: 6 }} />
              <div className={styles.skeletonPulse} style={{ width: '35%', height: 14, borderRadius: 4 }} />
            </div>
            <div className={styles.skeletonPulse} style={{ width: 78, height: 26, borderRadius: 999, flexShrink: 0 }} />
          </div>
          <div className={styles.courseCardFooter} style={{ borderTop: '1px solid #f1f5f9', marginTop: 10, paddingTop: 10 }}>
            <div className={styles.skeletonPulse} style={{ width: 150, height: 14, borderRadius: 4 }} />
            <div className={styles.skeletonPulse} style={{ width: 85, height: 14, borderRadius: 4 }} />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Progressive skeleton list for course modules and lessons */
function ModulesSkeletonList() {
  return (
    <div className={styles.modulesContainer} aria-label="Loading modules and lessons" aria-busy="true">
      {[1, 2].map((m) => (
        <div key={m} className={styles.moduleSectionSkeleton}>
          <div className={styles.moduleHeaderSkeleton}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: '50%' }}>
              <div className={styles.skeletonPulse} style={{ width: 24, height: 24, borderRadius: 6, flexShrink: 0 }} />
              <div className={styles.skeletonPulse} style={{ width: '65%', height: 16, borderRadius: 4 }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div className={styles.skeletonPulse} style={{ width: 65, height: 22, borderRadius: 999 }} />
              <div className={styles.skeletonPulse} style={{ width: 14, height: 14, borderRadius: 4 }} />
            </div>
          </div>
          <div className={styles.lessonRowsList}>
            {[1, 2, 3].map((l) => (
              <div key={l} className={styles.lessonRowSkeleton}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: '60%' }}>
                  <div className={styles.skeletonPulse} style={{ width: 18, height: 18, borderRadius: '50%', flexShrink: 0 }} />
                  <div className={styles.skeletonPulse} style={{ width: '70%', height: 14, borderRadius: 4 }} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div className={styles.skeletonPulse} style={{ width: 60, height: 20, borderRadius: 999 }} />
                  <div className={styles.skeletonPulse} style={{ width: 14, height: 14, borderRadius: 4 }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Progressive skeleton list for note cards */
function NotesSkeletonList() {
  return (
    <div className={styles.lessonNotesStack} aria-label="Loading notes" aria-busy="true">
      {[1, 2, 3].map((i) => (
        <div key={i} className={styles.noteCardSkeleton}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: '65%' }}>
              <div className={styles.skeletonPulse} style={{ width: 28, height: 28, borderRadius: 8, flexShrink: 0 }} />
              <div className={styles.skeletonPulse} style={{ width: '70%', height: 18, borderRadius: 4 }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div className={styles.skeletonPulse} style={{ width: 60, height: 24, borderRadius: 6 }} />
              <div className={styles.skeletonPulse} style={{ width: 20, height: 20, borderRadius: 4 }} />
            </div>
          </div>
          <div className={styles.skeletonPulse} style={{ width: '95%', height: 14, borderRadius: 4 }} />
          <div className={styles.skeletonPulse} style={{ width: '75%', height: 14, borderRadius: 4 }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #f8fafc', paddingTop: 10, marginTop: 4 }}>
            <div className={styles.skeletonPulse} style={{ width: 110, height: 12, borderRadius: 4 }} />
            <div className={styles.skeletonPulse} style={{ width: 120, height: 12, borderRadius: 4 }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function MyNotesThreePaneExplorer({
  courses,
  notes,
  coursesLoading = false,
  notesLoading = false,
  initialCourseId,
  initialModuleId,
  initialLessonId,
  initialNoteId,
  onSelectNoteForEdit,
  onSaveNote,
  onDeleteNote,
  onToggleFavorite,
  onJumpToLessonPlayer,
  onNavigateLevel,
}: MyNotesThreePaneExplorerProps) {
  // Navigation Level State (Page-by-Page drill-down)
  // Level 1: 'courses'      (!selectedCourseId)
  // Level 2: 'modules'      (selectedCourseId && !selectedLessonId)
  // Level 3: 'lesson_notes' (selectedCourseId && selectedLessonId)
  const [selectedCourseId, setSelectedCourseId] = useState<string>(initialCourseId || '');
  const [selectedModuleId, setSelectedModuleId] = useState<string>(initialModuleId || '');
  const [selectedLessonId, setSelectedLessonId] = useState<string>(initialLessonId || '');

  // Keep internal selection synced when URL query parameters change (e.g. browser back/forward)
  useEffect(() => {
    setSelectedCourseId(initialCourseId || '');
  }, [initialCourseId]);

  useEffect(() => {
    setSelectedModuleId(initialModuleId || '');
  }, [initialModuleId]);

  useEffect(() => {
    setSelectedLessonId(initialLessonId || '');
  }, [initialLessonId]);

  // View Mode & Global Search Filters
  const [viewMode, setViewMode] = useState<'by_course' | 'all' | 'favorites' | 'recent'>('by_course');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest' | 'timestamp'>('newest');

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 200);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Accordion state for modules on Level 2
  const [expandedModuleIds, setExpandedModuleIds] = useState<Record<string, boolean>>({});

  // 3-Dot Action Menu state (open noteId)
  const [activeMenuNoteId, setActiveMenuNoteId] = useState<string | null>(null);

  // Editor Modal State
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingNote, setEditingNote] = useState<Partial<ContextualNote> | null>(null);
  const [noteToDeleteId, setNoteToDeleteId] = useState<string | null>(null);
  const [isDeletingNote, setIsDeletingNote] = useState(false);

  // Pre-compute note counts by Course, Module, and Lesson
  const noteCounts = useMemo(() => {
    const byCourse: Record<string, number> = {};
    const byModule: Record<string, number> = {};
    const byLesson: Record<string, number> = {};

    for (const note of notes) {
      if (note.courseId) byCourse[note.courseId] = (byCourse[note.courseId] || 0) + 1;
      if (note.moduleId) byModule[note.moduleId] = (byModule[note.moduleId] || 0) + 1;
      if (note.lessonId) byLesson[note.lessonId] = (byLesson[note.lessonId] || 0) + 1;
    }
    return { byCourse, byModule, byLesson };
  }, [notes]);

  // Lookup active course from selectedCourseId
  const activeCourse = useMemo(() => {
    if (!selectedCourseId) return null;
    return courses.find((c) => c.courseId === selectedCourseId) || null;
  }, [courses, selectedCourseId]);

  // Default expand all modules of active course so lessons are visible immediately
  useEffect(() => {
    if (activeCourse && activeCourse.modules.length > 0) {
      const initialExpanded: Record<string, boolean> = {};
      activeCourse.modules.forEach((mod) => {
        initialExpanded[mod.moduleId] = true;
      });
      setExpandedModuleIds(initialExpanded);
    }
  }, [activeCourse]);

  // Lookup active module & lesson
  const activeModuleAndLesson = useMemo(() => {
    if (!activeCourse || !selectedLessonId) return null;
    for (const mod of activeCourse.modules) {
      if (selectedModuleId && mod.moduleId !== selectedModuleId) continue;
      const found = mod.lessons.find((l) => l.lessonId === selectedLessonId);
      if (found) return { module: mod, lesson: found };
    }
    // Fallback search without moduleId restriction
    for (const mod of activeCourse.modules) {
      const found = mod.lessons.find((l) => l.lessonId === selectedLessonId);
      if (found) return { module: mod, lesson: found };
    }
    return null;
  }, [activeCourse, selectedModuleId, selectedLessonId]);

  // Open note modal if queryNoteId was passed in URL
  useEffect(() => {
    if (initialNoteId && notes.length > 0) {
      const match = notes.find((n) => n.noteId === initialNoteId);
      if (match) {
        setEditingNote(match);
        setIsEditorOpen(true);
      }
    }
  }, [initialNoteId, notes]);

  // Determine current display mode
  const effectiveQuery = debouncedSearchQuery.trim();
  const isGlobalMode = effectiveQuery.length > 0 || viewMode === 'favorites' || viewMode === 'recent' || viewMode === 'all';

  // Notes for Level 3 (Lesson Notes)
  const currentLessonNotes = useMemo(() => {
    if (!selectedCourseId || !selectedLessonId) return [];
    return notes
      .filter((n) => n.courseId === selectedCourseId && n.lessonId === selectedLessonId)
      .sort((a, b) => {
        if (sortOrder === 'newest') return +new Date(b.updatedAt) - +new Date(a.updatedAt);
        if (sortOrder === 'oldest') return +new Date(a.updatedAt) - +new Date(b.updatedAt);
        return (a.videoTimestampSec ?? 0) - (b.videoTimestampSec ?? 0);
      });
  }, [notes, selectedCourseId, selectedLessonId, sortOrder]);

  // Notes for Global Mode (Search / Favorites / Recent)
  const globalModeNotes = useMemo(() => {
    return notes
      .filter((n) => {
        if (viewMode === 'favorites' && !n.isFavorite) return false;
        if (effectiveQuery) {
          const q = effectiveQuery.toLowerCase();
          return (
            n.noteTitle.toLowerCase().includes(q) ||
            n.plainTextPreview.toLowerCase().includes(q) ||
            n.noteContent.toLowerCase().includes(q) ||
            n.tags.some((t) => t.toLowerCase().includes(q)) ||
            n.courseName.toLowerCase().includes(q) ||
            n.lessonName.toLowerCase().includes(q)
          );
        }
        return true;
      })
      .sort((a, b) => {
        if (sortOrder === 'newest' || viewMode === 'recent') {
          return +new Date(b.updatedAt) - +new Date(a.updatedAt);
        }
        if (sortOrder === 'oldest') {
          return +new Date(a.updatedAt) - +new Date(b.updatedAt);
        }
        return (a.videoTimestampSec ?? 0) - (b.videoTimestampSec ?? 0);
      });
  }, [notes, viewMode, effectiveQuery, sortOrder]);

  // Navigation Handlers
  const handleSelectCourse = (courseId: string) => {
    setSelectedCourseId(courseId);
    setSelectedModuleId('');
    setSelectedLessonId('');
    saveLastNotesContext({ courseId, moduleId: '', lessonId: '' });
    if (onNavigateLevel) {
      onNavigateLevel({ courseId });
    }
  };

  const handleSelectLesson = (courseId: string, moduleId: string, lessonId: string) => {
    setSelectedCourseId(courseId);
    setSelectedModuleId(moduleId);
    setSelectedLessonId(lessonId);
    saveLastNotesContext({ courseId, moduleId, lessonId });
    if (onNavigateLevel) {
      onNavigateLevel({ courseId, moduleId, lessonId });
    }
  };

  const handleBackToCourses = () => {
    setSelectedCourseId('');
    setSelectedModuleId('');
    setSelectedLessonId('');
    setViewMode('by_course');
    setSearchQuery('');
    if (onNavigateLevel) {
      onNavigateLevel({});
    }
  };

  const handleBackToCourseModules = () => {
    setSelectedLessonId('');
    if (onNavigateLevel) {
      onNavigateLevel({ courseId: selectedCourseId });
    }
  };

  const handleCreateNoteInActiveLesson = () => {
    if (!activeCourse || !activeModuleAndLesson) return;
    setEditingNote({
      courseId: activeCourse.courseId,
      courseName: activeCourse.title,
      moduleId: activeModuleAndLesson.module.moduleId,
      moduleName: activeModuleAndLesson.module.title,
      lessonId: activeModuleAndLesson.lesson.lessonId,
      lessonName: activeModuleAndLesson.lesson.title,
      videoTimestampSec: null,
      noteTitle: '',
      noteContent: '',
      tags: [],
      isFavorite: false,
      sourcePage: 'my_notes',
    });
    setIsEditorOpen(true);
  };

  return (
    <div className={styles.pageNavContainer}>
      {/* ─────────────────────────────────────────────────────────────
          PAGE HEADER (HERO)
          ───────────────────────────────────────────────────────────── */}
      <header className={styles.header}>
        <div className={styles.titleArea}>
          <div className={styles.titleRow}>
            <h1 className={styles.pageTitle}>
              <span className={styles.titleIcon}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#ea580c" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                </svg>
              </span>
              My Notes
            </h1>
          </div>
          <p className={styles.subtitle}>
            All your notes organized by course &rarr; module &rarr; lesson. Access and revise anytime.
          </p>
        </div>
        <div className={styles.badgeTotal}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
            <polyline points="10 9 9 9 8 9" />
          </svg>
          {notesLoading ? (
            <div className={styles.skeletonPulse} style={{ width: 44, height: 14, borderRadius: 4 }} />
          ) : (
            <span>
              {notes.length} {notes.length === 1 ? 'Note' : 'Notes'}
            </span>
          )}
        </div>
      </header>

      {/* ─────────────────────────────────────────────────────────────
          TOOLBAR: TABS & SEARCH
          ───────────────────────────────────────────────────────────── */}
      <div className={styles.toolbar}>
        {/* Left View Mode Tabs */}
        <div className={styles.toolbarLeft}>
          <button
            type="button"
            onClick={() => {
              setViewMode('by_course');
              setSearchQuery('');
            }}
            className={`${styles.tabBtn} ${viewMode === 'by_course' ? styles.tabBtnActive : ''}`}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
            </svg>
            By Course
          </button>

          <button
            type="button"
            onClick={() => setViewMode('favorites')}
            className={`${styles.tabBtn} ${viewMode === 'favorites' ? styles.tabBtnActive : ''}`}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill={viewMode === 'favorites' ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
            Favorites
          </button>

          <button
            type="button"
            onClick={() => setViewMode('recent')}
            className={`${styles.tabBtn} ${viewMode === 'recent' ? styles.tabBtnActive : ''}`}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            Recent
          </button>

          <button
            type="button"
            onClick={() => setViewMode('all')}
            className={`${styles.tabBtn} ${viewMode === 'all' ? styles.tabBtnActive : ''}`}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
              <polyline points="10 9 9 9 8 9" />
            </svg>
            All Notes
          </button>
        </div>

        {/* Center Vertical Divider */}
        <div className={styles.toolbarDivider} aria-hidden="true" />

        {/* Right Search Input & Sort Dropdown */}
        <div className={styles.toolbarRight}>
          <div className={styles.searchWrap}>
            <svg
              className={styles.searchIcon}
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search notes, tags, or concepts..."
              className={styles.searchInput}
            />
          </div>

          <div className={styles.filterControls}>
            <select
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value as typeof sortOrder)}
              className={styles.selectInput}
              aria-label="Sort order"
            >
              <option value="newest">Newest First</option>
              <option value="oldest">Oldest First</option>
              <option value="timestamp">Video Timestamp</option>
            </select>
          </div>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          GLOBAL SEARCH / FAVORITES / RECENT VIEW
          ───────────────────────────────────────────────────────────── */}
      {isGlobalMode && (
        <section className={styles.contentSection}>
          <div className={styles.navRow}>
            <div className={styles.navGroup}>
              <button
                type="button"
                onClick={() => {
                  setViewMode('by_course');
                  setSearchQuery('');
                }}
                className={styles.backButton}
              >
                <span className={styles.backArrow}>&larr;</span> Back to Course Browsing
              </button>
            </div>
            <span style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: 600 }}>
              {notesLoading
                ? 'Loading notes…'
                : `${globalModeNotes.length} ${globalModeNotes.length === 1 ? 'note found' : 'notes found'}`}
            </span>
          </div>

          <div className={styles.sectionHeaderRow}>
            <div>
              <h2 className={styles.sectionTitle}>
                {searchQuery.trim()
                  ? `Search results for "${searchQuery}"`
                  : viewMode === 'favorites'
                  ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="#f59e0b" stroke="#f59e0b" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                        </svg>
                        Favorite Notes
                      </span>
                    )
                  : viewMode === 'recent'
                  ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <circle cx="12" cy="12" r="10" />
                          <polyline points="12 6 12 12 16 14" />
                        </svg>
                        Recently Updated Notes
                      </span>
                    )
                  : 'All Notes'}
              </h2>
              <p className={styles.sectionSubtitle}>
                Click any note card to edit, or jump to its lesson video timestamp.
              </p>
            </div>
          </div>

          {notesLoading ? (
            <NotesSkeletonList />
          ) : globalModeNotes.length === 0 ? (
            <div className={styles.emptyLessonNotesBox}>
              <div className={styles.emptyIconCircle}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
              </div>
              <h3 className={styles.emptyTitle}>
                No matching notes found
              </h3>
              <p className={styles.emptyDesc}>
                Try adjusting your search query or browse by course.
              </p>
            </div>
          ) : (
            <div className={styles.lessonNotesStack}>
              {globalModeNotes.map((note) => (
                <article
                  key={note.noteId}
                  onClick={() => onSelectNoteForEdit(note)}
                  className={styles.singleNoteCard}
                >
                  <div className={styles.noteCardHeader}>
                    <div>
                      <div className={styles.globalNoteMeta}>
                        <span className={styles.globalNoteMetaCourse}>{note.courseName}</span>
                        <span className={styles.globalNoteMetaDivider}>&rsaquo;</span>
                        <span className={styles.globalNoteMetaLesson}>{note.lessonName}</span>
                      </div>
                      <h3 className={styles.noteCardTitle}>
                        {note.noteTitle}
                      </h3>
                    </div>

                    <div className={styles.noteCardHeaderRight}>
                      {note.videoTimestampSec !== null && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onJumpToLessonPlayer(
                              note.courseId,
                              note.lessonId,
                              note.videoTimestampSec,
                              note.moduleId
                            );
                          }}
                          className={styles.timestampBadge}
                          title="Jump to video at this timestamp"
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <circle cx="12" cy="12" r="10" />
                            <polyline points="12 6 12 12 16 14" />
                          </svg>
                          <span>{formatSecondsToTimestamp(note.videoTimestampSec)}</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={async (e) => {
                          e.stopPropagation();
                          await onToggleFavorite(note.noteId);
                        }}
                        className={styles.starBtn}
                        style={{ color: note.isFavorite ? '#f59e0b' : '#cbd5e1' }}
                        title={note.isFavorite ? 'Remove favorite' : 'Mark as favorite'}
                        aria-label={note.isFavorite ? 'Remove favorite' : 'Mark as favorite'}
                      >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill={note.isFavorite ? '#f59e0b' : 'none'} stroke={note.isFavorite ? '#f59e0b' : '#94a3b8'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                        </svg>
                      </button>
                    </div>
                  </div>

                  <p className={styles.notePreviewText}>
                    {note.plainTextPreview}
                  </p>

                  <div className={styles.noteCardFooter}>
                    <span>Updated {new Date(note.updatedAt).toLocaleDateString()}</span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSelectLesson(note.courseId, note.moduleId, note.lessonId);
                      }}
                      className={styles.noteJumpBtn}
                    >
                      View in Lesson Notes &rarr;
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      {/* ─────────────────────────────────────────────────────────────
          LEVEL 1: COURSE LIST ONLY (Default View)
          Shows courses in a clean 2x2 grid with progressive skeleton loading
          ───────────────────────────────────────────────────────────── */}
      {!isGlobalMode && !selectedCourseId && (
        <section className={styles.contentSection}>
          <div className={styles.sectionHeaderRow}>
            <div>
              <h2 className={styles.sectionTitle}>
                Select a Course
              </h2>
              <p className={styles.sectionSubtitle}>
                Choose an enrolled course below to open its modules, lessons, and recorded notes.
              </p>
            </div>
          </div>

          {coursesLoading ? (
            <CourseCardsSkeletonList />
          ) : courses.length === 0 ? (
            <div className={styles.emptyLessonNotesBox}>
              <div className={styles.emptyIconCircle}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                  <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                </svg>
              </div>
              <h3 className={styles.emptyTitle}>
                No enrolled courses found
              </h3>
              <p className={styles.emptyDesc}>
                Enroll in a program to start creating notes and bookmarks.
              </p>
            </div>
          ) : (
            <div className={styles.courseCardsGrid}>
              {courses.map((course) => {
                const count = noteCounts.byCourse[course.courseId] ?? 0;
                return (
                  <article
                    key={course.courseId}
                    onClick={() => handleSelectCourse(course.courseId)}
                    className={styles.courseCardItem}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        handleSelectCourse(course.courseId);
                      }
                    }}
                  >
                    <div className={styles.courseCardTop}>
                      <ProgressiveCourseThumbnail
                        src={course.thumbnailUrl || '/images/course-placeholder.jpg'}
                        alt={course.title}
                      />
                      <div className={styles.courseCardContent}>
                        <h3 className={styles.courseCardTitle} title={course.title}>
                          {course.title}
                        </h3>
                        <p className={styles.courseCardMeta}>
                          {course.modules.length} {course.modules.length === 1 ? 'module' : 'modules'}
                        </p>
                      </div>
                      <div className={styles.courseCardBadgeSlot}>
                        {count > 0 ? (
                          <span className={styles.notePillOrange}>
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                              <polyline points="14 2 14 8 20 8" />
                              <line x1="16" y1="13" x2="8" y2="13" />
                              <line x1="16" y1="17" x2="8" y2="17" />
                              <polyline points="10 9 9 9 8 9" />
                            </svg>
                            <span>{count} {count === 1 ? 'note' : 'notes'}</span>
                          </span>
                        ) : (
                          <span className={styles.notePillMuted}>
                            <span className={styles.emptyDotCircle} aria-hidden="true" />
                            <span>0 notes</span>
                          </span>
                        )}
                      </div>
                    </div>

                    <div className={styles.courseCardFooter}>
                      <span>Click to browse curriculum notes</span>
                      <span className={styles.courseCardCta}>
                        View Notes &rarr;
                      </span>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* ─────────────────────────────────────────────────────────────
          LEVEL 2: COURSE MODULES & LESSONS (e.g. "Sigma 1 – Notes")
          Opens when a specific course is pressed
          ───────────────────────────────────────────────────────────── */}
      {!isGlobalMode && selectedCourseId && !selectedLessonId && (
        <section className={styles.contentSection}>
          {/* Back Navigation & Breadcrumb */}
          <div className={styles.navRow}>
            <div className={styles.navGroup}>
              <button
                type="button"
                onClick={handleBackToCourses}
                className={styles.backButton}
              >
                <span className={styles.backArrow}>&larr;</span> Back to Courses
              </button>

              <span className={styles.navDivider} aria-hidden="true">|</span>

              <nav aria-label="Breadcrumb" className={styles.breadcrumbTrail}>
                <button
                  type="button"
                  onClick={handleBackToCourses}
                  className={styles.breadcrumbLink}
                >
                  My Notes
                </button>
                <span className={styles.breadcrumbSeparator}>&rsaquo;</span>
                <span className={styles.breadcrumbCurrent}>
                  {activeCourse ? activeCourse.title : 'Loading…'}
                </span>
              </nav>
            </div>
          </div>

          {/* Heading */}
          <div className={styles.sectionHeaderRow}>
            <div>
              <h2 className={styles.sectionTitle}>
                {activeCourse ? `${activeCourse.title} – Notes` : 'Course Notes'}
              </h2>
              <p className={styles.sectionSubtitle}>
                Select a module or lesson below to view its notes and timestamps.
              </p>
            </div>

            <div className={styles.sectionHeaderRight}>
              {activeCourse && (
                <div className={styles.badgeTotal}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="16" y1="13" x2="8" y2="13" />
                    <line x1="16" y1="17" x2="8" y2="17" />
                    <polyline points="10 9 9 9 8 9" />
                  </svg>
                  <span>{noteCounts.byCourse[activeCourse.courseId] ?? 0} total notes</span>
                </div>
              )}
            </div>
          </div>

          {coursesLoading || !activeCourse ? (
            <ModulesSkeletonList />
          ) : (
            <div className={styles.modulesContainer}>
              {activeCourse.modules.map((mod) => {
                const isExpanded = expandedModuleIds[mod.moduleId] ?? true;
                const modNotesCount = noteCounts.byModule[mod.moduleId] ?? 0;

                return (
                  <div key={mod.moduleId} className={styles.moduleSection}>
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedModuleIds((prev) => ({
                          ...prev,
                          [mod.moduleId]: !isExpanded,
                        }))
                      }
                      className={styles.moduleSectionHeader}
                    >
                      <div className={styles.moduleHeaderLeft}>
                        <span className={styles.moduleIcon}>
                          {mod.isLocked ? (
                            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                            </svg>
                          ) : (
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="#f59e0b" stroke="#d97706" strokeWidth="0.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                            </svg>
                          )}
                        </span>
                        <span className={styles.moduleTitleText}>
                          {mod.title}
                        </span>
                      </div>

                      <div className={styles.moduleHeaderRight}>
                        <span className={modNotesCount > 0 ? styles.notePillOrange : styles.notePillMuted}>
                          {modNotesCount > 0 ? (
                            <>
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
                              <span>{modNotesCount} {modNotesCount === 1 ? 'note' : 'notes'}</span>
                            </>
                          ) : (
                            <>
                              <span className={styles.emptyDotCircle} aria-hidden="true" />
                              <span>0 notes</span>
                            </>
                          )}
                        </span>
                        <span className={styles.chevronSlot} aria-hidden="true">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#334155" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                            {isExpanded ? (
                              <polyline points="18 15 12 9 6 15" />
                            ) : (
                              <polyline points="6 9 12 15 18 9" />
                            )}
                          </svg>
                        </span>
                      </div>
                    </button>

                    {isExpanded && (
                      <div className={styles.lessonRowsList}>
                        {mod.lessons.map((lesson) => {
                          const lessonCount = noteCounts.byLesson[lesson.lessonId] ?? 0;
                          const isDone = lesson.status === 'completed';
                          return (
                            <button
                              key={lesson.lessonId}
                              type="button"
                              onClick={() =>
                                handleSelectLesson(
                                  activeCourse.courseId,
                                  mod.moduleId,
                                  lesson.lessonId
                                )
                              }
                              className={styles.lessonRowItem}
                            >
                              <div className={styles.lessonRowLeft}>
                                {isDone ? (
                                  <span className={styles.greenCheckCircle} aria-label="Completed">
                                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                      <polyline points="20 6 9 17 4 12" />
                                    </svg>
                                  </span>
                                ) : (
                                  <span className={styles.pendingCircle} aria-label="Incomplete" />
                                )}
                                <span className={styles.lessonTitleText}>
                                  {lesson.lessonOrder}. {lesson.title}
                                </span>
                                {lesson.durationFormatted && (
                                  <span className={styles.lessonDurationText}>
                                    ({lesson.durationFormatted})
                                  </span>
                                )}
                              </div>

                              <div className={styles.lessonRowRight}>
                                <span className={lessonCount > 0 ? styles.notePillOrange : styles.notePillMuted}>
                                  {lessonCount > 0 ? (
                                    <>
                                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
                                      <span>{lessonCount} {lessonCount === 1 ? 'note' : 'notes'}</span>
                                    </>
                                  ) : (
                                    <>
                                      <span className={styles.emptyDotCircle} aria-hidden="true" />
                                      <span>0 notes</span>
                                    </>
                                  )}
                                </span>
                                <span className={styles.arrowSlot} aria-hidden="true">
                                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#ea580c" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                    <line x1="5" y1="12" x2="19" y2="12" />
                                    <polyline points="12 5 19 12 12 19" />
                                  </svg>
                                </span>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* ─────────────────────────────────────────────────────────────
          LEVEL 3: LESSON NOTES VIEW
          e.g. "Notes for: Introduction" / "Sigma 1 › Module 1: Module 1"
          ───────────────────────────────────────────────────────────── */}
      {!isGlobalMode && selectedCourseId && selectedLessonId && (
        <section className={styles.contentSection}>
          {/* Back Navigation & Breadcrumb */}
          <div className={styles.navRow}>
            <div className={styles.navGroup}>
              <button
                type="button"
                onClick={handleBackToCourseModules}
                className={styles.backButton}
              >
                <span className={styles.backArrow}>&larr;</span> Back to {activeCourse ? activeCourse.title : 'Course'} Notes
              </button>

              <span className={styles.navDivider} aria-hidden="true">|</span>

              <nav aria-label="Breadcrumb" className={styles.breadcrumbTrail}>
                <button
                  type="button"
                  onClick={handleBackToCourses}
                  className={styles.breadcrumbLink}
                >
                  My Notes
                </button>
                <span className={styles.breadcrumbSeparator}>&rsaquo;</span>
                <button
                  type="button"
                  onClick={handleBackToCourseModules}
                  className={styles.breadcrumbLinkMuted}
                >
                  {activeCourse ? activeCourse.title : 'Course'}
                </button>
                {activeModuleAndLesson && (
                  <>
                    <span className={styles.breadcrumbSeparatorMuted}>&rsaquo;</span>
                    <span className={styles.breadcrumbMuted}>{activeModuleAndLesson.module.title}</span>
                    <span className={styles.breadcrumbSeparatorMuted}>&rsaquo;</span>
                    <span className={styles.breadcrumbCurrent}>
                      {activeModuleAndLesson.lesson.title}
                    </span>
                  </>
                )}
              </nav>
            </div>
          </div>

          {/* Card Container for Lesson Notes */}
          <div className={styles.lessonNotesContainer}>
            <div className={styles.lessonNotesTopHeader}>
              <div>
                <h2 className={styles.lessonNotesTitle}>
                  {activeModuleAndLesson ? `Notes for: ${activeModuleAndLesson.lesson.title}` : 'Lesson Notes'}
                </h2>
                <p className={styles.lessonNotesSubtitle}>
                  {activeCourse && activeModuleAndLesson
                    ? `${activeCourse.title} › ${activeModuleAndLesson.module.title}`
                    : 'Loading notes context…'}
                </p>
              </div>

              <button
                type="button"
                onClick={handleCreateNoteInActiveLesson}
                disabled={!activeCourse || !activeModuleAndLesson}
                className={styles.addNoteBtnSolid}
                style={{ opacity: !activeCourse || !activeModuleAndLesson ? 0.6 : 1 }}
              >
                + Add Note
              </button>
            </div>

            {notesLoading ? (
              <NotesSkeletonList />
            ) : currentLessonNotes.length === 0 ? (
              <div className={styles.emptyLessonNotesBox}>
                <div className={styles.emptyIllustrationWrap}>
                  {/* Decorative Sparkle Accents */}
                  <span className={styles.emptySparkleTopLeft} aria-hidden="true">+</span>
                  <span className={styles.emptySparkleTopRight} aria-hidden="true">✦</span>
                  <span className={styles.emptySparkleRight} aria-hidden="true">+</span>
                  <span className={styles.emptySparkleBottomLeft} aria-hidden="true">✦</span>

                  {/* Document Card Icon */}
                  <div className={styles.emptyDocumentCard}>
                    <svg
                      width="38"
                      height="38"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#ea580c"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                      <line x1="16" y1="13" x2="8" y2="13" />
                      <line x1="16" y1="17" x2="8" y2="17" />
                      <line x1="10" y1="9" x2="8" y2="9" />
                    </svg>
                  </div>

                  {/* Soft Radiant Glow Ellipse Underneath */}
                  <div className={styles.emptyOvalGlow} aria-hidden="true" />
                </div>

                <h3 className={styles.emptyTitle}>
                  No notes found for this lesson
                </h3>
                <p className={styles.emptyDesc}>
                  Click &ldquo;+ Add Note&rdquo; above to capture key insights, or open the lesson video player to study and bookmark moments.
                </p>

                <div className={styles.emptyActionsRow}>
                  <button
                    type="button"
                    onClick={handleCreateNoteInActiveLesson}
                    className={styles.addNoteBtnSolid}
                  >
                    + Add Note
                  </button>
                  {activeCourse && activeModuleAndLesson && (
                    <button
                      type="button"
                      onClick={() =>
                        onJumpToLessonPlayer(
                          activeCourse.courseId,
                          activeModuleAndLesson.lesson.lessonId,
                          null,
                          activeModuleAndLesson.module.moduleId
                        )
                      }
                      className={styles.openVideoBtn}
                    >
                      <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <circle cx="12" cy="12" r="10" />
                        <polygon points="10 8 16 12 10 16 10 8" />
                      </svg>
                      <span>Open Lesson Video &rarr;</span>
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className={styles.lessonNotesStack}>
                {currentLessonNotes.map((note) => (
                  <article
                    key={note.noteId}
                    onClick={() => onSelectNoteForEdit(note)}
                    className={styles.singleNoteCard}
                  >
                    <div className={styles.noteCardHeader}>
                      <div className={styles.noteCardHeaderLeft}>
                        <span className={styles.noteIconSquare}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                            <polyline points="14 2 14 8 20 8" />
                            <line x1="16" y1="13" x2="8" y2="13" />
                            <line x1="16" y1="17" x2="8" y2="17" />
                            <polyline points="10 9 9 9 8 9" />
                          </svg>
                        </span>
                        <h3 className={styles.noteCardTitle}>
                          {note.noteTitle}
                        </h3>
                      </div>

                      <div className={styles.noteCardHeaderRight}>
                        {note.videoTimestampSec !== null && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onJumpToLessonPlayer(
                                note.courseId,
                                note.lessonId,
                                note.videoTimestampSec,
                                note.moduleId
                              );
                            }}
                            className={styles.timestampBadge}
                            title="Jump to Lesson Player at this timestamp"
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <circle cx="12" cy="12" r="10" />
                              <polyline points="12 6 12 12 16 14" />
                            </svg>
                            <span>{formatSecondsToTimestamp(note.videoTimestampSec)}</span>
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={async (e) => {
                            e.stopPropagation();
                            await onToggleFavorite(note.noteId);
                          }}
                          className={styles.starBtn}
                          style={{
                            color: note.isFavorite ? '#f59e0b' : '#cbd5e1',
                          }}
                          title={note.isFavorite ? 'Remove favorite' : 'Mark favorite'}
                          aria-label={note.isFavorite ? 'Remove favorite' : 'Mark favorite'}
                        >
                          <svg width="18" height="18" viewBox="0 0 24 24" fill={note.isFavorite ? '#f59e0b' : 'none'} stroke={note.isFavorite ? '#f59e0b' : '#94a3b8'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                          </svg>
                        </button>

                        {/* 3-Dot Action Menu */}
                        <div className={styles.actionMenuDropdown}>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveMenuNoteId(
                                activeMenuNoteId === note.noteId ? null : note.noteId
                              );
                            }}
                            className={styles.actionDotsBtn}
                            aria-label="Note options"
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                              <circle cx="12" cy="5" r="1.75" />
                              <circle cx="12" cy="12" r="1.75" />
                              <circle cx="12" cy="19" r="1.75" />
                            </svg>
                          </button>

                          {activeMenuNoteId === note.noteId && (
                            <div
                              className={styles.menuPopover}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveMenuNoteId(null);
                                  onSelectNoteForEdit(note);
                                }}
                                className={styles.menuItemBtn}
                              >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                                </svg>
                                <span>Edit Note</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveMenuNoteId(null);
                                  onJumpToLessonPlayer(
                                    note.courseId,
                                    note.lessonId,
                                    note.videoTimestampSec,
                                    note.moduleId
                                  );
                                }}
                                className={styles.menuItemBtn}
                              >
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true">
                                  <polygon points="5 3 19 12 5 21 5 3" />
                                </svg>
                                <span>Jump to Video</span>
                              </button>
                              <button
                                type="button"
                                onClick={async () => {
                                  setActiveMenuNoteId(null);
                                  await onToggleFavorite(note.noteId);
                                }}
                                className={styles.menuItemBtn}
                              >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill={note.isFavorite ? '#f59e0b' : 'none'} stroke={note.isFavorite ? '#f59e0b' : 'currentColor'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                                </svg>
                                <span>{note.isFavorite ? 'Remove Favorite' : 'Mark Favorite'}</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveMenuNoteId(null);
                                  setNoteToDeleteId(note.noteId);
                                }}
                                className={styles.menuItemBtn}
                                style={{ color: '#dc2626' }}
                              >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                  <polyline points="3 6 5 6 21 6" />
                                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                  <line x1="10" y1="11" x2="10" y2="17" />
                                  <line x1="14" y1="11" x2="14" y2="17" />
                                </svg>
                                <span>Delete Note</span>
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    <p className={styles.notePreviewText}>
                      {note.plainTextPreview}
                    </p>

                    {/* Tag Pills */}
                    {note.tags && note.tags.length > 0 && (
                      <div className={styles.noteTagsRow}>
                        {note.tags.map((tag) => (
                          <span
                            key={tag}
                            className={styles.noteTagPill}
                          >
                            #{tag}
                          </span>
                        ))}
                      </div>
                    )}

                    <div className={styles.noteCardFooter}>
                      <span>Last updated {new Date(note.updatedAt).toLocaleDateString()}</span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onJumpToLessonPlayer(
                            note.courseId,
                            note.lessonId,
                            note.videoTimestampSec,
                            note.moduleId
                          );
                        }}
                        className={styles.noteJumpBtn}
                      >
                        Go to Video Player &rarr;
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {/* ─────────────────────────────────────────────────────────────
          RICH NOTE EDITOR MODAL
          ───────────────────────────────────────────────────────────── */}
      <RichNoteEditorModal
        isOpen={isEditorOpen}
        initialNote={editingNote}
        onClose={() => {
          setIsEditorOpen(false);
          setEditingNote(null);
        }}
        onSave={async (updated) => {
          await onSaveNote(updated);
        }}
        onDelete={onDeleteNote}
        onJumpToLesson={(courseId, lessonId, ts, moduleId) => {
          setIsEditorOpen(false);
          onJumpToLessonPlayer(courseId, lessonId, ts, moduleId);
        }}
      />

      <ConfirmModal
        isOpen={noteToDeleteId !== null}
        onClose={() => {
          if (!isDeletingNote) setNoteToDeleteId(null);
        }}
        onConfirm={async () => {
          if (!noteToDeleteId) return;
          setIsDeletingNote(true);
          try {
            await onDeleteNote(noteToDeleteId);
            setNoteToDeleteId(null);
          } finally {
            setIsDeletingNote(false);
          }
        }}
        title="Delete Note"
        message="Are you sure you want to permanently delete this note? This action cannot be undone."
        confirmText="Delete Note"
        cancelText="Cancel"
        tone="danger"
        isLoading={isDeletingNote}
      />
    </div>
  );
}
