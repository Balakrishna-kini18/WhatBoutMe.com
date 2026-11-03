/**
 * Production-ready CORS origin validator.
 *
 * Automatically permits:
 * 1. Requests with no origin (mobile apps, server-to-server, curl, Postman).
 * 2. Explicit CORS_ORIGIN environment variable entries (supports exact strings or wildcards like *.custom.com).
 * 3. Approved Staging frontend domains (https://admin.testfox.in, https://lms.testfox.in, https://marketing.testfox.in, https://whatboutme.testfox.in).
 * 4. Approved Production frontend domains (https://whatboutme.com, https://admin.whatboutme.com, https://lms.whatboutme.com, https://marketing.whatboutme.com, https://api.whatboutme.com).
 * 5. All subdomains and apex of the primary production domain (whatboutme.com).
 * 6. All subdomains and apex of any custom ROOT_DOMAIN configured in environment.
 * 7. All Vercel preview & production deployments (*.vercel.app).
 * 8. Localhost and 127.0.0.1 on any port.
 * 9. In non-production: Local Wi-Fi / LAN IP addresses (10.x, 192.168.x, 172.16-31.x) for phone/tablet testing.
 */

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Explicitly approved production and staging frontend origins.
 */
export const APPROVED_APPLICATION_ORIGINS = new Set([
  // Staging environment (testfox.in)
  'https://admin.testfox.in',
  'https://lms.testfox.in',
  'https://marketing.testfox.in',
  'https://whatboutme.testfox.in',

  // Production environment (whatboutme.com)
  'https://whatboutme.com',
  'https://admin.whatboutme.com',
  'https://lms.whatboutme.com',
  'https://marketing.whatboutme.com',
  'https://api.whatboutme.com',
]);

export function isAllowedCorsOrigin(
  origin: string | undefined,
  allowedOrigins: string[] = [],
  rootDomain = process.env.ROOT_DOMAIN || 'whatboutme.com',
): boolean {
  if (!origin) return true;

  const normalizedOrigin = origin.trim().replace(/\/+$/, '');

  // 1. Direct match in explicitly approved static origins (staging & production)
  if (APPROVED_APPLICATION_ORIGINS.has(normalizedOrigin)) {
    return true;
  }

  // 2. Direct match in allowedOrigins list (from CORS_ORIGIN env var)
  if (allowedOrigins.includes(origin) || allowedOrigins.includes(normalizedOrigin)) {
    return true;
  }

  // 3. Wildcard check in allowedOrigins (e.g. "https://*.partner.com")
  for (const pattern of allowedOrigins) {
    if (pattern.includes('*')) {
      const regexPattern = '^' + escapeRegex(pattern).replace('\\*', '.*') + '$';
      if (new RegExp(regexPattern, 'i').test(normalizedOrigin)) {
        return true;
      }
    }
  }

  // 4. Primary production domain and any subdomain (e.g. whatboutme.com, admin.whatboutme.com, learn.whatboutme.com)
  if (/^https?:\/\/(?:[a-zA-Z0-9-]+\.)*whatboutme\.com(?::\d+)?$/i.test(normalizedOrigin)) {
    return true;
  }

  // 5. Custom root domain if configured and different from whatboutme.com
  if (rootDomain && rootDomain !== 'whatboutme.com') {
    const customRegex = new RegExp(
      `^https?:\\/\\/(?:[a-zA-Z0-9-]+\\.)*${escapeRegex(rootDomain)}(?::\\d+)?$`,
      'i',
    );
    if (customRegex.test(normalizedOrigin)) {
      return true;
    }
  }

  // 6. Vercel deployment domains
  if (/\.vercel\.app(?::\d+)?$/i.test(normalizedOrigin)) {
    return true;
  }

  // 7. Local development (localhost & 127.0.0.1)
  if (/^https?:\/\/localhost:[0-9]+$/i.test(normalizedOrigin) || /^https?:\/\/127\.0\.0\.1:[0-9]+$/i.test(normalizedOrigin)) {
    return true;
  }

  // 8. Non-production LAN IP addresses for mobile & multi-device testing
  if (
    process.env.NODE_ENV !== 'production' &&
    /^https?:\/\/(10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+):[0-9]+$/i.test(normalizedOrigin)
  ) {
    return true;
  }

  return false;
}
