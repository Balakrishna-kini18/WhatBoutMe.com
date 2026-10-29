"use client";

import React from "react";
import styles from "../../page.module.css";

export interface HeroBannerVisualProps {
  alt?: string;
  className?: string;
  priority?: boolean;
}

export default function HeroBannerVisual({
  alt = "Open book with lush succulent plant and inspiration sparks",
  className,
  priority = true,
}: HeroBannerVisualProps) {
  return (
    <div
      className={`${styles.heroVisualWrap} ${className || ""}`.trim()}
      aria-hidden="true"
    >
      <picture>
        <source srcSet="/brand/hero-banner-visual.webp" type="image/webp" />
        <img
          src="/brand/hero-banner-visual.png"
          alt={alt}
          className={styles.heroVisualImg}
          width={675}
          height={340}
          loading={priority ? "eager" : "lazy"}
          decoding="async"
        />
      </picture>
    </div>
  );
}
