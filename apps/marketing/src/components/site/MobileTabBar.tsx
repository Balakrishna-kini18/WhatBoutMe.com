"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, Compass, Home, MessageSquare, User } from "lucide-react";
import { LMS_URL } from "@/lib/api";
import { openPortal, useUser } from "@/lib/auth";

// Minimal bar: 60px tall, five equal columns, 22px icons with an 11px label
// 2px below, everything centred. The current tab is marked by one short line
// under its label, nothing else. Attached to the bottom edge, not a floating pill.
const TAB =
  "relative flex h-[60px] flex-col items-center justify-center gap-0.5 whitespace-nowrap text-[11px] font-medium";
const ICON = "h-[22px] w-[22px]";

/**
 * Phone-only bottom bar, like an app. The same five tabs, in the same order
 * and with the same icons, as the learner portal's bar, so the bar does not
 * change when moving between the two: Home, Explore, My Courses, Chat,
 * Profile.
 * Hidden from 640px up, where the top pill has room for everything.
 *
 * My Courses, Chat and Profile live in the learner portal. Signed in, they open
 * there directly, and a learner with no course yet still gets in: My Courses
 * then shows its empty state with an "Explore Courses" button. Signed out,
 * they lead to sign-in first and carry on to the same place afterwards.
 */
export default function MobileTabBar() {
  const pathname = usePathname();
  const user = useUser();
  const tone = (active: boolean) => (active
      ? "font-semibold text-ink after:absolute after:bottom-1.5 after:h-0.5 after:w-5 after:rounded-full after:bg-gold-deep"
      : "text-ink-soft");
  const weight = (active: boolean) => (active ? 2.1 : 1.7);

  const siteTab = (href: string, label: string, Icon: typeof Home, active: boolean) => (
    <Link href={href} aria-current={active ? "page" : undefined} className={`${TAB} ${tone(active)}`}>
      <Icon className={ICON} strokeWidth={weight(active)} />
      {label}
    </Link>
  );

  const portalTab = (path: string, label: string, Icon: typeof Home) =>
    user ? (
      <a
        href={`${LMS_URL}${path}`}
        onClick={openPortal(path, { requirePurchase: false })}
        className={`${TAB} ${tone(false)}`}
      >
        <Icon className={ICON} strokeWidth={weight(false)} />
        {label}
      </a>
    ) : (
      <Link href={`/login?portal=${encodeURIComponent(path)}`} className={`${TAB} ${tone(false)}`}>
        <Icon className={ICON} strokeWidth={weight(false)} />
        {label}
      </Link>
    );

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-[108] grid grid-cols-5 border-t border-line bg-white pb-[env(safe-area-inset-bottom)] print:hidden sm:hidden"
    >
      {siteTab("/", "Home", Home, pathname === "/")}
      {siteTab("/courses", "Explore", Compass, pathname.startsWith("/courses"))}
      {portalTab("/courses", "My Courses", BookOpen)}
      {portalTab("/chat", "Chat", MessageSquare)}
      {portalTab("/profile", "Profile", User)}
    </nav>
  );
}
