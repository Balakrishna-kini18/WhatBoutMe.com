"use client";

import React, { useState, useMemo, useRef } from "react";
import {
  ParsedMarkdownQuestion,
  parseQuestionsFromMarkdown,
  generateSampleQuestionsMarkdown,
  exportQuestionsToMarkdown,
} from "../../../lib/markdown-question-parser";
import { ExamQuestionItem } from "../../../lib/api";

interface MarkdownQuestionImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  programTitle?: string;
  existingQuestions?: Array<Partial<ExamQuestionItem>>;
  allowReplaceMode?: boolean;
  defaultSampleCount?: number;
  onImport: (questions: ParsedMarkdownQuestion[], replaceExisting: boolean) => Promise<void>;
}

const FORMAT_EXAMPLE = `## Q1: Which response best demonstrates emotional regulation during a high-stakes conversation?
Type: MULTIPLE_CHOICE
Points: 1
Explanation: Pausing to observe internal triggers prevents reactive escalation.
- [x] Pausing to breathe, naming the emotion internally, and responding intentionally
- [ ] Interrupting immediately to defend your viewpoint
- [ ] Shutting down and refusing to communicate
- [ ] Blaming the other person for triggering you

---

## Q2: Which of the following are healthy boundary practices? (Select all that apply)
Type: MULTI_SELECT
Points: 1
- [x] Stating personal limits clearly and calmly
- [x] Aligning commitments with core values
- [ ] Saying yes to everything out of guilt`;

