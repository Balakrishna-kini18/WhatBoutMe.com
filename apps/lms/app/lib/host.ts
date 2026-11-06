/**
 * Production-Level Host & API URL Resolution (LMS)
 *
 * Provides resilient, self-healing API URL resolution:
 * 1. Checks if explicit env var exists (NEXT_PUBLIC_API_URL, NEXT_PUBLIC_MARKETING_URL, etc.).
 *    Strictly validated to avoid localhost/staging leaks while respecting operator configuration.
 * 2. Client-side runtime detection (window.location):
 *    - Local development (localhost / 127.0.0.1) -> http://localhost:4000
 *    - Local Wi-Fi LAN IP (e.g. 192.168.x.x for mobile testing) -> http://<ip>:4000
 *    - Staging (*.testfox.in) -> https://whatboutme.testfox.in (API), https://marketing.testfox.in (Marketing), https://admin.testfox.in (Admin), https://lms.testfox.in (LMS)
 *    - Vercel deployments (*.vercel.app) -> dynamically derived based on project naming (prefix lms-*, suffix *-lms, or apex)
 *    - Live Custom Domains (e.g. whatboutme.com) -> https://api.<root-domain>, https://admin.<root-domain>, https://learn.<root-domain>
 * 3. Server-side (SSR / Node.js) -> Fallback to VERCEL_URL or default
 */

/**
 * Intelligently derives sibling service URLs for Vercel deployments.
 * Supports prefix naming (admin-whataboutme), suffix naming (whataboutme-admin),
 * and legacy naming (what-bout-me-com-*).
 */
