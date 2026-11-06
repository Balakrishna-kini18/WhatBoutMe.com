/**
 * Completely Dynamic & Domain-Agnostic URL Configuration Engine.
 *
 * ZERO hardcoded domain names.
 * When domains change (rebranding, new TLDs, staging, Vercel preview, custom domains),
 * the system automatically detects and derives all application URLs dynamically from:
 *
 * 1. The incoming caller context (HTTP Request Origin / Referer / Host / X-Forwarded headers)
 * 2. Dynamic subdomain synthesis (admin.<domain>, learn.<domain>, <domain>, api.<domain>)
 * 3. Environment variable overrides (ROOT_DOMAIN, LMS_URL, ADMIN_URL, MARKETING_URL, API_URL)
 * 4. Local development fallbacks (localhost ports 3002, 3003, 3000, 4000)
 */

export interface AppUrls {
  adminUrl: string;
  lmsUrl: string;
  marketingUrl: string;
  apiUrl: string;
}

/**
 * Checks if a hostname points to localhost or a private local network IP.
 */
export function isLocalHost(host?: string | null): boolean {
  if (!host) return false;
  const clean = host.split(':')[0].toLowerCase();
  return (
    clean === 'localhost' ||
    clean.endsWith('.localhost') ||
    clean === '127.0.0.1' ||
    /^(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)/.test(clean)
  );
}

/**
 * Checks if a full URL string points to localhost or private network.
 */
export function isLocalUrl(url?: string | null): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url.includes('://') ? url : `http://${url}`);
    return isLocalHost(parsed.hostname);
  } catch {
    return url.includes('localhost') || url.includes('127.0.0.1');
  }
}

/**
 * Dynamically resolves application URLs without any hardcoded domain names.
 */
export function getAppUrls(reqOrOrigin?: any): AppUrls {
  const isProduction = process.env.NODE_ENV === 'production';

  // 1. Extract host, protocol, and origin dynamically from the incoming request or origin string
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
    const forwardedProto = reqOrOrigin.headers['x-forwarded-proto'];

    if (rawOrigin) {
      try {
        const parsed = new URL(rawOrigin);
        clientHost = parsed.hostname;
        clientOrigin = parsed.origin;
        clientProtocol = parsed.protocol;
      } catch {}
    }

    if (!clientHost && forwardedHost) {
      const hostHeader = String(forwardedHost).split(',')[0].trim();
      clientHost = hostHeader.split(':')[0];
      clientProtocol = forwardedProto ? `${forwardedProto}:` : (isLocalHost(clientHost) ? 'http:' : 'https:');
      clientOrigin = `${clientProtocol}//${hostHeader}`;
    }
  }

  // 2. Discover the base domain dynamically from the caller's host or environment
  // e.g. "learn.whateverdomain.com" -> base domain is "whateverdomain.com"
  // e.g. "admin.mybrand.co.uk" -> base domain is "mybrand.co.uk"
  const envRootDomain = process.env.ROOT_DOMAIN?.trim();
  let dynamicBaseDomain: string | null = null;

  if (envRootDomain) {
    dynamicBaseDomain = envRootDomain;
  } else if (clientHost && !isLocalHost(clientHost)) {
    if (clientHost.endsWith('.vercel.app')) {
      dynamicBaseDomain = clientHost;
    } else {
      // Dynamic base domain extractor: strip standard subdomains (admin, learn, lms, api, www, marketing)
      const parts = clientHost.split('.');
      if (
        parts.length >= 3 &&
        ['admin', 'learn', 'lms', 'api', 'www', 'marketing', 'portal', 'app'].includes(parts[0].toLowerCase())
      ) {
        dynamicBaseDomain = parts.slice(1).join('.');
      } else if (parts.length >= 2) {
        dynamicBaseDomain = clientHost;
      }
    }
  }

  const isLive = isProduction || (clientHost && !isLocalHost(clientHost)) || Boolean(dynamicBaseDomain);

  // 3. Synthesize dynamic defaults based on whatever domain is currently active (NO hardcoding!)
  let defaultAdmin: string;
  let defaultLms: string;
  let defaultMarketing: string;
  let defaultApi: string;

  if (dynamicBaseDomain) {
    const proto = clientProtocol || 'https:';
    if (dynamicBaseDomain.endsWith('.vercel.app')) {
      // For Vercel preview deployments, use the active preview origin
      defaultAdmin = clientOrigin || `${proto}//${dynamicBaseDomain}`;
      defaultLms = clientOrigin || `${proto}//${dynamicBaseDomain}`;
      defaultMarketing = clientOrigin || `${proto}//${dynamicBaseDomain}`;
      defaultApi = clientOrigin || `${proto}//${dynamicBaseDomain}`;
    } else {
      // Dynamic multi-app subdomain synthesis
      defaultAdmin = `${proto}//admin.${dynamicBaseDomain}`;
      defaultLms = `${proto}//learn.${dynamicBaseDomain}`;
      defaultMarketing = `${proto}//${dynamicBaseDomain}`;
      defaultApi = `${proto}//api.${dynamicBaseDomain}`;
    }
  } else if (clientHost && /^(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)/.test(clientHost)) {
    defaultAdmin = `http://${clientHost}:3002`;
    defaultLms = `http://${clientHost}:3003`;
    defaultMarketing = `http://${clientHost}:3000`;
    defaultApi = `http://${clientHost}:4000`;
  } else {
    // Local development fallback
    defaultAdmin = 'http://localhost:3002';
    defaultLms = 'http://localhost:3003';
    defaultMarketing = 'http://localhost:3000';
    defaultApi = 'http://localhost:4000';
  }

  // 4. Sanitize helper: in live/production mode, never allow leftover localhost env vars
  const pickUrl = (envVal: string | undefined, fallback: string): string => {
    if (!envVal || !envVal.trim()) return fallback;
    if (isLive && isLocalUrl(envVal)) {
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

  // 5. Dynamic Client Origin Alignment:
  // If the request specifically came from a client app, match that exact client app URL!
  if (clientOrigin) {
    const isClientLocal = isLocalUrl(clientOrigin);
    if (!isLive || !isClientLocal) {
      if (
        clientHost?.startsWith('admin.') ||
        clientOrigin.includes(':3002')
      ) {
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
        (dynamicBaseDomain && clientHost === dynamicBaseDomain) ||
        (dynamicBaseDomain && clientHost === `www.${dynamicBaseDomain}`)
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
