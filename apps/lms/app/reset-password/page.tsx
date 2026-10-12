"use client";

import { useEffect } from "react";
import { SITE_URL } from "../lib/site";

export default function ResetPasswordRedirect() {
  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("token");
    const target = token
      ? `${SITE_URL}/reset-password?token=${encodeURIComponent(token)}`
      : `${SITE_URL}/forgot-password`;
    window.location.replace(target);
  }, []);

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-secondary)" }}>
      Redirecting to password reset…
    </div>
  );
}
