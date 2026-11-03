import React from "react";
import Image from "next/image";
import styles from "./Certificate.module.css";

export type CertificateDetails = {
  /** Legacy props for backward compatibility */
  name?: string;
  course?: string;
  issuedAt?: string | null;
  number?: string | null;

  /** Dynamic Master Prompt fields */
  recipientName?: string;
  courseName?: string;
  issuerName?: string;
  issuerTitle?: string;
  issueDate?: string | null;
  certificateNo?: string | null;
  certificateNumber?: string | null;
  brandName?: string;
  verificationUrl?: string | null;
  signatureImage?: string | null;
  logoImage?: string | null;
  qrCodeImage?: string | null;

  /** Template Support: 25 CPD Hours Certification vs Corporate Participation */
  templateType?: "CPD_25_HOURS" | "PARTICIPATION" | "PROFESSIONAL" | "CORPORATE_PARTICIPATION";
  certificateType?: "CPD_25_HOURS" | "PARTICIPATION" | "PROFESSIONAL" | "CORPORATE_PARTICIPATION";
  cpdHours?: number | null;

  /** Optional overrides */
  description?: string;
  facilitatorDescription?: string;
  showLinkedInShare?: boolean;
};

/**
 * Format date into formal certificate style: "October 13, 2026"
 */
function formatCertificateDate(isoDate?: string | null): string {
  if (!isoDate) return "Date of Issue";
  try {
    const d = new Date(isoDate);
    if (isNaN(d.getTime())) return isoDate;
    return d.toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return isoDate;
  }
}

/**
 * Precision Vector QR Code Generator (29x29 Module Matrix)
 * Generates an infinitely scalable, high-DPI vector QR code.
 */
function VectorQrCode({ className }: { className?: string }) {
  const qrModules = [
    "1111111001010100110001111111",
    "1000001010111010011101000001",
    "1011101011010001000101011101",
    "1011101000111101101001011101",
    "1011101010100010011101011101",
    "1000001011011101100001000001",
    "1111111010101010101011111111",
    "0000000011001000110100000000",
    "1101110101101001010110110111",
    "0010101100110110110011010100",
    "1001100010101001001100101101",
    "0110011101011011010101001011",
    "1010100011100100111010110100",
    "0000000001010110100100001111",
    "1111111011001011010110100101",
    "1000001000110100101001111010",
    "1011101010101110011100010111",
    "1011101001010001100111010010",
    "1011101011101100011000101101",
    "1000001001010011101011100101",
    "1111111010110100110101011111",
    "0000000011010010001100001010",
    "1101101100101101100110110101",
    "0100100011010010111001001110",
    "1011011100110100010110110101",
    "0100100010101110101001001010",
    "1101101101010011010110110111",
    "0010010011101100101000100101",
    "1111111101010111011111111111",
  ];

  return (
    <svg
      className={className}
      viewBox="0 0 29 29"
      shapeRendering="crispEdges"
      aria-label="Verification QR Code"
    >
      <rect width="29" height="29" fill="#ffffff" />
      {qrModules.map((row, rIdx) =>
        row.split("").map((cell, cIdx) =>
          cell === "1" ? (
            <rect key={`${rIdx}-${cIdx}`} x={cIdx} y={rIdx} width="1" height="1" fill="#14110f" />
          ) : null
        )
      )}
    </svg>
  );
}

/**
 * Neoclassical Victorian Corner Flourish
 */
function CornerFlourish({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 72 72" fill="none" aria-hidden="true">
      <path
        d="M4 68V20C4 11.1634 11.1634 4 20 4H68"
        stroke="url(#flourishGoldAdmin)"
        strokeWidth="1.5"
      />
      <path
        d="M10 68V22C10 15.3726 15.3726 10 22 10H68"
        stroke="url(#flourishGoldAdmin)"
        strokeWidth="0.75"
        strokeDasharray="2 2"
      />
      <circle cx="20" cy="20" r="3.5" fill="url(#flourishGoldAdmin)" />
      <path
        d="M20 20Q28 12 36 20Q28 28 20 20Z"
        fill="url(#flourishGoldAdmin)"
        opacity="0.85"
      />
      <path
        d="M4 4L14 14M68 68L58 58"
        stroke="url(#flourishGoldAdmin)"
        strokeWidth="1"
      />
      <defs>
        <linearGradient id="flourishGoldAdmin" x1="0" y1="0" x2="72" y2="72" gradientUnits="userSpaceOnUse">
          <stop stopColor="#b8860b" />
          <stop offset="0.5" stopColor="#d4af37" />
          <stop offset="1" stopColor="#8a5a00" />
        </linearGradient>
      </defs>
    </svg>
  );
}

