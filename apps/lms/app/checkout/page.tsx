"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import styles from "../login/auth.module.css";
import { SITE_URL } from "../lib/site";
import { parseCourseInfo } from "../lib/courseInfo";
import EnrollmentStepper from "../components/EnrollmentStepper";

function CheckoutContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const programId = searchParams.get("programId");
  const queryEnrolmentId = searchParams.get("enrolmentId");

  const [program, setProgram] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [user, setUser] = useState<any>(null);

  const [enrolmentId, setEnrolmentId] = useState<string | null>(queryEnrolmentId);
  const [signedVersion, setSignedVersion] = useState<string>("v1.0");
  const [agreementStatus, setAgreementStatus] = useState<"CHECKING" | "SIGNED" | "REQUIRED">("CHECKING");

  const targetEnrolmentId = enrolmentId || queryEnrolmentId;
  const agreementUrl = `/agreement?programId=${programId || ""}${targetEnrolmentId ? `&enrolmentId=${targetEnrolmentId}` : ""}`;

  useEffect(() => {
    // Check if user is logged in
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    const userStr = typeof window !== "undefined" ? localStorage.getItem("user") : null;
    if (token && userStr) {
      try {
        setUser(JSON.parse(userStr));
      } catch {
        // ignore
      }
    }

    if (programId) {
      fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000"}/programs`)
        .then((res) => res.json())
        .then((data) => {
          const p = Array.isArray(data) ? data.find((x: any) => x.id === programId) : null;
          setProgram(p);
          setLoading(false);
        })
        .catch(() => setLoading(false));

      if (token) {
        // Verify agreement status for this program
        fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000"}/agreements/initiate`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ programId }),
        })
          .then((res) => (res.ok ? res.json() : null))
          .then((data) => {
            if (data?.enrolment?.id) {
              setEnrolmentId(data.enrolment.id);
            }
            if (data?.hasSignedAgreement) {
              setAgreementStatus("SIGNED");
              if (data?.signedAgreement?.templateVersion) {
                setSignedVersion(data.signedAgreement.templateVersion);
              }
            } else {
              setAgreementStatus("REQUIRED");
              const targetEid = data?.enrolment?.id || queryEnrolmentId;
              const signUrl = `/agreement?programId=${programId}${targetEid ? `&enrolmentId=${targetEid}` : ""}`;
              router.replace(signUrl);
            }
          })
          .catch(() => {
            setAgreementStatus("REQUIRED");
            const signUrl = `/agreement?programId=${programId}${queryEnrolmentId ? `&enrolmentId=${queryEnrolmentId}` : ""}`;
            router.replace(signUrl);
          });
      } else {
        const returnUrl = encodeURIComponent(
          `/agreement?programId=${programId || ""}`
        );
        router.replace(`/login?portal=${returnUrl}`);
      }
    } else {
      setLoading(false);
    }
  }, [programId]);

  const handleSimulatePayment = async () => {
    if (!user) {
      const returnUrl = encodeURIComponent(
        `/checkout?programId=${programId || ""}${targetEnrolmentId ? `&enrolmentId=${targetEnrolmentId}` : ""}`
      );
      router.push(`/login?portal=${returnUrl}`);
      return;
    }

    setProcessing(true);

    // Simulate 1.2 second payment gateway delay
    await new Promise((resolve) => setTimeout(resolve, 1200));

    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000"}/checkout/mock`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          programId,
          enrolmentId: targetEnrolmentId,
        }),
      });

      if (!res.ok) {
        const errorText = await res.text();
        let parsedData: any = null;
        try {
          parsedData = JSON.parse(errorText);
        } catch {}

        if (parsedData?.error === "AGREEMENT_REQUIRED" || parsedData?.message?.includes?.("agreement")) {
          alert("Please review and sign the program agreement before completing payment.");
          router.push(agreementUrl);
          return;
        }

        if (errorText.includes("already enrolled")) {
          router.push(`/programs/${programId}/steps`);
          return;
        }
        throw new Error(parsedData?.message || errorText);
      }

      router.push(`/programs/${programId}/steps`);
    } catch (e: any) {
      console.error("Payment failed", e);
      let errorMessage = e.message;
      try {
        const parsed = JSON.parse(e.message);
        errorMessage = parsed.error?.message || parsed.message || e.message;
      } catch {}

      alert("Checkout failed: " + errorMessage);
      setProcessing(false);
    }
  };

  if (loading) {
    return (
      <div className={styles.authContainer} style={{ background: "#FAF7F2" }}>
        <div className={styles.authCard} style={{ maxWidth: "540px", background: "#FFFFFF", border: "1px solid #E7E0D6", borderRadius: "20px", textAlign: "center" }}>
          <h2 style={{ color: "#1C1917" }}>Loading checkout...</h2>
        </div>
      </div>
    );
  }

  if (!program) {
    return (
      <div className={styles.authContainer} style={{ background: "#FAF7F2" }}>
        <div className={styles.authCard} style={{ maxWidth: "540px", background: "#FFFFFF", border: "1px solid #E7E0D6", borderRadius: "20px", textAlign: "center" }}>
          <h2 style={{ color: "#1C1917" }}>Course Not Found</h2>
          <p style={{ color: "#78716A", marginBottom: "1.5rem" }}>We could not find the program you are attempting to enroll in.</p>
          <Link
            href={`${SITE_URL}/courses`}
            className={styles.submitBtn}
            style={{
              display: "inline-block",
              textDecoration: "none",
              background: "#B86B11",
              color: "#FFFFFF",
              borderRadius: "12px",
              padding: "0.85rem 1.5rem",
              fontWeight: 600,
            }}
          >
            Explore Courses
          </Link>
        </div>
      </div>
    );
  }

  const courseInfo = parseCourseInfo(program.description);

  return (
    <div className={styles.authContainer} style={{ background: "#FAF7F2", minHeight: "100vh", padding: "2.5rem 1.25rem" }}>
      <div
        className={styles.authCard}
        style={{
          maxWidth: "560px",
          background: "#FFFFFF",
          border: "1px solid #E7E0D6",
          borderRadius: "24px",
          padding: "2.5rem 2rem",
          boxShadow: "0 8px 30px rgba(28, 25, 23, 0.04)",
        }}
      >
        <EnrollmentStepper currentStep={3} />

        <h1 className={styles.logo} style={{ color: "#1C1917", fontSize: "1.75rem", marginBottom: "0.25rem" }}>
          Checkout &amp; Confirmation
        </h1>
        <h2 style={{ fontSize: "1.1rem", color: "#78716A", fontWeight: 500, marginBottom: "1.75rem" }}>
          Review your order and finalize enrollment
        </h2>

        {/* Order Summary Card */}
        <div
          style={{
            background: "#FDFBF7",
            padding: "1.5rem",
            borderRadius: "16px",
            textAlign: "left",
            marginBottom: "1.5rem",
            border: "1px solid #E7E0D6",
          }}
        >
          {courseInfo?.image && (
            <div
              style={{
                width: "100%",
                height: "160px",
                borderRadius: "10px",
                overflow: "hidden",
                marginBottom: "1.25rem",
                background: "#F7F3EC",
                border: "1px solid #E7E0D6",
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={courseInfo.image}
                alt={program.title}
                style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                onError={(e) => {
                  if (e.currentTarget.parentElement) {
                    e.currentTarget.parentElement.style.display = "none";
                  }
                }}
              />
            </div>
          )}

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              gap: "0.75rem",
              marginBottom: "0.5rem",
            }}
          >
            <h3 style={{ margin: 0, color: "#1C1917", fontSize: "1.25rem", fontWeight: 700 }}>
              {program.title}
            </h3>
            {courseInfo?.type && (
              <span
                style={{
                  fontSize: "0.75rem",
                  fontWeight: 600,
                  padding: "3px 10px",
                  borderRadius: "9999px",
                  background: "#F7F3EC",
                  color: "#B86B11",
                  border: "1px solid #E7E0D6",
                  whiteSpace: "nowrap",
                }}
              >
                {courseInfo.type}
              </span>
            )}
          </div>

          <p style={{ margin: "0 0 1rem 0", color: "#78716A", fontSize: "0.9rem", lineHeight: 1.55 }}>
            {courseInfo?.summary || "A comprehensive personal and professional learning journey."}
          </p>

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              borderTop: "1px dashed #E7E0D6",
              paddingTop: "1rem",
              marginTop: "0.5rem",
            }}
          >
            <span style={{ color: "#1C1917", fontWeight: 600 }}>Total Due:</span>
            <div style={{ textAlign: "right" }}>
              <span style={{ color: "#B86B11", fontSize: "1.6rem", fontWeight: 700 }}>${program.price}</span>
            </div>
          </div>
        </div>

        {/* User & Agreement Verification Status Section */}
        {!user ? (
          <div
            style={{
              background: "#F7F3EC",
              border: "1px solid #E7E0D6",
              borderRadius: "12px",
              padding: "1.25rem",
              marginBottom: "1.5rem",
              textAlign: "left",
              fontSize: "0.9rem",
              color: "#1C1917",
            }}
          >
            <div style={{ fontWeight: 700, marginBottom: "0.35rem" }}>Authentication Required</div>
            <p style={{ margin: "0 0 0.85rem 0", color: "#78716A", lineHeight: 1.45 }}>
              Please sign in to your account to sign the program agreement and finalize enrollment.
            </p>
            <div style={{ display: "flex", gap: "0.75rem" }}>
              <Link
                href={`/login?portal=${encodeURIComponent(`/checkout?programId=${programId || ""}`)}`}
                style={{
                  background: "#B86B11",
                  color: "#FFFFFF",
                  padding: "0.55rem 1.15rem",
                  borderRadius: "8px",
                  fontSize: "0.85rem",
                  fontWeight: 600,
                  textDecoration: "none",
                }}
              >
                Log In
              </Link>
              <Link
                href={`/signup?programId=${programId || ""}`}
                style={{
                  background: "#FFFFFF",
                  border: "1px solid #E7E0D6",
                  color: "#1C1917",
                  padding: "0.55rem 1.15rem",
                  borderRadius: "8px",
                  fontSize: "0.85rem",
                  fontWeight: 600,
                  textDecoration: "none",
                }}
              >
                Sign Up
              </Link>
            </div>
          </div>
        ) : (
          <div style={{ marginBottom: "1.5rem" }}>
            <div
              style={{
                fontSize: "0.85rem",
                color: "#78716A",
                marginBottom: "1rem",
                textAlign: "left",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <span>
                Account: <strong style={{ color: "#1C1917" }}>{user.email}</strong>
              </span>
            </div>

            {/* Agreement State: Unsigned / Required -> Render single clean card with single CTA */}
            {agreementStatus === "REQUIRED" && (
              <div
                style={{
                  background: "#F7F3EC",
                  borderLeft: "3px solid #B86B11",
                  borderTop: "1px solid #E7E0D6",
                  borderRight: "1px solid #E7E0D6",
                  borderBottom: "1px solid #E7E0D6",
                  borderRadius: "12px",
                  padding: "1.25rem",
                  textAlign: "left",
                  marginBottom: "1.5rem",
                }}
              >
                <div
                  style={{
                    fontWeight: 700,
                    color: "#1C1917",
                    marginBottom: "0.35rem",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                  }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#B86B11" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                  Action Required: Program Agreement
                </div>
                <p style={{ margin: "0 0 1rem 0", color: "#78716A", fontSize: "0.88rem", lineHeight: 1.5 }}>
                  Under WhatBoutMe policies, you must review and digitally sign the program agreement before payment confirmation.
                </p>
                <Link
                  href={agreementUrl}
                  className={styles.submitBtn}
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "center",
                    textDecoration: "none",
                    background: "#B86B11",
                    color: "#FFFFFF",
                    borderRadius: "10px",
                    padding: "0.85rem",
                    fontSize: "0.95rem",
                    fontWeight: 600,
                  }}
                >
                  Review &amp; Sign Agreement &rarr;
                </Link>
              </div>
            )}

            {/* Agreement State: Signed & Verified */}
            {agreementStatus === "SIGNED" && (
              <div
                style={{
                  background: "#F0FDF4",
                  border: "1px solid #86EFAC",
                  borderRadius: "12px",
                  padding: "0.85rem 1.15rem",
                  textAlign: "left",
                  fontSize: "0.88rem",
                  color: "#166534",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: "0.75rem",
                  marginBottom: "1.5rem",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#16A34A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  <span>
                    <strong>Agreement Signed</strong> ({signedVersion})
                  </span>
                </div>
                <Link
                  href={agreementUrl}
                  style={{
                    color: "#166534",
                    fontSize: "0.8rem",
                    fontWeight: 600,
                    textDecoration: "underline",
                  }}
                >
                  View Signed Details
                </Link>
              </div>
            )}
          </div>
        )}

        {/* Primary Checkout CTA (Only shown when not unsigned, preventing duplicate stacked buttons) */}
        {agreementStatus !== "REQUIRED" && (
          <div>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.35rem",
                fontSize: "0.75rem",
                color: "#78716A",
                background: "#F7F3EC",
                padding: "3px 10px",
                borderRadius: "9999px",
                marginBottom: "0.75rem",
                border: "1px solid #E7E0D6",
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="16" x2="12" y2="12" />
                <line x1="12" y1="8" x2="12.01" y2="8" />
              </svg>
              <span>Development Mode: Simulated Checkout</span>
            </div>

            <button
              className={styles.submitBtn}
              onClick={handleSimulatePayment}
              disabled={processing || !user || agreementStatus !== "SIGNED"}
              style={{
                width: "100%",
                background: "#B86B11",
                color: "#FFFFFF",
                borderRadius: "12px",
                padding: "1rem",
                fontSize: "1rem",
                fontWeight: 600,
                border: "none",
                cursor: processing || !user || agreementStatus !== "SIGNED" ? "not-allowed" : "pointer",
                opacity: processing || !user || agreementStatus !== "SIGNED" ? 0.65 : 1,
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                gap: "0.5rem",
                transition: "opacity 0.2s ease",
              }}
            >
              {processing ? (
                "Processing Confirmation..."
              ) : !user ? (
                "Log In to Finalize Enrollment"
              ) : (
                "Complete Payment & Unlock Step 1 →"
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function CheckoutPage() {
  return (
    <Suspense
      fallback={
        <div className={styles.authContainer} style={{ background: "#FAF7F2" }}>
          <div className={styles.authCard} style={{ background: "#FFFFFF", border: "1px solid #E7E0D6", borderRadius: "20px", textAlign: "center" }}>
            <h2 style={{ color: "#1C1917" }}>Loading checkout...</h2>
          </div>
        </div>
      }
    >
      <CheckoutContent />
    </Suspense>
  );
}
