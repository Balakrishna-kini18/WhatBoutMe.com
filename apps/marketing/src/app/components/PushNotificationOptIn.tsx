"use client";

import { useEffect, useState } from "react";
import styles from "./PushNotificationOptIn.module.css";
import { fetchVapidPublicKey, registerPushSubscription, urlBase64ToUint8Array } from "@/lib/api";

export default function PushNotificationOptIn() {
  const [showPrompt, setShowPrompt] = useState(false);
  const [isSubscribing, setIsSubscribing] = useState(false);
  const [subscribedMessage, setSubscribedMessage] = useState<string | null>(null);

  useEffect(() => {
    // SSR and Feature Detection Guard (guarded for iOS/Safari where PushManager may be absent)
    if (typeof window === "undefined" || !("Notification" in window) || !("serviceWorker" in navigator)) {
      return;
    }

    if (Notification.permission === "granted") {
      registerExistingSubscription().catch(() => {});
      return;
    }

    if (Notification.permission === "denied") {
      return;
    }

    const dismissed = localStorage.getItem("wbm_marketing_push_dismissed");
    if (dismissed) {
      return;
    }

    // Delay prompt by 4s on marketing pages
    const timer = setTimeout(() => {
      setShowPrompt(true);
    }, 4000);

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

      const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      await navigator.serviceWorker.ready;

      const vapidPublicKey = await fetchVapidPublicKey();
      if (!vapidPublicKey) {
        throw new Error("Push notifications server key not available");
      }

      const applicationServerKey = urlBase64ToUint8Array(vapidPublicKey);
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey,
      });

      await registerPushSubscription(subscription);

      setSubscribedMessage("Notifications enabled! You'll receive updates on upcoming workshops and events.");
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
    localStorage.setItem("wbm_marketing_push_dismissed", "true");
    setShowPrompt(false);
  };

  if (!showPrompt) return null;

  return (
    <>
      {/* phones: dims the page behind the centred pop-up */}
      <div className={styles.backdrop} aria-hidden="true" />
      <div role="region" aria-label="Event alerts prompt" className={styles.card}>
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
                <p className={styles.title}>Stay Informed On Upcoming Events</p>
                <p className={styles.text}>
                  Enable push notifications to be the first to know about new workshops, keynotes, and masterclasses.
                </p>
              </div>
            </div>
            <div className={styles.actions}>
              <button type="button" onClick={handleDismiss} className={styles.later}>
                Not Now
              </button>
              <button type="button" onClick={handleSubscribe} disabled={isSubscribing} className={styles.allow}>
                {isSubscribing ? "Enabling..." : "Notify Me"}
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
}
