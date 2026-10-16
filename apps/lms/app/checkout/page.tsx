"use client";

import { useEffect, useState, Suspense } from "react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import styles from "../login/auth.module.css";
import { SITE_URL } from "../lib/site";
import { parseCourseInfo } from "../lib/courseInfo";
import { API_URL } from "../lib/api";

function CheckoutContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const programId = searchParams.get("programId");

  const [program, setProgram] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    // Check if user is logged in
    const token = localStorage.getItem("token");
    const userStr = localStorage.getItem("user");
    if (token && userStr) {
      setUser(JSON.parse(userStr));
    }

    if (programId) {
      fetch(`${API_URL}/programs`)
        .then((res) => res.json())
        .then((data) => {
          const p = data.find((x: any) => x.id === programId);
          setProgram(p);
          setLoading(false);
        })
        .catch(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [programId]);

  const handleSimulatePayment = async () => {
    if (!user) {
      // If not logged in, they must log in first to pay
      router.push(`/login?programId=${programId}`);
      return;
    }

    setProcessing(true);
    
    // Simulate a 1.5 second payment gateway delay
    await new Promise((resolve) => setTimeout(resolve, 1500));

    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_URL}/checkout/mock`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ programId }),
      });
      if (!res.ok) {
        const errorText = await res.text();
        // If they are already enrolled, just redirect them smoothly
        if (errorText.includes("already enrolled")) {
          router.push("/courses");
          return;
        }
        throw new Error(errorText);
      }
      // straight to My Courses, where the course just bought now appears
      router.push("/courses");
    } catch (e: any) {
      console.error("Payment failed", e);
      
      let errorMessage = e.message;
      try {
        const parsed = JSON.parse(e.message);
        errorMessage = parsed.error?.message || parsed.message || e.message;
      } catch (err) {}

      alert("Checkout failed: " + errorMessage);
      setProcessing(false);
    }
  }

  if (loading) {
    return <div style={{ textAlign: "center", padding: "4rem" }}>Loading checkout...</div>;
  }

  if (!program) {
    return (
      <div className={styles.authContainer}>
        <div className={styles.authCard}>
          <h2>Course Not Found</h2>
          <p>We couldn't find the program you are trying to enroll in.</p>
          <Link href={`${SITE_URL}/courses`} className={styles.submitBtn} style={{ display: "inline-block", textDecoration: "none" }}>
            Go Back
          </Link>
        </div>
      </div>
    );
  }

  const courseInfo = parseCourseInfo(program.description);

  return (
    <div className={styles.authContainer}>
      <div className={styles.authCard} style={{ maxWidth: "520px" }}>
        <h1 className={styles.logo}>Checkout</h1>
        <h2 style={{ fontSize: "1.2rem", marginBottom: "1.5rem" }}>Order Summary</h2>

        <div style={{ background: "var(--bg-soft)", padding: "1.5rem", borderRadius: "12px", textAlign: "left", marginBottom: "1.5rem", border: "1px solid var(--border-light)" }}>
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

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "0.75rem", marginBottom: "0.5rem" }}>
            <h3 style={{ margin: 0, color: "var(--text-primary)", fontSize: "1.25rem", fontWeight: 700 }}>{program.title}</h3>
            {courseInfo?.type && (
              <span style={{ fontSize: "0.75rem", fontWeight: 600, padding: "3px 10px", borderRadius: "9999px", background: "var(--accent-highlight)", color: "var(--accent-highlight-text)", border: "1px solid var(--border-light)", whiteSpace: "nowrap" }}>
                {courseInfo.type}
              </span>
            )}
          </div>

          <p style={{ margin: "0 0 1rem 0", color: "var(--text-secondary)", fontSize: "0.9rem", lineHeight: 1.55 }}>
            {courseInfo?.summary || "A comprehensive learning journey."}
          </p>

          {(courseInfo?.duration || courseInfo?.audience || courseInfo?.inPerson || courseInfo?.online) && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", marginBottom: "1rem" }}>
              {courseInfo.duration && (
                <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)", background: "var(--bg-card)", padding: "3px 8px", borderRadius: "6px", border: "1px solid var(--border-light)" }}>
                  ⏱ {courseInfo.duration}
                </span>
              )}
              {courseInfo.audience && (
                <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)", background: "var(--bg-card)", padding: "3px 8px", borderRadius: "6px", border: "1px solid var(--border-light)" }}>
                  🎯 {courseInfo.audience}
                </span>
              )}
              {courseInfo.inPerson && (
                <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)", background: "var(--bg-card)", padding: "3px 8px", borderRadius: "6px", border: "1px solid var(--border-light)" }}>
                  📍 In person: {courseInfo.inPerson}
                </span>
              )}
              {courseInfo.online && (
                <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)", background: "var(--bg-card)", padding: "3px 8px", borderRadius: "6px", border: "1px solid var(--border-light)" }}>
                  💻 Online: {courseInfo.online}
                </span>
              )}
            </div>
          )}

          {courseInfo?.points && courseInfo.points.length > 0 && (
            <div style={{ marginBottom: "1rem", padding: "0.75rem 1rem", background: "var(--bg-card)", borderRadius: "8px", border: "1px solid var(--border-light)" }}>
              <div style={{ fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--text-muted)", marginBottom: "0.4rem" }}>
                What it covers
              </div>
              <ul style={{ margin: 0, paddingLeft: "1.2rem", fontSize: "0.85rem", color: "var(--text-secondary)", lineHeight: 1.45 }}>
                {courseInfo.points.map((pt, idx) => (
                  <li key={idx} style={{ marginBottom: idx === courseInfo.points.length - 1 ? 0 : "0.25rem" }}>{pt}</li>
                ))}
              </ul>
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px dashed var(--border-light)", paddingTop: "1rem" }}>
            <strong style={{ color: "var(--text-primary)" }}>Total Due:</strong>
            <h2 style={{ margin: 0, color: "var(--accent-primary)", fontSize: "1.6rem", fontWeight: 700 }}>${program.price}</h2>
          </div>
        </div>

        {!user ? (
          <div style={{ background: "var(--accent-highlight)", padding: "1rem", borderRadius: "8px", marginBottom: "1.5rem", border: "1px solid var(--border-light)", textAlign: "left", fontSize: "0.9rem" }}>
            <strong>Hold on!</strong> You need to be logged in to complete this purchase. 
            <br/><br/>
            <Link href={`/login?programId=${programId}`} style={{ fontWeight: "bold", color: "var(--accent-primary)" }}>Log in</Link> or <Link href={`/signup?programId=${programId}`} style={{ fontWeight: "bold", color: "var(--accent-primary)" }}>Sign up</Link> to continue.
          </div>
        ) : (
          <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginBottom: "1.5rem" }}>
            Logged in as <strong>{user.email}</strong>
          </p>
        )}

        <button 
          className={styles.submitBtn} 
          onClick={handleSimulatePayment} 
          disabled={processing || !user}
          style={{ width: "100%", opacity: processing || !user ? 0.7 : 1, display: "flex", justifyContent: "center", alignItems: "center", gap: "0.5rem" }}
        >
          {processing ? (
            "Processing Payment..."
          ) : !user ? (
            "Log in to Pay"
          ) : (
            "Complete Purchase (Simulate)"
          )}
        </button>
      </div>
    </div>
  );
}

export default function CheckoutPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <CheckoutContent />
    </Suspense>
  );
}
