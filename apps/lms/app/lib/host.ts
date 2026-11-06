/**
 * Production-Level Host & API URL Resolution (LMS)
 *
 * Provides resilient, self-healing API URL resolution:
 * 1. Checks if explicit env var exists AND belongs to the active domain family.
 *    (Prevents build-time inlined production/preview URLs from leaking into staging or localhost).
 * 2. Client-side runtime detection (window.location):
 *    - Local development (localhost / 127.0.0.1) -> http://localhost:4000
 *    - Local Wi-Fi LAN IP (e.g. 192.168.x.x for mobile testing) -> http://<ip>:4000
 *    - Staging (*.testfox.in) -> https://whatboutme.testfox.in (API), https://marketing.testfox.in (Marketing), https://admin.testfox.in (Admin), https://lms.testfox.in (LMS)
 *    - Vercel deployments (*.vercel.app) -> https://what-bout-me-com.vercel.app (API), https://what-bout-me-com-atyb.vercel.app (Marketing), https://what-bout-me-com-admin.vercel.app (Admin), https://what-bout-me-com-lms.vercel.app (LMS)
 *    - Live Custom Domains (e.g. whatboutme.com) -> https://api.<root-domain>, https://<root-domain>, https://admin.<root-domain>
 * 3. Server-side (SSR / Node.js) -> Fallback to environment or default
 */

export function matchesDomainFamily(candidateUrl: string, currentHost: string): boolean {
  try {
    const candidateHost = new URL(candidateUrl).hostname.toLowerCase();
    const host = currentHost.toLowerCase();

    // Localhost
    if (host === "localhost" || host === "127.0.0.1") {
      return candidateHost === "localhost" || candidateHost === "127.0.0.1";
    }

    // Local LAN IP
    if (/^(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)/.test(host)) {
      return (
        /^(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)/.test(candidateHost) ||
        candidateHost === "localhost"
      );
    }

    // Staging testfox.in
    if (host.endsWith("testfox.in")) {
      return candidateHost.endsWith("testfox.in");
    }

    // Vercel deployment preview domains
    if (host.endsWith("vercel.app")) {
      return candidateHost.endsWith("vercel.app");
    }

    // Custom domain production (whatboutme.com)
    if (host.endsWith("whatboutme.com")) {
      return candidateHost.endsWith("whatboutme.com");
    }

    // Fallback: compare root domains
    const parts = host.split(".");
    if (parts.length >= 2) {
      const rootDomain = parts.slice(-2).join(".");
      return candidateHost.endsWith(rootDomain);
    }
    return true;
  } catch {
    return false;
  }
}

export function getApiBaseUrl(): string {
  // 1. Explicit environment variable validated against domain family
  const envUrl = process.env.NEXT_PUBLIC_API_URL;
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

  // 2. Client-side runtime detection
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

    // Vercel deployment preview domains
    if (hostname.endsWith(".vercel.app")) {
      return "https://what-bout-me-com.vercel.app";
    }

    // Custom domain production: extract root domain and point to https://api.<root-domain>
    const parts = hostname.split(".");
    const rootDomain = parts.length >= 2 ? parts.slice(-2).join(".") : hostname;
    return `https://api.${rootDomain}`;
  }

  // 3. Server-side (SSR) fallback
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }

  return "http://localhost:4000";
}

export function getMarketingUrl(): string {
  const envUrl = process.env.NEXT_PUBLIC_MARKETING_URL || process.env.NEXT_PUBLIC_SITE_URL;
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
    // Vercel deployment preview domains
    if (hostname.endsWith(".vercel.app")) {
      return "https://what-bout-me-com-atyb.vercel.app";
    }
    const parts = hostname.split(".");
    const rootDomain = parts.length >= 2 ? parts.slice(-2).join(".") : hostname;
    return `https://${rootDomain}`;
  }
  return "http://localhost:3000";
}

export function getAdminUrl(): string {
  const envUrl = process.env.NEXT_PUBLIC_ADMIN_URL || process.env.NEXT_PUBLIC_ADMIN_URl;
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
    if (hostname.endsWith(".vercel.app")) return "https://what-bout-me-com-admin.vercel.app";
    const parts = hostname.split(".");
    const rootDomain = parts.length >= 2 ? parts.slice(-2).join(".") : hostname;
    return `https://admin.${rootDomain}`;
  }
  return "http://localhost:3002";
}

export function getLmsUrl(): string {
  const envUrl = process.env.NEXT_PUBLIC_LMS_URL;
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
    if (hostname.endsWith(".vercel.app")) return "https://what-bout-me-com-lms.vercel.app";
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
