"use client";

import { useEffect } from "react";
import { siteLoginUrl } from "../lib/site";

/**
 * There is no portal sign-in form. Anything that lands here (a signed-out
 * visit, an ended session, an old bookmark) goes to the website's sign-in and
 * comes back signed in.
 */
export default function LoginRedirect() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const programId = params.get("programId");
    const reason = params.get("reason");
    const targetPath = programId ? `/checkout?programId=${encodeURIComponent(programId)}` : "/";
    window.location.replace(siteLoginUrl(targetPath, reason || undefined));
  }, []);

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-secondary)" }}>
      Taking you to sign in…
    </div>
  );
}
