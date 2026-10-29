"use client";

import React from "react";
import Link from "next/link";
import styles from "../../page.module.css";

export interface CertificateData {
  id: string;
  issuedAt?: string;
  createdAt?: string;
  program?: {
    title?: string;
  };
}

interface LearnerCertificatesProps {
  certificates: CertificateData[];
}

export default function LearnerCertificates({
  certificates,
}: LearnerCertificatesProps) {
  return (
    <section
      className={styles.certificatesCard}
      aria-labelledby="certificates-heading"
    >
      <div className={styles.cardHeaderRow}>
        <div className={styles.cardHeaderWithIcon}>
          <span
            className={styles.cardHeaderIcon}
            style={{ color: "#ea580c" }}
            aria-hidden="true"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
              <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
              <path d="M4 22h16" />
              <path d="M10 14.66V17c0 .55-.45 1-1 1H8c-.55 0-1 .45-1 1v1h10v-1c0-.55-.45-1-1-1h-1c-.55 0-1-.45-1-1v-2.34" />
              <path d="M6 4h12a2 2 0 0 1 2 2v3a6 6 0 0 1-6 6h0a6 6 0 0 1-6-6V6a2 2 0 0 1 2-2z" />
            </svg>
          </span>
          <h2 id="certificates-heading" className={styles.cardHeaderTitle}>
            Certificates
          </h2>
        </div>

        <Link href="/certificates" className={styles.viewAllLinkSmall}>
          <span>View All</span>
          <span aria-hidden="true">&rarr;</span>
        </Link>
      </div>

      {certificates.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {certificates.slice(0, 2).map((cert) => (
            <div key={cert.id} className={styles.certItemRow}>
              <div className={styles.certItemLeft}>
                <span className={styles.certItemDocIcon} aria-hidden="true">
                  <svg
                    width="18"
                    height="18"
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
                  </svg>
                </span>
                <div>
                  <div className={styles.certItemTitle}>
                    {cert.program?.title || "Certificate of Completion"}
                  </div>
                  <div className={styles.certItemDate}>
                    Issued on{" "}
                    {new Date(
                      cert.issuedAt || cert.createdAt || Date.now()
                    ).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </div>
                </div>
              </div>
              <Link
                href={`/certificates/${cert.id}`}
                className={styles.certViewBtn}
              >
                View &rarr;
              </Link>
            </div>
          ))}
        </div>
      ) : (
        <div className={styles.certificatesEmptyState}>
          <svg
            className={styles.certRibbonIcon}
            width="44"
            height="44"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="8" r="6" />
            <path d="M15.4 13.8L18 22l-6-3-6 3 2.6-8.2" />
          </svg>
          <h3 className={styles.certEmptyTitle}>No certificates yet</h3>
          <p className={styles.certEmptySub}>
            Complete course requirements to earn your certificate.
          </p>
        </div>
      )}
    </section>
  );
}
