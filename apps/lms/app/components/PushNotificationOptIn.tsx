"use client";

import { useEffect, useState } from "react";
import styles from "./PushNotificationOptIn.module.css";
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
    <>
      {/* phones: dims the page behind the centred pop-up */}
      <div className={styles.backdrop} aria-hidden="true" />
      <div role="region" aria-label="Push notifications prompt" className={styles.card}>
        {subscribedMessage ? (
          <div className={styles.done}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
            <span>{subscribedMessage}</span>
          </div>
        ) : (
          <>
            <div className={styles.head}>
              <div className={styles.icon} aria-hidden="true">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
                  <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
                </svg>
              </div>
              <div>
                <p className={styles.title}>Enable Instant Notifications</p>
                <p className={styles.text}>
                  Get real-time alerts for live session reminders (24h &amp; 1h), new steps unlocked, and instructor announcements.
                </p>
              </div>
            </div>
            <div className={styles.actions}>
              <button type="button" onClick={handleDismiss} className={styles.later}>
                Not Now
              </button>
              <button type="button" onClick={handleSubscribe} disabled={isSubscribing} className={styles.allow}>
                {isSubscribing ? "Enabling..." : "Allow Alerts"}
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
}
