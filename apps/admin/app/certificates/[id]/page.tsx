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

function CertificateSkeleton() {
  return (
    <div style={{ maxWidth: "1100px", margin: "0 auto", padding: "0 1rem" }}>
      {/* Top Toolbar Skeleton */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "1.5rem",
          padding: "0.25rem 0",
        }}
      >
        <div
          className="skeleton"
          style={{ width: "230px", height: "38px", borderRadius: "8px" }}
        />
        <div
          className="skeleton"
          style={{ width: "140px", height: "38px", borderRadius: "8px" }}
        />
      </div>

      {/* A4 Landscape Certificate Canvas Skeleton */}
      <div
        style={{
          width: "100%",
          maxWidth: "1100px",
          aspectRatio: "297 / 210",
          margin: "0 auto",
          borderRadius: "8px",
          border: "2px solid rgba(184, 134, 11, 0.22)",
          backgroundColor: "#fdfbf7",
          boxShadow: "0 10px 30px rgba(0,0,0,0.06)",
          position: "relative",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "5%",
          boxSizing: "border-box",
        }}
      >
        {/* Left gold ribbon placeholder */}
        <div
          className="skeleton"
          style={{
            position: "absolute",
            top: "3%",
            bottom: "3%",
            left: "4%",
            width: "3.5%",
            borderRadius: "2px",
            opacity: 0.65,
          }}
        />

        {/* Top Header & Rosette */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginLeft: "6%" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <div className="skeleton" style={{ width: "160px", height: "24px", borderRadius: "4px" }} />
            <div className="skeleton" style={{ width: "120px", height: "12px", borderRadius: "3px" }} />
          </div>
          <div
            className="skeleton"
            style={{
              width: "72px",
              height: "72px",
              borderRadius: "50%",
              opacity: 0.8,
            }}
          />
        </div>

        {/* Center Recipient & Course */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "14px",
            margin: "auto 0",
            marginLeft: "6%",
          }}
        >
          <div className="skeleton" style={{ width: "180px", height: "12px", borderRadius: "3px" }} />
          <div className="skeleton" style={{ width: "340px", height: "36px", borderRadius: "6px" }} />
          <div className="skeleton" style={{ width: "240px", height: "14px", borderRadius: "4px" }} />
          <div className="skeleton" style={{ width: "420px", height: "24px", borderRadius: "5px" }} />
          <div className="skeleton" style={{ width: "380px", height: "12px", borderRadius: "3px", marginTop: "4px" }} />
        </div>

        {/* Bottom Signatures & QR Seal */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
            marginLeft: "6%",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <div className="skeleton" style={{ width: "140px", height: "32px", borderRadius: "4px" }} />
            <div className="skeleton" style={{ width: "120px", height: "12px", borderRadius: "3px" }} />
            <div className="skeleton" style={{ width: "90px", height: "10px", borderRadius: "3px" }} />
          </div>

          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "6px" }}>
            <div
              className="skeleton"
              style={{ width: "64px", height: "64px", borderRadius: "6px" }}
            />
            <div className="skeleton" style={{ width: "80px", height: "8px", borderRadius: "2px" }} />
          </div>
        </div>
      </div>
    </div>
  );
}

/** A learner's certificate as the learner sees it, for checking and printing. */
export default function CertificatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [details, setDetails] = useState<CertificateDetails | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "missing" | "error">("loading");
  const [downloadingPdf, setDownloadingPdf] = useState(false);

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

  if (state === "loading") {
    return <CertificateSkeleton />;
  }

  if (state !== "ready" || !details) {
    return (
      <div style={{ maxWidth: "600px", margin: "3rem auto", textAlign: "center", padding: "2rem" }}>
        <p className={styles.message} role="alert" style={{ marginBottom: "1rem" }}>
          {state === "missing" && "This certificate could not be found."}
          {state === "error" && "The certificate could not be loaded. Check that the API is running."}
        </p>
        <Link
          href="/approvals?tab=certs"
          className={styles.secondary}
          style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem", textDecoration: "none" }}
        >
          &larr; Back to Approvals &amp; Gates
        </Link>
      </div>
    );
  }

  const certCode = details.number || id;

  const handleDownloadPdf = async () => {
    setDownloadingPdf(true);
    try {
      const res = await fetch(`${API_URL}/certificates/${id}/pdf`);
      if (res.ok) {
        const data = await res.json();
        if (data.downloadUrl || data.pdfUrl) {
          const downloadLink = document.createElement("a");
          downloadLink.href = data.downloadUrl || data.pdfUrl;
          downloadLink.target = "_blank";
          downloadLink.rel = "noopener noreferrer";
          downloadLink.download = `certificate-${certCode}.pdf`;
          document.body.appendChild(downloadLink);
          downloadLink.click();
          document.body.removeChild(downloadLink);
          return;
        }
      }
      window.print();
    } catch {
      window.print();
    } finally {
      setDownloadingPdf(false);
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
      <div
        className={styles.toolbar}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "1.5rem",
          padding: "0.25rem 0",
        }}
      >
        <Link
          href="/approvals?tab=certs"
          className={styles.secondary}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.5rem",
            textDecoration: "none",
            fontWeight: 600,
            fontSize: "0.875rem",
            color: "var(--text-primary, #14110f)",
            border: "1px solid var(--border-light, #e2e8f0)",
            background: "#ffffff",
            padding: "0.5rem 1rem",
            borderRadius: "8px",
            boxShadow: "0 1px 2px rgba(0,0,0,0.03)",
          }}
        >
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <polyline points="15 18 9 12 15 6" />
          </svg>
          <span>Back to Approvals &amp; Gates</span>
        </Link>

        <button
          type="button"
          className={styles.primary}
          onClick={handleDownloadPdf}
          disabled={downloadingPdf}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.5rem",
            fontWeight: 600,
            fontSize: "0.875rem",
            padding: "0.5rem 1.25rem",
            borderRadius: "8px",
            cursor: "pointer",
          }}
          title="Download Certificate PDF"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          <span>{downloadingPdf ? "Downloading..." : "Download PDF"}</span>
        </button>
      </div>
      <Certificate {...details} showLinkedInShare={false} />
    </>
  );
}
