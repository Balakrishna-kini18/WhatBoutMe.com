/**
 * Production-Level Host & API URL Resolution
 *
 * Provides resilient, self-healing API URL resolution:
 * 1. Explicit NEXT_PUBLIC_API_URL environment variable takes absolute priority.
 * 2. Client-side runtime detection (window.location):
 *    - Local development (localhost / 127.0.0.1) -> http://localhost:4000
 *    - Local Wi-Fi LAN IP (e.g. 192.168.x.x for mobile testing) -> http://<ip>:4000
 *    - Vercel preview environments (*.vercel.app) -> https://what-bout-me-com.vercel.app
 *    - Live Custom Domains (e.g. whatboutme.com, admin.whatboutme.com) -> https://api.<root-domain>
 * 3. Server-side (SSR / Node.js) -> Fallback to http://localhost:4000
 */

export function getApiBaseUrl(): string {
  // 1. Explicit environment variable takes highest precedence
  const envUrl = process.env.NEXT_PUBLIC_API_URL;
  if (envUrl && typeof envUrl === "string" && envUrl.trim().length > 0) {
    return envUrl.trim().replace(/\/+$/, "");
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

      // Local LAN IP for Wi-Fi mobile testing (e.g. 192.168.1.x, 10.x.x.x, 172.16-31.x.x)
      if (/^(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)/.test(hostname)) {
        return `http://${hostname}:4000`;
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
      return envUrl.trim().replace(/\/+$/, "");
    }

      if (
        typeof window !== "undefined" &&
        window.location &&
        typeof window.location.hostname === "string" &&
        window.location.hostname.length > 0
      ) {
        const { hostname } = window.location;
        if (hostname === "localhost" || hostname === "127.0.0.1") return "http://localhost:3000";
        if (hostname.endsWith(".vercel.app")) return "https://what-bout-me-marketing.vercel.app";
        const parts = hostname.split(".");
        const rootDomain = parts.length >= 2 ? parts.slice(-2).join(".") : hostname;
        return `https://${rootDomain}`;
      }
      return "http://localhost:3000";
    }

    export function getLmsUrl(): string {
      const envUrl = process.env.NEXT_PUBLIC_LMS_URL;
      if (envUrl && typeof envUrl === "string" && envUrl.trim().length > 0) {
        return envUrl.trim().replace(/\/+$/, "");
      }

        if (
          typeof window !== "undefined" &&
          window.location &&
          typeof window.location.hostname === "string" &&
          window.location.hostname.length > 0
        ) {
          const { hostname } = window.location;
          if (hostname === "localhost" || hostname === "127.0.0.1") return "http://localhost:3003";
          if (hostname.endsWith(".vercel.app")) return "https://what-bout-me-lms.vercel.app";
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
