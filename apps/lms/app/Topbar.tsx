"use client";

import styles from "./layout.module.css";
import { usePathname } from "next/navigation";

export default function Topbar() {
  const pathname = usePathname();

  // Hide topbar on login and signup
  if (pathname === "/login" || pathname === "/signup") {
    return null;
  }

  return (
    <header className={styles.topbar}>
      <div className={styles.searchContainer}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
        <input type="text" placeholder="Search programs, sessions, or topics..." />
      </div>
      <div className={styles.topbarActions}>
        <div className={styles.notificationIcon}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg>
          <div className={styles.notificationDot}></div>
        </div>
        <div className={styles.topAvatar}>G</div>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{cursor: 'pointer'}}><polyline points="6 9 12 15 18 9"></polyline></svg>
      </div>
    </header>
  );
}
