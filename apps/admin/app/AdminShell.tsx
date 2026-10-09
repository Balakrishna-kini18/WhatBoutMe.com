"use client";

import styles from "./layout.module.css";
import Link from "next/link";
import { useEffect, useState, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";

interface UserData {
  id: string;
  email: string;
  name: string;
  role: string;
  permissions?: string[];
}

// Crisp stroke icons matching the brand aesthetic
const Icons = {
  Dashboard: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  ),
  Users: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
  Batches: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 2 7 12 12 22 7 12 2" />
      <polyline points="2 17 12 22 22 17" />
      <polyline points="2 12 12 17 22 12" />
    </svg>
  ),
  Analytics: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
    </svg>
  ),
  Programs: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  ),
  QuestionBank: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </svg>
  ),
  Agreements: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <path d="M9 15l2 2 4-4" />
    </svg>
  ),
  Certificates: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="6" />
      <path d="M15.4 13.8L18 22l-6-3-6 3 2.6-8.2" />
    </svg>
  ),
  Resources: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  ),
  Messages: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  ),
  Enquiries: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 6l9 7 9-7" />
    </svg>
  ),
  Announcements: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  ),
  WebsiteContent: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  ),
  MediaLibrary: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <polyline points="21 15 16 10 5 21" />
    </svg>
  ),
  Settings: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  ),
  Search: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  ),
  Bell: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  ),
  Sun: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="5" />
      <line x1="12" y1="1" x2="12" y2="3" />
      <line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1" y1="12" x2="3" y2="12" />
      <line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
  ),
  ChevronRight: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  ),
  ChevronDown: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  ),
  CollapseIcon: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="11 19 4 12 11 5" />
      <polyline points="18 19 11 12 18 5" />
    </svg>
  ),
  Logout: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  ),
  Menu: () => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  ),
  Close: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
};

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<UserData | null>(null);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (pathname === "/login") return;

    const token = localStorage.getItem("token");
    const storedUser = localStorage.getItem("user");

    if (!token || !storedUser) {
      router.push("/login");
      return;
    }

    try {
      setUser(JSON.parse(storedUser));
    } catch {
      localStorage.removeItem("user");
      router.push("/login");
    }
  }, [pathname, router]);

  // Keyboard shortcut for search palette (Ctrl+K / Cmd+K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchModalOpen((prev) => !prev);
      }
      if (e.key === "Escape") {
        setSearchModalOpen(false);
        setUserDropdownOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setUserDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Close mobile drawer on route change
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  const handleSignOut = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("refresh_token");
    localStorage.removeItem("user");
    router.push("/login");
  };

  if (pathname === "/login") {
    return <>{children}</>;
  }

  const userName = user?.name || "Super Admin Roweena";
  const userRole = user?.role === "SUPER_ADMIN" ? "Super Admin" : user?.role === "TEACHER" ? "Teacher" : user?.role === "MANAGER" ? "Manager" : "Super Admin";
  const initials = userName
    .split(" ")
    .map((n: string) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2) || "SA";

  const hasPermission = (perm: string) => {
    if (!user || user.role === "SUPER_ADMIN") return true;
    if (!user?.permissions) return true; // Default fallback to ensure accessibility
    switch (perm) {
      case "view_users":
        return user.permissions.includes("users:read") || user.permissions.includes("users:read_assigned");
      case "view_batches":
        return user.permissions.includes("batches:read") || user.permissions.includes("batches:read_assigned");
      case "manage_curriculum":
        return user.permissions.includes("programs:read");
      case "manage_website":
        return user.role === "ADMIN" || user.role === "SUPER_ADMIN";
      case "view_finance":
        return user.permissions.includes("payments:read") || user.permissions.includes("invoices:read");
      case "manage_operations":
        return user.permissions.includes("sessions:read") || user.permissions.includes("certificates:read");
      default:
        return true;
    }
  };

  const navGroups = [
    {
      title: "OVERVIEW",
      permission: true,
      items: [
        { label: "Users & Enrolments", href: "/users", icon: <Icons.Users />, perm: "view_users" },
        { label: "Batches", href: "/batches", icon: <Icons.Batches />, perm: "view_batches" },
        { label: "Analytics", href: "/revenue", icon: <Icons.Analytics />, perm: "view_finance" },
      ],
    },
    {
      title: "CURRICULUM",
      permission: hasPermission("manage_curriculum"),
      items: [
        { label: "Programs", href: "/programs", icon: <Icons.Programs />, perm: "manage_curriculum" },
        { label: "Question Bank", href: "/quizzes", icon: <Icons.QuestionBank />, perm: "manage_curriculum" },
        { label: "Agreements", href: "/agreements", icon: <Icons.Agreements />, perm: "manage_operations" },
        { label: "Certificates", href: "/certificates", icon: <Icons.Certificates />, perm: "manage_operations" },
        { label: "Resources", href: "/programs", icon: <Icons.Resources />, perm: "manage_curriculum" },
      ],
    },
    {
      title: "COMMUNICATION",
      permission: hasPermission("manage_operations"),
      items: [
        { label: "Messages", href: "/messages", icon: <Icons.Messages />, perm: "manage_operations" },
        { label: "Enquiries (CRM)", href: "/leads", icon: <Icons.Enquiries />, perm: "manage_website" },
        { label: "Announcements", href: "/meetings", icon: <Icons.Announcements />, perm: "manage_operations" },
      ],
    },
    {
      title: "WEBSITE",
      permission: hasPermission("manage_website"),
      items: [
        { label: "Website Content", href: "/website", icon: <Icons.WebsiteContent />, perm: "manage_website" },
        { label: "Media Library", href: "/website", icon: <Icons.MediaLibrary />, perm: "manage_website" },
        { label: "Settings", href: "/users", icon: <Icons.Settings />, perm: "manage_website" },
      ],
    },
  ];

  return (
    <div className={`${styles.appContainer} ${isCollapsed ? styles.collapsed : ""}`}>
      {/* Mobile Drawer Backdrop */}
      {mobileMenuOpen && (
        <div className={styles.mobileBackdrop} onClick={() => setMobileMenuOpen(false)} />
      )}

      {/* Admin Sidebar */}
      <aside className={`${styles.sidebar} ${mobileMenuOpen ? styles.mobileOpen : ""}`}>
        {/* Brand Header */}
        <div className={styles.logoArea}>
          <Link href="/" className={styles.brandLink}>
            <div className={styles.brandWordmark}>
              <span className={styles.brandName}>whataboutme</span>
              <span className={styles.brandHeart} role="img" aria-label="heart">💛</span>
            </div>
            <span className={styles.adminBadge}>ADMIN</span>
          </Link>
          <button
            type="button"
            className={styles.collapseToggle}
            onClick={() => setIsCollapsed(!isCollapsed)}
            title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-label="Toggle sidebar"
          >
            <Icons.CollapseIcon />
          </button>
        </div>

        {/* Navigation Menu */}
        <nav className={styles.navMenu}>
          {/* Top Single Link: Dashboard */}
          <div className={styles.topDashboardLink}>
            <Link
              href="/"
              className={`${styles.navItem} ${styles.dashboardLink} ${pathname === "/" ? styles.activeDashboard : ""}`}
            >
              <span className={styles.navIcon}><Icons.Dashboard /></span>
              <span className={styles.navLabel}>Dashboard</span>
              <span className={styles.navChevron}><Icons.ChevronRight /></span>
            </Link>
          </div>

          {/* Categorized Groups */}
          {navGroups.map((group) => (
            <div key={group.title} className={styles.navGroup}>
              <p className={styles.navTitle}>{group.title}</p>
              {group.items.map((item) => {
                const isActive = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
                return (
                  <Link
                    key={item.label}
                    href={item.href}
                    className={`${styles.navItem} ${isActive ? styles.active : ""}`}
                  >
                    <span className={styles.navIcon}>{item.icon}</span>
                    <span className={styles.navLabel}>{item.label}</span>
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        {/* Sidebar Bottom Profile Pill */}
        <div className={styles.sidebarBottom}>
          <div className={styles.bottomProfileCard} onClick={() => setUserDropdownOpen(!userDropdownOpen)}>
            <div className={styles.avatarWrap}>
              <div className={styles.bottomAvatar}>{initials}</div>
            </div>
            <div className={styles.bottomProfileInfo}>
              <div className={styles.bottomProfileName}>{userName}</div>
              <div className={styles.bottomProfileRole}>{userRole}</div>
            </div>
            <span className={styles.bottomProfileChevron}><Icons.ChevronRight /></span>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className={styles.mainWrapper}>
        {/* Top Bar */}
        <header className={styles.topbar}>
          {/* Mobile Menu Button */}
          <button
            type="button"
            className={styles.mobileMenuBtn}
            onClick={() => setMobileMenuOpen(true)}
            aria-label="Open navigation menu"
          >
            <Icons.Menu />
          </button>

          {/* Search Bar Pill */}
          <div className={styles.searchContainer} onClick={() => setSearchModalOpen(true)}>
            <span className={styles.searchIcon}><Icons.Search /></span>
            <input
              type="text"
              readOnly
              placeholder="Search users, batches, programs, invoices..."
              className={styles.searchInput}
            />
            <div className={styles.searchShortcut}>Ctrl K</div>
          </div>

          {/* Topbar Actions */}
          <div className={styles.topbarActions}>
            <button
              type="button"
              className={styles.iconBtn}
              title="Notifications"
              aria-label="Notifications"
            >
              <Icons.Bell />
              <span className={styles.notificationDot} />
            </button>

            <button
              type="button"
              className={styles.iconBtn}
              title="Theme settings"
              aria-label="Theme settings"
            >
              <Icons.Sun />
            </button>

            {/* User Profile Pill */}
            <div className={styles.profileContainer} ref={dropdownRef}>
              <button
                type="button"
                className={styles.userProfile}
                onClick={() => setUserDropdownOpen(!userDropdownOpen)}
                aria-expanded={userDropdownOpen}
              >
                <div className={styles.avatar}>{initials}</div>
                <div className={styles.userInfo}>
                  <span className={styles.userName}>{userName}</span>
                  <span className={styles.userRole}>{userRole}</span>
                </div>
                <div className={styles.userChevron}><Icons.ChevronDown /></div>
              </button>

              {/* User Dropdown */}
              {userDropdownOpen && (
                <div className={styles.userDropdown}>
                  <div className={styles.dropdownHeader}>
                    <p className={styles.dropdownName}>{userName}</p>
                    <p className={styles.dropdownEmail}>{user?.email || "admin@whataboutme.com"}</p>
                  </div>
                  <div className={styles.dropdownDivider} />
                  <Link href="/users" className={styles.dropdownItem} onClick={() => setUserDropdownOpen(false)}>
                    <Icons.Users /> Manage Profile
                  </Link>
                  <Link href="/website" className={styles.dropdownItem} onClick={() => setUserDropdownOpen(false)}>
                    <Icons.Settings /> Settings
                  </Link>
                  <div className={styles.dropdownDivider} />
                  <button type="button" className={`${styles.dropdownItem} ${styles.dropdownSignOut}`} onClick={handleSignOut}>
                    <Icons.Logout /> Sign Out
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Page Inner Content */}
        <main className={styles.mainContent}>
          <div className={styles.contentInner}>
            {children}
          </div>
        </main>
      </div>

      {/* Interactive Command Palette / Search Modal */}
      {searchModalOpen && (
        <div className={styles.searchModalOverlay} onClick={() => setSearchModalOpen(false)}>
          <div className={styles.searchModalBox} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalSearchInputWrap}>
              <Icons.Search />
              <input
                autoFocus
                type="text"
                placeholder="Type to search users, batches, programs..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={styles.modalSearchInput}
              />
              <button type="button" className={styles.modalCloseBtn} onClick={() => setSearchModalOpen(false)}>
                <Icons.Close />
              </button>
            </div>
            <div className={styles.modalSearchResults}>
              <p className={styles.modalSectionLabel}>QUICK NAVIGATION</p>
              <div className={styles.modalQuickLinks}>
                <button
                  type="button"
                  className={styles.modalQuickItem}
                  onClick={() => {
                    router.push("/users");
                    setSearchModalOpen(false);
                  }}
                >
                  <Icons.Users />
                  <div>
                    <strong>Users & Enrolments</strong>
                    <span>Manage all registered learners and staff</span>
                  </div>
                </button>
                <button
                  type="button"
                  className={styles.modalQuickItem}
                  onClick={() => {
                    router.push("/batches");
                    setSearchModalOpen(false);
                  }}
                >
                  <Icons.Batches />
                  <div>
                    <strong>Batches</strong>
                    <span>Active cohorts and live schedule</span>
                  </div>
                </button>
                <button
                  type="button"
                  className={styles.modalQuickItem}
                  onClick={() => {
                    router.push("/programs");
                    setSearchModalOpen(false);
                  }}
                >
                  <Icons.Programs />
                  <div>
                    <strong>Programs & Curriculum</strong>
                    <span>11 Steps to You, Vision Board, etc.</span>
                  </div>
                </button>
                <button
                  type="button"
                  className={styles.modalQuickItem}
                  onClick={() => {
                    router.push("/revenue");
                    setSearchModalOpen(false);
                  }}
                >
                  <Icons.Analytics />
                  <div>
                    <strong>Revenue & Finance</strong>
                    <span>Invoices, transactions and reporting</span>
                  </div>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
