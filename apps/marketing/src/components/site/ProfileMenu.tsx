"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { LMS_URL } from "@/lib/api";
import { initialsOf, openPortal, signOut, useUser } from "@/lib/auth";

const ITEM =
  "block w-full rounded-xl px-3 py-2.5 text-left text-sm text-ink transition-colors hover:bg-cream-deep";

/** Navbar slot: "Login" when signed out; an LMS Portal button and profile menu when signed in. */
export default function ProfileMenu() {
  const user = useUser();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // close on outside click or Escape
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!user) {
    return (
      <Link
        href="/login"
        className="flex h-11 shrink-0 items-center rounded-full border border-cream/20 px-4 text-sm sm:px-5 font-medium text-cream/90 transition-colors duration-200 hover:border-gold hover:text-gold md:h-12 md:text-[15px]"
      >
        Login
      </Link>
    );
  }

  return (
    <>
      <a
        href={LMS_URL}
        onClick={openPortal()}
        className="hidden h-11 items-center whitespace-nowrap rounded-full border border-cream/20 px-5 text-sm font-medium text-cream/90 transition-colors duration-200 hover:border-gold hover:text-gold sm:flex md:h-12 md:text-[15px]"
      >
        LMS Portal
      </a>
      <div ref={ref} className="relative">
        <button
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label="Open profile menu"
          className="flex h-11 w-11 items-center justify-center rounded-full bg-cream text-sm font-semibold text-ink transition-colors hover:bg-gold md:h-12 md:w-12"
        >
          {initialsOf(user)}
        </button>

        {open && (
          <div
            role="menu"
            className="absolute right-0 top-[calc(100%+0.75rem)] w-64 rounded-2xl border border-line bg-white p-2 shadow-[0_24px_48px_-24px_rgba(20,17,15,0.45)]"
          >
            <div className="border-b border-line px-3 pb-3 pt-2">
              <p className="truncate font-semibold text-ink">
                {user.name || "Learner"}
              </p>
              <p className="truncate text-sm text-ink-soft">{user.email}</p>
            </div>
            <div className="pt-2">
              <a
              role="menuitem"
              href={`${LMS_URL}/profile`}
              onClick={openPortal("/profile")}
              className={ITEM}
            >
                My Profile
              </a>
              <a
              role="menuitem"
              href={LMS_URL}
              onClick={openPortal()}
              className={ITEM}
            >
                Learner Portal
              </a>
              <button
                role="menuitem"
                onClick={() => {
                  signOut();
                  setOpen(false);
                }}
                className={ITEM}
              >
                Sign Out
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
