/**
 * Pure helper functions for sidebar navigation active states and collapsed mode.
 */

export interface NavRouteItem {
  id: string;
  href: string;
  label: string;
  section: "LEARNING" | "COMMUNITY";
  matchMode: "exact" | "startsWith" | "custom";
}

export const SIDEBAR_ROUTES: NavRouteItem[] = [
  { id: "dashboard", href: "/", label: "Dashboard", section: "LEARNING", matchMode: "exact" },
  { id: "courses", href: "/courses", label: "My Courses", section: "LEARNING", matchMode: "custom" },
  { id: "notes", href: "/notes", label: "My Notes", section: "LEARNING", matchMode: "startsWith" },
  { id: "live", href: "/live", label: "Live Sessions", section: "LEARNING", matchMode: "startsWith" },
  { id: "attendance", href: "/attendance", label: "Attendance", section: "LEARNING", matchMode: "exact" },
  { id: "certificates", href: "/certificates", label: "Certificates", section: "LEARNING", matchMode: "startsWith" },
  { id: "events", href: "/events", label: "Events", section: "COMMUNITY", matchMode: "startsWith" },
];

export function isRouteActive(item: NavRouteItem, currentPath: string): boolean {
  if (item.id === "courses") {
    return (
      currentPath === "/courses" ||
      currentPath.startsWith("/courses/") ||
      currentPath.startsWith("/programs") ||
      currentPath.startsWith("/steps")
    );
  }
  if (item.matchMode === "exact") {
    return currentPath === item.href;
  }
  if (item.matchMode === "startsWith") {
    return currentPath === item.href || currentPath.startsWith(`${item.href}/`);
  }
  return false;
}

export function shouldHideSidebar(currentPath: string): boolean {
  return (
    currentPath === "/login" ||
    currentPath === "/signup" ||
    currentPath === "/sso" ||
    currentPath === "/agreement" ||
    currentPath.startsWith("/agreement") ||
    currentPath.startsWith("/agreements") ||
    currentPath === "/checkout" ||
    currentPath.startsWith("/checkout")
  );
}
