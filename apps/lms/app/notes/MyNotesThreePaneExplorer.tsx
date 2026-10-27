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
          <h1>
            <span style={{ marginRight: 8 }}>📝</span>My Notes
          </h1>
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
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
              style={{
                background: 'none',
                border: 'none',
                padding: '6px 2px',
                fontSize: '0.88rem',
                fontWeight: 600,
                color: viewMode === tab.id ? '#ea580c' : '#64748b',
                borderBottom: viewMode === tab.id ? '2px solid #f97316' : '2px solid transparent',
                cursor: 'pointer',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Center Search Input */}
        <div className={styles.searchWrap} style={{ maxWidth: 360 }}>
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

        {/* Right Sort Dropdown */}
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

      {/* ─────────────────────────────────────────────────────────────
          GLOBAL SEARCH / FAVORITES / RECENT VIEW
          ───────────────────────────────────────────────────────────── */}
      {isGlobalMode && (
        <section style={{ marginTop: 12 }}>
          <div className={styles.navRow}>
            <button
              type="button"
              onClick={() => {
                setViewMode('by_course');
                setSearchQuery('');
              }}
              className={styles.backButton}
            >
              &larr; Back to Course Browsing
            </button>
            <span style={{ fontSize: '0.85rem', color: '#64748b' }}>
              {globalModeNotes.length} {globalModeNotes.length === 1 ? 'note found' : 'notes found'}
            </span>
          </div>

          <div style={{ marginBottom: 16 }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a', margin: '0 0 4px' }}>
              {searchQuery.trim()
                ? `Search results for "${searchQuery}"`
                : viewMode === 'favorites'
                ? '★ Favorite Notes'
                : viewMode === 'recent'
                ? '🕒 Recently Updated Notes'
                : 'All Notes'}
            </h2>
            <p style={{ fontSize: '0.85rem', color: '#64748b', margin: 0 }}>
              Click any note card to edit, or jump to its lesson video timestamp.
            </p>
          </div>

          {globalModeNotes.length === 0 ? (
            <div className={styles.emptyLessonNotesBox}>
              <div style={{ fontSize: '2rem', marginBottom: 8 }}>🔍</div>
              <p style={{ fontWeight: 700, color: '#0f172a', margin: '0 0 4px' }}>
                No matching notes found
              </p>
              <p style={{ fontSize: '0.85rem', color: '#64748b' }}>
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
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.78rem', color: '#ea580c', fontWeight: 600, marginBottom: 4 }}>
                        <span>{note.courseName}</span>
                        <span>&rsaquo;</span>
                        <span style={{ color: '#64748b' }}>{note.lessonName}</span>
                      </div>
                      <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#0f172a', margin: 0 }}>
                        {note.noteTitle}
                      </h3>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
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
                        style={{
                          background: 'none',
                          border: 'none',
                          color: note.isFavorite ? '#f59e0b' : '#cbd5e1',
                          cursor: 'pointer',
                          fontSize: '1.2rem',
                          padding: '0 4px',
                        }}
                        title={note.isFavorite ? 'Remove favorite' : 'Mark as favorite'}
                      >
                        ★
                      </button>
                    </div>
                  </div>

                  <p style={{ fontSize: '0.86rem', color: '#64748b', lineHeight: 1.5, margin: '8px 0' }}>
                    {note.plainTextPreview}
                  </p>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.75rem', color: '#94a3b8', marginTop: 10 }}>
                    <span>Updated {new Date(note.updatedAt).toLocaleDateString()}</span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSelectLesson(note.courseId, note.moduleId, note.lessonId);
                      }}
                      style={{ background: 'none', border: 'none', color: '#ea580c', fontWeight: 600, cursor: 'pointer' }}
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
        <section style={{ marginTop: 12 }}>
          <div style={{ marginBottom: 18 }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a', margin: '0 0 4px' }}>
              Select a Course
            </h2>
            <p style={{ fontSize: '0.88rem', color: '#64748b', margin: 0 }}>
              Choose an enrolled course below to open its modules, lessons, and recorded notes.
            </p>
          </div>

          {courses.length === 0 ? (
            <div className={styles.emptyLessonNotesBox}>
              <div style={{ fontSize: '2rem', marginBottom: 8 }}>📚</div>
              <p style={{ fontWeight: 700, color: '#0f172a', margin: '0 0 4px' }}>
                No enrolled courses found
              </p>
              <p style={{ fontSize: '0.85rem', color: '#64748b' }}>
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
        <section style={{ marginTop: 12 }}>
          {/* Back Navigation & Breadcrumb */}
          <div className={styles.navRow}>
            <button
              type="button"
              onClick={handleBackToCourses}
              className={styles.backButton}
            >
              &larr; Back to Courses
            </button>

            <nav aria-label="Breadcrumb" className={styles.breadcrumbTrail}>
              <button
                type="button"
                onClick={handleBackToCourses}
                className={styles.breadcrumbLink}
              >
                My Notes
              </button>
              <span>&rsaquo;</span>
              <span style={{ fontWeight: 700, color: '#0f172a' }}>
                {activeCourse.title}
              </span>
            </nav>
          </div>

          {/* Heading */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
            <div>
              <h2 style={{ fontSize: '1.45rem', fontWeight: 800, color: '#0f172a', margin: '0 0 4px' }}>
                {activeCourse.title} &ndash; Notes
              </h2>
              <p style={{ fontSize: '0.88rem', color: '#64748b', margin: 0 }}>
                Select a module or lesson below to view its notes and timestamps.
              </p>
            </div>

            <div>
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
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                      <span style={{ fontSize: '1.05rem' }}>
                        {mod.isLocked ? '🔒' : isExpanded ? '📂' : '📁'}
                      </span>
                      <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {mod.title}
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <span
                        className={modNotesCount > 0 ? styles.notePillOrange : styles.notePillMuted}
                        style={{ fontSize: '0.75rem' }}
                      >
                        {modNotesCount} {modNotesCount === 1 ? 'note' : 'notes'}
                      </span>
                      <span style={{ color: '#94a3b8', fontSize: '0.8rem' }}>
                        {isExpanded ? '▴' : '▾'}
                      </span>
                    </div>
                  </button>

                  {isExpanded && (
                    <div className={styles.lessonRowsList}>
                      {mod.lessons.map((lesson) => {
                        const lessonCount = noteCounts.byLesson[lesson.lessonId] ?? 0;
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
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                              <span
                                style={{
                                  color: lesson.status === 'completed' ? '#16a34a' : '#ea580c',
                                  fontSize: '0.9rem',
                                  fontWeight: 'bold',
                                }}
                              >
                                {lesson.status === 'completed' ? '✓' : '○'}
                              </span>
                              <span style={{ fontWeight: 600, color: '#1e293b', fontSize: '0.9rem' }}>
                                {lesson.lessonOrder}. {lesson.title}
                              </span>
                              {lesson.durationFormatted && (
                                <span style={{ fontSize: '0.75rem', color: '#94a3b8', marginLeft: 4 }}>
                                  ({lesson.durationFormatted})
                                </span>
                              )}
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                              <span
                                className={lessonCount > 0 ? styles.notePillOrange : styles.notePillMuted}
                                style={{ fontSize: '0.72rem' }}
                              >
                                📄 {lessonCount} {lessonCount === 1 ? 'note' : 'notes'}
                              </span>
                              <span style={{ color: '#ea580c', fontWeight: 700, fontSize: '0.9rem' }}>
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
        <section style={{ marginTop: 12 }}>
          {/* Back Navigation & Breadcrumb */}
          <div className={styles.navRow}>
            <button
              type="button"
              onClick={handleBackToCourseModules}
              className={styles.backButton}
            >
              &larr; Back to {activeCourse.title} Notes
            </button>

            <nav aria-label="Breadcrumb" className={styles.breadcrumbTrail}>
              <button
                type="button"
                onClick={handleBackToCourses}
                className={styles.breadcrumbLink}
              >
                My Notes
              </button>
              <span>&rsaquo;</span>
              <button
                type="button"
                onClick={handleBackToCourseModules}
                className={styles.breadcrumbLink}
              >
                {activeCourse.title}
              </button>
              <span>&rsaquo;</span>
              <span>{activeModuleAndLesson.module.title}</span>
              <span>&rsaquo;</span>
              <span style={{ fontWeight: 700, color: '#0f172a' }}>
                {activeModuleAndLesson.lesson.title}
              </span>
            </nav>
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
                <div style={{ fontSize: '2.5rem', marginBottom: 10 }}>📄</div>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#0f172a', margin: '0 0 6px' }}>
                  No notes found for this lesson
                </h3>
                <p style={{ fontSize: '0.86rem', color: '#64748b', maxWidth: 420, margin: '0 auto 18px', lineHeight: 1.5 }}>
                  Click &ldquo;+ Add Note&rdquo; above to capture key insights, or open the lesson video player to study and bookmark moments.
                </p>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
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
                    style={{
                      padding: '9px 18px',
                      borderRadius: 10,
                      background: '#ffffff',
                      border: '1px solid #cbd5e1',
                      fontSize: '0.88rem',
                      fontWeight: 600,
                      color: '#334155',
                      cursor: 'pointer',
                    }}
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
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                        <span
                          style={{
                            width: 28,
                            height: 28,
                            borderRadius: 8,
                            background: '#ffedd5',
                            color: '#ea580c',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '0.85rem',
                            flexShrink: 0,
                          }}
                        >
                          📄
                        </span>
                        <h3
                          style={{
                            fontSize: '1.05rem',
                            fontWeight: 700,
                            color: '#0f172a',
                            margin: 0,
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {note.noteTitle}
                        </h3>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
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
                          style={{
                            background: 'none',
                            border: 'none',
                            color: note.isFavorite ? '#f59e0b' : '#cbd5e1',
                            cursor: 'pointer',
                            fontSize: '1.25rem',
                            padding: '0 4px',
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

                    <p
                      style={{
                        fontSize: '0.88rem',
                        color: '#64748b',
                        lineHeight: 1.55,
                        margin: '10px 0',
                        display: '-webkit-box',
                        WebkitLineClamp: 3,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                      }}
                    >
                      {note.plainTextPreview}
                    </p>

                    {/* Tag Pills */}
                    {note.tags && note.tags.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                        {note.tags.map((tag) => (
                          <span
                            key={tag}
                            style={{
                              fontSize: '0.72rem',
                              padding: '2px 8px',
                              borderRadius: 6,
                              background: '#f1f5f9',
                              color: '#475569',
                              fontWeight: 600,
                            }}
                          >
                            #{tag}
                          </span>
                        ))}
                      </div>
                    )}

                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        fontSize: '0.75rem',
                        color: '#94a3b8',
                        paddingTop: 10,
                        borderTop: '1px solid #f8fafc',
                      }}
                    >
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
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#ea580c',
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
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
