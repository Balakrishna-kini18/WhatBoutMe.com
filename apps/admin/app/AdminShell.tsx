"use client";

import styles from "./layout.module.css";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";

interface UserData {
  id: string;
  email: string;
  name: string;
  role: string;
}

// Inline SVGs for the sidebar and topbar
const Icons = {
  Leaf: () => <svg width="24" height="24" viewBox="0 0 24 24" fill="var(--accent-primary)"><path d="M12 22C12 22 20 18 20 11C20 8.5 19 6 17 4.5C14.5 3 12 2 12 2C12 2 9.5 3 7 4.5C5 6 4 8.5 4 11C4 18 12 22 12 22Z" /><path d="M12 22V2" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>,
  Dashboard: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>,
  Users: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>,
  Batches: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"></polygon><polyline points="2 17 12 22 22 17"></polyline><polyline points="2 12 12 17 22 12"></polyline></svg>,
  Programs: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>,
  QuestionBank: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>,
  Revenue: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line></svg>,
  Invoices: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>,
  Logout: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>,
  Search: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>,
  Bell: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg>,
  ChevronDown: () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
};

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<UserData | null>(null);

  useEffect(() => {
    // Skip auth check on login page
    if (pathname === "/login") return;

    const token = localStorage.getItem("token");
    const storedUser = localStorage.getItem("user");

    if (!token || !storedUser) {
      router.push("/login");
      return;
    }

    try {
      setUser(JSON.parse(storedUser));
    } catch {
      localStorage.removeItem("user");
      router.push("/login");
    }
  }, [pathname, router]);

  const handleSignOut = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("refresh_token");
    localStorage.removeItem("user");
    router.push("/login");
  };

  // Don't show shell on login page
  if (pathname === "/login") {
    return <>{children}</>;
  }

  const userName = user?.name || user?.email || "Admin";
  const userRole = user?.role === "SUPER_ADMIN" ? "Super Admin" : user?.role === "MANAGER" ? "Manager" : "Admin";
  const initials = userName.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);

  return (
    <div className={styles.appContainer}>
      {/* Admin Sidebar */}
      <aside className={styles.sidebar}>
        <div className={styles.logoArea}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/logo-dark.png" alt="whatboutme" style={{ height: '20px', width: 'auto', display: 'block' }} />
          <span className={styles.logoText} style={{ fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-secondary)' }}>Admin</span>
        </div>

        <nav className={styles.navMenu}>
          <div className={styles.navGroup}>
            <p className={styles.navTitle}>OVERVIEW</p>
            <Link href="/" className={`${styles.navItem} ${pathname === "/" ? styles.active : ""}`}>
              <Icons.Dashboard /> Dashboard
            </Link>
            <Link href="/users" className={`${styles.navItem} ${pathname.startsWith("/users") ? styles.active : ""}`}>
              <Icons.Users /> Users & Enrolments
            </Link>
            <Link href="/batches" className={`${styles.navItem} ${pathname.startsWith("/batches") ? styles.active : ""}`}>
              <Icons.Batches /> Batches
            </Link>
          </div>

          <div className={styles.navGroup}>
            <p className={styles.navTitle}>CURRICULUM</p>
            <Link href="/programs" className={`${styles.navItem} ${pathname.startsWith("/programs") ? styles.active : ""}`}>
              <Icons.Programs /> Programs
            </Link>
            <Link href="/quizzes" className={`${styles.navItem} ${pathname.startsWith("/quizzes") ? styles.active : ""}`}>
              <Icons.QuestionBank /> Question Bank
            </Link>
          </div>

          <div className={styles.navGroup}>
            <p className={styles.navTitle}>WEBSITE</p>
            <Link href="/website" className={`${styles.navItem} ${pathname.startsWith("/website") ? styles.active : ""}`}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 0 20 15.3 15.3 0 0 1 0-20z"></path></svg> Website Content
            </Link>
            <Link href="/leads" className={`${styles.navItem} ${pathname.startsWith("/leads") ? styles.active : ""}`}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16v16H4z"></path><polyline points="4 6 12 13 20 6"></polyline></svg> Enquiries (CRM)
            </Link>
          </div>

          <div className={styles.navGroup}>
            <p className={styles.navTitle}>FINANCE</p>
            <Link href="/revenue" className={`${styles.navItem} ${pathname === "/revenue" ? styles.active : ""}`}>
              <Icons.Revenue /> Revenue
            </Link>
            <Link href="/invoices" className={`${styles.navItem} ${pathname === "/invoices" ? styles.active : ""}`}>
              <Icons.Invoices /> Invoices
            </Link>
          </div>

          <div className={styles.navGroup}>
            <p className={styles.navTitle}>OPERATIONS</p>
            <Link href="/meetings" className={`${styles.navItem} ${pathname.startsWith("/meetings") ? styles.active : ""}`}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg> Meetings
            </Link>
            <Link href="/messages" className={`${styles.navItem} ${pathname.startsWith("/messages") ? styles.active : ""}`}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg> Support Inbox
            </Link>
            <Link href="/certificates" className={`${styles.navItem} ${pathname.startsWith("/certificates") ? styles.active : ""}`}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="7"></circle><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"></polyline></svg> Certificates
            </Link>
          </div>
        </nav>

        <div className={styles.sidebarBottom}>
          <button className={styles.logoutBtn} onClick={handleSignOut}>
            <Icons.Logout /> Sign Out
          </button>
        </div>
      </aside>

      {/* Right Side (Topbar + Content) */}
      <div className={styles.mainWrapper}>
        {/* Top Bar */}
        <header className={styles.topbar}>
          <div className={styles.searchContainer}>
            <span className={styles.searchIcon}><Icons.Search /></span>
            <input type="text" placeholder="Search users, batches, or invoices..." className={styles.searchInput} />
            <div className={styles.searchShortcut}>Ctrl K</div>
          </div>

          <div className={styles.topbarActions}>
            <div className={styles.notificationIcon}>
              <Icons.Bell />
              <div className={styles.notificationDot}></div>
            </div>
            
            <div className={styles.userProfile}>
              <div className={styles.avatar}>{initials}</div>
              <div className={styles.userInfo}>
                <span className={styles.userName}>{userName}</span>
                <span className={styles.userRole}>{userRole}</span>
              </div>
              <div style={{ color: 'var(--text-secondary)' }}><Icons.ChevronDown /></div>
            </div>
          </div>
        </header>

        {/* Main Content Area */}
        <main className={styles.mainContent}>
          <div className={styles.contentInner}>
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
