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
  const [password, setPassword] = useState("");
  const [permissions, setPermissions] = useState<string[]>([]);
  const [formError, setFormError] = useState("");
  // only a super admin may create another super admin
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);

  useEffect(() => {
    try {
      setIsSuperAdmin(JSON.parse(localStorage.getItem("user") || "{}").role === "SUPER_ADMIN");
    } catch {
      setIsSuperAdmin(false);
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
    setCohort(""); // Real implementation would resolve cohort to batch ID
    setRole(user.role || "USER");
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
    // only the fields the API accepts; a blank password on edit leaves it unchanged
    const payload = {
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
        setIsModalOpen(false);
        setEmail("");
        setFirstName("");
        setLastName("");
        setEditingUserId(null);
        fetchUsers();
      } else {
        // the API wraps errors as { error: { code, message } }
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
          <p className={styles.subtitle}>Manage all learners across your programs.</p>
        </div>
        <div className={styles.headerActions}>
          <button className={styles.primaryBtn} onClick={openCreateModal}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            <span>Add User</span>
          </button>
        </div>
      </header>

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

      {/* INVITE USER MODAL */}
      {isModalOpen && (
        <div className={styles.modalOverlay} onClick={() => setIsModalOpen(false)}>
          <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2>{editingUserId ? "Edit User" : "Add New User"}</h2>
              <button className={styles.closeBtn} onClick={() => setIsModalOpen(false)}>×</button>
            </div>
            
            <form className={styles.modalForm} onSubmit={handleSaveUser}>
              <div className={styles.modalBody}>
                <div className={styles.formGroup}>
                  <label>Email</label>
                  <input type="email" placeholder="name@example.com" required value={email} onChange={e => setEmail(e.target.value)} />
                </div>

                <div className={styles.formRow}>
                  <div className={styles.formGroup}>
                    <label>First Name</label>
                    <input type="text" placeholder="John" required value={firstName} onChange={e => setFirstName(e.target.value)} />
                  </div>
                  <div className={styles.formGroup}>
                    <label>Last Name</label>
                    <input type="text" placeholder="Doe" required value={lastName} onChange={e => setLastName(e.target.value)} />
                  </div>
                </div>
                
                <div className={styles.formRow}>
                  <div className={styles.formGroup}>
                    <label>Role</label>
                    <CustomSelect
                      value={role}
                      onChange={(val) => setRole(val)}
                      options={[
                        { value: "USER", label: "Learner" },
                        { value: "TEACHER", label: "Teacher / Instructor" },
                        { value: "MANAGER", label: "Manager" },
                        { value: "ADMIN", label: "Admin" },
                        ...(isSuperAdmin
                          ? [{ value: "SUPER_ADMIN", label: "Super Admin" }]
                          : []),
                      ]}
                      fullWidth
                      ariaLabel="Select user role"
                    />
                  </div>
                  <div className={styles.formGroup}>
                    <label>{editingUserId ? "New Password (optional)" : "Temporary Password"}</label>
                    <input type="text" autoComplete="off" minLength={8} required={!editingUserId} placeholder={editingUserId ? "Leave blank to keep current" : "At least 8 characters"} value={password} onChange={e => setPassword(e.target.value)} />
                  </div>
                </div>

                <div className={styles.formGroup}>
                  <label>Assign to Cohort (Optional)</label>
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
                </div>

                {/* Dynamic Permissions Checkboxes (Only Super Admin can assign these to Admins/Managers/Teachers) */}
                {isSuperAdmin && ["ADMIN", "MANAGER", "TEACHER"].includes(role) && (
                  <div className={styles.formGroup} style={{ marginTop: "0.5rem" }}>
                    <label style={{ marginBottom: "0.5rem" }}>Custom Module Access</label>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
                      {[
                        { id: "view_users", label: "Users & Enrolments" },
                        { id: "view_batches", label: "Batches & Cohorts" },
                        { id: "manage_curriculum", label: "Curriculum & Programs" },
                        { id: "manage_website", label: "Website Content & CRM" },
                        { id: "view_finance", label: "Finance & Revenue" },
                        { id: "manage_operations", label: "Operations & Meetings" }
                      ].map(perm => (
                        <label key={perm.id} style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.85rem", fontWeight: 500, cursor: "pointer" }}>
                          <input 
                            type="checkbox" 
                            checked={permissions.includes(perm.id)} 
                            onChange={(e) => {
                              if (e.target.checked) setPermissions(prev => [...prev, perm.id]);
                              else setPermissions(prev => prev.filter(p => p !== perm.id));
                            }} 
                          />
                          {perm.label}
                        </label>
                      ))}
                    </div>
                  </div>
                )}

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
