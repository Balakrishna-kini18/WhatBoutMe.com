"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import styles from "../page.module.css";
import { API_URL, cachedFetch } from "../lib/api";
import { CustomSelect, ActionMenu, ConfirmDialog, Modal, useToast } from "../components";

interface Lead {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  message: string | null;
  status: string;
  createdAt: string;
}

interface ProgramOption {
  id: string;
  title: string;
  price: number;
  priceUSD?: number | null;
  priceAED?: number | null;
  priceINR?: number | null;
  currency?: string | null;
  isActive?: boolean;
}

interface BatchOption {
  id: string;
  name: string;
  programId?: string;
  program?: { id: string; title: string } | string;
  status?: string;
}

const STATUSES = [
  { value: "NEW", label: "New" },
  { value: "CONTACTED", label: "Contacted" },
  { value: "CONVERTED", label: "Converted" },
  { value: "CLOSED", label: "Closed" },
];

export default function LeadsPage() {
  return (
    <Suspense fallback={null}>
      <LeadsContent />
    </Suspense>
  );
}

function LeadsContent() {
  const searchParams = useSearchParams();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [programs, setPrograms] = useState<ProgramOption[]>([]);
  const [batches, setBatches] = useState<BatchOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState("ALL");
  const toast = useToast();
  const [leadToDelete, setLeadToDelete] = useState<Lead | null>(null);
  const [isDeletingLead, setIsDeletingLead] = useState(false);

  // Conversion Workflow State
  const [leadToConvert, setLeadToConvert] = useState<Lead | null>(null);
  const [targetProgramId, setTargetProgramId] = useState("");
  const [targetBatchId, setTargetBatchId] = useState("");
  const [targetCurrency, setTargetCurrency] = useState<"USD" | "AED" | "INR">("USD");
  const [adminNote, setAdminNote] = useState("");
  const [isConverting, setIsConverting] = useState(false);
  const [conversionResult, setConversionResult] = useState<{ checkoutUrl: string; emailSent: boolean } | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  const load = async () => {
    try {
      const [leadsRes, progsRes, batchesRes] = await Promise.all([
        fetch(`${API_URL}/leads`),
        fetch(`${API_URL}/programs`).catch(() => null),
        fetch(`${API_URL}/batches`).catch(() => null),
      ]);
      if (leadsRes.ok) setLeads(await leadsRes.json());
      if (progsRes && progsRes.ok) {
        const pData = await progsRes.json();
        if (Array.isArray(pData)) setPrograms(pData);
      }
      if (batchesRes && batchesRes.ok) {
        const bData = await batchesRes.json();
        if (Array.isArray(bData)) setBatches(bData);
      }
    } catch (e) {
      console.error("Failed to load enquiries", e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  // Auto-open convert modal if navigated with ?action=convert or ?leadId= (e.g. from Meetings Page)
  useEffect(() => {
    const action = searchParams.get("action");
    const leadId = searchParams.get("leadId") || searchParams.get("convertLeadId");
    const email = searchParams.get("email");
    if ((action === "convert" || leadId) && leads.length > 0) {
      const match = leads.find(
        (l) =>
          (leadId && l.id === leadId) ||
          (email && l.email?.toLowerCase() === email.toLowerCase()),
      );
      if (match && (!leadToConvert || leadToConvert.id !== match.id)) {
        handleOpenConvertModal(match);
      }
    }
  }, [searchParams, leads]);

  const handleOpenConvertModal = (lead: Lead) => {
    setLeadToConvert(lead);
    setConversionResult(null);
    setCopiedLink(false);
    setAdminNote("");

    // Detect inquired program from lead message if available
    let preselectedProgId = "";
    if (lead.message) {
      const match = lead.message.match(/ID:\s*([a-zA-Z0-9-]+)/i);
      if (match && match[1]) {
        preselectedProgId = match[1];
      } else {
        const found = programs.find((p) =>
          lead.message!.toLowerCase().includes(p.title.toLowerCase())
        );
        if (found) preselectedProgId = found.id;
      }
    }

    if (!preselectedProgId && programs.length > 0) {
      preselectedProgId = programs[0]!.id;
    }

    setTargetProgramId(preselectedProgId);

    const prog = programs.find((p) => p.id === preselectedProgId);
    if (prog?.currency && (prog.currency === "USD" || prog.currency === "AED" || prog.currency === "INR")) {
      setTargetCurrency(prog.currency as any);
    } else {
      setTargetCurrency("USD");
    }

    // Preselect batch for this program
    const progBatches = batches.filter((b) => {
      const pId = typeof b.program === "object" && b.program !== null ? b.program.id : b.programId;
      return pId === preselectedProgId;
    });
    setTargetBatchId(progBatches.length > 0 ? progBatches[0]!.id : "");
  };

  const handleProgramChange = (progId: string) => {
    setTargetProgramId(progId);
    const prog = programs.find((p) => p.id === progId);
    if (prog?.currency && (prog.currency === "USD" || prog.currency === "AED" || prog.currency === "INR")) {
      setTargetCurrency(prog.currency as any);
    }
    const progBatches = batches.filter((b) => {
      const pId = typeof b.program === "object" && b.program !== null ? b.program.id : b.programId;
      return pId === progId;
    });
    setTargetBatchId(progBatches.length > 0 ? progBatches[0]!.id : "");
  };

  const handleExecuteConversion = async () => {
    if (!leadToConvert) return;
    setIsConverting(true);

    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
      const res = await fetch(`${API_URL}/leads/${leadToConvert.id}/convert-and-send-link`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          courseId: targetProgramId || undefined,
          batchId: targetBatchId || undefined,
          currency: targetCurrency,
          note: adminNote.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.message || "Failed to convert lead and generate payment link.");
      }

      const data = await res.json();
      setConversionResult({ checkoutUrl: data.checkoutUrl, emailSent: data.emailSent });

      // Optimistically update lead status to CONVERTED
      setLeads((all) =>
        all.map((l) => (l.id === leadToConvert.id ? { ...l, status: "CONVERTED" } : l))
      );

      // Copy link to clipboard automatically
      if (data.checkoutUrl && navigator.clipboard) {
        await navigator.clipboard.writeText(data.checkoutUrl).catch(() => {});
      }

      toast.success(
        "Lead converted! Payment link copied to clipboard and emailed to prospect."
      );
    } catch (e: any) {
      toast.error(e?.message || "Failed to convert lead.");
    } finally {
      setIsConverting(false);
    }
  };

  const setStatus = async (id: string, nextStatus: string) => {
    const previous = leads;
    // Optimistic UI update: immediately reflect new lead status
    setLeads((all) => all.map((l) => (l.id === id ? { ...l, status: nextStatus } : l)));
    try {
      const res = await fetch(`${API_URL}/leads/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      if (!res.ok) {
        // Rollback on server error
        setLeads(previous);
      }
    } catch {
      setLeads(previous);
    }
  };

  const confirmDeleteLead = async () => {
    if (!leadToDelete) return;
    const id = leadToDelete.id;
    setIsDeletingLead(true);
    const previous = leads;
    setLeads((all) => all.filter((l) => l.id !== id));
    toast.success("Enquiry removed.");
    setLeadToDelete(null);

    try {
      const res = await cachedFetch(`${API_URL}/leads/${id}`, { method: "DELETE" });
      if (!res.ok) {
        setLeads(previous);
        toast.error("Failed to delete enquiry.");
      }
    } catch {
      setLeads(previous);
      toast.error("Failed to delete enquiry.");
    } finally {
      setIsDeletingLead(false);
    }
  };

  const visible = filter === "ALL" ? leads : leads.filter((l) => l.status === filter);

  return (
    <div className={styles.dashboard}>
      <header className={styles.header}>
        <div className={styles.headerText}>
          <h1 className={styles.title}>Enquiries (CRM)</h1>
          <p className={styles.subtitle}>Messages sent from the contact form on the public website.</p>
        </div>
        <div className={styles.headerActions}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--text-secondary)" }}>Status:</span>
            <CustomSelect
              ariaLabel="Filter enquiries by status"
              value={filter}
              onChange={setFilter}
              options={[
                { value: "ALL", label: "All statuses" },
                ...STATUSES.map((s) => ({ value: s.value, label: s.label })),
              ]}
              minWidth="150px"
            />
          </div>
        </div>
      </header>

      <section className={styles.tableSection}>
        <div className={styles.sectionHeader}>
          <h2>{visible.length} {visible.length === 1 ? "Enquiry" : "Enquiries"}</h2>
        </div>
        <div className={styles.tableWrapper}>
          <table className={styles.adminTable}>
            <thead>
              <tr>
                <th>Name</th>
                <th>Contact</th>
                <th>Message</th>
                <th>Received</th>
                <th>Status</th>
                <th className={styles.alignRight}>Action</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={6} style={{ textAlign: "center", padding: "28px", color: "var(--text-muted)" }}>Loading enquiries...</td></tr>
              ) : visible.length === 0 ? (
                <tr><td colSpan={6} style={{ textAlign: "center", padding: "28px", color: "var(--text-muted)" }}>No enquiries found.</td></tr>
              ) : visible.map((lead) => (
                <tr key={lead.id}>
                  <td><span className={styles.cellUserName}>{lead.name}</span></td>
                  <td>
                    <a href={`mailto:${lead.email}`} className={styles.cellText} style={{ display: "block", color: "var(--accent-primary)", textDecoration: "none" }}>{lead.email}</a>
                    {lead.phone && <span className={styles.cellTextMuted}>{lead.phone}</span>}
                  </td>
                  <td style={{ maxWidth: "340px", whiteSpace: "normal" }}>
                    {lead.message && (lead.message.includes("Course Inquiry:") || lead.message.includes("Course:") || lead.message.includes("Discovery Call Booked:")) ? (
                      <div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", marginBottom: "4px" }}>
                          {(lead.message.includes("Course Inquiry:") || lead.message.includes("Course:")) && (
                            <span
                              style={{
                                display: "inline-block",
                                padding: "2px 8px",
                                borderRadius: "12px",
                                backgroundColor: "rgba(217, 119, 6, 0.12)",
                                color: "#b45309",
                                fontSize: "0.75rem",
                                fontWeight: 600,
                              }}
                            >
                              🎓 High-Intent Course Lead
                            </span>
                          )}
                          {lead.message.includes("Discovery Call Booked:") && (
                            <span
                              style={{
                                display: "inline-block",
                                padding: "2px 8px",
                                borderRadius: "12px",
                                backgroundColor: "rgba(16, 185, 129, 0.12)",
                                color: "#047857",
                                fontSize: "0.75rem",
                                fontWeight: 600,
                              }}
                            >
                              📅 1-on-1 Discovery Confirmed
                            </span>
                          )}
                        </div>
                        <div className={styles.cellText} style={{ lineHeight: 1.45 }}>
                          {lead.message}
                        </div>
                      </div>
                    ) : (
                      <span className={styles.cellText} style={{ lineHeight: 1.45 }}>{lead.message || "—"}</span>
                    )}
                  </td>
                  <td><span className={styles.cellTextMuted}>{new Date(lead.createdAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}</span></td>
                  <td>
                    <CustomSelect
                      size="sm"
                      ariaLabel={`Status for ${lead.name}`}
                      value={lead.status}
                      onChange={(val) => setStatus(lead.id, val)}
                      options={STATUSES.map((s) => ({ value: s.value, label: s.label }))}
                      minWidth="135px"
                    />
                  </td>
                  <td className={styles.alignRight}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "0.5rem" }}>
                      <button
                        type="button"
                        onClick={() => handleOpenConvertModal(lead)}
                        title={lead.status === "CONVERTED" ? "Resend Course Payment Link" : "Convert Lead & Send Course Payment Link"}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "0.35rem",
                          background: lead.status === "CONVERTED" ? "rgba(16, 185, 129, 0.12)" : "var(--accent-primary, #c97a1e)",
                          color: lead.status === "CONVERTED" ? "#047857" : "#ffffff",
                          border: lead.status === "CONVERTED" ? "1px solid rgba(16, 185, 129, 0.3)" : "none",
                          borderRadius: "6px",
                          padding: "0.35rem 0.65rem",
                          fontSize: "0.75rem",
                          fontWeight: 600,
                          cursor: "pointer",
                          whiteSpace: "nowrap",
                          transition: "all 0.15s ease",
                          boxShadow: lead.status === "CONVERTED" ? "none" : "0 1px 3px rgba(201, 122, 30, 0.25)",
                        }}
                      >
                        {lead.status === "CONVERTED" ? (
                          <>
                            <span>✓</span>
                            <span>Resend Link</span>
                          </>
                        ) : (
                          <>
                            <span>⚡</span>
                            <span>Convert &amp; Send</span>
                          </>
                        )}
                      </button>

                      {(() => {
                        const zoomMatch = lead.message?.match(/https:\/\/zoom\.us\/[^\s\]]+/);
                        const actionItems = [
                          {
                            label: lead.status === "CONVERTED" ? "Resend Payment Link" : "Convert & Send Payment Link",
                            onClick: () => handleOpenConvertModal(lead),
                            icon: (
                              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                              </svg>
                            ),
                          },
                          ...(zoomMatch
                            ? [
                                {
                                  label: "Join Zoom Discovery Call",
                                  href: zoomMatch[0],
                                  icon: (
                                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                      <polygon points="23 7 16 12 23 17 23 7" />
                                      <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                                    </svg>
                                  ),
                                },
                              ]
                            : []),
                          {
                            label: `Email ${lead.name}`,
                            href: `mailto:${lead.email}`,
                            icon: (
                              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                                <polyline points="22,6 12,13 2,6" />
                              </svg>
                            ),
                          },
                          {
                            label: "Delete Enquiry",
                            danger: true,
                            dividerAbove: true,
                            onClick: () => setLeadToDelete(lead),
                            icon: (
                              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <polyline points="3 6 5 6 21 6" />
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                              </svg>
                            ),
                          },
                        ];

                        return (
                          <ActionMenu
                            ariaLabel={`Actions for ${lead.name}`}
                            items={actionItems}
                          />
                        );
                      })()}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Convert Lead & Send Course Payment Link Modal */}
      <Modal
        isOpen={Boolean(leadToConvert)}
        onClose={() => {
          if (!isConverting) {
            setLeadToConvert(null);
            setConversionResult(null);
            setCopiedLink(false);
          }
        }}
        title={leadToConvert?.status === "CONVERTED" ? "Resend Course Payment Link" : "Convert Lead & Send Course Payment Link"}
        maxWidth="580px"
      >
        {leadToConvert && (
          <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
            {/* Prospect details callout */}
            <div style={{ background: "#fbf9f5", border: "1px solid #e7e0d6", borderRadius: "10px", padding: "12px 16px" }}>
              <div style={{ fontSize: "0.88rem", fontWeight: 700, color: "var(--text-primary)" }}>
                {leadToConvert.name}
              </div>
              <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginTop: "2px" }}>
                {leadToConvert.email} {leadToConvert.phone && `· ${leadToConvert.phone}`}
              </div>
            </div>

            {conversionResult ? (
              /* Success state with copy link */
              <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: "12px", padding: "20px", textAlign: "center" }}>
                <div style={{ width: "48px", height: "48px", borderRadius: "50%", background: "#dcfce7", color: "#16a34a", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px", fontSize: "1.5rem" }}>
                  ✓
                </div>
                <h3 style={{ fontSize: "1.1rem", fontWeight: 700, color: "#166534", margin: "0 0 6px" }}>
                  Payment Link Generated &amp; Emailed!
                </h3>
                <p style={{ fontSize: "0.82rem", color: "#15803d", margin: "0 0 16px" }}>
                  An automated email with this pre-configured checkout link has been dispatched to <strong>{leadToConvert.email}</strong>.
                </p>

                <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
                  <input
                    readOnly
                    value={conversionResult.checkoutUrl}
                    style={{
                      flex: 1,
                      padding: "8px 12px",
                      borderRadius: "8px",
                      border: "1px solid #bbf7d0",
                      background: "#ffffff",
                      fontSize: "0.78rem",
                      fontFamily: "monospace",
                      color: "#166534",
                      outline: "none",
                    }}
                  />
                  <button
                    type="button"
                    onClick={async () => {
                      if (navigator.clipboard) {
                        await navigator.clipboard.writeText(conversionResult.checkoutUrl);
                        setCopiedLink(true);
                        setTimeout(() => setCopiedLink(false), 2500);
                      }
                    }}
                    style={{
                      padding: "8px 14px",
                      borderRadius: "8px",
                      border: "1px solid #16a34a",
                      background: copiedLink ? "#15803d" : "#ffffff",
                      color: copiedLink ? "#ffffff" : "#16a34a",
                      fontWeight: 600,
                      fontSize: "0.78rem",
                      cursor: "pointer",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {copiedLink ? "✓ Copied!" : "Copy Link"}
                  </button>
                  <a
                    href={conversionResult.checkoutUrl}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      padding: "8px 14px",
                      borderRadius: "8px",
                      background: "#166534",
                      color: "#ffffff",
                      fontWeight: 600,
                      fontSize: "0.78rem",
                      textDecoration: "none",
                      display: "inline-flex",
                      alignItems: "center",
                      whiteSpace: "nowrap",
                    }}
                  >
                    Open Checkout ↗
                  </a>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setLeadToConvert(null);
                    setConversionResult(null);
                    setCopiedLink(false);
                  }}
                  style={{
                    padding: "8px 24px",
                    borderRadius: "8px",
                    background: "var(--accent-primary, #c97a1e)",
                    color: "#ffffff",
                    border: "none",
                    fontWeight: 600,
                    fontSize: "0.85rem",
                    cursor: "pointer",
                  }}
                >
                  Done
                </button>
              </div>
            ) : (
              /* Conversion configuration form */
              <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                {/* Course Selector */}
                <div>
                  <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "4px" }}>
                    Target Course *
                  </label>
                  <CustomSelect
                    value={targetProgramId}
                    onChange={handleProgramChange}
                    options={programs.map((p) => ({ value: p.id, label: p.title }))}
                    ariaLabel="Select Course to Enrol Lead"
                    minWidth="100%"
                  />
                </div>

                {/* Batch Selector */}
                <div>
                  <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "4px" }}>
                    Target Cohort / Batch
                  </label>
                  {(() => {
                    const progBatches = batches.filter((b) => {
                      const pId = typeof b.program === "object" && b.program !== null ? b.program.id : b.programId;
                      return pId === targetProgramId;
                    });
                    const options = [
                      { value: "", label: "Auto (Next Available / Default Cohort)" },
                      ...progBatches.map((b) => ({ value: b.id, label: b.name })),
                    ];

                    return (
                      <CustomSelect
                        value={targetBatchId}
                        onChange={setTargetBatchId}
                        options={options}
                        ariaLabel="Select Cohort or Batch"
                        minWidth="100%"
                      />
                    );
                  })()}
                </div>

                {/* Currency & Price Selection */}
                <div>
                  <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "6px" }}>
                    Currency &amp; Tuition Amount *
                  </label>
                  {(() => {
                    const prog = programs.find((p) => p.id === targetProgramId);
                    const usdPrice = prog?.priceUSD ?? prog?.price ?? 0;
                    const aedPrice = prog?.priceAED ?? Math.round(Number(usdPrice) * 3.67);
                    const inrPrice = prog?.priceINR ?? Math.round(Number(usdPrice) * 83);

                    return (
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "8px" }}>
                        <button
                          type="button"
                          onClick={() => setTargetCurrency("USD")}
                          style={{
                            padding: "10px",
                            borderRadius: "8px",
                            border: targetCurrency === "USD" ? "2px solid var(--accent-primary, #c97a1e)" : "1px solid var(--border-light, #ece4d7)",
                            background: targetCurrency === "USD" ? "rgba(201, 122, 30, 0.08)" : "#ffffff",
                            textAlign: "center",
                            cursor: "pointer",
                          }}
                        >
                          <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-secondary)" }}>USD</div>
                          <div style={{ fontSize: "0.95rem", fontWeight: 800, color: "var(--text-primary)", marginTop: "2px" }}>
                            ${Number(usdPrice).toLocaleString()}
                          </div>
                        </button>

                        <button
                          type="button"
                          onClick={() => setTargetCurrency("AED")}
                          style={{
                            padding: "10px",
                            borderRadius: "8px",
                            border: targetCurrency === "AED" ? "2px solid var(--accent-primary, #c97a1e)" : "1px solid var(--border-light, #ece4d7)",
                            background: targetCurrency === "AED" ? "rgba(201, 122, 30, 0.08)" : "#ffffff",
                            textAlign: "center",
                            cursor: "pointer",
                          }}
                        >
                          <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-secondary)" }}>AED</div>
                          <div style={{ fontSize: "0.95rem", fontWeight: 800, color: "var(--text-primary)", marginTop: "2px" }}>
                            AED {Number(aedPrice).toLocaleString()}
                          </div>
                        </button>

                        <button
                          type="button"
                          onClick={() => setTargetCurrency("INR")}
                          style={{
                            padding: "10px",
                            borderRadius: "8px",
                            border: targetCurrency === "INR" ? "2px solid var(--accent-primary, #c97a1e)" : "1px solid var(--border-light, #ece4d7)",
                            background: targetCurrency === "INR" ? "rgba(201, 122, 30, 0.08)" : "#ffffff",
                            textAlign: "center",
                            cursor: "pointer",
                          }}
                        >
                          <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-secondary)" }}>INR</div>
                          <div style={{ fontSize: "0.95rem", fontWeight: 800, color: "var(--text-primary)", marginTop: "2px" }}>
                            ₹{Number(inrPrice).toLocaleString()}
                          </div>
                        </button>
                      </div>
                    );
                  })()}
                </div>

                {/* Admin Note / Reason */}
                <div>
                  <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "4px" }}>
                    Internal Note / Audit Reason (Optional)
                  </label>
                  <textarea
                    rows={2}
                    value={adminNote}
                    onChange={(e) => setAdminNote(e.target.value)}
                    placeholder="e.g., Prospect confirmed interest during Discovery call; provisioned for upcoming cohort."
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      borderRadius: "8px",
                      border: "1px solid var(--border-light, #ece4d7)",
                      background: "#ffffff",
                      fontSize: "0.82rem",
                      color: "var(--text-primary)",
                      outline: "none",
                      resize: "vertical",
                    }}
                  />
                </div>

                {/* Actions */}
                <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "8px" }}>
                  <button
                    type="button"
                    onClick={() => setLeadToConvert(null)}
                    disabled={isConverting}
                    style={{
                      padding: "8px 16px",
                      borderRadius: "8px",
                      border: "1px solid var(--border-light, #ece4d7)",
                      background: "#ffffff",
                      color: "var(--text-secondary)",
                      fontSize: "0.85rem",
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    Cancel
                  </button>

                  <button
                    type="button"
                    onClick={handleExecuteConversion}
                    disabled={isConverting || !targetProgramId}
                    style={{
                      padding: "8px 20px",
                      borderRadius: "8px",
                      background: "var(--accent-primary, #c97a1e)",
                      color: "#ffffff",
                      border: "none",
                      fontSize: "0.85rem",
                      fontWeight: 700,
                      cursor: isConverting || !targetProgramId ? "not-allowed" : "pointer",
                      opacity: isConverting || !targetProgramId ? 0.6 : 1,
                    }}
                  >
                    {isConverting
                      ? "Generating Link & Dispatching..."
                      : leadToConvert.status === "CONVERTED"
                      ? "Resend Payment Link"
                      : "Convert & Send Payment Link"}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* In-website branded ConfirmDialog */}
      <ConfirmDialog
        isOpen={Boolean(leadToDelete)}
        onClose={() => {
          if (!isDeletingLead) setLeadToDelete(null);
        }}
        onConfirm={confirmDeleteLead}
        title="Delete CRM Enquiry"
        subtitle={leadToDelete ? `${leadToDelete.name} (${leadToDelete.email})` : undefined}
        description={
          <>
            Are you sure you want to permanently delete the enquiry from <strong>{leadToDelete?.name}</strong>?
            {leadToDelete?.message && (
              <div style={{ marginTop: "8px", padding: "10px", background: "#f8f5f0", borderRadius: "6px", fontStyle: "italic", fontSize: "0.85rem" }}>
                &ldquo;{leadToDelete.message}&rdquo;
              </div>
            )}
          </>
        }
        tone="danger"
        confirmText={isDeletingLead ? "Deleting..." : "Delete Enquiry"}
        cancelText="Cancel"
        isLoading={isDeletingLead}
      />
    </div>
  );
}
