"use client";

import { useEffect } from "react";
import { getMarketingUrl } from "../lib/host";

export default function ResetPasswordRedirect() {
  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const token = searchParams.get("token");
    const email = searchParams.get("email");
    const lmsOrigin = typeof window !== "undefined" && window.location?.origin ? window.location.origin : "";

    const params = new URLSearchParams();
    if (token) params.set("token", token);
    if (email) params.set("email", email);
    if (lmsOrigin) params.set("lms_origin", lmsOrigin);

    const queryStr = params.toString() ? `?${params.toString()}` : "";
    const marketingUrl = getMarketingUrl();
    const target = token
      ? `${marketingUrl}/reset-password${queryStr}`
      : `${marketingUrl}/forgot-password${queryStr}`;
    window.location.replace(target);
  }, []);

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-secondary)" }}>
      Redirecting to password reset…
    </div>
  );
}