export default function MarkdownQuestionImportModal({
  isOpen,
  onClose,
  title = "Import Questions from Markdown (.md)",
  programTitle = "11 Steps to U",
  existingQuestions = [],
  allowReplaceMode = true,
  defaultSampleCount = 70,
  onImport,
}: MarkdownQuestionImportModalProps) {
  const [markdownText, setMarkdownText] = useState<string>("");
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [replaceExisting, setReplaceExisting] = useState<boolean>(false);
  const [isImporting, setIsImporting] = useState<boolean>(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [showFormatGuide, setShowFormatGuide] = useState<boolean>(true);
  const [copiedFormat, setCopiedFormat] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const parseResult = useMemo(() => {
    if (!markdownText.trim()) {
      return { questions: [], errors: [], totalBlocksFound: 0 };
    }
    return parseQuestionsFromMarkdown(markdownText);
  }, [markdownText]);

  if (!isOpen) return null;

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportError(null);
    setUploadedFileName(file.name);
    try {
      const text = await file.text();
      setMarkdownText(text);
    } catch {
      setImportError("Could not read the selected Markdown file.");
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const triggerDownload = (content: string, filename: string) => {
    const blob = new Blob([content], { type: "text/markdown;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDownloadSample = (count: number) => {
    const safeSlug = (programTitle || "program")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
    const content = generateSampleQuestionsMarkdown(count, programTitle);
    triggerDownload(content, `${safeSlug}-${count}-questions-template.md`);
  };

  const handleExportCurrentPool = () => {
    const safeSlug = (programTitle || "program")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
    const content = exportQuestionsToMarkdown(
      existingQuestions,
      `${programTitle} — Question Pool`
    );
    triggerDownload(content, `${safeSlug}-exported-questions.md`);
  };

  const handleLoadTemplateIntoEditor = (count: number) => {
    const content = generateSampleQuestionsMarkdown(count, programTitle);
    setMarkdownText(content);
    setUploadedFileName(`template-${count}-questions.md`);
    setImportError(null);
  };

  const handleCopyFormat = async () => {
    try {
      await navigator.clipboard.writeText(FORMAT_EXAMPLE);
      setCopiedFormat(true);
      setTimeout(() => setCopiedFormat(false), 2000);
    } catch {
      // ignore clipboard errors
    }
  };

  const handleConfirmImport = async () => {
    if (parseResult.questions.length === 0) {
      setImportError("No valid questions found to import. Please check the Markdown format.");
      return;
    }
    if (parseResult.questions.length > 100) {
      setImportError("Maximum 100 questions can be imported per upload.");
      return;
    }

    setIsImporting(true);
    setImportError(null);
    try {
      await onImport(parseResult.questions, replaceExisting);
      setMarkdownText("");
      setUploadedFileName(null);
      onClose();
    } catch (err: any) {
      setImportError(err.message || "Failed to import questions from Markdown.");
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(20, 17, 15, 0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1100,
        padding: "1rem",
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "#ffffff",
          borderRadius: 16,
          border: "1px solid #ece6dd",
          width: "100%",
          maxWidth: 960,
          maxHeight: "92vh",
          overflowY: "auto",
          padding: "1.5rem 1.75rem",
          boxShadow: "0 24px 48px rgba(20, 17, 15, 0.22)",
          display: "flex",
          flexDirection: "column",
          gap: "1.15rem",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: "1rem",
            borderBottom: "1px solid #ece6dd",
            paddingBottom: "0.9rem",
          }}
        >
          <div>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.4rem",
                fontSize: "0.72rem",
                fontWeight: 800,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                color: "#c97a1e",
                background: "#fef3c7",
                padding: "0.2rem 0.6rem",
                borderRadius: 999,
                marginBottom: "0.35rem",
              }}
            >
              BULK MARKDOWN (.MD) QUESTION IMPORTER
            </div>
            <h3 style={{ margin: 0, fontSize: "1.2rem", fontWeight: 800, color: "#14110f" }}>
              {title}
            </h3>
            <p style={{ margin: "0.25rem 0 0", fontSize: "0.85rem", color: "#6b655e" }}>
              Upload a structured <code>.md</code> file with questions, answer options, and correct answers to automatically generate questions in the Admin and Learner portals.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              fontSize: "1.35rem",
              cursor: "pointer",
              color: "#78716a",
              lineHeight: 1,
            }}
          >
            ✕
          </button>
        </div>

        {/* Top Action Bar: Download Templates & Upload File */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "0.75rem",
            padding: "0.9rem 1.1rem",
            background: "#faf6f0",
            border: "1px solid #ece4d7",
            borderRadius: 12,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.55rem", flexWrap: "wrap" }}>
            <input
              ref={fileInputRef}
              type="file"
              accept=".md,.markdown,.txt"
              onChange={handleFileChange}
              style={{ display: "none" }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              style={{
                padding: "0.55rem 1.05rem",
                borderRadius: 9,
                border: "none",
                background: "#c97a1e",
                color: "#ffffff",
                fontWeight: 700,
                fontSize: "0.84rem",
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: "0.4rem",
              }}
            >
              📂 Choose .md File to Upload
            </button>

            <button
              type="button"
              onClick={() => handleLoadTemplateIntoEditor(defaultSampleCount)}
              style={{
                padding: "0.52rem 0.9rem",
                borderRadius: 9,
                border: "1px solid #d97706",
                background: "#fffbeb",
                color: "#b45309",
                fontWeight: 700,
                fontSize: "0.8rem",
                cursor: "pointer",
              }}
            >
              ⚡ Load {defaultSampleCount}-Q Template in Editor
            </button>

            {uploadedFileName && (
              <span
                style={{
                  fontSize: "0.8rem",
                  fontWeight: 700,
                  color: "#15803d",
                  background: "#dcfce7",
                  padding: "0.25rem 0.65rem",
                  borderRadius: 999,
                }}
              >
                Loaded: {uploadedFileName}
              </span>
            )}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => handleDownloadSample(5)}
              style={{
                padding: "0.45rem 0.8rem",
                borderRadius: 8,
                border: "1px solid #dcd5cb",
                background: "#ffffff",
                color: "#44403c",
                fontWeight: 700,
                fontSize: "0.78rem",
                cursor: "pointer",
              }}
            >
              ⬇ Sample .md (5 Qs)
            </button>
            <button
              type="button"
              onClick={() => handleDownloadSample(70)}
              style={{
                padding: "0.45rem 0.8rem",
                borderRadius: 8,
                border: "1px solid #dcd5cb",
                background: "#ffffff",
                color: "#44403c",
                fontWeight: 700,
                fontSize: "0.78rem",
                cursor: "pointer",
              }}
            >
              ⬇ Full 70-Q Template (.md)
            </button>
            {existingQuestions.length > 0 && (
              <button
                type="button"
                onClick={handleExportCurrentPool}
                style={{
                  padding: "0.45rem 0.8rem",
                  borderRadius: 8,
                  border: "1px solid #dcd5cb",
                  background: "#ffffff",
                  color: "#44403c",
                  fontWeight: 700,
                  fontSize: "0.78rem",
                  cursor: "pointer",
                }}
              >
                ⬇ Export Current Pool ({existingQuestions.length} Qs)
              </button>
            )}
          </div>
        </div>

        {/* Collapsible Markdown Format Specification */}
        <div
          style={{
            border: "1px solid #ece6dd",
            borderRadius: 12,
            background: "#fffdf9",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              padding: "0.7rem 1rem",
              background: "#f8f3eb",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              cursor: "pointer",
            }}
            onClick={() => setShowFormatGuide((prev) => !prev)}
          >
            <span style={{ fontWeight: 700, fontSize: "0.84rem", color: "#14110f" }}>
              {showFormatGuide ? "▼" : "▶"} Markdown (.md) Question Format Specification
            </span>
            <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }} onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                onClick={handleCopyFormat}
                style={{
                  padding: "0.28rem 0.65rem",
                  borderRadius: 6,
                  border: "1px solid #dcd5cb",
                  background: "#ffffff",
                  fontSize: "0.75rem",
                  fontWeight: 700,
                  color: "#44403c",
                  cursor: "pointer",
                }}
              >
                {copiedFormat ? "✓ Copied Example" : "Copy Format Example"}
              </button>
            </div>
          </div>

          {showFormatGuide && (
            <div style={{ padding: "0.9rem 1rem", fontSize: "0.8rem", color: "#44403c" }}>
              <div style={{ marginBottom: "0.5rem", lineHeight: 1.5 }}>
                Write each question starting with <code>## Q1: Your question prompt</code> (or separate blocks with <code>---</code>). Mark correct options with <code>- [x]</code> and wrong options with <code>- [ ]</code> (or use <code>A) ...</code>, <code>B) ...</code> with <code>Answer: A</code>):
              </div>
              <pre
                style={{
                  margin: 0,
                  padding: "0.75rem 0.9rem",
                  background: "#1c1917",
                  color: "#f5f5f4",
                  borderRadius: 8,
                  fontSize: "0.76rem",
                  lineHeight: 1.45,
                  overflowX: "auto",
                }}
              >
                {FORMAT_EXAMPLE}
              </pre>
            </div>
          )}
        </div>

        {/* Two-Column Split: Markdown Input vs Live Parsed Preview */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))",
            gap: "1rem",
          }}
        >
          {/* Left: Raw Markdown Editor */}
          <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <label style={{ fontWeight: 700, fontSize: "0.84rem", color: "#14110f" }}>
                Markdown Content (Upload <code>.md</code> or Paste/Edit Below)
              </label>
              {markdownText && (
                <button
                  type="button"
                  onClick={() => {
                    setMarkdownText("");
                    setUploadedFileName(null);
                  }}
                  style={{
                    border: "none",
                    background: "transparent",
                    color: "#b91c1c",
                    fontSize: "0.76rem",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  Clear
                </button>
              )}
            </div>
            <textarea
              rows={13}
              value={markdownText}
              onChange={(e) => setMarkdownText(e.target.value)}
              placeholder={`Paste your Markdown questions here or click "Choose .md File to Upload" above...\n\n## Q1: Sample question prompt?\n- [x] Correct answer option\n- [ ] Distractor option B\n- [ ] Distractor option C\n- [ ] Distractor option D`}
              style={{
                width: "100%",
                padding: "0.75rem 0.85rem",
                borderRadius: 10,
                border: "1px solid #dcd5cb",
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                fontSize: "0.8rem",
                lineHeight: 1.45,
                resize: "vertical",
                background: "#fffdfa",
              }}
            />
          </div>

          {/* Right: Live Parsed Questions Preview */}
          <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.4rem" }}>
              <span style={{ fontWeight: 700, fontSize: "0.84rem", color: "#14110f" }}>
                Live Auto-Generated Preview ({parseResult.questions.length} Valid Questions)
              </span>
              {parseResult.questions.length > 0 && (
                <span
                  style={{
                    fontSize: "0.75rem",
                    fontWeight: 700,
                    padding: "0.18rem 0.55rem",
                    borderRadius: 999,
                    background: "#dcfce7",
                    color: "#166534",
                  }}
                >
                  ✓ Ready to Import ({parseResult.questions.length} Qs)
                </span>
              )}
            </div>

            <div
              style={{
                border: "1px solid #ece6dd",
                borderRadius: 10,
                background: "#faf6f0",
                padding: "0.75rem",
                height: 295,
                overflowY: "auto",
                display: "flex",
                flexDirection: "column",
                gap: "0.65rem",
              }}
            >
              {parseResult.errors.length > 0 && (
                <div
                  style={{
                    padding: "0.65rem 0.8rem",
                    borderRadius: 8,
                    background: "#fef2f2",
                    border: "1px solid #fecaca",
                    color: "#991b1b",
                    fontSize: "0.78rem",
                  }}
                >
                  <div style={{ fontWeight: 800, marginBottom: "0.25rem" }}>
                    ⚠ {parseResult.errors.length} block(s) need attention:
                  </div>
                  <ul style={{ margin: 0, paddingLeft: "1.1rem" }}>
                    {parseResult.errors.map((err, idx) => (
                      <li key={idx}>
                        <strong>Block #{err.blockNumber}:</strong> {err.reason}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {parseResult.questions.length === 0 && parseResult.errors.length === 0 ? (
                <div
                  style={{
                    margin: "auto",
                    textAlign: "center",
                    color: "#78716a",
                    fontSize: "0.84rem",
                    padding: "1.5rem",
                  }}
                >
                  Upload a <code>.md</code> file or paste Markdown on the left to preview auto-generated questions and answers here.
                </div>
              ) : (
                parseResult.questions.map((q) => (
                  <div
                    key={q.index}
                    style={{
                      background: "#ffffff",
                      border: "1px solid #e6dfd5",
                      borderRadius: 9,
                      padding: "0.65rem 0.8rem",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: "0.4rem",
                        marginBottom: "0.3rem",
                      }}
                    >
                      <span
                        style={{
                          fontSize: "0.72rem",
                          fontWeight: 800,
                          color: "#9a5810",
                          background: "#fef3c7",
                          padding: "0.12rem 0.45rem",
                          borderRadius: 6,
                        }}
                      >
                        Q{q.index} · {q.type.replace("_", " ")} · {q.points} pt
                      </span>
                    </div>
                    <div style={{ fontWeight: 700, fontSize: "0.82rem", color: "#14110f", marginBottom: "0.35rem" }}>
                      {q.text}
                    </div>
                    {q.options.length > 0 && (
                      <div style={{ display: "flex", flexDirection: "column", gap: "0.22rem" }}>
                        {q.options.map((opt, oIdx) => (
                          <div
                            key={oIdx}
                            style={{
                              fontSize: "0.76rem",
                              padding: "0.22rem 0.5rem",
                              borderRadius: 6,
                              background: opt.isCorrect ? "#f0fdf4" : "#f8fafc",
                              border: opt.isCorrect ? "1px solid #86efac" : "1px solid #e2e8f0",
                              color: opt.isCorrect ? "#166534" : "#475569",
                              fontWeight: opt.isCorrect ? 700 : 500,
                              display: "flex",
                              justifyContent: "space-between",
                            }}
                          >
                            <span>
                              {String.fromCharCode(65 + oIdx)}. {opt.text}
                            </span>
                            {opt.isCorrect && <span>✓ Correct</span>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Import Mode & Error Banner */}
        {allowReplaceMode && existingQuestions.length > 0 && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "1.25rem",
              padding: "0.7rem 1rem",
              borderRadius: 10,
              background: "#faf6f0",
              border: "1px solid #ece4d7",
              flexWrap: "wrap",
            }}
          >
            <span style={{ fontWeight: 700, fontSize: "0.84rem", color: "#14110f" }}>
              Import Mode:
            </span>
            <label
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.4rem",
                fontSize: "0.83rem",
                fontWeight: !replaceExisting ? 700 : 500,
                color: "#14110f",
                cursor: "pointer",
              }}
            >
              <input
                type="radio"
                name="mdImportMode"
                checked={!replaceExisting}
                onChange={() => setReplaceExisting(false)}
              />
              Append to existing pool ({existingQuestions.length} + {parseResult.questions.length} ={" "}
              {existingQuestions.length + parseResult.questions.length} questions)
            </label>
            <label
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.4rem",
                fontSize: "0.83rem",
                fontWeight: replaceExisting ? 700 : 500,
                color: replaceExisting ? "#b45309" : "#14110f",
                cursor: "pointer",
              }}
            >
              <input
                type="radio"
                name="mdImportMode"
                checked={replaceExisting}
                onChange={() => setReplaceExisting(true)}
              />
              Replace existing pool with these {parseResult.questions.length} questions
            </label>
          </div>
        )}

        {importError && (
          <div
            style={{
              padding: "0.7rem 0.95rem",
              borderRadius: 9,
              background: "#fef2f2",
              border: "1px solid #fecaca",
              color: "#991b1b",
              fontSize: "0.83rem",
              fontWeight: 600,
            }}
          >
            {importError}
          </div>
        )}

        {/* Footer Actions */}
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            alignItems: "center",
            gap: "0.75rem",
            borderTop: "1px solid #ece6dd",
            paddingTop: "0.9rem",
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: "0.58rem 1.15rem",
              borderRadius: 9,
              border: "1px solid #dcd5cb",
              background: "#ffffff",
              color: "#44403c",
              fontWeight: 700,
              fontSize: "0.86rem",
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={isImporting || parseResult.questions.length === 0}
            onClick={handleConfirmImport}
            style={{
              padding: "0.58rem 1.35rem",
              borderRadius: 9,
              border: "none",
              background:
                isImporting || parseResult.questions.length === 0 ? "#d6d3d1" : "#c97a1e",
              color: "#ffffff",
              fontWeight: 700,
              fontSize: "0.86rem",
              cursor:
                isImporting || parseResult.questions.length === 0 ? "not-allowed" : "pointer",
            }}
          >
            {isImporting
              ? "Importing Questions..."
              : replaceExisting
                ? `Replace Pool with ${parseResult.questions.length} Questions`
                : `Import ${parseResult.questions.length} Question${parseResult.questions.length === 1 ? "" : "s"}`}
          </button>
        </div>
      </div>
    </div>
  );
}
