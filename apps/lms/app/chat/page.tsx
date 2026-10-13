"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./chat.module.css";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

interface Participant { id: string; name: string; role: string }
interface Conversation {
  id: string;
  participants: Participant[];
  lastMessage: { content: string; createdAt: string; senderId: string; attachmentUrl?: string | null; read?: boolean } | null;
  unread: number;
  isTyping?: boolean;
  typingUser?: string | null;
}
interface Message {
  id: string;
  senderId: string;
  senderName: string;
  content: string;
  attachmentUrl?: string | null;
  read?: boolean;
  createdAt: string;
}
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

const formatDayLabel = (iso: string): string => {
  const date = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  if (date.toDateString() === today.toDateString()) return "Today";
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: date.getFullYear() !== today.getFullYear() ? "numeric" : undefined,
  });
};

const URL_PATTERN = /https?:\/\/[^\s]+/g;
const QUICK_EMOJIS = ["😊", "👍", "❤️", "😂", "🙏", "🔥", "🎉", "👏", "😮", "🙌", "💯", "✨"];

// Web Audio API synthesised pop / chime (zero external audio dependencies)
function playTone(freq1: number, freq2: number, duration: number) {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(freq1, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(freq2, ctx.currentTime + duration);
    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  } catch {
    // Audio autoplay restrictions or blocked
  }
}

const Icon = {
  info: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></svg>,
  search: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>,
  calendar: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>,
  back: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>,
  close: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>,
  send: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>,
  attach: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" /></svg>,
  emoji: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M8 14s1.5 2 4 2 4-2 4-2" /><line x1="9" y1="9" x2="9.01" y2="9" /><line x1="15" y1="9" x2="15.01" y2="9" /></svg>,
  trash: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>,
  soundOn: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" /></svg>,
  soundOff: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><line x1="23" y1="9" x2="17" y2="15" /><line x1="17" y1="9" x2="23" y2="15" /></svg>,
  doc: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" /></svg>,
  download: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>,
};

