"use client";

import { useEffect } from "react";
import Lenis from "lenis";
import { lenisRef } from "@/lib/scroll";

export default function SmoothScroll() {
  useEffect(() => {
    // native scrolling for anyone who asked for less motion
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const lenis = new Lenis({
      lerp: 0.09,
      wheelMultiplier: 1,
      touchMultiplier: 1,
    });
    lenisRef.current = lenis;

    let rafId = 0;
    const loop = (time: number) => {
      lenis.raf(time);
      rafId = requestAnimationFrame(loop);
    };
    rafId = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafId);
      lenis.destroy();
      lenisRef.current = null;
    };
  }, []);

  return null;
}
