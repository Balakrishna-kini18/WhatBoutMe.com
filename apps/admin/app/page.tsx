"use client";

import { useEffect, useState } from "react";
import styles from "./page.module.css";
import Link from "next/link";

// SVGs
const Icons = {
  Report: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>,
  Plus: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>,
  Users: () => <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>,
  Layers: () => <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"></polygon><polyline points="2 17 12 22 22 17"></polyline><polyline points="2 12 12 17 22 12"></polyline></svg>,
  Coins: () => <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"></ellipse><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"></path><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"></path></svg>,
  ChevronRight: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>,
  ArrowRight: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>,
  More: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="1"></circle><circle cx="19" cy="12" r="1"></circle><circle cx="5" cy="12" r="1"></circle></svg>,
  ChartBars: () => <svg width="60" height="40" viewBox="0 0 60 40" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="0" y="20" width="8" height="20" rx="2" fill="currentColor"/><rect x="12" y="10" width="8" height="30" rx="2" fill="currentColor"/><rect x="24" y="25" width="8" height="15" rx="2" fill="currentColor"/><rect x="36" y="5" width="8" height="35" rx="2" fill="currentColor"/><rect x="48" y="15" width="8" height="25" rx="2" fill="currentColor"/></svg>
};

export default function AdminDashboard() {
  const [users, setUsers] = useState<any[]>([]);
  const [batches, setBatches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        const token = localStorage.getItem("token");
        const headers = { Authorization: `Bearer ${token}` };
        
        const [usersRes, batchesRes] = await Promise.all([
          fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/users`, { headers }),
          fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/batches`, { headers })
        ]);

        if (usersRes.ok && batchesRes.ok) {
          const usersData = await usersRes.json();
          const batchesData = await batchesRes.json();
          setUsers(usersData);
          setBatches(batchesData);
        }
      } catch (e) {
        console.error("Failed to fetch dashboard data", e);
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, []);

  const totalLearners = users.filter(u => u.role === "LEARNER" || u.role === "USER").length;
  const totalBatches = batches.length;
  const mockRevenue = "$28,500"; // Pending real Stripe integration endpoint

  const avatarClasses = [styles.avatar1, styles.avatar2, styles.avatar3, styles.avatar4, styles.avatar5];

  const getRoleClass = (role: string) => {
    if (role === "SUPER_ADMIN" || role === "ADMIN") return styles.roleAdmin;
    if (role === "MANAGER") return styles.roleManager;
    return styles.roleUser;
  };

  return (
    <div className={styles.dashboard}>
      <header className={styles.header}>
        <div className={styles.headerText}>
          <span className={styles.welcomeText}>WELCOME BACK</span>
          <h1 className={styles.title}>Overview</h1>
          <p className={styles.subtitle}>Track your programs, enrolments, and revenue metrics.</p>
        </div>
        <div className={styles.headerActions}>
          <button className={styles.secondaryBtn}>
            <Icons.Report /> Export Report
          </button>
          <Link href="/batches/create" className={styles.primaryBtn}>
            <Icons.Plus /> Create Batch
          </Link>
        </div>
      </header>

      <div className={styles.statsGrid}>
        {/* Total Learners */}
        <div className={styles.statCard}>
          <div className={styles.statContent}>
            <div className={`${styles.statIconBox} ${styles.statGreen}`}>
              <Icons.Users />
            </div>
            <div className={styles.statText}>
              <h3>Total Learners</h3>
              <p className={styles.statValue}>{loading ? "..." : totalLearners}</p>
              <div className={`${styles.statBadge} ${styles.badgeGreen}`}>
                <div className={`${styles.dot} ${styles.dotGreen}`}></div> Active System
              </div>
            </div>
          </div>
          <div className={styles.statChevron}><Icons.ChevronRight /></div>
          <div className={styles.statBgChart} style={{ color: 'var(--accent-highlight)' }}><Icons.ChartBars /></div>
        </div>

        {/* Total Batches */}
        <div className={styles.statCard}>
          <div className={styles.statContent}>
            <div className={`${styles.statIconBox} ${styles.statPurple}`}>
              <Icons.Layers />
            </div>
            <div className={styles.statText}>
              <h3>Total Batches</h3>
              <p className={styles.statValue}>{loading ? "..." : totalBatches}</p>
              <div className={`${styles.statBadge} ${styles.badgePurple}`}>
                <div className={`${styles.dot} ${styles.dotPurple}`}></div> All programs
              </div>
            </div>
          </div>
          <div className={styles.statChevron}><Icons.ChevronRight /></div>
          <div className={styles.statBgChart} style={{ color: '#f3f0ff' }}><Icons.ChartBars /></div>
        </div>

        {/* Total Revenue */}
        <div className={styles.statCard}>
          <div className={styles.statContent}>
            <div className={`${styles.statIconBox} ${styles.statOrange}`}>
              <Icons.Coins />
            </div>
            <div className={styles.statText}>
              <h3>Total Revenue</h3>
              <p className={styles.statValue}>{mockRevenue}</p>
              <div className={`${styles.statBadge} ${styles.badgeOrange}`}>
                <div className={`${styles.dot} ${styles.dotOrange}`}></div> Integration Pending
              </div>
            </div>
          </div>
          <div className={styles.statChevron}><Icons.ChevronRight /></div>
          <div className={styles.statBgChart} style={{ color: '#fff7ed' }}><Icons.ChartBars /></div>
        </div>
      </div>

      <section className={styles.tableSection}>
        <div className={styles.sectionHeader}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <div style={{ padding: '0.4rem', background: 'var(--accent-highlight)', color: 'var(--accent-primary)', borderRadius: '8px', display: 'flex' }}>
                <Icons.Report />
              </div>
              <h2>Recent Enrolments</h2>
            </div>
            <p className={styles.sectionSubtitle}>Latest users who have enrolled in your programs.</p>
          </div>
          <Link href="/users" className={styles.viewAllBtn}>
            View All <Icons.ArrowRight />
          </Link>
        </div>
        
        <div className={styles.tableWrapper}>
          <table className={styles.adminTable}>
            <thead>
              <tr>
                <th>Learner</th>
                <th>Email</th>
                <th>Status</th>
                <th>Role</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: "center", padding: "30px", color: 'var(--text-secondary)' }}>Loading data...</td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: "center", padding: "30px", color: 'var(--text-secondary)' }}>No recent enrolments.</td>
                </tr>
              ) : (
                users.slice(0, 5).map((user, idx) => {
                  const initial = user.name ? user.name[0].toUpperCase() : user.email[0].toUpperCase();
                  const avatarClass = avatarClasses[idx % avatarClasses.length];
                  
                  return (
                    <tr key={user.id}>
                      <td>
                        <div className={styles.learnerCell}>
                          <div className={`${styles.learnerAvatar} ${avatarClass}`}>{initial}</div>
                          <span className={styles.cellUserName}>{user.name || "N/A"}</span>
                        </div>
                      </td>
                      <td>
                        <span className={styles.cellUserEmail}>{user.email}</span>
                      </td>
                      <td>
                        <div className={styles.statusChip}>
                          <div className={styles.statusDot}></div>
                          {user.status === "ACTIVE" ? "Active" : user.status || "Active"}
                        </div>
                      </td>
                      <td>
                        <span className={`${styles.roleText} ${getRoleClass(user.role)}`}>{user.role}</span>
                      </td>
                      <td>
                        <div className={styles.actionBtn}>
                          <Icons.More />
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
    </div>
  );
}
