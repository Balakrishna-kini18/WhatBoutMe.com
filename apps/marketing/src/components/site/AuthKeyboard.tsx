"use client";

import { useEffect } from "react";

const FIELD = "input, textarea, select, [contenteditable='true']";

/**
 * Phones and tablets: while a field has focus, marks the page as typing (the
 * sign-in layout then folds its picture header away so the form moves up), and
 * once the keyboard has opened keeps the focused field in view above it.
 * Renders nothing.
 */
export default function AuthKeyboard() {
  useEffect(() => {
    const small = window.matchMedia("(max-width: 1023px)");
    const root = document.documentElement;
    let field: HTMLElement | null = null;
    let leaveTimer = 0;

    const reveal = () => {
      if (!field) return;
      field.scrollIntoView({ block: "center", behavior: "smooth" });
    };

    const onFocusIn = (e: FocusEvent) => {
      const target = e.target as HTMLElement | null;
      if (!small.matches || !target?.matches(FIELD)) return;
      window.clearTimeout(leaveTimer);
      field = target;
      root.dataset.typing = "";
      // the keyboard takes a moment to open; reveal again once it has
      window.setTimeout(reveal, 320);
    };

    const onFocusOut = (e: FocusEvent) => {
      // moving straight to another field keeps the typing layout (no jump)
      const next = e.relatedTarget as HTMLElement | null;
      if (next?.matches(FIELD)) return;
      // wait out the tap that moved focus (e.g. on Sign In), so the button
      // does not jump away from under the finger before its click lands
      leaveTimer = window.setTimeout(() => {
        if (document.activeElement?.matches(FIELD)) return;
        field = null;
        delete root.dataset.typing;
      }, 350);
    };

    const view = window.visualViewport;
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    view?.addEventListener("resize", reveal);
    return () => {
      window.clearTimeout(leaveTimer);
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
      view?.removeEventListener("resize", reveal);
      delete root.dataset.typing;
    };
  }, []);

  return null;
}
