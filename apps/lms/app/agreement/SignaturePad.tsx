"use client";

import { useRef, useEffect, useState, useCallback, ChangeEvent } from "react";
import {
  beginStroke,
  continueStroke,
  createStrokeState,
  countInkPixels,
  endStroke,
  isSignatureBlank,
  mapClientToCanvasPoint,
  validateSignatureUpload,
  type Point,
  type StrokeState,
} from "./signaturePadLogic";

export type SignatureMethod = "DRAWN" | "UPLOADED";

interface SignaturePadProps {
  onSignatureChange: (dataUrl: string | null, method: SignatureMethod) => void;
  height?: number;
}

export default function SignaturePad({
  onSignatureChange,
  height = 160,
}: SignaturePadProps) {
  const [activeTab, setActiveTab] = useState<SignatureMethod>("DRAWN");

  // ── DRAWN SIGNATURE STATE ──────────────────────────────────────────────
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [hasDrawn, setHasDrawn] = useState(false);

  // Drawing state lives in a ref: it must never trigger a re-render mid-stroke,
  // and it must be readable from the resize observer without stale closures.
  const strokeRef = useRef<StrokeState>(createStrokeState());
  const hasDrawnRef = useRef(false);
  // Logical (CSS) drawing size of the canvas backing the 2D context.
  const cssSizeRef = useRef({ width: 0, height });

  // ── UPLOADED SIGNATURE STATE ───────────────────────────────────────────
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploadedDataUrl, setUploadedDataUrl] = useState<string | null>(null);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [uploadedFileSize, setUploadedFileSize] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Latest-value refs so effects/handlers don't capture stale props or state.
  const onChangeRef = useRef(onSignatureChange);
  useEffect(() => {
    onChangeRef.current = onSignatureChange;
  }, [onSignatureChange]);
  const activeTabRef = useRef<SignatureMethod>(activeTab);
  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);

  const emitSignature = useCallback(
    (dataUrl: string | null, method: SignatureMethod) => {
      onChangeRef.current(dataUrl, method);
    },
    [],
  );

  const getCanvasPoint = useCallback((clientX: number, clientY: number): Point => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return mapClientToCanvasPoint(
      clientX,
      clientY,
      rect,
      cssSizeRef.current.width || rect.width,
      cssSizeRef.current.height || rect.height,
    );
  }, []);

  const clearCanvasPixels = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    // clearRect works in device pixels, so drop the DPR transform for the wipe.
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
  }, []);

  const resetDrawnSignature = useCallback(() => {
    strokeRef.current = createStrokeState();
    clearCanvasPixels();
    hasDrawnRef.current = false;
    setHasDrawn(false);
  }, [clearCanvasPixels]);

  // ── DRAWN SIGNATURE POINTER LOGIC ────────────────────────────────────
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    // Only accept the primary button for mice (left click); touch/pen always.
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    e.preventDefault();
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      // Capture is a nicety; drawing still works without it.
    }

    // Do not touch the canvas here — a press with no movement must not draw.
    strokeRef.current = beginStroke(
      createStrokeState(),
      getCanvasPoint(e.clientX, e.clientY),
    );
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!strokeRef.current.isDown) return;
    e.preventDefault();

    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const { state, segment } = continueStroke(
      strokeRef.current,
      getCanvasPoint(e.clientX, e.clientY),
    );
    strokeRef.current = state;
    if (!segment) return;

    ctx.beginPath();
    ctx.moveTo(segment.from.x, segment.from.y);
    ctx.lineTo(segment.to.x, segment.to.y);
    ctx.stroke();

    if (!hasDrawnRef.current) {
      hasDrawnRef.current = true;
      setHasDrawn(true);
    }
  };

  /**
   * Finish the current stroke and publish the canvas contents to the parent.
   * Idempotent: safe to call from pointerup, pointercancel, lostpointercapture
   * and pointerleave — only a stroke that actually drew ink is exported.
   */
  const finishStroke = useCallback(() => {
    const stroke = strokeRef.current;
    const strokeDrew = stroke.hasStroked;
    strokeRef.current = endStroke(stroke);

    if (!strokeDrew) return;

    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
    if (isSignatureBlank(countInkPixels(image.data))) {
      // Only stray artifacts (e.g. a single accidental dot) — treat as unsigned
      // rather than submitting a meaningless image.
      resetDrawnSignature();
      if (activeTabRef.current === "DRAWN") emitSignature(null, "DRAWN");
      return;
    }

    const dataUrl = canvas.toDataURL("image/png");
    if (activeTabRef.current === "DRAWN") emitSignature(dataUrl, "DRAWN");
  }, [emitSignature, resetDrawnSignature]);

  const releasePointerCapture = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      if (canvas.hasPointerCapture(e.pointerId)) {
        canvas.releasePointerCapture(e.pointerId);
      }
    } catch {
      // ignore
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    releasePointerCapture(e);
    finishStroke();
  };

  const handlePointerCancel = (e: React.PointerEvent<HTMLCanvasElement>) => {
    releasePointerCapture(e);
    finishStroke();
  };

  const handleLostPointerCapture = () => {
    finishStroke();
  };

  const handlePointerLeave = (e: React.PointerEvent<HTMLCanvasElement>) => {
    // While capture is held the pointer is still logically "on" the canvas, so
    // leaving its bounds must not terminate the stroke.
    const canvas = canvasRef.current;
    if (canvas?.hasPointerCapture(e.pointerId)) return;
    finishStroke();
  };

  const handleClearCanvas = () => {
    resetDrawnSignature();
    if (activeTabRef.current === "DRAWN") emitSignature(null, "DRAWN");
  };

  // Size the backing store from the wrapper width, and keep it in sync on real
  // layout changes. Re-runs when the Draw tab remounts the canvas.
  useEffect(() => {
    if (activeTab !== "DRAWN") return;

    const canvas = canvasRef.current;
    const wrapper = wrapperRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !wrapper || !ctx) return;

    let appliedWidth = -1;

    /** Returns true when the backing store was actually re-created. */
    const applySize = (): boolean => {
      const width = wrapper.clientWidth;
      if (width <= 0 || width === appliedWidth) return false;
      appliedWidth = width;
      cssSizeRef.current = { width, height };

      const dpr = window.devicePixelRatio || 1;
      // Assigning width/height resets the canvas, so this only happens on a
      // genuine size change (never mid-stroke — guarded by the observer).
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      ctx.strokeStyle = "#14110f"; // charcoal ink
      ctx.lineWidth = 2.2;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      return true;
    };

    applySize();

    const resizeObserver = new ResizeObserver(() => {
      if (strokeRef.current.isDown) return;
      if (applySize() && hasDrawnRef.current) {
        // The canvas was wiped by the resize, so the previously published
        // signature no longer matches what the learner can see.
        resetDrawnSignature();
        if (activeTabRef.current === "DRAWN") emitSignature(null, "DRAWN");
      }
    });

    resizeObserver.observe(wrapper);
    return () => resizeObserver.disconnect();
  }, [activeTab, height, emitSignature, resetDrawnSignature]);

  // Handle uploaded file
  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    setUploadError(null);
    const file = e.target.files?.[0];
    if (!file) return;

    // 1. Validate file type and size (PNG / JPEG / WebP, max 2MB)
    const validation = validateSignatureUpload({
      name: file.name,
      type: file.type,
      size: file.size,
    });
    if (!validation.ok) {
      setUploadError(validation.error);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    // 2. Read image as Data URL and normalize via canvas for consistent PDF embedding
    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      if (!dataUrl || !dataUrl.startsWith("data:image/")) {
        setUploadError("Failed to parse image. Please select a valid image file.");
        return;
      }

      // Normalize uploaded image to clean PNG via offscreen canvas so all formats
      // (PNG, JPEG, WebP) are consistently formatted and sized for PDF embedding.
      const img = new Image();
      img.onload = () => {
        try {
          const maxDim = 1200;
          let w = img.naturalWidth || img.width;
          let h = img.naturalHeight || img.height;
          if (w > maxDim || h > maxDim) {
            const ratio = Math.min(maxDim / w, maxDim / h);
            w = Math.round(w * ratio);
            h = Math.round(h * ratio);
          }
          const offscreen = document.createElement("canvas");
          offscreen.width = w;
          offscreen.height = h;
          const ctx = offscreen.getContext("2d");
          if (ctx) {
            ctx.drawImage(img, 0, 0, w, h);
            const normalizedPng = offscreen.toDataURL("image/png");
            setUploadedDataUrl(normalizedPng);
            setUploadedFileName(file.name);
            setUploadedFileSize(`${(file.size / 1024).toFixed(1)} KB`);
            emitSignature(normalizedPng, "UPLOADED");
            return;
          }
        } catch {
          // Fallback to raw dataUrl if canvas operation fails
        }
        setUploadedDataUrl(dataUrl);
        setUploadedFileName(file.name);
        setUploadedFileSize(`${(file.size / 1024).toFixed(1)} KB`);
        emitSignature(dataUrl, "UPLOADED");
      };
      img.onerror = () => {
        setUploadedDataUrl(dataUrl);
        setUploadedFileName(file.name);
        setUploadedFileSize(`${(file.size / 1024).toFixed(1)} KB`);
        emitSignature(dataUrl, "UPLOADED");
      };
      img.src = dataUrl;
    };
    reader.onerror = () => {
      setUploadError("An error occurred reading the selected file.");
    };
    reader.readAsDataURL(file);
  };

  const handleTabSwitch = (tab: SignatureMethod) => {
    setActiveTab(tab);
    activeTabRef.current = tab;
    setUploadError(null);
    // Switching methods must not carry the other method's signature: the drawn
    // canvas is reset and only the newly active method's value is published.
    if (tab === "DRAWN") {
      resetDrawnSignature();
      emitSignature(null, "DRAWN");
    } else {
      emitSignature(uploadedDataUrl, "UPLOADED");
    }
  };

  const handleClearUpload = () => {
    setUploadedDataUrl(null);
    setUploadedFileName(null);
    setUploadedFileSize(null);
    setUploadError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (activeTabRef.current === "UPLOADED") {
      emitSignature(null, "UPLOADED");
    }
  };

  return (
    <div style={{ position: "relative", width: "100%" }}>
      {/* METHOD SELECTION TABS */}
      <div
        style={{
          display: "flex",
          gap: "0.5rem",
          marginBottom: "0.75rem",
          background: "#F7F3EC",
          padding: "4px",
          borderRadius: "8px",
          border: "1px solid #E7E0D6",
          width: "fit-content",
        }}
      >
        <button
          type="button"
          onClick={() => handleTabSwitch("DRAWN")}
          style={{
            padding: "0.45rem 1rem",
            fontSize: "0.85rem",
            fontWeight: activeTab === "DRAWN" ? 600 : 500,
            color: activeTab === "DRAWN" ? "#1C1917" : "#78716A",
            background: activeTab === "DRAWN" ? "#FFFFFF" : "transparent",
            border: activeTab === "DRAWN" ? "1px solid #E7E0D6" : "none",
            borderRadius: "6px",
            cursor: "pointer",
            boxShadow: activeTab === "DRAWN" ? "0 1px 3px rgba(0,0,0,0.04)" : "none",
            display: "inline-flex",
            alignItems: "center",
            gap: "0.45rem",
            transition: "all 0.15s ease",
          }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
          </svg>
          <span>Draw Signature</span>
        </button>
        <button
          type="button"
          onClick={() => handleTabSwitch("UPLOADED")}
          style={{
            padding: "0.45rem 1rem",
            fontSize: "0.85rem",
            fontWeight: activeTab === "UPLOADED" ? 600 : 500,
            color: activeTab === "UPLOADED" ? "#1C1917" : "#78716A",
            background: activeTab === "UPLOADED" ? "#FFFFFF" : "transparent",
            border: activeTab === "UPLOADED" ? "1px solid #E7E0D6" : "none",
            borderRadius: "6px",
            cursor: "pointer",
            boxShadow: activeTab === "UPLOADED" ? "0 1px 3px rgba(0,0,0,0.04)" : "none",
            display: "inline-flex",
            alignItems: "center",
            gap: "0.45rem",
            transition: "all 0.15s ease",
          }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          <span>Upload Image</span>
        </button>
      </div>

      {/* OPTION A: DRAW SIGNATURE CANVAS */}
      {activeTab === "DRAWN" && (
        <div>
          <div
            ref={wrapperRef}
            style={{
              border: hasDrawn ? "1.5px solid #B86B11" : "1.5px dashed #D5CBBF",
              borderRadius: "10px",
              background: "#FFFFFF",
              overflow: "hidden",
              touchAction: "none",
              position: "relative",
              boxShadow: "inset 0 1px 3px rgba(0,0,0,0.02)",
            }}
          >
            <canvas
              ref={canvasRef}
              style={{
                width: "100%",
                height: `${height}px`,
                display: "block",
                cursor: "crosshair",
                touchAction: "none",
              }}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerCancel}
              onLostPointerCapture={handleLostPointerCapture}
              onPointerLeave={handlePointerLeave}
            />


            {!hasDrawn && (
              <div
                style={{
                  position: "absolute",
                  top: "50%",
                  left: "50%",
                  transform: "translate(-50%, -50%)",
                  pointerEvents: "none",
                  color: "#A8A29E",
                  fontSize: "0.95rem",
                  fontWeight: 500,
                  userSelect: "none",
                  textAlign: "center",
                  letterSpacing: "0.02em",
                }}
              >
                Sign here
              </div>
            )}
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginTop: "0.5rem",
              fontSize: "0.8rem",
              color: "#6B655D",
              minHeight: "1.5rem",
            }}
          >
            <div>
              {hasDrawn && (
                <span style={{ color: "#15803D", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: "0.3rem" }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  Signature captured
                </span>
              )}
            </div>
            {hasDrawn && (
              <button
                type="button"
                onClick={handleClearCanvas}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "#8C531B",
                  cursor: "pointer",
                  fontSize: "0.8rem",
                  fontWeight: 600,
                  padding: "2px 6px",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.3rem",
                }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M3 6h18" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                  <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
                <span>Clear Signature</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* OPTION B: UPLOAD SIGNATURE IMAGE */}
      {activeTab === "UPLOADED" && (
        <div>
          {uploadError && (
            <div
              style={{
                background: "#FEF2F2",
                border: "1px solid #FECACA",
                color: "#991B1B",
                padding: "0.6rem 0.85rem",
                borderRadius: "8px",
                fontSize: "0.82rem",
                marginBottom: "0.6rem",
              }}
            >
              {uploadError}
            </div>
          )}

          {uploadedDataUrl ? (
            /* PREVIEW STATE */
            <div
              style={{
                border: "1px solid #E7E0D6",
                borderRadius: "10px",
                padding: "1rem",
                background: "#FFFFFF",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "1rem",
                boxShadow: "0 1px 3px rgba(0,0,0,0.02)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                <div
                  style={{
                    background: "#FAF7F2",
                    border: "1px solid #E7E0D6",
                    borderRadius: "8px",
                    padding: "8px",
                    maxHeight: "80px",
                    maxWidth: "180px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={uploadedDataUrl}
                    alt="Uploaded signature preview"
                    style={{ maxHeight: "64px", maxWidth: "160px", objectFit: "contain" }}
                  />
                </div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: "0.88rem", color: "#1C1917" }}>
                    {uploadedFileName}
                  </div>
                  <div style={{ fontSize: "0.78rem", color: "#78716A" }}>
                    Size: {uploadedFileSize} • Verified image
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", gap: "0.5rem" }}>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  style={{
                    background: "#F7F3EC",
                    color: "#1C1917",
                    border: "1px solid #E7E0D6",
                    padding: "0.45rem 0.85rem",
                    borderRadius: "6px",
                    fontSize: "0.8rem",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Replace
                </button>
                <button
                  type="button"
                  onClick={handleClearUpload}
                  style={{
                    background: "#FDF2F2",
                    color: "#991B1B",
                    border: "1px solid #FECACA",
                    padding: "0.45rem 0.85rem",
                    borderRadius: "6px",
                    fontSize: "0.8rem",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Remove
                </button>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/png, image/jpeg, image/jpg, image/webp"
                onChange={handleFileChange}
                style={{ display: "none" }}
              />
            </div>
          ) : (
            /* UPLOAD DROPZONE */
            <div
              onClick={() => fileInputRef.current?.click()}
              style={{
                border: "1.5px dashed #D5CBBF",
                borderRadius: "10px",
                padding: "2rem 1.25rem",
                textAlign: "center",
                background: "#FAF7F2",
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
              onMouseEnter={(e) => {
                const el = e.currentTarget as HTMLElement;
                el.style.borderColor = "#B86B11";
                el.style.background = "#FFFFFF";
              }}
              onMouseLeave={(e) => {
                const el = e.currentTarget as HTMLElement;
                el.style.borderColor = "#D5CBBF";
                el.style.background = "#FAF7F2";
              }}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png, image/jpeg, image/jpg, image/webp"
                onChange={handleFileChange}
                style={{ display: "none" }}
              />
              <div style={{ display: "flex", justifyContent: "center", marginBottom: "0.5rem", color: "#8C531B" }}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
              </div>
              <div style={{ fontWeight: 600, fontSize: "0.92rem", color: "#1C1917", marginBottom: "0.25rem" }}>
                Click to upload your signature image
              </div>
              <div style={{ fontSize: "0.8rem", color: "#78716A" }}>
                PNG, JPEG, or WebP up to 2MB
              </div>
            </div>
          )}

        </div>
      )}
    </div>
  );
}
