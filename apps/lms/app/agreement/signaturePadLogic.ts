/**
 * Pure, DOM-free logic for the signature pad.
 *
 * Everything here is framework-agnostic and unit-testable: the stroke state
 * machine, pointer→canvas coordinate mapping, upload validation and blank-canvas
 * detection. `SignaturePad.tsx` owns the React/canvas wiring and delegates the
 * decisions to this module.
 */

export interface Point {
  x: number;
  y: number;
}

export interface StrokeState {
  isDown: boolean;
  start: Point | null;
  last: Point | null;
  hasStroked: boolean;
}

/** Minimum cumulative movement (CSS px) before a press becomes a real stroke. */
export const STROKE_MIN_DISTANCE_PX = 2.5;

export const MAX_UPLOAD_SIZE_BYTES = 2 * 1024 * 1024; // 2MB

export const ALLOWED_UPLOAD_MIME_TYPES: readonly string[] = [
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
];

/** A canvas with fewer opaque pixels than this is treated as unsigned. */
export const MIN_INK_PIXELS = 24;

export function createStrokeState(): StrokeState {
  return { isDown: false, start: null, last: null, hasStroked: false };
}

export function beginStroke(_state: StrokeState, point: Point): StrokeState {
  const origin: Point = { x: point.x, y: point.y };
  return { isDown: true, start: origin, last: origin, hasStroked: false };
}

/**
 * Advance an in-progress stroke. Returns a drawable segment exactly once the
 * pointer has moved further than `threshold` from the press origin; from then on
 * every call returns a segment from the previous point to the current one.
 *
 * A press that never moves therefore never produces a segment (no accidental
 * signature from a click or tap).
 */
export function continueStroke(
  state: StrokeState,
  point: Point,
  threshold: number = STROKE_MIN_DISTANCE_PX,
): { state: StrokeState; segment: { from: Point; to: Point } | null } {
  if (!state.isDown || !state.start) {
    return { state, segment: null };
  }

  if (!state.hasStroked) {
    const distance = Math.hypot(
      point.x - state.start.x,
      point.y - state.start.y,
    );
    if (distance < threshold) {
      return { state, segment: null };
    }
    return {
      state: { ...state, hasStroked: true, last: { x: point.x, y: point.y } },
      segment: { from: state.start, to: { x: point.x, y: point.y } },
    };
  }

  const from = state.last ?? state.start;
  return {
    state: { ...state, last: { x: point.x, y: point.y } },
    segment: { from, to: { x: point.x, y: point.y } },
  };
}

/** Reset drawing state (pointer up, pointer cancel, lost capture, tab switch). */
export function endStroke(_state: StrokeState): StrokeState {
  return createStrokeState();
}

/**
 * Map a client (viewport) coordinate to the canvas CSS coordinate space.
 *
 * The canvas `rect` is whatever the browser laid out; `canvasCssWidth/Height`
 * are the logical drawing size the 2D context uses after the device-pixel-ratio
 * transform. These differ when the element is styled, so the delta has to be
 * scaled — otherwise strokes land away from the pointer.
 */
export function mapClientToCanvasPoint(
  clientX: number,
  clientY: number,
  rect: { left: number; top: number; width: number; height: number },
  canvasCssWidth: number,
  canvasCssHeight: number,
): Point {
  const scaleX = rect.width > 0 ? canvasCssWidth / rect.width : 1;
  const scaleY = rect.height > 0 ? canvasCssHeight / rect.height : 1;
  return {
    x: (clientX - rect.left) * scaleX,
    y: (clientY - rect.top) * scaleY,
  };
}

/**
 * Validate an uploaded signature image. Type is accepted on MIME **or**
 * extension (some browsers/OSes report an empty `type`), and the 2MB ceiling
 * mirrors the backend limit.
 */
export function validateSignatureUpload(file: {
  name: string;
  type: string;
  size: number;
}): { ok: true } | { ok: false; error: string } {
  const fileType = (file.type || "").toLowerCase();
  const hasValidExtension = /\.(png|jpe?g|webp)$/i.test(file.name);

  if (!ALLOWED_UPLOAD_MIME_TYPES.includes(fileType) && !hasValidExtension) {
    return {
      ok: false,
      error: "Invalid file type. Please upload a PNG, JPEG, or WebP image.",
    };
  }

  if (file.size > MAX_UPLOAD_SIZE_BYTES) {
    return {
      ok: false,
      error: `File is too large (${(file.size / (1024 * 1024)).toFixed(2)} MB). Maximum allowed size is 2MB.`,
    };
  }

  return { ok: true };
}

/**
 * Count pixels that carry visible ink, given RGBA image data (stride 4). A blank
 * canvas is fully transparent, so alpha is the right signal.
 */
export function countInkPixels(
  data: Uint8ClampedArray,
  alphaThreshold: number = 8,
): number {
  let count = 0;
  for (let i = 3; i < data.length; i += 4) {
    if ((data[i] ?? 0) > alphaThreshold) {
      count += 1;
    }
  }
  return count;
}

export function isSignatureBlank(inkPixelCount: number): boolean {
  return inkPixelCount < MIN_INK_PIXELS;
}
