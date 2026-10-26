import {
  buildCourseEnrollmentReturnUrl,
  saveEnrollmentIntent,
} from "../../lib/auth-redirect";
import { siteLoginUrl, siteSignupUrl } from "../../lib/site";

export interface ResolveProgramEntryInput {
  programId: string;
  token: string | null;
  autoEnroll: boolean;
  batchId?: string | null;
  coupon?: string | null;
  userEnrolments?: Array<{
    id: string;
    programId: string;
    status: string;
    program?: { id?: string; slug?: string };
  }>;
}

export type ProgramEntryResolution =
  | { action: "REDIRECT_AUTH"; url: string; mode: "SIGNUP" | "LOGIN" }
  | { action: "REDIRECT_STEPS"; url: string; isWelcomeBack: boolean }
  | { action: "REDIRECT_CHECKOUT"; url: string }
  | { action: "REDIRECT_AGREEMENT"; url: string }
  | { action: "FALLBACK_COURSES"; url: string };

/**
 * Pure state machine resolving a learner's destination upon landing on /programs/[id].
 */
export function resolveProgramEntry(
  input: ResolveProgramEntryInput,
): ProgramEntryResolution {
  const { programId, token, autoEnroll, batchId, coupon, userEnrolments } = input;

  if (!programId || !programId.trim()) {
    return { action: "FALLBACK_COURSES", url: "/courses" };
  }

  const cleanProgramId = programId.trim();

  // 1. Unauthenticated Visitor Flow
  if (!token) {
    const returnPath = buildCourseEnrollmentReturnUrl({
      programId: cleanProgramId,
      batchId,
      couponCode: coupon,
      autoEnroll: true,
      basePath: "/programs",
    });

    saveEnrollmentIntent({
      returnUrl: returnPath,
      programId: cleanProgramId,
      batchId: batchId || undefined,
      couponCode: coupon || undefined,
      autoEnroll: true,
    });

    const targetAuthUrl = autoEnroll
      ? siteSignupUrl(returnPath)
      : siteLoginUrl(returnPath);

    return {
      action: "REDIRECT_AUTH",
      url: targetAuthUrl,
      mode: autoEnroll ? "SIGNUP" : "LOGIN",
    };
  }

  // 2. Authenticated Learner with Existing Enrolment
  if (Array.isArray(userEnrolments)) {
    const existing = userEnrolments.find(
      (e) =>
        e.programId === cleanProgramId ||
        e.program?.slug === cleanProgramId ||
        e.program?.id === cleanProgramId,
    );

    if (existing) {
      const actualId = existing.programId || existing.program?.id || cleanProgramId;

      if (existing.status === "ACTIVE" || existing.status === "COMPLETED") {
        return {
          action: "REDIRECT_STEPS",
          url: `/programs/${actualId}/steps?welcomeBack=1`,
          isWelcomeBack: true,
        };
      }

      if (existing.status === "PENDING_PAYMENT") {
        const query = new URLSearchParams({
          programId: actualId,
          enrolmentId: existing.id,
        });
        if (batchId) query.set("batchId", batchId);
        if (coupon) query.set("coupon", coupon);
        return {
          action: "REDIRECT_CHECKOUT",
          url: `/checkout?${query.toString()}`,
        };
      }
    }
  }

  // 3. Authenticated Learner New Enrolment
  if (autoEnroll) {
    const agreementUrl = buildCourseEnrollmentReturnUrl({
      programId: cleanProgramId,
      batchId,
      couponCode: coupon,
      autoEnroll: true,
      basePath: "/agreement",
    });
    return {
      action: "REDIRECT_AGREEMENT",
      url: agreementUrl,
    };
  }

  // Default to curriculum steps overview
  return {
    action: "REDIRECT_STEPS",
    url: `/programs/${cleanProgramId}/steps`,
    isWelcomeBack: false,
  };
}
