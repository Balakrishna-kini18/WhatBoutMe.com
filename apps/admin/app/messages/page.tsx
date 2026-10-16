"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import page from "../page.module.css";
import styles from "./messages.module.css";
import { API_URL, errorMessage, cachedFetch } from "../lib/api";
import { ConfirmDialog, useToast } from "../components";

type Participant = { id: string; name: string; role: string };
type Conversation = {
  id: string;
  participants: Participant[];
  lastMessage: { content: string; createdAt: string; senderId: string; attachmentUrl?: string | null; read?: boolean } | null;
  unread: number;
  isTyping?: boolean;
  typingUser?: string | null;
};
type Message = {
  id: string;
  senderId: string;
  senderName: string;
  content: string;
  attachmentUrl?: string | null;
  read?: boolean;
  createdAt: string;
};

const REFRESH_MS = 4000;
const QUICK_EMOJIS = ["😊", "👍", "❤️", "😂", "🙏", "🔥", "🎉", "👏", "😮", "🙌", "💯", "✨"];

const clock = (iso: string) =>
  new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

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

/** The learner in a conversation: the participant who is not staff. */
const learnerOf = (c: Conversation) =>
  c.participants.find((p) => p.role === "USER") ?? c.participants[0];

const initials = (name = "?") =>
  name.split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();

const getAuthHeaders = (): Record<string, string> => {
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
};

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
    // blocked or unavailable
  }
}

