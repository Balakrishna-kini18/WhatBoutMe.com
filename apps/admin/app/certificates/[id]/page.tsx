"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import Certificate, { type CertificateDetails } from "../Certificate";
import styles from "../Certificate.module.css";
import { API_URL } from "../../lib/api";

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

  return (
    <>
      <div className={styles.toolbar}>
        <div>
          <h1>Certificate</h1>
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
