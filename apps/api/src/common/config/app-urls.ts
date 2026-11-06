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
 * (such as password reset tokens, partner invites, certificates, invoices, and lead checkouts).
 */

export interface AppUrls {
  adminUrl: string;
  lmsUrl: string;
  marketingUrl: string;
  apiUrl: string;
}

export function getAppUrls(reqOrOrigin?: any): AppUrls {
  const isProduction = process.env.NODE_ENV === 'production';
  const rootDomain = process.env.ROOT_DOMAIN || 'whatboutme.com';

  // Extract client origin or host if available from Request object or string
  let clientHost: string | null = null;
  if (typeof reqOrOrigin === 'string') {
    try {
      clientHost = reqOrOrigin.includes('://') ? new URL(reqOrOrigin).hostname : reqOrOrigin;
    } catch {
      clientHost = reqOrOrigin;
    }
  } else if (reqOrOrigin?.headers) {
    const rawOrigin = reqOrOrigin.headers['origin'] || reqOrOrigin.headers['referer'];
    const forwardedHost = reqOrOrigin.headers['x-forwarded-host'] || reqOrOrigin.headers['host'];
    if (rawOrigin) {
      try {
        clientHost = new URL(rawOrigin).hostname;
      } catch {}
    }
    if (!clientHost && forwardedHost) {
      clientHost = String(forwardedHost).split(':')[0];
    }
  }

  const isStaging =
    process.env.APP_ENV === 'staging' ||
    rootDomain.includes('testfox.in') ||
    Boolean(clientHost?.endsWith('testfox.in')) ||
    Boolean(process.env.VERCEL_GIT_COMMIT_REF?.includes('staging'));

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
    if (vUrl.includes('whataboutme')) {
      defaultAdmin = 'https://admin-whataboutme.vercel.app';
      defaultLms = 'https://lms-whataboutme.vercel.app';
      defaultMarketing = 'https://whataboutme.vercel.app';
      defaultApi = 'https://api-whataboutme.vercel.app';
    } else {
      defaultAdmin = 'https://what-bout-me-com-admin.vercel.app';
      defaultLms = 'https://what-bout-me-com-lms.vercel.app';
      defaultMarketing = 'https://what-bout-me-com-atyb.vercel.app';
      defaultApi = 'https://what-bout-me-com.vercel.app';
    }
  } else if (
    isProduction ||
    (clientHost &&
      !clientHost.includes('localhost') &&
      !clientHost.includes('127.0.0.1') &&
      !/^(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)/.test(clientHost))
  ) {
    const activeDomain =
      clientHost && clientHost.split('.').length >= 2
        ? clientHost.split('.').slice(-2).join('.')
        : rootDomain;
    defaultAdmin = `https://admin.${activeDomain}`;
    defaultLms = `https://learn.${activeDomain}`;
    defaultMarketing = `https://${activeDomain}`;
    defaultApi = `https://api.${activeDomain}`;
  } else if (
    clientHost &&
    /^(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)/.test(clientHost)
  ) {
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

  const adminUrl = (
    process.env.NEXT_PUBLIC_ADMIN_URL ||
    process.env.NEXT_PUBLIC_ADMIN_URl ||
    process.env.ADMIN_URL ||
    defaultAdmin
  ).replace(/\/+$/, '');

  const lmsUrl = (
    process.env.NEXT_PUBLIC_LMS_URL ||
    process.env.LMS_URL ||
    defaultLms
  ).replace(/\/+$/, '');

  const marketingUrl = (
    process.env.NEXT_PUBLIC_MARKETING_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.MARKETING_URL ||
    process.env.SITE_URL ||
    defaultMarketing
  ).replace(/\/+$/, '');

  const apiUrl = (
    process.env.NEXT_PUBLIC_API_URL ||
    process.env.API_URL ||
    defaultApi
  ).replace(/\/+$/, '');

  return {
    adminUrl,
    lmsUrl,
    marketingUrl,
    apiUrl,
  };
}
