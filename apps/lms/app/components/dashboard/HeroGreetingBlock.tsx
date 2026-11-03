"use client";

import React, { useEffect, useState } from "react";
import styles from "../../page.module.css";
import {
  getTimeOfDayGreeting,
  formatLearnerFirstName,
  formatSupportingCourseText,
} from "./heroLogic";

export {
  getTimeOfDayGreeting,
  formatLearnerFirstName,
  formatSupportingCourseText,
};

export interface HeroGreetingBlockProps {
  name: string;
  activeCoursesCount: number;
  supportingText?: string;
  className?: string;
}

export default function HeroGreetingBlock({
  name,
  activeCoursesCount,
  supportingText,
  className,
}: HeroGreetingBlockProps) {
  // Initialize with deterministic fallback, sync on mount to avoid hydration mismatch
  const [greetingText, setGreetingText] = useState("Good Morning");

  useEffect(() => {
    setGreetingText(getTimeOfDayGreeting(new Date()));
  }, []);

  const firstName = formatLearnerFirstName(name);
  const subtitle =
    supportingText ||
    `You have ${activeCoursesCount} active courses in progress — keep learning and build a better version of yourself every day.`;

  return (
    <div className={`${styles.greetingLeft} ${className || ""}`.trim()}>
      <div className={styles.greetingTitleWrap}>
        <span className={styles.greetingPrefix}>{greetingText},</span>
        <h1 className={styles.greetingTitle}>
          <span className={styles.greetingName}>{firstName}</span>{" "}
          <span className={styles.greetingWave} aria-hidden="true">
            👋
          </span>
        </h1>
      </div>
      <p className={styles.greetingSubtitle}>{subtitle}</p>
    </div >
  );
}
