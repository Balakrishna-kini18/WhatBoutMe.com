"use client";

import React, { useState } from "react";
import styles from "../step.module.css";

export type AssistantTabType = "aitutor" | "notes" | "resources" | "transcript" | "discussion";

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
  activeTab?: AssistantTabType;
  onChangeTab?: (tab: AssistantTabType) => void;
  onTriggerFloatingAITutor?: () => void;
}

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
  activeTab: controlledActiveTab,
  onChangeTab,
  onTriggerFloatingAITutor,
}: LearningTabsPanelProps) {
  const [internalTab, setInternalTab] = useState<AssistantTabType>("aitutor");
  const activeTab = controlledActiveTab || internalTab;

  const setActiveTab = (tab: AssistantTabType) => {
    if (onChangeTab) onChangeTab(tab);
    setInternalTab(tab);
  };

  // Transcript items linked to video seconds
  const transcriptLines = [
    { sec: 0, time: "00:00", text: `Welcome to this lesson on ${step?.title || "this topic"}. In this session, we will break down core principles and practical examples.` },
    { sec: 45, time: "00:45", text: "Notice how the elements interact within the hierarchy. This foundational structure dictates cascading behavior." },
    { sec: 120, time: "02:00", text: "Let us inspect the live browser environment to see the exact rendering tree and layout performance." },
    { sec: 240, time: "04:00", text: "A common pitfall is over-specifying selectors. Always aim for clarity and minimal specificity." },
    { sec: 360, time: "06:00", text: "To summarize: combine these rules with best practices for accessible and maintainable architecture." },
  ];

  // Discussion threads
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

  // AI Chat State matching reference image
  const [aiChatMessages, setAiChatMessages] = useState<Array<{ role: "user" | "assistant"; text: string }>>([
    {
      role: "assistant",
      text: `Hello! I'm your WhatBoutMe AI Study Copilot for "${step?.title || "Quick Start"}". Ask me any question, request code examples, or ask for a concept breakdown.`,
    },
    {
      role: "user",
      text: "hi",
    },
    {
      role: "assistant",
      text: "In this lesson, we'll learn the key fundamentals to get started. The main focus is understanding the core concepts and how they work together.",
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
      let reply = `In "${step?.title || "this lesson"}", the primary goal is mastering the step fundamentals and applying them cleanly.`;
      const lower = text.toLowerCase();
      if (lower.includes("summarize") || lower.includes("summary") || lower.includes("key point")) {
        reply = `Key Summary for ${step?.title || "Lesson"}:\n1. Master the core hierarchy and flow.\n2. Ensure clean separation of concerns.\n3. Validate comprehension with the end-of-step knowledge check.`;
      } else if (lower.includes("simply") || lower.includes("simple")) {
        reply = `Think of ${step?.title || "this concept"} like building blocks: each module builds a solid foundation that unlocks the next skill.`;
      } else if (lower.includes("quiz") || lower.includes("question")) {
        reply = `Practice question: What is the main requirement to complete this step and earn your completion milestone? (Hint: Watch the video and review the notes!)`;
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
    <div className={styles.studyAssistantCard}>
      {/* 1. Top Tab Navigation Bar matching Reference */}
      <nav className={styles.assistantTabBar} aria-label="Study Assistant Tabs">
        {[
          { id: "aitutor", label: "AI Tutor", icon: "🤖" },
          { id: "notes", label: "Notes", icon: "📝" },
          { id: "resources", label: `Resources${allResourcesCount > 0 ? ` (${allResourcesCount})` : ""}`, icon: "📄" },
          { id: "transcript", label: "Transcript", icon: "💬" },
          { id: "discussion", label: `Discussion${discussions.length > 0 ? ` (${discussions.length})` : ""}`, icon: "👥" },
        ].map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id as AssistantTabType)}
              className={`${styles.assistantTabBtn} ${isActive ? styles.assistantTabBtnActive : ""}`}
              aria-selected={isActive}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          );
        })}
      </nav>

      {/* 2. Scrollable Body Content */}
      <div className={styles.assistantCardBody}>
        {/* TAB 1: AI TUTOR (AI STUDY COPILOT) matching Reference */}
        {activeTab === "aitutor" && (
          <div style={{ display: "flex", flexDirection: "column", height: "100%", width: "100%" }}>
            {/* Header: AI Study Copilot */}
            <div className={styles.copilotHeader}>
              <div className={styles.copilotAvatar}>🤖</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <h3 className={styles.copilotTitle}>AI Study Copilot</h3>
                <p className={styles.copilotSubtitle}>
                  Ask questions, get code examples, or request explanations for this lesson.
                </p>
              </div>
            </div>

            {/* Quick Action Prompt Chips matching Reference */}
            <div className={styles.quickPromptRow}>
              {[
                { label: "Summarize Key Points", icon: "⚡" },
                { label: "Explain Simply", icon: "💡" },
                { label: "Give Code Example", icon: "📝" },
                { label: "Generate Practice Question", icon: "❓" },
              ].map((chip) => (
                <button
                  key={chip.label}
                  type="button"
                  onClick={() => handleSendAiChatMessage(chip.label)}
                  className={styles.quickPromptChip}
                >
                  <span>{chip.icon}</span>
                  <span>{chip.label}</span>
                </button>
              ))}
            </div>

            {/* Chat Messages Dialogue Area matching Reference */}
            <div className={styles.chatMessagesScroll}>
              {aiChatMessages.map((msg, idx) => {
                const isAssistant = msg.role === "assistant";
                return isAssistant ? (
                  <div key={idx} className={styles.chatMsgAssistant}>
                    <div className={styles.chatAvatar}>🤖</div>
                    <div className={styles.chatBubbleAssistant}>{msg.text}</div>
                  </div>
                ) : (
                  <div key={idx} className={styles.chatMsgUser}>
                    <div className={styles.chatAvatar}>👤</div>
                    <div className={styles.chatBubbleUser}>{msg.text}</div>
                  </div>
                );
              })}

              {isAiChatTyping && (
                <div className={styles.chatMsgAssistant}>
                  <div className={styles.chatAvatar}>🤖</div>
                  <div className={styles.chatBubbleAssistant} style={{ fontStyle: "italic", color: "var(--text-muted)" }}>
                    Copilot is formulating an answer...
                  </div>
                </div>
              )}
            </div>

            {/* Chat Input Bar matching Reference */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendAiChatMessage();
              }}
              className={styles.chatInputBar}
            >
              <input
                type="text"
                value={aiChatInput}
                onChange={(e) => setAiChatInput(e.target.value)}
                placeholder="Ask anything about this lesson..."
                className={styles.chatInputField}
                aria-label="Ask AI Tutor"
              />
              <button
                type="submit"
                disabled={!aiChatInput.trim()}
                className={styles.chatSendBtn}
                title="Send message"
                aria-label="Send message"
              >
                ➤
              </button>
            </form>
          </div>
        )}

        {/* TAB 2: NOTES matching Reference */}
        {activeTab === "notes" && (
          <div style={{ padding: "1.25rem", display: "flex", flexDirection: "column", height: "100%", boxSizing: "border-box" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: "1.1rem" }}>📝</span>
                <span style={{ fontWeight: 700, fontSize: "0.95rem" }}>Personal Study Notes</span>
              </div>
              <span className={styles.notesAutoSaveBadge}>{notesSaveStatus}</span>
            </div>

            <div className={styles.notesToolbar}>
              <button type="button" className={styles.timestampBtn} onClick={onInsertTimestamp} title="Capture current playback timestamp">
                <span>⏱ Timestamp</span>
              </button>
              <button type="button" className={styles.exportNotesBtn} onClick={onExportNotes}>
                ⬇ Export Notes (.txt)
              </button>
            </div>

            <textarea
              value={personalNotes}
              onChange={(e) => onNotesChange(e.target.value)}
              placeholder="Capture key insights, code snippets, or takeaways for this lesson..."
              className={styles.notesTextarea}
              style={{ flex: 1, minHeight: 220 }}
            />
          </div>
        )}

        {/* TAB 3: RESOURCES */}
        {activeTab === "resources" && (
          <div style={{ padding: "1.25rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
              <span style={{ fontSize: "1.1rem" }}>📄</span>
              <span style={{ fontWeight: 700, fontSize: "0.95rem" }}>Supplementary Documents</span>
            </div>

            {documents.length === 0 && textLessons.length === 0 ? (
              <p style={{ color: "var(--text-muted)", fontSize: "0.88rem", margin: 0 }}>
                No supplementary files uploaded for this module.
              </p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                {documents.map((doc: any) => {
                  const isDone = lessonProgress[doc.id]?.isCompleted;
                  return (
                    <div
                      key={doc.id}
                      style={{
                        padding: "0.85rem 1rem",
                        background: "var(--bg-card-muted)",
                        border: "1px solid var(--border-light)",
                        borderRadius: 10,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 8,
                      }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: "0.88rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {doc.title || "Document Guide"}
                        </div>
                        <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>PDF Reference</div>
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                        <button
                          type="button"
                          onClick={() => onCompleteDocument(doc.id)}
                          className={`${styles.markReadBtn} ${isDone ? styles.markReadBtnDone : ""}`}
                          style={{ padding: "4px 8px", fontSize: "0.75rem" }}
                        >
                          {isDone ? "✓ Done" : "Mark Read"}
                        </button>
                        {doc.mediaUrl && (
                          <a
                            href={doc.mediaUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={styles.openPdfBtn}
                            style={{ padding: "4px 8px", fontSize: "0.75rem" }}
                          >
                            ⬇ View
                          </a>
                        )}
                      </div>
                    </div>
                  );
                })}

                {textLessons.map((txt: any) => (
                  <div
                    key={txt.id}
                    style={{
                      padding: "0.85rem 1rem",
                      background: "var(--bg-card-muted)",
                      border: "1px solid var(--border-light)",
                      borderRadius: 10,
                    }}
                  >
                    <div style={{ fontWeight: 700, fontSize: "0.88rem", marginBottom: 4 }}>
                      {txt.title || "Reading Article"}
                    </div>
                    <p style={{ fontSize: "0.82rem", color: "var(--text-secondary)", margin: 0, lineHeight: 1.4 }}>
                      {txt.content || "Read through the conceptual guide provided for this step."}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 4: TRANSCRIPT */}
        {activeTab === "transcript" && (
          <div style={{ padding: "1.25rem", display: "flex", flexDirection: "column", gap: "0.85rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
              <span style={{ fontSize: "1.1rem" }}>💬</span>
              <span style={{ fontWeight: 700, fontSize: "0.95rem" }}>Interactive Video Transcript</span>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
              {transcriptLines.map((line, idx) => (
                <div
                  key={idx}
                  onClick={() => seekToTimestamp(line.sec)}
                  style={{
                    display: "flex",
                    gap: "0.75rem",
                    padding: "0.6rem 0.8rem",
                    borderRadius: 8,
                    background: "var(--bg-card-muted)",
                    border: "1px solid var(--border-light)",
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                  }}
                >
                  <span
                    style={{
                      fontFamily: "monospace",
                      fontWeight: 700,
                      color: "var(--accent-primary)",
                      fontSize: "0.8rem",
                      background: "var(--accent-highlight)",
                      padding: "2px 6px",
                      borderRadius: 4,
                      height: "fit-content",
                      flexShrink: 0,
                    }}
                  >
                    {line.time}
                  </span>
                  <span style={{ fontSize: "0.84rem", color: "var(--text-secondary)", lineHeight: 1.45 }}>
                    {line.text}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 5: DISCUSSION */}
        {activeTab === "discussion" && (
          <div style={{ padding: "1.25rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: "1.1rem" }}>👥</span>
              <span style={{ fontWeight: 700, fontSize: "0.95rem" }}>Discussion Forum</span>
            </div>

            <form onSubmit={handlePostQuestion} style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              <textarea
                value={newQuestionText}
                onChange={(e) => setNewQuestionText(e.target.value)}
                placeholder="Ask a question about this lesson..."
                style={{
                  width: "100%",
                  minHeight: 70,
                  padding: "0.65rem 0.85rem",
                  borderRadius: 8,
                  border: "1px solid var(--border-light)",
                  background: "var(--bg-card-muted)",
                  fontSize: "0.85rem",
                  boxSizing: "border-box",
                }}
              />
              <button
                type="submit"
                disabled={!newQuestionText.trim()}
                className={styles.continueActionBtn}
                style={{ alignSelf: "flex-end", padding: "0.45rem 1rem", fontSize: "0.82rem" }}
              >
                Post
              </button>
            </form>

            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              {discussions.map((d) => (
                <div
                  key={d.id}
                  style={{
                    padding: "0.85rem",
                    border: "1px solid var(--border-light)",
                    borderRadius: 10,
                    background: "var(--bg-card-muted)",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <span style={{ fontWeight: 700, fontSize: "0.84rem" }}>{d.author}</span>
                    <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{d.time}</span>
                  </div>
                  <p style={{ margin: "0 0 6px", fontSize: "0.84rem", color: "var(--text-secondary)", lineHeight: 1.4 }}>
                    {d.question}
                  </p>
                  {d.instructorReply && (
                    <div style={{ background: "#ffffff", borderLeft: "3px solid #16a34a", padding: "6px 10px", borderRadius: "0 6px 6px 0", fontSize: "0.8rem", color: "#166534" }}>
                      <strong>Instructor: </strong>{d.instructorReply}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
