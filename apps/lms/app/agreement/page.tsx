"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import styles from "../login/auth.module.css";
import {
  API_URL,
  getAuthHeaders,
  parseApiError,
  ActiveAgreementResponse,
  SignedAgreementResponse,
} from "../lib/api";
import SignaturePad from "./SignaturePad";

function AgreementSignContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryProgramId = searchParams.get("programId");
  const queryEnrolmentId = searchParams.get("enrolmentId");

  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Enrolment & Agreement state
  const [enrolment, setEnrolment] = useState<any>(null);
  const [activeTemplate, setActiveTemplate] = useState<ActiveAgreementResponse | null>(null);
  const [signedRecord, setSignedRecord] = useState<SignedAgreementResponse | null>(null);

  // Form states
  const [consentGiven, setConsentGiven] = useState(false);
  const [typedName, setTypedName] = useState("");
  const [drawnSignature, setDrawnSignature] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [justSignedSuccess, setJustSignedSuccess] = useState<SignedAgreementResponse | null>(null);

  useEffect(() => {
    document.body.classList.add("auth-page-active");
    return () => document.body.classList.remove("auth-page-active");
  }, []);

  useEffect(() => {
    initAgreementFlow();
  }, [queryProgramId, queryEnrolmentId]);

  const initAgreementFlow = async () => {
    setIsLoading(true);
    setLoadError(null);

    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    if (!token) {
      router.push("/login");
      return;
    }

    try {
      // 1. Fetch learner enrolments to identify the target enrolment
      const enrolRes = await fetch(`${API_URL}/enrollments/me`, {
        headers: getAuthHeaders(),
      });

      if (!enrolRes.ok) {
        throw new Error((await parseApiError(enrolRes, "Failed to load your enrolments")).message);
      }

      const enrolments = await enrolRes.json();
      const list = Array.isArray(enrolments) ? enrolments : [];

      if (list.length === 0) {
        setLoadError("You do not have any active course enrolments.");
        setIsLoading(false);
        return;
      }

      // Match target enrolment by queryEnrolmentId, queryProgramId, or first PENDING_AGREEMENT
      let target = null;
      if (queryEnrolmentId) {
        target = list.find((e: any) => e.id === queryEnrolmentId);
      } else if (queryProgramId) {
        target = list.find((e: any) => e.programId === queryProgramId);
      } else {
        target = list.find((e: any) => e.status === "PENDING_AGREEMENT") || list[0];
      }

      if (!target) {
        setLoadError("Could not find an enrolment corresponding to this agreement.");
        setIsLoading(false);
        return;
      }

      setEnrolment(target);

      // Pre-fill typed name from user storage if available
      try {
        const storedUser = localStorage.getItem("user");
        if (storedUser) {
          const u = JSON.parse(storedUser);
          const fullName = [u.firstName, u.lastName].filter(Boolean).join(" ") || u.name;
          if (fullName) setTypedName(fullName);
        }
      } catch {
        // ignore
      }

      // 2. Check if this enrolment already has a signed agreement
      const signedRes = await fetch(`${API_URL}/agreements/enrolments/${target.id}`, {
        headers: getAuthHeaders(),
      });

      if (signedRes.ok) {
        const existingSigned = await signedRes.json();
        if (existingSigned && existingSigned.status === "SIGNED") {
          setSignedRecord(existingSigned);
          setIsLoading(false);
          return;
        }
      }

      // 3. Fetch active agreement template for the program
      const templateRes = await fetch(
        `${API_URL}/agreements/program/${target.programId}/active`,
        { headers: getAuthHeaders() }
      );

      if (!templateRes.ok) {
        // Fallback route check
        const fallbackRes = await fetch(
          `${API_URL}/agreements/templates/program/${target.programId}/active`,
          { headers: getAuthHeaders() }
        );
        if (fallbackRes.ok) {
          const tpl = await fallbackRes.json();
          setActiveTemplate(tpl);
        } else {
          throw new Error("No published agreement is currently required for this program.");
        }
      } else {
        const tpl = await templateRes.json();
        setActiveTemplate(tpl);
      }
    } catch (err: any) {
      console.error("Agreement flow initialization error:", err);
      setLoadError(err.message || "Failed to load agreement details.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    if (!consentGiven) {
      setSubmitError("You must check the consent box to accept the agreement terms.");
      return;
    }

    if (!typedName.trim() || typedName.trim().length < 2) {
      setSubmitError("Please enter your full legal name as your typed signature.");
      return;
    }

    if (!drawnSignature || drawnSignature.length < 20) {
      setSubmitError("Please draw your signature in the signature box before submitting.");
      return;
    }

    if (!enrolment || !activeTemplate) {
      setSubmitError("Agreement context missing. Please refresh and try again.");
      return;
    }

    setIsSubmitting(true);

    try {
      // D1-040: Send only enrolment identification, consent, typed name, drawn signature.
      // Server generates signing timestamp, IP, and User-Agent.
      const payload = {
        enrolmentId: enrolment.id,
        versionId: activeTemplate.versionId,
        consentGiven: true,
        typedName: typedName.trim(),
        drawnSignature: drawnSignature,
      };

      const res = await fetch(`${API_URL}/agreements/sign`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        if (res.status === 409) {
          // Already signed
          setSubmitError("Agreement has already been recorded for this enrolment.");
          // Refresh state to show signed confirmation
          await initAgreementFlow();
          return;
        }
        throw new Error(
          data?.error?.message ||
            data?.message ||
            `Signing failed with status ${res.status}.`
        );
      }

      // Success
      setJustSignedSuccess(data);
    } catch (err: any) {
      console.error("Agreement submission failed:", err);
      setSubmitError(err.message || "Failed to submit signature. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className={styles.authContainer}>
        <div className={styles.authCard} style={{ maxWidth: "600px", textAlign: "center" }}>
          <h1 className={styles.logo}>WhatBoutMe</h1>
          <h2>Loading Agreement...</h2>
          <p>Retrieving legal terms and enrolment prerequisite status...</p>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className={styles.authContainer}>
        <div className={styles.authCard} style={{ maxWidth: "600px" }}>
          <h1 className={styles.logo}>WhatBoutMe</h1>
          <h2>Agreement Information</h2>
          <div style={{
            background: "#fef3c7",
            border: "1px solid #f59e0b",
            color: "#92400e",
            padding: "1rem",
            borderRadius: "8px",
            marginBottom: "1.5rem",
            fontSize: "0.9rem"
          }}>
            {loadError}
          </div>
          <Link href="/" className={styles.submitBtn} style={{ display: "block", textAlign: "center", textDecoration: "none" }}>
            Return to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  // State A: User just signed successfully
  if (justSignedSuccess) {
    return (
      <div className={styles.authContainer}>
        <div className={styles.authCard} style={{ maxWidth: "650px", textAlign: "center" }}>
          <div style={{ fontSize: "3rem", marginBottom: "0.5rem" }}>✅</div>
          <h1 className={styles.logo}>WhatBoutMe</h1>
          <h2 style={{ color: "#047857" }}>Agreement Signed Successfully</h2>
          <p style={{ color: "var(--text-secondary)", marginBottom: "1.5rem" }}>
            Thank you, <strong>{justSignedSuccess.typedName}</strong>. Your program agreement (Version {justSignedSuccess.templateVersion}) has been legally recorded and sealed against your enrolment.
          </p>

          <div style={{
            background: "var(--bg-soft, #f8fafc)",
            border: "1px solid var(--border-light, #e2e8f0)",
            padding: "1.25rem",
            borderRadius: "12px",
            textAlign: "left",
            fontSize: "0.85rem",
            marginBottom: "1.5rem",
            color: "var(--text-primary)"
          }}>
            <div style={{ marginBottom: "0.5rem" }}>
              <strong>Signer:</strong> {justSignedSuccess.typedName}
            </div>
            <div style={{ marginBottom: "0.5rem" }}>
              <strong>Execution Timestamp:</strong> {new Date(justSignedSuccess.signedAt).toLocaleString()}
            </div>
            <div style={{ marginBottom: "0.5rem" }}>
              <strong>Status:</strong> <span style={{ color: "#16a34a", fontWeight: 700 }}>VERIFIED &amp; SIGNED</span>
            </div>
            <div>
              <strong>Learning Access:</strong> Step 1 is now unlocked on your learning path.
            </div>
          </div>

          <Link
            href={enrolment?.programId ? `/programs/${enrolment.programId}/steps` : "/"}
            className={styles.submitBtn}
            style={{ display: "block", textAlign: "center", textDecoration: "none", width: "100%" }}
          >
            Enter Step 1 &amp; Begin Learning &rarr;
          </Link>
        </div>
      </div>
    );
  }

  // State B: Already signed prior to visiting this page
  if (signedRecord) {
    return (
      <div className={styles.authContainer}>
        <div className={styles.authCard} style={{ maxWidth: "650px", textAlign: "center" }}>
          <div style={{ fontSize: "2.5rem", marginBottom: "0.5rem" }}>📜</div>
          <h1 className={styles.logo}>WhatBoutMe</h1>
          <h2>Agreement Already Signed</h2>
          <p style={{ color: "var(--text-secondary)", marginBottom: "1.5rem" }}>
            You have already signed the program agreement for <strong>{enrolment?.program?.title || "this program"}</strong>.
          </p>

          <div style={{
            background: "var(--bg-soft, #f8fafc)",
            border: "1px solid var(--border-light, #e2e8f0)",
            padding: "1.25rem",
            borderRadius: "12px",
            textAlign: "left",
            fontSize: "0.85rem",
            marginBottom: "1.5rem"
          }}>
            <div style={{ marginBottom: "0.5rem" }}>
              <strong>Version:</strong> {signedRecord.templateVersion || "v1.0"}
            </div>
            <div style={{ marginBottom: "0.5rem" }}>
              <strong>Signed On:</strong> {new Date(signedRecord.signedAt).toLocaleString()}
            </div>
            <div>
              <strong>Recorded Name:</strong> {signedRecord.typedName}
            </div>
          </div>

          <Link
            href={enrolment?.programId ? `/programs/${enrolment.programId}/steps` : "/"}
            className={styles.submitBtn}
            style={{ display: "block", textAlign: "center", textDecoration: "none", width: "100%" }}
          >
            Continue to Learning Path &rarr;
          </Link>
        </div>
      </div>
    );
  }

  // State C: Active signing form
  return (
    <div className={styles.authContainer}>
      <div className={styles.authCard} style={{ maxWidth: "750px" }}>
        <h1 className={styles.logo}>WhatBoutMe</h1>
        <h2>{activeTemplate?.templateTitle || "Program Agreement"}</h2>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
          <span style={{
            background: "#e0f2fe",
            color: "#0369a1",
            padding: "0.2rem 0.6rem",
            borderRadius: "12px",
            fontSize: "0.8rem",
            fontWeight: 700
          }}>
            Version {activeTemplate?.version || "v1.0"}
          </span>
          <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
            Enrolment ID: {enrolment?.id?.slice(0, 8)}...
          </span>
        </div>

        <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem", marginBottom: "1rem" }}>
          Please carefully review the contract terms below. Access to Step 1 will unlock immediately upon signing.
        </p>

        {/* Contract Content Box */}
        <div
          style={{
            background: "var(--bg-soft, #f8fafc)",
            border: "1px solid var(--border-light, #cbd5e1)",
            padding: "1.5rem",
            borderRadius: "12px",
            maxHeight: "260px",
            overflowY: "auto",
            textAlign: "left",
            fontSize: "0.85rem",
            lineHeight: 1.6,
            color: "var(--text-primary, #1e293b)",
            marginBottom: "1.5rem",
            whiteSpace: "pre-wrap",
            fontFamily: "inherit"
          }}
        >
          {activeTemplate?.content}
        </div>

        {submitError && (
          <div style={{
            background: "#fee2e2",
            border: "1px solid #ef4444",
            color: "#b91c1c",
            padding: "0.85rem",
            borderRadius: "8px",
            marginBottom: "1.2rem",
            fontSize: "0.85rem"
          }}>
            {submitError}
          </div>
        )}

        <form className={styles.form} onSubmit={handleSignSubmit}>
          {/* 1. Consent checkbox */}
          <div
            className={styles.inputGroup}
            style={{
              flexDirection: "row",
              alignItems: "flex-start",
              gap: "0.85rem",
              background: "#f1f5f9",
              padding: "1rem",
              borderRadius: "8px",
              border: "1px solid #cbd5e1"
            }}
          >
            <input
              type="checkbox"
              id="agreeCheck"
              checked={consentGiven}
              onChange={(e) => setConsentGiven(e.target.checked)}
              style={{ width: "22px", height: "22px", cursor: "pointer", marginTop: "2px" }}
            />
            <label htmlFor="agreeCheck" style={{ cursor: "pointer", fontSize: "0.88rem", color: "#0f172a", lineHeight: 1.4 }}>
              <strong>I agree to the terms:</strong> I confirm that I have read, understood, and explicitly agree to the Program Agreement terms above.
            </label>
          </div>

          {/* 2. Typed Full Name */}
          <div className={styles.inputGroup}>
            <label style={{ fontSize: "0.85rem", fontWeight: 700 }}>
              1. Type your Full Legal Name *
            </label>
            <input
              type="text"
              placeholder="e.g. Jane Margaret Doe"
              value={typedName}
              onChange={(e) => setTypedName(e.target.value)}
              required
              style={{
                width: "100%",
                padding: "0.75rem",
                borderRadius: "8px",
                border: "1px solid var(--border-light, #cbd5e1)",
                fontSize: "0.95rem"
              }}
            />
          </div>

          {/* 3. Drawn Signature Pad */}
          <div className={styles.inputGroup}>
            <label style={{ fontSize: "0.85rem", fontWeight: 700 }}>
              2. Draw your Signature *
            </label>
            <SignaturePad onSignatureChange={setDrawnSignature} height={150} />
          </div>

          <div style={{
            fontSize: "0.75rem",
            color: "var(--text-secondary, #64748b)",
            marginTop: "-0.5rem",
            marginBottom: "0.5rem"
          }}>
            🛡️ Security note: Your signing timestamp and IP address will be captured securely by the server and permanently bound to this agreement.
          </div>

          <button
            type="submit"
            className={styles.submitBtn}
            disabled={isSubmitting || !consentGiven || !typedName.trim() || !drawnSignature}
            style={{
              width: "100%",
              cursor: consentGiven && typedName.trim() && drawnSignature ? "pointer" : "not-allowed",
              opacity: consentGiven && typedName.trim() && drawnSignature && !isSubmitting ? 1 : 0.6,
              padding: "0.9rem"
            }}
          >
            {isSubmitting ? "Signing & Unlocking Step 1..." : "Sign Agreement & Unlock Step 1"}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function LearnerAgreementPage() {
  return (
    <Suspense
      fallback={
        <div className={styles.authContainer}>
          <div className={styles.authCard} style={{ textAlign: "center" }}>
            <h2>Loading Agreement...</h2>
          </div>
        </div>
      }
    >
      <AgreementSignContent />
    </Suspense>
  );
}
