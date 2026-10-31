"use client";

import React, { useEffect } from "react";

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
  };
}

interface MediaPreviewModalProps {
  config: MediaPreviewConfig | null;
  onClose: () => void;
}

export default function MediaPreviewModal({ config, onClose }: MediaPreviewModalProps) {
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
        padding: "1.25rem",
      }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Preview: ${title}`}
    >
      <div
        style={{
          background: "#ffffff",
          borderRadius: 16,
          boxShadow: "0 25px 60px -15px rgba(20, 17, 15, 0.35)",
          width: type === "CERTIFICATE" ? "820px" : "900px",
          maxWidth: "100%",
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          border: "1px solid #ebd9c4",
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
                src={src}
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
            <div style={{ width: "100%", height: "65vh" }}>
              <iframe
                src={`${src}#toolbar=1`}
                style={{ width: "100%", height: "100%", border: "none", borderRadius: 8 }}
                title={`PDF: ${title}`}
              />
            </div>
          )}

          {type === "QUIZ" && (
            <div style={{ width: "100%", maxHeight: "65vh", overflowY: "auto", padding: "1rem" }}>
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
                  {quizData.questions.map((q, idx) => {
                    const questionText = q.question || q.title || q.prompt || `Question ${idx + 1}`;
                    const options = Array.isArray(q.options) ? q.options : [];
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
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "0.75rem", marginBottom: "0.75rem" }}>
                          <div style={{ display: "flex", gap: "0.5rem" }}>
                            <span style={{ fontWeight: 700, color: "#d97706", fontSize: "0.9rem" }}>{idx + 1}.</span>
                            <span style={{ fontWeight: 600, color: "#14110f", fontSize: "0.92rem" }}>{questionText}</span>
                          </div>
                          {q.points !== undefined && (
                            <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "#78716a", whiteSpace: "nowrap" }}>
                              {q.points} {q.points === 1 ? "point" : "points"}
                            </span>
                          )}
                        </div>

                        {options.length > 0 && (
                          <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "0.45rem", marginLeft: "1.5rem" }}>
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
                        )}
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
            <div
              style={{
                width: "100%",
                maxWidth: 720,
                aspectRatio: "1.414",
                background: "#ffffff",
                border: "12px solid #14110f",
                padding: "2.5rem 3rem",
                borderRadius: 4,
                boxShadow: "0 12px 35px rgba(20, 17, 15, 0.15)",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "space-between",
                textAlign: "center",
                position: "relative",
                fontFamily: "var(--font-serif, Georgia, serif)",
              }}
            >
              {/* Inner Decorative Golden Border */}
              <div
                style={{
                  position: "absolute",
                  inset: 8,
                  border: "2px solid #d4a373",
                  pointerEvents: "none",
                }}
              />

              <div style={{ width: "100%" }}>
                <span
                  style={{
                    fontFamily: "var(--font-sans)",
                    fontSize: "0.85rem",
                    fontWeight: 700,
                    letterSpacing: "0.18em",
                    color: "#b45309",
                    textTransform: "uppercase",
                  }}
                >
                  WHATBOUTME ACADEMY
                </span>
                <h1
                  style={{
                    fontSize: "2rem",
                    fontWeight: 700,
                    color: "#14110f",
                    margin: "0.4rem 0 0",
                    letterSpacing: "-0.01em",
                  }}
                >
                  Certificate of Completion
                </h1>
                <p
                  style={{
                    fontSize: "0.88rem",
                    color: "#78716a",
                    fontStyle: "italic",
                    margin: "0.35rem 0 0",
                  }}
                >
                  This official credential verifies that
                </p>
              </div>

              <div>
                <h2
                  style={{
                    fontSize: "1.85rem",
                    fontWeight: 700,
                    color: "#b45309",
                    margin: "0.5rem 0",
                    borderBottom: "1px solid #ebd9c4",
                    paddingBottom: "0.4rem",
                    minWidth: 320,
                  }}
                >
                  {certificateData?.studentName || "Learner Name"}
                </h2>
                <p style={{ fontSize: "0.88rem", color: "#57534e", margin: "0.5rem 0 0" }}>
                  has successfully satisfied all rigorous curriculum steps, assessments, and attendance for
                </p>
                <h3
                  style={{
                    fontSize: "1.25rem",
                    fontWeight: 700,
                    color: "#14110f",
                    margin: "0.35rem 0 0",
                  }}
                >
                  {certificateData?.programTitle || title}
                </h3>
              </div>

              {/* Bottom Signatures & Seal */}
              <div
                style={{
                  width: "100%",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-end",
                  marginTop: "1.5rem",
                  paddingTop: "1rem",
                  borderTop: "1px solid #f2ede4",
                  fontFamily: "var(--font-sans)",
                }}
              >
                <div style={{ textAlign: "left" }}>
                  <div style={{ height: 26, borderBottom: "1px solid #14110f", width: 140, marginBottom: 4 }} />
                  <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "#14110f", display: "block" }}>
                    Roweena
                  </span>
                  <span style={{ fontSize: "0.7rem", color: "#78716a" }}>Founder &amp; Master Coach</span>
                </div>

                {/* Golden Seal */}
                <div
                  style={{
                    width: 58,
                    height: 58,
                    borderRadius: "50%",
                    background: "radial-gradient(circle, #fde68a 0%, #d97706 100%)",
                    border: "3px double #ffffff",
                    boxShadow: "0 2px 8px rgba(180, 83, 9, 0.35)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#78350f",
                    fontWeight: 800,
                    fontSize: "0.62rem",
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                    textAlign: "center",
                    padding: 4,
                  }}
                >
                  OFFICIAL SEAL
                </div>

                <div style={{ textAlign: "right" }}>
                  <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "#14110f", display: "block" }}>
                    {certificateData?.completionDate || new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  </span>
                  <span style={{ fontSize: "0.7rem", color: "#78716a" }}>
                    ID: {certificateData?.certificateNumber || "WBM-2026-CERT"}
                  </span>
                </div>
              </div>
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
