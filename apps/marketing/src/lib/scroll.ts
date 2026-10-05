import type Lenis from "lenis";

/** Shared handle so any component can drive the global smooth-scroller. */
export const lenisRef: { current: Lenis | null } = { current: null };

export function scrollToTarget(target: string | number) {
  const lenis = lenisRef.current;
  if (lenis) {
    lenis.scrollTo(target, {
      // keeps the heading clear of the floating nav on phones
      offset: typeof target === "string" ? -24 : 0,
      duration: 1.6,
      easing: (t: number) => 1 - Math.pow(1 - t, 4),
    });
  } else if (typeof target === "string") {
    document.querySelector(target)?.scrollIntoView({ behavior: "smooth" });
  } else {
    window.scrollTo({ top: target, behavior: "smooth" });
  }
}
