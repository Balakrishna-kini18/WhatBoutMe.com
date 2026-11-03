"use client";

import React, { useEffect } from "react";
import { resolveMediaUrl } from "../lib/api";
import Certificate from "../certificates/Certificate";

export interface MediaPreviewConfig {
  isOpen: boolean;
  type: "VIDEO" | "PDF" | "CERTIFICATE" | "IMAGE" | "QUIZ";
  title: string;
  src?: string;
  quizData?: {
    title?: string;
    description?: string;
    passingScore?: number;
    quizPlacement?: string;
    questions?: Array<{
      id?: string;
      question?: string;
      title?: string;
      prompt?: string;
      type?: string;
      options?: any[];
      correctAnswer?: any;
      points?: number;
    }>;
  };
  certificateData?: {
    programTitle: string;
    studentName?: string;
    completionDate?: string;
    certificateNumber?: string;
    templateType?: string;
  };
}

interface MediaPreviewModalProps {
  config: MediaPreviewConfig | null;
  onClose: () => void;
}

export default function MediaPreviewModal({ config, onClose }: MediaPreviewModalProps) {
  const [isFullscreen, setIsFullscreen] = React.useState(false);
  useEffect(() => {
    if (!config?.isOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [config?.isOpen, onClose]);

  if (!config || !config.isOpen) return null;

  const { type, title, src, quizData, certificateData } = config;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(20, 17, 15, 0.72)",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 10000,
        padding: isFullscreen ? 0 : "1.25rem",
      }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Preview: ${title}`}
    >
      <div
        style={{
          background: "#ffffff",
          borderRadius: isFullscreen ? 0 : 16,
          boxShadow: isFullscreen ? "none" : "0 25px 60px -15px rgba(20, 17, 15, 0.35)",
          width: isFullscreen ? "100vw" : (type === "CERTIFICATE" ? "820px" : "900px"),
          maxWidth: "100%",
          height: isFullscreen ? "100vh" : undefined,
          maxHeight: isFullscreen ? "100vh" : "90vh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          border: isFullscreen ? "none" : "1px solid #ebd9c4",
          animation: "modalFadeIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: "1rem 1.35rem",
            borderBottom: "1px solid #ece4d7",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "#fdfbf7",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.65rem" }}>
            <span
              style={{
                fontSize: "0.72rem",
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                padding: "0.2rem 0.55rem",
                borderRadius: 9999,
                background:
                  type === "VIDEO"
                    ? "#eff6ff"
                    : type === "PDF"
                    ? "#fef2f2"
                    : type === "CERTIFICATE"
                    ? "#fffbeb"
                    : "#faf5ff",
                color:
                  type === "VIDEO"
                    ? "#1d4ed8"
                    : type === "PDF"
                    ? "#b91c1c"
                    : type === "CERTIFICATE"
                    ? "#b45309"
                    : "#7e22ce",
                border: "1px solid currentColor",
              }}
            >
              {type} PREVIEW
            </span>
            <h3
              style={{
                fontSize: "1.05rem",
                fontWeight: 700,
                color: "#14110f",
                margin: 0,
                letterSpacing: "-0.01em",
              }}
            >
              {title}
            </h3>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <button
              type="button"
              onClick={() => setIsFullscreen(!isFullscreen)}
              style={{
                background: "transparent",
                border: "none",
                color: "#78716a",
                cursor: "pointer",
                padding: "6px",
                borderRadius: "6px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transition: "all 0.15s ease",
              }}
              title={isFullscreen ? "Exit Fullscreen" : "Fullscreen Preview"}
              aria-label={isFullscreen ? "Exit Fullscreen" : "Fullscreen Preview"}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "#f0ece3";
                e.currentTarget.style.color = "#14110f";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
                e.currentTarget.style.color = "#78716a";
              }}
            >
              {isFullscreen ? (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3" />
                </svg>
              ) : (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
                </svg>
              )}
            </button>

            <button
              type="button"
              onClick={onClose}
              style={{
                background: "transparent",
                border: "none",
                color: "#78716a",
                cursor: "pointer",
                fontSize: "1.35rem",
                lineHeight: 1,
                width: 32,
                height: 32,
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transition: "all 0.15s ease",
              }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "#f0ece3";
              e.currentTarget.style.color = "#14110f";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
              e.currentTarget.style.color = "#78716a";
            }}
            aria-label="Close Preview"
          >
            ×
          </button>
          </div>
        </div>

        {/* Modal Body Content */}
        <div
          style={{
            flex: "1 1 auto",
            overflow: "auto",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: type === "CERTIFICATE" ? "1.5rem" : "0.5rem",
            background: type === "VIDEO" ? "#0a0908" : type === "CERTIFICATE" ? "#fbf8f3" : "#f7f4ee",
            minHeight: 380,
          }}
        >
          {type === "VIDEO" && src && (
            <div style={{ width: "100%", height: "100%", maxHeight: "65vh", display: "flex", justifyContent: "center" }}>
              <video
                key={resolveMediaUrl(src)}
                src={resolveMediaUrl(src)}
                controls
                autoPlay
                playsInline
                style={{
                  width: "100%",
                  maxHeight: "65vh",
                  objectFit: "contain",
                  borderRadius: 8,
                }}
              />
            </div>
          )}

          {type === "PDF" && src && (
            <div style={{ width: "100%", height: isFullscreen ? "calc(100vh - 130px)" : "65vh" }}>
              <iframe
                src={`${resolveMediaUrl(src)}#toolbar=1`}
                style={{ width: "100%", height: "100%", border: "none", borderRadius: 8 }}
                title={`PDF: ${title}`}
              />
            </div>
          )}

          {type === "QUIZ" && (
            <div style={{ width: "100%", maxHeight: isFullscreen ? "calc(100vh - 130px)" : "65vh", height: isFullscreen ? "calc(100vh - 130px)" : undefined, overflowY: "auto", padding: "1rem" }}>
              <div
                style={{
                  background: "#ffffff",
                  borderRadius: 12,
                  border: "1px solid #e7decb",
                  padding: "1.25rem",
                  marginBottom: "1rem",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem" }}>
                  <div>
                    <h4 style={{ margin: "0 0 0.25rem", fontSize: "1.1rem", fontWeight: 700, color: "#14110f" }}>
                      {quizData?.title || title}
                    </h4>
                    {quizData?.description && (
                      <p style={{ margin: 0, fontSize: "0.85rem", color: "#78716a" }}>{quizData.description}</p>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                    {quizData?.quizPlacement && (
                      <span
                        style={{
                          fontSize: "0.75rem",
                          fontWeight: 700,
                          padding: "0.2rem 0.6rem",
                          borderRadius: 9999,
                          background: "#f3e8ff",
                          color: "#7e22ce",
                        }}
                      >
                        {quizData.quizPlacement === "BEFORE_VIDEO" ? "Pre-Assessment (Before Video)" : "Comprehension (After Video)"}
                      </span>
                    )}
                    <span
                      style={{
                        fontSize: "0.75rem",
                        fontWeight: 700,
                        padding: "0.2rem 0.6rem",
                        borderRadius: 9999,
                        background: "#fef3c7",
                        color: "#92400e",
                      }}
                    >
                      {quizData?.questions?.length || 0} Questions
                    </span>
                  </div>
                </div>
              </div>

              {/* Questions List */}
              {(!quizData?.questions || quizData.questions.length === 0) ? (
                <div
                  style={{
                    background: "#ffffff",
                    borderRadius: 12,
                    border: "1px dashed #ded6cb",
                    padding: "2rem",
                    textAlign: "center",
                    color: "#78716a",
                  }}
                >
                  No questions found in this quiz.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                  {quizData.questions.map((q: any, idx: number) => {
                    const questionText = q.text || q.question || q.title || q.prompt || `Question ${idx + 1}`;
                    const options = Array.isArray(q.options) ? q.options : [];
                    const isTextBox = q.type === "TEXT_BOX" || q.type === "SHORT_ANSWER";

                    return (
                      <div
                        key={q.id || idx}
                        style={{
                          background: "#ffffff",
                          borderRadius: 10,
                          border: "1px solid #ece4d7",
                          padding: "1rem 1.25rem",
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "0.75rem", marginBottom: "0.5rem" }}>
                          <div style={{ display: "flex", gap: "0.5rem", flex: 1 }}>
                            <span style={{ fontWeight: 700, color: "#d97706", fontSize: "0.9rem" }}>{idx + 1}.</span>
                            <div style={{ flex: 1 }}>
                              <span style={{ fontWeight: 600, color: "#14110f", fontSize: "0.92rem", display: "block" }}>{questionText}</span>
                              {q.imageUrl && (
                                <div style={{ marginTop: "0.5rem" }}>
                                  <img
                                    src={q.imageUrl}
                                    alt="Question prompt"
                                    style={{ maxHeight: 180, maxWidth: "100%", borderRadius: 6, objectFit: "contain", border: "1px solid #ece4d7" }}
                                  />
                                </div>
                              )}
                            </div>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                            {isTextBox && (
                              <span style={{ fontSize: "0.7rem", fontWeight: 700, padding: "2px 6px", borderRadius: 4, background: "#fef3c7", color: "#92400e" }}>
                                {q.gradingMode === "MANUAL_REVIEW" ? "Manual Review" : "Self-Reflection"}
                              </span>
                            )}
                            {q.points !== undefined && (
                              <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "#78716a", whiteSpace: "nowrap" }}>
                                {q.points} {q.points === 1 ? "point" : "points"}
                              </span>
                            )}
                          </div>
                        </div>

                        {isTextBox ? (
                          <div style={{ marginLeft: "1.5rem", marginTop: "0.5rem" }}>
                            <div
                              style={{
                                padding: "0.6rem 0.85rem",
                                borderRadius: 6,
                                background: "#fafaf9",
                                border: "1px dashed #d6d3d1",
                                color: "#78716a",
                                fontSize: "0.82rem",
                                fontStyle: "italic",
                              }}
                            >
                              Learner text reflection area (Min {q.minCharacters || 10} characters)...
                            </div>
                          </div>
                        ) : options.length > 0 ? (
                          <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "0.45rem", marginLeft: "1.5rem", marginTop: "0.5rem" }}>
                            {options.map((opt: any, optIdx: number) => {
                              const text = typeof opt === "string" ? opt : opt.text || String(opt);
                              const isCorrect = typeof opt === "object" && opt.isCorrect !== undefined
                                ? opt.isCorrect
                                : q.correctAnswer === text || q.correctAnswer === String(optIdx);

                              return (
                                <div
                                  key={optIdx}
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "0.5rem",
                                    padding: "0.45rem 0.75rem",
                                    borderRadius: 6,
                                    fontSize: "0.85rem",
                                    background: isCorrect ? "#ecfdf5" : "#fdfbf7",
                                    border: isCorrect ? "1px solid #a7f3d0" : "1px solid #f2ede4",
                                    color: isCorrect ? "#065f46" : "#44403c",
                                    fontWeight: isCorrect ? 600 : 400,
                                  }}
                                >
                                  <span style={{ color: isCorrect ? "#059669" : "#a8a29e", fontSize: "0.8rem", fontWeight: 700 }}>
                                    {String.fromCharCode(65 + optIdx)}.
                                  </span>
                                  {opt.imageUrl && (
                                    <img
                                      src={opt.imageUrl}
                                      alt="Option"
                                      style={{ width: 32, height: 32, objectFit: "cover", borderRadius: 4, border: "1px solid #e7decb" }}
                                    />
                                  )}
                                  <span>{text}</span>
                                  {isCorrect && (
                                    <span
                                      style={{
                                        marginLeft: "auto",
                                        fontSize: "0.7rem",
                                        fontWeight: 700,
                                        textTransform: "uppercase",
                                        color: "#059669",
                                        letterSpacing: "0.04em",
                                      }}
                                    >
                                      Correct
                                    </span>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {type === "IMAGE" && src && (
            <div style={{ textAlign: "center", padding: "1rem" }}>
              <img
                src={src}
                alt={title}
                style={{
                  maxWidth: "100%",
                  maxHeight: "65vh",
                  borderRadius: 12,
                  boxShadow: "0 10px 25px rgba(0,0,0,0.1)",
                  objectFit: "contain",
                }}
              />
            </div>
          )}

          {type === "CERTIFICATE" && (
            <div style={{ width: "100%", maxWidth: isFullscreen ? 1100 : 860, margin: "0 auto", padding: isFullscreen ? "1.5rem" : "0.75rem" }}>
              <Certificate
                recipientName={certificateData?.studentName || "Alexandra Vance"}
                courseName={certificateData?.programTitle || title}
                issueDate={certificateData?.completionDate || new Date().toISOString()}
                certificateNumber={certificateData?.certificateNumber || "WBM-CERT-001"}
                certificateType={
                  (certificateData as any)?.templateType === "PARTICIPATION"
                    ? "PARTICIPATION"
                    : "CPD_25_HOURS"
                }
                showLinkedInShare={false}
              />
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div
          style={{
            padding: "0.75rem 1.35rem",
            background: "#fdfbf7",
            borderTop: "1px solid #ece4d7",
            display: "flex",
            justifyContent: "flex-end",
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "#ffffff",
              border: "1px solid #d8cdbe",
              color: "#14110f",
              padding: "0.45rem 1rem",
              borderRadius: 8,
              fontSize: "0.82rem",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Close Preview
          </button>
        </div>
      </div>
    </div>
  );
}
