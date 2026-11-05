"use client";

import { useEffect, useState, Suspense } from "react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import styles from "../login/auth.module.css";
import { SITE_URL } from "../lib/site";
import { parseCourseInfo } from "../lib/courseInfo";
import EnrollmentStepper from "../components/EnrollmentStepper";
import { API_URL } from "../lib/api";
import { sanitizeExternalUrl } from "../lib/auth-redirect";

function CheckoutContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const programId = searchParams.get("programId");
  const queryEnrolmentId = searchParams.get("enrolmentId");
  const queryBatchId = searchParams.get("batchId");
  const queryCoupon = searchParams.get("coupon");

  const [program, setProgram] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [user, setUser] = useState<any>(null);

  // Multi-Currency State
  const [currency, setCurrency] = useState<"USD" | "AED" | "INR">("USD");

  // Coupon State (pre-populated if preserved from course enrollment intent)
  const [couponCode, setCouponCode] = useState(queryCoupon || "");
  const [appliedCoupon, setAppliedCoupon] = useState<any>(null);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [isApplyingCoupon, setIsApplyingCoupon] = useState(false);

  // Idempotency & Simulation State
  const [idempotencyKey] = useState(
    () => `chk_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
  );
  const [simulatedResult, setSimulatedResult] = useState<any>(null);
  const [simulationError, setSimulationError] = useState<any>(null);
  const [activeProvider, setActiveProvider] = useState<string>("STRIPE");
  const [alreadyEnrolledError, setAlreadyEnrolledError] = useState<string | null>(null);

  const [enrolmentId, setEnrolmentId] = useState<string | null>(queryEnrolmentId);
  const [signedVersion, setSignedVersion] = useState<string>("v1.0");
  const [agreementStatus, setAgreementStatus] = useState<"CHECKING" | "SIGNED" | "REQUIRED">("CHECKING");

  const isDevSimulate = searchParams.get("dev_simulate") === "1" || searchParams.get("test_bypass") === "1";
  const targetEnrolmentId = enrolmentId || queryEnrolmentId;
  const extraParams = `${queryBatchId ? `&batchId=${encodeURIComponent(queryBatchId)}` : ""}${queryCoupon ? `&coupon=${encodeURIComponent(queryCoupon)}` : ""}`;
  const agreementUrl = `/agreement?programId=${programId || ""}${targetEnrolmentId ? `&enrolmentId=${targetEnrolmentId}` : ""}${extraParams}`;

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
      fetch(`${API_URL}/payments/active-provider`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data?.activeProvider && data.activeProvider !== "MOCK_TEST") {
            setActiveProvider(data.activeProvider);
          }
        })
        .catch(() => {});

      fetch(`${API_URL}/programs`)
        .then((res) => res.json())
        .then((data) => {
          const p = Array.isArray(data) ? data.find((x: any) => x.id === programId) : null;
          setProgram(p);
          if (p?.currency && (p.currency === "USD" || p.currency === "AED" || p.currency === "INR")) {
            setCurrency(p.currency);
          }
          setLoading(false);
        })
        .catch(() => setLoading(false));

      if (token) {
        // Verify agreement status for this program
        fetch(`${API_URL}/agreements/initiate`, {
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
            // Already Enrolled Detection: skip duplicate checkout if enrolment is already ACTIVE/COMPLETED
            if (
              data?.enrolment?.status === "ACTIVE" || data?.enrolment?.status === "COMPLETED"
            ) {
              router.replace(`/programs/${programId}/steps?welcomeBack=1`);
              return;
            }
            if (data?.hasSignedAgreement) {
              setAgreementStatus("SIGNED");
              if (data?.signedAgreement?.templateVersion) {
                setSignedVersion(data.signedAgreement.templateVersion);
              }
            } else {
              setAgreementStatus("REQUIRED");
              const targetEid = data?.enrolment?.id || queryEnrolmentId;
              const signUrl = `/agreement?programId=${programId}${targetEid ? `&enrolmentId=${targetEid}` : ""}${extraParams}`;
              router.replace(signUrl);
            }
          })
          .catch(() => {
            setAgreementStatus("REQUIRED");
            const signUrl = `/agreement?programId=${programId}${queryEnrolmentId ? `&enrolmentId=${queryEnrolmentId}` : ""}${extraParams}`;
            router.replace(signUrl);
          });
      } else {
        const returnUrl = encodeURIComponent(
          `/agreement?programId=${programId || ""}${extraParams}`
        );
        router.replace(`/login?portal=${returnUrl}`);
      }
    } else {
      setLoading(false);
    }
  }, [programId]);

  // Authoritative USD core pricing
  const basePriceUSD = Number(program?.price) || 0;
  const discountAmountUSD = appliedCoupon?.discountAmount ?? 0;
  const finalAmountUSD = Math.max(0, basePriceUSD - discountAmountUSD);

  // Estimator helpers for learner reference
  const approxINR = Math.round(finalAmountUSD * 86.5);
  const approxAED = Math.round(finalAmountUSD * 3.67);

  const handleApplyCoupon = async () => {
    const cleanCode = couponCode.trim().toUpperCase().replace(/\s+/g, "-");
    if (!cleanCode) return;
    setIsApplyingCoupon(true);
    setCouponError(null);
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
      const res = await fetch(`${API_URL}/coupons/validate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          code: cleanCode,
          programId,
          currency: "USD",
          userId: user?.id || user?.sub,
        }),
      });

      const data = await res.json();
      if (res.ok && data.valid) {
        setAppliedCoupon(data);
        setCouponError(null);
      } else {
        setAppliedCoupon(null);
        setCouponError(data?.reason || data?.message || "Invalid coupon code.");
      }
    } catch {
      setCouponError("Could not validate coupon.");
    } finally {
      setIsApplyingCoupon(false);
    }
  };

  const handleStripeCheckout = async () => {
    if (!user) {
      const returnUrl = encodeURIComponent(
        `/checkout?programId=${programId || ""}${targetEnrolmentId ? `&enrolmentId=${targetEnrolmentId}` : ""}`
      );
      router.push(`/login?portal=${returnUrl}`);
      return;
    }

    setProcessing(true);
    setSimulationError(null);
    setAlreadyEnrolledError(null);

    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_URL}/payments/checkout-session`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          targetType: "ENROLMENT",
          targetId: programId,
          enrolmentId: targetEnrolmentId || undefined,
          amount: finalAmountUSD,
          currency: "USD",
          couponCode: appliedCoupon?.code || couponCode || undefined,
          idempotencyKey,
        }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        if (data?.error === "ALREADY_ENROLLED" || data?.message?.includes("already enrolled")) {
          setAlreadyEnrolledError(data?.message || "You have already enrolled and completed payment for this course.");
          return;
        }
        throw new Error(data?.message || `Checkout failed with status ${res.status}`);
      }

      if (data?.checkoutUrl) {
        window.location.href = data.checkoutUrl;
        return;
      }

      if (data?.simulationBypass) {
        await handleSimulatePayment("PAID");
        return;
      }

      throw new Error("No checkout URL returned from payment provider.");
    } catch (err: any) {
      console.error("Stripe Checkout Error:", err);
      setSimulationError(err?.message || "Failed to initialize Stripe checkout.");
    } finally {
      setProcessing(false);
    }
  };

  const handleSimulatePayment = async (status: "PAID" | "FAILED") => {
    if (!user) {
      const returnUrl = encodeURIComponent(
        `/checkout?programId=${programId || ""}${targetEnrolmentId ? `&enrolmentId=${targetEnrolmentId}` : ""}`
      );
      router.push(`/login?portal=${returnUrl}`);
      return;
    }

    setProcessing(true);
    setSimulationError(null);

    // Realistic simulation transition
    await new Promise((resolve) => setTimeout(resolve, 800));

    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_URL}/payments/webhook/test-simulate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          targetType: "ENROLMENT",
          targetId: programId,
          enrolmentId: targetEnrolmentId || undefined,
          amount: finalAmountUSD,
          currency: "USD",
          status,
          failureReason: status === "FAILED" ? "Simulated test bank transaction declined." : undefined,
          idempotencyKey: `chk_${Date.now()}_usd_${Math.random().toString(36).substring(2, 7)}`,
          couponCode: appliedCoupon?.code || couponCode || undefined,
        }),
      });

      const result = await res.json().catch(() => null);

      if (!res.ok) {
        if (result?.error === "AGREEMENT_REQUIRED" || result?.message?.includes?.("agreement")) {
          alert("Please review and sign the program agreement before completing payment.");
          router.push(agreementUrl);
          return;
        }
        throw new Error(result?.message || `Checkout failed with status ${res.status}`);
      }

      if (status === "PAID") {
        setSimulatedResult(result);
      } else {
        setSimulationError(result?.message || "Simulated payment response: Transaction was declined as requested.");
      }
    } catch (e: any) {
      console.error("Test payment simulation error", e);
      setSimulationError(e.message || "Failed to execute simulated checkout.");
    } finally {
      setProcessing(false);
    }
  };

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: "#FAF7F2", padding: "2rem 1rem 4rem", display: "flex", justifyContent: "center" }}>
        <div style={{ width: "100%", maxWidth: "760px" }}>
          <div style={{ background: "#FFFFFF", border: "1px solid #E7E0D6", borderRadius: "16px", padding: "2rem", textAlign: "center" }}>
            <h2 style={{ color: "#1C1917", fontSize: "1.25rem", margin: 0 }}>Loading checkout…</h2>
          </div>
        </div>
      </div>
    );
  }

  if (!program) {
    return (
      <div style={{ minHeight: "100vh", background: "#FAF7F2", padding: "2rem 1rem 4rem", display: "flex", justifyContent: "center" }}>
        <div style={{ width: "100%", maxWidth: "760px" }}>
          <div style={{ background: "#FFFFFF", border: "1px solid #E7E0D6", borderRadius: "16px", padding: "2.5rem 2rem", textAlign: "center" }}>
            <h2 style={{ color: "#1C1917", fontSize: "1.5rem", margin: "0 0 0.5rem 0" }}>Course Not Found</h2>
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
      </div>
    );
  }

  const courseInfo = parseCourseInfo(program.description);

  return (
    <div style={{ minHeight: "100vh", background: "#FAF7F2", padding: "2rem 1rem 4rem", display: "flex", justifyContent: "center" }}>
      <div style={{ width: "100%", maxWidth: "760px" }}>
        <EnrollmentStepper currentStep={3} />

        <div
          style={{
            background: "#FFFFFF",
            border: "1px solid #E7E0D6",
            borderRadius: "16px",
            padding: "2rem",
            boxShadow: "0 1px 3px rgba(28, 25, 23, 0.04)",
          }}
        >
          <h1 style={{ color: "#1C1917", fontSize: "1.5rem", fontWeight: 700, margin: "0 0 0.35rem 0", letterSpacing: "-0.01em" }}>
            Checkout &amp; Confirmation
          </h1>
          <h2 style={{ fontSize: "1rem", color: "#78716A", fontWeight: 500, margin: "0 0 1.5rem 0" }}>
            Review your order and finalize enrollment
          </h2>

        {/* Currency Core Badge */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
          <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "#1C1917" }}>Core Tuition Currency:</span>
          <div style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem", background: "#FEF3C7", padding: "5px 12px", borderRadius: "8px", border: "1px solid #FDE68A", fontSize: "0.82rem", fontWeight: 700, color: "#92400E" }}>
            <span>$ USD Core</span>
            <span style={{ fontWeight: 400, color: "#B45309", fontSize: "0.75rem" }}>• Converted live by Stripe at checkout</span>
          </div>
        </div>

        {/* Order Summary Card */}
        <div
          style={{
            background: "#FDFBF7",
            padding: "1.5rem",
            borderRadius: "16px",
            textAlign: "left",
            marginBottom: "1.25rem",
            border: "1px solid #E7E0D6",
          }}
        >
          {courseInfo?.image && (
            <div style={{ width: "100%", height: "160px", borderRadius: "8px", overflow: "hidden", marginBottom: "1.25rem", background: "var(--bg-card)", border: "1px solid var(--border-light)" }}>
              <Image
                src={courseInfo.image}
                alt={program.title}
                width={480}
                height={160}
                quality={80}
                loading="lazy"
                unoptimized={!courseInfo.image.startsWith("/")}
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

          {/* Pricing Breakdown */}
          <div style={{ borderTop: "1px dashed #E7E0D6", paddingTop: "0.85rem", marginTop: "0.5rem", fontSize: "0.9rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.35rem", color: "#78716A" }}>
              <span>Base Tuition:</span>
              <span style={{ fontWeight: 600 }}>${basePriceUSD.toLocaleString()} USD</span>
            </div>

            {appliedCoupon && (
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.35rem", color: "#16A34A", fontWeight: 600 }}>
                <span>Coupon ({appliedCoupon.code}):</span>
                <span>-${discountAmountUSD.toLocaleString()} USD</span>
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.5rem", color: "#78716A", fontSize: "0.8rem" }}>
              <span>Taxes:</span>
              <span>0% Export / Int'l Tax (WhatBoutMe FZE)</span>
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                borderTop: "1px solid #E7E0D6",
                paddingTop: "0.75rem",
                marginTop: "0.35rem",
              }}
            >
              <span style={{ color: "#1C1917", fontWeight: 700, fontSize: "1.05rem" }}>Total Due:</span>
              <div style={{ textAlign: "right" }}>
                <span style={{ color: "#B86B11", fontSize: "1.6rem", fontWeight: 700 }}>
                  ${finalAmountUSD.toLocaleString()} USD
                </span>
              </div>
            </div>

            {/* Dynamic Stripe Adaptive Pricing Callout */}
            <div
              style={{
                marginTop: "0.85rem",
                background: "#F0FDF4",
                border: "1px solid #BBF7D0",
                borderRadius: "10px",
                padding: "0.75rem 0.95rem",
                fontSize: "0.8rem",
                color: "#166534",
                lineHeight: 1.45,
                display: "flex",
                alignItems: "flex-start",
                gap: "0.5rem",
              }}
            >
              <span style={{ fontSize: "1rem" }}>🌍</span>
              <div>
                <strong>Stripe Adaptive Pricing:</strong> When paying from India or UAE, Stripe automatically converts this to <strong>₹ INR (~₹{approxINR.toLocaleString()})</strong> with UPI &amp; Netbanking, or <strong>AED (~{approxAED.toLocaleString()} AED)</strong> on the secure checkout screen.
              </div>
            </div>
          </div>
        </div>

        {/* Promo / Coupon Box */}
        <div style={{ background: "#FFFFFF", border: "1px solid #E7E0D6", borderRadius: "12px", padding: "1rem", marginBottom: "1.25rem", textAlign: "left" }}>
          <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, color: "#1C1917", marginBottom: "0.5rem" }}>
            Have a Promo Code?
          </label>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <input
              type="text"
              placeholder="Enter coupon code (e.g. WELCOME10)"
              value={couponCode}
              onChange={(e) => setCouponCode(e.target.value.toUpperCase().replace(/\s+/g, "-"))}
              disabled={isApplyingCoupon || !!appliedCoupon}
              style={{
                flex: 1,
                border: "1px solid #E7E0D6",
                borderRadius: "8px",
                padding: "0.55rem 0.85rem",
                fontSize: "0.9rem",
                textTransform: "uppercase",
              }}
            />
            {appliedCoupon ? (
              <button
                type="button"
                onClick={() => {
                  setAppliedCoupon(null);
                  setCouponCode("");
                }}
                style={{
                  background: "#EF4444",
                  color: "#FFFFFF",
                  border: "none",
                  borderRadius: "8px",
                  padding: "0.55rem 1rem",
                  fontSize: "0.85rem",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Remove
              </button>
            ) : (
              <button
                type="button"
                onClick={handleApplyCoupon}
                disabled={isApplyingCoupon || !couponCode.trim()}
                style={{
                  background: "#1C1917",
                  color: "#FFFFFF",
                  border: "none",
                  borderRadius: "8px",
                  padding: "0.55rem 1.15rem",
                  fontSize: "0.85rem",
                  fontWeight: 600,
                  cursor: isApplyingCoupon || !couponCode.trim() ? "not-allowed" : "pointer",
                  opacity: isApplyingCoupon || !couponCode.trim() ? 0.6 : 1,
                }}
              >
                {isApplyingCoupon ? "Checking..." : "Apply"}
              </button>
            )}
          </div>
          {couponError && (
            <p style={{ margin: "0.4rem 0 0 0", color: "#DC2626", fontSize: "0.8rem" }}>
              {couponError}
            </p>
          )}
          {appliedCoupon && (
            <p style={{ margin: "0.4rem 0 0 0", color: "#16A34A", fontSize: "0.8rem", fontWeight: 600 }}>
              ✓ Coupon applied! Saved ${discountAmountUSD.toLocaleString()} USD.
            </p>
          )}
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

        {/* Already Enrolled Guard Alert */}
        {alreadyEnrolledError && (
          <div
            style={{
              background: "#F0FDF4",
              border: "1px solid #86EFAC",
              borderRadius: "16px",
              padding: "1.5rem",
              marginBottom: "1.5rem",
              textAlign: "center",
            }}
          >
            <div style={{ width: "48px", height: "48px", borderRadius: "50%", background: "#DCFCE7", color: "#16A34A", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 1rem" }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <h3 style={{ margin: "0 0 0.5rem 0", color: "#166534", fontSize: "1.25rem", fontWeight: 700 }}>
              Already Enrolled in Course
            </h3>
            <p style={{ margin: "0 0 1.25rem 0", color: "#15803D", fontSize: "0.92rem", lineHeight: 1.5 }}>
              {alreadyEnrolledError}
            </p>
            <button
              type="button"
              onClick={() => router.push(`/programs/${programId}/steps`)}
              style={{
                width: "100%",
                padding: "0.9rem",
                borderRadius: "10px",
                background: "#16A34A",
                color: "#FFFFFF",
                border: "none",
                fontWeight: 700,
                fontSize: "1rem",
                cursor: "pointer",
              }}
            >
              Go to Course Dashboard &amp; Step 1 &rarr;
            </button>
          </div>
        )}

        {/* Simulation Error Alert */}
        {simulationError && (
          <div
            style={{
              background: "#FEF2F2",
              border: "1px solid #FECACA",
              borderRadius: "12px",
              padding: "1rem",
              marginBottom: "1.25rem",
              color: "#991B1B",
              fontSize: "0.9rem",
              textAlign: "left",
            }}
          >
            <div style={{ fontWeight: 700, marginBottom: "0.25rem" }}>Simulated Failure:</div>
            <div>{simulationError}</div>
          </div>
        )}

        {/* Simulation Success Confirmation Card */}
        {simulatedResult ? (
          <div
            style={{
              background: "#F0FDF4",
              border: "1px solid #86EFAC",
              borderRadius: "16px",
              padding: "1.5rem",
              textAlign: "center",
              marginBottom: "1rem",
            }}
          >
            <div style={{ width: "48px", height: "48px", borderRadius: "50%", background: "#DCFCE7", color: "#16A34A", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 1rem" }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <h3 style={{ margin: "0 0 0.5rem 0", color: "#166534", fontSize: "1.3rem", fontWeight: 700 }}>
              Payment Confirmed &amp; Verified!
            </h3>
            <p style={{ margin: "0 0 1rem 0", color: "#15803D", fontSize: "0.92rem", lineHeight: 1.5 }}>
              Your test transaction was securely recognized. An official WhatBoutMe FZE Tax invoice has been generated.
            </p>

            {simulatedResult.invoiceNumber && (
              <div style={{ background: "#FFFFFF", border: "1px solid #BBF7D0", borderRadius: "8px", padding: "0.6rem 1rem", display: "inline-block", marginBottom: "1.25rem", fontSize: "0.88rem", fontWeight: 600, color: "#166534" }}>
                Invoice No: {simulatedResult.invoiceNumber}
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              {simulatedResult.invoiceUrl && (
                <a
                  href={
                    sanitizeExternalUrl(
                      simulatedResult.invoiceUrl.startsWith("http")
                        ? simulatedResult.invoiceUrl
                        : `${API_URL}${simulatedResult.invoiceUrl.startsWith("/") ? "" : "/"}${simulatedResult.invoiceUrl}`
                    ) || "#"
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: "block",
                    padding: "0.75rem",
                    borderRadius: "10px",
                    background: "#FFFFFF",
                    border: "1px solid #16A34A",
                    color: "#166534",
                    fontWeight: 600,
                    textDecoration: "none",
                    fontSize: "0.95rem",
                  }}
                >
                  Download WhatBoutMe FZE Tax Invoice (PDF)
                </a>
              )}
              <button
                type="button"
                onClick={() => router.push(`/programs/${programId}/steps`)}
                style={{
                  padding: "0.9rem",
                  borderRadius: "10px",
                  background: "#16A34A",
                  color: "#FFFFFF",
                  border: "none",
                  fontWeight: 700,
                  fontSize: "1rem",
                  cursor: "pointer",
                }}
              >
                Proceed to Course Dashboard &amp; Step 1 &rarr;
              </button>
            </div>
          </div>
        ) : (
          /* Primary Checkout CTAs */
          !alreadyEnrolledError && agreementStatus !== "REQUIRED" && (
            <div>
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.35rem",
                  fontSize: "0.75rem",
                  color: activeProvider === "STRIPE" ? "#15803D" : "#78716A",
                  background: activeProvider === "STRIPE" ? "#F0FDF4" : "#F7F3EC",
                  padding: "4px 12px",
                  borderRadius: "9999px",
                  marginBottom: "0.85rem",
                  border: "1px solid #BBF7D0",
                  fontWeight: 600,
                }}
              >
                <span>
                  🔒 Stripe Checkout: Bank-Grade Security • Adaptive Local Pricing
                </span>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                {/* Official Stripe Checkout Button */}
                <button
                  className={styles.submitBtn}
                  onClick={handleStripeCheckout}
                  disabled={processing || !user || agreementStatus !== "SIGNED"}
                  style={{
                    width: "100%",
                    background: "#635BFF",
                    color: "#FFFFFF",
                    borderRadius: "12px",
                    padding: "1.1rem",
                    fontSize: "1.05rem",
                    fontWeight: 700,
                    border: "none",
                    cursor: processing || !user || agreementStatus !== "SIGNED" ? "not-allowed" : "pointer",
                    opacity: processing || !user || agreementStatus !== "SIGNED" ? 0.65 : 1,
                    display: "flex",
                    justifyContent: "center",
                    alignItems: "center",
                    gap: "0.5rem",
                    boxShadow: "0 2px 8px rgba(99, 91, 255, 0.3)",
                    transition: "all 0.2s ease",
                  }}
                >
                  {processing ? (
                    "Connecting to Stripe..."
                  ) : !user ? (
                    "Log In to Finalize Enrollment"
                  ) : (
                    <>
                      <span>Pay with Stripe</span>
                      <span>(${finalAmountUSD.toLocaleString()} USD)</span>
                    </>
                  )}
                </button>

                {/* Developer-Only Bypass Controls (visible only when ?dev_simulate=1) */}
                {isDevSimulate && (
                  <>
                    <button
                      className={styles.submitBtn}
                      onClick={() => handleSimulatePayment("PAID")}
                      disabled={processing || !user || agreementStatus !== "SIGNED"}
                      style={{
                        width: "100%",
                        background: "#B86B11",
                        color: "#FFFFFF",
                        borderRadius: "12px",
                        padding: "0.85rem",
                        fontSize: "0.9rem",
                        fontWeight: 700,
                        border: "none",
                        cursor: processing || !user || agreementStatus !== "SIGNED" ? "not-allowed" : "pointer",
                        opacity: processing || !user || agreementStatus !== "SIGNED" ? 0.65 : 1,
                        display: "flex",
                        justifyContent: "center",
                        alignItems: "center",
                        gap: "0.5rem",
                      }}
                    >
                      {processing ? (
                        "Processing Simulated Payment..."
                      ) : (
                        <>
                          <span>Simulate Test Payment (Instant Paid)</span>
                          <span>(${finalAmountUSD.toLocaleString()} USD)</span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => handleSimulatePayment("FAILED")}
                      disabled={processing || !user || agreementStatus !== "SIGNED"}
                      style={{
                        width: "100%",
                        background: "transparent",
                        color: "#DC2626",
                        borderRadius: "12px",
                        padding: "0.65rem",
                        fontSize: "0.82rem",
                        fontWeight: 600,
                        border: "1px dashed #FECACA",
                        cursor: processing || !user || agreementStatus !== "SIGNED" ? "not-allowed" : "pointer",
                        opacity: processing || !user || agreementStatus !== "SIGNED" ? 0.5 : 0.8,
                        transition: "all 0.15s ease",
                      }}
                    >
                      Test Payment Failure Path (Decline Simulation)
                    </button>
                  </>
                )}
              </div>
            </div>
          )
        )}
        </div>
      </div>
    </div>
  );
}

export default function CheckoutPage() {
  return (
    <Suspense
      fallback={
        <div style={{ minHeight: "100vh", background: "#FAF7F2", padding: "2rem 1rem 4rem", display: "flex", justifyContent: "center" }}>
          <div style={{ width: "100%", maxWidth: "760px" }}>
            <div style={{ background: "#FFFFFF", border: "1px solid #E7E0D6", borderRadius: "16px", padding: "2rem", textAlign: "center" }}>
              <h2 style={{ color: "#1C1917", fontSize: "1.25rem", margin: 0 }}>Loading checkout…</h2>
            </div>
          </div>
        </div>
      }
    >
      <CheckoutContent />
    </Suspense>
  );
}
