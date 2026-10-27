"use client";

import styles from "./layout.module.css";
import Link from "next/link";
import { useEffect, useState, useRef } from "react";
import { usePathname } from "next/navigation";
import { SITE_URL, signOutEverywhere, toSite } from "./lib/site";

interface UserData {
  id: string;
  email: string;
  name: string;
  role: string;
  enrolledPrograms?: { batchName: string; programTitle: string }[];
}

// Crisp inline SVGs for the sidebar icons matching the reference design
const Icons = {
  Dashboard: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
      <polyline points="9 22 9 12 15 12 15 22"></polyline>
    </svg>
  ),
  Courses: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path>
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path>
    </svg>
  ),
  Notes: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
      <polyline points="14 2 14 8 20 8"></polyline>
      <line x1="16" y1="13" x2="8" y2="13"></line>
      <line x1="16" y1="17" x2="8" y2="17"></line>
      <polyline points="10 9 9 9 8 9"></polyline>
    </svg>
  ),
  Sessions: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
      <line x1="16" y1="2" x2="16" y2="6"></line>
      <line x1="8" y1="2" x2="8" y2="6"></line>
      <line x1="3" y1="10" x2="21" y2="10"></line>
    </svg>
  ),
  Attendance: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 11l3 3L22 4"></path>
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path>
    </svg>
  ),
  Coaching: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
      <circle cx="9" cy="7" r="4"></circle>
      <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
      <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
    </svg>
  ),
  Mission: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"></path>
    </svg>
  ),
  Certificates: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="7"></circle>
      <polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"></polyline>
    </svg>
  ),
  Events: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"></path>
      <path d="M13 5v2"></path>
      <path d="M13 17v2"></path>
      <path d="M13 11v2"></path>
    </svg>
  ),
  Logout: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
      <polyline points="16 17 21 12 16 7"></polyline>
      <line x1="21" y1="12" x2="9" y2="12"></line>
    </svg>
  ),
  Chevron: () => (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9"></polyline>
    </svg>
  ),
  Close: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  ),
};

