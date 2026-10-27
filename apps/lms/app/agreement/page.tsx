"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import {
  API_URL,
  getAuthToken,
  getAuthHeaders,
  parseApiError,
  ActiveAgreementResponse,
  SignedAgreementResponse,
} from "../lib/api";
import type { SignatureMethod } from "./SignaturePad";
import EnrollmentStepper from "../components/EnrollmentStepper";
import css from "./agreement.module.css";
import { SITE_URL } from "../lib/site";
import AgreementLoading from "./loading";
import AgreementMarkdown from "../components/AgreementMarkdown";

const SignaturePad = dynamic(() => import("./SignaturePad"), {
  ssr: false,
  loading: () => (
    <div style={{ padding: "20px", textAlign: "center", color: "var(--text-muted)" }}>
      Loading signature pad...
    </div>
  ),
});

const MAX_LEGAL_NAME_LENGTH = 100;

const PRIVACY_URL = `${SITE_URL || "https://whatboutme.com"}/privacy`;
const TERMS_URL = `${SITE_URL || "https://whatboutme.com"}/terms`;

/** Exact approved consent declaration statement. */
const CONSENT_STATEMENT =
  "I consent to WhatBoutMe collecting and processing my personal information for workshop registration, communication and related services, as described in the Privacy Policy. I acknowledge that I have read and accepted the applicable Terms and Conditions and the Program Agreement terms set forth above.";

type FormErrors = {
  name?: string;
  acknowledgement?: string;
  signature?: string;
  consent?: string;
  form?: string;
};

type JourneyPosition = "CHECKOUT" | "STEPS";

function resolveJourneyPosition(
  nextStep: string | undefined,
  enrolmentStatus: string | undefined,
): JourneyPosition {
  if (nextStep === "STEPS") return "STEPS";
  if (nextStep === "CHECKOUT") return "CHECKOUT";
  // Only when the API does not state the next step.
  return enrolmentStatus === "ACTIVE" ? "STEPS" : "CHECKOUT";
}

function buildCheckoutUrl(
  programId?: string,
  enrolmentId?: string,
  batchId?: string | null,
  coupon?: string | null,
): string {
  if (!programId) return "/courses";
  const query = new URLSearchParams({ programId });
  if (enrolmentId) query.set("enrolmentId", enrolmentId);
  if (batchId) query.set("batchId", batchId);
  if (coupon) query.set("coupon", coupon);
  return `/checkout?${query.toString()}`;
}

interface SavedSignatureResponse {
  hasSavedSignature: boolean;
  savedSignature: string | null;
  savedSignatureType: SignatureMethod | null;
  savedSignatureUpdatedAt: string | null;
}

function AgreementSignContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryProgramId = searchParams.get("programId");
  const queryEnrolmentId = searchParams.get("enrolmentId");
  const queryBatchId = searchParams.get("batchId");
  const queryCoupon = searchParams.get("coupon");
  const queryAutoEnroll = searchParams.get("autoEnroll");

  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Enrolment & agreement state
  const [enrolment, setEnrolment] = useState<any>(null);
  const [activeTemplate, setActiveTemplate] = useState<ActiveAgreementResponse | null>(null);
  const [signedRecord, setSignedRecord] = useState<SignedAgreementResponse | null>(null);

  // Reusable profile signature state
  const [savedProfileSig, setSavedProfileSig] = useState<SavedSignatureResponse | null>(null);
  const [signatureChoice, setSignatureChoice] = useState<"SAVED" | "NEW">("SAVED");

  // Form state — full legal name and digital consent
  const [consentGiven, setConsentGiven] = useState(false);
  const [consentTimestamp, setConsentTimestamp] = useState<string | null>(null);
  const [typedName, setTypedName] = useState("");
  const [typedAcknowledgement, setTypedAcknowledgement] = useState("");
  const [signatureData, setSignatureData] = useState<string | null>(null);
  const [signatureMethod, setSignatureMethod] = useState<SignatureMethod>("DRAWN");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [justSignedSuccess, setJustSignedSuccess] = useState<SignedAgreementResponse | null>(null);
  const [isConfirmingPayment, setIsConfirmingPayment] = useState(false);

  const handleConfirmPaymentAndProceed = (targetProgramId?: string, targetEnrolmentId?: string) => {
    const nextErrors: FormErrors = {};

    const ackPhrase = typedAcknowledgement.trim();
    if (ackPhrase.toUpperCase() !== "I AGREE") {
      nextErrors.acknowledgement = 'Please type "I AGREE" to confirm that you accept the terms.';
    }

    if (!consentGiven) {
      nextErrors.consent = "Accept the digital consent statement to continue.";
    }

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    const progId = targetProgramId || enrolment?.programId || queryProgramId || signedRecord?.programId || justSignedSuccess?.programId;
    const enrolId = targetEnrolmentId || enrolment?.id || queryEnrolmentId || signedRecord?.enrolmentId || justSignedSuccess?.enrolmentId;

    if (!progId) {
      router.push("/courses");
      return;
    }

    // Advance to Step 3: Payment Confirmation (/checkout)
    router.push(buildCheckoutUrl(progId, enrolId, queryBatchId, queryCoupon));
  };

  useEffect(() => {
    document.body.classList.add("auth-page-active");
    return () => document.body.classList.remove("auth-page-active");
  }, []);

  useEffect(() => {
    if (queryAutoEnroll && typeof window !== "undefined") {
      try {
        const url = new URL(window.location.href);
        url.searchParams.delete("autoEnroll");
        window.history.replaceState({}, "", url.pathname + url.search);
      } catch {
        // ignore
      }
    }
  }, [queryAutoEnroll]);

  useEffect(() => {
    initAgreementFlow();
  }, [queryProgramId, queryEnrolmentId]);

  const initAgreementFlow = async () => {
    setIsLoading(true);
    setLoadError(null);

    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    if (!token) {
      const qs = new URLSearchParams();
      if (queryProgramId) qs.set("programId", queryProgramId);
      if (queryEnrolmentId) qs.set("enrolmentId", queryEnrolmentId);
      if (queryBatchId) qs.set("batchId", queryBatchId);
      if (queryCoupon) qs.set("coupon", queryCoupon);
      const returnUrl = encodeURIComponent(
        `/agreement${qs.toString() ? `?${qs.toString()}` : ""}`
      );
      router.push(`/login?portal=${returnUrl}`);
      return;
    }

    try {
      let target: any = null;
      let tpl: any = null;
      let alreadySigned = false;

      if (queryProgramId) {
        // Agreement-First Flow: get or initiate provisional enrolment & template
        try {
          const initRes = await fetch(`${API_URL}/agreements/initiate`, {
            method: "POST",
            headers: getAuthHeaders(),
            body: JSON.stringify({ programId: queryProgramId }),
          });
          if (initRes.ok) {
            const text = await initRes.text();
            const initData = text ? JSON.parse(text) : null;
            if (initData) {
              target = initData.enrolment;
              tpl = initData.template;
              if (initData.hasSignedAgreement && initData.signedAgreement) {
                alreadySigned = true;
                setSignedRecord(initData.signedAgreement);
              }
            }
          }
        } catch (e) {
          console.warn("Initiate agreement endpoint error:", e);
        }
      }

      if (!target) {
        // Fallback: fetch learner enrolments to identify the target enrolment
        const enrolRes = await fetch(`${API_URL}/enrollments/me`, {
          headers: getAuthHeaders(),
        });

        if (enrolRes.status === 401) {
          localStorage.removeItem("token");
          router.push("/login");
          return;
        }

        if (!enrolRes.ok) {
          const err = await parseApiError(enrolRes, "Failed to load your enrolments");
          throw new Error(err.message);
        }

        const text = await enrolRes.text();
        const enrolments = text ? JSON.parse(text) : [];
        const list = Array.isArray(enrolments) ? enrolments : [];

        if (list.length === 0) {
          setLoadError("NO_ENROLMENTS_FOUND");
          setIsLoading(false);
          return;
        }

        if (queryEnrolmentId) {
          target = list.find((e: any) => e.id === queryEnrolmentId);
        } else if (queryProgramId) {
          target = list.find((e: any) => e.programId === queryProgramId);
        } else {
          target = list.find((e: any) => e.status === "PENDING_AGREEMENT" || e.status === "PENDING_PAYMENT") || list[0];
        }
      }

      if (!target) {
        setLoadError("NO_PENDING_AGREEMENT");
        setIsLoading(false);
        return;
      }

      setEnrolment(target);

      // Note: We deliberately do NOT pre-fill casual display name to ensure explicit legal signing

      // Check if this enrolment already has a signed agreement
      if (!signedRecord && !alreadySigned) {
        const signedRes = await fetch(`${API_URL}/agreements/enrolments/${target.id}`, {
          headers: getAuthHeaders(),
        });

        if (signedRes.ok) {
          const text = await signedRes.text();
          const existingSigned = text ? JSON.parse(text) : null;
          if (existingSigned && existingSigned.status === "SIGNED") {
            alreadySigned = true;
            setSignedRecord(existingSigned);
            setTypedName(existingSigned.typedName || "");
            setTypedAcknowledgement("I AGREE");
            setConsentGiven(true);
            setConsentTimestamp(existingSigned.consentTimestamp || new Date().toISOString());
            if (existingSigned.drawnSignature || existingSigned.signatureImage) {
              setSignatureData(existingSigned.drawnSignature || existingSigned.signatureImage);
              setSignatureMethod(existingSigned.signatureType === "UPLOADED" ? "UPLOADED" : "DRAWN");
              setSignatureChoice("SAVED");
            }
          }
        }
      }

      // Already Enrolled Detection: if the user already owns this course (ACTIVE / COMPLETED)
      // and has already signed the agreement, route directly to the learning path with a Welcome Back toast!
      if (
        alreadySigned &&
        (target.status === "ACTIVE" || target.status === "COMPLETED") &&
        target.programId
      ) {
        router.replace(`/programs/${target.programId}/steps?welcomeBack=1`);
        return;
      }

      // Pre-fill user's legal name from profile if still empty
      try {
        const meRes = await fetch(`${API_URL}/auth/me`, { headers: getAuthHeaders() });
        if (meRes.ok) {
          const meData = await meRes.json();
          if (meData?.name) {
            setTypedName((prev) => (prev ? prev : meData.name));
          }
        }
      } catch {}

      // If active template was already retrieved via initiate, set it
      if (tpl) {
        setActiveTemplate(tpl);
      } else {
        // Otherwise fetch active agreement template for the program
        const templateRes = await fetch(
          `${API_URL}/agreements/program/${target.programId}/active`,
          { headers: getAuthHeaders() }
        );

        if (templateRes.ok) {
          const tplText = await templateRes.text();
          const fetchedTpl = tplText ? JSON.parse(tplText) : null;
          setActiveTemplate(fetchedTpl);
        } else {
          // Fallback route check
          const fallbackRes = await fetch(
            `${API_URL}/agreements/templates/program/${target.programId}/active`,
            { headers: getAuthHeaders() }
          );
          if (fallbackRes.ok) {
            const fallbackText = await fallbackRes.text();
            const fallbackTpl = fallbackText ? JSON.parse(fallbackText) : null;
            setActiveTemplate(fallbackTpl);
          } else {
            throw new Error("No published agreement is currently required for this program.");
          }
        }
      }

      // Check if learner has a saved signature on their authenticated profile
      try {
        const sigRes = await fetch(`${API_URL}/agreements/saved-signature`, {
          headers: getAuthHeaders(),
        });
        if (sigRes.ok) {
          const sigData: SavedSignatureResponse = await sigRes.json();
          if (sigData && sigData.hasSavedSignature && sigData.savedSignature) {
            setSavedProfileSig(sigData);
            setSignatureChoice("SAVED");
            setSignatureData((prev) => (prev ? prev : sigData.savedSignature));
            if (sigData.savedSignatureType) {
              setSignatureMethod(sigData.savedSignatureType);
            }
            // Auto-tick consent when verified signature is present
            setConsentGiven(true);
            setConsentTimestamp((prev) => (prev ? prev : new Date().toISOString()));
          } else if (!signedRecord) {
            setSavedProfileSig(null);
            setSignatureChoice("NEW");
          }
        }
      } catch (sigErr) {
        console.warn("Could not retrieve saved profile signature:", sigErr);
      }
    } catch (err: any) {
      console.error("Agreement flow initialization error:", err);
      setLoadError(err.message || "Failed to load agreement details.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignatureChange = (data: string | null, method: SignatureMethod) => {
    setSignatureData(data);
    setSignatureMethod(method);
    setErrors((prev) => ({ ...prev, signature: undefined, form: undefined }));
  };

  const handleSignSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    const legalName = typedName.trim();
    const nextErrors: FormErrors = {};

    if (legalName.length < 2) {
      nextErrors.name = "Enter your full legal name (at least 2 characters).";
    } else if (legalName.length > MAX_LEGAL_NAME_LENGTH) {
      nextErrors.name = `Your full legal name must be ${MAX_LEGAL_NAME_LENGTH} characters or fewer.`;
    }

    const originalSig =
      signedRecord?.drawnSignature ||
      signedRecord?.signatureImage ||
      savedProfileSig?.savedSignature;
    const finalSigData = signatureChoice === "SAVED" ? (signatureData || originalSig) : signatureData;
    const usingSaved = signatureChoice === "SAVED" && !!finalSigData;
    const finalSigType = signatureMethod || (savedProfileSig?.savedSignatureType || "DRAWN");

    if (!finalSigData || finalSigData.length < 10) {
      nextErrors.signature = "Please provide your signature before continuing.";
    }

    if (!consentGiven) {
      nextErrors.consent = "Accept the digital consent statement to continue.";
    }

    const ackPhrase = typedAcknowledgement.trim();
    if (ackPhrase.toUpperCase() !== "I AGREE") {
      nextErrors.acknowledgement = 'Please type "I AGREE" to confirm that you accept the terms.';
    }

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    if (!enrolment || !activeTemplate?.versionId) {
      setErrors({
        form: "We could not match this agreement to your enrolment. Refresh the page and try again.",
      });
      return;
    }

    setErrors({});
    setIsSubmitting(true);

    try {
      const payload = {
        enrolmentId: enrolment.id,
        versionId: activeTemplate.versionId,
        consentGiven: true,
        consentAccepted: true,
        consentVersion: activeTemplate.version || "v1.0",
        consentTimestamp: consentTimestamp || new Date().toISOString(),
        typedName: legalName,
        typedAcknowledgement: ackPhrase,
        signerName: legalName,
        useSavedSignature: usingSaved,
        updateProfileSignature: !usingSaved,
        signatureData: finalSigData,
        drawnSignature: finalSigData,
        signatureType: finalSigType,
      };

      const res = await fetch(`${API_URL}/agreements/sign`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        if (res.status === 409) {
          setErrors({ form: "This agreement has already been recorded for this enrolment." });
          await initAgreementFlow();
          return;
        }
        throw new Error(
          data?.error?.message ||
            data?.message ||
            `Signing failed with status ${res.status}.`
        );
      }

      // Only ever shown once the backend confirms the signature.
      setJustSignedSuccess(data);
    } catch (err: any) {
      console.error("Agreement submission failed:", err);
      setErrors({ form: err.message || "We could not submit your signature. Please try again." });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return <AgreementLoading />;
  }

  if (loadError) {
    const noPendingAgreement =
      loadError === "NO_ENROLMENTS_FOUND" || loadError === "NO_PENDING_AGREEMENT";

    return (
      <div className={css.page}>
        <div className={css.shell}>
          <div className={`${css.card} ${css.centered}`}>
            <p className={css.stateText}>
              {noPendingAgreement ? "No agreement to sign" : "We could not load this agreement"}
            </p>
            <p className={css.stateBody}>
              {noPendingAgreement
                ? "You have no program agreement awaiting signature. Choose a program to begin enrollment."
                : loadError}
            </p>
            <Link href="/courses" className={css.submit}>
              {noPendingAgreement ? "Select a Program" : "Back to Courses"}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (justSignedSuccess) {
    const position = resolveJourneyPosition(
      justSignedSuccess.nextStep,
      justSignedSuccess.enrolmentStatus ?? enrolment?.status
    );
    const nextUrl =
      position === "CHECKOUT"
        ? justSignedSuccess.checkoutUrl ||
          buildCheckoutUrl(
            enrolment?.programId || queryProgramId || undefined,
            enrolment?.id || queryEnrolmentId || undefined,
            queryBatchId,
            queryCoupon,
          )
        : `/programs/${enrolment?.programId || queryProgramId}/steps`;

    return (
      <div className={css.page}>
        <div className={css.shell}>
          <EnrollmentStepper currentStep={position === "CHECKOUT" ? 3 : 4} />
          <div className={`${css.card} ${css.centered}`}>
            <span className={css.statusIcon}>
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </span>
            <p className={css.stateText}>Agreement signed</p>
            <p className={css.stateBody}>
              Thank you, <span className={css.stateBodyStrong}>{justSignedSuccess.typedName}</span>. Your signature
              and consent have been recorded{position === "CHECKOUT" ? " — the next step is payment." : "."}
            </p>

            <dl className={css.details}>
              <div>
                <dt className={css.detailLabel}>Signed by</dt>
                <dd className={css.detailValue}>{justSignedSuccess.typedName}</dd>
              </div>
              <div>
                <dt className={css.detailLabel}>Agreement version</dt>
                <dd className={css.detailValue}>{justSignedSuccess.templateVersion || "v1.0"}</dd>
              </div>
              <div>
                <dt className={css.detailLabel}>Signature method</dt>
                <dd className={css.detailValue}>
                  {justSignedSuccess.signatureType === "UPLOADED" ? "Uploaded image" : "Drawn"}
                </dd>
              </div>
              <div>
                <dt className={css.detailLabel}>Signed at</dt>
                <dd className={css.detailValue}>{new Date(justSignedSuccess.signedAt).toLocaleString()}</dd>
              </div>
            </dl>

            {position === "CHECKOUT" ? (
              <button
                type="button"
                onClick={() =>
                  handleConfirmPaymentAndProceed(
                    justSignedSuccess.programId || enrolment?.programId,
                    justSignedSuccess.enrolmentId || enrolment?.id
                  )
                }
                disabled={isConfirmingPayment}
                className={css.submit}
                style={{ cursor: isConfirmingPayment ? "wait" : "pointer" }}
              >
                {isConfirmingPayment ? "Confirming Payment & Unlocking Course…" : "Continue to Payment"}
              </button>
            ) : (
              <Link href={nextUrl} className={css.submit}>
                Go to Course
              </Link>
            )}
          </div>
        </div>
      </div>
    );
  }

  const programTitle =
    enrolment?.program?.title || activeTemplate?.programTitle || "Selected Program";
  const agreementTitle = activeTemplate?.templateTitle || "Program agreement";
  const agreementVersion = activeTemplate?.version || signedRecord?.templateVersion || "v1.0";
  const agreementContent = activeTemplate?.content?.trim() || "";
  const hasAgreementContent = agreementContent.length > 0;

  const originalSignature =
    signedRecord?.drawnSignature ||
    signedRecord?.signatureImage ||
    savedProfileSig?.savedSignature ||
    null;

  const activeSignature =
    signatureChoice === "SAVED"
      ? (signatureData || originalSignature)
      : signatureData;

  const hasSignature = !!activeSignature;

  return (
    <div className={css.page}>
      <div className={css.shell}>
        <EnrollmentStepper currentStep={2} />

        <div className={css.card}>
          <h1 className={css.heading}>Review &amp; Sign Agreement</h1>

          {/* Selected program in compact summary card */}
          <section className={css.programCard}>
            <div className={css.programIconWrap} aria-hidden="true">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
              </svg>
            </div>
            <div className={css.programInfo}>
              <span className={css.programEyebrow}>Selected Program</span>
              <span className={css.programName}>{programTitle}</span>
            </div>
          </section>

          {/* Agreement terms in compact, readable section with document icon */}
          <div className={css.termsSection}>
            <div className={css.termsHeader}>
              <div className={css.termsTitleWrap}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                  <polyline points="10 9 9 9 8 9" />
                </svg>
                <span className={css.termsTitle}>Agreement Terms &amp; Conditions</span>
              </div>
            </div>
            <div className={css.document} tabIndex={0} role="region" aria-label="Agreement terms">
              {hasAgreementContent ? (
                <AgreementMarkdown content={agreementContent} className={css.documentBody} />
              ) : (
                <p className={css.notice}>
                  This agreement is not available yet. Please try again later or contact support.
                </p>
              )}
            </div>
          </div>

          <form onSubmit={handleSignSubmit} noValidate>
            {/* Full legal name */}
            <div className={css.field}>
              <label className={css.legalNameLabel} htmlFor="legalNameInput">
                <span className={css.labelText}>
                  Full Legal Name <span className={css.required}>*</span>
                </span>
                <span className={css.legalNameNote}>
                  (This name will appear on your certificate and cannot be changed after signing.)
                </span>
              </label>
              <input
                id="legalNameInput"
                className={`${css.input} ${errors.name ? css.inputInvalid : ""}`}
                type="text"
                name="legalName"
                autoComplete="name"
                placeholder="Enter your full legal name"
                maxLength={MAX_LEGAL_NAME_LENGTH}
                value={signedRecord?.typedName || typedName}
                disabled={!!signedRecord}
                readOnly={!!signedRecord}
                aria-invalid={errors.name ? true : undefined}
                aria-describedby={errors.name ? "legalNameError" : undefined}
                onChange={(e) => {
                  setTypedName(e.target.value);
                  setErrors((prev) => ({ ...prev, name: undefined, form: undefined }));
                }}
              />
              {errors.name && (
                <p className={css.fieldError} id="legalNameError" role="alert">
                  {errors.name}
                </p>
              )}
            </div>

            {/* Digital signature */}
            <div className={css.field}>
              <label className={css.fieldLabel}>
                <span>
                  Digital signature <span className={css.required}>*</span>
                </span>
              </label>

              {hasSignature && signatureChoice === "SAVED" ? (
                <div className={css.savedSigCard}>
                  <div className={css.savedSigHeader}>
                    <span className={css.savedSigTitle}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#16A34A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                        <polyline points="9 12 11 14 15 10" />
                      </svg>
                      {signedRecord ? "Signed Digital Signature" : "Saved Profile Signature"}
                    </span>
                    <span className={css.savedSigBadge}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      {signatureMethod === "UPLOADED" ? "Uploaded Image" : "Drawn Signature"}
                    </span>
                  </div>
                  <div className={css.savedSigImgWrap}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={activeSignature!}
                      alt="Digital Signature"
                      className={css.savedSigImg}
                    />
                  </div>
                  <div style={{ display: "flex", gap: "0.6rem", marginTop: "0.85rem", justifyContent: "flex-end", flexWrap: "wrap" }}>
                    <button
                      type="button"
                      className={css.replaceSigBtn}
                      onClick={() => {
                        setSignatureChoice("NEW");
                        setSignatureData(null);
                        setErrors((prev) => ({ ...prev, signature: undefined }));
                      }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M12 20h9" />
                        <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                      </svg>
                      <span>Replace Signature</span>
                    </button>
                    <button
                      type="button"
                      className={css.removeSigBtn}
                      onClick={() => {
                        setSignatureChoice("NEW");
                        setSignatureData(null);
                        setSavedProfileSig(null);
                        if (signedRecord) {
                          setSignedRecord((prev) =>
                            prev ? { ...prev, drawnSignature: undefined, signatureImage: undefined } : null
                          );
                        }
                        setErrors((prev) => ({ ...prev, signature: undefined }));
                      }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      </svg>
                      <span>Remove</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  <SignaturePad onSignatureChange={handleSignatureChange} height={160} />
                  {originalSignature && (
                    <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "0.5rem" }}>
                      <button
                        type="button"
                        onClick={() => {
                          setSignatureData(originalSignature);
                          setSignatureChoice("SAVED");
                        }}
                        style={{
                          background: "none",
                          border: "none",
                          color: "#B86B11",
                          fontSize: "0.8rem",
                          fontWeight: 600,
                          cursor: "pointer",
                          textDecoration: "underline",
                        }}
                      >
                        Keep Existing Signature
                      </button>
                    </div>
                  )}
                </div>
              )}

              {errors.signature && (
                <p className={css.fieldError} role="alert">
                  {errors.signature}
                </p>
              )}
            </div>

            {/* Typed Acceptance requirement */}
            <div className={css.field}>
              <label className={css.fieldLabelStacked} htmlFor="acknowledgementInput">
                <span className={css.labelText}>
                  Typed Acceptance <span className={css.required}>*</span>
                </span>
                <span className={css.fieldHelperText}>
                  Please type <strong>I AGREE</strong> to confirm that you have read and accepted the program agreement terms
                </span>
              </label>
              <input
                id="acknowledgementInput"
                className={`${css.input} ${errors.acknowledgement ? css.inputInvalid : ""}`}
                type="text"
                name="typedAcknowledgement"
                autoComplete="off"
                placeholder='Type "I AGREE"'
                value={typedAcknowledgement}
                style={{ textTransform: "uppercase" }}
                aria-invalid={errors.acknowledgement ? true : undefined}
                aria-describedby={errors.acknowledgement ? "acknowledgementError" : undefined}
                onChange={(e) => {
                  setTypedAcknowledgement(e.target.value.toUpperCase());
                  setErrors((prev) => ({ ...prev, acknowledgement: undefined, form: undefined }));
                }}
              />

              {errors.acknowledgement && (
                <p className={css.fieldError} id="acknowledgementError" role="alert">
                  {errors.acknowledgement}
                </p>
              )}
            </div>

            {/* Mandatory consent — immediately before the CTA */}
            <label className={css.consent}>
              <input
                className={css.consentInput}
                type="checkbox"
                name="digitalConsent"
                checked={consentGiven}
                aria-invalid={errors.consent ? true : undefined}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setConsentGiven(checked);
                  if (checked && !consentTimestamp) {
                    setConsentTimestamp(new Date().toISOString());
                  }
                  setErrors((prev) => ({ ...prev, consent: undefined, form: undefined }));
                }}
              />
              <span className={css.consentText}>
                I consent to WhatBoutMe collecting and processing my personal information for workshop registration, communication and related services, as described in the{" "}
                <a
                  href={PRIVACY_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  style={{ color: "#B86B11", textDecoration: "underline", fontWeight: 600 }}
                >
                  Privacy Policy
                </a>
                . I acknowledge that I have read and accepted the applicable{" "}
                <a
                  href={TERMS_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  style={{ color: "#B86B11", textDecoration: "underline", fontWeight: 600 }}
                >
                  Terms and Conditions
                </a>{" "}
                and the Program Agreement terms set forth above.
              </span>
            </label>
            {errors.consent && (
              <p className={css.fieldError} role="alert">
                {errors.consent}
              </p>
            )}

            {errors.form && (
              <div className={css.formError} role="alert">
                {errors.form}
              </div>
            )}

            {signedRecord && signatureChoice === "SAVED" ? (
              <button
                type="button"
                onClick={() =>
                  handleConfirmPaymentAndProceed(
                    signedRecord.programId || enrolment?.programId,
                    signedRecord.enrolmentId || enrolment?.id
                  )
                }
                disabled={isConfirmingPayment}
                className={css.submit}
                style={{ cursor: isConfirmingPayment ? "wait" : "pointer" }}
              >
                <span>
                  {isConfirmingPayment
                    ? "Confirming Payment & Unlocking Course…"
                    : "Continue to Payment"}
                </span>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <line x1="5" y1="12" x2="19" y2="12" />
                  <polyline points="12 5 19 12 12 19" />
                </svg>
              </button>
            ) : (
              <button
                type="submit"
                className={css.submit}
                disabled={isSubmitting || !hasAgreementContent}
              >
                <span>
                  {isSubmitting
                    ? "Signing agreement…"
                    : "Sign Agreement & Continue"}
                </span>
                {!isSubmitting && (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <line x1="5" y1="12" x2="19" y2="12" />
                    <polyline points="12 5 19 12 12 19" />
                  </svg>
                )}
              </button>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}

export default function LearnerAgreementPage() {
  return (
    <Suspense
      fallback={
        <div className={css.page}>
          <div className={css.shell}>
            <div className={`${css.card} ${css.centered}`}>
              <p className={css.stateText}>Loading program agreement…</p>
            </div>
          </div>
        </div>
      }
    >
      <AgreementSignContent />
    </Suspense>
  );
}
