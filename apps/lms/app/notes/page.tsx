"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import styles from "./notes.module.css";
import {
  StudentNote,
  fetchStudentNotes,
  updateStudentNote,
  deleteStudentNote,
} from "../lib/api";
import { formatNoteDate, formatVideoTime } from "../lib/timezone";

export default function MyNotesPage() {
  const router = useRouter();
  const [notes, setNotes] = useState<StudentNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Filters & Sorting state
  const [searchQuery, setSearchQuery] = useState("");
  const [sortOrder, setSortOrder] = useState<"desc" | "asc">("desc");
  const [selectedProgramId, setSelectedProgramId] = useState<string>("ALL");
  const [selectedStepId, setSelectedStepId] = useState<string>("ALL");

  // Edit state
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Delete state
  const [deletingNoteId, setDeletingNoteId] = useState<string | null>(null);

  const loadNotes = useCallback(async () => {
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    if (!token) {
      router.push("/login");
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    try {
      const data = await fetchStudentNotes({
        sort: sortOrder,
      });
      setNotes(data);
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to load your notes. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [router, sortOrder]);

  useEffect(() => {
    loadNotes();
  }, [loadNotes]);

  // Extract unique programs and steps for filters
  const uniquePrograms = useMemo(() => {
    const map = new Map<string, string>();
    for (const n of notes) {
      if (n.programId && n.program?.title) {
        map.set(n.programId, n.program.title);
      }
    }
    return Array.from(map.entries()).map(([id, title]) => ({ id, title }));
  }, [notes]);

  const uniqueSteps = useMemo(() => {
    const map = new Map<string, { id: string; title: string; sequence?: number; programId?: string | null }>();
    for (const n of notes) {
      if (n.stepId && n.step?.title) {
        if (selectedProgramId === "ALL" || n.programId === selectedProgramId) {
          map.set(n.stepId, {
            id: n.stepId,
            title: n.step.title,
            sequence: n.step.sequence,
            programId: n.programId,
          });
        }
      }
    }
    return Array.from(map.values()).sort((a, b) => (a.sequence || 0) - (b.sequence || 0));
  }, [notes, selectedProgramId]);

  // Filter notes client-side for immediate responsive feel
  const filteredNotes = useMemo(() => {
    return notes.filter((n) => {
      // Program filter
      if (selectedProgramId !== "ALL" && n.programId !== selectedProgramId) {
        return false;
      }
      // Step filter
      if (selectedStepId !== "ALL" && n.stepId !== selectedStepId) {
        return false;
      }
      // Search query filter (matches noteText, highlightSnippet, lesson title, or step title)
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const textMatch = n.noteText?.toLowerCase().includes(q);
        const snippetMatch = n.highlightSnippet?.toLowerCase().includes(q);
        const lessonMatch = n.lesson?.title?.toLowerCase().includes(q);
        const stepMatch = n.step?.title?.toLowerCase().includes(q);
        if (!textMatch && !snippetMatch && !lessonMatch && !stepMatch) {
          return false;
        }
      }
      return true;
    });
  }, [notes, selectedProgramId, selectedStepId, searchQuery]);

  // Handle Edit submission
  const handleStartEdit = (note: StudentNote) => {
    setEditingNoteId(note.id);
    setEditText(note.noteText);
    setEditError(null);
  };

  const handleCancelEdit = () => {
    setEditingNoteId(null);
    setEditText("");
    setEditError(null);
  };

  const handleSaveEdit = async (noteId: string) => {
    const trimmed = editText.trim();
    if (!trimmed) {
      setEditError("Note text cannot be empty.");
      return;
    }
    if (trimmed.length > 5000) {
      setEditError("Note text cannot exceed 5,000 characters.");
      return;
    }

    setIsUpdating(true);
    setEditError(null);
    try {
      const updated = await updateStudentNote(noteId, { noteText: trimmed });
      setNotes((prev) => prev.map((n) => (n.id === noteId ? updated : n)));
      setEditingNoteId(null);
      setEditText("");
    } catch (err: any) {
      setEditError(err.message || "Failed to update note");
    } finally {
      setIsUpdating(false);
    }
  };

  // Handle Delete
  const handleDelete = async (noteId: string) => {
    if (!window.confirm("Are you sure you want to permanently delete this note?")) {
      return;
    }

    setDeletingNoteId(noteId);
    try {
      await deleteStudentNote(noteId);
      setNotes((prev) => prev.filter((n) => n.id !== noteId));
    } catch (err: any) {
      alert(err.message || "Failed to delete note");
    } finally {
      setDeletingNoteId(null);
    }
  };

  return (
    <div className={styles.container}>
      {/* HEADER */}
      <header className={styles.header}>
        <div className={styles.titleArea}>
          <h1>My Notes &amp; Highlights</h1>
          <p className={styles.subtitle}>
            Your private study notebook across all modules and lessons. Notes are visible only to you.
          </p>
        </div>
        <div className={styles.badgeTotal}>
          <span>{notes.length} {notes.length === 1 ? "Note" : "Notes"}</span>
        </div>
      </header>

      {/* TOOLBAR & FILTERS */}
      <div className={styles.toolbar}>
        {/* Search */}
        <div className={styles.searchWrap}>
          <svg className={styles.searchIcon} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search notes, highlights, or lesson topics..."
            className={styles.searchInput}
          />
        </div>

        {/* Filters */}
        <div className={styles.filterControls}>
          {uniquePrograms.length > 1 && (
            <select
              value={selectedProgramId}
              onChange={(e) => {
                setSelectedProgramId(e.target.value);
                setSelectedStepId("ALL");
              }}
              className={styles.selectInput}
              aria-label="Filter by program"
            >
              <option value="ALL">All Programs</option>
              {uniquePrograms.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </select>
          )}

          {uniqueSteps.length > 0 && (
            <select
              value={selectedStepId}
              onChange={(e) => setSelectedStepId(e.target.value)}
              className={styles.selectInput}
              aria-label="Filter by step/module"
            >
              <option value="ALL">All Modules</option>
              {uniqueSteps.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.sequence ? `Step ${s.sequence}: ` : ""}{s.title}
                </option>
              ))}
            </select>
          )}

          {/* Chronological Sort Toggle (Newest First vs. Oldest First) */}
          <button
            type="button"
            onClick={() => setSortOrder((prev) => (prev === "desc" ? "asc" : "desc"))}
            className={styles.sortBtn}
            title={sortOrder === "desc" ? "Sorted newest first. Click for oldest first." : "Sorted oldest first. Click for newest first."}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              {sortOrder === "desc" ? (
                <>
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <polyline points="19 12 12 19 5 12" />
                </>
              ) : (
                <>
                  <line x1="12" y1="19" x2="12" y2="5" />
                  <polyline points="5 12 12 5 19 12" />
                </>
              )}
            </svg>
            <span>{sortOrder === "desc" ? "Newest First" : "Oldest First"}</span>
          </button>
        </div>
      </div>

      {/* ERROR MESSAGE */}
      {errorMsg && (
        <div style={{ padding: "14px 18px", borderRadius: "10px", background: "#fef2f2", border: "1px solid #fecaca", color: "#b91c1c", marginBottom: "20px", fontSize: "0.9rem" }}>
          {errorMsg}
        </div>
      )}

      {/* LOADING SKELETON */}
      {loading ? (
        <div className={styles.notesList}>
          <div className={styles.skeleton} />
          <div className={styles.skeleton} />
          <div className={styles.skeleton} />
        </div>
      ) : filteredNotes.length === 0 ? (
        /* EMPTY STATE */
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="12" y1="18" x2="12" y2="12" />
              <line x1="9" y1="15" x2="15" y2="15" />
            </svg>
          </div>
          <h2 className={styles.emptyTitle}>
            {searchQuery || selectedProgramId !== "ALL" || selectedStepId !== "ALL"
              ? "No matching notes found"
              : "No notes saved yet"}
          </h2>
          <p className={styles.emptyDesc}>
            {searchQuery || selectedProgramId !== "ALL" || selectedStepId !== "ALL"
              ? "Try adjusting your search keywords or filter selections to find your notes."
              : "As you watch lesson videos and read course materials, use the collapsible \"My Notes\" drawer to capture personal takeaways, key quotes, and timestamp markers."}
          </p>
          <Link href="/courses" className={styles.browseCoursesBtn}>
            Go to My Courses &rarr;
          </Link>
        </div>
      ) : (
        /* NOTES LIST */
        <div className={styles.notesList}>
          {filteredNotes.map((note) => {
            const isEditing = editingNoteId === note.id;
            const targetUrl = note.stepId
              ? `/steps/${note.stepId}${note.lessonId ? `?lessonId=${note.lessonId}` : ""}${
                  note.videoTimestampSeconds != null ? `&t=${note.videoTimestampSeconds}` : ""
                }`
              : "#";

            return (
              <article key={note.id} className={styles.noteCard}>
                {/* CARD HEADER: MANDATORY STEP & LESSON METADATA */}
                <div className={styles.cardHeader}>
                  <div className={styles.breadcrumbs}>
                    {note.program?.title && (
                      <span className={styles.programTag} title={note.program.title}>
                        {note.program.title}
                      </span>
                    )}

                    {note.step && (
                      <span className={styles.stepTag}>
                        {note.step.sequence ? `Step ${note.step.sequence}: ` : ""}{note.step.title}
                      </span>
                    )}

                    {/* One-click jump link to the unlocked lesson */}
                    {note.lesson ? (
                      <Link
                        href={targetUrl}
                        className={styles.jumpLink}
                        title={`Jump back to lesson: ${note.lesson.title}`}
                      >
                        <span>{note.lesson.title}</span>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <polyline points="9 18 15 12 9 6" />
                        </svg>
                      </Link>
                    ) : note.stepId ? (
                      <Link
                        href={`/steps/${note.stepId}`}
                        className={styles.jumpLink}
                        title="Jump back to step"
                      >
                        <span>Jump to Step &rarr;</span>
                      </Link>
                    ) : null}
                  </div>

                  {/* Video Timestamp Badge (if present) */}
                  {note.videoTimestampSeconds != null && (
                    <Link
                      href={targetUrl}
                      className={styles.timestampBadge}
                      title={`Jump to video at ${formatVideoTime(note.videoTimestampSeconds)}`}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <circle cx="12" cy="12" r="10" />
                        <polyline points="12 6 12 12 16 14" />
                      </svg>
                      <span>{formatVideoTime(note.videoTimestampSeconds)}</span>
                    </Link>
                  )}
                </div>

                {/* HIGHLIGHT SNIPPET (IF CAPTURED) */}
                {note.highlightSnippet && (
                  <blockquote className={styles.highlightBox}>
                    <svg className={styles.highlightIcon} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M12 20h9" />
                      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                    </svg>
                    <span>&ldquo;{note.highlightSnippet}&rdquo;</span>
                  </blockquote>
                )}

                {/* NOTE BODY OR INLINE EDIT FORM */}
                {isEditing ? (
                  <div className={styles.editBox}>
                    <textarea
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      className={styles.editTextarea}
                      maxLength={5000}
                      rows={4}
                      disabled={isUpdating}
                      aria-label="Edit note text"
                    />
                    {editError && (
                      <p style={{ color: "#dc2626", fontSize: "0.8rem", margin: "4px 0" }}>
                        {editError}
                      </p>
                    )}
                    <div className={styles.editActions}>
                      <span style={{ fontSize: "0.78rem", color: "#64748b" }}>
                        {editText.length} / 5,000 characters
                      </span>
                      <div style={{ display: "flex", gap: "8px" }}>
                        <button
                          type="button"
                          onClick={handleCancelEdit}
                          disabled={isUpdating}
                          className={styles.cancelBtn}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSaveEdit(note.id)}
                          disabled={isUpdating || !editText.trim()}
                          className={styles.saveBtn}
                        >
                          {isUpdating ? "Saving..." : "Save Changes"}
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className={styles.noteBody}>{note.noteText}</p>
                )}

                {/* CARD FOOTER: MANDATORY DATE WRITTEN (LOCAL TIMEZONE) & ACTIONS */}
                <div className={styles.cardFooter}>
                  <div className={styles.dateWritten}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <circle cx="12" cy="12" r="10" />
                      <polyline points="12 6 12 12 16 14" />
                    </svg>
                    <span>Written on {formatNoteDate(note.createdAt)}</span>
                    {note.updatedAt && note.updatedAt !== note.createdAt && (
                      <span style={{ fontStyle: "italic", opacity: 0.8 }}>(edited)</span>
                    )}
                  </div>

                  {!isEditing && (
                    <div className={styles.cardActions}>
                      <button
                        type="button"
                        onClick={() => handleStartEdit(note)}
                        className={styles.editBtn}
                        title="Edit note"
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M12 20h9" />
                          <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                        </svg>
                        <span>Edit</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDelete(note.id)}
                        disabled={deletingNoteId === note.id}
                        className={styles.deleteBtn}
                        title="Delete note"
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        </svg>
                        <span>{deletingNoteId === note.id ? "Deleting..." : "Delete"}</span>
                      </button>
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
