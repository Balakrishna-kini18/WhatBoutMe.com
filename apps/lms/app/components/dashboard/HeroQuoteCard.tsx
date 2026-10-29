"use client";

import React from "react";
import styles from "../../page.module.css";

export interface HeroQuoteCardProps {
  quote?: string;
  className?: string;
}

export default function HeroQuoteCard({
  quote = "Small steps every day lead to big results.",
  className,
}: HeroQuoteCardProps) {
  return (
    <aside
      className={`${styles.floatingQuoteCard} ${className || ""}`.trim()}
      role="complementary"
      aria-label="Daily inspiration"
    >
      <p className={styles.floatingQuoteText}>&ldquo;{quote}&rdquo;</p>
      <div className={styles.floatingQuoteBar} aria-hidden="true" />
    </aside>
  );
}
