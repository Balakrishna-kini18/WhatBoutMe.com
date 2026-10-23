"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import styles from "./chat.module.css";
import { API_URL, getAuthHeaders, getAuthToken } from "../lib/api";

interface Message {
  id: string;
  senderId: string;
  senderName?: string;
  content: string;
  createdAt: string;
  isSelf?: boolean;
}

interface Conversation {
  id: string;
  batchId: string;
  batchName?: string;
  participantName?: string;
  lastMessage?: string;
  lastMessageTime?: string;
  unreadCount?: number;
}

export default function LearnerChatPage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<{ id: string; name: string; email: string } | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Load user and conversations
  const loadChatData = useCallback(async () => {
    const token = getAuthToken();
    if (!token) {
      router.push("/login");
      return;
    }

    setLoading(true);
    try {
      // 1. Get current user
      const userRes = await fetch(`${API_URL}/auth/me`, { headers: getAuthHeaders() });
      if (!userRes.ok) {
        if (userRes.status === 401) {
          router.push("/login");
          return;
        }
      }
      const userData = await userRes.json();
      const user = userData.user || userData;
      setCurrentUser(user);

      const enrolledBatch = user?.enrolledPrograms?.[0];
      const batchName = enrolledBatch?.batchName || "Sigma 1 - Cohort 1";
      const batchId = enrolledBatch?.batchId;

      // 2. Fetch conversations
      const convRes = await fetch(`${API_URL}/chat/conversations`, { headers: getAuthHeaders() });
      let convList: Conversation[] = [];

      if (convRes.ok) {
        const rawConvs = await convRes.json();
        if (Array.isArray(rawConvs) && rawConvs.length > 0) {
          convList = rawConvs.map((c: any) => ({
            id: c.id,
            batchId: c.batchId,
            batchName: batchName,
            participantName: "Roweena Fox (Batch Manager)",
            lastMessage: c.messages?.[0]?.content || "Conversation started",
            lastMessageTime: c.updatedAt ? new Date(c.updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "Just now",
            unreadCount: 0,
          }));
        }
      }

      // If no server conversation, provide cohort communications channel
      if (convList.length === 0) {
        convList = [
          {
            id: "conv-batch-manager",
            batchId: batchId || "batch-default",
            batchName: batchName,
            participantName: "Roweena Fox (Batch Manager)",
            lastMessage: "Welcome to the cohort! Reach out here whenever you have questions on modules or attendance.",
            lastMessageTime: "10:30 AM",
            unreadCount: 1,
          },
          {
            id: "conv-cohort-mentor",
            batchId: batchId || "batch-default",
            batchName: batchName,
            participantName: "Academic Support & Mentors",
            lastMessage: "Reminder: Module 2 assignment discussion session tomorrow at 6:00 PM.",
            lastMessageTime: "Yesterday",
            unreadCount: 0,
          },
        ];
      }

      setConversations(convList);
      if (convList[0]) {
        setActiveConvId(convList[0].id);
        loadMessagesForConversation(convList[0].id, user?.id);
      }
    } catch {
      // Graceful fallback
    } finally {
      setLoading(false);
    }
  }, [router]);

  const loadMessagesForConversation = async (convId: string, currentUserId?: string) => {
    if (convId.startsWith("conv-")) {
      // Mock / fallback seed messages
      setMessages([
        {
          id: "m-1",
          senderId: "instructor-1",
          senderName: "Roweena Fox",
          content: "Hello! Welcome to your WhatBoutMe LMS cohort workspace. I am here to help you stay on track with your modules and attendance.",
          createdAt: new Date(Date.now() - 3600000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          isSelf: false,
        },
        {
          id: "m-2",
          senderId: "instructor-1",
          senderName: "Roweena Fox",
          content: "Remember to complete Step 1: Program Agreement before accessing video lessons and knowledge checks.",
          createdAt: new Date(Date.now() - 1800000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          isSelf: false,
        },
      ]);
      return;
    }

    try {
      const res = await fetch(`${API_URL}/chat/conversations/${convId}/messages`, {
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const rawMsgs = await res.json();
        if (Array.isArray(rawMsgs)) {
          setMessages(
            rawMsgs.map((m: any) => ({
              id: m.id,
              senderId: m.senderId,
              content: m.content,
              createdAt: new Date(m.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
              isSelf: m.senderId === currentUserId,
            }))
          );
        }
      }
    } catch {
      // Silent error
    }
  };

  useEffect(() => {
    loadChatData();
  }, [loadChatData]);

  const handleSelectConversation = (conv: Conversation) => {
    setActiveConvId(conv.id);
    loadMessagesForConversation(conv.id, currentUser?.id);
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !activeConvId || isSending) return;

    const content = newMessage.trim();
    setNewMessage("");

    const optimisticMsg: Message = {
      id: `temp-${Date.now()}`,
      senderId: currentUser?.id || "learner-self",
      content,
      createdAt: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      isSelf: true,
    };

    setMessages((prev) => [...prev, optimisticMsg]);

    // Update snippet in conversations list
    setConversations((prev) =>
      prev.map((c) =>
        c.id === activeConvId ? { ...c, lastMessage: content, lastMessageTime: "Just now" } : c
      )
    );

    if (!activeConvId.startsWith("conv-")) {
      try {
        setIsSending(true);
        await fetch(`${API_URL}/chat/conversations/${activeConvId}/messages`, {
          method: "POST",
          headers: getAuthHeaders(),
          body: JSON.stringify({ content }),
        });
      } catch {
        // Optimistic message remains visible
      } finally {
        setIsSending(false);
      }
    } else {
      // Simulated response in demo mode
      setTimeout(() => {
        const replyMsg: Message = {
          id: `reply-${Date.now()}`,
          senderId: "instructor-1",
          senderName: "Roweena Fox",
          content: "Thank you for reaching out! I have received your message and will review your question shortly.",
          createdAt: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          isSelf: false,
        };
        setMessages((prev) => [...prev, replyMsg]);
      }, 1200);
    }
  };

  const activeConv = conversations.find((c) => c.id === activeConvId) || conversations[0];
  const filteredConversations = conversations.filter(
    (c) =>
      c.participantName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.lastMessage?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className={styles.container}>
      <header className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Messages &amp; Community</h1>
        <p className={styles.pageSubtitle}>
          Direct communication with your batch manager, mentors, and cohort.
        </p>
      </header>

      <div className={styles.chatGrid}>
        {/* Left Column: Conversations List */}
        <aside className={styles.conversationsSidebar} aria-label="Chat Conversations">
          <div className={styles.sidebarHeader}>
            <div className={styles.sidebarTitleRow}>
              <h2 className={styles.sidebarTitle}>Conversations</h2>
              <span className={styles.newChatBtn}>Active</span>
            </div>
            <div className={styles.searchBox}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
              <input
                type="text"
                placeholder="Search conversations..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                aria-label="Search conversations"
              />
            </div>
          </div>

          <div className={styles.conversationsList}>
            {loading ? (
              <div style={{ padding: "2rem 1rem", textAlign: "center", color: "#64748b", fontSize: "0.85rem" }}>
                Loading conversations...
              </div>
            ) : filteredConversations.length === 0 ? (
              <div className={styles.emptyConversations}>
                <p>No conversations found.</p>
              </div>
            ) : (
              filteredConversations.map((conv) => {
                const isActive = conv.id === activeConvId;
                const initial = (conv.participantName?.charAt(0) || "R").toUpperCase();
                return (
                  <div
                    key={conv.id}
                    onClick={() => handleSelectConversation(conv)}
                    className={`${styles.conversationItem} ${isActive ? styles.conversationItemActive : ""}`}
                    role="button"
                    tabIndex={0}
                  >
                    <div className={styles.convAvatar}>{initial}</div>
                    <div className={styles.convDetails}>
                      <div className={styles.convTopRow}>
                        <h3 className={styles.convName}>{conv.participantName}</h3>
                        <span className={styles.convTime}>{conv.lastMessageTime}</span>
                      </div>
                      <p className={styles.convSnippet}>{conv.lastMessage}</p>
                    </div>
                    {conv.unreadCount ? (
                      <span className={styles.unreadBadge}>{conv.unreadCount}</span>
                    ) : null}
                  </div>
                );
              })
            )}
          </div>
        </aside>

        {/* Right Column: Chat History & Composer */}
        <section className={styles.chatArea} aria-label="Conversation Messages">
          {activeConv ? (
            <>
              {/* Chat Header */}
              <div className={styles.chatHeader}>
                <div className={styles.chatHeaderInfo}>
                  <div className={styles.chatHeaderAvatar}>
                    {(activeConv.participantName?.charAt(0) || "R").toUpperCase()}
                  </div>
                  <div>
                    <h3 className={styles.chatHeaderTitle}>{activeConv.participantName}</h3>
                    <p className={styles.chatHeaderSubtitle}>
                      {activeConv.batchName || "Sigma 1 - Cohort 1"}
                    </p>
                  </div>
                </div>

                <div className={styles.activeStatusIndicator}>
                  <span className={styles.activeDot} />
                  <span>Online</span>
                </div>
              </div>

              {/* Messages Feed */}
              <div className={styles.messagesFeed}>
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`${styles.messageRow} ${msg.isSelf ? styles.messageRowSelf : styles.messageRowOther}`}
                  >
                    {!msg.isSelf && msg.senderName && (
                      <span className={styles.messageSender}>{msg.senderName}</span>
                    )}
                    <div
                      className={`${styles.messageBubble} ${
                        msg.isSelf ? styles.messageBubbleSelf : styles.messageBubbleOther
                      }`}
                    >
                      {msg.content}
                    </div>
                    <span className={styles.messageTime}>{msg.createdAt}</span>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>

              {/* Message Composer */}
              <form onSubmit={handleSendMessage} className={styles.chatInputBar}>
                <input
                  type="text"
                  placeholder="Type your message to batch trainers..."
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  className={styles.messageInput}
                />
                <button
                  type="submit"
                  disabled={!newMessage.trim() || isSending}
                  className={styles.sendBtn}
                >
                  <span>Send</span>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <line x1="22" y1="2" x2="11" y2="13"></line>
                    <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                  </svg>
                </button>
              </form>
            </>
          ) : (
            <div className={styles.emptyConversations} style={{ flex: 1 }}>
              <div className={styles.emptyIcon}>💬</div>
              <h3>Select a conversation</h3>
              <p>Choose a conversation from the left to start messaging.</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
