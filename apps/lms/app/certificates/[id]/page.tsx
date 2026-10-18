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
        alert("The official signed PDF is currently being prepared. You can print or save via the Print button.");
      }
    } catch (err) {
      console.error(err);
      if (details?.pdfUrl) {
        window.open(details.pdfUrl, "_blank");
      } else {
        alert("Unable to download official PDF at this time.");
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
      <Certificate {...details} />
    </>
  );
}
