"use client";

import React from "react";
import SignaturePad, { SignatureMethod } from "../../agreement/SignaturePad";
import styles from "../profile.module.css";

export interface SavedSignatureState {
  hasSavedSignature: boolean;
  savedSignature: string | null;
  savedSignatureType: "DRAWN" | "UPLOADED" | null;
  savedSignatureUpdatedAt: string | null;
}

export interface DigitalSignatureSectionProps {
  savedSig: SavedSignatureState | null;
  isEditingSig: boolean;
  setIsEditingSig: (val: boolean) => void;
  newSigData: string | null;
  setNewSigData: (val: string | null) => void;
  setNewSigType: (method: SignatureMethod) => void;
  sigBusy: boolean;
  sigMessage: { text: string; type: "success" | "error" } | null;
  setSigMessage: (val: { text: string; type: "success" | "error" } | null) => void;
  handleSaveNewSignature: () => Promise<void>;
  handleRemoveSignatureClick: () => void;
}

export default function DigitalSignatureSection({
  savedSig,
  isEditingSig,
  setIsEditingSig,
  newSigData,
  setNewSigData,
  setNewSigType,
  sigBusy,
  sigMessage,
  setSigMessage,
  handleSaveNewSignature,
  handleRemoveSignatureClick,
}: DigitalSignatureSectionProps) {
  return (
    <section className={styles.sectionCard} aria-labelledby="digital-signature-heading">
      {/* Header */}
      <div className={styles.sigHeaderRow}>
        <div className={styles.sigTitleGroup}>
          <div className={`${styles.sectionHeaderIcon} ${styles.statThemeOrange}`}>
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
            </svg>
          </div>
          <div>
            <h2 id="digital-signature-heading" className={styles.sectionCardTitle}>
              Digital Signature
            </h2>
            <p className={styles.sectionCardSubtitle}>
              Manage your reusable digital signature for program agreements. Updating or removing this signature affects future agreements only; all historical signed records remain immutable and unchanged.
            </p>
          </div>
        </div>

        <div className={styles.sigHeaderActions}>
          <div className={styles.sigMetaBadge}>
            <span className={styles.sigBadgeDot} aria-hidden="true" />
            <span>PROFILE DIGITAL SIGNATURE</span>
          </div>

          {!isEditingSig && savedSig?.hasSavedSignature && (
            <div className={styles.sigButtonGroup}>
              <button
                type="button"
                onClick={() => {
                  setIsEditingSig(true);
                  setSigMessage(null);
                }}
                className={styles.sigLineBtn}
              >
                Replace Signature
              </button>
              <button
                type="button"
                onClick={handleRemoveSignatureClick}
                disabled={sigBusy}
                className={styles.sigRemoveBtn}
              >
                {sigBusy ? "Removing..." : "Remove"}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Status Messages */}
      {sigMessage && (
        <div
          className={
            sigMessage.type === "success"
              ? styles.sigSuccessAlert
              : styles.sigErrorAlert
          }
          role="alert"
        >
          {sigMessage.text}
        </div>
      )}

      {/* Editor or Preview or Empty State */}
      {isEditingSig ? (
        <div className={styles.sigEditorBox}>
          <div className={styles.sigEditorHeader}>
            <span className={styles.sigEditorTitle}>
              {savedSig?.hasSavedSignature
                ? "Replace Digital Signature"
                : "Create Profile Signature"}
            </span>
            <span className={styles.sigEditorTag}>Future Agreements Only</span>
          </div>
          <SignaturePad
            onSignatureChange={(data, method) => {
              setNewSigData(data);
              setNewSigType(method);
            }}
            height={160}
          />
          <p className={styles.sigEditorNotice}>
            By saving, this signature will be stored securely against your learner account and offered for review in future program enrollments.
          </p>
          <div className={styles.sigEditorActions}>
            <button
              type="button"
              onClick={() => {
                setIsEditingSig(false);
                setNewSigData(null);
              }}
              disabled={sigBusy}
              className={styles.sigLineBtn}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSaveNewSignature}
              disabled={sigBusy || !newSigData}
              className={styles.heroDarkBtn}
            >
              {sigBusy ? "Saving..." : "Save to Profile"}
            </button>
          </div>
        </div>
      ) : savedSig?.hasSavedSignature ? (
        <div className={styles.sigSavedCard}>
          <div className={styles.sigPreviewRow}>
            <div className={styles.sigImgContainer}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={savedSig.savedSignature!}
                alt="Learner Saved Profile Signature"
                className={styles.sigImg}
              />
            </div>
            <div className={styles.sigMetaWrap}>
              <div className={styles.sigMetaTitleRow}>
                <span className={styles.sigMetaActiveTitle}>
                  Active Profile Signature
                </span>
                <span className={styles.sigTypeTag}>
                  {savedSig.savedSignatureType === "UPLOADED"
                    ? "Uploaded Image"
                    : "Drawn Signature"}
                </span>
              </div>
              <p className={styles.sigMetaDate}>
                {savedSig.savedSignatureUpdatedAt
                  ? `Last updated: ${new Date(savedSig.savedSignatureUpdatedAt).toLocaleString()}`
                  : "Verified on authenticated profile"}
              </p>
              <p className={styles.sigMetaNote}>
                Secured in private storage. When you enroll in a new program, this signature will be displayed for your explicit review and confirmation.
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className={styles.sigEmptyDashedCard}>
          <div className={styles.sigEmptyIconBox} aria-hidden="true">
            <svg
              width="26"
              height="26"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#ea580c"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
              <polyline points="10 9 9 9 8 9" />
            </svg>
          </div>
          <h3 className={styles.sigEmptyHeading}>No Profile Signature Saved</h3>
          <p className={styles.sigEmptySubtext}>
            Your signature is automatically saved here when you sign your first program agreement, or you can create one in advance.
          </p>
          <button
            type="button"
            onClick={() => {
              setIsEditingSig(true);
              setSigMessage(null);
            }}
            className={styles.heroDarkBtn}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            <span>Add Digital Signature</span>
          </button>
        </div>
      )}
    </section>
  );
}
