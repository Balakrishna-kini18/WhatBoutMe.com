"use client";

import React from "react";
import styles from "./HelpTooltip.module.css";

interface HelpTooltipProps {
  text: React.ReactNode;
  align?: "left" | "right";
  ariaLabel?: string;
}

export default function HelpTooltip({
  text,
  align = "left",
  ariaLabel = "More information",
}: HelpTooltipProps) {
  return (
    <div className={`${styles.helpTooltip} ${align === "right" ? styles.helpTooltipRight : styles.helpTooltipLeft}`}>
      <span
        className={styles.helpIcon}
        aria-label={ariaLabel}
        tabIndex={0}
        role="button"
      >
        ?
      </span>
      <div className={styles.helpTooltipContent} role="tooltip">
        {text}
      </div>
    </div>
  );
}
