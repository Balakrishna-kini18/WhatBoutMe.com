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

export function getAppUrls(): AppUrls {
  const isProduction = process.env.NODE_ENV === 'production';
  const rootDomain = process.env.ROOT_DOMAIN || 'whatboutme.com';
  const isStaging =
    process.env.APP_ENV === 'staging' ||
    rootDomain.includes('testfox.in') ||
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
  } else if (process.env.VERCEL && !process.env.ROOT_DOMAIN) {
    const vUrl = (process.env.VERCEL_URL || '').toLowerCase();
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
  } else if (isProduction) {
    defaultAdmin = `https://admin.${rootDomain}`;
    defaultLms = `https://learn.${rootDomain}`;
    defaultMarketing = `https://${rootDomain}`;
    defaultApi = `https://api.${rootDomain}`;
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
