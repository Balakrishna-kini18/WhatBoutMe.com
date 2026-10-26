"use client";

import type { ReactNode } from "react";
import { enrolUrl } from "@/lib/courses";
import { openPortal } from "@/lib/auth";
import {
  buildCourseEnrollmentReturnUrl,
  saveEnrollmentIntent,
} from "@/lib/auth-redirect";

/**
 * "Enrol Now" CTA link.
 * - Authenticated learners are handed straight to the LMS enrollment flow via SSO.
 * - Unauthenticated visitors have their course + batch/coupon intent persisted
 *   (URL `?redirect=...` + 30-min `localStorage` fallback) and are routed to `/signup`
 *   (with seamless switching to `/login`), returning directly to this course afterward.
 */
export default function EnrolLink({
  programId,
  slug,
  batchId,
  couponCode,
  className,
  children,
}: {
  programId: string;
  slug?: string;
  batchId?: string;
  couponCode?: string;
  className: string;
  children: ReactNode;
}) {
  const targetPath = buildCourseEnrollmentReturnUrl({
    programId,
    batchId,
    couponCode,
    autoEnroll: true,
    basePath: "/agreement",
  });

  const handleClick = (e: { preventDefault(): void }) => {
    saveEnrollmentIntent({
      returnUrl: targetPath,
      programId,
      slug,
      batchId,
      couponCode,
    });
    return openPortal(targetPath, {
      requirePurchase: false,
      preferSignupWhenSignedOut: true,
    })(e);
  };

  return (
    <a
      href={enrolUrl(programId)}
      onClick={handleClick}
      className={className}
    >
      {children}
    </a>
  );
}
