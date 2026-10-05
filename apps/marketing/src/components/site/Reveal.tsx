"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Fades content up once as it scrolls into view.
 *
 * The server sends the content visible. Only after this component is running
 * in the browser does it hide what is still below the screen and reveal it on
 * scroll. So a slow phone, or a page whose scripts have not loaded yet, shows
 * the content instead of a blank gap.
 */
export default function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"static" | "hidden" | "shown">("static");

  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // Phones: no scroll fade at all. Sections and cards are simply there, as
    // in an app; half-faded cards while scrolling read as washed out.
    if (window.innerWidth < 640) return;
    const rect = el.getBoundingClientRect();
    // already on screen (or scrolled past): leave it alone, no flash
    if (rect.top < window.innerHeight - 60) return;
    // off to the side in a swipe row: it would stay faded until swiped to
    if (rect.left >= window.innerWidth || rect.right <= 0) return;

    setState("hidden");
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        setState("shown");
        observer.disconnect();
      },
      { rootMargin: "0px 0px -60px 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={className}
      style={
        state === "static"
          ? undefined
          : {
              opacity: state === "hidden" ? 0 : 1,
              transform: state === "hidden" ? "translateY(20px)" : "none",
              willChange: state === "hidden" ? "opacity, transform" : undefined,
              transition: `opacity 0.7s cubic-bezier(0.16, 1, 0.3, 1) ${delay}s, transform 0.7s cubic-bezier(0.16, 1, 0.3, 1) ${delay}s`,
            }
      }
    >
      {children}
    </div>
  );
}
