"use client";

import { useEffect } from "react";
import { siteLoginUrl } from "../lib/site";
import {
  buildCourseEnrollmentReturnUrl,
  extractRedirectParam,
  peekEnrollmentIntent,
  saveEnrollmentIntent,
} from "../lib/auth-redirect";

/**
 * There is no portal sign-in form. Anything that lands here (a signed-out
 * visit, an ended session, an old bookmark) goes to the website's sign-in and
 * comes back signed in.
 */
export default function LoginRedirect() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const fromParams = extractRedirectParam(params);
    const programId = params.get("programId");
    const batchId = params.get("batchId");
    const coupon = params.get("coupon");
    const reason = params.get("reason");

    const targetPath =
      fromParams ||
      (programId
        ? buildCourseEnrollmentReturnUrl({
            programId,
            batchId,
            couponCode: coupon,
            autoEnroll: true,
            basePath: "/agreement",
          })
        : peekEnrollmentIntent()?.returnUrl || "/");

    if (targetPath && targetPath !== "/") {
      saveEnrollmentIntent({
        returnUrl: targetPath,
        programId: programId || undefined,
        batchId: batchId || undefined,
        couponCode: coupon || undefined,
      });
    }

    window.location.replace(siteLoginUrl(targetPath, reason || undefined));
  }, []);

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#faf7f2",
        padding: "1rem",
      }}
    >
      <div
        style={{
          maxWidth: 420,
          width: "100%",
          background: "#ffffff",
          border: "1px solid #e7e0d6",
          borderRadius: 16,
          padding: "2.5rem 2rem",
          textAlign: "center",
          boxShadow: "0 1px 3px rgba(28, 25, 23, 0.04)",
        }}
      >
        <div className="skeleton" style={{ width: 44, height: 44, borderRadius: "50%", margin: "0 auto 1.25rem" }} />
        <div className="skeleton" style={{ width: "60%", height: 20, borderRadius: 6, margin: "0 auto 0.75rem" }} />
        <div className="skeleton" style={{ width: "75%", height: 14, borderRadius: 4, margin: "0 auto 1.5rem" }} />
        <p style={{ margin: 0, fontSize: "0.88rem", color: "#78716a" }}>Taking you to sign in…</p>
      </div>
    </div>
  );
}
