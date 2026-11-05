"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { API_URL } from "../../lib/api";
import { sanitizeExternalUrl } from "../../lib/auth-redirect";

function CheckoutSuccessContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session_id");

  const [loading, setLoading] = useState(true);
  const [pollCount, setPollCount] = useState(0);
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId) {
      setError("No payment session reference provided.");
      setLoading(false);
      return;
    }

    let isMounted = true;
    let timeoutId: any = null;

    const checkStatus = async () => {
      try {
        const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
        const res = await fetch(`${API_URL}/payments/session-status/${encodeURIComponent(sessionId)}`, {
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        });

        if (!res.ok) {
          throw new Error(`Failed to retrieve session status (HTTP ${res.status})`);
        }

        const json = await res.json();
        if (!isMounted) return;

        if (json.status === "PAID" || json.success) {
          setData(json);
          setLoading(false);
          return;
        }

        // If still pending, retry up to 6 times (9 seconds total)
        if (pollCount < 6) {
          timeoutId = setTimeout(() => {
            if (isMounted) setPollCount((c) => c + 1);
          }, 1500);
        } else {
          // Polling threshold reached; show soft pending state
          setData(json);
          setLoading(false);
        }
      } catch (err: any) {
        if (!isMounted) return;
        if (pollCount < 4) {
          timeoutId = setTimeout(() => {
            if (isMounted) setPollCount((c) => c + 1);
          }, 1500);
        } else {
          setError(err?.message || "Could not verify payment session.");
          setLoading(false);
        }
      }
    };

    checkStatus();

    return () => {
      isMounted = false;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [sessionId, pollCount]);

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: "#FAF7F2", padding: "3rem 1rem", display: "flex", justifyContent: "center" }}>
        <div style={{ width: "100%", maxWidth: "600px" }}>
          <div style={{ background: "#FFFFFF", border: "1px solid #E7E0D6", borderRadius: "20px", padding: "3rem 2rem", textAlign: "center" }}>
            <div style={{ width: "50px", height: "50px", border: "3px solid #E7E0D6", borderTopColor: "#635BFF", borderRadius: "50%", animation: "spin 1s linear infinite", margin: "0 auto 1.5rem" }} />
            <h2 style={{ color: "#1C1917", fontSize: "1.35rem", fontWeight: 700, margin: "0 0 0.5rem" }}>
              Verifying Your Payment...
            </h2>
            <p style={{ color: "#78716A", fontSize: "0.92rem", margin: 0, lineHeight: 1.5 }}>
              Securing confirmation from Stripe and provisioning your WhatBoutMe enrolment pass. Please wait...
            </p>
          </div>
        </div>
        <style jsx global>{`
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  if (error || !sessionId) {
    return (
      <div style={{ minHeight: "100vh", background: "#FAF7F2", padding: "3rem 1rem", display: "flex", justifyContent: "center" }}>
        <div style={{ width: "100%", maxWidth: "600px" }}>
          <div style={{ background: "#FFFFFF", border: "1px solid #FECACA", borderRadius: "20px", padding: "2.5rem 2rem", textAlign: "center" }}>
            <div style={{ width: "48px", height: "48px", borderRadius: "50%", background: "#FEE2E2", color: "#DC2626", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 1rem", fontSize: "1.25rem", fontWeight: "bold" }}>
              !
            </div>
            <h2 style={{ color: "#1C1917", fontSize: "1.35rem", fontWeight: 700, margin: "0 0 0.5rem" }}>
              Session Verification Warning
            </h2>
            <p style={{ color: "#78716A", fontSize: "0.92rem", marginBottom: "1.5rem" }}>
              {error || "Could not locate a valid Stripe payment session."}
            </p>
            <Link
              href="/"
              style={{
                display: "inline-block",
                padding: "0.85rem 1.75rem",
                background: "#1C1917",
                color: "#FFFFFF",
                borderRadius: "12px",
                fontWeight: 600,
                textDecoration: "none",
                fontSize: "0.95rem",
              }}
            >
              Go to Learner Dashboard
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const isPaid = data?.status === "PAID" || data?.success;
  const programId = data?.programId;
  const isSigned = data?.isSigned;
  const agreementUrl = `/agreement?programId=${programId || ""}${data?.enrolmentId ? `&enrolmentId=${data.enrolmentId}` : ""}`;

  return (
    <div style={{ minHeight: "100vh", background: "#FAF7F2", padding: "3rem 1rem", display: "flex", justifyContent: "center" }}>
      <div style={{ width: "100%", maxWidth: "620px" }}>
        <div
          style={{
            background: "#FFFFFF",
            border: "1px solid #E7E0D6",
            borderRadius: "24px",
            padding: "2.5rem 2rem",
            boxShadow: "0 10px 30px -5px rgba(20, 17, 15, 0.04)",
            textAlign: "center",
          }}
        >
          {/* Header Icon */}
          <div
            style={{
              width: "56px",
              height: "56px",
              borderRadius: "50%",
              background: isPaid ? "#DCFCE7" : "#FEF3C7",
              color: isPaid ? "#15803D" : "#B45309",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 1.25rem",
              fontSize: "1.75rem",
              fontWeight: "bold",
            }}
          >
            {isPaid ? "✓" : "⏳"}
          </div>

          <h1 style={{ color: "#1C1917", fontSize: "1.5rem", fontWeight: 800, margin: "0 0 0.5rem" }}>
            {isPaid ? "Payment Confirmed & Verified!" : "Payment Processing"}
          </h1>

          <p style={{ color: "#78716A", fontSize: "0.95rem", margin: "0 0 1.5rem", lineHeight: 1.55 }}>
            {isPaid
              ? "Your transaction was securely recognized by Stripe. An official WhatBoutMe FZE Tax Invoice has been generated."
              : "Your payment has been authorized and is settling with your bank. Access will unlock momentarily."}
          </p>

          {/* Confirmed Amount Badge */}
          {data?.amount !== undefined && (
            <div style={{ marginBottom: "1.25rem" }}>
              <div style={{ fontSize: "1.75rem", fontWeight: 800, color: "#166534" }}>
                ${Number(data.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })} USD
              </div>
              {data?.localPayment && (
                <div style={{ fontSize: "0.85rem", color: "#64748B", marginTop: "0.25rem" }}>
                  Paid locally: <strong>{data.localPayment.localAmount} {data.localPayment.localCurrency}</strong> via Stripe Adaptive Pricing
                </div>
              )}
            </div>
          )}

          {/* Invoice Badge */}
          {data?.invoiceNumber && (
            <div
              style={{
                display: "inline-block",
                background: "#F0FDF4",
                border: "1px solid #BBF7D0",
                borderRadius: "8px",
                padding: "0.6rem 1.1rem",
                marginBottom: "1.5rem",
                fontSize: "0.88rem",
                fontWeight: 600,
                color: "#166534",
              }}
            >
              Tax Invoice No: <strong>{data.invoiceNumber}</strong>
            </div>
          )}

          {/* Action CTAs */}
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", textAlign: "center" }}>
            {data?.invoiceUrl && (
              <a
                href={
                  sanitizeExternalUrl(
                    data.invoiceUrl.startsWith("http")
                      ? data.invoiceUrl
                      : `${API_URL}${data.invoiceUrl.startsWith("/") ? "" : "/"}${data.invoiceUrl}`
                  ) || "#"
                }
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: "block",
                  padding: "0.85rem",
                  borderRadius: "12px",
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

            {isSigned ? (
              <button
                type="button"
                onClick={() => router.push(programId ? `/programs/${programId}/steps` : "/")}
                style={{
                  padding: "1rem",
                  borderRadius: "12px",
                  background: "#16A34A",
                  color: "#FFFFFF",
                  border: "none",
                  fontWeight: 700,
                  fontSize: "1rem",
                  cursor: "pointer",
                  boxShadow: "0 2px 8px rgba(22, 163, 74, 0.25)",
                }}
              >
                Proceed to Course Dashboard &amp; Step 1 &rarr;
              </button>
            ) : (
              <Link
                href={agreementUrl}
                style={{
                  display: "block",
                  padding: "1rem",
                  borderRadius: "12px",
                  background: "#B86B11",
                  color: "#FFFFFF",
                  fontWeight: 700,
                  fontSize: "1rem",
                  textDecoration: "none",
                  boxShadow: "0 2px 8px rgba(184, 107, 17, 0.25)",
                }}
              >
                Review &amp; Sign Program Agreement &rarr;
              </Link>
            )}

            <Link
              href="/"
              style={{
                marginTop: "0.5rem",
                color: "#78716A",
                fontSize: "0.88rem",
                textDecoration: "underline",
              }}
            >
              Return to Learner Portal Dashboard
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function CheckoutSuccessPage() {
  return (
    <Suspense
      fallback={
        <div style={{ minHeight: "100vh", background: "#FAF7F2", padding: "3rem 1rem", display: "flex", justifyContent: "center" }}>
          <div style={{ width: "100%", maxWidth: "600px" }}>
            <div style={{ background: "#FFFFFF", border: "1px solid #E7E0D6", borderRadius: "20px", padding: "3rem", textAlign: "center" }}>
              <h2 style={{ color: "#1C1917" }}>Loading...</h2>
            </div>
          </div>
        </div>
      }
    >
      <CheckoutSuccessContent />
    </Suspense>
  );
}

