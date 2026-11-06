/**
 * Authoritative production & development URL configuration.
 *
 * Provides guaranteed safe fallback URLs for:
 * - adminUrl (Admin & Partner Portal)
 * - lmsUrl (Learner Portal)
 * - marketingUrl (Public Website)
 * - apiUrl (Backend Core API)
 *
 * When custom domains or production environment variables are not explicitly set,
 * this prevents sending broken "http://localhost:..." links in automated emails
 * (such as password reset tokens, partner invites, certificates, invoices, and lead checkouts)
 * or redirecting live learners to localhost after Stripe checkout.
 */

export interface AppUrls {
  adminUrl: string;
  lmsUrl: string;
  marketingUrl: string;
  apiUrl: string;
}

export function isLocalHost(host?: string | null): boolean {
  if (!host) return false;
  return (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host === '127.0.0.1' ||
    /^(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)/.test(host)
  );
}

export function isLocalUrl(url?: string | null): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url.includes('://') ? url : `http://${url}`);
    return isLocalHost(parsed.hostname);
  } catch {
    return url.includes('localhost') || url.includes('127.0.0.1');
  }
}

export function getAppUrls(reqOrOrigin?: any): AppUrls {
  const isProduction = process.env.NODE_ENV === 'production';
  const rootDomain = process.env.ROOT_DOMAIN || 'whatboutme.com';

  // 1. Extract host & origin from parameter
  let clientHost: string | null = null;
    let clientOrigin: string | null = null;
    let clientProtocol = 'https:';

    if (typeof reqOrOrigin === 'string' && reqOrOrigin.trim()) {
      try {
        const parsed = new URL(reqOrOrigin.includes('://') ? reqOrOrigin : `https://${reqOrOrigin}`);
        clientHost = parsed.hostname;
        clientOrigin = parsed.origin;
        clientProtocol = parsed.protocol;
      } catch {
        clientHost = reqOrOrigin.split(':')[0];
      }
    } else if (reqOrOrigin?.headers) {
      const rawOrigin = reqOrOrigin.headers['origin'] || reqOrOrigin.headers['referer'];
      const forwardedHost = reqOrOrigin.headers['x-forwarded-host'] || reqOrOrigin.headers['host'];
      const forwardedProto = reqOrOrigin.headers['x-forwarded-proto'] || 'https';
      if (rawOrigin) {
        try {
          const parsed = new URL(rawOrigin);
          clientHost = parsed.hostname;
          clientOrigin = parsed.origin;
          clientProtocol = parsed.protocol;
        } catch { }
      }
      if (!clientHost && forwardedHost) {
        clientHost = String(forwardedHost).split(':')[0];
        clientProtocol = `${forwardedProto}:`;
        clientOrigin = `${clientProtocol}//${forwardedHost}`;
      }
    }

    const isStaging =
      process.env.APP_ENV === 'staging' ||
      rootDomain.includes('testfox.in') ||
      Boolean(clientHost?.endsWith('testfox.in')) ||
      Boolean(process.env.VERCEL_GIT_COMMIT_REF?.includes('staging'));

    // 2. Determine environment-specific safe defaults
    let defaultAdmin: string;
    let defaultLms: string;
    let defaultMarketing: string;
    let defaultApi: string;

    if (isStaging) {
      defaultAdmin = 'https://admin.testfox.in';
      defaultLms = 'https://lms.testfox.in';
      defaultMarketing = 'https://marketing.testfox.in';
      defaultApi = 'https://whatboutme.testfox.in';
    } else if (
      (process.env.VERCEL && !process.env.ROOT_DOMAIN) ||
      Boolean(clientHost?.endsWith('.vercel.app'))
    ) {
      const vUrl = (process.env.VERCEL_URL || clientHost || '').toLowerCase();
      if (
        vUrl.includes('whataboutme') ||
        vUrl.includes('whatboutme') ||
        vUrl.includes('what-bout-me-com-backend')
      ) {
        defaultAdmin = 'https://admin-whataboutme.vercel.app';
        defaultLms = 'https://lms-whatboutme.vercel.app';
        defaultMarketing = 'https://marketing-whatboutme.vercel.app';
        defaultApi = 'https://what-bout-me-com-backend.vercel.app';
      } else {
        defaultAdmin = 'https://what-bout-me-com-admin.vercel.app';
        defaultLms = 'https://what-bout-me-com-lms.vercel.app';
        defaultMarketing = 'https://what-bout-me-com-atyb.vercel.app';
        defaultApi = 'https://what-bout-me-com.vercel.app';
      }
    } else if (
      isProduction ||
        (clientHost && !isLocalHost(clientHost))
    ) {
      const activeDomain =
        clientHost && clientHost.split('.').length >= 2
          ? clientHost.split('.').slice(-2).join('.')
          : rootDomain;
      defaultAdmin = `https://admin.${activeDomain}`;
      defaultLms = `https://learn.${activeDomain}`;
      defaultMarketing = `https://${activeDomain}`;
      defaultApi = `https://api.${activeDomain}`;
    } else if (clientHost && /^(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)/.test(clientHost)) {
      defaultAdmin = `http://${clientHost}:3002`;
      defaultLms = `http://${clientHost}:3003`;
      defaultMarketing = `http://${clientHost}:3000`;
      defaultApi = `http://${clientHost}:4000`;
    } else {
      defaultAdmin = 'http://localhost:3002';
      defaultLms = 'http://localhost:3003';
      defaultMarketing = 'http://localhost:3000';
      defaultApi = 'http://localhost:4000';
    }

  // Sanitize helper: in production/staging or when client is on a live domain,
  // NEVER allow accidental localhost environment variables to override production domains!
  const isLive = isProduction || isStaging || (clientHost && !isLocalHost(clientHost));
    const pickUrl = (envVal: string | undefined, fallback: string): string => {
      if (!envVal || !envVal.trim()) return fallback;
      if (isLive && isLocalUrl(envVal)) {
        // In live environment, disregard any leftover localhost env var
        return fallback;
      }
      return envVal;
    };

    let adminUrl = pickUrl(
      process.env.NEXT_PUBLIC_ADMIN_URL || process.env.NEXT_PUBLIC_ADMIN_URl || process.env.ADMIN_URL,
      defaultAdmin,
    ).replace(/\/+$/, '');

  let lmsUrl = pickUrl(
        process.env.NEXT_PUBLIC_LMS_URL || process.env.LMS_URL,
        defaultLms,
      ).replace(/\/+$/, '');

  let marketingUrl = pickUrl(
        process.env.NEXT_PUBLIC_MARKETING_URL || process.env.NEXT_PUBLIC_SITE_URL || process.env.MARKETING_URL || process.env.SITE_URL,
        defaultMarketing,
      ).replace(/\/+$/, '');

  let apiUrl = pickUrl(
        process.env.NEXT_PUBLIC_API_URL || process.env.API_URL,
        defaultApi,
      ).replace(/\/+$/, '');

    // 3. Dynamic client origin context:
    // If the request originated from a specific client app, align that specific app's URL
    // (e.g. if LMS runs on port 3004 because 3003 was occupied, or a custom preview domain)
    if (clientOrigin) {
      const isClientLocal = isLocalUrl(clientOrigin);
      // If not live, allow local client origin; if live, allow only non-local client origin
      if (!isLive || !isClientLocal) {
        if (clientHost?.startsWith('admin.') || clientOrigin.includes(':3002')) {
          adminUrl = clientOrigin.replace(/\/+$/, '');
        } else if (
          clientHost?.startsWith('learn.') ||
          clientHost?.startsWith('lms.') ||
          clientOrigin.includes(':3003') ||
          clientOrigin.includes(':3004')
        ) {
          lmsUrl = clientOrigin.replace(/\/+$/, '');
        } else if (
          clientOrigin.includes(':3000') ||
          clientOrigin.includes(':3001') ||
          clientHost === rootDomain ||
          clientHost === `www.${rootDomain}`
        ) {
          marketingUrl = clientOrigin.replace(/\/+$/, '');
        }
      }
    }

    return {
      adminUrl,
      lmsUrl,
      marketingUrl,
      apiUrl,
    };
  }