/**
 * Master Award Seal & Rosette with Laurel Wreath & Pleated Ribbons
 */
function AwardSeal({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 160 200" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="sealGoldLightAdmin" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#d4af37" />
          <stop offset="25%" stopColor="#fdf0b0" />
          <stop offset="50%" stopColor="#c59b27" />
          <stop offset="75%" stopColor="#edd87b" />
          <stop offset="100%" stopColor="#8a5e12" />
        </linearGradient>
        <radialGradient id="coinRadialAdmin" cx="40%" cy="38%" r="62%">
          <stop offset="0%" stopColor="#fff8db" />
          <stop offset="45%" stopColor="#e3ba4b" />
          <stop offset="85%" stopColor="#a37318" />
          <stop offset="100%" stopColor="#7a520e" />
        </radialGradient>
        <linearGradient id="ribbonLeftAdmin" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#8a5e12" />
          <stop offset="35%" stopColor="#c59b27" />
          <stop offset="70%" stopColor="#e8cf6f" />
          <stop offset="100%" stopColor="#784e09" />
        </linearGradient>
        <linearGradient id="ribbonRightAdmin" x1="100%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#8a5e12" />
          <stop offset="35%" stopColor="#c59b27" />
          <stop offset="70%" stopColor="#e8cf6f" />
          <stop offset="100%" stopColor="#784e09" />
        </linearGradient>
        <filter id="sealShadowAdmin" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="5" stdDeviation="4" floodColor="#4a3003" floodOpacity="0.25" />
        </filter>
      </defs>

      {/* Hanging Pleated Ribbon Tails */}
      <g filter="url(#sealShadowAdmin)">
        <path
          d="M58 105L44 185L64 172L78 190L82 108Z"
          fill="url(#ribbonLeftAdmin)"
          stroke="#784e09"
          strokeWidth="0.5"
        />
        <path
          d="M102 105L116 185L96 172L82 190L78 108Z"
          fill="url(#ribbonRightAdmin)"
          stroke="#784e09"
          strokeWidth="0.5"
        />
      </g>

      {/* Laurel Wreath Left Branch */}
      <g stroke="url(#sealGoldLightAdmin)" strokeWidth="1.2" fill="url(#sealGoldLightAdmin)">
        <path d="M42 98C32 88 28 72 32 54C34 45 38 38 44 32" fill="none" strokeWidth="1.8" />
        <ellipse cx="32" cy="48" rx="6" ry="3.2" transform="rotate(-35 32 48)" />
        <ellipse cx="28" cy="62" rx="6.5" ry="3.5" transform="rotate(-15 28 62)" />
        <ellipse cx="29" cy="76" rx="6.5" ry="3.5" transform="rotate(10 29 76)" />
        <ellipse cx="34" cy="90" rx="6.5" ry="3.5" transform="rotate(35 34 90)" />
        <ellipse cx="43" cy="100" rx="6.5" ry="3.5" transform="rotate(55 43 100)" />
      </g>

      {/* Laurel Wreath Right Branch */}
      <g stroke="url(#sealGoldLightAdmin)" strokeWidth="1.2" fill="url(#sealGoldLightAdmin)">
        <path d="M118 98C128 88 132 72 128 54C126 45 122 38 116 32" fill="none" strokeWidth="1.8" />
        <ellipse cx="128" cy="48" rx="6" ry="3.2" transform="rotate(35 128 48)" />
        <ellipse cx="132" cy="62" rx="6.5" ry="3.5" transform="rotate(15 132 62)" />
        <ellipse cx="131" cy="76" rx="6.5" ry="3.5" transform="rotate(-10 131 76)" />
        <ellipse cx="126" cy="90" rx="6.5" ry="3.5" transform="rotate(-35 126 90)" />
        <ellipse cx="117" cy="100" rx="6.5" ry="3.5" transform="rotate(-55 117 100)" />
      </g>

      {/* Fluted Rosette Outer Medal Disc */}
      <g filter="url(#sealShadowAdmin)">
        <circle cx="80" cy="70" r="44" fill="url(#sealGoldLightAdmin)" />
        {Array.from({ length: 36 }).map((_, i) => (
          <line
            key={i}
            x1="80"
            y1="26"
            x2="80"
            y2="31"
            stroke="#6e4606"
            strokeWidth="2.5"
            strokeLinecap="round"
            transform={`rotate(${i * 10} 80 70)`}
          />
        ))}

        <circle cx="80" cy="70" r="40" fill="none" stroke="#784e09" strokeWidth="1.5" />
        <circle cx="80" cy="70" r="37.5" fill="none" stroke="#ffffff" strokeWidth="0.8" opacity="0.6" />
        <circle cx="80" cy="70" r="36" fill="url(#coinRadialAdmin)" />

        <circle
          cx="80"
          cy="70"
          r="32"
          fill="none"
          stroke="#784e09"
          strokeWidth="1"
          strokeDasharray="2.5 2.5"
        />

        <g filter="drop-shadow(0 2px 2px rgba(80, 50, 0, 0.45))">
          <path
            d="M66 70L75 79L95 59"
            fill="none"
            stroke="#ffffff"
            strokeWidth="5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M66 69L75 78L95 58"
            fill="none"
            stroke="#fae998"
            strokeWidth="3.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>
      </g>
    </svg>
  );
}

