"use client";

import React, { useState } from "react";
import styles from "../step.module.css";

interface LearningTabsPanelProps {
  step: any;
  currentMedia: any;
  documents: any[];
  textLessons: any[];
  personalNotes: string;
  notesSaveStatus: string;
  onNotesChange: (text: string) => void;
  onInsertTimestamp: () => void;
  onExportNotes: () => void;
  lessonProgress: Record<string, any>;
  onCompleteDocument: (docId: string) => void;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  onTriggerFloatingAITutor: () => void;
}

type TabType = "overview" | "resources" | "transcript" | "notes" | "discussion" | "aitutor";

export default function LearningTabsPanel({
  step,
  currentMedia,
  documents,
  textLessons,
  personalNotes,
  notesSaveStatus,
  onNotesChange,
  onInsertTimestamp,
  onExportNotes,
  lessonProgress,
  onCompleteDocument,
  videoRef,
  onTriggerFloatingAITutor,
}: LearningTabsPanelProps) {
  const [activeTab, setActiveTab] = useState<TabType>("overview");

  // Mock sample transcript items linked to video seconds
  const transcriptLines = [
    { sec: 0, time: "00:00", text: `Welcome to this lesson on ${step.title}. In this session, we will break down core principles and practical examples.` },
    { sec: 45, time: "00:45", text: "Notice how the elements interact within the hierarchy. This foundational structure dictates cascading behavior." },
    { sec: 120, time: "02:00", text: "Let us inspect the live browser environment to see the exact rendering tree and layout performance." },
    { sec: 240, time: "04:00", text: "A common pitfall is over-specifying selectors. Always aim for clarity and minimal specificity." },
    { sec: 360, time: "06:00", text: "To summarize: combine these rules with best practices for accessible and maintainable architecture." },
  ];

  // Mock discussion threads
  const [discussions, setDiscussions] = useState([
    {
      id: "1",
      author: "Aditi S.",
      avatar: "AS",
      time: "2 hours ago",
      question: "What is the key performance difference when using direct combinators vs nested descendant selectors?",
      replies: 2,
      upvotes: 8,
      isInstructorAnswered: true,
      instructorReply: "Direct child combinators stop evaluating at depth 1, eliminating broad descendant tree traversals. Highly recommended for complex component trees!",
    },
    {
      id: "2",
      author: "Karan M.",
      avatar: "KM",
      time: "Yesterday",
      question: "Are there specific accessibility concerns with hiding pseudo-elements using CSS?",
      replies: 1,
      upvotes: 4,
      isInstructorAnswered: false,
      instructorReply: null,
    },
  ]);
  const [newQuestionText, setNewQuestionText] = useState("");

  const handlePostQuestion = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newQuestionText.trim()) return;
    setDiscussions((prev) => [
      {
        id: Date.now().toString(),
        author: "You",
        avatar: "ME",
        time: "Just now",
        question: newQuestionText.trim(),
        replies: 0,
        upvotes: 1,
        isInstructorAnswered: false,
        instructorReply: null,
      },
      ...prev,
    ]);
    setNewQuestionText("");
  };

  const [aiChatMessages, setAiChatMessages] = useState<Array<{ role: "user" | "assistant"; text: string }>>([
    {
      role: "assistant",
      text: `Hello! I'm your WhatBoutMe AI Study Copilot for "${step?.title || "this lesson"}". Ask me any question, request code examples, or ask for a concept breakdown.`,
    },
  ]);
  const [aiChatInput, setAiChatInput] = useState("");
  const [isAiChatTyping, setIsAiChatTyping] = useState(false);

  const handleSendAiChatMessage = (presetText?: string) => {
    const text = presetText || aiChatInput;
    if (!text.trim()) return;

    setAiChatMessages((prev) => [...prev, { role: "user", text }]);
    setAiChatInput("");
    setIsAiChatTyping(true);

    setTimeout(() => {
      let reply = `In ${step?.title || "this step"}, the key insight is understanding how the core principles and practical examples work together.`;
      const lower = text.toLowerCase();
      if (lower.includes("summarize") || lower.includes("summary")) {
        reply = `Key Summary for ${step?.title || "Lesson"}:\n1. Master the core hierarchy and flow.\n2. Ensure clean separation of concerns.\n3. Validate with the end-of-step knowledge check.`;
      } else if (lower.includes("simply") || lower.includes("simple")) {
        reply = `Think of ${step?.title || "this concept"} like building blocks: each lesson is a solid foundation that unlocks the next level.`;
      } else if (lower.includes("quiz") || lower.includes("question")) {
        reply = `Practice question: What is the main milestone required to unlock the next step in this curriculum? (Hint: Check the requirements tab!)`;
      } else if (lower.includes("code") || lower.includes("example")) {
        reply = `Here is a sample implementation:\n\`\`\`typescript\n// Safe progression check\nconst canAdvance = Boolean(isCompleted && !isLocked);\n\`\`\``;
      }
      setAiChatMessages((prev) => [...prev, { role: "assistant", text: reply }]);
      setIsAiChatTyping(false);
    }, 600);
  };

  const seekToTimestamp = (sec: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = sec;
      videoRef.current.play().catch(() => {});
    }
  };

  const allResourcesCount = documents.length + textLessons.length;

  return (
    <div style={{ width: "100%", marginTop: "1.75rem" }}>
      {/* Tab Navigation Headers */}
      <div
        style={{
          display: "flex",
          borderBottom: "1px solid var(--border-light)",
          gap: "0.25rem",
          overflowX: "auto",
          WebkitOverflowScrolling: "touch",
          paddingBottom: "1px",
        }}
      >
        {[
          { id: "overview", label: "Overview", icon: "📌" },
          { id: "resources", label: `Resources (${allResourcesCount})`, icon: "📄" },
          { id: "transcript", label: "Transcript", icon: "💬" },
          { id: "notes", label: "My Notes", icon: "📝" },
          { id: "discussion", label: `Discussion (${discussions.length})`, icon: "👥" },
          { id: "aitutor", label: "AI Tutor", icon: "🤖" },
        ].map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id as TabType)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.4rem",
                padding: "0.75rem 1.15rem",
                background: isActive ? "#ffffff" : "transparent",
                border: "1px solid",
                borderColor: isActive ? "var(--border-light) var(--border-light) #ffffff" : "transparent",
                borderRadius: "8px 8px 0 0",
                color: isActive ? "var(--accent-primary)" : "var(--text-secondary)",
                fontWeight: isActive ? 700 : 500,
                fontSize: "0.88rem",
                cursor: "pointer",
                whiteSpace: "nowrap",
                marginBottom: "-1px",
                transition: "all 0.15s ease",
              }}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab Content Body */}
      <div
        style={{
          background: "#ffffff",
          border: "1px solid var(--border-light)",
          borderRadius: "0 0 14px 14px",
          padding: "1.75rem",
          boxShadow: "0 4px 16px -4px rgba(20, 17, 15, 0.04)",
        }}
      >
        {/* TAB 1: OVERVIEW */}
        {activeTab === "overview" && (
          <div>
            <div style={{ display: "flex", gap: "1.5rem", flexWrap: "wrap", marginBottom: "1.5rem" }}>
              <div style={{ padding: "0.75rem 1.25rem", background: "var(--bg-soft)", borderRadius: 10 }}>
                <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 700 }}>
                  Estimated Duration
                </span>
                <div style={{ fontSize: "1.05rem", fontWeight: 700, color: "var(--text-primary)" }}>
                  {currentMedia?.durationSec ? `${Math.round(currentMedia.durationSec / 60)} Minutes` : "Self-Paced"}
                </div>
              </div>

              <div style={{ padding: "0.75rem 1.25rem", background: "var(--bg-soft)", borderRadius: 10 }}>
                <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 700 }}>
                  Skill Level
                </span>
                <div style={{ fontSize: "1.05rem", fontWeight: 700, color: "var(--text-primary)" }}>
                  Core Curriculum
                </div>
              </div>

              <div style={{ padding: "0.75rem 1.25rem", background: "var(--bg-soft)", borderRadius: 10 }}>
                <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 700 }}>
                  Prerequisites
                </span>
                <div style={{ fontSize: "1.05rem", fontWeight: 700, color: "var(--text-primary)" }}>
                  Step {Math.max(1, step.sequence - 1)} Completed
                </div>
              </div>
            </div>

            <h3 style={{ fontFamily: "var(--font-serif)", fontSize: "1.25rem", margin: "0 0 0.5rem" }}>
              About This Lesson
            </h3>
            <p style={{ color: "var(--text-secondary)", lineHeight: 1.65, fontSize: "0.95rem", margin: "0 0 1.25rem" }}>
              {step.description || "Follow along with the guided video tutorial, examine the live interactive demonstrations, and practice with the supplementary materials provided below."}
            </p>

            <h4 style={{ fontSize: "0.95rem", fontWeight: 700, margin: "0 0 0.5rem", color: "var(--text-primary)" }}>
              Key Learning Objectives
            </h4>
            <ul style={{ paddingLeft: "1.25rem", color: "var(--text-secondary)", fontSize: "0.9rem", lineHeight: 1.6, margin: 0 }}>
              <li>Understand the internal execution model and hierarchy rules.</li>
              <li>Learn optimal syntax patterns and avoid common anti-patterns.</li>
              <li>Validate your knowledge with the step assessment before proceeding.</li>
            </ul>
          </div>
        )}

        {/* TAB 2: RESOURCES */}
        {activeTab === "resources" && (
          <div>
            <h3 style={{ fontFamily: "var(--font-serif)", fontSize: "1.25rem", margin: "0 0 1rem" }}>
              Supplementary Learning Material
            </h3>

            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              {documents.map((doc: any) => {
                const isDone = lessonProgress[doc.id]?.isCompleted;
                return (
                  <div key={doc.id} className={styles.docDownloadRow}>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                        <span style={{ fontSize: "1.1rem" }}>📄</span>
                        <h4 style={{ margin: 0, fontSize: "1rem", color: "var(--text-primary)" }}>
                          {doc.title}
                        </h4>
                      </div>
                      <span style={{ fontSize: "0.82rem", color: "var(--text-muted)" }}>
                        Reference Material · PDF Document (~5 mins)
                      </span>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <button
                        type="button"
                        className={`${styles.markReadBtn} ${isDone ? styles.markReadBtnDone : ""}`}
                        onClick={() => onCompleteDocument(doc.id)}
                      >
                        {isDone ? "✓ Read" : "Mark Read"}
                      </button>

                      <a
                        href={doc.mediaUrl}
                        target="_blank"
                        rel="noreferrer"
                        className={styles.openPdfBtn}
                        onClick={() => onCompleteDocument(doc.id)}
                      >
                        <span>Open PDF</span>
                        <span>↗</span>
                      </a>
                    </div>
                  </div>
                );
              })}

              {textLessons.map((txt: any) => (
                <div key={txt.id} className={styles.docDownloadRow}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                      <span style={{ fontSize: "1.1rem" }}>📖</span>
                      <h4 style={{ margin: 0, fontSize: "1rem", color: "var(--text-primary)" }}>
                        {txt.title}
                      </h4>
                    </div>
                    <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                      {txt.content ? txt.content.slice(0, 120) + "..." : "Reading guide and reference notes."}
                    </p>
                  </div>

                  <button
                    type="button"
                    className={`${styles.markReadBtn} ${lessonProgress[txt.id]?.isCompleted ? styles.markReadBtnDone : ""}`}
                    onClick={() => onCompleteDocument(txt.id)}
                  >
                    {lessonProgress[txt.id]?.isCompleted ? "✓ Completed" : "Mark Complete"}
                  </button>
                </div>
              ))}

              {/* Starter & Solution Code Resources */}
              <div className={styles.docDownloadRow}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: "1.1rem" }}>💻</span>
                    <h4 style={{ margin: 0, fontSize: "1rem", color: "var(--text-primary)" }}>
                      Starter &amp; Solution Repository
                    </h4>
                  </div>
                  <span style={{ fontSize: "0.82rem", color: "var(--text-muted)" }}>
                    Official GitHub Code Exercises &amp; Playground
                  </span>
                </div>

                <a
                  href="https://github.com"
                  target="_blank"
                  rel="noreferrer"
                  className={styles.openPdfBtn}
                  style={{ background: "#24292e" }}
                >
                  <span>GitHub Repo</span>
                  <span>↗</span>
                </a>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: TRANSCRIPT */}
        {activeTab === "transcript" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
              <h3 style={{ fontFamily: "var(--font-serif)", fontSize: "1.25rem", margin: 0 }}>
                Interactive Lecture Transcript
              </h3>
              <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                Click any timestamp to jump the video directly
              </span>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              {transcriptLines.map((line, idx) => (
                <div
                  key={idx}
                  onClick={() => seekToTimestamp(line.sec)}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: "1rem",
                    padding: "0.6rem 0.85rem",
                    borderRadius: 8,
                    cursor: "pointer",
                    background: "var(--bg-card-muted)",
                    transition: "all 0.15s ease",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-soft)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "var(--bg-card-muted)")}
                >
                  <button
                    type="button"
                    style={{
                      background: "var(--accent-highlight)",
                      border: "none",
                      color: "var(--accent-primary)",
                      fontWeight: 700,
                      fontSize: "0.8rem",
                      padding: "2px 8px",
                      borderRadius: 4,
                      cursor: "pointer",
                    }}
                  >
                    {line.time}
                  </button>
                  <p style={{ margin: 0, fontSize: "0.9rem", color: "var(--text-primary)", lineHeight: 1.5 }}>
                    {line.text}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 4: MY NOTES */}
        {activeTab === "notes" && (
          <div>
            <div className={styles.reflectionPromptBox}>
              <div className={styles.reflectionPromptTitle}>Smart Notebook</div>
              <p className={styles.reflectionPromptText}>
                Capture key takeaways and personal code snippets. Notes automatically persist in your browser.
              </p>
            </div>

            <div className={styles.notesToolbar}>
              <button type="button" className={styles.timestampBtn} onClick={onInsertTimestamp}>
                <span>⏱ Insert Video Timestamp</span>
              </button>

              <span className={styles.notesAutoSaveBadge}>
                {notesSaveStatus === "Saved to browser" ? "✓ Auto-saved" : "Saving..."}
              </span>
            </div>

            <textarea
              className={styles.notesTextarea}
              placeholder="Start capturing your key insights, code snippets, or study reminders here..."
              value={personalNotes}
              onChange={(e) => onNotesChange(e.target.value)}
            />

            <div className={styles.notesFooter}>
              <span>{personalNotes.trim().split(/\s+/).filter(Boolean).length} words</span>
              <button type="button" className={styles.exportNotesBtn} onClick={onExportNotes}>
                Download Notes (.txt)
              </button>
            </div>
          </div>
        )}

        {/* TAB 5: DISCUSSION */}
        {activeTab === "discussion" && (
          <div>
            <h3 style={{ fontFamily: "var(--font-serif)", fontSize: "1.25rem", margin: "0 0 1rem" }}>
              Cohort Q&amp;A Discussion
            </h3>

            {/* Post Question Form */}
            <form onSubmit={handlePostQuestion} style={{ marginBottom: "1.5rem" }}>
              <textarea
                value={newQuestionText}
                onChange={(e) => setNewQuestionText(e.target.value)}
                placeholder="Ask a question or share an insight about this lesson..."
                style={{
                  width: "100%",
                  minHeight: "80px",
                  padding: "0.85rem",
                  borderRadius: 8,
                  border: "1px solid var(--border-light)",
                  background: "var(--bg-card-muted)",
                  fontSize: "0.9rem",
                  boxSizing: "border-box",
                  marginBottom: "0.5rem",
                }}
              />
              <button
                type="submit"
                className={styles.continueActionBtn}
                style={{ padding: "0.5rem 1.25rem", fontSize: "0.85rem" }}
              >
                Post to Discussion
              </button>
            </form>

            {/* Discussion List */}
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              {discussions.map((d) => (
                <div
                  key={d.id}
                  style={{
                    border: "1px solid var(--border-light)",
                    borderRadius: 10,
                    padding: "1rem 1.25rem",
                    background: "var(--bg-card-muted)",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ width: 28, height: 28, borderRadius: 14, background: "var(--accent-highlight)", color: "var(--accent-primary)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.75rem", fontWeight: 700 }}>
                        {d.avatar}
                      </span>
                      <span style={{ fontWeight: 700, fontSize: "0.88rem", color: "var(--text-primary)" }}>
                        {d.author}
                      </span>
                    </div>
                    <span style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>{d.time}</span>
                  </div>

                  <p style={{ margin: "0 0 0.75rem", fontSize: "0.92rem", color: "var(--text-secondary)", lineHeight: 1.5 }}>
                    {d.question}
                  </p>

                  {d.instructorReply && (
                    <div style={{ background: "#ffffff", borderLeft: "3px solid #16a34a", padding: "0.75rem 1rem", borderRadius: "0 8px 8px 0", marginTop: "0.5rem" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                        <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "#16a34a", textTransform: "uppercase" }}>
                          ✓ Instructor Answer
                        </span>
                      </div>
                      <p style={{ margin: 0, fontSize: "0.88rem", color: "var(--text-secondary)", lineHeight: 1.5 }}>
                        {d.instructorReply}
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 6: AI TUTOR (IN-PANEL FALLBACK & MOBILE VIEW) */}
        {activeTab === "aitutor" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            {/* Header with Title and Desktop Pop-out Button */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: "0.75rem",
                paddingBottom: "1rem",
                borderBottom: "1px solid var(--border-light)",
              }}
            >
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: "1.25rem" }}>🤖</span>
                  <h3 style={{ fontFamily: "var(--font-serif)", fontSize: "1.25rem", margin: 0 }}>
                    AI Study Copilot
                  </h3>
                </div>
                <p style={{ margin: "2px 0 0", fontSize: "0.82rem", color: "var(--text-muted)" }}>
                  In-panel tutor for Step {step?.sequence}: {step?.title}
                </p>
              </div>

              <button
                type="button"
                className={styles.playerToolBtn}
                onClick={onTriggerFloatingAITutor}
                style={{
                  background: "var(--accent-highlight)",
                  color: "var(--accent-primary)",
                  border: "1px solid var(--accent-primary)",
                  fontWeight: 700,
                  padding: "0.45rem 0.9rem",
                  fontSize: "0.82rem",
                }}
                title="Pop out into floating side drawer (desktop)"
              >
                <span>↗ Open in Side Drawer</span>
              </button>
            </div>

            {/* Quick Prompt Chips */}
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              {[
                "Summarize Key Points",
                "Explain Simply",
                "Give Code Example",
                "Generate Practice Question",
              ].map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => handleSendAiChatMessage(prompt)}
                  style={{
                    background: "#ffffff",
                    border: "1px solid var(--border-light)",
                    borderRadius: 9999,
                    padding: "4px 12px",
                    fontSize: "0.78rem",
                    fontWeight: 600,
                    color: "var(--accent-primary)",
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                  }}
                >
                  {prompt}
                </button>
              ))}
            </div>

            {/* Chat Messages Box */}
            <div
              style={{
                border: "1px solid var(--border-light)",
                borderRadius: 12,
                background: "var(--bg-card-muted)",
                padding: "1rem",
                minHeight: 220,
                maxHeight: 400,
                overflowY: "auto",
                display: "flex",
                flexDirection: "column",
                gap: "0.85rem",
              }}
            >
              {aiChatMessages.map((m, idx) => (
                <div
                  key={idx}
                  style={{
                    alignSelf: m.role === "user" ? "flex-end" : "flex-start",
                    maxWidth: "85%",
                    background: m.role === "user" ? "var(--accent-primary)" : "#ffffff",
                    color: m.role === "user" ? "#ffffff" : "var(--text-primary)",
                    border: m.role === "user" ? "none" : "1px solid var(--border-light)",
                    padding: "0.75rem 1rem",
                    borderRadius: m.role === "user" ? "14px 14px 2px 14px" : "14px 14px 14px 2px",
                    fontSize: "0.88rem",
                    lineHeight: 1.5,
                    whiteSpace: "pre-wrap",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
                  }}
                >
                  {m.text}
                </div>
              ))}

              {isAiChatTyping && (
                <div
                  style={{
                    alignSelf: "flex-start",
                    background: "#ffffff",
                    color: "var(--text-muted)",
                    padding: "0.45rem 0.8rem",
                    borderRadius: 10,
                    fontSize: "0.8rem",
                    fontStyle: "italic",
                    border: "1px solid var(--border-light)",
                  }}
                >
                  Copilot is thinking...
                </div>
              )}
            </div>

            {/* Chat Input Form */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendAiChatMessage();
              }}
              style={{ display: "flex", gap: "0.5rem" }}
            >
              <input
                type="text"
                value={aiChatInput}
                onChange={(e) => setAiChatInput(e.target.value)}
                placeholder="Ask your AI tutor anything about this step..."
                style={{
                  flex: 1,
                  padding: "0.7rem 0.95rem",
                  borderRadius: 8,
                  border: "1px solid var(--border-light)",
                  background: "#ffffff",
                  fontSize: "0.88rem",
                  outline: "none",
                }}
              />
              <button
                type="submit"
                className={styles.continueActionBtn}
                style={{ padding: "0.7rem 1.4rem", fontSize: "0.88rem" }}
              >
                Send
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
