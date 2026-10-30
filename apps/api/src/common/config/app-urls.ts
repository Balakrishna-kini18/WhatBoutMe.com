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

  const defaultAdmin = isProduction ? `https://admin.${rootDomain}` : 'http://localhost:3002';
  const defaultLms = isProduction ? `https://learn.${rootDomain}` : 'http://localhost:3003';
  const defaultMarketing = isProduction ? `https://${rootDomain}` : 'http://localhost:3000';
  const defaultApi = isProduction ? `https://api.${rootDomain}` : 'http://localhost:4000';

  const adminUrl = (
    process.env.ADMIN_URL ||
    process.env.NEXT_PUBLIC_ADMIN_URL ||
    defaultAdmin
  ).replace(/\/+$/, '');

  const lmsUrl = (
    process.env.NEXT_PUBLIC_LMS_URL ||
    process.env.LMS_URL ||
    defaultLms
  ).replace(/\/+$/, '');

  const marketingUrl = (
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_MARKETING_URL ||
    process.env.SITE_URL ||
    defaultMarketing
  ).replace(/\/+$/, '');

  const apiUrl = (
    process.env.API_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    defaultApi
  ).replace(/\/+$/, '');

  return {
    adminUrl,
    lmsUrl,
    marketingUrl,
    apiUrl,
  };
}