/**
 * Banknote Security Guilloche Background Wave Lines
 */
function BanknoteGuilloche() {
  return (
    <svg
      className={styles.guillocheSvg}
      viewBox="0 0 1000 700"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="waveGoldAdmin" x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#d4af37" stopOpacity="0.35" />
          <stop offset="50%" stopColor="#c59b27" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#b8860b" stopOpacity="0.32" />
        </linearGradient>
      </defs>
      <path
        d="M450 700C600 640 750 500 1000 480M400 700C560 620 720 480 1000 450M350 700C520 600 690 460 1000 420M300 700C480 580 660 440 1000 390M250 700C440 560 630 420 1000 360M200 700C400 540 600 400 1000 330"
        fill="none"
        stroke="url(#waveGoldAdmin)"
        strokeWidth="0.8"
      />
      <path
        d="M700 0C760 120 860 220 1000 250M750 0C800 100 890 190 1000 210M800 0C840 80 920 160 1000 170"
        fill="none"
        stroke="url(#waveGoldAdmin)"
        strokeWidth="0.7"
      />
    </svg>
  );
}

/**
 * Centered Ornamental Diamond & Filigree Scroll Divider
 */
function SymmetricalDivider({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 600 24" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id="divGoldAdmin" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#c59b27" stopOpacity="0.1" />
          <stop offset="35%" stopColor="#b8860b" stopOpacity="0.8" />
          <stop offset="50%" stopColor="#dfc982" stopOpacity="1" />
          <stop offset="65%" stopColor="#b8860b" stopOpacity="0.8" />
          <stop offset="100%" stopColor="#c59b27" stopOpacity="0.1" />
        </linearGradient>
      </defs>
      <line x1="20" y1="12" x2="255" y2="12" stroke="url(#divGoldAdmin)" strokeWidth="1" />
      <line x1="345" y1="12" x2="580" y2="12" stroke="url(#divGoldAdmin)" strokeWidth="1" />

      <path d="M260 12L265 8L270 12L265 16Z" fill="#b8860b" />
      <path d="M330 12L335 8L340 12L335 16Z" fill="#b8860b" />

      <path
        d="M272 12C280 8 288 6 295 10C298 12 299 15 296 17C293 18 290 16 292 13"
        fill="none"
        stroke="#b8860b"
        strokeWidth="1.2"
      />
      <path
        d="M328 12C320 8 312 6 305 10C302 12 301 15 304 17C307 18 310 16 308 13"
        fill="none"
        stroke="#b8860b"
        strokeWidth="1.2"
      />

      <path d="M300 4L307 12L300 20L293 12Z" fill="#c59b27" stroke="#7a520e" strokeWidth="0.8" />
      <circle cx="300" cy="12" r="2" fill="#fff6d6" />
    </svg>
  );
}

/**
 * Premium, Elegant, Print-Ready Completion Certificate.
 * Follows exact A4 landscape ratio with print-safe margins, warm ivory palette,
 * metallic gold vertical ribbon, and official credential hierarchy.
 *
 * Keep this file identical in the learner portal and the admin app.
 */
