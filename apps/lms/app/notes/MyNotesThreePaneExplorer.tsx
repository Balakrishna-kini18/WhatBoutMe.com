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

export function MyNotesThreePaneExplorer({
  courses,
  notes,
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
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest' | 'timestamp'>('newest');

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
  const isGlobalMode = searchQuery.trim().length > 0 || viewMode === 'favorites' || viewMode === 'recent' || viewMode === 'all';

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
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
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
  }, [notes, viewMode, searchQuery, sortOrder]);

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
          PAGE HEADER
          ───────────────────────────────────────────────────────────── */}
      <header className={styles.header}>
        <div className={styles.titleArea}>
          <div className={styles.titleRow}>
            <h1 className={styles.pageTitle}>
              <span className={styles.titleIcon}>📝</span>My Notes
            </h1>
          </div>
          <p className={styles.subtitle}>
            All your notes organized by course &rarr; module &rarr; lesson. Access and revise anytime.
          </p>
        </div>
        <div className={styles.badgeTotal}>
          <span>
            {notes.length} {notes.length === 1 ? 'Note' : 'Notes'}
          </span>
        </div>
      </header>

      {/* ─────────────────────────────────────────────────────────────
          TOOLBAR: TABS & SEARCH
          ───────────────────────────────────────────────────────────── */}
      <div className={styles.toolbar}>
        {/* Left View Mode Tabs */}
        <div className={styles.toolbarLeft}>
          {[
            { id: 'by_course', label: 'By Course' },
            { id: 'favorites', label: '★ Favorites' },
            { id: 'recent', label: '🕒 Recent' },
            { id: 'all', label: 'All Notes' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                setViewMode(tab.id as typeof viewMode);
                if (tab.id === 'by_course') {
                  setSearchQuery('');
                }
              }}
              className={`${styles.tabBtn} ${viewMode === tab.id ? styles.tabBtnActive : ''}`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Right Search Input & Sort Dropdown */}
        <div className={styles.toolbarRight}>
          <div className={styles.searchWrap}>
            <svg
              className={styles.searchIcon}
              width="16"
              height="16"
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
              {globalModeNotes.length} {globalModeNotes.length === 1 ? 'note found' : 'notes found'}
            </span>
          </div>

          <div className={styles.sectionHeaderRow}>
            <div>
              <h2 className={styles.sectionTitle}>
                {searchQuery.trim()
                  ? `Search results for "${searchQuery}"`
                  : viewMode === 'favorites'
                  ? '★ Favorite Notes'
                  : viewMode === 'recent'
                  ? '🕒 Recently Updated Notes'
                  : 'All Notes'}
              </h2>
              <p className={styles.sectionSubtitle}>
                Click any note card to edit, or jump to its lesson video timestamp.
              </p>
            </div>
          </div>

          {globalModeNotes.length === 0 ? (
            <div className={styles.emptyLessonNotesBox}>
              <div className={styles.emptyIconCircle}>🔍</div>
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
                          ⏱ {formatSecondsToTimestamp(note.videoTimestampSec)}
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
                      >
                        ★
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
          Shows courses with title, thumbnail, note count badge, and CTA
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

          {courses.length === 0 ? (
            <div className={styles.emptyLessonNotesBox}>
              <div className={styles.emptyIconCircle}>📚</div>
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
                      <Image
                        src={course.thumbnailUrl || '/images/course-placeholder.jpg'}
                        alt={course.title}
                        width={56}
                        height={56}
                        className={styles.courseCardThumb}
                      />
                      <div className={styles.courseCardContent}>
                        <h3 className={styles.courseCardTitle} title={course.title}>
                          {course.title}
                        </h3>
                        <p className={styles.courseCardMeta}>
                          {course.modules.length} {course.modules.length === 1 ? 'module' : 'modules'}
                        </p>
                      </div>
                      <div>
                        {count > 0 ? (
                          <span className={styles.notePillOrange}>
                            📄 {count} {count === 1 ? 'note' : 'notes'}
                          </span>
                        ) : (
                          <span className={styles.notePillMuted}>
                            0 notes
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
      {!isGlobalMode && selectedCourseId && !selectedLessonId && activeCourse && (
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
                  {activeCourse.title}
                </span>
              </nav>
            </div>
          </div>

          {/* Heading */}
          <div className={styles.sectionHeaderRow}>
            <div>
              <h2 className={styles.sectionTitle}>
                {activeCourse.title} &ndash; Notes
              </h2>
              <p className={styles.sectionSubtitle}>
                Select a module or lesson below to view its notes and timestamps.
              </p>
            </div>

            <div className={styles.sectionHeaderRight}>
              <span className={styles.notePillOrange} style={{ fontSize: '0.85rem', padding: '5px 12px' }}>
                📄 {noteCounts.byCourse[activeCourse.courseId] ?? 0} total notes
              </span>
            </div>
          </div>

          {/* Modules List */}
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
                        {mod.isLocked ? '🔒' : isExpanded ? '📂' : '📁'}
                      </span>
                      <span className={styles.moduleTitleText}>
                        {mod.title}
                      </span>
                    </div>

                    <div className={styles.moduleHeaderRight}>
                      <span
                        className={modNotesCount > 0 ? styles.notePillOrange : styles.notePillMuted}
                        style={{ fontSize: '0.75rem' }}
                      >
                        {modNotesCount} {modNotesCount === 1 ? 'note' : 'notes'}
                      </span>
                      <span className={styles.chevronSlot}>
                        {isExpanded ? '▴' : '▾'}
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
                              <span
                                className={`${styles.lessonStatusIcon} ${
                                  isDone ? styles.lessonStatusDone : styles.lessonStatusPending
                                }`}
                              >
                                {isDone ? '✓' : '○'}
                              </span>
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
                              <span
                                className={lessonCount > 0 ? styles.notePillOrange : styles.notePillMuted}
                                style={{ fontSize: '0.72rem' }}
                              >
                                📄 {lessonCount} {lessonCount === 1 ? 'note' : 'notes'}
                              </span>
                              <span className={styles.arrowSlot}>
                                &rarr;
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
        </section>
      )}

      {/* ─────────────────────────────────────────────────────────────
          LEVEL 3: LESSON NOTES VIEW
          e.g. "Notes for: Introduction" / "Sigma 1 › Module 1: Module 1"
          ───────────────────────────────────────────────────────────── */}
      {!isGlobalMode && selectedCourseId && selectedLessonId && activeCourse && activeModuleAndLesson && (
        <section className={styles.contentSection}>
          {/* Back Navigation & Breadcrumb */}
          <div className={styles.navRow}>
            <div className={styles.navGroup}>
              <button
                type="button"
                onClick={handleBackToCourseModules}
                className={styles.backButton}
              >
                <span className={styles.backArrow}>&larr;</span> Back to {activeCourse.title} Notes
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
                  className={styles.breadcrumbLink}
                >
                  {activeCourse.title}
                </button>
                <span className={styles.breadcrumbSeparator}>&rsaquo;</span>
                <span className={styles.breadcrumbMuted}>{activeModuleAndLesson.module.title}</span>
                <span className={styles.breadcrumbSeparator}>&rsaquo;</span>
                <span className={styles.breadcrumbCurrent}>
                  {activeModuleAndLesson.lesson.title}
                </span>
              </nav>
            </div>
          </div>

          {/* Card Container for Lesson Notes */}
          <div className={styles.lessonNotesContainer}>
            <div className={styles.lessonNotesTopHeader}>
              <div>
                <h2 className={styles.lessonNotesTitle}>
                  Notes for: {activeModuleAndLesson.lesson.title}
                </h2>
                <p className={styles.lessonNotesSubtitle}>
                  {activeCourse.title} &rsaquo; {activeModuleAndLesson.module.title}
                </p>
              </div>

              <button
                type="button"
                onClick={handleCreateNoteInActiveLesson}
                className={styles.addNoteBtnSolid}
              >
                + Add Note
              </button>
            </div>

            {currentLessonNotes.length === 0 ? (
              <div className={styles.emptyLessonNotesBox}>
                <div className={styles.emptyIconCircle}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="16" y1="13" x2="8" y2="13" />
                    <line x1="16" y1="17" x2="8" y2="17" />
                    <polyline points="10 9 9 9 8 9" />
                  </svg>
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
                    Open Lesson Video &rarr;
                  </button>
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
                          📄
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
                            ⏱ {formatSecondsToTimestamp(note.videoTimestampSec)}
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
                        >
                          ★
                        </button>

                        {/* ⋮ 3-Dot Action Menu */}
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
                            ⋮
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
                                ✏️ Edit Note
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
                                ▶ Jump to Video
                              </button>
                              <button
                                type="button"
                                onClick={async () => {
                                  setActiveMenuNoteId(null);
                                  await onToggleFavorite(note.noteId);
                                }}
                                className={styles.menuItemBtn}
                              >
                                ★ {note.isFavorite ? 'Remove Favorite' : 'Mark Favorite'}
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
                                🗑 Delete Note
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
