"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import type { CertificateDetails } from "../Certificate";
import styles from "../Certificate.module.css";
import { API_URL } from "../../lib/api";

const Certificate = dynamic(() => import("../Certificate"), { ssr: false });

type Row = {
  id: string;
  issuedAt?: string | null;
  certificateNumber?: string;
  enrolment?: {
    user?: { name?: string | null; email?: string };
    batch?: { program?: { title?: string } };
  };
};

/** A learner's certificate as the learner sees it, for checking and printing. */
export default function CertificatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [details, setDetails] = useState<CertificateDetails | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "missing" | "error">("loading");

  useEffect(() => {
    fetch(`${API_URL}/certificates`)
      .then((res) => {
        if (!res.ok) throw new Error();
        return res.json();
      })
      .then((rows: Row[]) => {
        const row = rows.find((r) => r.id === id);
        const user = row?.enrolment?.user;
        if (!row || !user) return setState("missing");
        setDetails({
          name: user.name || user.email || "",
          course: row.enrolment?.batch?.program?.title ?? "",
          issuedAt: row.issuedAt,
          number: row.certificateNumber,
        });
        setState("ready");
      })
      .catch(() => setState("error"));
  }, [id]);

  if (state !== "ready" || !details) {
    return (
      <p className={styles.message} role={state === "loading" ? "status" : "alert"}>
        {state === "loading" && "Loading the certificate..."}
        {state === "missing" && "This certificate could not be found."}
        {state === "error" && "The certificate could not be loaded. Check that the API is running."}{" "}
        {state !== "loading" && <Link href="/certificates">Back to certificates</Link>}
      </p>
    );
  }

  const certCode = details.number || id;
  const marketingBase = process.env.NEXT_PUBLIC_MARKETING_URL || "http://localhost:3000";
  const verifyUrl = `${marketingBase}/verify/${encodeURIComponent(certCode)}`;
  const issueDateObj = details.issuedAt ? new Date(details.issuedAt) : new Date();
  const linkedInUrl = `https://www.linkedin.com/profile/add?startTask=CERTIFICATION_NAME&name=${encodeURIComponent(
    `${details.course || "Curriculum"} Certification`,
  )}&organizationName=whatboutme&issueYear=${issueDateObj.getFullYear()}&issueMonth=${issueDateObj.getMonth() + 1}&certUrl=${encodeURIComponent(
    verifyUrl,
  )}&certId=${encodeURIComponent(certCode)}`;

  const handleDownloadPdf = async () => {
    try {
      const res = await fetch(`${API_URL}/certificates/${id}/pdf`);
      if (res.ok) {
        const data = await res.json();
        if (data.downloadUrl || data.pdfUrl) {
          window.open(data.downloadUrl || data.pdfUrl, "_blank");
          return;
        }
      }
      window.print();
    } catch {
      window.print();
    }
  };

  return (
    <>
      <style
        dangerouslySetInnerHTML={{
          __html: `
            @page {
              size: 297mm 210mm;
              size: landscape;
              margin: 0mm !important;
            }
            @page :left {
              margin: 0mm !important;
            }
            @page :right {
              margin: 0mm !important;
            }
            @media print {
              html, body {
                width: 297mm !important;
                height: 210mm !important;
                margin: 0 !important;
                padding: 0 !important;
                overflow: hidden !important;
                background: #ffffff !important;
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
                color-adjust: exact !important;
              }
              aside,
              nav,
              header:not(article header),
              footer:not(article footer):not([class*="footerRow"]),
              [class*="sidebar"],
              [class*="topbar"],
              [class*="Header"],
              [class*="toolbar"],
              [class*="linkedinShareWrap"] {
                display: none !important;
              }
              body > div[class*="appContainer"],
              div[class*="mainContent"],
              div[class*="dashboardContainer"] {
                margin: 0 !important;
                margin-left: 0 !important;
                padding: 0 !important;
                width: 297mm !important;
                height: 210mm !important;
                max-width: 297mm !important;
                max-height: 210mm !important;
                overflow: hidden !important;
                border: none !important;
                box-shadow: none !important;
                background: transparent !important;
              }
            }
          `,
        }}
      />
      <div className={styles.toolbar}>
        <div>
          <h1>Certificate Preview</h1>
          <p>
            Credential ID: <strong>{certCode}</strong> • Official Accredited Credential
          </p>
        </div>
        <div className={styles.actions} style={{ flexWrap: "wrap" }}>
          <Link href="/certificates" className={styles.secondary} style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            <span>Back</span>
          </Link>
          <a
            href={verifyUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.secondary}
            title="Open public verification page"
            style={{ display: "inline-flex", alignItems: "center", gap: "0.45rem" }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
            <span>Verify Online ↗</span>
          </a>
          <a
            href={linkedInUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.secondary}
            title="Add credential to LinkedIn Profile"
            style={{ display: "inline-flex", alignItems: "center", gap: "0.45rem", color: "#0a66c2", borderColor: "#0a66c2" }}
          >
            <span>Add to LinkedIn ↗</span>
          </a>
          <button
            type="button"
            className={styles.secondary}
            onClick={handleDownloadPdf}
            title="Download official generated PDF"
            style={{ display: "inline-flex", alignItems: "center", gap: "0.45rem" }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
              <line x1="12" y1="18" x2="12" y2="12"></line>
              <line x1="9" y1="15" x2="15" y2="15"></line>
            </svg>
            <span>Official PDF</span>
          </button>
          <button type="button" className={styles.primary} onClick={() => window.print()} style={{ display: "inline-flex", alignItems: "center", gap: "0.45rem" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="6 9 6 2 18 2 18 9" />
              <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
              <rect x="6" y="14" width="12" height="8" />
            </svg>
            <span>Print / Save PDF</span>
          </button>
        </div>
      </div>
      <Certificate {...details} />
    </>
  );
}
