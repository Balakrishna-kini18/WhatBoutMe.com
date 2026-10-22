"use client";

import { useEffect, useState, FormEvent, useRef } from "react";
import styles from "../page.module.css";
import Link from "next/link";
import dynamic from "next/dynamic";
import { CustomSelect, ActionMenu, StatusBadge, useToast, Modal, TableSkeleton, EmptyState } from "../components";

const RevokeAccessModal = dynamic(
  () => import("../components/RevokeAccessModal").then((mod) => mod.RevokeAccessModal),
  { ssr: false }
);

interface UserEnrolment {
  id: string;
  batchId: string | null;
  batchName: string | null;
  programTitle: string | null;
  status: string;
}

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  progress?: string;
  currentStepNumber?: number;
  twoFactorEnabled?: boolean;
  isAgreementSigned?: boolean;
  managedBatches?: Array<{ id: string; name: string }>;
  cohort?: string;
  batchId?: string | null;
  enrolmentId?: string | null;
  enrolments?: UserEnrolment[];
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
  const { success: toastSuccess } = useToast();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [revokingUser, setRevokingUser] = useState<User | null>(null);
  const [isRevokeModalOpen, setIsRevokeModalOpen] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [totalUsers, setTotalUsers] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const limit = 20;
  const [batches, setBatches] = useState<{id: string, name: string}[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [viewMode, setViewMode] = useState<"LEARNERS" | "STAFF">("LEARNERS");
  const [roleFilter, setRoleFilter] = useState<"ALL" | "USER" | "MANAGER" | "ADMIN" | "SUPER_ADMIN">("ALL");
  const [selectedManagerBatchIds, setSelectedManagerBatchIds] = useState<string[]>([]);

  // Quick Assign Batch Modal State
  const [assignBatchUser, setAssignBatchUser] = useState<User | null>(null);
  const [assignBatchId, setAssignBatchId] = useState<string>("");
  const [isAssigningBatch, setIsAssigningBatch] = useState(false);

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
  const [editingEnrolmentId, setEditingEnrolmentId] = useState<string | null>(null);
  const [editingUserEnrolments, setEditingUserEnrolments] = useState<UserEnrolment[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
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

  const userFetchAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setIsLoading(true);
    if (userFetchAbortRef.current) {
      userFetchAbortRef.current.abort();
    }
    const controller = new AbortController();
    userFetchAbortRef.current = controller;

    const delay = setTimeout(() => {
      fetchUsers(controller.signal);
    }, 300); // debounce search
    return () => {
      clearTimeout(delay);
      controller.abort();
    };
  }, [page, search, viewMode, roleFilter]);

  const fetchBatches = async () => {
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/batches`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setBatches(Array.isArray(data) ? data : data.batches || []);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchUsers = async (signal?: AbortSignal) => {
    try {
      const token = localStorage.getItem("token");
      let roleParam = "";
      if (roleFilter !== "ALL") {
        roleParam = `&role=${roleFilter}`;
      } else {
        roleParam = viewMode === "LEARNERS" ? "&role=USER" : "&role=STAFF";
      }

      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/users?page=${page}&limit=${limit}&search=${encodeURIComponent(search)}${roleParam}`,
        {
          headers: { Authorization: `Bearer ${token}` },
          signal,
        }
      );
      if (res.ok) {
        const json = await res.json();
        setUsers(json.data || []);
        setTotalUsers(json.total || 0);
      }
    } catch (e: any) {
      if (e?.name !== "AbortError") {
        console.error("Failed to fetch users", e);
      }
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

    const userEnrolments = user.enrolments || [];
    setEditingUserEnrolments(userEnrolments);
    const activeEnrolment = userEnrolments.find(e => e.status !== "REVOKED") || userEnrolments[0];
    const initialEnrolmentId = user.enrolmentId || activeEnrolment?.id || null;
    setEditingEnrolmentId(initialEnrolmentId);

    const initialBatchId = user.batchId || activeEnrolment?.batchId || null;
    const matchingBatch = batches.find(b => b.id === initialBatchId || b.name === user.cohort || b.id === user.cohort);
    setCohort(matchingBatch ? matchingBatch.id : (initialBatchId || ""));

    const userRole = user.role || "USER";
    setRole(userRole);
    setInitialRole(userRole);
    setStatus(user.status || "ACTIVE");
    setPassword("");
    setPermissions(user.permissions || []);
    const initialManaged = user.managedBatches?.map(b => b.id) || (user.batchId ? [user.batchId] : []);
    setSelectedManagerBatchIds(initialManaged);
    setFormError("");
    setIsModalOpen(true);
  };

  const openCreateModal = () => {
    setEditingUserId(null);
    setEditingEnrolmentId(null);
    setEditingUserEnrolments([]);
    setEmail("");
    setFirstName("");
    setLastName("");
    setCohort("");
    setRole("USER");
    setInitialRole("USER");
    setStatus("ACTIVE");
    setPassword("");
    setPermissions([]);
    setSelectedManagerBatchIds([]);
    setFormError("");
    setIsModalOpen(true);
  };

  const openAssignBatchModal = (user: User) => {
    setAssignBatchUser(user);
    setAssignBatchId(user.batchId || "");
  };

  const handleAssignBatchSubmit = async () => {
    if (!assignBatchUser) return;
    setIsAssigningBatch(true);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/users/${assignBatchUser.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ batchId: assignBatchId || null }),
      });
      if (res.ok) {
        toastSuccess(`Assigned ${assignBatchUser.name || "user"} to cohort.`);
        setAssignBatchUser(null);
        fetchUsers();
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.message || "Failed to assign batch");
      }
    } catch (e: any) {
      alert(e.message || "Connection error");
    } finally {
      setIsAssigningBatch(false);
    }
  };

  const handleOpenRevokeModal = (user: User) => {
    setRevokingUser(user);
    setIsRevokeModalOpen(true);
  };

  const handleSaveUser = async (e: FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setFormError("");

    if (role === "SUPER_ADMIN" && !isSuperAdmin) {
      setFormError("Security rule: Only Super Admins can assign the Super Admin role.");
      return;
    }

    setIsSubmitting(true);
    const payload: Record<string, any> = {
      email,
      name: `${firstName} ${lastName}`.trim(),
      role,
      permissions,
      batchId: cohort || null,
      cohort: cohort || undefined,
      enrolmentId: editingEnrolmentId || undefined,
      status,
      ...(password ? { password } : {}),
    };

    if (role === "MANAGER") {
      payload.batchIds = selectedManagerBatchIds;
    }

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
        setIsModalOpen(false);
        setEmail("");
        setFirstName("");
        setLastName("");
        setEditingUserId(null);
        setEditingEnrolmentId(null);
        setEditingUserEnrolments([]);
        toastSuccess(editingUserId ? "User updated successfully." : "User created successfully.");
        fetchUsers();
      } else {
        const data = await res.json().catch(() => null);
        const raw = data?.error?.message ?? data?.message;
        setFormError((Array.isArray(raw) ? raw.join(", ") : raw) || `Could not save the user (error ${res.status}).`);
      }
    } catch (e) {
      console.error("Failed to save user", e);
      setFormError("Could not reach the server. Check that the API is running.");
    } finally {
      setIsSubmitting(false);
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
        <div className={styles.tabsContainer} role="tablist" aria-label="User directory views" style={{ gap: "0.5rem", flexWrap: "wrap" }}>
          <button 
            type="button"
            role="tab"
            aria-selected={roleFilter === "ALL"}
            className={`${styles.tabBtn} ${roleFilter === "ALL" ? styles.tabBtnActive : ""}`}
            onClick={() => { setRoleFilter("ALL"); setViewMode("LEARNERS"); setPage(1); }}
          >
            All Roles
          </button>
          <button 
            type="button"
            role="tab"
            aria-selected={roleFilter === "USER"}
            className={`${styles.tabBtn} ${roleFilter === "USER" ? styles.tabBtnActive : ""}`}
            onClick={() => { setRoleFilter("USER"); setViewMode("LEARNERS"); setPage(1); }}
          >
            Learners (USER)
          </button>
          <button 
            type="button"
            role="tab"
            aria-selected={roleFilter === "MANAGER"}
            className={`${styles.tabBtn} ${roleFilter === "MANAGER" ? styles.tabBtnActive : ""}`}
            onClick={() => { setRoleFilter("MANAGER"); setViewMode("STAFF"); setPage(1); }}
          >
            Batch Managers
          </button>
          <button 
            type="button"
            role="tab"
            aria-selected={roleFilter === "ADMIN"}
            className={`${styles.tabBtn} ${roleFilter === "ADMIN" ? styles.tabBtnActive : ""}`}
            onClick={() => { setRoleFilter("ADMIN"); setViewMode("STAFF"); setPage(1); }}
          >
            Admins
          </button>
          <button 
            type="button"
            role="tab"
            aria-selected={roleFilter === "SUPER_ADMIN"}
            className={`${styles.tabBtn} ${roleFilter === "SUPER_ADMIN" ? styles.tabBtnActive : ""}`}
            onClick={() => { setRoleFilter("SUPER_ADMIN"); setViewMode("STAFF"); setPage(1); }}
          >
            Super Admins
          </button>
        </div>
      )}

      <section className={styles.tableSection}>
        <div className={styles.sectionHeader}>
          <h2>
            {roleFilter === "ALL"
              ? "All Platform Accounts"
              : roleFilter === "USER"
              ? "Learners"
              : roleFilter === "MANAGER"
              ? "Batch Managers"
              : roleFilter === "ADMIN"
              ? "Administrators"
              : "Super Administrators"}{" "}
            ({totalUsers})
          </h2>
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

        {actionError && (
          <div role="alert" style={{ margin: "0.5rem 0 1rem", padding: "0.75rem 1rem", borderRadius: "8px", background: "#fef2f2", color: "#b91c1c", fontSize: "0.85rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span>{actionError}</span>
            <button type="button" onClick={() => setActionError(null)} style={{ background: "none", border: "none", color: "#b91c1c", cursor: "pointer", fontWeight: "bold" }}>×</button>
          </div>
        )}
        
        <div className={styles.tableWrapper}>
          <table className={styles.adminTable}>
            <thead>
              <tr>
                <th>User &amp; Profile</th>
                <th>Role</th>
                <th>Enrolled Courses</th>
                <th>Unlocked Step</th>
                <th>Agreement</th>
                <th>Security</th>
                <th>Cohort / Scoping</th>
                <th className={styles.alignRight}>Action</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <TableSkeleton columns={8} rows={6} />
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ padding: "32px 16px" }}>
                    <EmptyState
                      icon="users"
                      title="No users found"
                      description="No user records matched your filter criteria or search query."
                      actionLabel={search || roleFilter !== "ALL" ? "Reset Filters" : "Add First User"}
                      onAction={search || roleFilter !== "ALL" ? () => { setSearch(""); setRoleFilter("ALL"); } : () => openCreateModal()}
                    />
                  </td>
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
                  <td>
                    <StatusBadge status={user.role} />
                  </td>
                  <td>
                    {user.enrolments && user.enrolments.length > 0 ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                        <span style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--text-primary)" }}>
                          {user.enrolments[0]?.programTitle || "11 Steps to You"}
                        </span>
                        {user.enrolments.length > 1 && (
                          <span style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>
                            +{user.enrolments.length - 1} other program{user.enrolments.length > 2 ? "s" : ""}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className={styles.cellTextMuted}>{user.role === "USER" ? "None" : "—"}</span>
                    )}
                  </td>
                  <td>
                    {user.role === "USER" ? (
                      <span style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "4px",
                        fontSize: "0.75rem",
                        fontWeight: 700,
                        background: "#fef3c7",
                        color: "#92400e",
                        border: "1px solid #fde68a",
                        padding: "2px 8px",
                        borderRadius: "100px",
                      }}>
                        Step {user.currentStepNumber || 1} / 11
                      </span>
                    ) : (
                      <span className={styles.cellTextMuted}>Global LMS</span>
                    )}
                  </td>
                  <td>
                    {user.role === "USER" ? (
                      user.isAgreementSigned ? (
                        <span style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "4px",
                          fontSize: "0.75rem",
                          fontWeight: 700,
                          background: "#dcfce7",
                          color: "#15803d",
                          border: "1px solid #bbf7d0",
                          padding: "2px 8px",
                          borderRadius: "100px",
                        }}>
                          ✓ Signed
                        </span>
                      ) : (
                        <span style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "4px",
                          fontSize: "0.75rem",
                          fontWeight: 700,
                          background: "#fee2e2",
                          color: "#b91c1c",
                          border: "1px solid #fecaca",
                          padding: "2px 8px",
                          borderRadius: "100px",
                        }}>
                          Pending
                        </span>
                      )
                    ) : (
                      <span className={styles.cellTextMuted}>Staff</span>
                    )}
                  </td>
                  <td>
                    {user.twoFactorEnabled ? (
                      <span style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "4px",
                        fontSize: "0.75rem",
                        fontWeight: 700,
                        background: "#ecfdf5",
                        color: "#047857",
                        border: "1px solid #a7f3d0",
                        padding: "2px 8px",
                        borderRadius: "100px",
                      }}>
                        🔒 2FA On
                      </span>
                    ) : (
                      <span style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "4px",
                        fontSize: "0.75rem",
                        fontWeight: 600,
                        background: "#f1f5f9",
                        color: "#64748b",
                        border: "1px solid #e2e8f0",
                        padding: "2px 8px",
                        borderRadius: "100px",
                      }}>
                        2FA Off
                      </span>
                    )}
                  </td>
                  <td>
                    {user.role === "MANAGER" ? (
                      user.managedBatches && user.managedBatches.length > 0 ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                          <span style={{ fontSize: "0.8rem", fontWeight: 700, color: "#1e3a8a" }}>
                            {user.managedBatches[0]?.name}
                          </span>
                          {user.managedBatches.length > 1 && (
                            <span style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>
                              +{user.managedBatches.length - 1} more cohort{user.managedBatches.length > 2 ? "s" : ""}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span style={{ fontSize: "0.75rem", color: "#b45309", fontWeight: 600 }}>Unassigned</span>
                      )
                    ) : (
                      <span className={styles.cellText}>{user.cohort || "—"}</span>
                    )}
                  </td>
                  <td className={styles.alignRight}>
                    <ActionMenu
                      ariaLabel={`Actions for ${user.name}`}
                      items={[
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
                          label: "Assign Batch",
                          onClick: () => openAssignBatchModal(user),
                          icon: (
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <polygon points="12 2 2 7 12 12 22 7 12 2" />
                              <polyline points="2 17 12 22 22 17" />
                              <polyline points="2 12 12 17 22 12" />
                            </svg>
                          ),
                        },
                        ...(!isManager
                          ? [
                              {
                                label: "Edit Role / Profile",
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
                                onClick: () => handleOpenRevokeModal(user),
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
                          : []),
                      ]}
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
                              <span>Requires Super Admin role</span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* 4. ASSIGNED COHORT / BATCH (SEPARATE MANAGER ASSIGNMENT) */}
                {editingUserEnrolments.length > 1 && role === "USER" && (
                  <div className={styles.formGroup} style={{ marginTop: "0.35rem" }}>
                    <label>Enrolment to Update ({editingUserEnrolments.length} total)</label>
                    <CustomSelect
                      value={editingEnrolmentId || ""}
                      onChange={(val) => {
                        setEditingEnrolmentId(val);
                        const selected = editingUserEnrolments.find(e => e.id === val);
                        if (selected?.batchId) {
                          setCohort(selected.batchId);
                        }
                      }}
                      options={editingUserEnrolments.map((e) => ({
                        value: e.id,
                        label: `${e.programTitle || 'Program'} - ${e.batchName || 'Unassigned Batch'} [${e.status}]`,
                      }))}
                      fullWidth
                      ariaLabel="Select enrolment to update"
                    />
                  </div>
                )}

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

                {/* 4b. MANAGER SCOPED BATCH SELECTION (MULTI-BATCH ACCESS CONTROL) */}
                {role === "MANAGER" && (
                  <div className={styles.formGroup} style={{ marginTop: "0.5rem", background: "#fdfbf7", padding: "0.85rem", borderRadius: "8px", border: "1px solid var(--border-light)" }}>
                    <label style={{ fontSize: "0.82rem", fontWeight: 700, color: "var(--text-primary)", display: "block", marginBottom: "0.35rem" }}>
                      Scoped Batches (Select which cohorts this Manager is permitted to manage &amp; reconcile):
                    </label>
                    <p style={{ margin: "0 0 0.5rem 0", fontSize: "0.75rem", color: "var(--text-muted)" }}>
                      Per v2.0 RBAC, Managers are strictly batch-isolated. Check all cohorts this user manages:
                    </p>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "0.45rem", maxHeight: "140px", overflowY: "auto", padding: "4px" }}>
                      {batches.map((b) => (
                        <label key={b.id} style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.8rem", cursor: "pointer" }}>
                          <input
                            type="checkbox"
                            checked={selectedManagerBatchIds.includes(b.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedManagerBatchIds((prev) => [...prev, b.id]);
                              } else {
                                setSelectedManagerBatchIds((prev) => prev.filter((id) => id !== b.id));
                              }
                            }}
                          />
                          <span>{b.name}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}

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
                <button type="submit" className={styles.primaryBtn} disabled={isSubmitting}>
                  {isSubmitting ? (
                    <>
                      <span className="spinner" /> Saving...
                    </>
                  ) : (
                    editingUserId ? "Save Changes" : "Add User"
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Quick Assign Batch Modal */}
      {assignBatchUser && (
        <div className={styles.modalOverlay} role="dialog" aria-modal="true" aria-labelledby="assign-batch-title">
          <div className={styles.modal} style={{ maxWidth: 480 }}>
            <div className={styles.modalHeader}>
              <h2 id="assign-batch-title" className={styles.modalTitle}>
                Assign Batch: {assignBatchUser.name || assignBatchUser.email}
              </h2>
              <button
                type="button"
                className={styles.closeBtn}
                onClick={() => setAssignBatchUser(null)}
                aria-label="Close modal"
              >
                &times;
              </button>
            </div>
            <div className={styles.modalBody}>
              <p style={{ fontSize: "0.875rem", color: "#64748b", marginBottom: "1rem" }}>
                Select an active workshop batch or cohort for this learner. This will scope their session schedule and attendance.
              </p>
              <div className={styles.formGroup}>
                <label className={styles.label}>Select Cohort / Batch</label>
                <CustomSelect
                  options={[
                    { value: "", label: "No Batch Assigned (Unassigned)" },
                    ...batches.map(b => ({
                      value: b.id,
                      label: b.name
                    }))
                  ]}
                  value={assignBatchId}
                  onChange={(val) => setAssignBatchId(val)}
                  placeholder="Select cohort..."
                />
              </div>
            </div>
            <div className={styles.modalFooter}>
              <button
                type="button"
                className={styles.secondaryBtn}
                onClick={() => setAssignBatchUser(null)}
                disabled={isAssigningBatch}
              >
                Cancel
              </button>
              <button
                type="button"
                className={styles.primaryBtn}
                onClick={handleAssignBatchSubmit}
                disabled={isAssigningBatch}
              >
                {isAssigningBatch ? (
                  <>
                    <span className="spinner" /> Saving...
                  </>
                ) : (
                  "Save Assignment"
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Branded, Accessible Revoke Access Confirmation Modal */}
      <RevokeAccessModal
        isOpen={isRevokeModalOpen}
        onClose={() => setIsRevokeModalOpen(false)}
        user={revokingUser}
        onSuccess={fetchUsers}
      />

    </div>
  );
}
