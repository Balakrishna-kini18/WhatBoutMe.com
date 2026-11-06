/**
 * Senior Developer Dynamic CORS Validator
 *
 * ZERO hardcoded domain names.
 * Dynamically permits:
 * 1. Requests with no origin (mobile apps, server-to-server, curl, Postman).
 * 2. Any Vercel deployment (*.vercel.app) across all branches, previews, and productions.
 * 3. Any origin matching or belonging to the configured ROOT_DOMAIN (apex and all subdomains).
 * 4. Any origin matching configured environment variables (CORS_ORIGIN, LMS_URL, ADMIN_URL, MARKETING_URL, SITE_URL, API_URL, FRONTEND_URL).
 * 5. Localhost and 127.0.0.1 on any port.
 * 6. Local LAN IPs (10.x, 192.168.x, 172.16-31.x) for phone/tablet testing.
 */

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function isAllowedCorsOrigin(
  origin: string | undefined,
  allowedOrigins: string[] = [],
  rootDomain = process.env.ROOT_DOMAIN,
): boolean {
  // 1. Allow requests with no origin (mobile apps, server-to-server, curl, Postman)
  if (!origin) return true;

  const normalizedOrigin = origin.trim().replace(/\/+$/, '');

  let parsedUrl: URL | null = null;
  try {
    parsedUrl = new URL(normalizedOrigin);
  } catch {
    return false;
  }

  const hostname = parsedUrl.hostname.toLowerCase();

  // 2. Local development: localhost & 127.0.0.1 on any port
  if (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname === '127.0.0.1' ||
    /^(10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)$/.test(hostname)
  ) {
    return true;
  }

  // 3. Dynamic Vercel support: allow ANY *.vercel.app deployment (zero project-name hardcoding)
  if (hostname === 'vercel.app' || hostname.endsWith('.vercel.app')) {
    return true;
  }

  // 4. Wildcard check in allowedOrigins
  if (allowedOrigins.includes('*')) {
    return true;
  }

  // 5. Direct match in allowedOrigins list (from CORS_ORIGIN env var)
  if (allowedOrigins.includes(origin) || allowedOrigins.includes(normalizedOrigin)) {
    return true;
  }

  // 6. Pattern/Wildcard match in allowedOrigins (e.g. "https://*.custom.com")
  for (const pattern of allowedOrigins) {
    if (pattern.includes('*')) {
      const regexPattern = '^' + escapeRegex(pattern.trim().replace(/\/+$/, '')).replace('\\*', '.*') + '$';
      if (new RegExp(regexPattern, 'i').test(normalizedOrigin)) {
        return true;
      }
    }
  }

  // 7. Dynamic check against all service environment variables (ADMIN_URL, LMS_URL, etc.)
  const envServiceOrigins = [
    process.env.ADMIN_URL,
    process.env.NEXT_PUBLIC_ADMIN_URL,
    process.env.NEXT_PUBLIC_ADMIN_URl,
    process.env.LMS_URL,
    process.env.NEXT_PUBLIC_LMS_URL,
    process.env.MARKETING_URL,
    process.env.SITE_URL,
    process.env.NEXT_PUBLIC_MARKETING_URL,
    process.env.NEXT_PUBLIC_SITE_URL,
    process.env.API_URL,
    process.env.NEXT_PUBLIC_API_URL,
    process.env.FRONTEND_URL,
  ]
    .filter((val): val is string => Boolean(val && typeof val === 'string'))
    .map((url) => {
      try {
        return new URL(url).origin;
      } catch {
        return url.trim().replace(/\/+$/, '');
      }
    });

  if (envServiceOrigins.includes(normalizedOrigin)) {
    return true;
  }

  // 8. Dynamic apex and subdomain matching for any configured ROOT_DOMAIN
  if (rootDomain && rootDomain.trim()) {
    const cleanDomain = rootDomain.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    if (cleanDomain) {
      if (hostname === cleanDomain || hostname.endsWith(`.${cleanDomain}`)) {
        return true;
      }
    }
  }

  // 9. Derive base domain from API_URL if configured, allowing all sibling subdomains
  const apiUrlStr = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL;
  if (apiUrlStr) {
    try {
      const apiHost = new URL(apiUrlStr).hostname.toLowerCase();
      const parts = apiHost.split('.');
      if (parts.length >= 3) {
        const baseDomain = parts.slice(1).join('.');
        if (hostname === baseDomain || hostname.endsWith(`.${baseDomain}`)) {
          return true;
        }
      }
    } catch {}
  }

  return false;
}
