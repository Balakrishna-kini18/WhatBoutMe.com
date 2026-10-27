"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import styles from "./layout.module.css";
import { SITE_URL, signOutEverywhere } from "./lib/site";
import { API_URL } from "./lib/api";
import PushNotificationOptIn from "./components/PushNotificationOptIn";
import {
  fetchNotifications,
  fetchUnreadNotificationCount,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  fetchNotificationPreferences,
  updateNotificationPreferences,
  type AppNotification,
  type NotificationPreferences,
} from "./lib/api";

const VISIT_KEY = "attendance_visit";

function formatRelativeTime(isoDate: string): string {
  const date = new Date(isoDate);
  const now = new Date();
  const diffSec = Math.floor((now.getTime() - date.getTime()) / 1000);
  if (diffSec < 60) return "Just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** Real-time Bell with Learner Notifications, unread badge, and delivery preferences. */
function Notifications() {
  const router = useRouter();
  const [notices, setNotices] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [showPrefs, setShowPrefs] = useState(false);
  const [prefs, setPrefs] = useState<NotificationPreferences>({
    marketingPush: true,
    courseUpdates: true,
    sessionReminders: true,
  });
  const [savingPrefs, setSavingPrefs] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const loadUnreadCountOnly = async () => {
    try {
      const count = await fetchUnreadNotificationCount();
      setUnreadCount(count);
    } catch {
      // Fallback silently
    }
  };

  const loadAllNotifications = async () => {
    try {
      const [list, count] = await Promise.all([
        fetchNotifications(30),
        fetchUnreadNotificationCount(),
      ]);
      setNotices(list);
      setUnreadCount(count);
    } catch {
      // Fallback silently
    }
  };

  useEffect(() => {
    loadUnreadCountOnly();
    const interval = setInterval(loadUnreadCountOnly, 60_000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!open) return;
    loadAllNotifications();
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const handleOpenPrefs = async () => {
    try {
      const p = await fetchNotificationPreferences();
      setPrefs(p);
      setShowPrefs(true);
    } catch {
      setShowPrefs(true);
    }
  };

  const handleSavePrefs = async () => {
    setSavingPrefs(true);
    try {
      await updateNotificationPreferences(prefs);
      setShowPrefs(false);
    } catch {
      // Silent error handling
    } finally {
      setSavingPrefs(false);
    }
  };

  const handleNotificationClick = async (n: AppNotification) => {
    if (!n.readAt) {
      markNotificationAsRead(n.id).catch(() => {});
      setNotices((prev) =>
        prev.map((item) => (item.id === n.id ? { ...item, readAt: new Date().toISOString() } : item))
      );
      setUnreadCount((c) => Math.max(0, c - 1));
    }
    setOpen(false);
    if (n.link) {
      router.push(n.link);
    }
  };

  const handleMarkAllRead = async () => {
    await markAllNotificationsAsRead().catch(() => {});
    setNotices((prev) => prev.map((n) => ({ ...n, readAt: n.readAt || new Date().toISOString() })));
    setUnreadCount(0);
  };

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={`Notifications (${unreadCount} unread)`}
        aria-expanded={open}
        className={styles.notificationIcon}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
          <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
        </svg>
        {unreadCount > 0 && (
          <span className={styles.notificationDot}>
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          role="region"
          aria-label="Notification Center"
          style={{
            position: "absolute",
            right: 0,
            top: "calc(100% + 12px)",
            width: "360px",
            maxHeight: "480px",
            background: "var(--bg-card, #ffffff)",
            border: "1px solid var(--border-light, #e2e8f0)",
            borderRadius: "16px",
            boxShadow: "0 20px 40px -15px rgba(0,0,0,0.2)",
            display: "flex",
            flexDirection: "column",
            zIndex: 100,
            animation: "fadeIn 0.15s ease-out forwards",
            overflow: "hidden",
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: "14px 16px",
              borderBottom: "1px solid var(--border-light, #edf2f7)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              background: "var(--bg-secondary, #fafaf9)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ fontWeight: 700, fontSize: "0.9375rem" }}>Notifications</span>
              {unreadCount > 0 && (
                <span
                  style={{
                    background: "#fdf5ea",
                    color: "#e06d28",
                    fontSize: "0.75rem",
                    fontWeight: 700,
                    padding: "2px 8px",
                    borderRadius: "10px",
                    border: "1px solid #fae8ce",
                  }}
                >
                  {unreadCount} new
                </span>
              )}
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={handleMarkAllRead}
                  style={{
                    background: "none",
                    border: "none",
                    color: "#e06d28",
                    fontSize: "0.75rem",
                    fontWeight: 600,
                    cursor: "pointer",
                    padding: "2px 6px",
                  }}
                >
                  Mark all read
                </button>
              )}
              <button
                type="button"
                onClick={handleOpenPrefs}
                title="Notification Preferences"
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--text-secondary, #718096)",
                  cursor: "pointer",
                  padding: "4px",
                  display: "flex",
                  alignItems: "center",
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="3"></circle>
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
                </svg>
              </button>
            </div>
          </div>

          {/* List */}
          <div style={{ overflowY: "auto", maxHeight: "380px" }}>
            {notices.length === 0 ? (
              <div style={{ padding: "32px 16px", textAlign: "center", color: "var(--text-secondary, #718096)" }}>
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#cbd5e0" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ margin: "0 auto 10px" }}>
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
                  <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
                </svg>
                <p style={{ margin: 0, fontWeight: 600, fontSize: "0.875rem" }}>No notifications yet</p>
                <p style={{ margin: "4px 0 0", fontSize: "0.75rem" }}>You are completely caught up!</p>
              </div>
            ) : (
              notices.map((n) => {
                const isUnread = !n.readAt;
                return (
                  <div
                    key={n.id}
                    onClick={() => handleNotificationClick(n)}
                    style={{
                      padding: "12px 16px",
                      borderBottom: "1px solid var(--border-light, #edf2f7)",
                      cursor: n.link ? "pointer" : "default",
                      background: isUnread ? "rgba(224, 109, 40, 0.04)" : "transparent",
                      transition: "background 0.15s ease",
                      display: "flex",
                      alignItems: "flex-start",
                      gap: "10px",
                    }}
                  >
                    <div
                      style={{
                        width: "8px",
                        height: "8px",
                        borderRadius: "50%",
                        background: isUnread ? "#e06d28" : "transparent",
                        marginTop: "6px",
                        flexShrink: 0,
                      }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p
                        style={{
                          margin: 0,
                          fontSize: "0.875rem",
                          fontWeight: isUnread ? 700 : 600,
                          color: "var(--text-primary, #1a202c)",
                          lineHeight: 1.3,
                        }}
                      >
                        {n.title || n.template}
                      </p>
                      {n.message && (
                        <p
                          style={{
                            margin: "4px 0 0",
                            fontSize: "0.8125rem",
                            color: "var(--text-secondary, #4a5568)",
                            lineHeight: 1.4,
                          }}
                        >
                          {n.message}
                        </p>
                      )}
                      <p
                        style={{
                          margin: "6px 0 0",
                          fontSize: "0.75rem",
                          color: "var(--text-muted, #a0aec0)",
                        }}
                      >
                        {formatRelativeTime(n.sentAt || n.createdAt)}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Notification Preferences Modal */}
      {showPrefs && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Notification Preferences"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.45)",
            backdropFilter: "blur(2px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
            padding: "16px",
          }}
        >
          <div
            style={{
              background: "#ffffff",
              borderRadius: "16px",
              padding: "24px",
              maxWidth: "420px",
              width: "100%",
              boxShadow: "0 20px 40px rgba(0,0,0,0.25)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <h3 style={{ margin: 0, fontSize: "1.125rem", fontWeight: 700, color: "#1a202c" }}>
                Notification Preferences
              </h3>
              <button
                type="button"
                onClick={() => setShowPrefs(false)}
                style={{ background: "none", border: "none", cursor: "pointer", color: "#a0aec0", fontSize: "1.25rem", padding: "4px" }}
              >
                ✕
              </button>
            </div>

            <p style={{ fontSize: "0.8125rem", color: "#718096", lineHeight: 1.5, margin: "0 0 20px" }}>
              Control your push alert and in-app updates. Mandatory transactional emails (payment confirmation, agreement copies, and session access links) are always sent.
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <label style={{ display: "flex", alignItems: "flex-start", gap: "12px", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={prefs.sessionReminders}
                  onChange={(e) => setPrefs({ ...prefs, sessionReminders: e.target.checked })}
                  style={{ marginTop: "3px", accentColor: "#e06d28", width: "16px", height: "16px" }}
                />
                <div>
                  <span style={{ fontSize: "0.875rem", fontWeight: 600, color: "#2d3748", display: "block" }}>
                    Live Session Reminders
                  </span>
                  <span style={{ fontSize: "0.75rem", color: "#718096" }}>
                    Receive alerts 24 hours and 1 hour before scheduled cohort workshops.
                  </span>
                </div>
              </label>

              <label style={{ display: "flex", alignItems: "flex-start", gap: "12px", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={prefs.courseUpdates}
                  onChange={(e) => setPrefs({ ...prefs, courseUpdates: e.target.checked })}
                  style={{ marginTop: "3px", accentColor: "#e06d28", width: "16px", height: "16px" }}
                />
                <div>
                  <span style={{ fontSize: "0.875rem", fontWeight: 600, color: "#2d3748", display: "block" }}>
                    Course &amp; Step Unlocks
                  </span>
                  <span style={{ fontSize: "0.75rem", color: "#718096" }}>
                    Get notified immediately when a new curriculum step or module becomes available.
                  </span>
                </div>
              </label>

              <label style={{ display: "flex", alignItems: "flex-start", gap: "12px", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={prefs.marketingPush}
                  onChange={(e) => setPrefs({ ...prefs, marketingPush: e.target.checked })}
                  style={{ marginTop: "3px", accentColor: "#e06d28", width: "16px", height: "16px" }}
                />
                <div>
                  <span style={{ fontSize: "0.875rem", fontWeight: 600, color: "#2d3748", display: "block" }}>
                    Public Events &amp; Workshops
                  </span>
                  <span style={{ fontSize: "0.75rem", color: "#718096" }}>
                    Receive invitations to new live events, guest speaker sessions, and masterclasses.
                  </span>
                </div>
              </label>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "24px" }}>
              <button
                type="button"
                onClick={() => setShowPrefs(false)}
                style={{
                  background: "transparent",
                  border: "1px solid #e2e8f0",
                  borderRadius: "8px",
                  padding: "8px 16px",
                  fontSize: "0.8125rem",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSavePrefs}
                disabled={savingPrefs}
                style={{
                  background: "#e06d28",
                  color: "#ffffff",
                  border: "none",
                  borderRadius: "8px",
                  padding: "8px 18px",
                  fontSize: "0.8125rem",
                  fontWeight: 700,
                  cursor: savingPrefs ? "not-allowed" : "pointer",
                  opacity: savingPrefs ? 0.7 : 1,
                }}
              >
                {savingPrefs ? "Saving..." : "Save Preferences"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Searches the learner's courses and the items left in them. The result is
 * the My Courses page filtered by ?q=: typing there filters as you go, from
 * any other page Enter opens it.
 */
function Search() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [query, setQuery] = useState(pathname === "/courses" ? params.get("q") ?? "" : "");

  const target = (q: string) => (q.trim() ? `/courses?q=${encodeURIComponent(q.trim())}` : "/courses");

  return (
    <form
      role="search"
      className={styles.searchContainer}
      onSubmit={(e) => {
        e.preventDefault();
        router.push(target(query));
      }}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
      <input
        type="search"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          if (pathname === "/courses") router.replace(target(e.target.value));
        }}
        placeholder="Search your courses..."
        aria-label="Search your courses..."
        enterKeyHint="search"
      />
    </form>
  );
}

/** Signed-in learner's initials with a menu: profile and sign out. */
function ProfileMenu() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const user = JSON.parse(localStorage.getItem("user") || "{}");
      setName(user.name || user.email || "");
      setEmail(user.email || "");
    } catch {
      setName("");
      setEmail("");
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const initials = (name?.trim()?.charAt(0) || "S").toUpperCase();

  const openSignOut = () => {
    setOpen(false);
    window.dispatchEvent(new CustomEvent("wbm:open-signout-modal"));
  };

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Open profile menu"
        aria-expanded={open}
        className={styles.profileBtn}
      >
        <span className={styles.topAvatar}>{initials}</span>
        <span className={`${styles.profileChevron} ${open ? styles.profileChevronOpen : ""}`}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
        </span>
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            right: 0,
            top: "calc(100% + 10px)",
            width: "230px",
            background: "#ffffff",
            border: "1px solid #ece6dd",
            borderRadius: "14px",
            boxShadow: "0 16px 40px -8px rgba(28, 25, 23, 0.14), 0 4px 14px -2px rgba(28, 25, 23, 0.05)",
            padding: "6px",
            zIndex: 100,
          }}
        >
          {name && (
            <div style={{ padding: "8px 12px 10px", borderBottom: "1px solid #f0ece1", marginBottom: "4px" }}>
              <p style={{ margin: 0, fontWeight: 700, fontSize: "0.88rem", color: "#18181b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {name}
              </p>
              {email && (
                <p style={{ margin: "2px 0 0", fontSize: "0.75rem", color: "#78716c", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {email}
                </p>
              )}
            </div>
          )}

          <Link href="/profile" className={styles.profileMenuItem} onClick={() => setOpen(false)}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            <span>My Profile</span>
          </Link>
          <Link href="/live" className={styles.profileMenuItem} onClick={() => setOpen(false)}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
            <span>Live Sessions</span>
          </Link>
          <Link href="/events" className={styles.profileMenuItem} onClick={() => setOpen(false)}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            <span>Events &amp; Webinars</span>
          </Link>
          <Link href="/attendance" className={styles.profileMenuItem} onClick={() => setOpen(false)}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
            <span>Attendance</span>
          </Link>
          <Link href="/certificates" className={styles.profileMenuItem} onClick={() => setOpen(false)}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="7"/><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/></svg>
            <span>Certificates</span>
          </Link>
          <div style={{ height: "1px", background: "#f0ece1", margin: "4px 6px" }} />
          <a href={SITE_URL} className={styles.profileMenuItem}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
            <span>Back to Website</span>
          </a>
          <button
            type="button"
            className={`${styles.profileMenuItem} ${styles.profileMenuSignOut}`}
            onClick={openSignOut}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
            <span>Sign Out</span>
          </button>
        </div>
      )}
    </div>
  );
}

/** Main column. Login, signup and the sign-in handoff render full width, without the top bar. */
export default function LmsMain({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  // Opening the portal counts as attending today. Sent once per day per
  // browser; the server keeps one row per day, so a repeat is harmless.
  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) return;
    const today = new Date().toDateString();
    if (localStorage.getItem(VISIT_KEY) === today) return;
    fetch(`${API_URL}/attendance/visit`, { method: "POST", headers: { Authorization: `Bearer ${token}` } })
      .then((res) => {
        if (res.ok) localStorage.setItem(VISIT_KEY, today);
      })
      .catch(() => {});
  }, [pathname]);

  // Phones hide the bottom bar while a text field has focus. Closing the
  // keyboard with the back gesture leaves the field focused, so the bar would
  // stay hidden: when the screen grows back, let go of the field.
  useEffect(() => {
    const view = window.visualViewport;
    if (!view) return;
    let last = view.height;
    const onResize = () => {
      const grew = view.height - last > 120;
      last = view.height;
      const field = document.activeElement;
      if (grew && (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement)) field.blur();
    };
    view.addEventListener("resize", onResize);
    return () => view.removeEventListener("resize", onResize);
  }, []);

  if (pathname === "/login" || pathname === "/signup" || pathname === "/sso") {
    return <main className={styles.authMain}>{children}</main>;
  }

  const isFocusedEnrollment =
    pathname === "/agreement" ||
    pathname.startsWith("/agreement") ||
    pathname.startsWith("/agreements") ||
    pathname === "/checkout" ||
    pathname.startsWith("/checkout");

  if (isFocusedEnrollment) {
    return (
      <main className={styles.focusedMain}>
        <header
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0.85rem 2rem",
            minHeight: "64px",
            background: "#FFFFFF",
            borderBottom: "1px solid var(--border-light, #E7E0D6)",
            boxShadow: "0 1px 3px 0 rgba(28, 25, 23, 0.02)",
            position: "sticky",
            top: 0,
            zIndex: 30,
          }}
        >
          <Link
            href="/"
            style={{ display: "inline-flex", alignItems: "center" }}
            aria-label="WhatBoutMe Home"
          >
            <Image
              src="/brand/logo-dark.png"
              alt="WhatBoutMe"
              width={140}
              height={22}
              priority
              style={{ width: "auto", height: "1.3rem", objectFit: "contain" }}
            />
          </Link>

          {/* Right Action: Clean SaaS Exit Pill */}
          <Link
            href="/courses"
            style={{
              fontSize: "0.84rem",
              color: "#57534E",
              textDecoration: "none",
              fontWeight: 600,
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              background: "#FFFFFF",
              border: "1px solid var(--border-light, #E7E0D6)",
              padding: "6px 14px",
              borderRadius: "8px",
              boxShadow: "0 1px 2px rgba(0, 0, 0, 0.03)",
              transition: "all 0.15s ease",
            }}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <line x1="19" y1="12" x2="5" y2="12" />
              <polyline points="12 19 5 12 12 5" />
            </svg>
            <span>Exit to Courses</span>
          </Link>
        </header>
        {children}
      </main>
    );
  }

  return (
    <main className={styles.mainContent}>
      <header className={styles.topbar}>
        {/* shown on phones, where there is no sidebar to carry the logo; the
            light logo, because the phone bar is dark like the website's */}
        <Link href="/" className={styles.topbarLogo} aria-label="WhatBoutMe Home">
          <Image
            src="/brand/logo-light.png"
            alt="WhatBoutMe"
            width={136}
            height={18}
            priority
            style={{ width: "auto", height: "1.125rem", objectFit: "contain" }}
          />
        </Link>
        {/* useSearchParams needs a Suspense boundary to prerender */}
        <Suspense fallback={<div className={styles.searchContainer} />}>
          <Search />
        </Suspense>
        <div className={styles.topbarActions}>
          <Notifications />
          <ProfileMenu />
        </div>
      </header>
      {children}
      <PushNotificationOptIn />
    </main>
  );
}
