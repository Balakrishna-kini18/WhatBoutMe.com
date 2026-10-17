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

function buildCheckoutUrl(programId?: string, enrolmentId?: string): string {
  if (!programId) return "/courses";
  const query = new URLSearchParams({ programId });
  if (enrolmentId) query.set("enrolmentId", enrolmentId);
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

  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Enrolment & agreement state
  const [enrolment, setEnrolment] = useState<any>(null);
  const [activeTemplate, setActiveTemplate] = useState<ActiveAgreementResponse | null>(null);
  const [signedRecord, setSignedRecord] = useState<SignedAgreementResponse | null>(null);

  // Reusable profile signature state
  const [savedProfileSig, setSavedProfileSig] = useState<SavedSignatureResponse | null>(null);
  const [signatureChoice, setSignatureChoice] = useState<"SAVED" | "NEW">("SAVED");
  const [updateProfileSignature, setUpdateProfileSignature] = useState(false);

  // Form state — the legal name always starts empty.
  const [consentGiven, setConsentGiven] = useState(false);
  const [consentTimestamp, setConsentTimestamp] = useState<string | null>(null);
  const [typedName, setTypedName] = useState("");
  const [signatureData, setSignatureData] = useState<string | null>(null);
  const [signatureMethod, setSignatureMethod] = useState<SignatureMethod>("DRAWN");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [justSignedSuccess, setJustSignedSuccess] = useState<SignedAgreementResponse | null>(null);
  const [isConfirmingPayment, setIsConfirmingPayment] = useState(false);

  const handleConfirmPaymentAndProceed = async (targetProgramId?: string, targetEnrolmentId?: string) => {
    const progId = targetProgramId || enrolment?.programId || queryProgramId || signedRecord?.programId || justSignedSuccess?.programId;
    const enrolId = targetEnrolmentId || enrolment?.id || queryEnrolmentId || signedRecord?.enrolmentId || justSignedSuccess?.enrolmentId;

    if (!progId) {
      router.push("/courses");
      return;
    }

    setIsConfirmingPayment(true);

    try {
      const res = await fetch(`${API_URL}/checkout/mock`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          programId: progId,
          enrolmentId: enrolId,
          bypass: true,
          simulate: true,
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        if (text.includes("already enrolled") || text.includes("ACTIVE")) {
          router.push(`/programs/${progId}/steps`);
          return;
        }
        // Fallback to checkout URL if unexpected response
        router.push(buildCheckoutUrl(progId, enrolId));
        return;
      }

      // Bypass confirmation successful - take learner straight to course steps
      router.push(`/programs/${progId}/steps`);
    } catch (err: any) {
      console.error("Payment bypass confirmation failed:", err);
      router.push(buildCheckoutUrl(progId, enrolId));
    } finally {
      setIsConfirmingPayment(false);
    }
  };

  useEffect(() => {
    document.body.classList.add("auth-page-active");
    return () => document.body.classList.remove("auth-page-active");
  }, []);

  useEffect(() => {
    initAgreementFlow();
  }, [queryProgramId, queryEnrolmentId]);

  const initAgreementFlow = async () => {
    setIsLoading(true);
    setLoadError(null);

    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    if (!token) {
      const returnUrl = encodeURIComponent(
        `/agreement${queryProgramId ? `?programId=${queryProgramId}` : ""}${queryEnrolmentId ? `&enrolmentId=${queryEnrolmentId}` : ""}`
      );
      router.push(`/login?portal=${returnUrl}`);
      return;
    }

    try {
      let target: any = null;
      let tpl: any = null;

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
      if (!signedRecord) {
        const signedRes = await fetch(`${API_URL}/agreements/enrolments/${target.id}`, {
          headers: getAuthHeaders(),
        });

        if (signedRes.ok) {
          const text = await signedRes.text();
          const existingSigned = text ? JSON.parse(text) : null;
          if (existingSigned && existingSigned.status === "SIGNED") {
            setSignedRecord(existingSigned);
            setIsLoading(false);
            return;
          }
        }
      }

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
            setSignatureData(sigData.savedSignature);
            if (sigData.savedSignatureType) {
              setSignatureMethod(sigData.savedSignatureType);
            }
          } else {
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

    const usingSaved = signatureChoice === "SAVED" && !!savedProfileSig?.savedSignature;
    const finalSigData = usingSaved ? savedProfileSig!.savedSignature : signatureData;
    const finalSigType = usingSaved
      ? (savedProfileSig!.savedSignatureType || "DRAWN")
      : signatureMethod;

    if (!finalSigData || finalSigData.length < 10) {
      nextErrors.signature =
        finalSigType === "UPLOADED"
          ? "Upload a signature image (PNG, JPEG or WebP) before continuing."
          : "Draw your signature before continuing.";
    }

    if (!consentGiven) {
      nextErrors.consent = "Accept the digital consent statement to continue.";
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
        signerName: legalName,
        useSavedSignature: usingSaved,
        updateProfileSignature: usingSaved ? false : updateProfileSignature,
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
    return (
      <div className={css.page}>
        <div className={css.shell}>
          <div className={`${css.card} ${css.centered}`}>
            <p className={css.stateText}>Loading program agreement…</p>
            <p className={css.stateBody}>Retrieving the current legal terms for this program.</p>
          </div>
        </div>
      </div>
    );
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
          buildCheckoutUrl(enrolment?.programId || queryProgramId || undefined, enrolment?.id || queryEnrolmentId || undefined)
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

  if (signedRecord) {
    const position = resolveJourneyPosition(
      signedRecord.nextStep,
      signedRecord.enrolmentStatus ?? enrolment?.status
    );
    const nextUrl =
      position === "CHECKOUT"
        ? signedRecord.checkoutUrl ||
          buildCheckoutUrl(enrolment?.programId || queryProgramId || undefined, enrolment?.id || queryEnrolmentId || undefined)
        : `/programs/${enrolment?.programId || queryProgramId}/steps`;
    const programTitle =
      enrolment?.program?.title || activeTemplate?.programTitle || "your selected program";

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
            <p className={css.stateText}>Agreement already signed</p>
            <p className={css.stateBody}>
              You have already signed the program agreement for{" "}
              <span className={css.stateBodyStrong}>{programTitle}</span>.
            </p>

            <dl className={css.details}>
              <div>
                <dt className={css.detailLabel}>Signed by</dt>
                <dd className={css.detailValue}>{signedRecord.typedName}</dd>
              </div>
              <div>
                <dt className={css.detailLabel}>Agreement version</dt>
                <dd className={css.detailValue}>{signedRecord.templateVersion || "v1.0"}</dd>
              </div>
              <div>
                <dt className={css.detailLabel}>Signed at</dt>
                <dd className={css.detailValue}>{new Date(signedRecord.signedAt).toLocaleString()}</dd>
              </div>
              <div>
                <dt className={css.detailLabel}>Next step</dt>
                <dd className={css.detailValue}>
                  {position === "CHECKOUT" ? "Payment confirmation" : "Course access"}
                </dd>
              </div>
            </dl>

            {position === "CHECKOUT" ? (
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
    enrolment?.program?.title || activeTemplate?.programTitle || "Selected program";
  const agreementTitle = activeTemplate?.templateTitle || "Program agreement";
  const agreementVersion = activeTemplate?.version || "v1.0";
  const agreementContent = activeTemplate?.content?.trim() || "";
  const hasAgreementContent = agreementContent.length > 0;

  return (
    <div className={css.page}>
      <div className={css.shell}>
        <EnrollmentStepper currentStep={2} />

        <div className={css.card}>
          <h1 className={css.heading}>Program Agreement &amp; Digital Consent</h1>

          {/* Selected program */}
          <section className={css.summary}>
            <span className={css.eyebrow}>Selected program</span>
            <span className={css.programName}>{programTitle}</span>
          </section>

          {/* Agreement title + the single version badge */}
          <div className={css.docHeader}>
            <h2 className={css.docTitle}>{agreementTitle}</h2>
            <span className={css.versionBadge}>{agreementVersion}</span>
          </div>

          {/* Complete, unmodified published terms in a bounded reading area */}
          <div className={css.document} tabIndex={0} role="region" aria-label="Agreement terms">
            {hasAgreementContent ? (
              <div className={css.documentBody}>{agreementContent}</div>
            ) : (
              <p className={css.notice}>
                This agreement is not available yet. Please try again later or contact support.
              </p>
            )}
          </div>

          <form onSubmit={handleSignSubmit} noValidate>
            {/* Full legal name */}
            <div className={css.field}>
              <label className={css.fieldLabel} htmlFor="legalNameInput">
                <span>
                  Full legal name <span className={css.required}>*</span>
                </span>
                <span className={css.fieldHint}>Must match your official identity</span>
              </label>
              <input
                id="legalNameInput"
                className={`${css.input} ${errors.name ? css.inputInvalid : ""}`}
                type="text"
                name="legalName"
                autoComplete="name"
                placeholder="Enter your full legal name"
                maxLength={MAX_LEGAL_NAME_LENGTH}
                value={typedName}
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
                <span className={css.fieldHint}>
                  {savedProfileSig?.hasSavedSignature
                    ? "Confirm your saved signature or draw/upload a new one"
                    : "Draw with finger, pen or mouse, or upload an image"}
                </span>
              </label>

              {savedProfileSig?.hasSavedSignature ? (
                <>
                  {/* Option Switcher */}
                  <div className={css.sigOptionTabs} role="tablist">
                    <button
                      type="button"
                      role="tab"
                      aria-selected={signatureChoice === "SAVED"}
                      className={`${css.sigOptionBtn} ${
                        signatureChoice === "SAVED" ? css.sigOptionBtnActive : ""
                      }`}
                      onClick={() => {
                        setSignatureChoice("SAVED");
                        setErrors((prev) => ({ ...prev, signature: undefined, form: undefined }));
                      }}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      Use Profile Signature
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={signatureChoice === "NEW"}
                      className={`${css.sigOptionBtn} ${
                        signatureChoice === "NEW" ? css.sigOptionBtnActive : ""
                      }`}
                      onClick={() => {
                        setSignatureChoice("NEW");
                        setErrors((prev) => ({ ...prev, signature: undefined, form: undefined }));
                      }}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M12 20h9" />
                        <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                      </svg>
                      Draw / Upload New
                    </button>
                  </div>

                  {signatureChoice === "SAVED" ? (
                    <div className={css.savedSigCard}>
                      <div className={css.savedSigHeader}>
                        <span className={css.savedSigTitle}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#B86B11" strokeWidth="2">
                            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                          </svg>
                          Saved Profile Signature
                        </span>
                        <span className={css.savedSigBadge}>
                          {savedProfileSig.savedSignatureType === "UPLOADED" ? "Uploaded Image" : "Drawn Signature"}
                        </span>
                      </div>
                      <div className={css.savedSigImgWrap}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={savedProfileSig.savedSignature!}
                          alt="Learner Saved Profile Signature"
                          className={css.savedSigImg}
                        />
                      </div>
                      <div className={css.savedSigMeta}>
                        <span>
                          {savedProfileSig.savedSignatureUpdatedAt
                            ? `Saved on ${new Date(savedProfileSig.savedSignatureUpdatedAt).toLocaleDateString()}`
                            : "Saved on your authenticated profile"}
                        </span>
                        <span>Explicit confirmation required below</span>
                      </div>
                      <p className={css.savedSigNote}>
                        Your saved signature will only be applied after you review the terms, accept the mandatory consent statement, and click the final sign button.
                      </p>
                    </div>
                  ) : (
                    <div>
                      <SignaturePad onSignatureChange={handleSignatureChange} height={160} />
                      <label className={css.saveToProfileOption}>
                        <input
                          type="checkbox"
                          checked={updateProfileSignature}
                          onChange={(e) => setUpdateProfileSignature(e.target.checked)}
                        />
                        <span>Update my profile saved signature with this new signature</span>
                      </label>
                    </div>
                  )}
                </>
              ) : (
                <SignaturePad onSignatureChange={handleSignatureChange} height={160} />
              )}

              {errors.signature && (
                <p className={css.fieldError} role="alert">
                  {errors.signature}
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

            <button type="submit" className={css.submit} disabled={isSubmitting || !hasAgreementContent}>
              {isSubmitting ? "Signing agreement…" : "Sign Agreement & Continue to Payment"}
            </button>
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
