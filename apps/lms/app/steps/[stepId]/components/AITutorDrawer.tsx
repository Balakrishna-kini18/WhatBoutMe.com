"use client";

import React, { useState } from "react";
import styles from "../step.module.css";

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

    // Intelligent simulated pedagogical response based on lesson context
    setTimeout(() => {
      let reply = `In ${stepTitle}, the key insight is understanding how the hierarchy and rules work together. When you apply this pattern in production code, it ensures predictability and maintainability across components.`;
      
      const lower = text.toLowerCase();
      if (lower.includes("summarize") || lower.includes("summary")) {
        reply = `Here is a quick summary for ${stepTitle}:\n1. Understand the direct relationship between parent and child elements.\n2. Avoid high specificity overrides; keep rules focused and DRY.\n3. Test responsive behaviors across viewport breakpoints.`;
      } else if (lower.includes("simply") || lower.includes("simple")) {
        reply = `Think of ${stepTitle} like a family tree! A direct child combinator only affects immediate children (son/daughter), ignoring grandchildren and deeper descendants. That keeps your styling razor-sharp!`;
      } else if (lower.includes("quiz") || lower.includes("question")) {
        reply = `Quick test question: What happens when an element is nested inside a container two levels deep? Does a direct child combinator apply? (Hint: Think about level-1 hierarchy!)`;
      } else if (lower.includes("code") || lower.includes("example")) {
        reply = `Here is a clean pattern:\n\`\`\`css\n.card > .button {\n  background: var(--accent-primary);\n}\n\`\`\`\nThis only styles buttons immediately inside .card, leaving nested sub-buttons untouched.`;
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
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
              <span style={{ fontSize: "1.2rem" }}>🤖</span>
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
            ✕
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
                background: "#ffffff",
                border: "1px solid var(--border-light)",
                borderRadius: 9999,
                padding: "4px 10px",
                fontSize: "0.78rem",
                fontWeight: 600,
                color: "var(--accent-primary)",
                cursor: "pointer",
              }}
            >
              {prompt}
            </button>
          ))}
        </div>

        {/* Chat History Messages */}
        <div style={{ flex: 1, overflowY: "auto", padding: "1.25rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
          {messages.map((m, idx) => (
            <div
              key={idx}
              style={{
                alignSelf: m.role === "user" ? "flex-end" : "flex-start",
                maxWidth: "85%",
                background: m.role === "user" ? "var(--accent-primary)" : "var(--bg-soft)",
                color: m.role === "user" ? "#ffffff" : "var(--text-primary)",
                padding: "0.75rem 1rem",
                borderRadius: m.role === "user" ? "14px 14px 2px 14px" : "14px 14px 14px 2px",
                fontSize: "0.88rem",
                lineHeight: 1.5,
                whiteSpace: "pre-wrap",
                boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
              }}
            >
              {m.text}
            </div>
          ))}

          {isTyping && (
            <div
              style={{
                alignSelf: "flex-start",
                background: "var(--bg-soft)",
                color: "var(--text-muted)",
                padding: "0.5rem 0.85rem",
                borderRadius: 12,
                fontSize: "0.8rem",
                fontStyle: "italic",
              }}
            >
              Copilot is thinking...
            </div>
          )}
        </div>

        {/* Chat Input Bar */}
        <div style={{ padding: "1rem 1.25rem", borderTop: "1px solid var(--border-light)", background: "#ffffff" }}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            style={{ display: "flex", gap: "0.5rem" }}
          >
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Ask anything about this lesson..."
              style={{
                flex: 1,
                padding: "0.65rem 0.85rem",
                borderRadius: 8,
                border: "1px solid var(--border-light)",
                outline: "none",
                fontSize: "0.88rem",
                background: "var(--bg-card-muted)",
              }}
            />
            <button
              type="submit"
              className={styles.continueActionBtn}
              style={{ padding: "0.65rem 1.15rem", fontSize: "0.88rem" }}
            >
              Send
            </button>
          </form>
        </div>
      </aside>
    </>
  );
}
