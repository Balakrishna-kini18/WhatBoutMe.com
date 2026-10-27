"use client";

import { Suspense, useEffect } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { API_URL, getAuthHeaders } from "../../lib/api";
import { resolveProgramEntry } from "./programEntryLogic";

/**
 * Smart Course & Post-Signup Enrollment Entry Route (`/programs/[id]`).
 *
 * When a learner lands on `/programs/[id]` (e.g. after signup/login redirect with
 * `?autoEnroll=true&batchId=...&coupon=...`):
 *  1. If unauthenticated -> saves 30-min enrollment intent and redirects to `/signup` (or `/login`).
 *  2. If authenticated & ALREADY ENROLLED (`ACTIVE` or `COMPLETED`) -> strips `autoEnroll` and
 *     routes directly to `/programs/[id]/steps?welcomeBack=1`.
 *  3. If authenticated & `PENDING_PAYMENT` -> routes to `/checkout?programId=[id]&enrolmentId=...`.
 *  4. If authenticated & not yet enrolled (or `PENDING_AGREEMENT`) -> routes to
 *     `/agreement?programId=[id]&autoEnroll=true` (preserving `batchId` and `coupon`).
 */
function ProgramEntryRedirectContent() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const programId = params?.id as string;

  useEffect(() => {
    if (!programId) {
      router.replace("/courses");
      return;
    }

    const autoEnroll =
      searchParams.get("autoEnroll") === "true" ||
      searchParams.get("enroll") === "true";
    const batchId = searchParams.get("batchId");
    const coupon = searchParams.get("coupon");

    const token =
      typeof window !== "undefined" ? localStorage.getItem("token") : null;

    if (!token) {
      const outcome = resolveProgramEntry({
        programId,
        token: null,
        autoEnroll,
        batchId,
        coupon,
      });
      window.location.replace(outcome.url);
      return;
    }

    let cancelled = false;

    async function resolveDestination() {
      let userEnrolments: any[] = [];
      try {
        const res = await fetch(`${API_URL}/enrollments/me`, {
          headers: getAuthHeaders(),
        });
        if (res.ok) {
          const data = await res.json();
          userEnrolments = Array.isArray(data) ? data : [];
        }
      } catch {
        // Fall through to resolveProgramEntry with empty enrolments list
      }

      if (!cancelled) {
        const outcome = resolveProgramEntry({
          programId,
          token,
          autoEnroll,
          batchId,
          coupon,
          userEnrolments,
        });

        if (outcome.action === "REDIRECT_AUTH") {
          window.location.replace(outcome.url);
        } else {
          router.replace(outcome.url);
        }
      }
    }

    void resolveDestination();

    return () => {
      cancelled = true;
    };
  }, [programId, router, searchParams]);

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#faf7f2",
        padding: "1rem",
      }}
    >
      <div
        style={{
          maxWidth: 420,
          width: "100%",
          background: "#ffffff",
          border: "1px solid #e7e0d6",
          borderRadius: 16,
          padding: "2.5rem 2rem",
          textAlign: "center",
          boxShadow: "0 1px 3px rgba(28, 25, 23, 0.04)",
        }}
      >
        <div
          className="skeleton"
          style={{
            width: 44,
            height: 44,
            borderRadius: "50%",
            margin: "0 auto 1.25rem",
          }}
        />
        <div
          className="skeleton"
          style={{
            width: "65%",
            height: 20,
            borderRadius: 6,
            margin: "0 auto 0.75rem",
          }}
        />
        <p style={{ margin: 0, fontSize: "0.88rem", color: "#78716a" }}>
          Preparing your course enrollment…
        </p>
      </div>
    </div>
  );
}

export default function ProgramEntryRedirectPage() {
  return (
    <Suspense>
      <ProgramEntryRedirectContent />
    </Suspense>
  );
}
