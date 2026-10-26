"use client";

import { useEffect, useState, type MouseEvent } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowUpRight } from "lucide-react";
import Logo from "./Logo";
import ProfileMenu from "./ProfileMenu";
import MobileTabBar from "./MobileTabBar";
import { scrollToTarget, lenisRef } from "@/lib/scroll";
import { CONTACT, ENQUIRE_HREF, NAV_LINKS } from "@/lib/content";
import { LMS_URL } from "@/lib/api";
import { initialsOf, openPortal, signOut, useUser } from "@/lib/auth";
import { clearEnrollmentIntent } from "@/lib/auth-redirect";

// one row of the dropdown menu
const MENU_ITEM =
  "flex min-h-11 items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left text-[15px] font-medium text-ink transition-colors hover:bg-cream-deep";

export default function Nav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const user = useUser();

  // lock scroll while the overlay menu is open; Escape closes it; resize to lg closes it
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const mql = window.matchMedia("(min-width: 1024px)");
    const onMedia = (e: MediaQueryListEvent) => {
      if (e.matches) setOpen(false);
    };
    mql.addEventListener("change", onMedia);

    lenisRef.current?.stop();
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKey);
    return () => {
      mql.removeEventListener("change", onMedia);
      lenisRef.current?.start();
      document.body.style.overflow = "";
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // section links are real links to the landing page, so they work from any route
  const hrefFor = (href: string) =>
    href.startsWith("/") ? href : `/${href === "#top" ? "" : href}`;

  // page links mark the page you are on; section links never do
  const isActive = (href: string) =>
    href.startsWith("/") && (pathname === href || pathname.startsWith(`${href}/`));

  const go = (href: string) => (e: MouseEvent<HTMLAnchorElement>) => {
    const wasOpen = open;
    setOpen(false);
    // page links, and section links clicked from another page, change route
    if (href.startsWith("/") || pathname !== "/") return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    // wait for the overlay to start closing before scrolling
    window.setTimeout(() => scrollToTarget(href), wasOpen ? 300 : 0);
  };

  return (
    <>
      {/* phones: a plain flat bar across the top, no shadow. From sm up: the floating pill */}
      <header className="fixed inset-x-0 top-0 z-[110] print:hidden sm:top-4 sm:px-4">
        <nav className="mx-auto flex h-12 max-w-[1120px] items-center justify-between bg-ink pl-5 pr-3 sm:h-16 sm:rounded-full sm:pl-6 sm:pr-2.5 sm:shadow-[0_18px_40px_-20px_rgba(20,17,15,0.6)] md:h-[4.5rem] md:pl-9 md:pr-3">
          <Link
            href="/"
            onClick={go("#top")}
            aria-label="whatboutme home"
            className="flex h-11 shrink-0 items-center"
          >
            <Logo tone="light" className="h-[1.125rem] sm:h-[18px] md:h-[22px]" />
          </Link>

          <ul className="hidden items-center gap-5 lg:flex xl:gap-6 2xl:gap-8">
            {NAV_LINKS.map((link) => (
              <li key={link.href}>
                <Link
                  href={hrefFor(link.href)}
                  onClick={go(link.href)}
                  aria-current={isActive(link.href) ? "page" : undefined}
                  className={`relative block py-2.5 text-[15px] font-medium transition-colors after:absolute after:inset-x-0 after:bottom-0.5 after:mx-auto after:h-0.5 after:rounded-full after:bg-gold after:transition-[width] after:duration-200 hover:text-cream ${
                    isActive(link.href) ? "text-cream after:w-4" : "text-cream/75 after:w-0"
                  }`}
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>

          <div className="flex items-center gap-2.5">
            {/* phones: sign-in and the portal are in the bottom bar */}
            <div className="hidden sm:contents">
              <ProfileMenu />
            </div>

            {/* phones have no room for this in the pill; it is in the menu instead */}
            <Link
              href={ENQUIRE_HREF}
              className="group hidden h-11 items-center sm:flex gap-1.5 whitespace-nowrap rounded-full bg-gold px-5 text-sm md:h-12 md:px-7 md:text-[15px] font-medium text-ink transition-colors duration-200 hover:bg-cream"
            >
              Enquire now
              <ArrowUpRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </Link>

            {/* menu button: two lines that turn into a cross */}
            <button
              onClick={() => setOpen((v) => !v)}
              aria-label={open ? "Close menu" : "Open menu"}
              aria-expanded={open}
              aria-controls="site-menu"
              className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-cream transition-colors hover:bg-cream/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold sm:bg-cream/10 lg:hidden"
            >
              <span
                className={`absolute h-[1.5px] w-[18px] bg-cream transition-transform duration-300 ${
                  open ? "rotate-45" : "-translate-y-[3.5px]"
                }`}
              />
              <span
                className={`absolute h-[1.5px] w-[18px] bg-cream transition-transform duration-300 ${
                  open ? "-rotate-45" : "translate-y-[3.5px]"
                }`}
              />
            </button>
          </div>
        </nav>
      </header>

      <MobileTabBar />

      {/* phone and tablet menu: a dropdown under the menu button */}
      <AnimatePresence>
        {open && (
          <>
            {/* tap anywhere else to close */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              aria-hidden
              onClick={() => setOpen(false)}
              className="fixed inset-0 z-[104] bg-ink/25 lg:hidden"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: -6 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97, y: -4 }}
              transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
              data-lenis-prevent
              id="site-menu"
              className="fixed right-3 top-[3.25rem] z-[112] max-h-[calc(100dvh-8.5rem)] w-[min(19rem,calc(100vw-1.5rem))] origin-top-right overflow-y-auto rounded-2xl border border-line bg-white p-2 shadow-[0_24px_48px_-20px_rgba(20,17,15,0.45)] sm:right-6 sm:top-24 lg:hidden"
            >
              {/* account: the top bar has no room for the avatar on phones */}
              {user ? (
                <div className="border-b border-line px-3 pb-3 pt-2">
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-cream-deep text-sm font-semibold text-gold-deep">
                      {initialsOf(user)}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-ink">{user.name || "Learner"}</p>
                      <p className="truncate text-xs text-ink-soft">{user.email}</p>
                    </div>
                  </div>
                </div>
              ) : (
                <Link
                  href="/login"
                  onClick={() => {
                    clearEnrollmentIntent();
                    setOpen(false);
                  }}
                  className={`${MENU_ITEM} font-semibold`}
                >
                  Login
                </Link>
              )}

              <ul className={user ? "pt-2" : "border-t border-line pt-2"}>
                {user && (
                  <>
                    <li>
                      <a href={LMS_URL} onClick={openPortal()} className={MENU_ITEM}>
                        Learner Portal
                      </a>
                    </li>
                    <li>
                      <a href={`${LMS_URL}/profile`} onClick={openPortal("/profile")} className={MENU_ITEM}>
                        My Profile
                      </a>
                    </li>
                  </>
                )}
                {NAV_LINKS.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={hrefFor(link.href)}
                      onClick={go(link.href)}
                      aria-current={isActive(link.href) ? "page" : undefined}
                      className={`${MENU_ITEM} ${isActive(link.href) ? "bg-cream-deep font-semibold" : ""}`}
                    >
                      {link.label}
                      {isActive(link.href) && <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-gold-deep" />}
                    </Link>
                  </li>
                ))}
              </ul>

              {/* the main call to action, as a button rather than one more row */}
              <Link
                href={ENQUIRE_HREF}
                onClick={() => setOpen(false)}
                className="group mx-1 mt-2 flex min-h-12 items-center justify-center gap-1.5 rounded-xl bg-gold px-4 text-[15px] font-semibold text-ink transition-colors duration-200 hover:bg-ink hover:text-cream"
              >
                Enquire now
                <ArrowUpRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </Link>

              <div className="mt-2 border-t border-line pt-2">
                <a href={`mailto:${CONTACT.email}`} className={`${MENU_ITEM} break-all text-gold-deep`}>
                  {CONTACT.email}
                </a>
                {user && (
                  <button
                    type="button"
                    onClick={() => {
                      signOut();
                      setOpen(false);
                    }}
                    className={`${MENU_ITEM} w-full text-ink-soft`}
                  >
                    Sign Out
                  </button>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
