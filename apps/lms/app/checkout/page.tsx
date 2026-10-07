"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import styles from "../login/auth.module.css";
import { SITE_URL } from "../lib/site";
import { API_URL } from "../lib/api";

function CheckoutContent() {
  const searchParams = useSearchParams();
  const programId = searchParams.get("programId");

  const [program, setProgram] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    // Check if user is logged in
    const token = localStorage.getItem("token");
    const userStr = localStorage.getItem("user");
    if (token && userStr) {
      try {
        setUser(JSON.parse(userStr));
      } catch {
        setUser(null);
      }
    }

    if (programId) {
      fetch(`${API_URL}/programs`)
        .then((res) => res.json())
        .then((data) => {
          const p = Array.isArray(data) ? data.find((x: any) => x.id === programId) : null;
          setProgram(p);
          setLoading(false);
        })
        .catch(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [programId]);

  if (loading) {
    return <div style={{ textAlign: "center", padding: "4rem" }}>Loading program details...</div>;
  }

  if (!program) {
    return (
      <div className={styles.authContainer}>
        <div className={styles.authCard}>
          <h2>Course Not Found</h2>
          <p>We couldn't find the program you are looking for.</p>
          <Link
            href={`${SITE_URL}/courses`}
            className={styles.submitBtn}
            style={{ display: "inline-block", textDecoration: "none", marginTop: "1rem" }}
          >
            Browse Programs
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.authContainer}>
      <div className={styles.authCard} style={{ maxWidth: "560px", textAlign: "left" }}>
        <h1 className={styles.logo} style={{ textAlign: "center" }}>Enrolment & Checkout</h1>
        <h2 style={{ fontSize: "1.2rem", marginBottom: "1.5rem", textAlign: "center" }}>
          {program.title}
        </h2>

        <div
          style={{
            background: "var(--bg-soft)",
            padding: "1.5rem",
            borderRadius: "12px",
            marginBottom: "1.5rem",
            border: "1px solid var(--border-light)",
          }}
        >
          <p style={{ margin: "0 0 1rem 0", color: "var(--text-secondary)", fontSize: "0.9rem" }}>
            {program.description || "A comprehensive personal transformation curriculum."}
          </p>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              borderTop: "1px dashed var(--border-light)",
              paddingTop: "1rem",
            }}
          >
            <strong>Standard Tuition:</strong>
            <h2 style={{ margin: 0, color: "var(--accent-primary)" }}>${program.price}</h2>
          </div>
        </div>

        {/* Explicit Deferred Notice - Client PDF / Development Plan Alignment */}
        <div
          style={{
            background: "#eff6ff",
            border: "1px solid #bfdbfe",
            borderRadius: "10px",
            padding: "1.25rem",
            marginBottom: "1.5rem",
          }}
        >
          <div style={{ display: "flex", gap: "10px", alignItems: "flex-start" }}>
            <span style={{ fontSize: "1.25rem" }}>ℹ️</span>
            <div>
              <strong style={{ color: "#1e40af", display: "block", marginBottom: "4px" }}>
                Admissions & Enrolment Process
              </strong>
              <p style={{ margin: 0, fontSize: "0.875rem", color: "#1e3a8a", lineHeight: 1.5 }}>
                Direct online self-service card processing (Stripe) is scheduled for Phase 7. Batch allocations, corporate sponsorships, and verified student enrolments are processed directly by our administration.
              </p>
            </div>
          </div>
        </div>

        {user ? (
          <div style={{ marginBottom: "1.5rem", fontSize: "0.875rem", color: "#64748b" }}>
            Logged in as <strong>{user.email}</strong>. Once our administration registers you into a cohort, you will be invited to sign your Program Agreement and commence Step 1.
          </div>
        ) : (
          <div
            style={{
              background: "#fef3c7",
              padding: "1rem",
              borderRadius: "8px",
              marginBottom: "1.5rem",
              border: "1px solid #fde68a",
              fontSize: "0.875rem",
              color: "#92400e",
            }}
          >
            <strong>Not signed in?</strong> Please{" "}
            <Link href={`/login?programId=${programId}`} style={{ fontWeight: "bold", color: "#b45309" }}>
              Log in
            </Link>{" "}
            or{" "}
            <Link href={`/signup?programId=${programId}`} style={{ fontWeight: "bold", color: "#b45309" }}>
              Sign up
            </Link>{" "}
            to establish your learner account.
          </div>
        )}

        <div style={{ display: "flex", gap: "12px", justifyContent: "center" }}>
          <Link
            href="/courses"
            className={styles.submitBtn}
            style={{ textDecoration: "none", textAlign: "center", display: "inline-block", padding: "12px 24px" }}
          >
            Go to My Courses
          </Link>
          <Link
            href={`${SITE_URL}/contact`}
            style={{
              textDecoration: "none",
              textAlign: "center",
              display: "inline-block",
              padding: "12px 20px",
              border: "1px solid #cbd5e1",
              borderRadius: "8px",
              color: "#475569",
              fontWeight: 600,
              fontSize: "0.9rem",
            }}
          >
            Contact Admissions
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function CheckoutPage() {
  return (
    <Suspense fallback={<div style={{ textAlign: "center", padding: "4rem" }}>Loading...</div>}>
      <CheckoutContent />
    </Suspense>
  );
}
