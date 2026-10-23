"use client";

import React, { useState } from "react";
import Link from "next/link";
import styles from "./simulator.module.css";
import LearnerPortalFlow, { LearnerStepView, StepModule } from "../components/LearnerPortalFlow";

export default function SimulatorPage() {
  const [activeSidebarItem, setActiveSidebarItem] = useState<string>("MY_COURSES");
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [shellToast, setShellToast] = useState<string | null>(null);

  // 6-Step Navigation State Machine
  const [learningStep, setLearningStep] = useState<LearnerStepView>("MODULE_PAGE");
  const [selectedModuleId, setSelectedModuleId] = useState<string>("step-alex-1");
  const [selectedLessonId, setSelectedLessonId] = useState<string>("les-alex-1");
  const [activeQuizQuestionIndex, setActiveQuizQuestionIndex] = useState<number>(0);

  const triggerToast = (msg: string) => {
    setShellToast(msg);
    setTimeout(() => setShellToast(null), 3500);
  };

  // Helper transitions
  const goToModulePage = (moduleId?: string) => {
    if (moduleId) setSelectedModuleId(moduleId);
    setLearningStep("MODULE_PAGE");
    setActiveSidebarItem("MY_COURSES");
  };

  const goToNotesPage = (moduleId?: string, lessonId?: string) => {
    if (moduleId) setSelectedModuleId(moduleId);
    if (lessonId) setSelectedLessonId(lessonId);
    setLearningStep("NOTES_PAGE");
    setActiveSidebarItem("MY_NOTES");
  };

  const sampleModules: StepModule[] = [
    {
      id: "step-alex-1",
      sequence: 1,
      title: "Foundations of Emotional Intelligence & Stress Response",
      description: "Master the foundational emotional self-regulation techniques and trigger mapping methodologies required for modern executive leadership.",
      status: "In progress",
      lessons: [
        {
          id: "les-alex-1",
          title: "Foundations of Mindful Leadership & Emotional Baselines",
          type: "VIDEO",
          mediaUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
          durationSec: 492,
          durationFormatted: "08:12",
          status: "Completed",
        },
        {
          id: "les-alex-2",
          title: "Core Mindset Shift: The Emotional Response Matrix",
          type: "VIDEO",
          mediaUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
          durationSec: 860,
          durationFormatted: "14:20",
          status: "In progress",
        },
        {
          id: "les-alex-3v",
          title: "Advanced Somatic Regulation & Crisis De-escalation",
          type: "VIDEO",
          mediaUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
          durationSec: 705,
          durationFormatted: "11:45",
          status: "Locked",
        },
        {
          id: "les-alex-3",
          title: "Executive Leadership Framework & Trigger Mapping Worksheet",
          type: "PDF",
          mediaUrl: "/docs/Executive_Leadership_Matrix.pdf",
          durationSec: 665,
          durationFormatted: "11:05",
          status: "Locked",
        },
        {
          id: "les-alex-4",
          title: "Module 1 Mastery Knowledge Check Assessment",
          type: "QUIZ",
          mediaUrl: "",
          durationSec: 900,
          durationFormatted: "15:00",
          status: "Locked",
        },
      ],
      quiz: {
        id: "quiz-alex-1",
        title: "Module 1 Knowledge Check Assessment",
        passMark: 75,
        quizPlacement: "AFTER_VIDEO",
      },
    },
    {
      id: "step-alex-2",
      sequence: 2,
      title: "Strategic Influence & High-Stakes Communication",
      description: "Navigating complex stakeholder dynamics with structured persuasion.",
      status: "Completed",
      lessons: [
        {
          id: "les-alex-2-1",
          title: "Persuasive Architecture: High-Stakes Stakeholder Alignment",
          type: "VIDEO",
          mediaUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
          durationSec: 540,
          durationFormatted: "09:00",
          status: "Completed",
        },
        {
          id: "les-alex-2-2",
          title: "Cognitive Perspective Taking in Multi-Party Negotiations",
          type: "VIDEO",
          mediaUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
          durationSec: 672,
          durationFormatted: "11:12",
          status: "Completed",
        },
        {
          id: "les-alex-2-3",
          title: "Stakeholder Alignment & Executive Synthesis Playbook",
          type: "PDF",
          mediaUrl: "/docs/Executive_Leadership_Matrix.pdf",
          durationSec: null,
          durationFormatted: "07:30",
          status: "Completed",
        },
        {
          id: "les-alex-2-4",
          title: "Strategic Communication Practical Evaluation",
          type: "QUIZ",
          mediaUrl: "",
          durationSec: null,
          durationFormatted: "12:00",
          status: "Completed",
        },
      ],
    },
    {
      id: "step-alex-3",
      sequence: 3,
      title: "Executive Presence & Organizational Culture",
      description: "Instilling psychological safety and high-performance norms across cross-functional teams.",
      status: "Completed",
      lessons: [
        {
          id: "les-alex-3-1",
          title: "The Anatomy of Executive Gravitas & Vocal Presence",
          type: "VIDEO",
          mediaUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
          durationSec: 615,
          durationFormatted: "10:15",
          status: "Completed",
        },
        {
          id: "les-alex-3-2",
          title: "Cultivating Psychological Safety in Cross-Functional Teams",
          type: "VIDEO",
          mediaUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
          durationSec: 790,
          durationFormatted: "13:10",
          status: "Completed",
        },
        {
          id: "les-alex-3-3",
          title: "Culture Diagnostics & Behavioral Scorecard",
          type: "PDF",
          mediaUrl: "/docs/Executive_Leadership_Matrix.pdf",
          durationSec: null,
          durationFormatted: "08:45",
          status: "Completed",
        },
        {
          id: "les-alex-3-4",
          title: "Executive Presence Competency Evaluation",
          type: "QUIZ",
          mediaUrl: "",
          durationSec: null,
          durationFormatted: "10:00",
          status: "Completed",
        },
      ],
    },
  ];

  const currentModule: StepModule =
    sampleModules.find((m) => m.id === selectedModuleId) || sampleModules[0]!;

  return (
    <div className={styles.portalShell}>
      {/* Mobile Backdrop */}
      {isMobileSidebarOpen && (
        <div
          className={styles.sidebarBackdrop}
          onClick={() => setIsMobileSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* 240px Fixed Left Sidebar */}
      <aside
        className={`${styles.portalSidebar} ${isMobileSidebarOpen ? styles.portalSidebarOpen : ""}`}
        aria-label="Learner Portal Sidebar"
      >
        {/* Top Brand */}
        <div className={styles.sidebarBrand}>
          <div className={styles.brandLogoGroup}>
            <svg className={styles.brandHeartIcon} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
            </svg>
            <span className={styles.brandText}>whatboutme</span>
          </div>
          <span className={styles.brandLmsBadge}>LMS</span>
        </div>

        {/* Learner Profile Summary */}
        <div className={styles.learnerProfileSummary}>
          <div className={styles.profileAvatar} aria-hidden="true">
            R
          </div>
          <div className={styles.profileInfo}>
            <span className={styles.profileName}>Roweena Foxwel</span>
            <span className={styles.profileCohort}>Sigma 1 - Cohort 1</span>
          </div>
        </div>

        {/* Navigation Links */}
        <nav className={styles.sidebarNav} aria-label="Main Navigation">
          <div className={styles.navSectionGroup}>
            <span className={styles.navSectionTitle}>Learning</span>

            <button
              type="button"
              onClick={() => {
                setActiveSidebarItem("DASHBOARD");
                goToModulePage("step-alex-1");
                setIsMobileSidebarOpen(false);
              }}
              className={`${styles.navLinkItem} ${activeSidebarItem === "DASHBOARD" ? styles.navLinkItemActive : ""}`}
            >
              <svg className={styles.navLinkIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect width="7" height="9" x="3" y="3" rx="1" />
                <rect width="7" height="5" x="14" y="3" rx="1" />
                <rect width="7" height="9" x="14" y="12" rx="1" />
                <rect width="7" height="5" x="3" y="16" rx="1" />
              </svg>
              <span>Dashboard</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveSidebarItem("MY_COURSES");
                goToModulePage("step-alex-1");
                setIsMobileSidebarOpen(false);
              }}
              className={`${styles.navLinkItem} ${activeSidebarItem === "MY_COURSES" ? styles.navLinkItemActive : ""}`}
            >
              <svg className={styles.navLinkIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z" />
                <path d="M6 6h10" />
                <path d="M6 10h10" />
              </svg>
              <span>My Courses</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveSidebarItem("MY_NOTES");
                goToNotesPage("step-alex-1", "les-alex-1");
                setIsMobileSidebarOpen(false);
              }}
              className={`${styles.navLinkItem} ${activeSidebarItem === "MY_NOTES" ? styles.navLinkItemActive : ""}`}
            >
              <svg className={styles.navLinkIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
              </svg>
              <span>My Notes</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveSidebarItem("LIVE_SESSIONS");
                triggerToast("Live Sessions: Cohort 1 interactive workshop meets Saturday at 10:00 AM GST via Zoom.");
                setIsMobileSidebarOpen(false);
              }}
              className={`${styles.navLinkItem} ${activeSidebarItem === "LIVE_SESSIONS" ? styles.navLinkItemActive : ""}`}
            >
              <svg className={styles.navLinkIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.934a.5.5 0 0 0-.777-.416L16 11" />
                <rect width="14" height="12" x="2" y="6" rx="2" />
              </svg>
              <span>Live Sessions</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveSidebarItem("CERTIFICATES");
                triggerToast("Certificates: Complete all required steps to unlock your official CPD accreditation certificate.");
                setIsMobileSidebarOpen(false);
              }}
              className={`${styles.navLinkItem} ${activeSidebarItem === "CERTIFICATES" ? styles.navLinkItemActive : ""}`}
            >
              <svg className={styles.navLinkIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="8" r="6" />
                <path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11" />
              </svg>
              <span>Certificates</span>
            </button>
          </div>

          <div className={styles.navSectionGroup}>
            <span className={styles.navSectionTitle}>Community</span>

            <button
              type="button"
              onClick={() => {
                setActiveSidebarItem("MESSAGES");
                triggerToast("Cohort Messages: 1 unread announcement from instructor Roweena Foxwel.");
                setIsMobileSidebarOpen(false);
              }}
              className={`${styles.navLinkItem} ${activeSidebarItem === "MESSAGES" ? styles.navLinkItemActive : ""}`}
            >
              <svg className={styles.navLinkIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
              </svg>
              <span>Messages</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveSidebarItem("MY_PROFILE");
                triggerToast("Profile: Roweena Foxwel (roweena@whatboutme.com)");
                setIsMobileSidebarOpen(false);
              }}
              className={`${styles.navLinkItem} ${activeSidebarItem === "MY_PROFILE" ? styles.navLinkItemActive : ""}`}
            >
              <svg className={styles.navLinkIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
              <span>My Profile</span>
            </button>
          </div>

          <div className={styles.navSectionGroup}>
            <span className={styles.navSectionTitle}>Website</span>

            <Link
              href="/programs"
              className={styles.navLinkItem}
              onClick={() => setIsMobileSidebarOpen(false)}
            >
              <svg className={styles.navLinkIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <path d="m4.93 4.93 4.24 4.24" />
                <path d="m14.83 9.17 4.24-4.24" />
                <path d="m14.83 14.83 4.24 4.24" />
                <path d="m9.17 14.83-4.24 4.24" />
              </svg>
              <span>Explore Courses</span>
            </Link>
          </div>
        </nav>

        <div className={styles.sidebarFooter}>
          <button
            type="button"
            onClick={() => {
              triggerToast("Session reset.");
            }}
            className={styles.signOutBtn}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Portal Main */}
      <div className={styles.portalMain}>
        {/* Top Header Bar */}
        <header className={styles.portalTopHeader}>
          <div className={styles.headerLeftCluster}>
            <button
              type="button"
              className={styles.hamburgerBtn}
              onClick={() => setIsMobileSidebarOpen(!isMobileSidebarOpen)}
              aria-label="Toggle Navigation Sidebar"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>

            <div className={styles.headerSearchBar}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#a8a29e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.3-4.3" />
              </svg>
              <input
                type="text"
                className={styles.headerSearchInput}
                placeholder="Search your courses..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                aria-label="Search your courses"
              />
            </div>
          </div>

          <div className={styles.headerRightCluster}>
            {/* Notification Bell */}
            <button
              type="button"
              className={styles.headerIconBtn}
              aria-label="2 unread notifications"
              onClick={() => triggerToast("Notifications: 1 new lesson unlocked • 1 live session reminder")}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
                <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
              </svg>
              <span className={styles.notificationBadge}>2</span>
            </button>

            {/* User Avatar */}
            <div
              className={styles.headerUserMenuBtn}
              onClick={() => triggerToast("Signed in as Roweena Foxwel (Sigma 1)")}
              role="button"
              tabIndex={0}
            >
              <span className={styles.headerAvatarMini}>
                R
              </span>
              <span className={styles.headerUserName}>
                Roweena Foxwel
              </span>
            </div>
          </div>
        </header>

        {/* Content Area */}
        <main className={styles.portalContentArea}>
          <LearnerPortalFlow
            module={currentModule}
            allModules={sampleModules}
            courseTitle="Executive Leadership & Emotional Mastery (CPD 25h)"
            cohortName="Sigma 1 — Cohort 1"
            totalStepsCount={12}
            completedStepsCount={3}
            overallProgressPercentage={25}
            learnerName="Roweena Foxwel"
            learnerEmail="roweena@whatboutme.com"
            learningStep={learningStep}
            onStepChange={(st) => {
              setLearningStep(st);
              if (st === "NOTES_PAGE") setActiveSidebarItem("MY_NOTES");
              else setActiveSidebarItem("MY_COURSES");
            }}
            selectedModuleId={selectedModuleId}
            onModuleSelect={(mId) => setSelectedModuleId(mId)}
            selectedLessonId={selectedLessonId}
            onLessonSelect={(lId) => setSelectedLessonId(lId)}
            activeQuizQuestionIndex={activeQuizQuestionIndex}
            onQuizQuestionIndexChange={(idx) => setActiveQuizQuestionIndex(idx)}
            onBackToEdit={() => goToModulePage("step-alex-1")}
            onNextModule={() => {
              setSelectedModuleId("step-alex-2");
              setLearningStep("MODULE_PAGE");
              triggerToast("Step 2 Unlocked: Strategic Influence & High-Stakes Communication!");
            }}
          />
        </main>
      </div>

      {/* Toast */}
      {shellToast && (
        <div className={styles.shellToastBanner} role="status" aria-live="polite">
          <span>{shellToast}</span>
        </div>
      )}
    </div>
  );
}
