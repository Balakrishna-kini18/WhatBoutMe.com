"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import ProfileLoading from "./loading";
import ConfirmModal from "../components/ui/ConfirmModal";
import ProfileHeroCard from "./components/ProfileHeroCard";
import ProfileStatsRow from "./components/ProfileStatsRow";
import AccountDetailsCard from "./components/AccountDetailsCard";
import ProfileCoursesCard from "./components/ProfileCoursesCard";
import DigitalSignatureSection, {
  SavedSignatureState,
} from "./components/DigitalSignatureSection";
import AccountActionsCard from "./components/AccountActionsCard";
import ActiveDevicesSecuritySection, {
  DeviceSession,
} from "./components/ActiveDevicesSecuritySection";
import { SignatureMethod } from "../agreement/SignaturePad";
import { API_URL, getAuthHeaders } from "../lib/api";
import styles from "./profile.module.css";

interface Profile {
  name: string | null;
  email: string;
  phone?: string | null;
  role: string;
  enrolledPrograms: {
    programId: string;
    programTitle: string;
    batchName: string;
    status: string;
    progress?: number;
  }[];
  upcomingSessions?: { id: string }[];
}

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
  const [sigMessage, setSigMessage] = useState<{
    text: string;
    type: "success" | "error";
  } | null>(null);
  const [showRemoveSigConfirm, setShowRemoveSigConfirm] = useState(false);

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
    } catch {
      // Ignored
    }
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
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to save digital signature.";
      setSigMessage({
        type: "error",
        text: message,
      });
    } finally {
      setSigBusy(false);
    }
  };

  const handleRemoveSignatureClick = () => {
    setShowRemoveSigConfirm(true);
  };

  const handleConfirmRemoveSignature = async () => {
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
      setShowRemoveSigConfirm(false);
      setSigMessage({
        type: "success",
        text: "Saved digital signature removed from profile. Historical signed agreements remain immutable.",
      });
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to remove signature.";
      setSigMessage({
        type: "error",
        text: message,
      });
    } finally {
      setSigBusy(false);
    }
  };

  if (loading) return <ProfileLoading />;

  if (!profile) {
    return (
      <div className={styles.profileContainer}>
        <div className={styles.errorCard}>
          <h2>We couldn&apos;t load your profile</h2>
          <p>Please refresh the page to retrieve your learner account details.</p>
          <button
            type="button"
            className={styles.heroDarkBtn}
            onClick={() => window.location.reload()}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const displayName = profile.name || profile.email.split("@")[0] || "Learner";
  const initials = (profile.name || profile.email)
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0])
    .join("")
    .toUpperCase();

  const accountType =
    profile.role === "USER"
      ? "Learner"
      : profile.role
          .replace(/_/g, " ")
          .toLowerCase()
          .replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <div className={styles.profileContainer}>
      <div className={styles.profileContentStack}>
        {/* 1. Hero Profile Header Card */}
        <ProfileHeroCard
          displayName={displayName}
          email={profile.email}
          role={profile.role}
          initials={initials || "L"}
          accountType={accountType}
        />

        {/* 2. Account Details Card (Placed together at the beginning with Profile Hero) */}
        <AccountDetailsCard
          fullName={profile.name || "Not set"}
          email={profile.email}
          phone={profile.phone || "Not set"}
          accountType={accountType}
        />

        {/* 3. Three Summary Metric Stats Cards */}
        <ProfileStatsRow
          coursesCount={profile.enrolledPrograms.length}
          scheduledMeetingsCount={profile.upcomingSessions?.length ?? 0}
          certificatesCount={certificates}
        />

        {/* 4. Digital Signature Section */}
        <DigitalSignatureSection
          savedSig={savedSig}
          isEditingSig={isEditingSig}
          setIsEditingSig={setIsEditingSig}
          newSigData={newSigData}
          setNewSigData={setNewSigData}
          setNewSigType={setNewSigType}
          sigBusy={sigBusy}
          sigMessage={sigMessage}
          setSigMessage={setSigMessage}
          handleSaveNewSignature={handleSaveNewSignature}
          handleRemoveSignatureClick={handleRemoveSignatureClick}
        />

        {/* 5. Active Devices & Security Section */}
        <ActiveDevicesSecuritySection
          sessions={sessions}
          onSignOutEverywhere={signOutEverywhere}
          onRevokeSession={revokeSession}
          isBusy={busy}
        />

        {/* 6. Account Session & Sign Out Card */}
        <AccountActionsCard
          onSignOut={signOut}
          onSignOutEverywhere={signOutEverywhere}
          isBusy={busy}
        />
      </div>

      {/* Confirmation Dialog for Signature Revocation */}
      <ConfirmModal
        isOpen={showRemoveSigConfirm}
        onClose={() => {
          if (!sigBusy) setShowRemoveSigConfirm(false);
        }}
        onConfirm={handleConfirmRemoveSignature}
        title="Remove Saved Signature"
        message="Are you sure you want to remove your saved digital signature? Previously signed agreements will remain permanent and unchanged."
        confirmText="Remove Signature"
        cancelText="Cancel"
        tone="danger"
        isLoading={sigBusy}
      />
    </div>
  );
}