export function deriveVercelUrl(
  currentHost: string,
  targetService: "api" | "admin" | "lms" | "marketing"
): string {
  const host = currentHost.replace(/^https?:\/\//, "").replace(/\/.*$/, "").toLowerCase();

  // If already on the exact target host
  if (targetService === "admin" && (host.startsWith("admin-") || host.includes("-admin"))) {
    return `https://${host}`;
  }
  if (targetService === "lms" && (host.startsWith("lms-") || host.includes("-lms"))) {
    return `https://${host}`;
  }
  if (targetService === "marketing" && (host.startsWith("marketing-") || host.includes("-marketing"))) {
    return `https://${host}`;
  }

  // Known active WhatBoutMe Vercel deployment family (heterogeneous project names across the 4 services)
  if (
    host === "what-bout-me-com-backend.vercel.app" ||
    /^(admin|lms|marketing|api)-(whatboutme|whataboutme)\.vercel\.app$/i.test(host) ||
    /^(whatboutme|whataboutme)\.vercel\.app$/i.test(host)
  ) {
    if (targetService === "api") return "https://what-bout-me-com-backend.vercel.app";
    if (targetService === "admin") return "https://admin-whataboutme.vercel.app";
    if (targetService === "lms") return "https://lms-whatboutme.vercel.app";
    if (targetService === "marketing") return "https://marketing-whatboutme.vercel.app";
  }

  // 1. Prefix pattern: <service>-<project>.vercel.app (e.g. admin-whataboutme.vercel.app, lms-whataboutme.vercel.app)
  const prefixMatch = host.match(/^(admin|lms|marketing|api)-(.*)\.vercel\.app$/i);
  if (prefixMatch) {
    const [, , project] = prefixMatch;
    if (targetService === "api") return `https://api-${project}.vercel.app`;
    if (targetService === "admin") return `https://admin-${project}.vercel.app`;
    if (targetService === "lms") return `https://lms-${project}.vercel.app`;
    if (targetService === "marketing") return `https://${project}.vercel.app`;
  }

  // 2. Suffix pattern: <project>-<service>.vercel.app (e.g. what-bout-me-com-lms.vercel.app, whataboutme-lms.vercel.app)
  const suffixMatch = host.match(/^(.*?)-(admin|lms|marketing|atyb|api)\.vercel\.app$/i);
  if (suffixMatch) {
    const [, project] = suffixMatch;
    if (project === "what-bout-me-com") {
      if (targetService === "api") return "https://what-bout-me-com.vercel.app";
      if (targetService === "marketing") return "https://what-bout-me-com-atyb.vercel.app";
      if (targetService === "admin") return "https://what-bout-me-com-admin.vercel.app";
      if (targetService === "lms") return "https://what-bout-me-com-lms.vercel.app";
    }
    if (targetService === "api") return `https://${project}-api.vercel.app`;
    if (targetService === "admin") return `https://${project}-admin.vercel.app`;
    if (targetService === "lms") return `https://${project}-lms.vercel.app`;
    if (targetService === "marketing") return `https://${project}.vercel.app`;
  }

  // 3. Project apex: <project>.vercel.app (e.g. what-bout-me-com.vercel.app, whataboutme.vercel.app)
  const apexMatch = host.match(/^(.*?)\.vercel\.app$/i);
  if (apexMatch) {
    const project = apexMatch[1];
    if (project === "what-bout-me-com") {
      if (targetService === "api") return "https://what-bout-me-com.vercel.app";
      if (targetService === "marketing") return "https://what-bout-me-com-atyb.vercel.app";
      if (targetService === "admin") return "https://what-bout-me-com-admin.vercel.app";
      if (targetService === "lms") return "https://what-bout-me-com-lms.vercel.app";
    }
    if (targetService === "api") return `https://api-${project}.vercel.app`;
    if (targetService === "admin") return `https://admin-${project}.vercel.app`;
    if (targetService === "lms") return `https://lms-${project}.vercel.app`;
    if (targetService === "marketing") return `https://${project}.vercel.app`;
  }

  // 4. Safe defaults
  if (targetService === "api") return "https://api.whatboutme.com";
  if (targetService === "marketing") return "https://whatboutme.com";
  if (targetService === "admin") return "https://admin.whatboutme.com";
  return "https://learn.whatboutme.com";
}

export function matchesDomainFamily(candidateUrl: string, currentHost: string): boolean {
  try {
    const candidateHost = new URL(candidateUrl).hostname.toLowerCase();
    const host = currentHost.toLowerCase();

    // 1. Localhost isolation: when on localhost or 127.0.0.1, traffic stays on localhost
    if (host === "localhost" || host === "127.0.0.1") {
      return candidateHost === "localhost" || candidateHost === "127.0.0.1";
    }

    // 2. Local LAN IP isolation (e.g. 192.168.x.x for mobile testing)
    if (/^(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)/.test(host)) {
      return (
        /^(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)/.test(candidateHost) ||
        candidateHost === "localhost"
      );
    }

    // 3. Staging isolation: if running on staging (*.testfox.in), candidate must belong to testfox.in
    if (host.endsWith("testfox.in")) {
      return candidateHost.endsWith("testfox.in");
    }

    // 4. Reverse staging isolation: prevent testfox.in URLs from leaking into production/preview
    if (candidateHost.endsWith("testfox.in")) {
      return false;
    }

    // 5. On deployed environments (Vercel, custom production domains, preview PRs):
    // Explicit environment variables configured by the operator are trusted
    return true;
  } catch {
    return false;
  }
}

export function getApiBaseUrl(): string {
  const envUrl = process.env.NEXT_PUBLIC_API_URL || process.env.API_URL;
  if (envUrl && typeof envUrl === "string" && envUrl.trim().length > 0) {
    const trimmed = envUrl.trim().replace(/\/+$/, "");
    if (typeof window !== "undefined" && window.location?.hostname) {
      if (matchesDomainFamily(trimmed, window.location.hostname)) {
        return trimmed;
      }
    } else {
      return trimmed;
    }
  }

  if (
    typeof window !== "undefined" &&
    window.location &&
    typeof window.location.hostname === "string" &&
    window.location.hostname.length > 0
  ) {
    const { hostname } = window.location;

    // Localhost
    if (hostname === "localhost" || hostname === "127.0.0.1") {
      return "http://localhost:4000";
    }

    // Local LAN IP for Wi-Fi mobile testing
    if (/^(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)/.test(hostname)) {
      return `http://${hostname}:4000`;
    }

    // Staging testfox.in
    if (hostname.endsWith("testfox.in")) {
      return "https://whatboutme.testfox.in";
    }

    // Vercel deployment preview / production domains
    if (hostname.endsWith(".vercel.app")) {
      return deriveVercelUrl(hostname, "api");
    }

    // Custom domain production: extract root domain and point to https://api.<root-domain>
    const parts = hostname.split(".");
    const rootDomain = parts.length >= 2 ? parts.slice(-2).join(".") : hostname;
    return `https://api.${rootDomain}`;
  }

  // Server-side (SSR) fallback
  if (process.env.VERCEL_URL) {
    return deriveVercelUrl(process.env.VERCEL_URL, "api");
  }

  return "http://localhost:4000";
}

export function getMarketingUrl(): string {
  const envUrl =
    process.env.NEXT_PUBLIC_MARKETING_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.MARKETING_URL ||
    process.env.SITE_URL;
  if (envUrl && typeof envUrl === "string" && envUrl.trim().length > 0) {
    const trimmed = envUrl.trim().replace(/\/+$/, "");
    if (typeof window !== "undefined" && window.location?.hostname) {
      if (matchesDomainFamily(trimmed, window.location.hostname)) {
        return trimmed;
      }
    } else {
      return trimmed;
    }
  }

  if (
    typeof window !== "undefined" &&
    window.location &&
    typeof window.location.hostname === "string" &&
    window.location.hostname.length > 0
  ) {
    const { hostname } = window.location;
    if (hostname === "localhost" || hostname === "127.0.0.1") return "http://localhost:3000";
    if (/^(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)/.test(hostname)) {
      return `http://${hostname}:3000`;
    }
    // Staging testfox.in
    if (hostname.endsWith("testfox.in")) {
      return "https://marketing.testfox.in";
    }
    // Vercel deployment preview / production domains
    if (hostname.endsWith(".vercel.app")) {
      return deriveVercelUrl(hostname, "marketing");
    }
    const parts = hostname.split(".");
    const rootDomain = parts.length >= 2 ? parts.slice(-2).join(".") : hostname;
    return `https://${rootDomain}`;
  }
  return "http://localhost:3000";
}

export function getAdminUrl(): string {
  const envUrl =
    process.env.NEXT_PUBLIC_ADMIN_URL ||
    process.env.NEXT_PUBLIC_ADMIN_URl ||
    process.env.ADMIN_URL;
  if (envUrl && typeof envUrl === "string" && envUrl.trim().length > 0) {
    const trimmed = envUrl.trim().replace(/\/+$/, "");
    if (typeof window !== "undefined" && window.location?.hostname) {
      if (matchesDomainFamily(trimmed, window.location.hostname)) {
        return trimmed;
      }
    } else {
      return trimmed;
    }
  }

  if (
    typeof window !== "undefined" &&
    window.location &&
    typeof window.location.hostname === "string" &&
    window.location.hostname.length > 0
  ) {
    const { hostname } = window.location;
    if (hostname === "localhost" || hostname === "127.0.0.1") return "http://localhost:3002";
    if (/^(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)/.test(hostname)) {
      return `http://${hostname}:3002`;
    }
    // Staging testfox.in
    if (hostname.endsWith("testfox.in")) {
      return "https://admin.testfox.in";
    }
    // Vercel deployment preview / production domains
    if (hostname.endsWith(".vercel.app")) {
      return deriveVercelUrl(hostname, "admin");
    }
    const parts = hostname.split(".");
    const rootDomain = parts.length >= 2 ? parts.slice(-2).join(".") : hostname;
    return `https://admin.${rootDomain}`;
  }
  return "http://localhost:3002";
}

export function getLmsUrl(): string {
  const envUrl = process.env.NEXT_PUBLIC_LMS_URL || process.env.LMS_URL;
  if (envUrl && typeof envUrl === "string" && envUrl.trim().length > 0) {
    const trimmed = envUrl.trim().replace(/\/+$/, "");
    if (typeof window !== "undefined" && window.location?.hostname) {
      if (matchesDomainFamily(trimmed, window.location.hostname)) {
        return trimmed;
      }
    } else {
      return trimmed;
    }
  }

  if (
    typeof window !== "undefined" &&
    window.location &&
    typeof window.location.hostname === "string" &&
    window.location.hostname.length > 0
  ) {
    const { hostname } = window.location;
    if (hostname === "localhost" || hostname === "127.0.0.1") return "http://localhost:3003";
    if (/^(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)/.test(hostname)) {
      return `http://${hostname}:3003`;
    }
    // Staging testfox.in
    if (hostname.endsWith("testfox.in")) {
      return "https://lms.testfox.in";
    }
    // Vercel deployment preview / production domains
    if (hostname.endsWith(".vercel.app")) {
      return deriveVercelUrl(hostname, "lms");
    }
    const parts = hostname.split(".");
    const rootDomain = parts.length >= 2 ? parts.slice(-2).join(".") : hostname;
    return `https://learn.${rootDomain}`;
  }
  return "http://localhost:3003";
}

/**
 * Normalizes URLs for development and multi-device LAN testing.
 * On production / custom domains, keeps real URLs intact or adapts cleanly.
 */
export function onThisHost(url: string): string {
  if (
    typeof window === "undefined" ||
    !window.location ||
    typeof window.location.hostname !== "string" ||
    !window.location.hostname
  ) {
    return url;
  }
  const host = window.location.hostname;

  // If URL already points to a real external domain, leave it intact
  if (!url.includes("localhost") && !url.includes("127.0.0.1")) {
    return url;
  }

  // On localhost, keep localhost
  if (host === "localhost" || host === "127.0.0.1") {
    return url;
  }

  // On local LAN IP (e.g. 192.168.1.15), route localhost:PORT to <ip>:PORT for phone testing
  if (/^(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)/.test(host)) {
    return url.replace(/^(https?:\/\/)(localhost|127\.0\.0\.1)(?=[:/]|$)/, `$1${host}`);
  }

  // On deployed domains (Vercel or custom domain), delegate to getApiBaseUrl()
  return getApiBaseUrl();
}