/** WhatsApp-Grade Messaging Portal for Learners */
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
  const [threadOpen, setThreadOpen] = useState(false);
  const [contactQuery, setContactQuery] = useState("");
  const [chatQuery, setChatQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [isOtherTyping, setIsOtherTyping] = useState(false);
  const [emojiDrawerOpen, setEmojiDrawerOpen] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [pendingAttachment, setPendingAttachment] = useState<{ url: string; name: string; type: string } | null>(null);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const typingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const prevMsgCountRef = useRef(0);

  const inFlightRef = useRef(false);

  // Sound preference from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("wbm_chat_sound");
    if (saved !== null) setSoundEnabled(saved === "true");
  }, []);

  const toggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    localStorage.setItem("wbm_chat_sound", String(next));
  };

  const isSafeUrl = (url?: string | null): boolean => {
    if (!url) return false;
    return /^https?:\/\//i.test(url) || url.startsWith('/uploads/');
  };

  const loadMessages = useCallback(async (id: string) => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      const [thread, typingRes] = await Promise.all([
        fetch(`${API_URL}/messages/conversations/${id}`, { headers: authHeaders() }),
        fetch(`${API_URL}/messages/conversations/${id}/typing`, { headers: authHeaders() }).catch(() => null),
      ]);
      if (thread.ok) {
        const msgs: Message[] = await thread.json();
        if (msgs.length > prevMsgCountRef.current && prevMsgCountRef.current > 0) {
          const last = msgs[msgs.length - 1];
          if (last && last.senderId !== me && soundEnabled) {
            playTone(600, 900, 0.12);
          }
        }
        prevMsgCountRef.current = msgs.length;
        setMessages(msgs);
      }
      if (typingRes && typingRes.ok) {
        const activeTyping = await typingRes.json();
        setIsOtherTyping(Array.isArray(activeTyping) && activeTyping.length > 0);
      }
    } finally {
      inFlightRef.current = false;
    }
  }, [me, soundEnabled]);

  // Initial load
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
        if (noticeRes.ok) setNotices(await noticeRes.json());
        if (meRes.ok) setSessions((await meRes.json()).upcomingSessions || []);

        if (list.ok) {
          const convList: Conversation[] = await list.json();
          setConversations(convList);
          const preferredConv = (supportId && convList.find((c) => c.id === supportId && c.lastMessage))
            || convList.find((c) => c.lastMessage)
            || (supportId && convList.find((c) => c.id === supportId))
            || convList[0];
          const initialId = preferredConv?.id || supportId;
          if (initialId) {
            setActiveId(initialId);
            await loadMessages(initialId);
          } else {
            setError("Messaging is not available yet. Please try again later.");
          }
        } else if (supportId) {
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

  // Adaptive polling with Page Visibility API and backoff
  useEffect(() => {
    if (!activeId) return;

    let timer: NodeJS.Timeout;
    let cancelled = false;

    const poll = async () => {
      if (cancelled) return;
      if (typeof document !== "undefined" && document.hidden) {
        timer = setTimeout(poll, 25000);
        return;
      }
      try {
        await loadMessages(activeId);
        timer = setTimeout(poll, 4000);
      } catch {
        timer = setTimeout(poll, 12000);
      }
    };

    timer = setTimeout(poll, 4000);

    const onVisibility = () => {
      if (!document.hidden && activeId) {
        loadMessages(activeId).catch(() => {});
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [activeId, loadMessages]);

  // Low frequency conversation list polling (every 20s when visible)
  useEffect(() => {
    const timer = setInterval(() => {
      if (typeof document !== "undefined" && !document.hidden) {
        fetch(`${API_URL}/messages/conversations`, { headers: authHeaders() })
          .then((res) => (res.ok ? res.json() : []))
          .then((data) => {
            if (Array.isArray(data)) setConversations(data);
          })
          .catch(() => {});
      }
    }, 20000);
    return () => clearInterval(timer);
  }, []);

  const active = conversations.find((c) => c.id === activeId);
  const other = active?.participants.find((p) => p.id !== me) ?? active?.participants[0];
  const otherName = other?.name || "Programme Team";

  // Typing heartbeat sender
  const handleDraftChange = (text: string) => {
    setDraft(text);
    if (!activeId) return;
    fetch(`${API_URL}/messages/conversations/${activeId}/typing`, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ typing: true }),
    }).catch(() => {});

    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => {
      fetch(`${API_URL}/messages/conversations/${activeId}/typing`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ typing: false }),
      }).catch(() => {});
    }, 3000);
  };

  // Timeline with date grouping
  const timeline = useMemo<Entry[]>(() => {
    const sameTime = (n: Notice, x: Session) =>
      !!n.schedule && new Date(n.schedule).getTime() === new Date(x.startTime).getTime();
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
    bottomRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [timeline.length, isOtherTyping]);

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

  const links = useMemo(() => {
    const found = messages.flatMap((m) => m.content.match(URL_PATTERN) ?? []);
    const joins = sessions.filter((s) => s.joinUrl).map((s) => s.joinUrl as string);
    return [...new Set([...joins, ...found])];
  }, [messages, sessions]);

  // File upload handler
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingFile(true);
    setError("");
    try {
      const res = await fetch(`${API_URL}/uploads`, {
        method: "POST",
        headers: {
          "Content-Type": file.type || "application/octet-stream",
          ...authHeaders(),
        },
        body: file,
      });
      if (!res.ok) {
        throw new Error("Failed to upload file. Please check file type and size.");
      }
      const data = await res.json();
      setPendingAttachment({
        url: data.url,
        name: file.name,
        type: file.type,
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploadingFile(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // Send message
  const send = async (e: FormEvent) => {
    e.preventDefault();
    const content = draft.trim();
    const attachmentUrl = pendingAttachment?.url;
    if ((!content && !attachmentUrl) || !activeId) return;

    setSending(true);
    setError("");
    try {
      const res = await fetch(`${API_URL}/messages/conversations/${activeId}`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          content,
          attachmentUrl: attachmentUrl || undefined,
        }),
      });
      if (res.ok) {
        setDraft("");
        setPendingAttachment(null);
        setEmojiDrawerOpen(false);
        if (soundEnabled) playTone(800, 1200, 0.08);
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

  // Delete/unsend message
  const handleDeleteMessage = async (msgId: string) => {
    if (!confirm("Are you sure you want to delete this message?")) return;
    try {
      setMessages((prev) => prev.filter((m) => m.id !== msgId));
      await fetch(`${API_URL}/messages/conversations/${activeId}/messages/${msgId}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
    } catch {
      await loadMessages(activeId);
    }
  };

  const isImageAttachment = (url?: string | null) => {
    if (!url) return false;
    return /\.(jpe?g|png|webp|gif)$/i.test(url) || url.includes("cloudinary.com");
  };

  const visibleContacts = useMemo(() => {
    const seen = new Set<string>();
    return conversations
      .filter((c) => {
        const otherId = c.participants.find((p) => p.id !== me)?.id || c.id;
        if (seen.has(otherId)) return false;
        seen.add(otherId);
        return true;
      })
      .filter((c) => {
        const name = (c.participants.find((p) => p.id !== me)?.name || "").toLowerCase();
        return name.includes(contactQuery.trim().toLowerCase());
      });
  }, [conversations, me, contactQuery]);

  return (
    <div className={`${styles.container} ${infoOpen ? styles.withInfo : ""} ${threadOpen ? styles.threadOpen : ""}`}>
      {/* Conversations sidebar */}
      <aside className={styles.chatSidebar}>
        <h1 className={styles.heading}>Messages</h1>
        <label className={styles.searchBox}>
          {Icon.search}
          <input
            type="search"
            placeholder="Search conversations..."
            aria-label="Search conversations"
            value={contactQuery}
            onChange={(e) => setContactQuery(e.target.value)}
          />
        </label>
        <div className={styles.contactList}>
          {visibleContacts.map((c) => {
            const name = c.participants.find((p) => p.id !== me)?.name || "Programme Team";
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => { setActiveId(c.id); setThreadOpen(true); loadMessages(c.id); }}
                className={`${styles.contact} ${c.id === activeId ? styles.active : ""}`}
              >
                <span className={styles.avatar}>{initialsOf(name)}</span>
                <span className={styles.contactInfo}>
                  <strong>{name}</strong>
                  {c.isTyping ? (
                    <span className={styles.typingBadgeList}>typing...</span>
                  ) : (
                    <span>
                      {c.lastMessage?.attachmentUrl && !c.lastMessage.content ? "📎 Attachment" : c.lastMessage ? c.lastMessage.content : "No messages yet"}
                    </span>
                  )}
                </span>
                {c.unread > 0 && <span className={styles.badge}>{c.unread}</span>}
              </button>
            );
          })}
          {!loading && visibleContacts.length === 0 && <p className={styles.hint}>No conversations found.</p>}
        </div>
      </aside>

      {/* Main chat window */}
      <section className={styles.chatWindow}>
        <header className={styles.chatHeader}>
          <button
            type="button"
            onClick={() => { setThreadOpen(false); setInfoOpen(false); }}
            aria-label="Back to conversations"
            className={`${styles.iconBtn} ${styles.backBtn}`}
          >
            {Icon.back}
          </button>
          <span className={styles.avatar}>{initialsOf(otherName)}</span>
          <div className={styles.headerText}>
            <strong>{otherName}</strong>
            {isOtherTyping ? (
              <span className={styles.typingHeader}>typing...</span>
            ) : (
              <span className={styles.onlineStatus}>
                <span className={styles.onlineDot} /> Online
              </span>
            )}
          </div>

          {/* Sound toggle */}
          <button
            type="button"
            onClick={toggleSound}
            aria-label={soundEnabled ? "Mute chat sounds" : "Unmute chat sounds"}
            className={styles.iconBtn}
            title={soundEnabled ? "Mute sounds" : "Enable sounds"}
          >
            {soundEnabled ? Icon.soundOn : Icon.soundOff}
          </button>

          {/* Info toggle */}
          <button
            type="button"
            onClick={() => setInfoOpen((v) => !v)}
            aria-label="Conversation details"
            aria-pressed={infoOpen}
            className={`${styles.iconBtn} ${infoOpen ? styles.iconBtnOn : ""}`}
          >
            {Icon.info}
          </button>
        </header>

        {/* Message timeline with WhatsApp day grouping */}
        <div className={styles.chatMessages} ref={threadRef}>
          {loading ? (
            <p className={styles.hint}>Loading messages...</p>
          ) : timeline.length === 0 ? (
            <p className={styles.hint}>{chatQuery ? "Nothing in this chat matches your search." : `Say hello to ${otherName}.`}</p>
          ) : (
            timeline.map((entry, idx) => {
              const prevEntry = timeline[idx - 1];
              const currentDate = new Date(entry.at).toDateString();
              const prevDate = prevEntry ? new Date(prevEntry.at).toDateString() : null;
              const showDateDivider = currentDate !== prevDate;

              return (
                <div key={entry.kind === "note" ? `n-${entry.notice.id}` : entry.message.id}>
                  {showDateDivider && (
                    <div className={styles.dateDivider}>
                      <span className={styles.dateBadge}>{formatDayLabel(new Date(entry.at).toISOString())}</span>
                    </div>
                  )}

                  {entry.kind === "note" ? (
                    <div className={styles.note}>
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
                    <div className={`${styles.msgRow} ${entry.message.senderId === me ? styles.sent : styles.received}`}>
                      <div className={styles.msgBubbleContainer}>
                        {entry.message.senderId === me && (
                          <div className={styles.msgActions}>
                            <button
                              type="button"
                              className={styles.actionBtn}
                              title="Delete message"
                              onClick={() => handleDeleteMessage(entry.message.id)}
                            >
                              {Icon.trash}
                            </button>
                          </div>
                        )}
                        <div className={`${styles.message} ${entry.message.senderId === me ? styles.sent : styles.received}`}>
                          <p>
                            {/* Attachment view */}
                            {entry.message.attachmentUrl && isSafeUrl(entry.message.attachmentUrl) && (
                              <div className={styles.attachmentWrapper}>
                                {isImageAttachment(entry.message.attachmentUrl) ? (
                                  <div
                                    className={styles.imageAttachment}
                                    onClick={() => setLightboxUrl(entry.message.attachmentUrl!)}
                                  >
                                    <img src={entry.message.attachmentUrl} alt="Photo attachment" loading="lazy" />
                                  </div>
                                ) : (
                                  <a
                                    href={entry.message.attachmentUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className={styles.fileAttachment}
                                    download
                                  >
                                    <span className={styles.fileIcon}>{Icon.doc}</span>
                                    <span className={styles.fileDetails}>
                                      <span className={styles.fileName}>
                                        {entry.message.attachmentUrl.split("/").pop() || "Document"}
                                      </span>
                                      <span className={styles.fileAction}>Click to download {Icon.download}</span>
                                    </span>
                                  </a>
                                )}
                              </div>
                            )}

                            {/* Text content */}
                            {entry.message.content && (
                              <span>{entry.message.content}</span>
                            )}

                            {/* Meta: Timestamp and WhatsApp checkmarks */}
                            <span className={styles.msgMeta}>
                              <span className={styles.time}>{clock(entry.message.createdAt)}</span>
                              {entry.message.senderId === me && (
                                <span className={`${styles.ticks} ${entry.message.read ? styles.tickRead : styles.tickSent}`}>
                                  {entry.message.read ? (
                                    <svg width="15" height="10" viewBox="0 0 16 11" fill="currentColor">
                                      <path d="M11.07 0.93a.75.75 0 0 0-1.06 0L5.3 5.64 3.47 3.8a.75.75 0 0 0-1.06 1.06l2.36 2.36a.75.75 0 0 0 1.06 0l5.24-5.23a.75.75 0 0 0 0-1.06z"/>
                                      <path d="M15.07 0.93a.75.75 0 0 0-1.06 0l-5.24 5.24a.75.75 0 1 0 1.06 1.06l4.71-4.71a.75.75 0 0 0 0-1.06l.53-.53z"/>
                                    </svg>
                                  ) : (
                                    <svg width="11" height="9" viewBox="0 0 12 10" fill="currentColor">
                                      <path d="M10.82.93a.75.75 0 0 0-1.06 0L4.5 6.19 2.24 3.93a.75.75 0 0 0-1.06 1.06l2.79 2.79a.75.75 0 0 0 1.06 0l5.79-5.79a.75.75 0 0 0 0-1.06z"/>
                                    </svg>
                                  )}
                                </span>
                              )}
                            </span>
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}

          {/* Typing wave indicator */}
          {isOtherTyping && (
            <div className={styles.typingBubble}>
              <span className={styles.typingText}>{otherName} is typing</span>
              <span className={styles.dot} />
              <span className={styles.dot} />
              <span className={styles.dot} />
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {error && <p role="alert" className={styles.error}>{error}</p>}

        {/* Emoji drawer */}
        {emojiDrawerOpen && (
          <div className={styles.emojiDrawer}>
            {QUICK_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                className={styles.emojiBtn}
                onClick={() => {
                  setDraft((prev) => prev + emoji);
                  handleDraftChange(draft + emoji);
                }}
              >
                {emoji}
              </button>
            ))}
          </div>
        )}

        {/* Uploading / Pending attachment pill */}
        {(uploadingFile || pendingAttachment) && (
          <div className={styles.uploadPreview}>
            <div className={styles.uploadInfo}>
              {uploadingFile ? (
                <>
                  <span className={styles.uploadSpinner} />
                  <span>Uploading attachment...</span>
                </>
              ) : (
                <>
                  <span className={styles.fileIcon}>{Icon.doc}</span>
                  <span className={styles.uploadName}>{pendingAttachment?.name}</span>
                </>
              )}
            </div>
            {pendingAttachment && (
              <button
                type="button"
                className={styles.clearUploadBtn}
                onClick={() => setPendingAttachment(null)}
                title="Remove attachment"
              >
                {Icon.close}
              </button>
            )}
          </div>
        )}

        {/* Chat input form */}
        <form className={styles.chatInput} onSubmit={send}>
          {/* Emoji toggle */}
          <button
            type="button"
            className={styles.iconBtn}
            onClick={() => setEmojiDrawerOpen((v) => !v)}
            title="Emoji drawer"
            aria-label="Add emoji"
          >
            {Icon.emoji}
          </button>

          {/* Hidden file input */}
          <input
            type="file"
            ref={fileInputRef}
            style={{ display: "none" }}
            onChange={handleFileUpload}
            accept="image/*,application/pdf,.doc,.docx,.txt"
          />

          {/* Attachment trigger */}
          <button
            type="button"
            className={styles.iconBtn}
            onClick={() => fileInputRef.current?.click()}
            title="Attach image or file"
            aria-label="Attach file"
            disabled={uploadingFile}
          >
            {Icon.attach}
          </button>

          <input
            type="text"
            placeholder={pendingAttachment ? "Add a caption..." : "Type a message..."}
            aria-label="Message"
            value={draft}
            onChange={(e) => handleDraftChange(e.target.value)}
            maxLength={4000}
            enterKeyHint="send"
          />

          <button
            type="submit"
            className={styles.sendBtn}
            disabled={sending || uploadingFile || (!draft.trim() && !pendingAttachment)}
            aria-label="Send message"
            onPointerDown={(e) => e.preventDefault()}
            onMouseDown={(e) => e.preventDefault()}
          >
            {Icon.send}
          </button>
        </form>
      </section>

      {/* Full screen photo lightbox */}
      {lightboxUrl && (
        <div className={styles.lightboxBackdrop} onClick={() => setLightboxUrl(null)}>
          <button
            type="button"
            className={styles.lightboxClose}
            onClick={() => setLightboxUrl(null)}
            aria-label="Close photo"
          >
            {Icon.close}
          </button>
          <img src={lightboxUrl} alt="Enlarged view" className={styles.lightboxImage} onClick={(e) => e.stopPropagation()} />
        </div>
      )}

      {/* Details drawer */}
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
              <span>Programme Team</span>
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
