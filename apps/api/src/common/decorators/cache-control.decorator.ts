import { SetMetadata } from '@nestjs/common';

export const CACHE_CONTROL_METADATA = 'CACHE_CONTROL_METADATA';

export interface CacheControlOptions {
  directive?: string;
  scope?: 'public' | 'private' | 'no-cache' | 'no-store';
  maxAge?: number;
  sMaxAge?: number;
  staleWhileRevalidate?: number;
  mustRevalidate?: boolean;
}

export function CacheControl(optionsOrDirective: string | CacheControlOptions) {
  if (typeof optionsOrDirective === 'string') {
    return SetMetadata(CACHE_CONTROL_METADATA, optionsOrDirective);
  }

  const parts: string[] = [];
  if (optionsOrDirective.scope) parts.push(optionsOrDirective.scope);
  if (optionsOrDirective.maxAge !== undefined) parts.push(`max-age=${optionsOrDirective.maxAge}`);
  if (optionsOrDirective.sMaxAge !== undefined) parts.push(`s-maxage=${optionsOrDirective.sMaxAge}`);
  if (optionsOrDirective.staleWhileRevalidate !== undefined) {
    parts.push(`stale-while-revalidate=${optionsOrDirective.staleWhileRevalidate}`);
  }
  if (optionsOrDirective.mustRevalidate) parts.push('must-revalidate');

  return SetMetadata(CACHE_CONTROL_METADATA, parts.join(', '));
}

/**
 * Public read endpoints:
 * Cache-Control: public, s-maxage=60, stale-while-revalidate=300
 */
export const PublicCache = (sMaxAge = 60, staleWhileRevalidate = 300) =>
  CacheControl(`public, s-maxage=${sMaxAge}, stale-while-revalidate=${staleWhileRevalidate}`);

/**
 * Safe admin read endpoints:
 * Cache-Control: private, max-age=15, stale-while-revalidate=60
 */
export const AdminCache = (maxAge = 15, staleWhileRevalidate = 60) =>
  CacheControl(`private, max-age=${maxAge}, stale-while-revalidate=${staleWhileRevalidate}`);

/**
 * Explicit non-cacheable endpoints (e.g. sensitive auth mutations, payment processing):
 */
export const NoCache = () =>
  CacheControl('no-cache, no-store, must-revalidate');
