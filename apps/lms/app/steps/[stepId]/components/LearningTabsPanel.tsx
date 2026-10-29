"use client";

import React, { useState } from "react";
import styles from "../step.module.css";
import { StepIcons } from "./StepIcons";
import { sanitizeExternalUrl } from "../../../lib/auth-redirect";

export type AssistantTabType = "aitutor" | "notes" | "resources" | "transcript";

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
}: LearningTabsPanelProps) {
  const [internalTab, setInternalTab] = useState<AssistantTabType>("aitutor");
  const activeTab = controlledActiveTab || internalTab;

  const setActiveTab = (tab: AssistantTabType) => {
    if (onChangeTab) onChangeTab(tab);
    setInternalTab(tab);
  };

  // Video transcript entries linked to timestamps
  const transcriptLines = [
    { sec: 0, time: "00:00", text: `Welcome to this module on ${step?.title || "this topic"}. In this lesson, we break down core principles and practical examples.` },
    { sec: 45, time: "00:45", text: "Notice how the elements interact within the hierarchy. This foundational structure dictates cascading behavior." },
    { sec: 120, time: "02:00", text: "Let us inspect the live browser environment to examine the exact rendering tree and layout performance." },
    { sec: 240, time: "04:00", text: "A common pitfall is over-specifying selectors. Always aim for clarity and minimal specificity." },
    { sec: 360, time: "06:00", text: "To summarize: combine these rules with best practices for accessible and maintainable architecture." },
  ];

  // AI Chat state
  const [aiChatMessages, setAiChatMessages] = useState<Array<{ role: "assistant" | "user"; text: string }>>([
    {
      role: "assistant",
      text: `Hello! I'm your WhatBoutMe AI Study Copilot for "${step?.title || "this lesson"}". Ask me any question, request code examples, or ask for a concept breakdown.`,
    },
  ]);
  const [aiChatInput, setAiChatInput] = useState("");
  const [isAiChatTyping, setIsAiChatTyping] = useState(false);

  const handleSendAiChatMessage = (promptText?: string) => {
    const text = (promptText || aiChatInput).trim();
    if (!text) return;

    setAiChatMessages((prev) => [...prev, { role: "user", text }]);
    setAiChatInput("");
    setIsAiChatTyping(true);

    setTimeout(() => {
      let reply = `In "${step?.title || "this lesson"}", the primary goal is mastering the core concepts and applying them with clean structure.`;
      const lower = text.toLowerCase();
      if (lower.includes("summarize") || lower.includes("summary") || lower.includes("key point")) {
        reply = `Key Summary for ${step?.title || "Lesson"}:\n1. Master the core hierarchy and flow.\n2. Ensure clean separation of concerns.\n3. Validate comprehension with the end-of-step knowledge check.`;
      } else if (lower.includes("simply") || lower.includes("simple")) {
        reply = `Think of ${step?.title || "this concept"} like building blocks: each module establishes a foundation that unlocks the next capability.`;
      } else if (lower.includes("quiz") || lower.includes("question")) {
        reply = `Practice question: What is the primary requirement to advance past this step? (Hint: Watch the video lecture and review your notes!)`;
      } else if (lower.includes("code") || lower.includes("example")) {
        reply = `Sample implementation pattern:\n\`\`\`typescript\n// Safe progression check\nconst canAdvance = Boolean(isCompleted && !isLocked);\n\`\`\``;
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
      {/* 1. Top Tab Navigation Bar (Restrained outline icons, ZERO emojis) */}
      <nav className={styles.assistantTabBar} aria-label="Study Assistant Tabs">
        <button
          type="button"
          onClick={() => setActiveTab("aitutor")}
          className={`${styles.assistantTabBtn} ${activeTab === "aitutor" ? styles.assistantTabBtnActive : ""}`}
          aria-selected={activeTab === "aitutor"}
        >
          <StepIcons.Bot size={15} />
          <span>AI Tutor</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("notes")}
          className={`${styles.assistantTabBtn} ${activeTab === "notes" ? styles.assistantTabBtnActive : ""}`}
          aria-selected={activeTab === "notes"}
        >
          <StepIcons.FileText size={15} />
          <span>Notes</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("resources")}
          className={`${styles.assistantTabBtn} ${activeTab === "resources" ? styles.assistantTabBtnActive : ""}`}
          aria-selected={activeTab === "resources"}
        >
          <StepIcons.Folder size={15} />
          <span>Resources{allResourcesCount > 0 ? ` (${allResourcesCount})` : ""}</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("transcript")}
          className={`${styles.assistantTabBtn} ${activeTab === "transcript" ? styles.assistantTabBtnActive : ""}`}
          aria-selected={activeTab === "transcript"}
        >
          <StepIcons.MessageSquare size={15} />
          <span>Transcript</span>
        </button>
      </nav>

      {/* 2. Scrollable Body Content */}
      <div className={styles.assistantCardBody}>
        {/* TAB 1: AI TUTOR (AI STUDY COPILOT) */}
        {activeTab === "aitutor" && (
          <div style={{ display: "flex", flexDirection: "column", height: "100%", width: "100%" }}>
            <div className={styles.copilotHeader}>
              <div className={styles.copilotAvatar}>
                <StepIcons.Bot size={18} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <h3 className={styles.copilotTitle}>AI Study Copilot</h3>
                <p className={styles.copilotSubtitle}>
                  Ask questions, request summaries, or clarify difficult points.
                </p>
              </div>
            </div>

            {/* Quick Action Prompt Chips (Outline icons, zero emojis) */}
            <div className={styles.quickPromptRow}>
              {[
                { label: "Summarize Key Points", icon: <StepIcons.FileText size={13} /> },
                { label: "Explain Simply", icon: <StepIcons.BookOpen size={13} /> },
                { label: "Give Code Example", icon: <StepIcons.Gauge size={13} /> },
                { label: "Practice Question", icon: <StepIcons.Brain size={13} /> },
              ].map((chip) => (
                <button
                  key={chip.label}
                  type="button"
                  onClick={() => handleSendAiChatMessage(chip.label)}
                  className={styles.quickPromptChip}
                >
                  {chip.icon}
                  <span>{chip.label}</span>
                </button>
              ))}
            </div>

            {/* Chat Messages Log */}
            <div className={styles.aiChatScrollBox}>
              {aiChatMessages.map((msg, idx) => (
                <div
                  key={idx}
                  className={msg.role === "assistant" ? styles.aiAssistantBubbleRow : styles.aiUserBubbleRow}
                >
                  {msg.role === "assistant" && (
                    <div className={styles.aiMiniAvatar}>
                      <StepIcons.Bot size={13} />
                    </div>
                  )}
                  <div className={msg.role === "assistant" ? styles.aiAssistantBubble : styles.aiUserBubble}>
                    <p style={{ margin: 0, whiteSpace: "pre-line", fontSize: "0.88rem", lineHeight: 1.5 }}>
                      {msg.text}
                    </p>
                  </div>
                </div>
              ))}
              {isAiChatTyping && (
                <div className={styles.aiAssistantBubbleRow}>
                  <div className={styles.aiMiniAvatar}>
                    <StepIcons.Bot size={13} />
                  </div>
                  <div className={styles.aiAssistantBubble}>
                    <span style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>Thinking...</span>
                  </div>
                </div>
              )}
            </div>

            {/* Chat Input Bar */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendAiChatMessage();
              }}
              className={styles.aiInputBar}
            >
              <input
                type="text"
                placeholder="Ask your AI tutor a question..."
                value={aiChatInput}
                onChange={(e) => setAiChatInput(e.target.value)}
                className={styles.aiTextInput}
              />
              <button
                type="submit"
                disabled={!aiChatInput.trim()}
                className={styles.aiSendBtn}
                title="Send Question"
                aria-label="Send Question"
              >
                <StepIcons.Send size={15} />
              </button>
            </form>
          </div>
        )}

        {/* TAB 2: PERSONAL NOTES */}
        {activeTab === "notes" && (
          <div style={{ display: "flex", flexDirection: "column", height: "100%", width: "100%", gap: "0.85rem" }}>
            <div className={styles.notesPanelHeader}>
              <button
                type="button"
                className={styles.timestampBtn}
                onClick={onInsertTimestamp}
                title="Insert current video timestamp"
              >
                <StepIcons.Clock size={14} />
                <span>Timestamp</span>
              </button>

              <span className={styles.notesAutoSaveBadge}>
                <StepIcons.Check size={12} />
                <span>{notesSaveStatus}</span>
              </span>
            </div>

            <textarea
              className={styles.notesTextarea}
              placeholder="Capture personal takeaways, key quotes, or questions to ask your mentor..."
              value={personalNotes}
              onChange={(e) => onNotesChange(e.target.value)}
              style={{ flex: 1, minHeight: 220 }}
            />

            <div className={styles.notesFooter}>
              <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                {personalNotes.trim().split(/\s+/).filter(Boolean).length} words
              </span>
              <button type="button" className={styles.exportNotesBtn} onClick={onExportNotes}>
                <StepIcons.Download size={13} />
                <span>Download Notes</span>
              </button>
            </div>
          </div>
        )}

        {/* TAB 3: SUPPLEMENTARY RESOURCES */}
        {activeTab === "resources" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem", width: "100%" }}>
            <h4 style={{ margin: "0 0 0.25rem 0", fontSize: "0.95rem", color: "var(--text-primary)" }}>
              Lesson Downloads &amp; Reference Material
            </h4>

            {documents.length === 0 && textLessons.length === 0 && (
              <p style={{ color: "var(--text-secondary)", fontSize: "0.88rem" }}>
                No external downloads attached to this step.
              </p>
            )}

            {documents.map((doc) => (
              <div key={doc.id} className={styles.resourceDownloadItem}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                  <StepIcons.FilePdf size={20} style={{ color: "var(--accent-primary, #c97a1e)", flexShrink: 0 }} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: "0.88rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {doc.title}
                    </div>
                    <span style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>PDF Document</span>
                  </div>
                </div>

                <a
                  href={sanitizeExternalUrl(doc.mediaUrl) || "#"}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.openPdfBtn}
                  onClick={() => onCompleteDocument(doc.id)}
                >
                  <StepIcons.Download size={13} />
                  <span>Download</span>
                </a>
              </div>
            ))}

            {textLessons.map((txt) => (
              <div key={txt.id} className={styles.resourceDownloadItem}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                  <StepIcons.FileText size={20} style={{ color: "var(--accent-primary, #c97a1e)", flexShrink: 0 }} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: "0.88rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {txt.title}
                    </div>
                    <span style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>Reading Guide</span>
                  </div>
                </div>

                <button
                  type="button"
                  className={styles.openPdfBtn}
                  onClick={() => onCompleteDocument(txt.id)}
                >
                  <span>{lessonProgress[txt.id]?.isCompleted ? "Completed" : "Mark Read"}</span>
                </button>
              </div>
            ))}
          </div>
        )}

        {/* TAB 4: INTERACTIVE TRANSCRIPT */}
        {activeTab === "transcript" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", width: "100%" }}>
            <p style={{ margin: "0 0 0.5rem 0", fontSize: "0.82rem", color: "var(--text-muted)" }}>
              Click any timestamp to navigate video playback:
            </p>

            {transcriptLines.map((line, idx) => (
              <div
                key={idx}
                className={styles.transcriptRow}
                onClick={() => seekToTimestamp(line.sec)}
                role="button"
                tabIndex={0}
              >
                <span className={styles.transcriptTimestamp}>{line.time}</span>
                <span className={styles.transcriptText}>{line.text}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
