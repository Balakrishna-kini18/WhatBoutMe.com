"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import styles from "./layout.module.css";
import { SITE_URL, signOutEverywhere } from "./lib/site";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
const VISIT_KEY = "attendance_visit";

type Notice = { id: string; template: string; schedule: string | null; createdAt: string };

const when = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** Bell with the learner's reminders (for example, newly scheduled live sessions). */
function Notifications() {
  const [notices, setNotices] = useState<Notice[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) return;
    fetch(`${API_URL}/notifications/mine`, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setNotices(Array.isArray(data) ? data : []))
      .catch(() => setNotices([]));
  }, []);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={`Notifications (${notices.length})`}
        aria-expanded={open}
        className={styles.notificationIcon}
        style={{ background: "transparent", border: "none", cursor: "pointer", padding: 0 }}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg>
        {notices.length > 0 && <div className={styles.notificationDot}></div>}
      </button>

      {open && (
        <div style={{ position: "absolute", right: 0, top: "calc(100% + 12px)", width: "320px", maxHeight: "380px", overflowY: "auto", background: "var(--bg-card)", border: "1px solid var(--border-light)", borderRadius: "14px", boxShadow: "0 20px 40px -20px rgba(0,0,0,0.25)", padding: "8px", zIndex: 50 }}>
          <p style={{ margin: 0, padding: "8px 10px", fontWeight: 700 }}>Notifications</p>
          {notices.length === 0 ? (
            <p style={{ margin: 0, padding: "8px 10px 12px", color: "var(--text-secondary)", fontSize: "0.9rem" }}>Nothing new right now.</p>
          ) : (
            notices.map((n) => (
              <div key={n.id} style={{ padding: "10px", borderTop: "1px solid var(--border-light)" }}>
                <p style={{ margin: 0, fontSize: "0.9rem", fontWeight: 600 }}>{n.template}</p>
                <p style={{ margin: "2px 0 0", fontSize: "0.8rem", color: "var(--text-secondary)" }}>{when(n.schedule || n.createdAt)}</p>
              </div>
            ))
          )}
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
        placeholder="Search your courses"
        aria-label="Search your courses"
        enterKeyHint="search"
      />
    </form>
  );
}

/** Signed-in learner's initials with a menu: profile and sign out. */
function ProfileMenu() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const user = JSON.parse(localStorage.getItem("user") || "{}");
      setName(user.name || user.email || "");
    } catch {
      setName("");
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

  const initials = (name || "Learner").split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((n) => n[0]).join("").toUpperCase();
  const item: React.CSSProperties = { display: "block", width: "100%", padding: "10px 12px", borderRadius: "10px", border: "none", background: "transparent", textAlign: "left", font: "inherit", fontSize: "0.9rem", color: "var(--text-primary)", cursor: "pointer", textDecoration: "none" };

  const signOut = () => signOutEverywhere();

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
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
      </button>

      {open && (
        <div style={{ position: "absolute", right: 0, top: "calc(100% + 12px)", width: "220px", background: "var(--bg-card)", border: "1px solid var(--border-light)", borderRadius: "14px", boxShadow: "0 20px 40px -20px rgba(0,0,0,0.25)", padding: "8px", zIndex: 50 }}>
          {name && <p style={{ margin: 0, padding: "8px 12px 10px", fontWeight: 700, borderBottom: "1px solid var(--border-light)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</p>}
          <Link href="/profile" style={item} onClick={() => setOpen(false)}>My Profile</Link>
          <Link href="/live" style={item} onClick={() => setOpen(false)}>Live Sessions</Link>
          <Link href="/chat" style={item} onClick={() => setOpen(false)}>Messages</Link>
          <Link href="/attendance" style={item} onClick={() => setOpen(false)}>Attendance</Link>
          <Link href="/certificates" style={item} onClick={() => setOpen(false)}>Certificates</Link>
          <a href={SITE_URL} style={item}>Back to Website</a>
          <button type="button" style={item} onClick={signOut}>Sign Out</button>
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

  return (
    <main className={styles.mainContent}>
      <header className={styles.topbar}>
        {/* shown on phones, where there is no sidebar to carry the logo; the
            light logo, because the phone bar is dark like the website's */}
        <Link href="/" className={styles.topbarLogo} aria-label="whatboutme home">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/logo-light.png" alt="whatboutme" />
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
    </main>
  );
}
