"use client";

import type { ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { enrolUrl } from "@/lib/courses";
import { LMS_URL } from "@/lib/api";
import { openPortal, portalUrl, useEnrolmentStatus } from "@/lib/auth";
import {
  buildCourseEnrollmentReturnUrl,
  saveEnrollmentIntent,
} from "@/lib/auth-redirect";

function getResolvedActiveClassName(
  className?: string,
  activeClassName?: string
): string {
  if (activeClassName) return activeClassName;
  if (!className) {
    return "group inline-flex h-12 items-center justify-center gap-2 whitespace-nowrap rounded-full bg-gold px-6 text-sm font-bold text-ink shadow-sm transition-all duration-200 hover:bg-ink hover:text-cream active:scale-[0.98]";
  }

  // If the passed className is already a button (has rounded or bg- or py-), ensure flex & nowrap safety
  const isButton =
    className.includes("rounded") ||
    className.includes("bg-") ||
    className.includes("py-");

  if (isButton) {
    const hasFlex = className.includes("flex");
    return `${hasFlex ? "" : "inline-flex items-center justify-center gap-2 "}whitespace-nowrap ${className}`;
  }

  // If it was just a text link (e.g. underline text), promote it to a proper button UI
  return "group inline-flex h-12 items-center justify-center gap-2 whitespace-nowrap rounded-full bg-gold px-6 text-sm font-bold text-ink shadow-sm transition-all duration-200 hover:bg-ink hover:text-cream active:scale-[0.98]";
}

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
  activeClassName,
  wrapperClassName,
  children,
}: {
  programId: string;
  slug?: string;
  batchId?: string;
  couponCode?: string;
  className?: string;
  activeClassName?: string;
  wrapperClassName?: string;
  children: ReactNode;
  showStatusBadge?: boolean;
}) {
  const { isFullyActive, isPendingAgreement, isPendingPayment, enrolment } =
    useEnrolmentStatus(programId, slug);

  const resolvedActiveClass = getResolvedActiveClassName(
    className,
    activeClassName
  );

  // If already enrolled and active / completed: DO NOT SHOW ENROL NOW!
  // Route learner directly to the LMS learning path:
  if (isFullyActive) {
    const lmsCoursePath = `/programs/${programId}/steps?welcomeBack=1`;
    const buttonContent = (
      <a
        href={portalUrl(lmsCoursePath)}
        onClick={openPortal(lmsCoursePath)}
        className={resolvedActiveClass}
        title="Continue your learning journey in the Learner Portal"
      >
        <span>Go to Course</span>
        <ArrowRight className="h-4 w-4 shrink-0 transition-transform duration-200 group-hover:translate-x-1" />
      </a>
    );

    return wrapperClassName ? (
      <div className={wrapperClassName}>{buttonContent}</div>
    ) : (
      buttonContent
    );
  }

  // If enrolled but pending agreement:
  if (isPendingAgreement) {
    const agreementPath = `/agreement?programId=${programId}${enrolment?.enrolmentId ? `&enrolmentId=${enrolment.enrolmentId}` : ""}`;
    const buttonContent = (
      <a
        href={portalUrl(agreementPath)}
        onClick={openPortal(agreementPath)}
        className={resolvedActiveClass}
        title="Complete Program Agreement"
      >
        <span>Complete Agreement</span>
        <ArrowRight className="h-4 w-4 shrink-0 transition-transform duration-200 group-hover:translate-x-1" />
      </a>
    );

    return wrapperClassName ? (
      <div className={wrapperClassName}>{buttonContent}</div>
    ) : (
      buttonContent
    );
  }

  // If enrolled but pending payment:
  if (isPendingPayment) {
    const checkoutPath = `/checkout?programId=${programId}${enrolment?.enrolmentId ? `&enrolmentId=${enrolment.enrolmentId}` : ""}`;
    const buttonContent = (
      <a
        href={portalUrl(checkoutPath)}
        onClick={openPortal(checkoutPath)}
        className={resolvedActiveClass}
        title="Complete Course Payment"
      >
        <span>Complete Payment</span>
        <ArrowRight className="h-4 w-4 shrink-0 transition-transform duration-200 group-hover:translate-x-1" />
      </a>
    );

    return wrapperClassName ? (
      <div className={wrapperClassName}>{buttonContent}</div>
    ) : (
      buttonContent
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

  const defaultUnenrolledClass =
    className ||
    "group inline-flex h-12 items-center justify-center gap-2 rounded-full border border-ink/20 bg-white px-6 text-sm font-semibold text-ink transition-colors duration-200 hover:border-ink hover:bg-ink hover:text-cream";

  return (
    <a
      href={enrolUrl(programId)}
      onClick={handleClick}
      className={defaultUnenrolledClass}
    >
      {children}
    </a>
  );
}
