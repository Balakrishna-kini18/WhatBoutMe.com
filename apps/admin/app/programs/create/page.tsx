"use client";

import { useState } from "react";
import styles from "../../page.module.css";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { API_URL, errorMessage } from "../../lib/api";
import { formatCourseInfo, parseCourseInfo } from "../courseInfo";
import CurriculumStepper from "../[id]/components/CurriculumStepper";
import Step1CourseSetup from "../[id]/components/Step1CourseSetup";

export default function CreateProgramPage() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function handleCreateProgram(updatedData: {
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
    faqs?: Array<{
      id?: string;
      question: string;
      answer: string;
      sortOrder?: number;
    }>;
  }) {
    if (!updatedData.title.trim()) {
      setFormError("Program title is required.");
      return;
    }

    setIsSubmitting(true);
    setFormError(null);

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

      const payload = {
        title: updatedData.title.trim(),
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
        shortDescription: updatedData.shortDescription || "",
        thumbnailUrl: updatedData.thumbnailUrl || "",
        category: updatedData.category || "",
        level: updatedData.level || "",
        faqs: updatedData.faqs || [],
        status: "PUBLISHED",
      };

      const res = await fetch(`${API_URL}/programs`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        throw new Error(await errorMessage(res, "Failed to create program"));
      }

      const created = await res.json();
      router.push(`/programs/${created.id}`);
    } catch (err: any) {
      setFormError(err.message || "Failed to create program");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: "1.5rem 2rem 4rem" }}>
      {/* 4-Step Horizontal Wizard Bar */}
      <CurriculumStepper
        currentPhase={1}
        onSelectPhase={() => {}}
        isPhase1Done={false}
        isPhase2Done={false}
        isPhase3Done={false}
      />

      {formError && (
        <div style={{
          backgroundColor: "#fef2f2",
          border: "1px solid #fecaca",
          color: "#991b1b",
          padding: "12px 16px",
          borderRadius: "8px",
          marginBottom: "1.5rem",
          display: "flex",
          alignItems: "center",
          gap: "10px",
          fontSize: "0.88rem"
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
          <span>{formError}</span>
        </div>
      )}

      <Step1CourseSetup
        programData={null}
        onSaveAndContinue={handleCreateProgram}
        isSaving={isSubmitting}
      />
    </div>
  );
}
