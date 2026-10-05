"use client";

import { useEffect } from "react";
import { siteSignupUrl } from "../lib/site";

/** Accounts are created on the website; see ../login/page.tsx. */
export default function SignupRedirect() {
  useEffect(() => {
    const programId = new URLSearchParams(window.location.search).get("programId");
    window.location.replace(siteSignupUrl(programId ? `/checkout?programId=${encodeURIComponent(programId)}` : "/"));
  }, []);

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-secondary)" }}>
      Taking you to sign up…
    </div>
  );
}
