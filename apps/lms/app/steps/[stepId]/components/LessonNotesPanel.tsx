"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  StudentNote,
  fetchLessonNotes,
  createStudentNote,
  updateStudentNote,
  deleteStudentNote,
} from "../../../lib/api";
import { formatNoteDate, formatVideoTime } from "../../../lib/timezone";
import { normalizeStudentNote } from "../../../lib/notesAdapter";

interface LessonNotesPanelProps {
  programId?: string;
  stepId: string;
  lessonId?: string | null;
  lessonTitle?: string;
  getCurrentVideoTime?: () => number | null;
  onSeekToVideoTime?: (seconds: number) => void;
}

export default function LessonNotesPanel({
  programId,
  stepId,
  lessonId,
  lessonTitle,
  getCurrentVideoTime,
  onSeekToVideoTime,
}: LessonNotesPanelProps) {
  const [notes, setNotes] = useState<StudentNote[]>([]);
  const [loading, setLoading] = useState(false);
  const [newNoteText, setNewNoteText] = useState("");
  const [highlightSnippet, setHighlightSnippet] = useState("");
  const [capturedTimestamp, setCapturedTimestamp] = useState<number | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isCollapsed, setIsCollapsed] = useState(false);

  // Edit state
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);

  const loadNotes = useCallback(async () => {
    if (!lessonId) return;
    setLoading(true);
    try {
      const data = await fetchLessonNotes(lessonId);
      setNotes(data);
    } catch (e: any) {
      console.warn("Could not load lesson notes", e);
    } finally {
      setLoading(false);
    }
  }, [lessonId]);

  useEffect(() => {
    loadNotes();
  }, [loadNotes]);

  const handleCaptureTimestamp = () => {
    if (getCurrentVideoTime) {
      const timeSec = getCurrentVideoTime();
      if (timeSec != null && !isNaN(timeSec) && timeSec >= 0) {
        setCapturedTimestamp(Math.floor(timeSec));
      }
    }
  };

  const handleCreateNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNoteText.trim()) return;

    if (newNoteText.trim().length > 5000) {
      setErrorMsg("Notes cannot exceed 5,000 characters.");
      return;
    }

    setIsSaving(true);
    setErrorMsg(null);
    try {
      const created = await createStudentNote({
        programId,
        stepId,
        lessonId: lessonId || undefined,
        noteText: newNoteText.trim(),
        highlightSnippet: highlightSnippet.trim() || undefined,
        videoTimestampSeconds: capturedTimestamp ?? undefined,
      });

      setNotes((prev) => [created, ...prev]);
      setNewNoteText("");
      setHighlightSnippet("");
      setCapturedTimestamp(null);
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to save note");
    } finally {
      setIsSaving(false);
    }
  };

  const handleStartEdit = (note: StudentNote) => {
    setEditingNoteId(note.id);
    setEditText(note.noteText);
  };

  const handleSaveEdit = async (noteId: string) => {
    if (!editText.trim()) return;
    setIsUpdating(true);
    try {
      const updated = await updateStudentNote(noteId, {
        noteText: editText.trim(),
      });
      setNotes((prev) =>
        prev.map((n) => (n.id === noteId ? { ...n, noteText: updated.noteText, updatedAt: updated.updatedAt } : n))
      );
      setEditingNoteId(null);
      setEditText("");
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to update note");
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDelete = async (noteId: string) => {
    if (!window.confirm("Are you sure you want to delete this personal note?")) return;
    try {
      setNotes((prev) => prev.filter((n) => n.id !== noteId));
      await deleteStudentNote(noteId);
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to delete note");
      loadNotes();
    }
  };

  return (
    <div
      style={{
        marginTop: "1.5rem",
        borderRadius: "14px",
        background: "var(--bg-card, #ffffff)",
        border: "1px solid var(--border-light, #e2e8f0)",
        padding: "1.25rem",
        boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
      }}
    >
      {/* Header with collapse toggle */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          cursor: "pointer",
          userSelect: "none",
        }}
        onClick={() => setIsCollapsed(!isCollapsed)}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: "8px",
              background: "var(--accent-highlight, #f0f9ff)",
              color: "var(--accent-primary, #0284c7)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 800,
              fontSize: "0.9rem",
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" /></svg>
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: "1rem", fontWeight: 700, color: "var(--text-primary)" }}>
              My Notes &amp; Highlights
            </h3>
            <p style={{ margin: 0, fontSize: "0.78rem", color: "var(--text-secondary, #64748b)" }}>
              Personal &bull; Private to you &bull; {notes.length} note{notes.length !== 1 ? "s" : ""} recorded
            </p>
          </div>
        </div>

        <button
          type="button"
          aria-label={isCollapsed ? "Expand Notes" : "Collapse Notes"}
          style={{
            background: "transparent",
            border: "none",
            color: "var(--text-muted, #94a3b8)",
            cursor: "pointer",
            fontSize: "0.85rem",
            fontWeight: 600,
          }}
        >
          {isCollapsed ? "+ Expand" : "− Collapse"}
        </button>
      </div>

      {!isCollapsed && (
        <div style={{ marginTop: "1rem" }}>
          {errorMsg && (
            <div
              style={{
                padding: "8px 12px",
                borderRadius: "6px",
                background: "#fef2f2",
                border: "1px solid #fecaca",
                color: "#b91c1c",
                fontSize: "0.82rem",
                marginBottom: "12px",
              }}
            >
              {errorMsg}
            </div>
          )}

          {/* New Note Form */}
          <form onSubmit={handleCreateNote} style={{ marginBottom: "1.25rem" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {/* Highlight snippet field (optional) */}
              <input
                type="text"
                placeholder="Optional highlight or quote from lesson text / transcript..."
                value={highlightSnippet}
                onChange={(e) => setHighlightSnippet(e.target.value)}
                maxLength={2000}
                style={{
                  padding: "8px 12px",
                  borderRadius: "8px",
                  border: "1px solid var(--border-light, #e2e8f0)",
                  fontSize: "0.85rem",
                  background: "var(--bg-soft, #f8fafc)",
                  color: "var(--text-primary)",
                  fontStyle: "italic",
                }}
              />

              {/* Note text area */}
              <textarea
                rows={3}
                required
                placeholder="Write your personal notes, takeaways, or action items..."
                value={newNoteText}
                onChange={(e) => setNewNoteText(e.target.value)}
                maxLength={5000}
                style={{
                  padding: "10px 12px",
                  borderRadius: "8px",
                  border: "1px solid var(--border-light, #cbd5e1)",
                  fontSize: "0.9rem",
                  fontFamily: "inherit",
                  resize: "vertical",
                  boxSizing: "border-box",
                }}
              />

              {/* Controls bar: Timestamp capture & Save button */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: 8,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {getCurrentVideoTime && (
                    <button
                      type="button"
                      onClick={handleCaptureTimestamp}
                      style={{
                        padding: "5px 10px",
                        borderRadius: "6px",
                        border: "1px solid #cbd5e1",
                        background: capturedTimestamp != null ? "#eff6ff" : "#ffffff",
                        color: capturedTimestamp != null ? "#1d4ed8" : "#475569",
                        fontSize: "0.8rem",
                        fontWeight: 600,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: 4,
                      }}
                      title="Attach current video playback timestamp to this note"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
                      <span>
                        {capturedTimestamp != null
                          ? `At ${formatVideoTime(capturedTimestamp)}`
                          : "Capture Video Time"}
                      </span>
                    </button>
                  )}

                  {capturedTimestamp != null && (
                    <button
                      type="button"
                      onClick={() => setCapturedTimestamp(null)}
                      style={{
                        background: "transparent",
                        border: "none",
                        color: "#ef4444",
                        fontSize: "0.75rem",
                        cursor: "pointer",
                      }}
                    >
                      Clear Time
                    </button>
                  )}

                  <span style={{ fontSize: "0.75rem", color: "var(--text-secondary, #64748b)" }}>
                    {newNoteText.length}/5000 chars
                  </span>
                </div>

                <button
                  type="submit"
                  disabled={isSaving || !newNoteText.trim()}
                  style={{
                    padding: "7px 16px",
                    borderRadius: "8px",
                    background: "var(--accent-primary, #0284c7)",
                    color: "#ffffff",
                    border: "none",
                    fontWeight: 700,
                    fontSize: "0.85rem",
                    cursor: isSaving || !newNoteText.trim() ? "not-allowed" : "pointer",
                    opacity: isSaving || !newNoteText.trim() ? 0.6 : 1,
                  }}
                >
                  {isSaving ? "Saving..." : "Save Note"}
                </button>
              </div>
            </div>
          </form>

          {/* Existing Notes List */}
          {loading ? (
            <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)", padding: "10px 0" }}>
              Loading your notes...
            </div>
          ) : notes.length === 0 ? (
            <div
              style={{
                padding: "1.25rem",
                textAlign: "center",
                background: "var(--bg-soft, #f8fafc)",
                borderRadius: "10px",
                border: "1px dashed var(--border-light, #e2e8f0)",
              }}
            >
              <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--text-secondary, #64748b)" }}>
                No notes taken for this lesson yet. Type above to record private notes and video highlights.
              </p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {notes.map((note) => {
                const isEditing = editingNoteId === note.id;

                return (
                  <div
                    key={note.id}
                    style={{
                      padding: "12px 14px",
                      borderRadius: "10px",
                      background: "var(--bg-soft, #f8fafc)",
                      border: "1px solid var(--border-light, #e2e8f0)",
                      display: "flex",
                      flexDirection: "column",
                      gap: 6,
                    }}
                  >
                    {/* Note Top Bar: Date, Timestamp Badge, and Actions */}
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        fontSize: "0.78rem",
                        color: "var(--text-secondary, #64748b)",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <span>{formatNoteDate(note.createdAt)}</span>
                        {note.videoTimestampSeconds != null && (
                          <button
                            type="button"
                            onClick={() => onSeekToVideoTime && onSeekToVideoTime(note.videoTimestampSeconds!)}
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 3,
                              background: "#eff6ff",
                              color: "#1d4ed8",
                              padding: "2px 8px",
                              borderRadius: "4px",
                              fontWeight: 700,
                              fontSize: "0.75rem",
                              border: "1px solid #bfdbfe",
                              cursor: onSeekToVideoTime ? "pointer" : "default",
                            }}
                            title={onSeekToVideoTime ? "Jump to this video timestamp" : undefined}
                          >
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><polygon points="6 4 20 12 6 20 6 4" /></svg>
                            <span>{formatVideoTime(note.videoTimestampSeconds)}</span>
                          </button>
                        )}
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <button
                          type="button"
                          onClick={() => handleStartEdit(note)}
                          style={{
                            background: "transparent",
                            border: "none",
                            color: "var(--accent-primary, #0284c7)",
                            fontSize: "0.78rem",
                            cursor: "pointer",
                            fontWeight: 600,
                          }}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(note.id)}
                          style={{
                            background: "transparent",
                            border: "none",
                            color: "#ef4444",
                            fontSize: "0.78rem",
                            cursor: "pointer",
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    </div>

                    {/* Highlight snippet if present */}
                    {note.highlightSnippet && (
                      <div
                        style={{
                          borderLeft: "3px solid var(--accent-primary, #0284c7)",
                          paddingLeft: "8px",
                          fontStyle: "italic",
                          fontSize: "0.85rem",
                          color: "var(--text-secondary, #475569)",
                          margin: "2px 0",
                        }}
                      >
                        &ldquo;{note.highlightSnippet}&rdquo;
                      </div>
                    )}

                    {/* Note Content (or inline edit textarea) */}
                    {isEditing ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 4 }}>
                        <textarea
                          rows={3}
                          value={editText}
                          onChange={(e) => setEditText(e.target.value)}
                          maxLength={5000}
                          style={{
                            padding: "8px",
                            borderRadius: "6px",
                            border: "1px solid #cbd5e1",
                            fontSize: "0.88rem",
                            fontFamily: "inherit",
                          }}
                        />
                        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                          <button
                            type="button"
                            onClick={() => setEditingNoteId(null)}
                            style={{
                              padding: "4px 10px",
                              borderRadius: "4px",
                              border: "1px solid #cbd5e1",
                              background: "#ffffff",
                              fontSize: "0.78rem",
                              cursor: "pointer",
                            }}
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            disabled={isUpdating || !editText.trim()}
                            onClick={() => handleSaveEdit(note.id)}
                            style={{
                              padding: "4px 12px",
                              borderRadius: "4px",
                              border: "none",
                              background: "var(--accent-primary, #0284c7)",
                              color: "#ffffff",
                              fontWeight: 700,
                              fontSize: "0.78rem",
                              cursor: "pointer",
                            }}
                          >
                            {isUpdating ? "Updating..." : "Save"}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div
                        style={{
                          fontSize: "0.9rem",
                          color: "var(--text-primary)",
                          lineHeight: 1.5,
                          whiteSpace: "pre-wrap",
                        }}
                      >
                        {(() => {
                          const norm = normalizeStudentNote(note);
                          return (
                            <div>
                              {norm.noteTitle && norm.noteTitle !== 'Untitled Note' && (
                                <strong style={{ display: 'block', fontSize: '0.92rem', marginBottom: 2, color: 'var(--text-primary)' }}>
                                  {norm.noteTitle}
                                </strong>
                              )}
                              <div style={{ whiteSpace: 'pre-wrap' }}>{norm.noteContent}</div>
                              {norm.tags && norm.tags.length > 0 && (
                                <div style={{ display: 'flex', gap: 4, marginTop: 4, flexWrap: 'wrap' }}>
                                  {norm.tags.map((t) => (
                                    <span key={t} style={{ fontSize: '0.72rem', background: '#ffedd5', color: '#9a3412', padding: '1px 6px', borderRadius: 4 }}>
                                      #{t}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