/** Advanced WhatsApp-Grade Support Inbox for Admin & Managers */
export default function MessagesPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [myId, setMyId] = useState("");
  const [isLearnerTyping, setIsLearnerTyping] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [pendingFile, setPendingFile] = useState<{ url: string; name: string } | null>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const toast = useToast();
  const [messageToDelete, setMessageToDelete] = useState<Message | null>(null);
  const [isDeletingMessage, setIsDeletingMessage] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const typingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const prevMsgCountRef = useRef(0);

  const inFlightRef = useRef(false);

  const isSafeUrl = (url?: string | null): boolean => {
    if (!url) return false;
    return /^https?:\/\//i.test(url) || url.startsWith('/uploads/');
  };

  const loadConversations = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/messages/conversations`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error(await errorMessage(res, "Could not load the inbox"));
      const all: Conversation[] = await res.json();
      const seen = new Set<string>();
      const unique = all
        .filter((c) => c.participants.some((p) => p.role === "USER"))
        .filter((c) => {
          const learnerId = learnerOf(c)?.id || c.id;
          if (seen.has(learnerId)) return false;
          seen.add(learnerId);
          return true;
        });
      setConversations(unique);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the inbox");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadMessages = useCallback(async (id: string) => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      const [msgRes, typingRes] = await Promise.all([
        fetch(`${API_URL}/messages/conversations/${id}`, { headers: getAuthHeaders() }),
        fetch(`${API_URL}/messages/conversations/${id}/typing`, { headers: getAuthHeaders() }).catch(() => null),
      ]);
      if (!msgRes.ok) throw new Error(await errorMessage(msgRes, "Could not load the conversation"));
      const list: Message[] = await msgRes.json();

      if (list.length > prevMsgCountRef.current && prevMsgCountRef.current > 0) {
        const last = list[list.length - 1];
        if (last && last.senderId !== myId && soundEnabled) {
          playTone(600, 900, 0.12);
        }
      }
      prevMsgCountRef.current = list.length;
      setMessages(list);

      if (typingRes && typingRes.ok) {
        const activeTyping = await typingRes.json();
        setIsLearnerTyping(Array.isArray(activeTyping) && activeTyping.length > 0);
      }

      setConversations((all) => all.map((c) => (c.id === id ? { ...c, unread: 0 } : c)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the conversation");
    } finally {
      inFlightRef.current = false;
    }
  }, [myId, soundEnabled]);

  useEffect(() => {
    try {
      setMyId(JSON.parse(localStorage.getItem("user") ?? "{}").id ?? "");
    } catch {
      // no stored user
    }
    loadConversations();
  }, [loadConversations]);

  // Adaptive thread polling with Page Visibility API & backoff
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

  // Low frequency inbox list polling (every 20s when visible)
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (typeof document !== "undefined" && !document.hidden) {
        loadConversations();
      }
    }, 20000);
    return () => window.clearInterval(timer);
  }, [loadConversations]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [messages.length, activeId, isLearnerTyping]);

  const open = (id: string) => {
    setActiveId(id);
    setMessages([]);
    prevMsgCountRef.current = 0;
    loadMessages(id);
  };

  const handleDraftChange = (text: string) => {
    setDraft(text);
    if (!activeId) return;
    fetch(`${API_URL}/messages/conversations/${activeId}/typing`, {
      method: "POST",
      headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ typing: true }),
    }).catch(() => {});

    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => {
      fetch(`${API_URL}/messages/conversations/${activeId}/typing`, {
        method: "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ typing: false }),
      }).catch(() => {});
    }, 3000);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      const res = await fetch(`${API_URL}/uploads`, {
        method: "POST",
        headers: {
          "Content-Type": file.type || "application/octet-stream",
          ...getAuthHeaders(),
        },
        body: file,
      });
      if (!res.ok) throw new Error("Upload failed. Only images and documents allowed.");
      const data = await res.json();
      setPendingFile({ url: data.url, name: file.name });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const send = async (e: FormEvent) => {
    e.preventDefault();
    const content = draft.trim();
    const attachmentUrl = pendingFile?.url;
    if ((!content && !attachmentUrl) || !activeId || sending) return;

    // Optimistic UI update: immediately display message in chat stream
    const tempId = `temp-${Date.now()}`;
    const optimisticMessage: Message = {
      id: tempId,
      senderId: myId || "current-user",
      senderName: "You",
      content,
      attachmentUrl,
      read: true,
      createdAt: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, optimisticMessage]);
    setDraft("");
    setPendingFile(null);
    setEmojiOpen(false);
    if (soundEnabled) playTone(800, 1200, 0.08);

    setSending(true);
    try {
      const res = await fetch(`${API_URL}/messages/conversations/${activeId}`, {
        method: "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          content,
          attachmentUrl: attachmentUrl || undefined,
        }),
      });
      if (!res.ok) throw new Error(await errorMessage(res, "Could not send the message"));
      await Promise.all([loadMessages(activeId), loadConversations()]);
    } catch (err) {
      // Rollback optimistic message on network error and restore draft
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      setDraft(content);
      setError(err instanceof Error ? err.message : "Could not send the message");
    } finally {
      setSending(false);
    }
  };

  const confirmDeleteMessage = async () => {
    if (!messageToDelete || !activeId) return;
    const msgId = messageToDelete.id;
    setIsDeletingMessage(true);
    setMessages((prev) => prev.filter((m) => m.id !== msgId));
    toast.success("Message unsent.");
    setMessageToDelete(null);

    try {
      await cachedFetch(`${API_URL}/messages/conversations/${activeId}/messages/${msgId}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
      });
    } catch {
      if (activeId) loadMessages(activeId);
    } finally {
      setIsDeletingMessage(false);
    }
  };

  const isImage = (url?: string | null) => {
    if (!url) return false;
    return /\.(jpe?g|png|webp|gif)$/i.test(url) || url.includes("cloudinary.com");
  };

  const active = conversations.find((c) => c.id === activeId);
  const unreadTotal = conversations.reduce((sum, c) => sum + c.unread, 0);
  const activeLearner = active ? learnerOf(active) : null;

  return (
    <div className={page.dashboard}>
      <header className={page.header}>
        <div className={page.headerText}>
          <h1 className={page.title}>WhatsApp Support Inbox</h1>
          <p className={page.subtitle}>
            Direct chat with learners. {unreadTotal > 0 ? `${unreadTotal} unread.` : "All caught up."}
          </p>
        </div>
      </header>

      {error && <p role="alert" className={styles.error}>{error}</p>}

      <div className={styles.inbox}>
        {/* Left conversations list */}
        <ul className={styles.list} aria-label="Conversations">
          {loading ? (
            <li className={styles.placeholder}>Loading conversations...</li>
          ) : conversations.length === 0 ? (
            <li className={styles.placeholder}>
              No conversations yet. Messages from learners will appear here.
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
                      {c.isTyping ? (
                        <span className={styles.typingItemBadge}>typing...</span>
                      ) : (
                        <span>
                          {c.lastMessage?.attachmentUrl && !c.lastMessage.content ? "📎 Attachment" : c.lastMessage?.content ?? "No messages yet"}
                        </span>
                      )}
                    </span>
                    {c.unread > 0 && <span className={styles.unread} aria-label={`${c.unread} unread`}>{c.unread}</span>}
                  </button>
                </li>
              );
            })
          )}
        </ul>

        {/* Right thread window */}
        <section className={styles.thread}>
          {!active ? (
            <p className={styles.placeholder}>Select a learner from the inbox to read and reply.</p>
          ) : (
            <>
              <div className={styles.threadHead} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <h2>{activeLearner?.name ?? "Learner"}</h2>
                  {isLearnerTyping ? (
                    <span className={styles.typingStatus}>typing...</span>
                  ) : (
                    <span className={styles.onlineBadge}>
                      <span className={styles.onlineDot} /> Online
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  className={styles.toolBtn}
                  onClick={() => setSoundEnabled((v) => !v)}
                  title={soundEnabled ? "Mute chimes" : "Enable chimes"}
                >
                  {soundEnabled ? "🔔" : "🔕"}
                </button>
              </div>

              {/* Messages timeline with WhatsApp day grouping */}
              <div className={styles.messages} aria-live="polite">
                {messages.length === 0 ? (
                  <p className={styles.placeholder}>No messages in this conversation yet.</p>
                ) : (
                  messages.map((m, idx) => {
                    const prevM = messages[idx - 1];
                    const currentDate = new Date(m.createdAt).toDateString();
                    const prevDate = prevM ? new Date(prevM.createdAt).toDateString() : null;
                    const showDateDivider = currentDate !== prevDate;
                    const isMine = m.senderId === myId;

                    return (
                      <div key={m.id}>
                        {showDateDivider && (
                          <div className={styles.dateDivider}>
                            <span className={styles.dateBadge}>{formatDayLabel(m.createdAt)}</span>
                          </div>
                        )}

                        <div className={`${styles.msgRow} ${isMine ? styles.rowMine : styles.rowTheirs}`}>
                          <div className={styles.msgContainer}>
                            {isMine && (
                              <div className={styles.msgActions}>
                                <button
                                  type="button"
                                  className={styles.actionBtn}
                                  title="Delete message"
                                  onClick={() => setMessageToDelete(m)}
                                >
                                  🗑️
                                </button>
                              </div>
                            )}

                            <div className={`${styles.bubble} ${isMine ? styles.bubbleMine : styles.bubbleTheirs}`}>
                              {/* Attachment preview */}
                              {m.attachmentUrl && isSafeUrl(m.attachmentUrl) && (
                                <div className={styles.attachmentBox}>
                                  {isImage(m.attachmentUrl) ? (
                                    <div
                                      className={styles.imgThumb}
                                      onClick={() => setLightboxUrl(m.attachmentUrl!)}
                                    >
                                      <img src={m.attachmentUrl} alt="Attachment" loading="lazy" />
                                    </div>
                                  ) : (
                                    <a
                                      href={m.attachmentUrl}
                                      target="_blank"
                                      rel="noreferrer"
                                      download
                                      className={styles.fileCard}
                                    >
                                      <span className={styles.fileIcon}>DOC</span>
                                      <span>{m.attachmentUrl.split("/").pop() || "Document"}</span>
                                    </a>
                                  )}
                                </div>
                              )}

                              {m.content && <span className={styles.msgText}>{m.content}</span>}

                              <div className={styles.msgMeta}>
                                <span className={styles.timeText}>{clock(m.createdAt)}</span>
                                {isMine && (
                                  <span className={`${styles.ticks} ${m.read ? styles.tickRead : styles.tickSent}`}>
                                    {m.read ? (
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
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}

                {/* Animated wave dots when learner is typing */}
                {isLearnerTyping && (
                  <div className={styles.typingBubble}>
                    <span className={styles.typingText}>{activeLearner?.name || "Learner"} is typing</span>
                    <span className={styles.dot} />
                    <span className={styles.dot} />
                    <span className={styles.dot} />
                  </div>
                )}

                <div ref={endRef} />
              </div>

              {/* Emoji quick bar */}
              {emojiOpen && (
                <div className={styles.emojiBar}>
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

              {/* Pending upload banner */}
              {(uploading || pendingFile) && (
                <div className={styles.uploadBar}>
                  <span>{uploading ? "Uploading attachment..." : `📎 Attached: ${pendingFile?.name}`}</span>
                  {pendingFile && (
                    <button
                      type="button"
                      style={{ background: "none", border: "none", cursor: "pointer", color: "inherit" }}
                      onClick={() => setPendingFile(null)}
                    >
                      ✕
                    </button>
                  )}
                </div>
              )}

              {/* Composer */}
              <form className={styles.composer} onSubmit={send}>
                <button
                  type="button"
                  className={styles.toolBtn}
                  onClick={() => setEmojiOpen((v) => !v)}
                  title="Emoji"
                >
                  😊
                </button>

                <input
                  type="file"
                  ref={fileInputRef}
                  style={{ display: "none" }}
                  onChange={handleFileUpload}
                  accept="image/*,application/pdf,.doc,.docx,.txt"
                />

                <button
                  type="button"
                  className={styles.toolBtn}
                  onClick={() => fileInputRef.current?.click()}
                  title="Attach file"
                  disabled={uploading}
                >
                  📎
                </button>

                <textarea
                  aria-label="Reply"
                  placeholder={pendingFile ? "Add a caption..." : "Write a reply... (Enter to send)"}
                  rows={1}
                  maxLength={4000}
                  value={draft}
                  onChange={(e) => handleDraftChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      e.currentTarget.form?.requestSubmit();
                    }
                  }}
                />

                <button
                  type="submit"
                  className={styles.send}
                  disabled={sending || uploading || (!draft.trim() && !pendingFile)}
                  style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <line x1="22" y1="2" x2="11" y2="13" />
                    <polygon points="22 2 15 22 11 13 2 9 22 2" />
                  </svg>
                  <span>{sending ? "Sending..." : "Send"}</span>
                </button>
              </form>
            </>
          )}
        </section>
      </div>

      {/* Full screen photo lightbox */}
      {lightboxUrl && (
        <div className={styles.lightbox} onClick={() => setLightboxUrl(null)}>
          <button type="button" className={styles.lightboxClose} onClick={() => setLightboxUrl(null)}>✕</button>
          <img src={lightboxUrl} alt="Photo" onClick={(e) => e.stopPropagation()} />
        </div>
      )}

      {/* In-website branded ConfirmDialog */}
      <ConfirmDialog
        isOpen={Boolean(messageToDelete)}
        onClose={() => {
          if (!isDeletingMessage) setMessageToDelete(null);
        }}
        onConfirm={confirmDeleteMessage}
        title="Unsend Message"
        description={
          <>
            Are you sure you want to unsend this message? It will be removed for all participants.
            {messageToDelete?.content && (
              <div style={{ marginTop: "8px", padding: "10px", background: "#f8f5f0", borderRadius: "6px", fontStyle: "italic", fontSize: "0.85rem" }}>
                &ldquo;{messageToDelete.content}&rdquo;
              </div>
            )}
          </>
        }
        tone="danger"
        confirmText={isDeletingMessage ? "Unsending..." : "Unsend"}
        cancelText="Cancel"
        isLoading={isDeletingMessage}
      />
    </div>
  );
}
