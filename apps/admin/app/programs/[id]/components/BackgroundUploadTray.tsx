"use client";

import React, { useState } from "react";

export interface BackgroundUploadTask {
  id: string;
  title: string;
  moduleTitle: string;
  moduleId: string;
  progress: number;
  status: "UPLOADING" | "SAVING" | "COMPLETED" | "ERROR";
  statusText: string;
  error?: string;
}

interface BackgroundUploadTrayProps {
  tasks: BackgroundUploadTask[];
  onDismissTask: (taskId: string) => void;
  onClearCompleted: () => void;
}

export default function BackgroundUploadTray({
  tasks,
  onDismissTask,
  onClearCompleted,
}: BackgroundUploadTrayProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  if (tasks.length === 0) return null;

  const activeCount = tasks.filter((t) => t.status === "UPLOADING" || t.status === "SAVING").length;
  const completedCount = tasks.filter((t) => t.status === "COMPLETED").length;

  return (
    <div
      style={{
        position: "fixed",
        bottom: 24,
        right: 24,
        width: 360,
        maxWidth: "calc(100vw - 48px)",
        background: "#ffffff",
        borderRadius: 14,
        boxShadow: "0 10px 30px rgba(0, 0, 0, 0.18), 0 2px 8px rgba(0, 0, 0, 0.08)",
        border: "1px solid #e2e8f0",
        zIndex: 9999,
        overflow: "hidden",
        fontFamily: "var(--font-sans, system-ui, -apple-system, sans-serif)",
        transition: "all 0.25s ease",
      }}
    >
      {/* Header Bar */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "12px 16px",
          background: activeCount > 0 ? "linear-gradient(135deg, #1e293b, #0f172a)" : "#0f172a",
          color: "#ffffff",
          cursor: "pointer",
        }}
        onClick={() => setIsCollapsed(!isCollapsed)}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {activeCount > 0 ? (
            <div
              style={{
                width: 10,
                height: 10,
                borderRadius: "50%",
                background: "#38bdf8",
                boxShadow: "0 0 8px #38bdf8",
                animation: "pulse 1.5s infinite",
              }}
            />
          ) : (
            <span style={{ color: "#4ade80", fontWeight: 700 }}>✓</span>
          )}
          <span style={{ fontWeight: 700, fontSize: "0.9rem" }}>
            {activeCount > 0
              ? `Uploading ${activeCount} video${activeCount > 1 ? "s" : ""} in background...`
              : `All ${completedCount} upload${completedCount > 1 ? "s" : ""} finished`}
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {completedCount > 0 && activeCount === 0 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onClearCompleted();
              }}
              style={{
                background: "transparent",
                border: "none",
                color: "#94a3b8",
                fontSize: "0.75rem",
                cursor: "pointer",
                padding: "2px 6px",
                borderRadius: 4,
              }}
              title="Clear completed"
            >
              Clear
            </button>
          )}
          <button
            type="button"
            style={{
              background: "transparent",
              border: "none",
              color: "#ffffff",
              fontSize: "0.85rem",
              cursor: "pointer",
              padding: 0,
            }}
          >
            {isCollapsed ? "▲" : "▼"}
          </button>
        </div>
      </div>

      {/* Task List (Visible when expanded) */}
      {!isCollapsed && (
        <div style={{ maxHeight: 280, overflowY: "auto", padding: "8px 12px", background: "#f8fafc" }}>
          {tasks.map((task) => {
            const isDone = task.status === "COMPLETED";
            const isError = task.status === "ERROR";

            return (
              <div
                key={task.id}
                style={{
                  background: "#ffffff",
                  borderRadius: 10,
                  padding: "10px 12px",
                  marginBottom: 8,
                  border: isError ? "1px solid #fecaca" : isDone ? "1px solid #bbf7d0" : "1px solid #e2e8f0",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        fontWeight: 600,
                        fontSize: "0.85rem",
                        color: "#0f172a",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                      title={task.title}
                    >
                      {task.title}
                    </div>
                    <div style={{ fontSize: "0.75rem", color: "#64748b" }}>
                      Target: {task.moduleTitle}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => onDismissTask(task.id)}
                    style={{
                      background: "none",
                      border: "none",
                      color: "#94a3b8",
                      fontSize: "0.85rem",
                      cursor: "pointer",
                      padding: "0 2px",
                      lineHeight: 1,
                    }}
                    title="Dismiss"
                  >
                    ×
                  </button>
                </div>

                {/* Progress bar */}
                <div style={{ width: "100%", height: 6, background: "#e2e8f0", borderRadius: 4, overflow: "hidden", marginTop: 8 }}>
                  <div
                    style={{
                      width: `${task.progress}%`,
                      height: "100%",
                      background: isError ? "#ef4444" : isDone ? "#22c55e" : "#0284c7",
                      borderRadius: 4,
                      transition: "width 0.3s ease",
                    }}
                  />
                </div>

                {/* Status footer */}
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: "0.75rem",
                    marginTop: 6,
                    color: isError ? "#b91c1c" : isDone ? "#15803d" : "#475569",
                    fontWeight: 600,
                  }}
                >
                  <span>{task.statusText}</span>
                  {!isDone && !isError && <span>{task.progress}%</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
