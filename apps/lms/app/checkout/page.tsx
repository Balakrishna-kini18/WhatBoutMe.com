"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import styles from "../login/auth.module.css";
import { SITE_URL } from "../lib/site";

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
      fetch(`${process.env.NEXT_PUBLIC_API_URL || `${process.env.NEXT_PUBLIC_API_URL || `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}`}`}/programs`)
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
      await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/checkout/mock`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ programId }),
      });
      // straight to My Courses, where the course just bought now appears
      router.push("/courses");
    } catch (e) {
      console.error("Payment failed", e);
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

  return (
    <div className={styles.authContainer}>
      <div className={styles.authCard} style={{ maxWidth: "500px" }}>
        <h1 className={styles.logo}>Checkout</h1>
        <h2 style={{ fontSize: "1.2rem", marginBottom: "1.5rem" }}>Order Summary</h2>

        <div style={{ background: "var(--bg-soft)", padding: "1.5rem", borderRadius: "12px", textAlign: "left", marginBottom: "1.5rem", border: "1px solid var(--border-light)" }}>
          <h3 style={{ margin: "0 0 0.5rem 0", color: "var(--text-primary)" }}>{program.title}</h3>
          <p style={{ margin: "0 0 1rem 0", color: "var(--text-secondary)", fontSize: "0.9rem" }}>{program.description || "A comprehensive learning journey."}</p>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px dashed var(--border-light)", paddingTop: "1rem" }}>
            <strong>Total Due:</strong>
            <h2 style={{ margin: 0, color: "var(--accent-primary)" }}>${program.price}</h2>
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
