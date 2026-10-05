"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import page from "../page.module.css";
import styles from "./messages.module.css";
import { API_URL, errorMessage } from "../lib/api";

type Participant = { id: string; name: string; role: string };
type Conversation = {
  id: string;
  participants: Participant[];
  lastMessage: { content: string; createdAt: string; senderId: string } | null;
  unread: number;
};
type Message = { id: string; senderId: string; senderName: string; content: string; createdAt: string };

const REFRESH_MS = 15_000;

const when = (iso: string) =>
  new Date(iso).toLocaleString([], { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

/** The learner in a conversation: the participant who is not staff. */
const learnerOf = (c: Conversation) =>
  c.participants.find((p) => p.role === "USER") ?? c.participants[0];

const initials = (name = "?") =>
  name.split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();

/** Shared inbox: every learner conversation, with replies sent as the signed-in staff member. */
export default function MessagesPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [myId, setMyId] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  const loadConversations = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/messages/conversations`);
      if (!res.ok) throw new Error(await errorMessage(res, "Could not load the inbox"));
      // a conversation whose learner account was deleted has nobody to show or reply to
      const all: Conversation[] = await res.json();
      setConversations(all.filter((c) => c.participants.some((p) => p.role === "USER")));
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the inbox");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadMessages = useCallback(async (id: string) => {
    try {
      const res = await fetch(`${API_URL}/messages/conversations/${id}`);
      if (!res.ok) throw new Error(await errorMessage(res, "Could not load the conversation"));
      setMessages(await res.json());
      // opening it marked the learner's messages as read
      setConversations((list) => list.map((c) => (c.id === id ? { ...c, unread: 0 } : c)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the conversation");
    }
  }, []);

  useEffect(() => {
    try {
      setMyId(JSON.parse(localStorage.getItem("user") ?? "{}").id ?? "");
    } catch {
      // no stored user: every bubble shows as the learner's
    }
    loadConversations();
  }, [loadConversations]);

  // keep the inbox and the open conversation fresh without a page reload
  useEffect(() => {
    const timer = window.setInterval(() => {
      loadConversations();
      if (activeId) loadMessages(activeId);
    }, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [activeId, loadConversations, loadMessages]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length, activeId]);

  const open = (id: string) => {
    setActiveId(id);
    setMessages([]);
    loadMessages(id);
  };

  const send = async (e: FormEvent) => {
    e.preventDefault();
    const content = draft.trim();
    if (!content || !activeId || sending) return;
    setSending(true);
    try {
      const res = await fetch(`${API_URL}/messages/conversations/${activeId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      if (!res.ok) throw new Error(await errorMessage(res, "Could not send the message"));
      setDraft("");
      await Promise.all([loadMessages(activeId), loadConversations()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send the message");
    } finally {
      setSending(false);
    }
  };

  const active = conversations.find((c) => c.id === activeId);
  const unreadTotal = conversations.reduce((sum, c) => sum + c.unread, 0);

  return (
    <div className={page.dashboard}>
      <header className={page.header}>
        <div className={page.headerText}>
          <h1 className={page.title}>Support Inbox</h1>
          <p className={page.subtitle}>
            Messages from learners. {unreadTotal > 0 ? `${unreadTotal} unread.` : "Nothing unread."}
          </p>
        </div>
      </header>

      {error && <p role="alert" className={styles.error}>{error}</p>}

      <div className={styles.inbox}>
        <ul className={styles.list} aria-label="Conversations">
          {loading ? (
            <li className={styles.placeholder}>Loading conversations...</li>
          ) : conversations.length === 0 ? (
            <li className={styles.placeholder}>
              No conversations yet. They appear here when a learner sends a message from the portal.
            </li>
          ) : (
            conversations.map((c) => {
              const learner = learnerOf(c);
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => open(c.id)}
                    aria-current={c.id === activeId}
                    className={`${styles.item} ${c.id === activeId ? styles.itemActive : ""}`}
                  >
                    <span className={styles.avatar} aria-hidden="true">{initials(learner?.name)}</span>
                    <span className={styles.itemText}>
                      <strong>{learner?.name ?? "Learner"}</strong>
                      <span>{c.lastMessage?.content ?? "No messages yet"}</span>
                    </span>
                    {c.unread > 0 && <span className={styles.unread} aria-label={`${c.unread} unread`}>{c.unread}</span>}
                  </button>
                </li>
              );
            })
          )}
        </ul>

        <section className={styles.thread}>
          {!active ? (
            <p className={styles.placeholder}>Select a conversation to read and reply.</p>
          ) : (
            <>
              <div className={styles.threadHead}>
                <h2>{learnerOf(active)?.name ?? "Learner"}</h2>
                <p>{active.lastMessage ? `Last message ${when(active.lastMessage.createdAt)}` : "No messages yet"}</p>
              </div>
              <div className={styles.messages} aria-live="polite">
                {messages.length === 0 ? (
                  <p className={styles.placeholder}>No messages in this conversation yet.</p>
                ) : (
                  messages.map((m) => (
                    <div key={m.id} className={`${styles.bubble} ${m.senderId === myId ? styles.mine : ""}`}>
                      {m.content}
                      <time dateTime={m.createdAt}>{m.senderId === myId ? "You" : m.senderName} · {when(m.createdAt)}</time>
                    </div>
                  ))
                )}
                <div ref={endRef} />
              </div>
              <form className={styles.composer} onSubmit={send}>
                <textarea
                  aria-label="Reply"
                  placeholder="Write a reply..."
                  rows={1}
                  maxLength={4000}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    // Enter sends, Shift+Enter adds a line
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      e.currentTarget.form?.requestSubmit();
                    }
                  }}
                />
                <button type="submit" className={styles.send} disabled={sending || !draft.trim()}>
                  {sending ? "Sending..." : "Send"}
                </button>
              </form>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
