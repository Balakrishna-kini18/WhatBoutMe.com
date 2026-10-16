import { describe, it, expect } from "vitest";
import {
  createStrokeState,
  beginStroke,
  continueStroke,
  endStroke,
  mapClientToCanvasPoint,
  validateSignatureUpload,
  isSignatureBlank,
} from "./signaturePadLogic";

describe("stroke state machine", () => {
  it("a click with no movement produces no stroke", () => {
    let s = createStrokeState();
    s = beginStroke(s, { x: 10, y: 10 });
    const moved = continueStroke(s, { x: 10, y: 10 });
    expect(moved.segment).toBeNull();
    expect(moved.state.hasStroked).toBe(false);
    expect(endStroke(moved.state).hasStroked).toBe(false);
  });

  it("a real drag produces one segment that starts at the pointer origin", () => {
    let s = beginStroke(createStrokeState(), { x: 5, y: 5 });
    const r = continueStroke(s, { x: 40, y: 12 });
    expect(r.segment).toEqual({ from: { x: 5, y: 5 }, to: { x: 40, y: 12 } });
    expect(r.state.hasStroked).toBe(true);
  });

  it("endStroke fully resets drawing state", () => {
    const done = endStroke(beginStroke(createStrokeState(), { x: 1, y: 1 }));
    expect(done).toEqual({
      isDown: false,
      start: null,
      last: null,
      hasStroked: false,
    });
  });

  it("pointer cancellation resets drawing state", () => {
    const mid = continueStroke(
      beginStroke(createStrokeState(), { x: 0, y: 0 }),
      { x: 50, y: 0 },
    ).state;
    expect(endStroke(mid).isDown).toBe(false);
    expect(endStroke(mid).hasStroked).toBe(false);
  });
});

describe("mapClientToCanvasPoint", () => {
  it("accounts for CSS scaling of the canvas element", () => {
    const p = mapClientToCanvasPoint(
      120,
      60,
      { left: 20, top: 10, width: 200, height: 100 },
      400,
      200,
    );
    expect(p).toEqual({ x: 200, y: 100 });
  });
  it("is identity when CSS size matches the rect", () => {
    expect(
      mapClientToCanvasPoint(
        30,
        40,
        { left: 10, top: 10, width: 200, height: 100 },
        200,
        100,
      ),
    ).toEqual({ x: 20, y: 30 });
  });
});

describe("validateSignatureUpload", () => {
  it("accepts a small PNG", () => {
    expect(
      validateSignatureUpload({ name: "s.png", type: "image/png", size: 1000 }),
    ).toEqual({ ok: true });
  });
  it("rejects an unsupported type", () => {
    expect(
      validateSignatureUpload({ name: "s.txt", type: "text/plain", size: 100 })
        .ok,
    ).toBe(false);
  });
  it("rejects files over 2MB", () => {
    expect(
      validateSignatureUpload({
        name: "s.png",
        type: "image/png",
        size: 3 * 1024 * 1024,
      }).ok,
    ).toBe(false);
  });
});

describe("ink detection", () => {
  it("treats a canvas with fewer than the minimum ink pixels as blank", () => {
    expect(isSignatureBlank(0)).toBe(true);
    expect(isSignatureBlank(5)).toBe(true);
    expect(isSignatureBlank(500)).toBe(false);
  });
});