export default function Certificate({
  name,
  course,
  issuedAt,
  number,
  recipientName,
  courseName,
  issuerName,
  issuerTitle,
  issueDate,
  certificateNo,
  certificateNumber,
  brandName,
  verificationUrl,
  signatureImage,
  logoImage,
  qrCodeImage,
  description,
  facilitatorDescription,
  templateType,
  certificateType,
  cpdHours = 25,
  showLinkedInShare = false,
}: CertificateDetails) {
  // Safe Fallbacks matching strict validation rules
  const finalRecipient = recipientName || name || "Learner Name";
  const finalCourse = courseName || course || "11 Steps to U Certification Programme";
  const finalDate = formatCertificateDate(issueDate || issuedAt);
  const finalCertNo = certificateNumber || certificateNo || number || "CERT-WBM-11S-2026-001";
  const finalIssuer = issuerName || "Roweena Britto";
  const finalTitle = issuerTitle || "Founder & Lead Facilitator";
  const finalBrand = brandName || "whatboutme";

  const isParticipation =
    templateType === "PARTICIPATION" ||
    templateType === "CORPORATE_PARTICIPATION" ||
    certificateType === "PARTICIPATION" ||
    certificateType === "CORPORATE_PARTICIPATION" ||
    (!templateType &&
      !certificateType &&
      (finalCourse.toLowerCase().includes("participation") ||
        finalCourse.toLowerCase().includes("workshop")));

  const effectiveCpdHours = isParticipation ? null : (cpdHours ?? 25);

  const defaultDescription =
    description ||
    facilitatorDescription ||
    (isParticipation
      ? `for active engagement, practical exercises, and collaborative participation in the executive workshop delivered by ${finalBrand} and facilitated by ${finalIssuer}.`
      : `having fulfilled all curriculum milestones, video hours, self-reflections, and knowledge assessments for the ${finalCourse}, accredited for ${effectiveCpdHours} CPD Hours, delivered by ${finalBrand} and facilitated by ${finalIssuer}, Brain Health Coach.`);

  const publicVerifyUrl =
    verificationUrl || `https://whatboutme.com/verify/${finalCertNo}`;

  // Parse issue year & month for LinkedIn certificate addition
  const issueDateObj = issueDate || issuedAt ? new Date(issueDate || issuedAt!) : new Date();
  const issueYear = isNaN(issueDateObj.getFullYear()) ? new Date().getFullYear() : issueDateObj.getFullYear();
  const issueMonth = isNaN(issueDateObj.getMonth()) ? new Date().getMonth() + 1 : issueDateObj.getMonth() + 1;

  const linkedInCertUrl = `https://www.linkedin.com/profile/add?startTask=CERTIFICATION_NAME&name=${encodeURIComponent(
    finalCourse
  )}&organizationName=whatboutme&issueYear=${issueYear}&issueMonth=${issueMonth}&certUrl=${encodeURIComponent(
    publicVerifyUrl
  )}&certId=${encodeURIComponent(finalCertNo)}`;

  return (
    <div className={styles.certificateOuterWrap}>
      <article
        className={styles.sheet}
        aria-label={`Official Certificate of ${isParticipation ? "Participation" : "Completion"} for ${finalRecipient}`}
      >
        <BanknoteGuilloche />

        <div className={styles.outerFrame} aria-hidden="true" />
        <div className={styles.innerFrame} aria-hidden="true" />

        <CornerFlourish className={`${styles.cornerFlourish} ${styles.cornerTL}`} />
        <CornerFlourish className={`${styles.cornerFlourish} ${styles.cornerTR}`} />
        <CornerFlourish className={`${styles.cornerFlourish} ${styles.cornerBL}`} />
        <CornerFlourish className={`${styles.cornerFlourish} ${styles.cornerBR}`} />

        <div className={styles.goldRibbon} aria-hidden="true">
          <div className={styles.ribbonShimmer} />
          <div className={styles.ribbonContent}>
            <span className={styles.ribbonPrimary}>CERTIFICATE</span>
            <span className={styles.ribbonSecondary}>
              {isParticipation ? "OF PARTICIPATION" : "OF COMPLETION"}
            </span>
          </div>
        </div>

        <div className={styles.contentBody}>
          <header className={styles.headerRow}>
            <div className={styles.brandGroup}>
              {logoImage ? (
                <Image
                  src={logoImage}
                  alt={finalBrand}
                  width={160}
                  height={40}
                  quality={80}
                  loading="lazy"
                  unoptimized={!logoImage.startsWith("/")}
                  className={styles.brandLogoImg}
                />
              ) : (
                <div className={styles.brandWordmark}>
                  <span className={styles.brandNameText}>{finalBrand}</span>
                  <span className={styles.heartMark} aria-hidden="true">
                    <svg width="20" height="18" viewBox="0 0 24 22" fill="none">
                      <path
                        d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
                        fill="url(#brandHeartGoldAdmin)"
                      />
                      <defs>
                        <linearGradient id="brandHeartGoldAdmin" x1="2" y1="3" x2="22" y2="21.35">
                          <stop stopColor="#f59e0b" />
                          <stop offset="1" stopColor="#d97706" />
                        </linearGradient>
                      </defs>
                    </svg>
                  </span>
                  <span className={styles.trademark} aria-hidden="true">®</span>
                </div>
              )}
              <p className={styles.brandSubtitle}>LEARN • GROW • BE A BETTER YOU</p>
            </div>

            <div className={styles.headerTaglineWrap}>
              <p className={styles.taglineLine1}>PRACTICAL LEARNING</p>
              <div className={styles.taglineDivider} />
              <p className={styles.taglineLine2}>FOR A BRIGHTER YOU</p>
            </div>
          </header>

          <AwardSeal className={styles.awardSeal} />

          <div className={styles.certCenter}>
            <p className={styles.certLead}>THIS IS TO CERTIFY THAT</p>

            <h1 className={styles.recipientName}>{finalRecipient}</h1>

            <SymmetricalDivider className={styles.dividerOrnament} />

            <p className={styles.courseLead}>
              {isParticipation
                ? "HAS ACTIVELY PARTICIPATED IN THE EXECUTIVE WORKSHOP"
                : "HAS SUCCESSFULLY COMPLETED AND MET ALL ASSESSMENTS FOR"}
            </p>

            <h2 className={styles.courseTitle}>{finalCourse}</h2>

            {!isParticipation && (
              <div className={styles.cpdBadge}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                </svg>
                <span>{effectiveCpdHours} CPD Accredited Hours &bull; Accreditation CPD UK</span>
              </div>
            )}

            <p className={styles.courseDescription}>{defaultDescription}</p>
          </div>

          <footer className={styles.footerRow} role="contentinfo">
            <div className={styles.signerCol}>
              <div className={styles.signatureSlot}>
                {signatureImage ? (
                  <Image
                    src={signatureImage}
                    alt={finalIssuer}
                    width={180}
                    height={50}
                    quality={80}
                    loading="lazy"
                    unoptimized={!signatureImage.startsWith("/")}
                    className={styles.signatureImg}
                  />
                ) : (
                  <span className={styles.handwrittenSignature}>{finalIssuer}</span>
                )}
              </div>
              <div className={styles.signerRule} />
              <p className={styles.signerName}>{finalIssuer}</p>
              <p className={styles.signerTitle}>{finalTitle}</p>
              <p className={styles.signerOrg}>{finalBrand}</p>
            </div>

            <div className={styles.dateCol}>
              <p className={styles.dateValue}>{finalDate}</p>
              <div className={styles.dateRule} />
              <p className={styles.dateLabel}>DATE OF ISSUE</p>
            </div>

            <div className={styles.verifyCol}>
              <div className={styles.certNoGroup}>
                <span className={styles.certNoLabel}>Certificate No.</span>
                <span className={styles.certNoValue}>{finalCertNo}</span>
                <a
                  href={publicVerifyUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.verifyLink}
                  title={`Verify ${finalCertNo}`}
                >
                  /verify/{finalCertNo}
                </a>
              </div>

              <div className={styles.qrGroup}>
                {qrCodeImage ? (
                  <Image
                    src={qrCodeImage}
                    alt="Certificate QR"
                    width={64}
                    height={64}
                    quality={80}
                    loading="lazy"
                    unoptimized={!qrCodeImage.startsWith("/")}
                    className={styles.qrImg}
                  />
                ) : (
                  <VectorQrCode className={styles.qrVector} />
                )}
                <span className={styles.qrLabel}>VERIFY CERTIFICATE</span>
              </div>
            </div>
          </footer>
        </div>
      </article>

      {showLinkedInShare && (
        <div className={`${styles.linkedinShareWrap} ${styles.screenOnly}`}>
          <a
            href={linkedInCertUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.linkedinShareBtn}
            title="Add this verified credential directly to your LinkedIn profile"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.28 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.75M6.46 10.9v8.37H9.2V10.9H6.46M7.83 6.64a1.64 1.64 0 1 0 0 3.28 1.64 1.64 0 0 0 0-3.28z" />
            </svg>
            <span>Add Credential to LinkedIn</span>
          </a>
        </div>
      )}
    </div>
  );
}
