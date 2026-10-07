"use client";

import { useRef, useEffect, useState, useCallback } from "react";

interface SignaturePadProps {
  onSignatureChange: (dataUrl: string | null) => void;
  height?: number;
}

export default function SignaturePad({
  onSignatureChange,
  height = 160,
}: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);

  const getCanvasCoordinates = useCallback((e: MouseEvent | TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const clientX = "touches" in e ? e.touches[0]?.clientX ?? 0 : e.clientX;
    const clientY = "touches" in e ? e.touches[0]?.clientY ?? 0 : e.clientY;
    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
    };
  }, []);

  const startDrawing = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
      e.preventDefault();
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const { x, y } = getCanvasCoordinates(e.nativeEvent);
      ctx.beginPath();
      ctx.moveTo(x, y);
      setIsDrawing(true);
    },
    [getCanvasCoordinates]
  );

  const draw = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
      if (!isDrawing) return;
      e.preventDefault();
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const { x, y } = getCanvasCoordinates(e.nativeEvent);
      ctx.lineTo(x, y);
      ctx.stroke();
      if (!hasDrawn) {
        setHasDrawn(true);
      }
    },
    [isDrawing, hasDrawn, getCanvasCoordinates]
  );

  const stopDrawing = useCallback(() => {
    if (!isDrawing) return;
    setIsDrawing(false);
    const canvas = canvasRef.current;
    if (canvas && hasDrawn) {
      const dataUrl = canvas.toDataURL("image/png");
      onSignatureChange(dataUrl);
    }
  }, [isDrawing, hasDrawn, onSignatureChange]);

  const handleClear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // Draw baseline guideline
    drawBaseline(ctx, canvas.width, canvas.height);
    setHasDrawn(false);
    onSignatureChange(null);
  };

  const drawBaseline = (ctx: CanvasRenderingContext2D, width: number, h: number) => {
    ctx.save();
    ctx.strokeStyle = "#cbd5e1";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(20, h - 35);
    ctx.lineTo(width - 20, h - 35);
    ctx.stroke();
    ctx.restore();
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Set canvas dimensions based on client rect for sharpness
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * (window.devicePixelRatio || 1);
    canvas.height = height * (window.devicePixelRatio || 1);
    ctx.scale(window.devicePixelRatio || 1, window.devicePixelRatio || 1);

    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    drawBaseline(ctx, rect.width, height);
  }, [height]);

  return (
    <div style={{ position: "relative", width: "100%" }}>
      <div
        style={{
          border: hasDrawn ? "2px solid var(--accent-primary, #0284c7)" : "2px dashed var(--border-light, #cbd5e1)",
          borderRadius: "12px",
          background: "#ffffff",
          overflow: "hidden",
          touchAction: "none",
          position: "relative",
          boxShadow: "inset 0 1px 3px rgba(0,0,0,0.06)",
        }}
      >
        <canvas
          ref={canvasRef}
          style={{
            width: "100%",
            height: `${height}px`,
            display: "block",
            cursor: "crosshair",
          }}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
        />

        {!hasDrawn && (
          <div
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              pointerEvents: "none",
              color: "#94a3b8",
              fontSize: "0.9rem",
              fontWeight: 500,
              userSelect: "none",
            }}
          >
            Draw your signature here with mouse or finger
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
          color: "var(--text-secondary, #64748b)",
        }}
      >
        <span>
          {hasDrawn ? (
            <span style={{ color: "#16a34a", fontWeight: 600 }}>✓ Signature captured</span>
          ) : (
            "Drawn signature is required"
          )}
        </span>
        <button
          type="button"
          onClick={handleClear}
          style={{
            background: "none",
            border: "none",
            color: "#64748b",
            cursor: "pointer",
            textDecoration: "underline",
            fontSize: "0.8rem",
            padding: "2px 6px",
          }}
        >
          Clear signature
        </button>
      </div>
    </div>
  );
}
