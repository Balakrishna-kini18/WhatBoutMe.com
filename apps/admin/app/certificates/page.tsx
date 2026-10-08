"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { API_URL, errorMessage } from "../lib/api";
import styles from "../page.module.css";

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
          <Link href="/certificates/issue" className={styles.primaryBtn} style={{ textDecoration: "none" }}>Issue Certificates</Link>
        </div>
      </header>

      {notice && (
        <p role="alert" style={{ margin: "0 0 1.5rem", padding: "0.75rem 1rem", borderRadius: "8px", fontSize: "0.9rem", background: "var(--status-error-bg)", color: "var(--status-error)" }}>{notice}</p>
      )}

      <section className={styles.tableSection}>
        <div className={styles.tableWrapper}>
          <table className={styles.adminTable}>
            <thead>
              <tr>
                <th>Learner</th>
                <th>Program & Batch</th>
                <th>Request Date</th>
                <th>Status</th>
                <th className={styles.alignRight}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={5} style={{textAlign: "center", padding: "20px"}}>Loading queue...</td>
                </tr>
              ) : certificates.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{textAlign: "center", padding: "20px"}}>No pending certificate requests.</td>
                </tr>
              ) : certificates.map((cert) => (
                <tr key={cert.id}>
                  <td>
                    <span className={styles.cellUserName}>{cert.enrolment?.user?.name || 'Unknown'}</span>
                    <br/>
                    <span className={styles.cellTextMuted} style={{fontSize: '0.8rem'}}>{cert.enrolment?.user?.email}</span>
                  </td>
                  <td>
                    <span className={styles.cellText}>{cert.enrolment?.batch?.program?.title}</span>
                    <br/>
                    <span className={styles.cellTextMuted} style={{fontSize: '0.8rem'}}>{cert.enrolment?.batch?.name}</span>
                  </td>
                  <td><span className={styles.cellTextMuted}>{new Date(cert.createdAt).toLocaleDateString()}</span></td>
                  <td>
                    <span className={`${styles.statusChip} ${styles[cert.status.toLowerCase()] || ''}`}>
                      {cert.status}
                    </span>
                    {cert.certificateCode && (
                      <div style={{ marginTop: '4px' }}>
                        <code style={{ fontSize: '0.75rem', color: 'var(--text-muted, #64748b)' }}>
                          {cert.certificateCode}
                        </code>
                      </div>
                    )}
                  </td>
                  <td className={styles.alignRight}>
                    {cert.status === 'PENDING' && (
                      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                        <button className={styles.primaryBtn} style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }} onClick={() => handleAction(cert.id, 'approve')}>Approve</button>
                        <button className={styles.secondaryBtn} style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', color: 'red', borderColor: 'red' }} onClick={() => handleAction(cert.id, 'reject')}>Reject</button>
                      </div>
                    )}
                    {cert.status === 'APPROVED' && (
                      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                        <button className={styles.primaryBtn} style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', background: '#059669', borderColor: '#059669' }} onClick={() => handleAction(cert.id, 'issue')}>
                          Issue Certificate
                        </button>
                        <Link href={`/certificates/${cert.id}`} className={styles.secondaryBtn} style={{ textDecoration: 'none', padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}>
                          Preview
                        </Link>
                      </div>
                    )}
                    {cert.status === 'ISSUED' && (
                      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', alignItems: 'center' }}>
                        <button
                          className={styles.primaryBtn}
                          style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
                          onClick={() => handleDownloadPdf(cert.id, cert.pdfUrl)}
                          title="Download official generated PDF"
                        >
                          Official PDF ↗
                        </button>
                        <Link href={`/certificates/${cert.id}`} className={styles.secondaryBtn} style={{ textDecoration: 'none', padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}>
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
