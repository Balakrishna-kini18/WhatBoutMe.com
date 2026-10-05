"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Certificate, { type CertificateDetails } from "../Certificate";
import styles from "../Certificate.module.css";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

/** A learner's issued certificate, ready to print or save as a PDF. */
export default function CertificatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [details, setDetails] = useState<CertificateDetails | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "missing" | "error">("loading");

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
    // /certificates/mine only returns approved certificates
    Promise.all([load("/auth/me"), load("/certificates/mine")])
      .then(([profile, certificates]) => {
        const found = Array.isArray(certificates) ? certificates.find((c: { id: string }) => c.id === id) : null;
        if (!found) return setState("missing");
        setDetails({
          name: profile.name || profile.email,
          course: found.enrolment?.batch?.program?.title ?? "",
          issuedAt: found.issuedAt,
          number: found.certificateNumber,
        });
        setState("ready");
      })
      .catch(() => setState("error"));
  }, [id, router]);

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

  return (
    <>
      <div className={styles.toolbar}>
        <div>
          <h1>Your Certificate</h1>
          <p>Choose &quot;Save as PDF&quot; in the print dialog to download it.</p>
        </div>
        <div className={styles.actions}>
          <Link href="/certificates" className={styles.secondary}>Back</Link>
          <button type="button" className={styles.primary} onClick={() => window.print()}>
            Print or Save PDF
          </button>
        </div>
      </div>
      <Certificate {...details} />
    </>
  );
}