export default function LmsSidebar() {
  const pathname = usePathname();
  const [user, setUser] = useState<UserData | null>(null);
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);


  useEffect(() => {
    const storedUser = localStorage.getItem("user");
    if (storedUser) {
      try {
        setUser(JSON.parse(storedUser));
      } catch {
        localStorage.removeItem("user");
      }
    } else {
      setUser(null);
    }

    const token = localStorage.getItem("token");
    if (token) {
      fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000"}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data?.user) {
            setUser(data.user);
            localStorage.setItem("user", JSON.stringify(data.user));
          } else if (data?.id) {
            setUser(data);
            localStorage.setItem("user", JSON.stringify(data));
          }
        })
        .catch(() => {});
    }
  }, [pathname]);



  // Reset modal state on route change
  useEffect(() => {
    setShowSignOutConfirm(false);
    setIsLoggingOut(false);
    setLogoutError(null);
  }, [pathname]);

  // Listen to open-signout-modal event dispatched from topbar or profile page
  useEffect(() => {
    const handleOpen = () => {
      setLogoutError(null);
      setShowSignOutConfirm(true);
    };
    window.addEventListener("wbm:open-signout-modal", handleOpen);
    return () => window.removeEventListener("wbm:open-signout-modal", handleOpen);
  }, []);

  // Escape key handler to close dialog
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && showSignOutConfirm && !isLoggingOut) {
        setShowSignOutConfirm(false);
        setLogoutError(null);
      }
    };
    if (showSignOutConfirm) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [showSignOutConfirm, isLoggingOut]);

  const openSignOutConfirm = () => {
    setLogoutError(null);
    setShowSignOutConfirm(true);
  };

  const closeSignOutConfirm = () => {
    if (isLoggingOut) return;
    setShowSignOutConfirm(false);
    setLogoutError(null);
  };

  const handleConfirmSignOut = async () => {
    if (isLoggingOut) return;
    try {
      setIsLoggingOut(true);
      setLogoutError(null);
      signOutEverywhere();
    } catch (err) {
      setIsLoggingOut(false);
      setLogoutError(err instanceof Error ? err.message : "Failed to sign out. Please try again.");
    }
  };

  const isFocusedEnrollment =
    pathname === "/agreement" ||
    pathname.startsWith("/agreement") ||
    pathname.startsWith("/agreements") ||
    pathname === "/checkout" ||
    pathname.startsWith("/checkout");

  if (pathname === "/login" || pathname === "/signup" || pathname === "/sso" || isFocusedEnrollment) {
    return null;
  }

  const displayName = (user?.name ? user.name.split(" ")[0] : null) || "sahyadri";
  const initial = (displayName.charAt(0) || "S").toUpperCase();

  // Mobile Bottom Tab Bar
  const mobileTabs = [
    { href: "/", label: "Home", icon: <Icons.Dashboard />, active: pathname === "/" },
    { href: "/courses", label: "Courses", icon: <Icons.Courses />, active: pathname === "/courses" || pathname.startsWith("/programs") || pathname.startsWith("/steps") },
    { href: "/notes", label: "Notes", icon: <Icons.Notes />, active: pathname === "/notes" },
    { href: "/profile", label: "Profile", icon: <Icons.Chevron />, active: pathname === "/profile" },
  ];

  return (
    <>
      {/* Mobile Tab Bar */}
      <nav className={styles.tabBar} aria-label="Main Navigation">
        {mobileTabs.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={tab.active ? "page" : undefined}
            className={`${styles.tab} ${tab.active ? styles.tabActive : ""}`}
          >
            {tab.icon}
            <span>{tab.label}</span>
          </Link>
        ))}
      </nav>

      {/* Desktop Left Sidebar (240px Fixed) */}
      <aside className={styles.sidebar}>
        {/* 1. Top Brand Logo: whatboutme with warm orange heart */}
        <div className={styles.logo}>
          <Link href="/" className={styles.brandLink} aria-label="WhatBoutMe Learner Portal">
            <div className={styles.brandLogoWrap}>
              <span className={styles.brandWordmark}>whatboutme</span>
              <span className={styles.brandHeart}>🧡</span>
            </div>
          </Link>
        </div>

        {/* 2. Integrated Profile / Avatar Section with direct link to /profile */}
        <div style={{ position: "relative", width: "100%" }}>
          <Link
            href="/profile"
            className={`${styles.userProfile} ${pathname === "/profile" ? styles.userProfileActive : ""}`}
            title="My Profile"
          >
            <div className={styles.avatarWrap}>
              <div className={styles.avatar}>
                {initial}
              </div>
              <div className={styles.avatarMark} title="Verified learner">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
            </div>

            <div className={styles.userInfo}>
              <h4 className={styles.userNameRow}>
                <span>{displayName}</span>
              </h4>
              <span className={styles.userProfileSubtext}>My Profile</span>
            </div>
          </Link>
        </div>

        {/* 3. Navigation List (My Profile is deliberately excluded per Rule 2) */}
        <nav className={styles.navMenu} aria-label="Learner Navigation">
          {/* GROUP: LEARNING */}
          <div className={styles.navGroup}>
            <p className={styles.navTitle}>LEARNING</p>

            <Link
              href="/"
              className={`${styles.navItem} ${pathname === "/" ? styles.active : ""}`}
            >
              <Icons.Dashboard />
              <span>Dashboard</span>
            </Link>

            <Link
              href="/courses"
              className={`${styles.navItem} ${pathname === "/courses" || pathname.startsWith("/programs") || pathname.startsWith("/steps") ? styles.active : ""}`}
            >
              <Icons.Courses />
              <span>My Courses</span>
            </Link>

            <Link
              href="/notes"
              className={`${styles.navItem} ${pathname === "/notes" || pathname.startsWith("/notes/") ? styles.active : ""}`}
            >
              <Icons.Notes />
              <span>My Notes</span>
            </Link>

            <Link
              href="/live"
              className={`${styles.navItem} ${pathname === "/live" || pathname.startsWith("/live/") ? styles.active : ""}`}
            >
              <Icons.Sessions />
              <span>Live Sessions</span>
            </Link>

            <Link
              href="/attendance"
              className={`${styles.navItem} ${pathname === "/attendance" ? styles.active : ""}`}
            >
              <Icons.Attendance />
              <span>Attendance</span>
            </Link>

            <Link
              href="/certificates"
              className={`${styles.navItem} ${pathname === "/certificates" || pathname.startsWith("/certificates/") ? styles.active : ""}`}
            >
              <Icons.Certificates />
              <span>Certificates</span>
            </Link>
          </div>

          {/* GROUP: COMMUNITY */}
          <div className={styles.navGroup}>
            <p className={styles.navTitle}>COMMUNITY</p>

            <Link
              href="/events"
              className={`${styles.navItem} ${pathname === "/events" || pathname.startsWith("/events/") ? styles.active : ""}`}
            >
              <Icons.Events />
              <span>Events</span>
            </Link>
          </div>

          {/* GROUP: WEBSITE / FOOTER */}
          <div className={styles.navGroup} style={{ marginTop: "auto" }}>
            <div className={styles.navDivider} />
            <p className={styles.navTitle} style={{ marginTop: "0.2rem" }}>WEBSITE</p>

            <button
              type="button"
              className={styles.sidebarSignOutBtn}
              onClick={openSignOutConfirm}
              aria-label="Sign out"
            >
              <span className={styles.sidebarSignOutIcon}>
                <Icons.Logout />
              </span>
              <span className={styles.sidebarSignOutLabel}>Sign Out</span>
            </button>
          </div>
        </nav>
      </aside>

      {/* Sign Out Confirmation Modal */}
      {showSignOutConfirm && (
        <div
          className={styles.confirmModalOverlay}
          onClick={closeSignOutConfirm}
          role="dialog"
          aria-modal="true"
          aria-labelledby="signout-dialog-title"
        >
          <div
            className={styles.confirmModalCard}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.confirmModalHeader}>
              <div className={styles.confirmIconWrap}>
                <Icons.Logout />
              </div>
              <div className={styles.confirmHeaderText}>
                <h3 id="signout-dialog-title" className={styles.confirmModalTitle}>
                  Sign out of WhatBoutMe?
                </h3>
                <p className={styles.confirmModalSubtitle}>
                  You are currently signed in as <strong>{displayName}</strong>.
                </p>
              </div>
              <button
                type="button"
                className={styles.confirmModalCloseBtn}
                onClick={closeSignOutConfirm}
                disabled={isLoggingOut}
                aria-label="Close"
              >
                <Icons.Close />
              </button>
            </div>

            {logoutError && (
              <div className={styles.confirmModalAlert} role="alert">
                <span>{logoutError}</span>
              </div>
            )}

            <div className={styles.confirmModalBody}>
              <p className={styles.confirmModalBodyText}>
                Your progress, active module position, and study notes are automatically saved to your account.
              </p>
            </div>

            <div className={styles.confirmModalActions}>
              <button
                type="button"
                className={styles.confirmCancelBtn}
                onClick={closeSignOutConfirm}
                disabled={isLoggingOut}
              >
                Stay Signed In
              </button>
              <button
                type="button"
                className={styles.confirmDangerBtn}
                onClick={handleConfirmSignOut}
                disabled={isLoggingOut}
              >
                {isLoggingOut ? "Signing Out..." : "Sign Out"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
