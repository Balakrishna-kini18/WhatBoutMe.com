"use client";

import styles from "./layout.module.css";
import Link from "next/link";
import Image from "next/image";
import { useEffect, useState, useCallback } from "react";
import { usePathname } from "next/navigation";
import { signOutEverywhere } from "./lib/site";
import { API_URL } from "./lib/api";
import SidebarPromoCard from "./components/SidebarPromoCard";

interface UserData {
  id: string;
  email: string;
  name: string;
  role: string;
  enrolledPrograms?: { batchName: string; programTitle: string }[];
}

// Crisp inline SVGs matching the reference UI design exactly
const Icons = {
  Dashboard: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
      <polyline points="9 22 9 12 15 12 15 22"></polyline>
    </svg>
  ),
  Courses: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path>
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path>
    </svg>
  ),
  Notes: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
      <polyline points="14 2 14 8 20 8"></polyline>
      <line x1="16" y1="13" x2="8" y2="13"></line>
      <line x1="16" y1="17" x2="8" y2="17"></line>
      <polyline points="10 9 9 9 8 9"></polyline>
    </svg>
  ),
  Sessions: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
      <line x1="16" y1="2" x2="16" y2="6"></line>
      <line x1="8" y1="2" x2="8" y2="6"></line>
      <line x1="3" y1="10" x2="21" y2="10"></line>
    </svg>
  ),
  Attendance: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 11l3 3L22 4"></path>
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path>
    </svg>
  ),
  Certificates: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="8" r="7"></circle>
      <polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"></polyline>
    </svg>
  ),
  Events: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
      <circle cx="9" cy="7" r="4"></circle>
      <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
      <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
    </svg>
  ),
  User: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  ),
  Settings: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="3"></circle>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
    </svg>
  ),
  Logout: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
      <polyline points="16 17 21 12 16 7"></polyline>
      <line x1="21" y1="12" x2="9" y2="12"></line>
    </svg>
  ),
  ChevronDown: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="6 9 12 15 18 9"></polyline>
    </svg>
  ),
  CollapseLeft: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="15 18 9 12 15 6"></polyline>
    </svg>
  ),
  CollapseRight: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="9 18 15 12 9 6"></polyline>
    </svg>
  ),
  Close: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
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
  const [collapsed, setCollapsed] = useState(false);

  // Initialize collapsed preference from localStorage
  useEffect(() => {
    try {
      const savedCollapsed = localStorage.getItem("wbm_sidebar_collapsed") === "true";
      setCollapsed(savedCollapsed);
      if (savedCollapsed) {
        document.documentElement.setAttribute("data-sidebar-collapsed", "true");
      } else {
        document.documentElement.removeAttribute("data-sidebar-collapsed");
      }
    } catch {
      // Fallback silently if localStorage is restricted
    }
  }, []);

  const toggleSidebarCollapse = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("wbm_sidebar_collapsed", next ? "true" : "false");
        if (next) {
          document.documentElement.setAttribute("data-sidebar-collapsed", "true");
        } else {
          document.documentElement.removeAttribute("data-sidebar-collapsed");
        }
      } catch {
        // Fallback silently
      }
      return next;
    });
  }, []);

  // Sync user state from localStorage and backend
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
      fetch(`${API_URL}/auth/me`, {
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

  const displayName = (user?.name ? user.name.split(" ")[0] : null) || (user?.email ? user.email.split("@")[0] : null) || "Learner";
  const initial = (displayName.charAt(0) || "L").toUpperCase();

  // Mobile Bottom Tab Bar (shown only on viewport <= 900px)
  const mobileTabs = [
    { href: "/", label: "Home", icon: <Icons.Dashboard />, active: pathname === "/" },
    { href: "/courses", label: "Courses", icon: <Icons.Courses />, active: pathname === "/courses" || pathname.startsWith("/programs") || pathname.startsWith("/steps") },
    { href: "/notes", label: "Notes", icon: <Icons.Notes />, active: pathname === "/notes" || pathname.startsWith("/notes/") },
    { href: "/profile", label: "Profile", icon: <Icons.User />, active: pathname === "/profile" },
  ];

  return (
    <>
      {/* Mobile Tab Bar & Ambient Progressive Blur */}
      <div className={styles.bottomBlurFog} aria-hidden="true" />
      <nav className={styles.tabBar} aria-label="Main Navigation">
        {mobileTabs.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            prefetch={false}
            aria-current={tab.active ? "page" : undefined}
            className={`${styles.tab} ${tab.active ? styles.tabActive : ""}`}
          >
            <span className={styles.tabIconWrap} aria-hidden="true">{tab.icon}</span>
            <span className={styles.tabLabel}>{tab.label}</span>
          </Link>
        ))}
      </nav>

      {/* Desktop Left Sidebar */}
      <aside
        className={`${styles.sidebar} ${collapsed ? styles.sidebarCollapsed : ""}`}
        aria-label="Learner Navigation Sidebar"
      >
        {/* Zone 1: Centered Top Brand Logo Header */}
        <div className={styles.sidebarHeader}>
          {collapsed ? (
            <Link href="/" prefetch={false} className={styles.brandLinkCollapsed} aria-label="WhatBoutMe Home" title="WhatBoutMe">
              <span className={styles.brandHeartOnly} aria-hidden="true">🧡</span>
            </Link>
          ) : (
            <Link href="/" prefetch={false} className={styles.brandLink} aria-label="WhatBoutMe Learner Portal">
              <Image
                src="/brand/logo-dark.png"
                alt="whatboutme"
                width={146}
                height={20}
                priority
                className={styles.brandLogoImg}
              />
            </Link>
          )}

          <button
            type="button"
            onClick={toggleSidebarCollapse}
            className={styles.sidebarCollapseBtn}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <Icons.CollapseRight /> : <Icons.CollapseLeft />}
          </button>
        </div>

        {/* Zone 2: Learner Identity Profile Block */}
        <div className={styles.profileSection}>
          <Link
            href="/profile"
            prefetch={false}
            className={`${styles.userProfile} ${pathname === "/profile" ? styles.userProfileActive : ""}`}
            title={`Signed in as ${displayName} (Learner) — Click to view profile settings`}
          >
            <div className={styles.avatarWrap}>
              <div className={styles.avatar} aria-hidden="true">
                {initial}
              </div>
              <div className={styles.avatarMark} title="Verified learner">
                <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
            </div>

            {!collapsed && (
              <>
                <div className={styles.userInfo}>
                  <h4 className={styles.userNameRow}>
                    <span>{displayName}</span>
                  </h4>
                  <span className={styles.userProfileSubtext}>Learner</span>
                </div>

                <span className={styles.profileChevronDown} aria-hidden="true">
                  <Icons.ChevronDown />
                </span>
              </>
            )}
          </Link>
        </div>

        {/* Zone 3: Navigation Menu */}
        <nav className={styles.navMenu} aria-label="Learner Navigation">
          {/* GROUP: LEARNING */}
          <div className={styles.navGroup}>
            {!collapsed && <p className={styles.navTitle}>LEARNING</p>}

            <Link
              href="/"
              prefetch={false}
              className={`${styles.navItem} ${pathname === "/" ? styles.active : ""}`}
              title={collapsed ? "Dashboard" : undefined}
            >
              <Icons.Dashboard />
              {!collapsed && <span>Dashboard</span>}
            </Link>

            <Link
              href="/courses"
              prefetch={false}
              className={`${styles.navItem} ${pathname === "/courses" || pathname.startsWith("/programs") || pathname.startsWith("/steps") ? styles.active : ""}`}
              title={collapsed ? "My Courses" : undefined}
            >
              <Icons.Courses />
              {!collapsed && <span>My Courses</span>}
            </Link>

            <Link
              href="/notes"
              prefetch={false}
              className={`${styles.navItem} ${pathname === "/notes" || pathname.startsWith("/notes/") ? styles.active : ""}`}
              title={collapsed ? "My Notes" : undefined}
            >
              <Icons.Notes />
              {!collapsed && <span>My Notes</span>}
            </Link>

            <Link
              href="/live"
              prefetch={false}
              className={`${styles.navItem} ${pathname === "/live" || pathname.startsWith("/live/") ? styles.active : ""}`}
              title={collapsed ? "Live Sessions" : undefined}
            >
              <Icons.Sessions />
              {!collapsed && <span>Live Sessions</span>}
            </Link>

            <Link
              href="/attendance"
              prefetch={false}
              className={`${styles.navItem} ${pathname === "/attendance" ? styles.active : ""}`}
              title={collapsed ? "Attendance" : undefined}
            >
              <Icons.Attendance />
              {!collapsed && <span>Attendance</span>}
            </Link>

            <Link
              href="/certificates"
              prefetch={false}
              className={`${styles.navItem} ${pathname === "/certificates" || pathname.startsWith("/certificates/") ? styles.active : ""}`}
              title={collapsed ? "Certificates" : undefined}
            >
              <Icons.Certificates />
              {!collapsed && <span>Certificates</span>}
            </Link>
          </div>

          {/* GROUP: COMMUNITY */}
          <div className={styles.navGroup}>
            {!collapsed && <p className={styles.navTitle}>COMMUNITY</p>}

            <Link
              href="/events"
              prefetch={false}
              className={`${styles.navItem} ${pathname === "/events" || pathname.startsWith("/events/") ? styles.active : ""}`}
              title={collapsed ? "Events" : undefined}
            >
              <Icons.Events />
              {!collapsed && <span>Events</span>}
            </Link>
          </div>

          {/* Zone 5: Promo Card ("Keep Learning") - Vertically centered between Events and Sign Out */}
          <div className={styles.promoCardContainer}>
            <SidebarPromoCard collapsed={collapsed} />
          </div>

          {/* Bottom Actions: Sign Out */}
          <div className={styles.navGroup} style={{ marginTop: 0 }}>
            <div className={styles.navDivider} />

            <button
              type="button"
              className={styles.sidebarSignOutBtn}
              onClick={openSignOutConfirm}
              aria-label="Sign out"
              title={collapsed ? "Sign Out" : undefined}
            >
              <span className={styles.sidebarSignOutIcon}>
                <Icons.Logout />
              </span>
              {!collapsed && <span className={styles.sidebarSignOutLabel}>Sign Out</span>}
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
