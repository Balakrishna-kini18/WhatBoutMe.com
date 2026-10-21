"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signOutEverywhere as leavePortal } from "../lib/site";
import SignaturePad, { SignatureMethod } from "../agreement/SignaturePad";
import styles from "./profile.module.css";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

interface SavedSignatureState {
  hasSavedSignature: boolean;
  savedSignature: string | null;
  savedSignatureType: "DRAWN" | "UPLOADED" | null;
  savedSignatureUpdatedAt: string | null;
}

interface Profile {
  name: string | null;
  email: string;
  phone?: string | null;
  role: string;
  enrolledPrograms: { programId: string; programTitle: string; batchName: string; status: string; progress?: number }[];
  upcomingSessions?: { id: string }[];
}

interface DeviceSession {
  id: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  deviceInfo?: {
    browser: string;
    os: string;
    deviceType: 'desktop' | 'mobile' | 'tablet';
  };
  lastActive: string;
  createdAt: string;
  isCurrent: boolean;
}

/** The signed-in learner's account details and courses. */
export default function ProfilePage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [certificates, setCertificates] = useState(0);
  const [sessions, setSessions] = useState<DeviceSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  // Digital Signature state
  const [savedSig, setSavedSig] = useState<SavedSignatureState | null>(null);
  const [isEditingSig, setIsEditingSig] = useState(false);
  const [newSigData, setNewSigData] = useState<string | null>(null);
  const [newSigType, setNewSigType] = useState<SignatureMethod>("DRAWN");
  const [sigBusy, setSigBusy] = useState(false);
  const [sigMessage, setSigMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      router.push("/login");
      return;
    }
    const headers = { Authorization: `Bearer ${token}` };
    const mePromise = fetch(`${API_URL}/auth/me`, { headers })
      .then((res) => (res.ok ? res.json() : null))
      .catch(() => null);

    const certPromise = fetch(`${API_URL}/certificates/mine`, { headers })
      .then((res) => (res.ok ? res.json() : []))
      .catch(() => []);

    const sessionPromise = fetch(`${API_URL}/auth/sessions`, { headers })
      .then((res) => (res.ok ? res.json() : []))
      .catch(() => []);

    const sigPromise = fetch(`${API_URL}/agreements/saved-signature`, { headers })
      .then((res) => (res.ok ? res.json() : null))
      .catch(() => null);

    Promise.all([mePromise, certPromise, sessionPromise, sigPromise])
      .then(([meData, certData, sessionData, sigData]) => {
        setProfile(meData);
        setCertificates(Array.isArray(certData) ? certData.length : 0);
        setSessions(Array.isArray(sessionData) ? sessionData : []);
        setSavedSig(sigData);
      })
      .catch(() => {
        setProfile(null);
      })
      .finally(() => setLoading(false));
  }, [router]);

  const signOut = () => {
    window.dispatchEvent(new CustomEvent("wbm:open-signout-modal"));
  };

  // ends this account's sessions on every device, then signs out here
  const signOutEverywhere = async () => {
    setBusy(true);
    try {
      await fetch(`${API_URL}/auth/logout-all`, {
        method: "POST",
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      });
    } finally {
      signOut();
    }
  };

  const revokeSession = async (sessionId: string) => {
    const token = localStorage.getItem("token");
    if (!token) return;
    try {
      const res = await fetch(`${API_URL}/auth/sessions/${sessionId}/revoke`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setSessions((prev) => prev.filter((s) => s.id !== sessionId));
      }
    } catch (e) {}
  };

  const handleSaveNewSignature = async () => {
    if (!newSigData || newSigData.length < 10) return;
    setSigBusy(true);
    setSigMessage(null);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_URL}/agreements/saved-signature`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          signatureData: newSigData,
          signatureType: newSigType,
        }),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.message || "Failed to update profile signature.");
      }

      setSavedSig({
        hasSavedSignature: true,
        savedSignature: data.savedSignature,
        savedSignatureType: data.savedSignatureType,
        savedSignatureUpdatedAt: data.savedSignatureUpdatedAt,
      });
      setIsEditingSig(false);
      setNewSigData(null);
      setSigMessage({
        type: "success",
        text: "Digital signature saved to your profile successfully. It will be available for review in future program agreements.",
      });
    } catch (err: any) {
      setSigMessage({
        type: "error",
        text: err.message || "Failed to save digital signature.",
      });
    } finally {
      setSigBusy(false);
    }
  };

  const handleRemoveSignature = async () => {
    const confirmed = window.confirm(
      "Are you sure you want to remove your saved digital signature? Previously signed agreements will remain permanent and unchanged."
    );
    if (!confirmed) return;

    setSigBusy(true);
    setSigMessage(null);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_URL}/agreements/saved-signature`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.message || "Failed to remove signature.");
      }

      setSavedSig({
        hasSavedSignature: false,
        savedSignature: null,
        savedSignatureType: null,
        savedSignatureUpdatedAt: null,
      });
      setIsEditingSig(false);
      setNewSigData(null);
      setSigMessage({
        type: "success",
        text: "Saved digital signature removed from profile. Historical signed agreements remain immutable.",
      });
    } catch (err: any) {
      setSigMessage({
        type: "error",
        text: err.message || "Failed to remove signature.",
      });
    } finally {
      setSigBusy(false);
    }
  };

  if (loading) return <div className={styles.frame}><p className={styles.muted}>Loading your profile...</p></div>;
  if (!profile) return <div className={styles.frame}><p className={styles.muted}>We couldn&apos;t load your profile. Please refresh the page.</p></div>;

  const displayName = profile.name || "Learner";
  const initials = (profile.name || profile.email).split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((n) => n[0]).join("").toUpperCase();
  const accountType = profile.role === "USER" ? "Learner" : profile.role.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
  const cohort = profile.enrolledPrograms[0]?.batchName;

  const stats = [
    { label: "Courses", value: profile.enrolledPrograms.length },
    { label: "Scheduled Meetings", value: profile.upcomingSessions?.length ?? 0 },
    { label: "Certificates", value: certificates },
  ];

  const details = [
    { label: "Full Name", value: profile.name || "Not set" },
    { label: "Email Address", value: profile.email },
    { label: "Mobile Number", value: profile.phone || "Not set" },
    { label: "Account Type", value: accountType },
    { label: "Cohort", value: cohort || "Not enrolled" },
  ];

  return (
    <div className={styles.frame}>
      <article className={styles.panel}>
        <div className={styles.cover} />

        <header className={styles.head}>
          <span className={styles.avatarWrap}>
            <span className={styles.avatar}>{initials}</span>
            <span className={styles.mark} title="Verified learner">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12" /></svg>
            </span>
          </span>
          <div className={styles.identity}>
            <h1>{displayName}</h1>
            <p>{profile.email}</p>
            <div className={styles.badges}>
              <span className={styles.badge}>{accountType}</span>
              {cohort && <span className={`${styles.badge} ${styles.badgePlain}`}>{cohort}</span>}
            </div>
          </div>
          <div className={styles.actions}>
            <button type="button" onClick={signOut} className={styles.darkBtn}>Sign Out</button>
            <button type="button" onClick={signOutEverywhere} disabled={busy} className={styles.lineBtn}>
              {busy ? "Signing Out..." : "Sign Out of All Devices"}
            </button>
          </div>
        </header>

        <dl className={styles.stats}>
          {stats.map((s) => (
            <div key={s.label}>
              <dd>{s.value}</dd>
              <dt>{s.label}</dt>
            </div>
          ))}
        </dl>

        <div className={styles.columns}>
          <section>
            <h2 className={styles.sectionTitle}>Account Details</h2>
            <dl className={styles.detailList}>
              {details.map((d) => (
                <div key={d.label}>
                  <dt>{d.label}</dt>
                  <dd>{d.value}</dd>
                </div>
              ))}
            </dl>
            <p className={styles.note}>To change your name, email or password, contact your programme manager.</p>
          </section>

          <section>
            <h2 className={styles.sectionTitle}>My Courses</h2>
            {profile.enrolledPrograms.length === 0 ? (
              <p className={styles.muted}>You have not enrolled in a course yet.</p>
            ) : (
              <ul className={styles.courseList}>
                {profile.enrolledPrograms.map((p) => (
                  <li key={p.programId}>
                    <Link href={`/programs/${p.programId}/steps`} className={styles.course}>
                      <span className={styles.courseText}>
                        <strong>{p.programTitle}</strong>
                        <span>Cohort: {p.batchName}</span>
                      </span>
                      <span className={styles.courseProgress}>{p.progress ?? 0}%</span>
                      <span className={styles.open}>Open</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        {/* Digital Signature Profile Management */}
        <section className={styles.sigSection}>
          <div className={styles.sigHeader}>
            <div className={styles.sigTitleWrap}>
              <div className={styles.sigBadge}>
                <span className={styles.sigBadgeDot} />
                Profile Digital Signature
              </div>
              <h2 className={styles.sectionTitle}>Digital Signature</h2>
              <p className={styles.sigSubtitle}>
                Manage your reusable digital signature for program agreements. Updating or removing this signature affects future agreements only; all historical signed records remain immutable and unchanged.
              </p>
            </div>
            {!isEditingSig && savedSig?.hasSavedSignature && (
              <div className={styles.sigBtnGroup}>
                <button
                  type="button"
                  onClick={() => {
                    setIsEditingSig(true);
                    setSigMessage(null);
                  }}
                  className={styles.lineBtn}
                >
                  Replace Signature
                </button>
                <button
                  type="button"
                  onClick={handleRemoveSignature}
                  disabled={sigBusy}
                  className={styles.revokeBtn}
                >
                  {sigBusy ? "Removing..." : "Remove"}
                </button>
              </div>
            )}
          </div>

          {sigMessage && (
            <div className={sigMessage.type === "success" ? styles.sigSuccessMsg : styles.sigErrorMsg}>
              {sigMessage.text}
            </div>
          )}

          {isEditingSig ? (
            <div className={styles.sigEditorBox}>
              <div className={styles.sigEditorHeader}>
                <span className={styles.sigEditorTitle}>
                  {savedSig?.hasSavedSignature ? "Replace Digital Signature" : "Create Profile Signature"}
                </span>
                <span className={styles.sigMetaTag}>Future Agreements Only</span>
              </div>
              <SignaturePad
                onSignatureChange={(data, method) => {
                  setNewSigData(data);
                  setNewSigType(method);
                }}
                height={160}
              />
              <p className={styles.sigEditorNotice}>
                By saving, this signature will be stored securely against your learner account and offered for review in future program enrollments.
              </p>
              <div className={styles.sigEditorActions}>
                <button
                  type="button"
                  onClick={() => {
                    setIsEditingSig(false);
                    setNewSigData(null);
                  }}
                  disabled={sigBusy}
                  className={styles.lineBtn}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveNewSignature}
                  disabled={sigBusy || !newSigData}
                  className={styles.darkBtn}
                >
                  {sigBusy ? "Saving..." : "Save to Profile"}
                </button>
              </div>
            </div>
          ) : savedSig?.hasSavedSignature ? (
            <div className={styles.sigCard}>
              <div className={styles.sigPreviewRow}>
                <div className={styles.sigImgContainer}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={savedSig.savedSignature!}
                    alt="Learner Saved Profile Signature"
                    className={styles.sigImg}
                  />
                </div>
                <div className={styles.sigMetaWrap}>
                  <div className={styles.sigMetaTitle}>
                    <span>Active Profile Signature</span>
                    <span className={styles.sigMetaTag}>
                      {savedSig.savedSignatureType === "UPLOADED" ? "Uploaded Image" : "Drawn Signature"}
                    </span>
                  </div>
                  <p className={styles.sigMetaDate}>
                    {savedSig.savedSignatureUpdatedAt
                      ? `Last updated: ${new Date(savedSig.savedSignatureUpdatedAt).toLocaleString()}`
                      : "Verified on authenticated profile"}
                  </p>
                  <p className={styles.sigMetaNote}>
                    Secured in private storage. When you enroll in a new program, this signature will be displayed for your explicit review and confirmation.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className={styles.sigEmptyWrap}>
              <div className={styles.sigEmptyIcon}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                </svg>
              </div>
              <h3 className={styles.sigEmptyTitle}>No Profile Signature Saved</h3>
              <p className={styles.sigEmptyDesc}>
                Your signature is automatically saved here when you sign your first program agreement, or you can create one in advance.
              </p>
              <button
                type="button"
                onClick={() => {
                  setIsEditingSig(true);
                  setSigMessage(null);
                }}
                className={styles.darkBtn}
              >
                Add Digital Signature
              </button>
            </div>
          )}
        </section>

        <section className={styles.deviceSection}>
          <div className={styles.deviceHeader}>
            <div>
              <h2 className={styles.sectionTitle}>Active Devices &amp; Security</h2>
              <p className={styles.policyNote}>Single Active Device Enforced (1 Device Max)</p>
              <p className={styles.deviceSubtitle}>
                To protect your course materials and prevent unauthorized sharing, WhatBoutMe limits each account to <strong>1 active session</strong>. Signing in on another browser or device automatically signs out previous sessions.
              </p>
            </div>
            {sessions.length > 1 && (
              <button
                type="button"
                onClick={signOutEverywhere}
                disabled={busy}
                className={styles.lineBtn}
              >
                Sign Out Other Devices
              </button>
            )}
          </div>

          <div className={styles.deviceGrid}>
            {sessions.map((sess) => (
              <div
                key={sess.id}
                className={`${styles.deviceCard} ${sess.isCurrent ? styles.deviceCardActive : ''}`}
              >
                <div className={styles.deviceIconWrap}>
                  {sess.deviceInfo?.deviceType === 'mobile' ? (
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
                      <line x1="12" y1="18" x2="12.01" y2="18" />
                    </svg>
                  ) : sess.deviceInfo?.deviceType === 'tablet' ? (
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="4" y="2" width="16" height="20" rx="2" ry="2" />
                      <line x1="12" y1="18" x2="12.01" y2="18" />
                    </svg>
                  ) : (
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                      <line x1="8" y1="21" x2="16" y2="21" />
                      <line x1="12" y1="17" x2="12" y2="21" />
                    </svg>
                  )}
                </div>
                <div className={styles.deviceInfo}>
                  <div className={styles.deviceTitleRow}>
                    <strong className={styles.deviceTitle}>
                      {sess.deviceInfo?.browser || "Web Browser"} on {sess.deviceInfo?.os || "Desktop Device"}
                    </strong>
                    {sess.isCurrent && (
                      <span className={styles.currentBadge}>This Device</span>
                    )}
                  </div>
                  <div className={styles.deviceMeta}>
                    <span>IP: {sess.ipAddress || "127.0.0.1"}</span>
                    <span>•</span>
                    <span>{sess.isCurrent ? "Active now" : `Last active ${new Date(sess.lastActive).toLocaleDateString()}`}</span>
                  </div>
                </div>
                {!sess.isCurrent && (
                  <button
                    type="button"
                    onClick={() => revokeSession(sess.id)}
                    className={styles.revokeBtn}
                    title="Revoke session"
                  >
                    Revoke
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>
      </article>
    </div>
  );
}
