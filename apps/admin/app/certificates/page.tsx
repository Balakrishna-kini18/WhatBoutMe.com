"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { API_URL, errorMessage } from "../lib/api";
import styles from "../page.module.css";
import { StatusBadge } from "../components";

export default function CertificatesQueue() {
  const [certificates, setCertificates] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchCertificates();
  }, []);

  const [notice, setNotice] = useState("");

  const fetchCertificates = async () => {
    setIsLoading(true);
    try {
      // the AuthProvider adds the sign-in token; this page used to send its
      // own from a storage key that does not exist, so the list never loaded
      const res = await fetch(`${API_URL}/certificates`);
      if (res.ok) {
        setCertificates(await res.json());
      } else {
        setNotice(await errorMessage(res, "Could not load the certificates"));
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAction = async (id: string, action: 'approve' | 'reject' | 'issue') => {
    try {
      setNotice("");
      const res = await fetch(`${API_URL}/certificates/${id}/${action}`, { method: 'POST' });
      if (res.ok) {
        fetchCertificates(); // Refresh queue
      } else {
        setNotice(await errorMessage(res, `Could not ${action} the certificate`));
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleDownloadPdf = async (certId: string, directUrl?: string) => {
    try {
      const res = await fetch(`${API_URL}/certificates/${certId}/pdf`);
      if (res.ok) {
        const data = await res.json();
        if (data.downloadUrl || data.pdfUrl) {
          window.open(data.downloadUrl || data.pdfUrl, '_blank');
          return;
        }
      }
      if (directUrl) {
        window.open(directUrl, '_blank');
      } else {
        alert("Official PDF is still being generated or is unavailable.");
      }
    } catch (e) {
      console.error(e);
      if (directUrl) window.open(directUrl, '_blank');
    }
  };

  return (
    <div className={styles.dashboard}>
      <header className={styles.header}>
        <div className={styles.headerText}>
          <h1 className={styles.title}>Certificate Approval Queue</h1>
          <p className={styles.subtitle}>Review and approve pending certificate requests from learners.</p>
        </div>
        <div className={styles.headerActions}>
          <Link href="/certificates/issue" className={styles.primaryBtn}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="8" r="6" />
              <path d="M15.4 13.8L18 22l-6-3-6 3 2.6-8.2" />
            </svg>
            <span>Issue Certificates</span>
          </Link>
        </div>
      </header>

      {notice && (
        <div role="alert" style={{ margin: "0 0 1.5rem", padding: "0.75rem 1rem", borderRadius: "8px", fontSize: "0.88rem", background: "var(--status-error-bg)", color: "var(--status-error)", border: "1px solid #fecdd3" }}>
          {notice}
        </div>
      )}

      <section className={styles.tableSection}>
        <div className={styles.sectionHeader}>
          <h2>Approval Queue ({certificates.length})</h2>
        </div>
        <div className={styles.tableWrapper}>
          <table className={styles.adminTable}>
            <thead>
              <tr>
                <th>Learner</th>
                <th>Program &amp; Batch</th>
                <th>Request Date</th>
                <th>Status</th>
                <th className={styles.alignRight}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: "center", padding: "28px", color: "var(--text-muted)" }}>Loading queue...</td>
                </tr>
              ) : certificates.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: "center", padding: "28px", color: "var(--text-muted)" }}>No pending certificate requests.</td>
                </tr>
              ) : certificates.map((cert) => (
                <tr key={cert.id}>
                  <td>
                    <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                      <span style={{ fontWeight: 600, color: "var(--text-primary)", fontSize: "0.875rem", lineHeight: 1.35 }}>
                        {cert.enrolment?.user?.name || "Unknown Learner"}
                      </span>
                      {cert.enrolment?.user?.email && (
                        <span style={{ fontSize: "0.8rem", color: "var(--text-muted)", lineHeight: 1.35 }}>
                          {cert.enrolment.user.email}
                        </span>
                      )}
                    </div>
                  </td>
                  <td>
                    {(() => {
                      const programTitle = cert.enrolment?.batch?.program?.title || cert.enrolment?.program?.title;
                      const batchName = cert.enrolment?.batch?.name;

                      return (
                        <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                          <span style={{ fontWeight: 600, color: "var(--text-primary)", fontSize: "0.875rem", lineHeight: 1.35 }}>
                            {programTitle || (batchName ? `Program for ${batchName}` : "Curriculum Program")}
                          </span>
                          {batchName ? (
                            <span style={{ fontSize: "0.8rem", color: "var(--text-muted)", lineHeight: 1.35 }}>
                              Batch: {batchName}
                            </span>
                          ) : (
                            <span style={{ fontSize: "0.8rem", color: "var(--text-muted)", fontStyle: "italic", lineHeight: 1.35 }}>
                              No batch assigned
                            </span>
                          )}
                        </div>
                      );
                    })()}
                  </td>
                  <td><span className={styles.cellTextMuted}>{new Date(cert.createdAt).toLocaleDateString()}</span></td>
                  <td>
                    <StatusBadge status={cert.status} />
                    {cert.certificateCode && (
                      <div style={{ marginTop: '4px' }}>
                        <code style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          {cert.certificateCode}
                        </code>
                      </div>
                    )}
                  </td>
                  <td className={styles.alignRight}>
                    {cert.status === 'PENDING' && (
                      <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                        <button type="button" className={styles.primaryBtnSmall} onClick={() => handleAction(cert.id, 'approve')}>Approve</button>
                        <button type="button" className={styles.dangerBtnSmall} onClick={() => handleAction(cert.id, 'reject')}>Reject</button>
                      </div>
                    )}
                    {cert.status === 'APPROVED' && (
                      <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', alignItems: 'center' }}>
                        <button type="button" className={styles.successBtnSmall} onClick={() => handleAction(cert.id, 'issue')}>
                          Issue Certificate
                        </button>
                        <Link href={`/certificates/${cert.id}`} className={styles.secondaryBtnSmall}>
                          Preview
                        </Link>
                      </div>
                    )}
                    {cert.status === 'ISSUED' && (
                      <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', alignItems: 'center' }}>
                        <button
                          type="button"
                          className={styles.secondaryBtnSmall}
                          onClick={() => handleDownloadPdf(cert.id, cert.pdfUrl)}
                          title="Download official generated PDF"
                          aria-label="Download official PDF"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ marginRight: "3px" }}>
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                            <polyline points="14 2 14 8 20 8"></polyline>
                            <line x1="12" y1="18" x2="12" y2="12"></line>
                            <line x1="9" y1="15" x2="15" y2="15"></line>
                          </svg>
                          <span>PDF</span>
                        </button>
                        <a
                          href={`${process.env.NEXT_PUBLIC_MARKETING_URL || "http://localhost:3000"}/verify/${cert.certificateCode || cert.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={styles.secondaryBtnSmall}
                          title="Open public verification page"
                        >
                          Verify ↗
                        </a>
                        <a
                          href={`https://www.linkedin.com/profile/add?startTask=CERTIFICATION_NAME&name=${encodeURIComponent(
                            `${cert.enrolment?.batch?.program?.title || "Accredited"} Certification`
                          )}&organizationName=whatboutme&issueYear=${new Date(cert.issueDate || cert.createdAt).getFullYear()}&issueMonth=${new Date(cert.issueDate || cert.createdAt).getMonth() + 1}&certUrl=${encodeURIComponent(
                            `${process.env.NEXT_PUBLIC_MARKETING_URL || "http://localhost:3000"}/verify/${cert.certificateCode || cert.id}`
                          )}&certId=${encodeURIComponent(cert.certificateCode || cert.id)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={styles.secondaryBtnSmall}
                          style={{ color: "#0a66c2", borderColor: "#0a66c2" }}
                          title="Add to LinkedIn profile"
                        >
                          LinkedIn
                        </a>
                        <Link href={`/certificates/${cert.id}`} className={styles.secondaryBtnSmall}>
                          View
                        </Link>
                      </div>
                    )}
                    {cert.status === 'REJECTED' && (
                      <span className={styles.cellTextMuted} style={{ fontSize: '0.8rem' }}>
                        {cert.rejectionReason || 'Rejected'}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
