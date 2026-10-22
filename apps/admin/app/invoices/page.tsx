"use client";

import { useEffect, useState, FormEvent } from "react";
import {
  API_URL,
  errorMessage,
  cachedFetch,
  issueSequentialFzeInvoice,
  resendInvoice,
  type SupportedCurrency,
} from "../lib/api";
import { CustomSelect, useToast, TableSkeleton, EmptyState } from "../components";
import styles from "../page.module.css";

interface Invoice {
  id: string;
  invoiceNumber: string;
  client: string;
  clientEmail?: string | null;
  amount: string;
  numericAmount?: number;
  currency?: string;
  status: string;
  pdfUrl?: string | null;
  creditNoteId?: string | null;
  date: string;
}

interface EnrolmentItem {
  id: string;
  user?: { name: string; email: string };
  program?: { title: string; price?: number };
  batch?: { name: string };
}

export default function InvoicesPage() {
  const { success: toastSuccess, warning: toastWarning } = useToast();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Create Invoice Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [enrolments, setEnrolments] = useState<EnrolmentItem[]>([]);
  const [selectedEnrolmentId, setSelectedEnrolmentId] = useState("");
  const [currency, setCurrency] = useState<SupportedCurrency>("USD");
  const [amount, setAmount] = useState("199");
  const [status, setStatus] = useState("PAID");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    fetchInvoices(controller.signal);
    return () => controller.abort();
  }, []);

  const fetchInvoices = async (signal?: AbortSignal) => {
    setIsLoading(true);
    setFetchError(null);
    try {
      const res = await cachedFetch(`${API_URL}/invoices`, { signal });
      if (res.ok) {
        const data = await res.json();
        setInvoices(data);
      } else {
        setFetchError(`Could not load invoices (HTTP ${res.status}).`);
      }
    } catch (e: any) {
      if (e?.name !== "AbortError") {
        console.error("Failed to fetch invoices", e);
        setFetchError("Could not reach the server. Please check your connection.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const fetchEnrolmentsForModal = async () => {
    try {
      const res = await cachedFetch(`${API_URL}/admin/enrolments?limit=100`);
      if (res.ok) {
        const data = await res.json();
        const list = Array.isArray(data) ? data : data?.data || [];
        setEnrolments(list);
        if (list.length > 0 && !selectedEnrolmentId) {
          setSelectedEnrolmentId(list[0].id);
          if (list[0].program?.price) {
            setAmount(String(list[0].program.price));
          }
        }
      }
    } catch (e) {
      console.error("Could not fetch enrolments for invoice modal", e);
    }
  };

  const openCreateModal = () => {
    setIsModalOpen(true);
    setFormError("");
    fetchEnrolmentsForModal();
  };

  const closeCreateModal = () => {
    setIsModalOpen(false);
    setFormError("");
    setIsSubmitting(false);
  };

  const handleCreateInvoice = async (e: FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    if (!selectedEnrolmentId) {
      setFormError("Please select an enrolled learner to invoice.");
      return;
    }

    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      setFormError("Please enter a valid invoice amount greater than zero.");
      return;
    }

    setIsSubmitting(true);
    setFormError("");

    const match = enrolments.find((e) => e.id === selectedEnrolmentId);
    const clientName = match?.user?.name || match?.user?.email || "Enrolled Learner";
    const clientEmail = match?.user?.email || "";

    try {
      const createdInvoice = await issueSequentialFzeInvoice({
        enrolmentId: selectedEnrolmentId,
        clientName,
        clientEmail,
        baseAmount: numAmount,
        currency,
        status: status as any,
      });

      toastSuccess(
        `Invoice ${createdInvoice.invoiceNumber} created successfully.`,
        "Invoice Created"
      );
      closeCreateModal();
      fetchInvoices();
    } catch (err: any) {
      console.error("Invoice creation error", err);
      setFormError(err?.message || "Could not reach the server. Check that the API is running.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDownloadPdf = (inv: Invoice) => {
    // Open the direct PDF stream or pre-stored cloud PDF URL
    const url = inv.pdfUrl || `${API_URL}/invoices/${inv.id}/pdf`;
    window.open(url, "_blank");
  };

  const handleResendInvoice = async (inv: Invoice) => {
    try {
      const res = await resendInvoice(inv.id);
      if (res.success) {
        toastSuccess(`Invoice ${inv.invoiceNumber} resent to ${inv.clientEmail || inv.client}.`, "Invoice Resent");
      } else {
        toastWarning(res.message || "Failed to resend invoice.", "Resend Error");
      }
    } catch {
      toastWarning("Unable to connect to invoice mail service.", "Network Error");
    }
  };

  return (
    <div className={styles.dashboard}>
      <header className={styles.header}>
        <div className={styles.headerText}>
          <h1 className={styles.title}>Invoices</h1>
          <p className={styles.subtitle}>Manage auto-generated and manual invoices.</p>
        </div>
        <div className={styles.headerActions}>
          <button className={styles.primaryBtn} onClick={openCreateModal}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            <span>Create Invoice</span>
          </button>
        </div>
      </header>

      <section className={styles.tableSection}>
        <div className={styles.sectionHeader}>
          <h2>All Invoices ({invoices.length})</h2>
        </div>
        
        <div className={styles.tableWrapper}>
          <table className={styles.adminTable}>
            <thead>
              <tr>
                <th>Invoice No.</th>
                <th>Billed To</th>
                <th>Amount</th>
                <th>Date Issued</th>
                <th>Status</th>
                <th className={styles.alignRight}>Action</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <TableSkeleton columns={6} rows={5} />
              ) : fetchError ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: "center", padding: "28px", color: "var(--status-error, #dc2626)" }}>
                    <p style={{ margin: "0 0 12px" }}>{fetchError}</p>
                    <button type="button" className={styles.secondaryBtn} onClick={() => fetchInvoices()}>
                      Retry
                    </button>
                  </td>
                </tr>
              ) : invoices.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: "1rem" }}>
                    <EmptyState
                      title="No invoices found"
                      description="Official WhatBoutMe FZE automated PDF invoices generated upon course enrolment or event checkout will appear here."
                      actionLabel="Create New Invoice"
                      onAction={openCreateModal}
                    />
                  </td>
                </tr>
              ) : invoices.map((inv) => {
                const curr = (inv.currency || "USD").toUpperCase();
                const sym = curr === "INR" ? "₹" : curr === "AED" ? "AED" : "$";
                const displayAmount =
                  inv.amount && typeof inv.amount === "string" && (inv.amount.includes("$") || inv.amount.includes("₹") || inv.amount.includes("AED"))
                    ? inv.amount
                    : `${sym} ${Number(inv.numericAmount ?? parseFloat(inv.amount) ?? 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

                return (
                  <tr key={inv.id}>
                    <td><span className={styles.cellText} style={{ fontWeight: 600 }}>{inv.invoiceNumber}</span></td>
                    <td><span className={styles.cellUserName}>{inv.client}</span></td>
                    <td><span className={styles.cellText} style={{ fontWeight: 600 }}>{displayAmount}</span></td>
                    <td><span className={styles.cellTextMuted}>{inv.date}</span></td>
                    <td>
                      <span className={`${styles.statusChip} ${inv.status?.toLowerCase() === 'paid' ? styles.completed : styles.pending}`}>
                        {inv.status}
                      </span>
                    </td>
                    <td className={styles.alignRight}>
                      <div style={{ display: "inline-flex", gap: "6px" }}>
                        <button
                          type="button"
                          className={styles.iconActionBtn}
                          title="View / Download PDF Invoice"
                          aria-label="Download invoice PDF"
                          onClick={() => handleDownloadPdf(inv)}
                        >
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                            <polyline points="14 2 14 8 20 8"></polyline>
                            <line x1="16" y1="13" x2="8" y2="13"></line>
                            <line x1="16" y1="17" x2="8" y2="17"></line>
                            <polyline points="10 9 9 9 8 9"></polyline>
                          </svg>
                        </button>
                        <button
                          type="button"
                          className={styles.iconActionBtn}
                          title={`Resend invoice to ${inv.clientEmail || inv.client}`}
                          aria-label="Resend invoice email"
                          onClick={() => handleResendInvoice(inv)}
                        >
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <line x1="22" y1="2" x2="11" y2="13"></line>
                            <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Create Invoice Modal */}
      {isModalOpen && (
        <div className={styles.modalOverlay} onClick={closeCreateModal}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2>Create Manual Invoice</h2>
              <button type="button" className={styles.closeBtn} onClick={closeCreateModal}>
                ×
              </button>
            </div>

            <form className={styles.modalForm} onSubmit={handleCreateInvoice}>
              <div className={styles.modalBody}>
                {formError && (
                  <div
                    style={{
                      padding: "10px 14px",
                      background: "rgba(220, 38, 38, 0.08)",
                      border: "1px solid rgba(220, 38, 38, 0.3)",
                      borderRadius: "8px",
                      color: "#dc2626",
                      fontSize: "0.88rem",
                      marginBottom: "1rem",
                    }}
                    role="alert"
                  >
                    {formError}
                  </div>
                )}

                <div className={styles.formGroup}>
                  <label>Select Learner Enrolment</label>
                  {enrolments.length === 0 ? (
                    <p style={{ fontSize: "0.88rem", color: "var(--text-muted)" }}>
                      Loading active enrolments...
                    </p>
                  ) : (
                    <CustomSelect
                      value={selectedEnrolmentId}
                      onChange={(val) => {
                        setSelectedEnrolmentId(val);
                        const match = enrolments.find((e) => e.id === val);
                        if (match?.program?.price) {
                          setAmount(String(match.program.price));
                        }
                      }}
                      fullWidth
                      ariaLabel="Select learner enrolment"
                      options={enrolments.map((e) => ({
                        value: e.id,
                        label: `${e.user?.name || e.user?.email || "Learner"} — ${e.program?.title || "Program"} (${e.batch?.name || "Batch"})`,
                      }))}
                    />
                  )}
                </div>

                <div className={styles.formRow}>
                  <div className={styles.formGroup}>
                    <label>Currency</label>
                    <CustomSelect
                      value={currency}
                      onChange={(val) => setCurrency(val as "USD" | "AED" | "INR")}
                      fullWidth
                      ariaLabel="Invoice currency"
                      options={[
                        { value: "USD", label: "USD ($) — International" },
                        { value: "AED", label: "AED (AED) — UAE (VAT 5%)" },
                        { value: "INR", label: "INR (₹) — India (GST 18%)" },
                      ]}
                    />
                  </div>

                  <div className={styles.formGroup}>
                    <label>Amount ({currency})</label>
                    <input
                      type="number"
                      min="1"
                      step="0.01"
                      required
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder={currency === "INR" ? "14999" : currency === "AED" ? "749" : "199"}
                    />
                  </div>

                  <div className={styles.formGroup}>
                    <label>Invoice Status</label>
                    <CustomSelect
                      value={status}
                      onChange={setStatus}
                      fullWidth
                      ariaLabel="Invoice status"
                      options={[
                        { value: "PAID", label: "Paid (Recognized Revenue)" },
                        { value: "ISSUED", label: "Issued (Unpaid / Pending)" },
                      ]}
                    />
                  </div>
                </div>
              </div>

              <div className={styles.modalFooter}>
                <button
                  type="button"
                  className={styles.secondaryBtn}
                  onClick={closeCreateModal}
                  disabled={isSubmitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={styles.primaryBtn}
                  disabled={isSubmitting || enrolments.length === 0}
                  style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
                >
                  {isSubmitting && <span className="spinner" />}
                  <span>{isSubmitting ? "Creating Invoice..." : "Create Invoice"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
