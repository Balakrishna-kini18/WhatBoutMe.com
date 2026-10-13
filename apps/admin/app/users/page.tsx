"use client";

import { useEffect, useState, FormEvent } from "react";
import styles from "../page.module.css";
import Link from "next/link";
import { CustomSelect, ActionMenu, StatusBadge } from "../components";

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  progress?: string;
  cohort?: string;
  joined?: string;
  permissions?: string[];
}

const ROLE_CARDS = [
  {
    id: "SUPER_ADMIN",
    title: "Super Admin",
    badgeLabel: "Super Admin",
    tone: "roleSuperAdmin" as const,
    purpose: "Full governance, staff role management, and system security administration.",
    summary: "Full platform access: staff accounts, role assignment, audit logs, billing, system configuration",
    canDo: [
      "Manage staff roles and assign platform permissions",
      "Access global finance, revenue, agreements & audits",
      "Full LMS control across all programs, cohorts & tests",
    ],
    cannotDo: [
      "Protected against accidental self-deletion",
    ],
    requiresSuperAdmin: true,
  },
  {
    id: "ADMIN",
    title: "Admin",
    badgeLabel: "Admin",
    tone: "roleAdmin" as const,
    purpose: "Manages day-to-day LMS programs, batches, certificates, and learner operations.",
    summary: "Manage programs, batches, quizzes, oral assessments, certificates, payments & reports",
    canDo: [
      "Create & edit programs, lessons, quizzes & question banks",
      "Create cohorts, manage enrolments & assign managers",
      "Approve certificates, grade assessments & pull reports",
    ],
    cannotDo: [
      "Cannot change user roles or elevate staff permissions",
      "Cannot modify or view Super Admin credentials",
    ],
    requiresSuperAdmin: false,
  },
  {
    id: "MANAGER",
    title: "Manager",
    badgeLabel: "Manager",
    tone: "roleManager" as const,
    purpose: "Handles assigned batches, attendance, sessions, chats, and announcements.",
    summary: "Assigned batches only: attendance, sessions, chats, announcements & 1:1 bookings",
    canDo: [
      "Manage assigned batches, attendance & session check-ins",
      "Host live Zoom/Meet sessions & conduct oral assessments",
      "Participate in cohort chats & publish batch announcements",
      "Grade quizzes & track progress for assigned learners",
    ],
    cannotDo: [
      "Cannot view or edit other managers' batches",
      "Cannot edit global curriculum, programs, or view revenue",
      "Cannot manage user accounts or alter roles",
    ],
    requiresSuperAdmin: false,
  },
  {
    id: "USER",
    title: "User (Learner)",
    badgeLabel: "User (Learner)",
    tone: "roleUser" as const,
    purpose: "Access scoped strictly to own dashboard, batch, unlocked steps, sessions, chat, invoices, and certificates.",
    summary: "Own dashboard only: batch, unlocked steps, sessions, chat, invoices & certificates",
    canDo: [
      "Access own dashboard, assigned batch & unlocked steps",
      "Attend scheduled sessions & book 1:1 oral assessments",
      "Participate in cohort group chat & direct messaging",
      "View payment invoices & download earned certificates",
    ],
    cannotDo: [
      "No access to admin portal or management controls",
      "Cannot view other learners' private progress or PII",
    ],
    requiresSuperAdmin: false,
  },
];

