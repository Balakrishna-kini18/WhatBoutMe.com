"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import styles from "../page.module.css";
import leadStyles from "./leads.module.css";
import { API_URL, cachedFetch, generateLeadCheckoutPaymentLink, type SupportedCurrency } from "../lib/api";
import { CustomSelect, ActionMenu, ConfirmDialog, Modal, useToast, TableSkeleton } from "../components";

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

import { parseLeadMessage, type ParsedLeadMessage } from "../lib/lead-parser";
export { parseLeadMessage, type ParsedLeadMessage };

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
  const [searchQuery, setSearchQuery] = useState("");
  const [copiedLeadId, setCopiedLeadId] = useState<string | null>(null);
  const toast = useToast();
  const [leadToDelete, setLeadToDelete] = useState<Lead | null>(null);
  const [isDeletingLead, setIsDeletingLead] = useState(false);

  // Conversion Workflow State
  const [leadToConvert, setLeadToConvert] = useState<Lead | null>(null);
  const [targetProgramId, setTargetProgramId] = useState("");
  const [targetBatchId, setTargetBatchId] = useState("");
  const [targetCurrency, setTargetCurrency] = useState<SupportedCurrency>("USD");
  const [adminNote, setAdminNote] = useState("");
  const [isConverting, setIsConverting] = useState(false);
  const [conversionResult, setConversionResult] = useState<{ checkoutUrl: string; emailSent: boolean } | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  const load = async () => {
    try {
      const [leadsRes, progsRes, batchesRes] = await Promise.all([
        cachedFetch(`${API_URL}/leads`),
        cachedFetch(`${API_URL}/programs`).catch(() => null),
        cachedFetch(`${API_URL}/batches`).catch(() => null),
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

  // Auto-open convert modal if navigated with ?action=convert or ?leadId=
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
      const linkResult = await generateLeadCheckoutPaymentLink({
        leadId: leadToConvert.id,
        courseId: targetProgramId,
        batchId: targetBatchId || undefined,
        currency: targetCurrency,
        note: adminNote.trim() || undefined,
      });

      setConversionResult({ checkoutUrl: linkResult.checkoutUrl, emailSent: linkResult.emailSent });

      // Optimistically update lead status to CONVERTED
      setLeads((all) =>
        all.map((l) => (l.id === leadToConvert.id ? { ...l, status: "CONVERTED" } : l))
      );

      // Reload fresh leads to ensure synchronization
      load();

      // Copy link to clipboard automatically
      if (linkResult.checkoutUrl && navigator.clipboard) {
        await navigator.clipboard.writeText(linkResult.checkoutUrl).catch(() => {});
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

  const handleCopyCheckoutLink = async (leadId: string, url: string) => {
    if (!url) return;
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(url);
      }
      setCopiedLeadId(leadId);
      toast.success("Checkout link copied to clipboard!");
      setTimeout(() => {
        setCopiedLeadId((curr) => (curr === leadId ? null : curr));
      }, 2500);
    } catch {
      toast.error("Failed to copy link.");
    }
  };

  const setStatus = async (id: string, nextStatus: string) => {
    const previous = leads;
    setLeads((all) => all.map((l) => (l.id === id ? { ...l, status: nextStatus } : l)));
    try {
      const res = await cachedFetch(`${API_URL}/leads/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      if (!res.ok) {
        setLeads(previous);
        toast.error("Failed to update status.");
      } else {
        toast.success(`Status updated to ${nextStatus}.`);
      }
    } catch {
      setLeads(previous);
      toast.error("Failed to update status.");
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

  // Filter and search computation
  const visible = leads.filter((lead) => {
    if (filter !== "ALL" && lead.status !== filter) return false;
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase().trim();
    const nameMatch = lead.name.toLowerCase().includes(q);
    const emailMatch = lead.email.toLowerCase().includes(q);
    const phoneMatch = lead.phone ? lead.phone.toLowerCase().includes(q) : false;
    const msgMatch = lead.message ? lead.message.toLowerCase().includes(q) : false;
    return nameMatch || emailMatch || phoneMatch || msgMatch;
  });

  const newCount = leads.filter((l) => l.status === "NEW").length;
  const convertedCount = leads.filter((l) => l.status === "CONVERTED").length;

  return (
    <div className={styles.dashboard}>
      <header className={styles.header}>
        <div className={styles.headerText}>
          <h1 className={styles.title}>Enquiries (CRM)</h1>
          {/* <p className={styles.subtitle}>Messages sent from the contact form on the public website.</p> */}
        </div>
      </header>

      <section className={leadStyles.crmCard}>
        {/* Card Toolbar */}
        <div className={leadStyles.cardHeader}>
          <div className={leadStyles.cardHeaderLeft}>
            <h2 className={leadStyles.cardTitle}>
              {visible.length} {visible.length === 1 ? "Enquiry" : "Enquiries"}
            </h2>
            <div className={leadStyles.statPills}>
              <button
                type="button"
                onClick={() => setFilter("ALL")}
                className={`${leadStyles.statPill} ${filter === "ALL" ? leadStyles.statPillActive : ""}`}
              >
                All ({leads.length})
              </button>
              <button
                type="button"
                onClick={() => setFilter("NEW")}
                className={`${leadStyles.statPill} ${filter === "NEW" ? leadStyles.statPillActive : ""}`}
              >
                New ({newCount})
              </button>
              <button
                type="button"
                onClick={() => setFilter("CONVERTED")}
                className={`${leadStyles.statPill} ${filter === "CONVERTED" ? leadStyles.statPillActive : ""}`}
              >
                Converted ({convertedCount})
              </button>
            </div>
          </div>

          <div className={leadStyles.cardHeaderRight}>
            {/* Quick Search */}
            <div className={leadStyles.searchWrapper}>
              <span className={leadStyles.searchIcon} aria-hidden="true">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
              </span>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search name, email, or message..."
                className={leadStyles.searchInput}
                aria-label="Search enquiries"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className={leadStyles.clearSearchBtn}
                  aria-label="Clear search"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Filter Dropdown */}
            <div className={leadStyles.filterGroup}>
              <span className={leadStyles.filterLabel}>Status:</span>
              <CustomSelect
                ariaLabel="Filter enquiries by status"
                value={filter}
                onChange={setFilter}
                options={[
                  { value: "ALL", label: "All statuses" },
                  ...STATUSES.map((s) => ({ value: s.value, label: s.label })),
                ]}
                minWidth="135px"
              />
            </div>
          </div>
        </div>

        {/* Clean CRM Table */}
        <div className={leadStyles.tableWrapper}>
          <table className={leadStyles.table}>
            <colgroup>
              <col style={{ width: "16%" }} />
              <col style={{ width: "19%" }} />
              <col style={{ width: "35%" }} />
              <col style={{ width: "9%" }} />
              <col style={{ width: "10%" }} />
              <col style={{ width: "11%" }} />
            </colgroup>
            <thead>
              <tr>
                <th>Name</th>
                <th>Contact</th>
                <th>Message &amp; Details</th>
                <th>Received</th>
                <th>Status</th>
                <th style={{ textAlign: "right" }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <TableSkeleton columns={6} rows={5} />
              ) : visible.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <div className={leadStyles.emptyContainer}>
                      <div className={leadStyles.emptyIcon}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="2" y="4" width="20" height="16" rx="2" /><path d="M22 6l-10 7L2 6" /></svg></div>
                      <h3 className={leadStyles.emptyTitle}>No enquiries found</h3>
                      <p className={leadStyles.emptySubtitle}>
                        {searchQuery
                          ? `No enquiries matched "${searchQuery}". Try clearing the search.`
                          : filter !== "ALL"
                          ? `No enquiries currently marked as ${filter.toLowerCase()}.`
                          : "New messages from the website contact form will appear here."}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                visible.map((lead) => {
                  const parsed = parseLeadMessage(lead.message);
                  const zoomMatch = parsed.discovery?.zoomUrl || lead.message?.match(/https:\/\/zoom\.us\/[^\s\]]+/)?.[0];
                  const isConverted = lead.status === "CONVERTED" || Boolean(parsed.conversion);

                  return (
                    <tr key={lead.id} className={isConverted ? leadStyles.convertedRow : undefined}>
                      {/* Name Column */}
                      <td>
                        <div className={leadStyles.userCell}>
                          <div
                            className={`${leadStyles.avatar} ${isConverted ? leadStyles.avatarConverted : ""}`}
                            aria-hidden="true"
                          >
                            {lead.name.trim().charAt(0) || "U"}
                          </div>
                          <div className={leadStyles.userInfo}>
                            <span className={leadStyles.userName}>{lead.name}</span>
                            <span className={leadStyles.userSubtext}>
                              {isConverted ? "Enrolled Lead" : "Website Enquiry"}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Contact Column */}
                      <td>
                        <div className={leadStyles.contactStack}>
                          <a
                            href={`mailto:${lead.email}`}
                            className={leadStyles.emailLink}
                            title={`Email ${lead.email}`}
                          >
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                              <polyline points="22,6 12,13 2,6" />
                            </svg>
                            <span>{lead.email}</span>
                          </a>
                          {lead.phone && (
                            <span className={leadStyles.phoneText} title={`Phone: ${lead.phone}`}>
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                              </svg>
                              <span>{lead.phone}</span>
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Message & Details Column */}
                      <td>
                        <div className={leadStyles.messageStack}>
                          {/* Badges: High Intent Course Lead or 1-on-1 Discovery */}
                          {(parsed.isCourseInquiry || parsed.discovery) && (
                            <div className={leadStyles.badgesRow}>
                              {parsed.isCourseInquiry && (
                                <span className={leadStyles.badgeHighIntent}>
                                  <span>
                                    {parsed.courseInquiry?.title
                                      ? `Course: ${parsed.courseInquiry.title}`
                                      : "High-Intent Course Lead"}
                                  </span>
                                </span>
                              )}
                              {parsed.discovery && (
                                <span className={leadStyles.badgeDiscovery}>
                                  <span>1-on-1 Discovery Confirmed</span>
                                </span>
                              )}
                              {zoomMatch && (
                                <a
                                  href={zoomMatch}
                                  target="_blank"
                                  rel="noreferrer"
                                  className={leadStyles.zoomLinkPill}
                                  title="Join Scheduled Zoom Call"
                                >
                                  <span>Join Zoom ↗</span>
                                </a>
                              )}
                            </div>
                          )}

                          {/* Customer Inquiry Text */}
                          {parsed.originalMessage ? (
                            <div className={leadStyles.messageBody}>
                              {parsed.originalMessage}
                            </div>
                          ) : (
                            <span className={leadStyles.messageEmpty}>No additional note provided</span>
                          )}

                          {/* Converted Details Card */}
                          {parsed.conversion && (
                            <div className={leadStyles.conversionCard}>
                              <div className={leadStyles.conversionHeader}>
                                <div className={leadStyles.conversionTitleGroup}>
                                  <span className={leadStyles.conversionCheckIcon}>✓</span>
                                  <span className={leadStyles.conversionCourseTitle}>
                                    {parsed.conversion.courseTitle}
                                  </span>
                                </div>
                                <span
                                  className={leadStyles.enrolmentChip}
                                  title={`Enrolment ID: ${parsed.conversion.enrolmentId}`}
                                >
                                  #{parsed.conversion.enrolmentId.slice(0, 8)}
                                </span>
                              </div>

                              <div className={leadStyles.conversionActions}>
                                <button
                                  type="button"
                                  onClick={() => handleCopyCheckoutLink(lead.id, parsed.conversion!.checkoutUrl)}
                                  className={`${leadStyles.copyLinkBtn} ${copiedLeadId === lead.id ? leadStyles.copyLinkBtnCopied : ""}`}
                                  title="Copy personalized student checkout link"
                                >
                                  {copiedLeadId === lead.id ? (
                                    <>
                                      <span>✓</span>
                                      <span>Copied!</span>
                                    </>
                                  ) : (
                                    <>
                                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                                      </svg>
                                      <span>Copy Checkout Link</span>
                                    </>
                                  )}
                                </button>

                                <a
                                  href={parsed.conversion.checkoutUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className={leadStyles.openLinkBtn}
                                  title="Open checkout page in new tab"
                                >
                                  <span>Open</span>
                                  <span>↗</span>
                                </a>
                              </div>
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Received Date Column */}
                      <td>
                        <div className={leadStyles.dateText}>
                          {new Date(lead.createdAt).toLocaleDateString(undefined, {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}
                        </div>
                        <div className={leadStyles.dateSubtext}>
                          {new Date(lead.createdAt).toLocaleTimeString(undefined, {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </div>
                      </td>

                      {/* Status Column */}
                      <td>
                        <CustomSelect
                          size="sm"
                          ariaLabel={`Status for ${lead.name}`}
                          value={lead.status}
                          onChange={(val) => setStatus(lead.id, val)}
                          options={STATUSES.map((s) => ({ value: s.value, label: s.label }))}
                          minWidth="125px"
                        />
                      </td>

                      {/* Action Column */}
                      <td style={{ textAlign: "right" }}>
                        <div className={leadStyles.actionCellWrapper}>
                          <button
                            type="button"
                            onClick={() => handleOpenConvertModal(lead)}
                            title={lead.status === "CONVERTED" ? "Resend Course Payment Link" : "Convert Lead & Send Course Payment Link"}
                            className={lead.status === "CONVERTED" ? leadStyles.btnResendLink : leadStyles.btnPrimaryConvert}
                          >
                            {lead.status === "CONVERTED" ? (
                              <>
                                <span>✓</span>
                                <span>Resend Link</span>
                              </>
                            ) : (
                              <>
                                <span>Convert &amp; Send</span>
                              </>
                            )}
                          </button>

                          {(() => {
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
                                      href: zoomMatch,
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
                  );
                })
              )}
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
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px",
                    }}
                  >
                    {isConverting && <span className="spinner" />}
                    <span>
                      {isConverting
                        ? "Generating Link & Dispatching..."
                        : leadToConvert.status === "CONVERTED"
                        ? "Resend Payment Link"
                        : "Convert & Send Payment Link"}
                    </span>
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
                &ldquo;{parseLeadMessage(leadToDelete.message).originalMessage || leadToDelete.message}&rdquo;
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
