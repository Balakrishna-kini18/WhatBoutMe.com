"use client";

import styles from "./layout.module.css";
import Link from "next/link";
import Image from "next/image";
import { useEffect, useState, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";

interface UserData {
  id: string;
  email: string;
  name: string;
  role: string;
  permissions?: string[];
}

// Crisp, uniform 1.75px stroke icons matching the WhatBoutMe brand identity
const Icons = {
  Dashboard: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  ),
  Users: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
  Batches: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 2 7 12 12 22 7 12 2" />
      <polyline points="2 17 12 22 22 17" />
      <polyline points="2 12 12 17 22 12" />
    </svg>
  ),
  Analytics: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
    </svg>
  ),
  Programs: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  ),
  QuestionBank: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </svg>
  ),
  Agreements: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <path d="M9 15l2 2 4-4" />
    </svg>
  ),
  Certificates: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="6" />
      <path d="M15.4 13.8L18 22l-6-3-6 3 2.6-8.2" />
    </svg>
  ),
  Resources: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  ),
  Messages: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  ),
  Enquiries: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 6l9 7 9-7" />
    </svg>
  ),
  Announcements: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  ),
  WebsiteContent: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  ),
  MediaLibrary: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <polyline points="21 15 16 10 5 21" />
    </svg>
  ),
  Settings: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  ),
  Search: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  ),
  Bell: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  ),
  ChevronLeft: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  ),
  ChevronRight: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  ),
  ChevronDown: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  ),
  User: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  ),
  Logout: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  ),
  Menu: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  ),
  Close: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
};

interface SearchablePageItem {
  id: string;
  title: string;
  description: string;
  href: string;
  category: string;
  iconName: keyof typeof Icons;
  keywords: string[];
}

