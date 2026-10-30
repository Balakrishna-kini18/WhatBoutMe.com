/**
 * Production-ready CORS origin validator.
 *
 * Automatically permits:
 * 1. Requests with no origin (mobile apps, server-to-server, curl, Postman).
 * 2. Explicit CORS_ORIGIN environment variable entries (supports exact strings or wildcards like *.custom.com).
 * 3. All subdomains and apex of the primary production domain (whatboutme.com).
 * 4. All subdomains and apex of any custom ROOT_DOMAIN configured in environment.
 * 5. All Vercel preview & production deployments (*.vercel.app).
 * 6. Localhost and 127.0.0.1 on any port.
 * 7. In non-production: Local Wi-Fi / LAN IP addresses (10.x, 192.168.x, 172.16-31.x) for phone/tablet testing.
 */

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function isAllowedCorsOrigin(
  origin: string | undefined,
  allowedOrigins: string[] = [],
  rootDomain = process.env.ROOT_DOMAIN || 'whatboutme.com',
): boolean {
  if (!origin) return true;

  // 1. Direct match in allowedOrigins list
  if (allowedOrigins.includes(origin)) return true;

  // 2. Wildcard check in allowedOrigins (e.g. "https://*.partner.com")
  for (const pattern of allowedOrigins) {
    if (pattern.includes('*')) {
      const regexPattern = '^' + escapeRegex(pattern).replace('\\*', '.*') + '$';
      if (new RegExp(regexPattern, 'i').test(origin)) {
        return true;
      }
    }
  }

  // 3. Primary production domain and any subdomain (e.g. whatboutme.com, admin.whatboutme.com, learn.whatboutme.com)
  if (/^https?:\/\/(?:[a-zA-Z0-9-]+\.)*whatboutme\.com(?::\d+)?$/i.test(origin)) {
    return true;
  }

  // 4. Custom root domain if configured and different from whatboutme.com
  if (rootDomain && rootDomain !== 'whatboutme.com') {
    const customRegex = new RegExp(
      `^https?:\\/\\/(?:[a-zA-Z0-9-]+\\.)*${escapeRegex(rootDomain)}(?::\\d+)?$`,
      'i',
    );
    if (customRegex.test(origin)) {
      return true;
    }
  }

  // 5. Vercel deployment domains
  if (/\.vercel\.app(?::\d+)?$/i.test(origin)) {
    return true;
  }

  // 6. Local development (localhost & 127.0.0.1)
  if (/^https?:\/\/localhost:[0-9]+$/i.test(origin) || /^https?:\/\/127\.0\.0\.1:[0-9]+$/i.test(origin)) {
    return true;
  }

  // 7. Non-production LAN IP addresses for mobile & multi-device testing
  if (
    process.env.NODE_ENV !== 'production' &&
    /^https?:\/\/(10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+):[0-9]+$/i.test(origin)
  ) {
    return true;
  }

  return false;
}

