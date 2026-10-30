"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import styles from "../../../page.module.css";
import { API_URL, errorMessage, cachedFetch } from "../../../lib/api";
import { formatCourseInfo, parseCourseInfo } from "../../courseInfo";
import Step1CourseSetup from "../components/Step1CourseSetup";

export default function EditProgramPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const unwrapped = use(params);
  const programId = (unwrapped as { id: string }).id;
  const router = useRouter();

  const [programData, setProgramData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await cachedFetch(`${API_URL}/programs`, { skipCache: true });
        if (res.ok) {
          const progs = await res.json();
          const list = Array.isArray(progs) ? progs : progs?.items || [];
          const found = list.find((p: any) => p.id === programId);
          if (found && mounted) {
            setProgramData(found);
          }
        }
      } catch (e: any) {
        if (mounted) setErrorMsg(e.message || "Could not load program data.");
      } finally {
        if (mounted) setIsLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [programId]);

  const handleSaveAndContinue = async (updatedData: {
    title: string;
    description: string;
    shortDescription?: string;
    thumbnailUrl?: string;
    category?: string;
    level?: string;
    price?: number;
    currency?: "USD" | "AED" | "INR";
    priceUSD?: number;
    priceAED?: number;
    priceINR?: number;
    earlyBirdPrice?: number | null;
    earlyBirdCurrency?: "USD" | "AED" | "INR" | null;
    earlyBirdDeadline?: string | null;
    hasCertificate?: boolean;
    requireExam?: boolean;
    requireCoaching?: boolean;
    requireMissionStatement?: boolean;
    sequentialProgressionEnabled?: boolean;
    attendanceRequired?: boolean;
    attendanceThreshold?: number;
    faqs?: Array<{
      id?: string;
      question: string;
      answer: string;
      sortOrder?: number;
    }>;
  }) => {
    setIsSaving(true);
    setErrorMsg(null);
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
      const parsed = parseCourseInfo(updatedData.description);
      const combinedDescription = formatCourseInfo({
        ...parsed,
        summary: updatedData.shortDescription || parsed.summary || updatedData.description || "",
        type: updatedData.category || parsed.type || "",
        image: updatedData.thumbnailUrl || parsed.image || "",
        faqs: updatedData.faqs || parsed.faqs || [],
      });

      const payload: Record<string, any> = {
        title: updatedData.title,
        description: combinedDescription || updatedData.description,
        price: Number(updatedData.price) || 0,
        currency: updatedData.currency || "USD",
        priceUSD: updatedData.priceUSD !== undefined ? Number(updatedData.priceUSD) : undefined,
        priceAED: updatedData.priceAED !== undefined ? Number(updatedData.priceAED) : undefined,
        priceINR: updatedData.priceINR !== undefined ? Number(updatedData.priceINR) : undefined,
        earlyBirdPrice: updatedData.earlyBirdPrice !== undefined ? Number(updatedData.earlyBirdPrice) : null,
        earlyBirdCurrency: updatedData.earlyBirdCurrency || null,
        earlyBirdDeadline: updatedData.earlyBirdDeadline ? new Date(updatedData.earlyBirdDeadline).toISOString() : null,
        hasCertificate: Boolean(updatedData.hasCertificate),
        requireExam: updatedData.requireExam !== undefined ? Boolean(updatedData.requireExam) : undefined,
        requireCoaching: updatedData.requireCoaching !== undefined ? Boolean(updatedData.requireCoaching) : undefined,
        requireMissionStatement: updatedData.requireMissionStatement !== undefined ? Boolean(updatedData.requireMissionStatement) : undefined,
        sequentialProgressionEnabled: updatedData.sequentialProgressionEnabled !== undefined ? Boolean(updatedData.sequentialProgressionEnabled) : undefined,
        attendanceRequired: updatedData.attendanceRequired !== undefined ? Boolean(updatedData.attendanceRequired) : undefined,
        attendanceThreshold: updatedData.attendanceThreshold !== undefined ? Number(updatedData.attendanceThreshold) : undefined,
        shortDescription: updatedData.shortDescription || "",
        thumbnailUrl: updatedData.thumbnailUrl || "",
        category: updatedData.category || "",
        level: updatedData.level || "",
        faqs: updatedData.faqs || [],
      };

      const res = await fetch(`${API_URL}/programs/${programId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        throw new Error(await errorMessage(res, "Failed to update program"));
      }

      router.push(`/programs/${programId}`);
    } catch (e: any) {
      setErrorMsg(e.message || "Failed to update program details.");
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div style={{ padding: "40px 20px", maxWidth: "900px", margin: "0 auto" }}>
        <div className="skeleton" style={{ height: 32, width: 220, marginBottom: 16, borderRadius: 8 }} />
        <div className="skeleton" style={{ height: 48, width: 440, marginBottom: 24, borderRadius: 8 }} />
        <div className="skeleton" style={{ height: 360, width: "100%", borderRadius: 20 }} />
      </div>
    );
  }

  return (
    <div className={styles.dashboard}>
      <header className={styles.header}>
        <div className={styles.headerText}>
          <Link
            href={`/programs/${programId}`}
            className={styles.secondaryBtnSmall}
            style={{ textDecoration: "none", display: "inline-flex", alignItems: "center", gap: "0.4rem", marginBottom: "0.75rem" }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="19" y1="12" x2="5" y2="12"></line>
              <polyline points="12 19 5 12 12 5"></polyline>
            </svg>
            <span>Back to Curriculum Studio</span>
          </Link>
          <h1 className={styles.title}>Edit Course Details &amp; Pricing</h1>
          {/* <p className={styles.subtitle}>
            Update multi-currency pricing (USD, AED, INR), early-bird discounts, and course FAQs.
          </p> */}
        </div>
      </header>

      {errorMsg && (
        <div
          role="alert"
          style={{
            backgroundColor: "#fef2f2",
            border: "1px solid #fecaca",
            color: "#991b1b",
            padding: "12px 16px",
            borderRadius: "8px",
            marginBottom: "1.5rem",
            fontSize: "0.88rem",
          }}
        >
          {errorMsg}
        </div>
      )}

      <Step1CourseSetup
        programData={programData}
        onSaveAndContinue={handleSaveAndContinue}
        isSaving={isSaving}
      />
    </div>
  );
}
