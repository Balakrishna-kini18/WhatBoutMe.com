"use client";

import { useEffect, useState } from "react";
import { fetchVapidPublicKey, registerPushSubscription, urlBase64ToUint8Array } from "../lib/api";

export default function PushNotificationOptIn() {
  const [showPrompt, setShowPrompt] = useState(false);
  const [isSubscribing, setIsSubscribing] = useState(false);
  const [subscribedMessage, setSubscribedMessage] = useState<string | null>(null);

  useEffect(() => {
    // SSR and Feature Detection Guard
    if (typeof window === "undefined" || !("Notification" in window) || !("serviceWorker" in navigator)) {
      return;
    }

    // If already granted, ensure registered silently in background
    if (Notification.permission === "granted") {
      registerExistingSubscription().catch(() => {});
      return;
    }

    // If user already denied or recently dismissed, do not prompt
    if (Notification.permission === "denied") {
      return;
    }

    const dismissed = localStorage.getItem("wbm_push_prompt_dismissed");
    if (dismissed) {
      return;
    }

    // Show non-intrusive opt-in after short delay (3s) to not interrupt immediate page load
    const timer = setTimeout(() => {
      setShowPrompt(true);
    }, 3000);

    return () => clearTimeout(timer);
  }, []);

  const registerExistingSubscription = async () => {
    try {
      const reg = await navigator.serviceWorker.getRegistration("/sw.js");
      if (!reg) return;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await registerPushSubscription(sub);
      }
    } catch {
      // Silent background sync
    }
  };

  const handleSubscribe = async () => {
    if (typeof window === "undefined" || !("Notification" in window) || !("serviceWorker" in navigator)) {
      return;
    }

    setIsSubscribing(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setShowPrompt(false);
        setIsSubscribing(false);
        return;
      }

      // 1. Register Service Worker
      const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      await navigator.serviceWorker.ready;

      // 2. Fetch VAPID Public Key
      const vapidPublicKey = await fetchVapidPublicKey();
      if (!vapidPublicKey) {
        throw new Error("Push notifications server key not available");
      }

      // 3. Subscribe with PushManager
      const applicationServerKey = urlBase64ToUint8Array(vapidPublicKey);
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey,
      });

      // 4. Send token to backend API
      await registerPushSubscription(subscription);

      setSubscribedMessage("Push alerts enabled! You'll receive live session reminders & step unlocks.");
      setTimeout(() => {
        setShowPrompt(false);
      }, 3500);
    } catch (err: any) {
      console.warn("Could not register push notifications:", err.message);
      setShowPrompt(false);
    } finally {
      setIsSubscribing(false);
    }
  };

  const handleDismiss = () => {
    localStorage.setItem("wbm_push_prompt_dismissed", "true");
    setShowPrompt(false);
  };

  if (!showPrompt) return null;

  return (
    <div
      role="region"
      aria-label="Push notifications prompt"
      style={{
        position: "fixed",
        bottom: "24px",
        right: "24px",
        maxWidth: "380px",
        width: "calc(100vw - 48px)",
        background: "#ffffff",
        border: "1px solid #fae8ce",
        borderRadius: "14px",
        boxShadow: "0 12px 32px -4px rgba(224, 109, 40, 0.12), 0 4px 12px rgba(0, 0, 0, 0.08)",
        padding: "16px 20px",
        zIndex: 9999,
        animation: "slideInUp 0.3s ease-out forwards",
      }}
    >
      {subscribedMessage ? (
        <div style={{ display: "flex", alignItems: "center", gap: "12px", color: "#2f855a" }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
          <span style={{ fontSize: "0.875rem", fontWeight: 600 }}>{subscribedMessage}</span>
        </div>
      ) : (
        <div>
          <div style={{ display: "flex", alignItems: "flex-start", gap: "12px", marginBottom: "12px" }}>
            <div
              style={{
                width: "36px",
                height: "36px",
                borderRadius: "10px",
                background: "#fef3c7",
                color: "#d97706",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
                <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
              </svg>
            </div>
            <div>
              <p style={{ margin: 0, fontSize: "0.9375rem", fontWeight: 700, color: "#1a202c" }}>
                Enable Instant Notifications
              </p>
              <p style={{ margin: "4px 0 0", fontSize: "0.8125rem", color: "#4a5568", lineHeight: 1.45 }}>
                Get real-time alerts for live session reminders (24h &amp; 1h), new steps unlocked, and instructor announcements.
              </p>
            </div>
          </div>
          <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end", marginTop: "14px" }}>
            <button
              type="button"
              onClick={handleDismiss}
              style={{
                background: "transparent",
                border: "1px solid #e2e8f0",
                color: "#718096",
                borderRadius: "8px",
                padding: "7px 14px",
                fontSize: "0.8125rem",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Not Now
            </button>
            <button
              type="button"
              onClick={handleSubscribe}
              disabled={isSubscribing}
              style={{
                background: "#e06d28",
                border: "none",
                color: "#ffffff",
                borderRadius: "8px",
                padding: "7px 16px",
                fontSize: "0.8125rem",
                fontWeight: 700,
                cursor: isSubscribing ? "not-allowed" : "pointer",
                opacity: isSubscribing ? 0.7 : 1,
                boxShadow: "0 2px 6px rgba(224, 109, 40, 0.3)",
              }}
            >
              {isSubscribing ? "Enabling..." : "Allow Alerts"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
