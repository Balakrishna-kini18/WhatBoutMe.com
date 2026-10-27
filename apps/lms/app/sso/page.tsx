"use client";

import { useEffect } from "react";
import { siteLoginUrl } from "../lib/site";
import { consumeEnrollmentIntent, sanitizeReturnUrl } from "../lib/auth-redirect";

/**
 * Sign-in handoff from the public website. The website links here with the
 * session in the URL fragment (never sent to the server); this page stores it
 * the same way the login page does, then moves on.
 */
let handled = false;

export default function SsoPage() {
  useEffect(() => {
    // React runs effects twice in development. The first run takes the session
    // out of the address bar, so a second run would find nothing and wrongly
    // send the learner to the login page.
    if (handled) return;
    handled = true;

    const params = new URLSearchParams(window.location.hash.slice(1));
    // take the session out of the address bar and history straight away
    window.history.replaceState(null, "", window.location.pathname);

    const token = params.get("token");
    const user = params.get("user");
    const refresh = params.get("refresh");
    const rawNext = params.get("next");
    // Strictly sanitize next path or consume stored 30-min enrollment intent
    const target =
      rawNext && rawNext !== "/"
        ? consumeEnrollmentIntent(rawNext, "/")
        : consumeEnrollmentIntent(null, sanitizeReturnUrl(rawNext, "/"));

    let userIsValid = false;
    try {
      userIsValid = Boolean(user && JSON.parse(user)?.email);
    } catch {
      userIsValid = false;
    }

    if (!token || !userIsValid) {
      // nothing handed over: carry on if already signed in here, else log in
      window.location.replace(localStorage.getItem("token") ? target : siteLoginUrl(target));
      return;
    }

    localStorage.setItem("token", token);
    if (refresh) localStorage.setItem("refresh_token", refresh);
    localStorage.setItem("user", user as string);
    // full reload so the sidebar and header pick up the signed-in learner
    window.location.replace(target);
  }, []);

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-secondary)" }}>
      Signing you in…
    </div>
  );
}