const SEARCH_ITEMS: SearchablePageItem[] = [
  {
    id: "dashboard",
    title: "Dashboard Overview",
    description: "Key metrics, active enrolments, and platform health",
    href: "/",
    category: "Overview",
    iconName: "Dashboard",
    keywords: ["home", "stats", "kpi", "metrics", "overview"],
  },
  {
    id: "users",
    title: "Users & Enrolments",
    description: "Manage registered learners, staff, and account roles",
    href: "/users",
    category: "Overview",
    iconName: "Users",
    keywords: ["learners", "students", "staff", "crm", "roles", "accounts"],
  },
  {
    id: "batches",
    title: "Batches & Cohorts",
    description: "Active cohorts, live schedules, and class dates",
    href: "/batches",
    category: "Overview",
    iconName: "Batches",
    keywords: ["cohorts", "classes", "schedule", "timings", "live"],
  },
  {
    id: "revenue",
    title: "Revenue & Finance",
    description: "Financial analytics, payments, invoices, and metrics",
    href: "/revenue",
    category: "Overview",
    iconName: "Analytics",
    keywords: ["finance", "payments", "invoices", "sales", "analytics", "income"],
  },
  {
    id: "programs",
    title: "Programs & Curriculum",
    description: "Course tracks, curriculum builder, lessons, and modules",
    href: "/programs",
    category: "Curriculum",
    iconName: "Programs",
    keywords: ["courses", "curriculum", "lessons", "tracks", "syllabus", "content"],
  },
  {
    id: "quizzes",
    title: "Question Bank & Quizzes",
    description: "Assessments, test questions, grading rubrics, and quizzes",
    href: "/quizzes",
    category: "Curriculum",
    iconName: "QuestionBank",
    keywords: ["exams", "assessments", "tests", "questions", "grading"],
  },
  {
    id: "agreements",
    title: "Agreements & Compliance",
    description: "Student legal agreements, signed terms, and compliance records",
    href: "/agreements",
    category: "Curriculum",
    iconName: "Agreements",
    keywords: ["contracts", "legal", "terms", "compliance", "signatures"],
  },
  {
    id: "certificates",
    title: "Certificates",
    description: "Issue, configure, and verify completion credentials",
    href: "/certificates",
    category: "Curriculum",
    iconName: "Certificates",
    keywords: ["credentials", "awards", "graduation", "diploma"],
  },
  {
    id: "messages",
    title: "Messages & Inquiries",
    description: "Direct communications with learners and instructors",
    href: "/messages",
    category: "Communication",
    iconName: "Messages",
    keywords: ["chat", "inbox", "support", "conversations"],
  },
  {
    id: "leads",
    title: "Enquiries (CRM & Leads)",
    description: "Prospective student applications and course enquiries",
    href: "/leads",
    category: "Communication",
    iconName: "Enquiries",
    keywords: ["leads", "prospects", "crm", "applications", "sales"],
  },
  {
    id: "meetings",
    title: "Announcements & Meetings",
    description: "Live broadcast schedules, webinars, and announcements",
    href: "/meetings",
    category: "Communication",
    iconName: "Announcements",
    keywords: ["zoom", "live", "webinars", "events", "calendar"],
  },
  {
    id: "website",
    title: "Website Content Management",
    description: "Hero banners, FAQs, testimonials, and promo announcements",
    href: "/website",
    category: "Website",
    iconName: "WebsiteContent",
    keywords: ["cms", "homepage", "landing", "marketing", "faqs", "testimonials"],
  },
];

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<UserData | null>(null);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchShortcut, setSearchShortcut] = useState("Ctrl K");
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Load user session and sidebar preference
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

    const savedCollapsed = localStorage.getItem("admin_sidebar_collapsed");
    if (savedCollapsed !== null) {
      setIsCollapsed(savedCollapsed === "true");
    }

    // Ensure the interface remains consistently in light mode
    localStorage.removeItem("admin_theme");
    document.documentElement.classList.remove("dark");

    // Platform detection for search shortcut
    if (typeof window !== "undefined") {
      const isMac =
        /Mac|iPod|iPhone|iPad/.test(navigator.platform) ||
        /Macintosh|Mac OS X/.test(navigator.userAgent);
      if (isMac) {
        setSearchShortcut("⌘K");
      }
    }
  }, [pathname, router]);

  // Keyboard shortcut for command palette (Ctrl+K / Cmd+K) and Escape handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchModalOpen((prev) => !prev);
      }
      if (e.key === "Escape") {
        setSearchModalOpen(false);
        setUserDropdownOpen(false);
        if (!isLoggingOut) {
          setShowSignOutConfirm(false);
          setLogoutError(null);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isLoggingOut]);

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

  const toggleCollapsed = () => {
    setIsCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem("admin_sidebar_collapsed", String(next));
      return next;
    });
  };

  const openSignOutConfirm = () => {
    setUserDropdownOpen(false);
    setLogoutError(null);
    setShowSignOutConfirm(true);
  };

  const closeSignOutConfirm = () => {
    if (isLoggingOut) return;
    setShowSignOutConfirm(false);
    setLogoutError(null);
  };

  const handleConfirmSignOut = async () => {
    if (isLoggingOut) return;
    try {
      setIsLoggingOut(true);
      setLogoutError(null);
      localStorage.removeItem("token");
      localStorage.removeItem("refresh_token");
      localStorage.removeItem("user");
      router.push("/login");
    } catch (err) {
      setIsLoggingOut(false);
      setLogoutError(err instanceof Error ? err.message : "Failed to sign out. Please try again.");
    }
  };

  if (pathname === "/login") {
    return <>{children}</>;
  }

  const userName = user?.name || "Administrator";
  const formatRole = (role?: string) => {
    if (!role) return "Admin";
    switch (role) {
      case "SUPER_ADMIN":
        return "Super Admin";
      case "ADMIN":
        return "Admin";
      case "TEACHER":
        return "Teacher";
      case "MANAGER":
        return "Manager";
      default:
        return role.charAt(0) + role.slice(1).toLowerCase();
    }
  };
  const userRole = formatRole(user?.role);
  const userEmail = user?.email || "admin@whatboutme.com";

  const hasPermission = (perm: string) => {
    if (!user || user.role === "SUPER_ADMIN") return true;
    if (!user?.permissions) return true;
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
        { label: "Dashboard", href: "/", icon: <Icons.Dashboard />, perm: "all" },
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
          <Link href="/" className={styles.brandLink} aria-label="WhatBoutMe Admin Home">
            <div className={styles.brandLogoWrap}>
              <Image
                src="/brand/logo-dark.png"
                alt="whatboutme"
                width={168}
                height={22.5}
                priority
                className={styles.brandLogoImg}
              />
            </div>
          </Link>

          <Link href="/" className={styles.brandLinkCollapsed} aria-label="WhatBoutMe Admin Home" title="WhatBoutMe Admin">
            <Image
              src="/brand/icon.png"
              alt="whatboutme"
              width={22}
              height={22}
              priority
              className={styles.brandIconImg}
            />
          </Link>

          <button
            type="button"
            className={styles.collapseToggle}
            onClick={toggleCollapsed}
            title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {isCollapsed ? <Icons.ChevronRight /> : <Icons.ChevronLeft />}
          </button>
        </div>

        {/* Navigation Menu */}
        <nav className={styles.navMenu}>
          {navGroups.map((group) => {
            if (group.permission === false) return null;
            const filteredItems = group.items.filter((item) => item.perm === "all" || hasPermission(item.perm));
            if (filteredItems.length === 0) return null;

            return (
              <div key={group.title} className={styles.navGroup}>
                <p className={styles.navTitle}>{group.title}</p>
                {filteredItems.map((item) => {
                  const isActive = item.href === "/"
                    ? pathname === "/"
                    : pathname === item.href || pathname.startsWith(item.href + "/");

                  return (
                    <Link
                      key={item.label}
                      href={item.href}
                      className={`${styles.navItem} ${isActive ? styles.active : ""}`}
                      title={isCollapsed ? item.label : undefined}
                      aria-current={isActive ? "page" : undefined}
                    >
                      <span className={styles.navIcon}>{item.icon}</span>
                      <span className={styles.navLabel}>{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            );
          })}
        </nav>

        {/* Sidebar Footer with Sign Out */}
        <div className={styles.sidebarFooter}>
          <button
            type="button"
            className={styles.sidebarSignOutBtn}
            onClick={openSignOutConfirm}
            title={isCollapsed ? "Sign out" : undefined}
            aria-label="Sign out"
          >
            <span className={styles.sidebarSignOutIcon}>
              <Icons.Logout />
            </span>
            <span className={styles.sidebarSignOutLabel}>Sign out</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className={styles.mainWrapper}>
        {/* Top Bar Header */}
        <header className={styles.topbar}>
          <div className={styles.topbarLeft}>
            {/* Mobile Menu Button */}
            <button
              type="button"
              className={styles.mobileMenuBtn}
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open navigation menu"
            >
              <Icons.Menu />
            </button>

            {/* Integrated Search Input */}
            <div
              className={styles.searchContainer}
              onClick={() => setSearchModalOpen(true)}
              role="search"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setSearchModalOpen(true);
                }
              }}
              aria-label={`Quick search (press ${searchShortcut} to open)`}
            >
              <span className={styles.searchIcon}><Icons.Search /></span>
              <input
                type="text"
                readOnly
                placeholder="Search users, batches, programs..."
                className={styles.searchInput}
                tabIndex={-1}
              />
              <div className={styles.searchShortcut} aria-hidden="true">
                <kbd className={styles.keycap}>{searchShortcut}</kbd>
              </div>
            </div>
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

            <div className={styles.headerDivider} aria-hidden="true" />

            {/* User Profile Trigger */}
            <div className={styles.profileContainer} ref={dropdownRef}>
              <button
                type="button"
                className={`${styles.userProfile} ${userDropdownOpen ? styles.userProfileOpen : ""}`}
                onClick={() => setUserDropdownOpen(!userDropdownOpen)}
                aria-expanded={userDropdownOpen}
                aria-haspopup="true"
                aria-label={`User menu for ${userName}`}
              >
                <div className={styles.avatar} aria-hidden="true">
                  <Icons.User />
                </div>
                <div className={styles.userInfo}>
                  <span className={styles.userName}>{userName}</span>
                  <span className={styles.userRole}>{userRole}</span>
                </div>
                <span className={styles.userChevron}><Icons.ChevronDown /></span>
              </button>

              {/* User Dropdown */}
              {userDropdownOpen && (
                <div className={styles.userDropdown} role="menu">
                  <div className={styles.dropdownHeader}>
                    <p className={styles.dropdownName}>{userName}</p>
                    <p className={styles.dropdownEmail}>{userEmail}</p>
                    <span className={styles.dropdownRoleBadge}>{userRole}</span>
                  </div>
                  <div className={styles.dropdownDivider} />
                  <button
                    type="button"
                    className={`${styles.dropdownItem} ${styles.dropdownSignOut}`}
                    onClick={openSignOutConfirm}
                    role="menuitem"
                  >
                    <span className={styles.dropdownItemIcon}><Icons.Logout /></span> Sign Out
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
              <span className={styles.modalSearchIcon}><Icons.Search /></span>
              <input
                autoFocus
                type="text"
                placeholder="Search users, batches, programs, revenue..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={styles.modalSearchInput}
              />
              <button
                type="button"
                className={styles.modalCloseBtn}
                onClick={() => {
                  setSearchModalOpen(false);
                  setSearchQuery("");
                }}
                title="Close search (Esc)"
                aria-label="Close search"
              >
                <Icons.Close />
              </button>
            </div>
            <div className={styles.modalSearchResults}>
              {(() => {
                const q = searchQuery.toLowerCase().trim();
                const filtered = q === ""
                  ? SEARCH_ITEMS.slice(0, 5)
                  : SEARCH_ITEMS.filter((item) => (
                      item.title.toLowerCase().includes(q) ||
                      item.description.toLowerCase().includes(q) ||
                      item.category.toLowerCase().includes(q) ||
                      item.keywords.some((kw) => kw.includes(q))
                    ));

                return (
                  <>
                    <p className={styles.modalSectionLabel}>
                      {q === "" ? "QUICK NAVIGATION" : `RESULTS (${filtered.length})`}
                    </p>
                    {filtered.length === 0 ? (
                      <div className={styles.modalNoResults}>
                        <p>No admin pages found matching &ldquo;{searchQuery}&rdquo;</p>
                        <span>Try searching for users, batches, curriculum, finance, or website</span>
                      </div>
                    ) : (
                      <div className={styles.modalQuickLinks}>
                        {filtered.map((item) => {
                          const IconComp = Icons[item.iconName];
                          return (
                            <button
                              key={item.id}
                              type="button"
                              className={styles.modalQuickItem}
                              onClick={() => {
                                router.push(item.href);
                                setSearchModalOpen(false);
                                setSearchQuery("");
                              }}
                            >
                              <span className={styles.modalQuickIcon}><IconComp /></span>
                              <div className={styles.modalQuickDetails}>
                                <div className={styles.modalQuickTitleRow}>
                                  <strong>{item.title}</strong>
                                  <span className={styles.modalQuickCategory}>{item.category}</span>
                                </div>
                                <span>{item.description}</span>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Sign Out Confirmation Modal */}
      {showSignOutConfirm && (
        <div
          className={styles.confirmModalOverlay}
          onClick={closeSignOutConfirm}
          role="dialog"
          aria-modal="true"
          aria-labelledby="signout-dialog-title"
        >
          <div className={styles.confirmModalBox} onClick={(e) => e.stopPropagation()}>
            <div className={styles.confirmHeader}>
              <div className={styles.confirmIconWrap} aria-hidden="true">
                <Icons.Logout />
              </div>
              <div className={styles.confirmHeaderText}>
                <h2 id="signout-dialog-title" className={styles.confirmTitle}>Sign out?</h2>
                <p className={styles.confirmMessage}>
                  Are you sure you want to sign out of your WhatBoutMe admin account?
                </p>
              </div>
              <button
                type="button"
                className={styles.modalCloseBtn}
                onClick={closeSignOutConfirm}
                disabled={isLoggingOut}
                aria-label="Cancel and close dialog"
                title="Close (Esc)"
              >
                <Icons.Close />
              </button>
            </div>

            {logoutError && (
              <div className={styles.confirmError} role="alert">
                {logoutError}
              </div>
            )}

            <div className={styles.confirmActions}>
              <button
                type="button"
                className={styles.confirmCancelBtn}
                onClick={closeSignOutConfirm}
                disabled={isLoggingOut}
                autoFocus
              >
                Cancel
              </button>
              <button
                type="button"
                className={styles.confirmDangerBtn}
                onClick={handleConfirmSignOut}
                disabled={isLoggingOut}
              >
                {isLoggingOut ? "Signing out..." : "Sign out"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
