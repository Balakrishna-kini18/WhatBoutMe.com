"use client";

import styles from "./layout.module.css";
import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { SITE_URL, signOutEverywhere, toSite } from "./lib/site";

interface UserData {
  id: string;
  email: string;
  name: string;
  role: string;
  enrolledPrograms?: { batchName: string; programTitle: string }[];
}

// Inline SVGs for the sidebar icons
const Icons = {
  Logo: () => <svg width="24" height="24" viewBox="0 0 24 24" fill="var(--accent-primary)"><path d="M12 3L2 7l10 4 10-4-10-4zm0 6l-10-4v10l10 4 10-4V5l-10 4z"/></svg>,
  Programs: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>,
  Courses: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path></svg>,
  Attendance: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l3 3L22 4"></path><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path></svg>,
  Explore: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"></polygon></svg>,
  Sessions: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>,
  Certificates: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="7"></circle><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"></polyline></svg>,
  Messages: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>,
  Profile: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>,
  Logout: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>,
  Chevron: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
};

export default function LmsSidebar() {
  const pathname = usePathname();
  const [user, setUser] = useState<UserData | null>(null);

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
  }, [pathname]);

  const handleSignOut = () => signOutEverywhere();

  if (pathname === "/login" || pathname === "/signup" || pathname === "/sso") {
    return null;
  }

  const userName = user?.name || user?.email || "Learner";
  const initials = userName.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
  const cohortName = user?.enrolledPrograms?.[0]?.batchName || "Not Enrolled";

  // phones get a bottom tab bar instead of the sidebar, the same five tabs in
  // the same order as the website's bar: Home, Explore, My Courses, Chat,
  // Profile. Home and Explore leave the portal for the website (Explore is
  // where another course is bought); the dashboard stays behind the logo at
  // the top. Live sessions, attendance and certificates are in the top right menu.
  const tabs = [
    { href: SITE_URL, label: "Home", icon: <Icons.Programs />, active: false, external: "" },
    { href: `${SITE_URL}/courses`, label: "Explore", icon: <Icons.Explore />, active: false, external: "/courses" },
    { href: "/courses", label: "My Courses", icon: <Icons.Courses />, active: pathname === "/courses" || pathname.startsWith("/programs") || pathname.startsWith("/steps") },
    { href: "/chat", label: "Chat", icon: <Icons.Messages />, active: pathname === "/chat" },
    { href: "/profile", label: "Profile", icon: <Icons.Profile />, active: pathname === "/profile" },
  ];

  return (
    <>
    <nav className={styles.tabBar} aria-label="Main">
      {tabs.map((tab) =>
        tab.external !== undefined ? (
          // a different site, so a plain link (full page load), not a route change
          <a key={tab.href} href={tab.href} onClick={toSite(tab.external)} className={styles.tab}>
            {tab.icon}
            <span>{tab.label}</span>
          </a>
        ) : (
          <Link key={tab.href} href={tab.href} aria-current={tab.active ? "page" : undefined} className={`${styles.tab} ${tab.active ? styles.tabActive : ""}`}>
            {tab.icon}
            <span>{tab.label}</span>
          </Link>
        ),
      )}
    </nav>
    <aside className={styles.sidebar}>
      <div className={styles.logo}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/logo-dark.png" alt="whatboutme" />
      </div>

      <Link href="/profile" className={styles.userProfile}>
        <span className={styles.avatarWrap}>
          <span className={styles.avatar}>{initials}</span>
          <span className={styles.avatarMark} title="Verified learner">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12" /></svg>
          </span>
        </span>
        <div className={styles.userInfo}>
          <h4>{userName}</h4>
          <p>{cohortName}</p>
        </div>
      </Link>

      <nav className={styles.navMenu}>
        <div className={styles.navGroup}>
          <p className={styles.navTitle}>LEARNING</p>
          <Link href="/" className={`${styles.navItem} ${pathname === "/" ? styles.active : ""}`}>
            <Icons.Programs /> Dashboard
          </Link>
          <Link href="/courses" className={`${styles.navItem} ${pathname === "/courses" ? styles.active : ""}`}>
            <Icons.Courses /> My Courses
          </Link>
          <Link href="/live" className={`${styles.navItem} ${pathname === "/live" ? styles.active : ""}`}>
            <Icons.Sessions /> Live Sessions
          </Link>
          <Link href="/attendance" className={`${styles.navItem} ${pathname === "/attendance" ? styles.active : ""}`}>
            <Icons.Attendance /> Attendance
          </Link>
          <Link href="/certificates" className={`${styles.navItem} ${pathname === "/certificates" ? styles.active : ""}`}>
            <Icons.Certificates /> Certificates
          </Link>
        </div>

        <div className={styles.navGroup}>
          <p className={styles.navTitle}>COMMUNITY</p>
          <Link href="/chat" className={`${styles.navItem} ${pathname === "/chat" ? styles.active : ""}`}>
            <Icons.Messages /> Messages
          </Link>
          <Link href="/profile" className={`${styles.navItem} ${pathname === "/profile" ? styles.active : ""}`}>
            <Icons.Profile /> My Profile
          </Link>
        </div>
      </nav>

      <button type="button" className={styles.logoutBtn} onClick={handleSignOut} style={{ width: '100%', border: 'none', background: 'transparent', font: 'inherit', fontSize: '0.9rem', fontWeight: 500, textAlign: 'left' }}>
        <Icons.Logout /> Sign Out
      </button>
    </aside>
    </>
  );
}
