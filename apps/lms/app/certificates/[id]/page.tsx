"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { type CertificateDetails } from "../Certificate";
import styles from "../Certificate.module.css";

const Certificate = dynamic(() => import("../Certificate"), {
  ssr: false,
  loading: () => (
    <div style={{ padding: "40px", textAlign: "center", color: "var(--text-muted)" }}>
      Loading certificate...
    </div>
  ),
});

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

interface ExtendedCertDetails extends CertificateDetails {
  id: string;
  code?: string;
  pdfUrl?: string | null;
}

/** A learner's issued certificate, ready to print, download official PDF, or verify. */
export default function CertificatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [details, setDetails] = useState<ExtendedCertDetails | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "missing" | "error">("loading");
  const [downloading, setDownloading] = useState(false);
  const [notice, setNotice] = useState<{
    title: string;
    message: string;
    showModal: boolean;
  } | null>(null);

  // Close modal on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && notice?.showModal) {
        setNotice((prev) => (prev ? { ...prev, showModal: false } : null));
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [notice?.showModal]);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      router.push("/login");
      return;
    }
    const headers = { Authorization: `Bearer ${token}` };
    const load = (path: string) =>
      fetch(`${API_URL}${path}`, { headers }).then((res) => {
        if (!res.ok) throw new Error();
        return res.json();
      });

    Promise.all([load("/auth/me"), load("/certificates/mine")])
      .then(([profile, certificates]) => {
        const found = Array.isArray(certificates) ? certificates.find((c: { id: string }) => c.id === id) : null;
        if (!found) return setState("missing");
        setDetails({
          id: found.id,
          code: found.certificateCode || found.certificateNumber,
          pdfUrl: found.pdfUrl,
          name: profile.name || profile.email,
          course: found.enrolment?.batch?.program?.title ?? "",
          issuedAt: found.issuedAt,
          number: found.certificateCode || found.certificateNumber,
        });
        setState("ready");
      })
      .catch(() => setState("error"));
  }, [id, router]);

  const handleDownloadOfficialPdf = async () => {
    setDownloading(true);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_URL}/certificates/${id}/pdf`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        const data = await res.json();
        const targetUrl = data.downloadUrl || data.pdfUrl;
        if (targetUrl) {
          window.open(targetUrl, "_blank");
          return;
        }
      }
      if (details?.pdfUrl) {
        window.open(details.pdfUrl, "_blank");
      } else {
        setNotice({
          title: "Official Signed PDF Being Prepared",
          message:
            "The official signed PDF is currently being prepared. You can print or save via the Print button.",
          showModal: true,
        });
      }
    } catch (err) {
      console.error(err);
      if (details?.pdfUrl) {
        window.open(details.pdfUrl, "_blank");
      } else {
        setNotice({
          title: "Official Signed PDF Being Prepared",
          message:
            "The official signed PDF is currently being prepared. You can print or save via the Print button.",
          showModal: true,
        });
      }
    } finally {
      setDownloading(false);
    }
  };

  if (state !== "ready" || !details) {
    return (
      <p className={styles.message} role={state === "loading" ? "status" : "alert"}>
        {state === "loading" && "Loading your certificate..."}
        {state === "missing" && "This certificate is not available yet. It appears here once it has been approved."}
        {state === "error" && "We could not load the certificate. Please try again in a moment."}{" "}
        {state !== "loading" && <Link href="/certificates">Back to certificates</Link>}
      </p>
    );
  }

  const certCode = details.code || details.number || id;
  const marketingBase = process.env.NEXT_PUBLIC_MARKETING_URL || "http://localhost:3000";
  const verifyUrl = `${marketingBase}/verify/${certCode}`;
  const issueDateObj = details.issuedAt ? new Date(details.issuedAt) : new Date();
  const linkedInUrl = `https://www.linkedin.com/profile/add?startTask=CERTIFICATION_NAME&name=${encodeURIComponent(
    `${details.course} Certification`,
  )}&organizationName=whatboutme&issueYear=${issueDateObj.getFullYear()}&issueMonth=${issueDateObj.getMonth() + 1}&certUrl=${encodeURIComponent(
    verifyUrl,
  )}&certId=${encodeURIComponent(certCode)}`;

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
              [class*="LmsSidebar"],
              [class*="PushNotification"],
              [class*="toolbar"],
              [class*="noticeBanner"],
              [class*="modalOverlay"],
              [class*="linkedinShareWrap"] {
                display: none !important;
              }
              body > div[class*="appContainer"],
              div[class*="appContainer"] > main[class*="mainContent"] {
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
                display: block !important;
              }
            }
          `,
        }}
      />
      <div className={styles.toolbar}>
        <div>
          <h1>Your Certificate</h1>
          <p>
            Credential Code: <strong>{certCode}</strong> • Official Accredited Credential
          </p>
        </div>
        <div className={styles.actions} style={{ flexWrap: "wrap" }}>
          <Link href="/certificates" className={styles.secondary}>
            Back
          </Link>
          <button
            type="button"
            className={styles.primary}
            onClick={handleDownloadOfficialPdf}
            disabled={downloading}
            title="Download cryptographically generated official PDF"
          >
            {downloading ? "Preparing PDF..." : "Official PDF ↗"}
          </button>
          <a
            href={linkedInUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.secondary}
            style={{ color: "#0a66c2", borderColor: "#0a66c2" }}
            title="Add credential to your LinkedIn profile"
          >
            Add to LinkedIn ↗
          </a>
          <a
            href={verifyUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.secondary}
            title="Open public verification page"
          >
            Verify Online ↗
          </a>
          <button type="button" className={styles.secondary} onClick={() => window.print()}>
            Print / Browser Save
          </button>
        </div>
      </div>

      {/* In-Page PDF Preparation Banner */}
      {notice && (
        <div role="status" className={styles.noticeBanner}>
          <div className={styles.noticeContent}>
            <div className={styles.noticeIconWrap} aria-hidden="true">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
            <div className={styles.noticeTextGroup}>
              <strong className={styles.noticeTitle}>{notice.title}</strong>
              <p className={styles.noticeText}>{notice.message}</p>
            </div>
          </div>
          <div className={styles.noticeActions}>
            <button
              type="button"
              className={styles.noticePrintBtn}
              onClick={() => window.print()}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="6 9 6 2 18 2 18 9" />
                <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                <rect x="6" y="14" width="12" height="8" />
              </svg>
              <span>Print / Browser Save</span>
            </button>
            <button
              type="button"
              className={styles.noticeCloseBtn}
              onClick={() => setNotice(null)}
              aria-label="Dismiss notice"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* In-Page Modal Dialog replacing browser alert */}
      {notice?.showModal && (
        <div
          className={styles.modalOverlay}
          onClick={() => setNotice((prev) => (prev ? { ...prev, showModal: false } : null))}
          role="dialog"
          aria-modal="true"
          aria-labelledby="pdf-notice-modal-title"
        >
          <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div className={styles.modalIconWrap} aria-hidden="true">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="12" y1="18" x2="12" y2="12" />
                  <line x1="9" y1="15" x2="15" y2="15" />
                </svg>
              </div>
              <button
                type="button"
                className={styles.modalCloseBtn}
                onClick={() => setNotice((prev) => (prev ? { ...prev, showModal: false } : null))}
                aria-label="Close dialog"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <h3 id="pdf-notice-modal-title" className={styles.modalTitle}>
              {notice.title}
            </h3>
            <p className={styles.modalBody}>
              {notice.message}
            </p>

            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.modalSecondaryBtn}
                onClick={() => setNotice((prev) => (prev ? { ...prev, showModal: false } : null))}
              >
                Dismiss
              </button>
              <button
                type="button"
                className={styles.modalPrimaryBtn}
                onClick={() => {
                  setNotice((prev) => (prev ? { ...prev, showModal: false } : null));
                  window.print();
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <polyline points="6 9 6 2 18 2 18 9" />
                  <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                  <rect x="6" y="14" width="12" height="8" />
                </svg>
                <span>Print / Save Now</span>
              </button>
            </div>
          </div>
        </div>
      )}

      <Certificate {...details} />
    </>
  );
}
