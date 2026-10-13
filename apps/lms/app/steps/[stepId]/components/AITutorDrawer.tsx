"use client";

import React, { useState } from "react";
import styles from "../step.module.css";
import { StepIcons } from "./StepIcons";

interface AITutorDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  stepTitle: string;
  stepSequence: number;
}

export default function AITutorDrawer({
  isOpen,
  onClose,
  stepTitle,
  stepSequence,
}: AITutorDrawerProps) {
  const [messages, setMessages] = useState<Array<{ role: "user" | "assistant"; text: string }>>([
    {
      role: "assistant",
      text: `Hello! I'm your WhatBoutMe AI Study Copilot for Step ${stepSequence}: "${stepTitle}". How can I help you master this concept?`,
    },
  ]);
  const [inputText, setInputText] = useState("");
  const [isTyping, setIsTyping] = useState(false);

  if (!isOpen) return null;

  const handleSendMessage = (textToSend?: string) => {
    const text = textToSend || inputText;
    if (!text.trim()) return;

    const userMsg = { role: "user" as const, text };
    setMessages((prev) => [...prev, userMsg]);
    setInputText("");
    setIsTyping(true);

    setTimeout(() => {
      let reply = `In ${stepTitle}, the key insight is understanding how the hierarchy and rules work together. When you apply this pattern in production code, it ensures predictability and maintainability across components.`;
      
      const lower = text.toLowerCase();
      if (lower.includes("summarize") || lower.includes("summary")) {
        reply = `Here is a quick summary for ${stepTitle}:\n1. Understand the direct relationship between parent and child elements.\n2. Avoid high specificity overrides; keep rules focused and DRY.\n3. Test responsive behaviors across viewport breakpoints.`;
      } else if (lower.includes("simply") || lower.includes("simple")) {
        reply = `Think of ${stepTitle} like building blocks! Each component establishes clear hierarchy and responsibilities.`;
      } else if (lower.includes("quiz") || lower.includes("question")) {
        reply = `Quick test question: What is the primary milestone requirement to complete this step?`;
      } else if (lower.includes("code") || lower.includes("example")) {
        reply = `Sample implementation pattern:\n\`\`\`typescript\nconst isReady = Boolean(isCompleted && !isLocked);\n\`\`\``;
      }

      setMessages((prev) => [...prev, { role: "assistant", text: reply }]);
      setIsTyping(false);
    }, 600);
  };

  return (
    <>
      <div className={styles.drawerBackdrop} onClick={onClose} />
      <aside
        className={styles.drawerPanel}
        aria-label="AI Tutor Copilot Drawer"
        style={{ width: 440, maxWidth: "94vw", zIndex: 110 }}
      >
        {/* Drawer Header */}
        <div className={styles.drawerHeader} style={{ background: "var(--bg-soft)" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
              <StepIcons.Bot size={20} />
              <h3 style={{ fontFamily: "var(--font-serif)", fontSize: "1.2rem", margin: 0 }}>
                AI Study Tutor
              </h3>
            </div>
            <p style={{ margin: 0, fontSize: "0.8rem", color: "var(--text-muted)" }}>
              Context: Step {stepSequence} • {stepTitle}
            </p>
          </div>

          <button
            type="button"
            className={styles.drawerCloseBtn}
            onClick={onClose}
            title="Close AI Tutor (Esc)"
          >
            <StepIcons.Close size={16} />
          </button>
        </div>

        {/* Quick Action Prompt Chips */}
        <div style={{ padding: "0.85rem 1.25rem", borderBottom: "1px solid var(--border-light)", background: "var(--bg-card-muted)", display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          {[
            "Summarize Key Points",
            "Explain Simply",
            "Give Code Example",
            "Generate Quiz Question",
          ].map((prompt) => (
            <button
              key={prompt}
              type="button"
              onClick={() => handleSendMessage(prompt)}
              style={{
                padding: "4px 10px",
                fontSize: "0.78rem",
                borderRadius: 6,
                border: "1px solid var(--border-light)",
                background: "#ffffff",
                color: "var(--text-secondary)",
                cursor: "pointer",
                fontWeight: 600,
              }}
            >
              {prompt}
            </button>
          ))}
        </div>

        {/* Messages Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "1.25rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
          {messages.map((m, idx) => (
            <div
              key={idx}
              style={{
                display: "flex",
                gap: 10,
                alignSelf: m.role === "user" ? "flex-end" : "flex-start",
                maxWidth: "88%",
              }}
            >
              {m.role === "assistant" && (
                <div style={{ width: 28, height: 28, borderRadius: "50%", background: "var(--accent-highlight)", color: "var(--accent-primary)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <StepIcons.Bot size={14} />
                </div>
              )}
              <div
                style={{
                  padding: "10px 14px",
                  borderRadius: 12,
                  background: m.role === "user" ? "var(--accent-primary)" : "#ffffff",
                  color: m.role === "user" ? "#ffffff" : "var(--text-primary)",
                  border: m.role === "assistant" ? "1px solid var(--border-light)" : "none",
                  fontSize: "0.88rem",
                  lineHeight: 1.5,
                  whiteSpace: "pre-line",
                }}
              >
                {m.text}
              </div>
            </div>
          ))}
          {isTyping && (
            <div style={{ display: "flex", gap: 10, alignSelf: "flex-start" }}>
              <div style={{ width: 28, height: 28, borderRadius: "50%", background: "var(--accent-highlight)", color: "var(--accent-primary)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <StepIcons.Bot size={14} />
              </div>
              <div style={{ padding: "8px 14px", borderRadius: 12, background: "#ffffff", border: "1px solid var(--border-light)", fontSize: "0.85rem", color: "var(--text-muted)" }}>
                Thinking...
              </div>
            </div>
          )}
        </div>

        {/* Chat Input */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSendMessage();
          }}
          style={{ padding: "1rem 1.25rem", borderTop: "1px solid var(--border-light)", background: "#ffffff", display: "flex", gap: 8 }}
        >
          <input
            type="text"
            placeholder="Ask your AI tutor a question..."
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            style={{
              flex: 1,
              padding: "8px 12px",
              borderRadius: 8,
              border: "1px solid var(--border-light)",
              fontSize: "0.88rem",
              outline: "none",
            }}
          />
          <button
            type="submit"
            disabled={!inputText.trim()}
            className={styles.continueActionBtn}
            style={{ padding: "8px 14px", fontSize: "0.88rem" }}
          >
            <StepIcons.Send size={14} />
          </button>
        </form>
      </aside>
    </>
  );
}
