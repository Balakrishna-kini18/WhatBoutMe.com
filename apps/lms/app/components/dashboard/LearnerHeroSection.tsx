"use client";

import React from "react";
import styles from "../../page.module.css";
import HeroGreetingBlock from "./HeroGreetingBlock";
import HeroBannerVisual from "./HeroBannerVisual";
import HeroQuoteCard from "./HeroQuoteCard";

export interface LearnerHeroSectionProps {
  name: string;
  activeCoursesCount: number;
  quoteText?: string;
  supportingText?: string;
  illustration?: React.ReactNode;
  className?: string;
}

export default function LearnerHeroSection({
  name,
  activeCoursesCount,
  quoteText = "Small steps every day lead to big results.",
  supportingText,
  illustration,
  className,
}: LearnerHeroSectionProps) {
  return (
    <section
      className={`${styles.topGreetingBar} ${className || ""}`.trim()}
      aria-label="Welcome greeting"
    >
      <div className={styles.heroTopRow}>
        <HeroGreetingBlock
          name={name}
          activeCoursesCount={activeCoursesCount}
          supportingText={supportingText}
        />
        <div className={styles.heroVisualCol}>
          {illustration || <HeroBannerVisual priority />}
        </div>
      </div>

        <div className={styles.heroBottomRow}>
          <HeroQuoteCard quote={quoteText} />
        </div>
    </section>
  );
}

export { default as HeroGreetingBlock } from "./HeroGreetingBlock";
export { default as HeroBannerVisual } from "./HeroBannerVisual";
export { default as HeroQuoteCard } from "./HeroQuoteCard";
