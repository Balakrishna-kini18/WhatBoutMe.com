"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./chat.module.css";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

interface Participant { id: string; name: string; role: string }
interface Conversation {
  id: string;
  participants: Participant[];
  lastMessage: { content: string; createdAt: string; senderId: string } | null;
  unread: number;
}
interface Message { id: string; senderId: string; senderName: string; content: string; createdAt: string }
interface Notice { id: string; template: string; schedule: string | null; createdAt: string }
interface Session { id: string; title: string; startTime: string; endTime: string; joinUrl: string | null }

type Entry =
  | { kind: "message"; at: number; message: Message }
  | { kind: "note"; at: number; notice: Notice; session?: Session };

const authHeaders = (): Record<string, string> => ({
  Authorization: `Bearer ${localStorage.getItem("token")}`,
});
const initialsOf = (name: string) =>
  name.split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((n) => n[0]).join("").toUpperCase();
const clock = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
const dayAndTime = (iso: string) =>
  new Date(iso).toLocaleString([], { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
const URL_PATTERN = /https?:\/\/[^\s]+/g;

const Icon = {
  info: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></svg>,
  search: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>,
  calendar: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>,
  back: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>,
  close: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>,
  send: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>,
};

/** Messages with the programme team. Scheduled meetings appear in the thread as notes. */
export default function ChatPage() {
  const router = useRouter();
  const [me, setMe] = useState("");
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [infoOpen, setInfoOpen] = useState(false);
  // phones show one pane at a time: the list first, then the opened thread
  const [threadOpen, setThreadOpen] = useState(false);
  const [contactQuery, setContactQuery] = useState("");
  const [chatQuery, setChatQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);
  const threadRef = useRef<HTMLDivElement>(null);

  const loadMessages = useCallback(async (id: string) => {
    const [thread, list] = await Promise.all([
      fetch(`${API_URL}/messages/conversations/${id}`, { headers: authHeaders() }),
      fetch(`${API_URL}/messages/conversations`, { headers: authHeaders() }),
    ]);
    if (thread.ok) setMessages(await thread.json());
    if (list.ok) setConversations(await list.json());
  }, []);

  // first load: who am I, my conversation, my meeting reminders
  useEffect(() => {
    if (!localStorage.getItem("token")) {
      router.push("/login");
      return;
    }
    try {
      setMe(JSON.parse(localStorage.getItem("user") || "{}").id || "");
    } catch {
      setMe("");
    }

    (async () => {
      try {
        const support = await fetch(`${API_URL}/messages/support`, { method: "POST", headers: authHeaders() });
        const supportId = support.ok ? (await support.json()).id : "";

        const [list, noticeRes, meRes] = await Promise.all([
          fetch(`${API_URL}/messages/conversations`, { headers: authHeaders() }),
          fetch(`${API_URL}/notifications/mine`, { headers: authHeaders() }),
          fetch(`${API_URL}/auth/me`, { headers: authHeaders() }),
        ]);
        if (list.ok) setConversations(await list.json());
        if (noticeRes.ok) setNotices(await noticeRes.json());
        if (meRes.ok) setSessions((await meRes.json()).upcomingSessions || []);
        if (supportId) {
          setActiveId(supportId);
          await loadMessages(supportId);
        } else {
          setError("Messaging is not available yet. Please try again later.");
        }
      } catch {
        setError("Could not reach the server. Please try again in a moment.");
      } finally {
        setLoading(false);
      }
    })();
  }, [router, loadMessages]);

  // pick up new replies while the page is open
  useEffect(() => {
    if (!activeId) return;
    const timer = setInterval(() => loadMessages(activeId).catch(() => {}), 10000);
    return () => clearInterval(timer);
  }, [activeId, loadMessages]);

  const active = conversations.find((c) => c.id === activeId);
  const other = active?.participants.find((p) => p.id !== me) ?? active?.participants[0];
  const otherName = other?.name || "Programme Team";

  // messages and meeting notes in one timeline
  const timeline = useMemo<Entry[]>(() => {
    const sameTime = (n: Notice, x: Session) =>
      !!n.schedule && new Date(n.schedule).getTime() === new Date(x.startTime).getTime();
    // every scheduled meeting is a note; it sits where its reminder arrived,
    // or at the top of the thread when it was scheduled before reminders existed
    const fromSessions: Entry[] = sessions.map((session) => {
      const notice = notices.find((n) => sameTime(n, session));
      return {
        kind: "note",
        at: notice ? new Date(notice.createdAt).getTime() : 0,
        notice: notice ?? { id: session.id, template: session.title, schedule: session.startTime, createdAt: session.startTime },
        session,
      };
    });
    const fromNotices: Entry[] = notices
      .filter((n) => !sessions.some((x) => sameTime(n, x)))
      .map((notice) => ({ kind: "note", at: new Date(notice.createdAt).getTime(), notice }));
    const notes = [...fromSessions, ...fromNotices];
    const texts: Entry[] = messages.map((message) => ({
      kind: "message",
      at: new Date(message.createdAt).getTime(),
      message,
    }));
    const all = [...notes, ...texts].sort((a, b) => a.at - b.at);
    const q = chatQuery.trim().toLowerCase();
    if (!q) return all;
    return all.filter((e) =>
      (e.kind === "message" ? e.message.content : e.notice.template).toLowerCase().includes(q),
    );
  }, [messages, notices, sessions, chatQuery]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [timeline.length]);

  // The thread gets shorter when the keyboard opens. If the learner was at
  // the latest message, keep it in view; if they were reading back, leave it.
  useEffect(() => {
    const thread = threadRef.current;
    if (!thread) return;
    let atBottom = true;
    const onScroll = () => {
      atBottom = thread.scrollHeight - thread.scrollTop - thread.clientHeight < 80;
    };
    const observer = new ResizeObserver(() => {
      if (atBottom) thread.scrollTop = thread.scrollHeight;
    });
    thread.addEventListener("scroll", onScroll, { passive: true });
    observer.observe(thread);
    return () => {
      thread.removeEventListener("scroll", onScroll);
      observer.disconnect();
    };
  }, []);

  // links shared in messages, plus meeting join links
  const links = useMemo(() => {
    const found = messages.flatMap((m) => m.content.match(URL_PATTERN) ?? []);
    const joins = sessions.filter((s) => s.joinUrl).map((s) => s.joinUrl as string);
    return [...new Set([...joins, ...found])];
  }, [messages, sessions]);

  const send = async (e: FormEvent) => {
    e.preventDefault();
    const content = draft.trim();
    if (!content || !activeId) return;
    setSending(true);
    setError("");
    try {
      const res = await fetch(`${API_URL}/messages/conversations/${activeId}`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      if (res.ok) {
        setDraft("");
        await loadMessages(activeId);
      } else {
        setError("Your message could not be sent. Please try again.");
      }
    } catch {
      setError("Could not reach the server. Please try again in a moment.");
    } finally {
      setSending(false);
    }
  };

  const visibleContacts = conversations.filter((c) => {
    const name = (c.participants.find((p) => p.id !== me)?.name || "").toLowerCase();
    return name.includes(contactQuery.trim().toLowerCase());
  });

  return (
    <div className={`${styles.container} ${infoOpen ? styles.withInfo : ""} ${threadOpen ? styles.threadOpen : ""}`}>
      {/* conversations */}
      <aside className={styles.chatSidebar}>
        <h1 className={styles.heading}>Messages</h1>
        <label className={styles.searchBox}>
          {Icon.search}
          <input type="search" placeholder="Search" aria-label="Search conversations" value={contactQuery} onChange={(e) => setContactQuery(e.target.value)} />
        </label>
        <div className={styles.contactList}>
          {visibleContacts.map((c) => {
            const name = c.participants.find((p) => p.id !== me)?.name || "Programme Team";
            return (
              <button key={c.id} type="button" onClick={() => { setActiveId(c.id); setThreadOpen(true); loadMessages(c.id); }} className={`${styles.contact} ${c.id === activeId ? styles.active : ""}`}>
                <span className={styles.avatar}>{initialsOf(name)}</span>
                <span className={styles.contactInfo}>
                  <strong>{name}</strong>
                  <span>{c.lastMessage ? c.lastMessage.content : "No messages yet"}</span>
                </span>
                {c.unread > 0 && <span className={styles.badge}>{c.unread}</span>}
              </button>
            );
          })}
          {!loading && visibleContacts.length === 0 && <p className={styles.hint}>No conversations found.</p>}
        </div>
      </aside>

      {/* thread */}
      <section className={styles.chatWindow}>
        <header className={styles.chatHeader}>
          <button type="button" onClick={() => { setThreadOpen(false); setInfoOpen(false); }} aria-label="Back to conversations" className={`${styles.iconBtn} ${styles.backBtn}`}>
            {Icon.back}
          </button>
          <span className={styles.avatar}>{initialsOf(otherName)}</span>
          <div className={styles.headerText}>
            <strong>{otherName}</strong>
            <span>Programme team</span>
          </div>
          <button type="button" onClick={() => setInfoOpen((v) => !v)} aria-label="Conversation details" aria-pressed={infoOpen} className={`${styles.iconBtn} ${infoOpen ? styles.iconBtnOn : ""}`}>
            {Icon.info}
          </button>
        </header>

        <div className={styles.chatMessages} ref={threadRef}>
          {loading ? (
            <p className={styles.hint}>Loading messages...</p>
          ) : timeline.length === 0 ? (
            <p className={styles.hint}>{chatQuery ? "Nothing in this chat matches your search." : `Say hello to ${otherName}.`}</p>
          ) : (
            timeline.map((entry) =>
              entry.kind === "note" ? (
                <div key={`n-${entry.notice.id}`} className={styles.note}>
                  <span className={styles.noteIcon}>{Icon.calendar}</span>
                  <div className={styles.noteBody}>
                    <strong>{entry.notice.template.replace(/^Live session scheduled:\s*/i, "") || "Meeting"}</strong>
                    <span>Meeting scheduled{entry.notice.schedule ? ` · ${dayAndTime(entry.notice.schedule)}` : ""}</span>
                  </div>
                  {entry.session?.joinUrl && (
                    <a href={entry.session.joinUrl} target="_blank" rel="noreferrer" className={styles.noteLink}>Join</a>
                  )}
                </div>
              ) : (
                <div key={entry.message.id} className={`${styles.message} ${entry.message.senderId === me ? styles.sent : styles.received}`}>
                  <p>
                    {entry.message.content}
                    <span className={styles.time}>{clock(entry.message.createdAt)}</span>
                  </p>
                </div>
              ),
            )
          )}
          <div ref={bottomRef} />
        </div>

        {error && <p role="alert" className={styles.error}>{error}</p>}

        <form className={styles.chatInput} onSubmit={send}>
          <input type="text" placeholder="Type a message..." aria-label="Message" value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={4000} enterKeyHint="send" />
          {/* keeping focus on the field keeps the keyboard open after sending */}
          <button type="submit" className={styles.sendBtn} disabled={sending || !draft.trim()} aria-label="Send message" onPointerDown={(e) => e.preventDefault()} onMouseDown={(e) => e.preventDefault()}>
            {Icon.send}
          </button>
        </form>
      </section>

      {/* details: who this is, search, meetings, links. A side panel on
          desktop; on phones a sheet that rises from the bottom. */}
      {infoOpen && (
        <>
          <button type="button" aria-label="Close details" className={styles.backdrop} onClick={() => setInfoOpen(false)} />
          <aside className={styles.info} aria-label="Conversation details">
            <span className={styles.handle} aria-hidden="true" />
            <button type="button" onClick={() => setInfoOpen(false)} aria-label="Close details" className={`${styles.iconBtn} ${styles.infoClose}`}>
              {Icon.close}
            </button>

            <div className={styles.profile}>
              <span className={`${styles.avatar} ${styles.avatarLarge}`}>{initialsOf(otherName)}</span>
              <strong>{otherName}</strong>
              <span>Programme team</span>
            </div>

            <label className={styles.sheetSearch}>
              {Icon.search}
              <input type="search" placeholder="Search in this chat" aria-label="Search in this chat" value={chatQuery} onChange={(e) => setChatQuery(e.target.value)} />
            </label>

            <h3 className={styles.infoLabel}>Meetings</h3>
            {sessions.length === 0 ? (
              <p className={styles.infoEmpty}>No meetings scheduled.</p>
            ) : (
              <ul className={styles.infoList}>
                {sessions.map((s) => (
                  <li key={s.id}>
                    <span className={styles.noteIcon}>{Icon.calendar}</span>
                    <span className={styles.infoText}>
                      <strong>{s.title}</strong>
                      <span>{dayAndTime(s.startTime)}</span>
                    </span>
                    {s.joinUrl && <a href={s.joinUrl} target="_blank" rel="noreferrer" className={styles.noteLink}>Join</a>}
                  </li>
                ))}
              </ul>
            )}

            <h3 className={styles.infoLabel}>Links</h3>
            {links.length === 0 ? (
              <p className={styles.infoEmpty}>No links shared yet.</p>
            ) : (
              <ul className={styles.infoList}>
                {links.map((url) => (
                  <li key={url}>
                    <a href={url} target="_blank" rel="noreferrer" className={styles.infoLink}>{url.replace(/^https?:\/\//, "")}</a>
                  </li>
                ))}
              </ul>
            )}
          </aside>
        </>
      )}
    </div>
  );
}
