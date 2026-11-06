"use client";

import { useEffect, useState, use } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import styles from "../../../login/auth.module.css";
import { API_URL } from "../../../lib/api";
import { stripFormatting } from "../../../lib/courseInfo";

interface TokenData {
  valid: boolean;
  candidateName?: string;
  maskedEmail?: string;
  lead?: {
    id: string;
    name: string;
    email: string;
    phone?: string;
  };
  user?: {
    id: string;
    name: string;
    email: string;
    role: string;
  };
  program: {
    id: string;
    title: string;
    description?: string;
    price?: number;
    priceUSD?: number;
    priceAED?: number;
    priceINR?: number;
    currency?: string;
  };
  batch?: {
    id: string;
    name: string;
    startDate?: string;
    endDate?: string;
  } | null;
  enrolment?: {
    id: string;
    status: string;
  };
  enrolmentId?: string;
  currency: "USD" | "AED" | "INR";
  amount: number;
  pricing?: {
    amount: number;
    currency: string;
    formatted: string;
  };
  accessToken?: string | null;
}

export default function LeadCheckoutPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const unwrappedParams = use(params);
  const token = unwrappedParams.token;
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<TokenData | null>(null);

  const [activeProvider, setActiveProvider] = useState<string>("STRIPE");
  const [processing, setProcessing] = useState(false);
  const [simulationResult, setSimulationResult] = useState<any>(null);
  const [simulationError, setSimulationError] = useState<string | null>(null);
  const [alreadyEnrolledError, setAlreadyEnrolledError] = useState<string | null>(null);

  // Load token details & active payment provider on mount
  useEffect(() => {
    let isMounted = true;

    // Detect active payment provider
    fetch(`${API_URL}/payments/active-provider`)
      .then((res) => (res.ok ? res.json() : null))
      .then((info) => {
        if (isMounted && info?.activeProvider && info.activeProvider !== "MOCK_TEST") {
          setActiveProvider(info.activeProvider);
        }
      })
      .catch(() => {});

    const fetchTokenDetails = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`${API_URL}/leads/checkout-token/${encodeURIComponent(token)}`);
        if (!res.ok) {
          const errData = await res.json().catch(() => null);
          throw new Error(errData?.message || "Invalid or expired checkout link.");
        }
        const json: TokenData = await res.json();
        if (isMounted) {
          setData(json);

          // If enrolment has already reached PENDING_AGREEMENT (e.g. tuition waived or offline payment received),
          // route directly to the Agreement & E-Signature page.
          const effectiveEnrolmentStatus = json.enrolment?.status;
          const effectiveEnrolmentId = json.enrolmentId || json.enrolment?.id;

          if (effectiveEnrolmentStatus === "PENDING_AGREEMENT" && effectiveEnrolmentId) {
            const agreementUrl = `/agreement?enrolmentId=${effectiveEnrolmentId}&programId=${json.program.id}${json.batch?.id ? `&batchId=${json.batch.id}` : ""}`;
            router.replace(agreementUrl);
            return;
          }

          // Check if enrolment is already ACTIVE or COMPLETED
          if (effectiveEnrolmentStatus === "ACTIVE" || effectiveEnrolmentStatus === "COMPLETED") {
            setAlreadyEnrolledError(
              "You have already completed enrolment and payment for this course."
            );
          }
        }
      } catch (err: any) {
        if (isMounted) setError(err.message || "Could not load checkout details.");
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchTokenDetails();
    return () => {
      isMounted = false;
    };
  }, [token]);

  const handleStripeCheckout = async () => {
    if (!data) return;

    setProcessing(true);
    setSimulationError(null);
    setAlreadyEnrolledError(null);

    try {
      const targetEnrolId = data.enrolmentId || data.enrolment?.id;
      const res = await fetch(`${API_URL}/payments/checkout-session`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          targetType: "ENROLMENT",
          targetId: data.program.id,
          enrolmentId: targetEnrolId,
          leadToken: token,
          amount: data.pricing?.amount || data.amount,
          currency: data.pricing?.currency || data.currency || "USD",
          idempotencyKey: `lead_chk_${Date.now()}_${(targetEnrolId || '').slice(0, 8)}`,
          origin: typeof window !== "undefined" ? window.location.origin : undefined,
          returnUrl: typeof window !== "undefined" ? `${window.location.origin}/checkout/success` : undefined,
          cancelUrl: typeof window !== "undefined" ? `${window.location.origin}/checkout/lead/${token}?cancelled=1` : undefined,
        }),
      });

      const resData = await res.json().catch(() => null);

      if (!res.ok) {
        if (resData?.error === "ALREADY_ENROLLED" || resData?.message?.includes("already enrolled")) {
          setAlreadyEnrolledError(
            resData?.message || "You have already completed enrolment and payment for this course."
          );
          return;
        }
        throw new Error(resData?.message || `Checkout initialization failed with status ${res.status}`);
      }

      if (resData?.checkoutUrl) {
        window.location.href = resData.checkoutUrl;
        return;
      }

      if (resData?.simulationBypass) {
        await handleSimulatePayment("PAID");
        return;
      }

      throw new Error("No checkout URL returned from payment provider.");
    } catch (err: any) {
      console.error("Stripe lead checkout error:", err);
      setSimulationError(err?.message || "Failed to initialize Stripe checkout.");
    } finally {
      setProcessing(false);
    }
  };

  const handleSimulatePayment = async (status: "PAID" | "FAILED") => {
    if (!data) return;

    setProcessing(true);
    setSimulationError(null);

    // Realistic simulation transition delay
    await new Promise((resolve) => setTimeout(resolve, 800));

    try {
      const authToken = localStorage.getItem("token") || data.accessToken;
      const res = await fetch(`${API_URL}/payments/webhook/test-simulate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify({
          targetType: "ENROLMENT",
          targetId: data.program.id,
          enrolmentId: data.enrolmentId || data.enrolment?.id,
          userId: data.user?.id,
          amount: data.amount,
          currency: data.currency,
          status,
          failureReason: status === "FAILED" ? "Simulated test bank transaction declined." : undefined,
          idempotencyKey: `lead_chk_${Date.now()}_${(data.enrolmentId || data.enrolment?.id || '').slice(0, 8)}`,
        }),
      });

      const resJson = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(resJson?.message || `Checkout failed with status ${res.status}`);
      }

      if (status === "PAID") {
        setSimulationResult(resJson);
      } else {
        setSimulationError(resJson?.message || "Simulated payment response: Transaction was declined as requested.");
      }
    } catch (e: any) {
      setSimulationError(e?.message || "Failed to execute simulated checkout.");
    } finally {
      setProcessing(false);
    }
  };

  const currencySymbol =
    data?.currency === "INR" ? "₹" : data?.currency === "AED" ? "AED " : "$";

  if (loading) {
    return (
      <div className={styles.authContainer} style={{ background: "#FAF7F2" }}>
        <div
          className={styles.authCard}
          style={{
            maxWidth: "540px",
            background: "#FFFFFF",
            border: "1px solid #E7E0D6",
            borderRadius: "20px",
            textAlign: "center",
          }}
        >
          <h2 style={{ color: "#1C1917" }}>Loading Course Agreement...</h2>
          <p style={{ color: "#78716A" }}>Preparing your enrolment agreement...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className={styles.authContainer} style={{ background: "#FAF7F2" }}>
        <div
          className={styles.authCard}
          style={{
            maxWidth: "540px",
            background: "#FFFFFF",
            border: "1px solid #FECACA",
            borderRadius: "20px",
            textAlign: "center",
          }}
        >
          <div
            style={{
              width: "48px",
              height: "48px",
              borderRadius: "50%",
              background: "#FEE2E2",
              color: "#DC2626",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 1rem",
              fontSize: "1.25rem",
              fontWeight: "bold",
            }}
          >
            !
          </div>
          <h2 style={{ color: "#1C1917" }}>Invalid or Expired Link</h2>
          <p style={{ color: "#78716A", marginBottom: "1.5rem" }}>
            {error || "This checkout link is no longer valid or has expired."}
          </p>
          <Link
            href="/"
            className={styles.submitBtn}
            style={{
              display: "inline-block",
              textDecoration: "none",
              padding: "0.85rem 1.75rem",
              background: "#1C1917",
              color: "#FFFFFF",
              borderRadius: "12px",
            }}
          >
            Return to Homepage
          </Link>
        </div>
      </div>
    );
  }

  const agreementUrl = `/agreement?programId=${data.program.id}&enrolmentId=${data.enrolmentId || data.enrolment?.id || ""}`;
  const programStepsUrl = `/programs/${data.program.id}/steps`;

  return (
    <div className={styles.authContainer} style={{ background: "#FAF7F2", minHeight: "100vh", padding: "2rem 1rem" }}>
      <div
        className={styles.authCard}
        style={{
          maxWidth: "600px",
          background: "#FFFFFF",
          border: "1px solid #E7E0D6",
          borderRadius: "24px",
          padding: "2.5rem 2rem",
          boxShadow: "0 10px 30px -5px rgba(20, 17, 15, 0.05)",
          textAlign: "left",
        }}
      >
        {/* Brand */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <Image src="/icon.png" alt="WhatBoutMe" width={28} height={28} />
            <span style={{ fontWeight: 800, fontSize: "1.1rem", color: "#1C1917", letterSpacing: "-0.01em" }}>
              whatboutme
            </span>
          </div>
        </div>

        {/* Header */}
        <h1 style={{ fontSize: "1.5rem", fontWeight: 800, color: "#1C1917", margin: "0 0 0.4rem" }}>
          Complete Your Enrolment
        </h1>
        <p style={{ fontSize: "0.88rem", color: "#78716A", margin: "0 0 1.5rem", lineHeight: 1.5 }}>
          Welcome, <strong style={{ color: "#1C1917" }}>{data.candidateName || data.lead?.name || "Learner"}</strong> ({data.maskedEmail || data.lead?.email}). Your 1-on-1 Discovery consultation has provisioned your priority enrolment.
        </p>

        {/* ALREADY ENROLLED GUARD BANNER */}
        {alreadyEnrolledError ? (
          <div
            style={{
              background: "#F0FDF4",
              border: "1px solid #BBF7D0",
              borderRadius: "16px",
              padding: "1.5rem",
              textAlign: "center",
              marginBottom: "1.5rem",
            }}
          >
            <div
              style={{
                width: "48px",
                height: "48px",
                borderRadius: "50%",
                background: "#DCFCE7",
                color: "#15803D",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 1rem",
                fontSize: "1.5rem",
              }}
            >
              ✓
            </div>
            <h3 style={{ fontSize: "1.15rem", fontWeight: 800, color: "#166534", margin: "0 0 0.5rem" }}>
              Already Enrolled &amp; Paid
            </h3>
            <p style={{ fontSize: "0.88rem", color: "#15803D", margin: "0 0 1.25rem", lineHeight: 1.5 }}>
              {alreadyEnrolledError} Multiple payments for the same program are strictly prevented.
            </p>
            <Link
              href={programStepsUrl}
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "0.5rem",
                width: "100%",
                background: "#15803D",
                color: "#FFFFFF",
                fontWeight: 700,
                fontSize: "1rem",
                padding: "0.85rem 1.5rem",
                borderRadius: "12px",
                textDecoration: "none",
                boxShadow: "0 4px 12px rgba(22, 101, 52, 0.2)",
              }}
            >
              Go to Program Curriculum &rarr;
            </Link>
          </div>
        ) : simulationResult ? (
          /* SUCCESS SIMULATION VIEW */
          <div
            style={{
              background: "#F0FDF4",
              border: "1px solid #BBF7D0",
              borderRadius: "16px",
              padding: "1.75rem",
              textAlign: "center",
              animation: "fadeIn 0.3s ease-in-out",
            }}
          >
            <div
              style={{
                width: "56px",
                height: "56px",
                borderRadius: "50%",
                background: "#DCFCE7",
                color: "#15803D",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 1rem",
                fontSize: "1.75rem",
              }}
            >
              ✓
            </div>
            <h2 style={{ fontSize: "1.25rem", fontWeight: 800, color: "#166534", margin: "0 0 0.5rem" }}>
              Payment Verified
            </h2>
            <p style={{ fontSize: "0.88rem", color: "#15803D", margin: "0 0 1.25rem", lineHeight: 1.5 }}>
              Your tuition of <strong>{currencySymbol}{data.amount.toLocaleString()} {data.currency}</strong> was successfully verified.
              {simulationResult.invoiceNumber && (
                <span style={{ display: "block", marginTop: "4px", fontSize: "0.82rem", color: "#166534" }}>
                  Invoice: <strong>{simulationResult.invoiceNumber}</strong>
                </span>
              )}
            </p>

            <div
              style={{
                background: "#FFFFFF",
                border: "1px solid #DCFCE7",
                borderRadius: "12px",
                padding: "1rem",
                marginBottom: "1.5rem",
                textAlign: "left",
                fontSize: "0.82rem",
                color: "#1F2937",
              }}
            >
              <strong style={{ display: "block", marginBottom: "4px", color: "#166534" }}>
                Next Step: Digital Program Agreement Required
              </strong>
              Under WhatBoutMe policy, Step 1 curriculum materials unlock immediately after you review and submit your digital dual-mode signature.
            </div>

            <Link
              href={agreementUrl}
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "0.5rem",
                width: "100%",
                background: "#15803D",
                color: "#FFFFFF",
                fontWeight: 700,
                fontSize: "1rem",
                padding: "1rem",
                borderRadius: "12px",
                textDecoration: "none",
                boxShadow: "0 4px 12px rgba(22, 101, 52, 0.2)",
              }}
            >
              <span>Review &amp; Sign Program Agreement &rarr;</span>
            </Link>
          </div>
        ) : (
          /* CHECKOUT FORM VIEW */
          <div>
            {/* Course Summary Card */}
            <div
              style={{
                background: "#FBF9F5",
                border: "1px solid #E7E0D6",
                borderRadius: "16px",
                padding: "1.5rem",
                marginBottom: "1.5rem",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "1rem" }}>
                <div>
                  <h2 style={{ fontSize: "1.15rem", fontWeight: 700, color: "#1C1917", margin: "0 0 0.35rem" }}>
                    {data.program.title}
                  </h2>
                  <div style={{ fontSize: "0.8rem", color: "#78716A" }}>
                    Batch: <strong style={{ color: "#44403C" }}>{data.batch?.name || "Upcoming Batch"}</strong>
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: "1.35rem", fontWeight: 800, color: "#B86B11" }}>
                    {currencySymbol}{data.amount.toLocaleString()}
                  </div>
                  <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "#78716A" }}>
                    {data.currency}
                  </div>
                </div>
              </div>

              {data.program.description && (
                <p style={{ fontSize: "0.82rem", color: "#78716A", margin: "1rem 0 0", lineHeight: 1.45, borderTop: "1px solid #EFEAE2", paddingTop: "0.75rem" }}>
                  {stripFormatting(data.program.description)}
                </p>
              )}
            </div>

            {/* Provider indicator badge */}
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.5rem",
                fontSize: "0.75rem",
                fontWeight: 600,
                color: activeProvider === "STRIPE" ? "#4338CA" : "#78716A",
                background: activeProvider === "STRIPE" ? "#EEF2FF" : "#F7F3EC",
                padding: "5px 12px",
                borderRadius: "9999px",
                marginBottom: "1rem",
                border: activeProvider === "STRIPE" ? "1px solid #C7D2FE" : "1px solid #E7E0D6",
              }}
            >
              <span>
                {activeProvider === "STRIPE"
                  ? "Stripe 256-Bit SSL Encrypted & Adaptive Pricing Active"
                  : "TEST_BYPASS Mode: Server-Side Webhook Emulation Active"}
              </span>
            </div>

            {simulationError && (
              <div
                style={{
                  background: "#FEF2F2",
                  border: "1px solid #FECACA",
                  borderRadius: "12px",
                  padding: "0.85rem 1rem",
                  fontSize: "0.82rem",
                  color: "#DC2626",
                  marginBottom: "1rem",
                }}
              >
                {simulationError}
              </div>
            )}

            {/* Payment Action Buttons */}
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              {activeProvider === "STRIPE" ? (
                <>
                  <button
                    type="button"
                    onClick={handleStripeCheckout}
                    disabled={processing}
                    style={{
                      width: "100%",
                      background: "#635BFF",
                      color: "#FFFFFF",
                      borderRadius: "12px",
                      padding: "1rem",
                      fontSize: "1rem",
                      fontWeight: 700,
                      border: "none",
                      cursor: processing ? "not-allowed" : "pointer",
                      opacity: processing ? 0.7 : 1,
                      display: "flex",
                      justifyContent: "center",
                      alignItems: "center",
                      gap: "0.5rem",
                      boxShadow: "0 2px 8px rgba(99, 91, 255, 0.35)",
                      transition: "all 0.2s ease",
                    }}
                  >
                    {processing ? (
                      "Connecting to Stripe Checkout..."
                    ) : (
                      <>
                        <span>Pay with Stripe Checkout</span>
                        <span>({currencySymbol}{data.amount.toLocaleString()} {data.currency})</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSimulatePayment("PAID")}
                    disabled={processing}
                    style={{
                      width: "100%",
                      background: "#F5F3FF",
                      color: "#635BFF",
                      borderRadius: "12px",
                      padding: "0.75rem",
                      fontSize: "0.82rem",
                      fontWeight: 600,
                      border: "1px dashed #C7D2FE",
                      cursor: processing ? "not-allowed" : "pointer",
                      opacity: processing ? 0.5 : 1,
                    }}
                  >
                    Quick Developer Test Bypass (Simulate Instant Paid)
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => handleSimulatePayment("PAID")}
                    disabled={processing}
                    style={{
                      width: "100%",
                      background: "#B86B11",
                      color: "#FFFFFF",
                      borderRadius: "12px",
                      padding: "1rem",
                      fontSize: "1rem",
                      fontWeight: 700,
                      border: "none",
                      cursor: processing ? "not-allowed" : "pointer",
                      opacity: processing ? 0.7 : 1,
                      display: "flex",
                      justifyContent: "center",
                      alignItems: "center",
                      gap: "0.5rem",
                      boxShadow: "0 2px 6px rgba(184, 107, 17, 0.25)",
                      transition: "all 0.2s ease",
                    }}
                  >
                    {processing ? (
                      "Processing Simulated Payment..."
                    ) : (
                      <>
                        <span>Simulate Test Payment (Instant Paid)</span>
                        <span>({currencySymbol}{data.amount.toLocaleString()})</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSimulatePayment("FAILED")}
                    disabled={processing}
                    style={{
                      width: "100%",
                      background: "transparent",
                      color: "#DC2626",
                      borderRadius: "12px",
                      padding: "0.75rem",
                      fontSize: "0.85rem",
                      fontWeight: 600,
                      border: "1px dashed #FECACA",
                      cursor: processing ? "not-allowed" : "pointer",
                      opacity: processing ? 0.5 : 1,
                    }}
                  >
                    Simulate Failed Payment (Test Decline Path)
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
