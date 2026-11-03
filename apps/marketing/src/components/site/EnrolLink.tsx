"use client";

import type { ReactNode } from "react";
import { CheckCircle2, ArrowRight } from "lucide-react";
import { enrolUrl } from "@/lib/courses";
import { LMS_URL } from "@/lib/api";
import { openPortal, useEnrolmentStatus } from "@/lib/auth";
import {
  buildCourseEnrollmentReturnUrl,
  saveEnrollmentIntent,
} from "@/lib/auth-redirect";

/**
 * Smart Enrollment CTA component.
 * - When already enrolled and active: suppresses "Enrol Now" and offers direct "Go to Course →" jump to LMS.
 * - When pending agreement/payment: prompts learner to resume and finalize enrollment.
 * - When un-enrolled or signed out: offers standard seamless "Enrol Now" flow with intent preservation.
 */
export default function EnrolLink({
  programId,
  slug,
  batchId,
  couponCode,
  className,
  children,
  showStatusBadge = true,
}: {
  programId: string;
  slug?: string;
  batchId?: string;
  couponCode?: string;
  className: string;
  children: ReactNode;
  showStatusBadge?: boolean;
}) {
  const { isFullyActive, isPendingAgreement, isPendingPayment, enrolment } =
    useEnrolmentStatus(programId, slug);

  // If already enrolled and active / completed: DO NOT SHOW ENROL NOW!
  // Route learner directly to the LMS learning path:
  if (isFullyActive) {
    const lmsCoursePath = `/programs/${programId}/steps`;
    return (
      <div className="flex flex-col gap-2.5 w-full">
        {showStatusBadge && (
          <div className="flex items-center justify-center gap-2 rounded-2xl bg-amber-500/10 border border-amber-500/25 py-2.5 px-4 text-xs sm:text-sm font-semibold text-amber-900 shadow-sm">
            <CheckCircle2 className="h-4 w-4 text-amber-600 shrink-0" />
            <span className="truncate">
              Enrolled {enrolment?.batchName ? `• ${enrolment.batchName}` : ""}
            </span>
          </div>
        )}
        <a
          href={`${LMS_URL}${lmsCoursePath}`}
          onClick={openPortal(lmsCoursePath)}
          className={className}
          title="Open course in Learner Portal"
        >
          <span>Go to Course</span>
          <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
        </a>
      </div>
    );
  }

  // If enrolled but pending agreement:
  if (isPendingAgreement) {
    const agreementPath = `/agreement?programId=${programId}${enrolment?.enrolmentId ? `&enrolmentId=${enrolment.enrolmentId}` : ""}`;
    return (
      <div className="flex flex-col gap-2.5 w-full">
        {showStatusBadge && (
          <div className="flex items-center justify-center gap-2 rounded-2xl bg-amber-500/10 border border-amber-500/25 py-2 px-3 text-xs font-semibold text-amber-900">
            <span>Agreement Pending</span>
          </div>
        )}
        <a
          href={`${LMS_URL}${agreementPath}`}
          onClick={openPortal(agreementPath)}
          className={className}
        >
          <span>Complete Agreement</span>
          <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
        </a>
      </div>
    );
  }

  // If enrolled but pending payment:
  if (isPendingPayment) {
    const checkoutPath = `/checkout?programId=${programId}${enrolment?.enrolmentId ? `&enrolmentId=${enrolment.enrolmentId}` : ""}`;
    return (
      <div className="flex flex-col gap-2.5 w-full">
        {showStatusBadge && (
          <div className="flex items-center justify-center gap-2 rounded-2xl bg-amber-500/10 border border-amber-500/25 py-2 px-3 text-xs font-semibold text-amber-900">
            <span>Payment Pending</span>
          </div>
        )}
        <a
          href={`${LMS_URL}${checkoutPath}`}
          onClick={openPortal(checkoutPath)}
          className={className}
        >
          <span>Complete Payment</span>
          <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
        </a>
      </div>
    );
  }

  // Normal un-enrolled CTA:
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