export default function UsersPage() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [totalUsers, setTotalUsers] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const limit = 20;
  const [batches, setBatches] = useState<{id: string, name: string}[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [viewMode, setViewMode] = useState<"LEARNERS" | "STAFF">("LEARNERS");
  // Form states
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [cohort, setCohort] = useState("");
  const [role, setRole] = useState("USER");
  const [initialRole, setInitialRole] = useState("USER");
  const [status, setStatus] = useState("ACTIVE");
  const [password, setPassword] = useState("");
  const [permissions, setPermissions] = useState<string[]>([]);
  const [formError, setFormError] = useState("");
  // only a super admin may create another super admin
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [currentUserRole, setCurrentUserRole] = useState("USER");
  const isManager = currentUserRole === "MANAGER" || currentUserRole === "TEACHER";

  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem("user") || "{}");
      setCurrentUserRole(stored.role || "USER");
      setIsSuperAdmin(stored.role === "SUPER_ADMIN");
    } catch {
      setIsSuperAdmin(false);
      setCurrentUserRole("USER");
    }
  }, []);

  useEffect(() => {
    fetchBatches();
  }, []);

  useEffect(() => {
    if (isModalOpen) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === "Escape") {
          setIsModalOpen(false);
        }
      };
      window.addEventListener("keydown", handleKeyDown);
      return () => {
        document.body.style.overflow = originalOverflow;
        window.removeEventListener("keydown", handleKeyDown);
      };
    }
  }, [isModalOpen]);

  useEffect(() => {
    setIsLoading(true);
    const delay = setTimeout(() => {
      fetchUsers();
    }, 300); // debounce search
    return () => clearTimeout(delay);
  }, [page, search, viewMode]);

  const fetchBatches = async () => {
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/batches`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setBatches(data);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchUsers = async () => {
    try {
      const token = localStorage.getItem("token");
      const roleParam = viewMode === "LEARNERS" ? "USER" : "STAFF";
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/users?page=${page}&limit=${limit}&search=${encodeURIComponent(search)}&role=${roleParam}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const json = await res.json();
        setUsers(json.data || []);
        setTotalUsers(json.total || 0);
      }
    } catch (e) {
      console.error("Failed to fetch users", e);
    } finally {
      setIsLoading(false);
    }
  };

  const openEditModal = (user: User) => {
    setEditingUserId(user.id);
    setEmail(user.email);
    const names = user.name ? user.name.split(" ") : ["", ""];
    setFirstName(names[0] || "");
    setLastName(names.slice(1).join(" ") || "");
    const matchingBatch = batches.find(b => b.name === user.cohort || b.id === user.cohort);
    setCohort(matchingBatch ? matchingBatch.id : "");
    const userRole = user.role || "USER";
    setRole(userRole);
    setInitialRole(userRole);
    setStatus(user.status || "ACTIVE");
    setPassword("");
    setPermissions(user.permissions || []);
    setFormError("");
    setIsModalOpen(true);
  };

  const openCreateModal = () => {
    setEditingUserId(null);
    setEmail("");
    setFirstName("");
    setLastName("");
    setCohort("");
    setRole("USER");
    setInitialRole("USER");
    setStatus("ACTIVE");
    setPassword("");
    setPermissions([]);
    setFormError("");
    setIsModalOpen(true);
  };

  const handleDeleteUser = async (id: string) => {
    if (!confirm("Are you sure you want to revoke access and delete this user?")) return;
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/users/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        fetchUsers();
      }
    } catch (e) {
      console.error("Failed to delete user", e);
    }
  };

  const handleSaveUser = async (e: FormEvent) => {
    e.preventDefault();
    setFormError("");

    if (role === "SUPER_ADMIN" && !isSuperAdmin) {
      setFormError("Security rule: Only Super Admins can assign the Super Admin role.");
      return;
    }

    const payload: Record<string, any> = {
      email,
      name: `${firstName} ${lastName}`.trim(),
      role,
      permissions,
      ...(password ? { password } : {}),
    };

    try {
      const token = localStorage.getItem("token");
      const url = editingUserId 
        ? `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/users/${editingUserId}` 
        : `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/users`;
      const method = editingUserId ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { 
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const savedData = await res.json().catch(() => null);
        const targetUserId = editingUserId || savedData?.id;

        // If cohort is assigned for a Manager, link the batch managerId
        if (cohort && (role === "MANAGER" || role === "TEACHER") && targetUserId) {
          try {
            await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/batches/${cohort}`, {
              method: "PATCH",
              headers: { 
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`
              },
              body: JSON.stringify({ managerId: targetUserId })
            });
          } catch (batchErr) {
            console.warn("Could not assign manager to batch", batchErr);
          }
        }

        setIsModalOpen(false);
        setEmail("");
        setFirstName("");
        setLastName("");
        setEditingUserId(null);
        fetchUsers();
      } else {
        const data = await res.json().catch(() => null);
        const raw = data?.error?.message ?? data?.message;
        setFormError((Array.isArray(raw) ? raw.join(", ") : raw) || `Could not save the user (error ${res.status}).`);
      }
    } catch (e) {
      console.error("Failed to save user", e);
      setFormError("Could not reach the server. Check that the API is running.");
    }
  };

  return (
    <div className={styles.dashboard}>
      <header className={styles.header}>
        <div className={styles.headerText}>
          <h1 className={styles.title}>Users & Enrolments</h1>
          <p className={styles.subtitle}>
            {isManager ? "Learners enrolled in your assigned cohorts." : "Manage all learners across your programs."}
          </p>
        </div>
        {!isManager && (
          <div className={styles.headerActions}>
            <button className={styles.primaryBtn} onClick={openCreateModal}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              <span>Add User</span>
            </button>
          </div>
        )}
      </header>

      {!isManager && (
        <div className={styles.tabsContainer} role="tablist" aria-label="User directory views">
          <button 
            type="button"
            role="tab"
            aria-selected={viewMode === "LEARNERS"}
            className={`${styles.tabBtn} ${viewMode === "LEARNERS" ? styles.tabBtnActive : ""}`}
            onClick={() => { setViewMode("LEARNERS"); setPage(1); }}
          >
            Learners
          </button>
          <button 
            type="button"
            role="tab"
            aria-selected={viewMode === "STAFF"}
            className={`${styles.tabBtn} ${viewMode === "STAFF" ? styles.tabBtnActive : ""}`}
            onClick={() => { setViewMode("STAFF"); setPage(1); }}
          >
            Staff &amp; Administrators
          </button>
        </div>
      )}

      <section className={styles.tableSection}>
        <div className={styles.sectionHeader}>
          <h2>{viewMode === "LEARNERS" ? "All Learners" : "Staff & Administrators"} ({totalUsers})</h2>
          <div className={styles.searchContainer}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ color: "var(--text-muted)", flexShrink: 0, marginRight: "0.4rem" }}>
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input 
              type="text" 
              placeholder="Search by name or email..." 
              className={styles.searchInput} 
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
            />
          </div>
        </div>
        
        <div className={styles.tableWrapper}>
          <table className={styles.adminTable}>
            <thead>
              <tr>
                <th>{viewMode === "LEARNERS" ? "Learner" : "Staff"}</th>
                <th>Joined</th>
                <th>{viewMode === "LEARNERS" ? "Cohort" : "Role"}</th>
                <th>Status</th>
                {viewMode === "LEARNERS" && <th>Progress</th>}
                <th className={styles.alignRight}>Action</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={viewMode === "LEARNERS" ? 6 : 5} style={{textAlign: "center", padding: "28px", color: "var(--text-muted)"}}>Loading users from database...</td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={viewMode === "LEARNERS" ? 6 : 5} style={{textAlign: "center", padding: "28px", color: "var(--text-muted)"}}>No users found.</td>
                </tr>
              ) : users.map((user) => (
                <tr key={user.id}>
                  <td>
                    <Link href={`/users/${user.id}`} style={{ textDecoration: "none", color: "inherit" }}>
                      <div className={styles.cellUser}>
                        <span className={styles.cellUserName}>{user.name}</span>
                        <span className={styles.cellUserEmail}>{user.email}</span>
                      </div>
                    </Link>
                  </td>
                  <td><span className={styles.cellTextMuted}>{user.joined || "Just now"}</span></td>
                  <td>
                    {viewMode === "STAFF" ? (
                      <StatusBadge status={user.role} />
                    ) : (
                      <span className={styles.cellText}>{user.cohort || "None"}</span>
                    )}
                  </td>
                  <td>
                    <StatusBadge status={user.status} />
                  </td>
                  {viewMode === "LEARNERS" && (
                    <td>
                      {(() => {
                        const percentVal = parseInt(user.progress || "0", 10) || 0;
                        const progressFillColor = percentVal === 100 ? "var(--status-success)" : percentVal > 0 ? "var(--accent-primary)" : "var(--border-light)";
                        return (
                          <div className={styles.progressCell}>
                            <div className={styles.progressBar}>
                              <div className={styles.progressFill} style={{ width: user.progress || "0%", backgroundColor: progressFillColor }}></div>
                            </div>
                            <span className={styles.progressText} style={{ fontWeight: 600, color: percentVal === 100 ? "var(--status-success)" : undefined }}>
                              {user.progress || "0%"}
                            </span>
                          </div>
                        );
                      })()}
                    </td>
                  )}
                  <td className={styles.alignRight}>
                    <ActionMenu
                      ariaLabel={`Actions for ${user.name}`}
                      items={
                        isManager
                          ? [
                              {
                                label: "View Full Profile",
                                href: `/users/${user.id}`,
                                icon: (
                                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                                    <circle cx="12" cy="7" r="4" />
                                  </svg>
                                ),
                              },
                            ]
                          : [
                              {
                                label: "View Full Profile",
                                href: `/users/${user.id}`,
                                icon: (
                                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                                    <circle cx="12" cy="7" r="4" />
                                  </svg>
                                ),
                              },
                              {
                                label: "Edit User",
                                onClick: () => openEditModal(user),
                                icon: (
                                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                                  </svg>
                                ),
                              },
                              {
                                label: "Revoke Access",
                                danger: true,
                                dividerAbove: true,
                                onClick: () => handleDeleteUser(user.id),
                                icon: (
                                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                    <polyline points="3 6 5 6 21 6" />
                                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                    <line x1="10" y1="11" x2="10" y2="17" />
                                    <line x1="14" y1="11" x2="14" y2="17" />
                                  </svg>
                                ),
                              },
                            ]
                      }
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        
        {totalUsers > limit && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px', gap: '10px' }}>
            <button 
              className={styles.secondaryBtn} 
              disabled={page === 1} 
              onClick={() => setPage(p => p - 1)}
            >
              Previous
            </button>
            <span style={{ display: 'flex', alignItems: 'center', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
              Page {page} of {Math.ceil(totalUsers / limit)}
            </span>
            <button 
              className={styles.secondaryBtn} 
              disabled={page >= Math.ceil(totalUsers / limit)} 
              onClick={() => setPage(p => p + 1)}
            >
              Next
            </button>
          </div>
        )}
      </section>

      {/* ROLE ASSIGNMENT & USER MODAL */}
      {isModalOpen && (
        <div className={styles.modalOverlay} onClick={() => setIsModalOpen(false)}>
          <div className={`${styles.modalContent} ${styles.modalContentWide}`} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div>
                <h2>{editingUserId ? "Edit User & Role Assignment" : "Add New User"}</h2>
                <p className={styles.modalIntro}>
                  {editingUserId 
                    ? "Manage this account's primary role, cohort placement, and platform access."
                    : "Create a user account and assign exactly one primary role with server-enforced permissions."}
                </p>
              </div>
              <button className={styles.closeBtn} onClick={() => setIsModalOpen(false)} aria-label="Close dialog">×</button>
            </div>
            
            <form className={styles.modalForm} onSubmit={handleSaveUser}>
              <div className={styles.modalBody}>
                {/* 1. EMAIL */}
                <div className={styles.formGroup}>
                  <label htmlFor="user-modal-email">Email Address <span style={{ color: "var(--accent-primary)" }}>*</span></label>
                  <input
                    id="user-modal-email"
                    type="email"
                    placeholder="name@example.com"
                    required
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                  />
                </div>

                {/* 2. FIRST & LAST NAME */}
                <div className={styles.formRow}>
                  <div className={styles.formGroup}>
                    <label htmlFor="user-modal-firstname">First Name <span style={{ color: "var(--accent-primary)" }}>*</span></label>
                    <input
                      id="user-modal-firstname"
                      type="text"
                      placeholder="First name"
                      required
                      value={firstName}
                      onChange={e => setFirstName(e.target.value)}
                    />
                  </div>
                  <div className={styles.formGroup}>
                    <label htmlFor="user-modal-lastname">Last Name <span style={{ color: "var(--accent-primary)" }}>*</span></label>
                    <input
                      id="user-modal-lastname"
                      type="text"
                      placeholder="Last name"
                      required
                      value={lastName}
                      onChange={e => setLastName(e.target.value)}
                    />
                  </div>
                </div>

                {/* 3. ROLE CARDS (ONE PERSON = ONE ROLE) */}
                <div className={styles.roleSection}>
                  <div className={styles.roleSectionHeader}>
                    <span className={styles.roleSectionTitle}>Primary Role (One Person = One Role)</span>
                    <span className={styles.roleSectionSub}>Action permissions verified on server</span>
                  </div>

                  <div className={styles.roleGrid} role="radiogroup" aria-label="Select primary role">
                    {ROLE_CARDS.map(card => {
                      const isSelected = role === card.id;
                      const isDisabled = card.requiresSuperAdmin && !isSuperAdmin;
                      return (
                        <div
                          key={card.id}
                          role="radio"
                          aria-checked={isSelected}
                          aria-disabled={isDisabled}
                          tabIndex={isDisabled ? -1 : 0}
                          className={`${styles.roleCard} ${isSelected ? styles.roleCardSelected : ""} ${isDisabled ? styles.roleCardDisabled : ""}`}
                          onClick={() => {
                            if (isDisabled) return;
                            setRole(card.id);
                          }}
                          onKeyDown={(e) => {
                            if ((e.key === " " || e.key === "Enter") && !isDisabled) {
                              e.preventDefault();
                              setRole(card.id);
                            }
                          }}
                        >
                          <div className={styles.roleCardHeader}>
                            <div className={styles.roleCardTitleRow}>
                              <h3 className={styles.roleCardTitle}>{card.title}</h3>
                              <StatusBadge status={card.badgeLabel} tone={card.tone} />
                            </div>
                            <div className={styles.roleRadioIndicator} aria-hidden="true">
                              {isSelected && (
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                                  <polyline points="20 6 9 17 4 12" />
                                </svg>
                              )}
                            </div>
                          </div>

                          <p className={styles.rolePurpose}>{card.purpose}</p>

                          <div className={styles.rolePermSummary}>
                            <strong>Permission Summary</strong>
                            <span>{card.summary}</span>
                          </div>

                          <div className={styles.roleCardBullets}>
                            {card.canDo.map((item, idx) => (
                              <div key={`can-${idx}`} className={`${styles.bulletItem} ${styles.bulletCan}`}>
                                <span aria-hidden="true">✓</span>
                                <span>{item}</span>
                              </div>
                            ))}
                            {card.cannotDo.map((item, idx) => (
                              <div key={`cannot-${idx}`} className={`${styles.bulletItem} ${styles.bulletCannot}`}>
                                <span aria-hidden="true">✕</span>
                                <span>{item}</span>
                              </div>
                            ))}
                          </div>

                          {isDisabled && (
                            <div style={{ fontSize: "0.72rem", color: "var(--status-error)", marginTop: "0.25rem", display: "flex", alignItems: "center", gap: "0.25rem" }}>
                              <span>🔒 Requires Super Admin role</span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* 4. ASSIGNED COHORT / BATCH (SEPARATE MANAGER ASSIGNMENT) */}
                <div className={styles.formGroup} style={{ marginTop: "0.35rem" }}>
                  <label htmlFor="user-modal-cohort">
                    Assigned Cohort / Batch{" "}
                    {role === "MANAGER" ? (
                      <span style={{ color: "var(--accent-primary)", fontWeight: 700 }}>(Recommended for Manager)</span>
                    ) : (
                      <span className={styles.optionalLabel}>(Optional)</span>
                    )}
                  </label>
                  <CustomSelect
                    value={cohort}
                    onChange={(val) => setCohort(val)}
                    options={[
                      { value: "", label: "None (Pending Placement)" },
                      ...batches.map((b) => ({ value: b.id, label: b.name })),
                    ]}
                    fullWidth
                    ariaLabel="Assign to cohort"
                  />
                  {role === "MANAGER" ? (
                    <div className={styles.roleHelperNoticeManager}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: "1px" }}>
                        <circle cx="12" cy="12" r="10" />
                        <line x1="12" y1="16" x2="12" y2="12" />
                        <line x1="12" y1="8" x2="12.01" y2="8" />
                      </svg>
                      <span>
                        <strong>Manager Scoping Rule:</strong> Per security rules, Managers operate with strict cohort isolation. Selecting a cohort grants this manager direct operational control over its sessions, attendance, and learners.
                      </span>
                    </div>
                  ) : role === "USER" ? (
                    <p className={styles.fieldHelpText}>
                      Places learner into this batch for curriculum schedule, group coaching, and peer discussions.
                    </p>
                  ) : (
                    <p className={styles.fieldHelpText}>
                      Platform administrators operate across all cohorts by default. Specific cohort assignment is optional.
                    </p>
                  )}
                </div>

                {/* 5. TEMPORARY PASSWORD & ACCOUNT STATUS */}
                <div className={styles.formRow}>
                  <div className={styles.formGroup}>
                    <label htmlFor="user-modal-password">
                      {editingUserId ? "New Password" : "Temporary Password"}{" "}
                      <span className={styles.optionalLabel}>
                        {editingUserId ? "(Leave blank to keep current)" : "(At least 8 chars)"}
                      </span>
                    </label>
                    <input
                      id="user-modal-password"
                      type="text"
                      autoComplete="off"
                      minLength={8}
                      required={!editingUserId}
                      placeholder={editingUserId ? "Leave blank to keep unchanged" : "At least 8 characters"}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                    />
                  </div>

                  <div className={styles.formGroup}>
                    <label>Account Status</label>
                    <CustomSelect
                      value={status}
                      onChange={(val) => setStatus(val)}
                      options={[
                        { value: "ACTIVE", label: "Active (Full Access)" },
                        { value: "SUSPENDED", label: "Suspended (Revokes Sessions)" },
                        { value: "INACTIVE", label: "Inactive (Disabled)" },
                      ]}
                      fullWidth
                      ariaLabel="Select account status"
                    />
                  </div>
                </div>

                {/* 6. ADVANCED PERMISSIONS (ACCORDION - ONLY SUPER ADMIN) */}
                {isSuperAdmin && ["ADMIN", "MANAGER", "TEACHER"].includes(role) && (
                  <details className={styles.advancedAccordion}>
                    <summary className={styles.advancedAccordionSummary}>
                      <div className={styles.accordionSummaryLeft}>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
                          <circle cx="12" cy="12" r="3" />
                        </svg>
                        <span>Advanced Permissions (Custom Module Overrides)</span>
                      </div>
                      <span className={styles.accordionTag}>Super Admin Only</span>
                    </summary>
                    <div className={styles.advancedAccordionBody}>
                      <p className={styles.accordionNotice}>
                        Canonical roles automatically include standard LMS permissions. Configure module overrides only if this staff account requires specific capabilities outside standard role boundaries.
                      </p>
                      <div className={styles.permissionsGrid}>
                        {[
                          { id: "view_users", label: "Users & Enrolments", desc: "Manage learner directory and profiles" },
                          { id: "view_batches", label: "Batches & Cohorts", desc: "Manage schedules and cohort dates" },
                          { id: "manage_curriculum", label: "Curriculum & Programs", desc: "Edit courses, steps and quizzes" },
                          { id: "manage_website", label: "Website Content & CRM", desc: "Public landing page and enquiries" },
                          { id: "view_finance", label: "Finance & Revenue", desc: "Invoices, transactions and refunds" },
                          { id: "manage_operations", label: "Operations & Meetings", desc: "Zoom links and assessor calendars" },
                        ].map(perm => {
                          const isChecked = permissions.includes(perm.id);
                          return (
                            <label key={perm.id} className={`${styles.permCard} ${isChecked ? styles.permCardChecked : ""}`}>
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={(e) => {
                                  if (e.target.checked) setPermissions(prev => [...prev, perm.id]);
                                  else setPermissions(prev => prev.filter(p => p !== perm.id));
                                }}
                              />
                              <div className={styles.permCardText}>
                                <strong>{perm.label}</strong>
                                <span>{perm.desc}</span>
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  </details>
                )}

                {/* 7. DYNAMIC ROLE CHANGE SECURITY WARNING */}
                {editingUserId && role !== initialRole && (
                  <div className={styles.roleWarningBanner} role="alert">
                    <div className={styles.roleWarningTitle}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
                        <line x1="12" y1="9" x2="12" y2="13" />
                        <line x1="12" y1="17" x2="12.01" y2="17" />
                      </svg>
                      <span>Role Permission &amp; Security Boundary Change</span>
                    </div>
                    <p className={styles.roleWarningText}>
                      You are changing this account from <strong>{initialRole}</strong> to <strong>{role}</strong>.
                    </p>
                    <ul className={styles.roleWarningList}>
                      <li><strong>Immediate scope re-evaluation:</strong> The server will verify permissions under the new role on every request.</li>
                      <li><strong>Session revocation:</strong> All active sessions and refresh tokens for this user will be revoked immediately upon saving (forcing re-login).</li>
                      <li><strong>Audit logging:</strong> This administrative change is permanently recorded in the system audit log.</li>
                    </ul>
                  </div>
                )}

                {/* 8. SYSTEM AUDIT ASSURANCE */}
                <div className={styles.auditIndicator}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                  </svg>
                  <span>
                    Strict 1 person = 1 role rule enforced. Changes are cryptographically verified and recorded in the audit log.
                  </span>
                </div>

                {formError && (
                  <p role="alert" style={{ margin: 0, padding: '0.75rem 1rem', borderRadius: '8px', background: '#fef2f2', color: '#b91c1c', fontSize: '0.85rem' }}>{formError}</p>
                )}
              </div>

              <div className={styles.modalFooter}>
                <button type="button" className={styles.secondaryBtn} onClick={() => setIsModalOpen(false)}>Cancel</button>
                <button type="submit" className={styles.primaryBtn}>{editingUserId ? "Save Changes" : "Add User"}</button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
