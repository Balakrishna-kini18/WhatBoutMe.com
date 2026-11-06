"use client";

import { useEffect } from "react";
import { getMarketingUrl } from "../lib/host";

export default function VerifyEmailRedirect() {
  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const token = searchParams.get("token");
    const lmsOrigin = typeof window !== "undefined" && window.location?.origin ? window.location.origin : "";

    const params = new URLSearchParams();
    if (token) params.set("token", token);
    if (lmsOrigin) params.set("lms_origin", lmsOrigin);

    const queryStr = params.toString() ? `?${params.toString()}` : "";
    const marketingUrl = getMarketingUrl();
    window.location.replace(`${marketingUrl}/verify-email${queryStr}`);
  }, []);

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#6b7280",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      Redirecting to email verification…
    </div>
  );
}
