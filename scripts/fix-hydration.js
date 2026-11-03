const fs = require('fs');

// 1. apps/marketing/src/lib/auth-redirect.ts
const authRedirectPath = 'apps/marketing/src/lib/auth-redirect.ts';
let authRedirect = fs.readFileSync(authRedirectPath, 'utf8').replace(/\r\n/g, '\n');

const authRedirectTarget = `export function buildAuthHref(
  authPath: "/login" | "/signup" | "/register" | "/forgot-password" | "/verify-email",
  redirectUrl?: string | null,
  extraParams?: Record<string, string | null | undefined>,
): string {
  const sanitized = sanitizeReturnUrl(redirectUrl, "");
  const params = new URLSearchParams();
  if (sanitized) {
    params.set("redirect", sanitized);
    params.set("portal", sanitized);
  }

  // Preserve lms_origin across auth page transitions
  const currentLmsOrigin =
    typeof window !== "undefined" && window?.location?.search
      ? extractLmsOriginParam(window.location.search) || getStoredLmsOrigin()
      : typeof window !== "undefined"
        ? getStoredLmsOrigin()
        : null;
  if (currentLmsOrigin) {
    params.set("lms_origin", currentLmsOrigin);
  }

  if (extraParams) {
    for (const [k, v] of Object.entries(extraParams)) {
      if (v !== undefined && v !== null && v !== "") {
        params.set(k, v);
      }
    }
  }
  const qs = params.toString();
  return qs ? \`\${authPath}?\${qs}\` : authPath;
}`;

const authRedirectReplacement = `export function buildAuthHref(
  authPath: "/login" | "/signup" | "/register" | "/forgot-password" | "/verify-email",
  redirectUrl?: string | null,
  extraParams?: Record<string, string | null | undefined>,
  explicitLmsOrigin?: string | null,
): string {
  const sanitized = sanitizeReturnUrl(redirectUrl, "");
  const params = new URLSearchParams();
  if (sanitized) {
    params.set("redirect", sanitized);
    params.set("portal", sanitized);
  }

  // Preserve lms_origin when explicitly passed or in extraParams (hydration-safe, never accesses window synchronously)
  const rawOrigin = explicitLmsOrigin ?? (extraParams?.lms_origin as string | undefined);
  const originToUse = sanitizeLmsOrigin(rawOrigin);
  if (originToUse) {
    params.set("lms_origin", originToUse);
  }

  if (extraParams) {
    for (const [k, v] of Object.entries(extraParams)) {
      if (k !== "lms_origin" && v !== undefined && v !== null && v !== "") {
        params.set(k, v);
      }
    }
  }
  const qs = params.toString();
  return qs ? \`\${authPath}?\${qs}\` : authPath;
}`;

if (authRedirect.includes(authRedirectTarget)) {
  fs.writeFileSync(authRedirectPath, authRedirect.replace(authRedirectTarget, authRedirectReplacement), 'utf8');
  console.log('auth-redirect.ts updated');
} else {
  console.error('auth-redirect.ts target NOT found');
  process.exit(1);
}

// 2. apps/marketing/src/app/login/page.tsx
const loginPath = 'apps/marketing/src/app/login/page.tsx';
let login = fs.readFileSync(loginPath, 'utf8').replace(/\r\n/g, '\n');

// Add getStoredLmsOrigin to imports if needed
login = login.replace(
  '  saveLmsOrigin,\n} from "@/lib/auth-redirect";',
  '  saveLmsOrigin,\n  getStoredLmsOrigin,\n} from "@/lib/auth-redirect";'
);

login = login.replace(
  '  const [activeRedirect, setActiveRedirect] = useState<string | null>(null);',
  '  const [activeRedirect, setActiveRedirect] = useState<string | null>(null);\n  const [activeLmsOrigin, setActiveLmsOrigin] = useState<string | null>(null);'
);

login = login.replace(
  `    const redirectFromUrl = extractRedirectParam(params);
    const lmsOriginFromUrl = extractLmsOriginParam(params);

    if (lmsOriginFromUrl) {
      saveLmsOrigin(lmsOriginFromUrl);
    }`,
  `    const redirectFromUrl = extractRedirectParam(params);
    const lmsOriginFromUrl = extractLmsOriginParam(params);
    const origin = lmsOriginFromUrl || getStoredLmsOrigin();

    if (origin) {
      saveLmsOrigin(origin);
      setActiveLmsOrigin(origin);
    }`
);

login = login.replace(
  'redirectFromUrl ? buildAuthHref("/login", redirectFromUrl) : "/login"',
  'redirectFromUrl ? buildAuthHref("/login", redirectFromUrl, undefined, origin) : "/login"'
);

login = login.replace(
  'href={buildAuthHref("/forgot-password", activeRedirect)}',
  'href={buildAuthHref("/forgot-password", activeRedirect, undefined, activeLmsOrigin)}'
);

login = login.replace(
  'href={buildAuthHref("/signup", activeRedirect)}',
  'href={buildAuthHref("/signup", activeRedirect, undefined, activeLmsOrigin)}'
);

fs.writeFileSync(loginPath, login, 'utf8');
console.log('login/page.tsx updated');

// 3. apps/marketing/src/app/signup/page.tsx
const signupPath = 'apps/marketing/src/app/signup/page.tsx';
let signup = fs.readFileSync(signupPath, 'utf8').replace(/\r\n/g, '\n');

signup = signup.replace(
  '  extractLmsOriginParam,\n  extractRedirectParam,',
  '  extractLmsOriginParam,\n  extractRedirectParam,\n  getStoredLmsOrigin,'
);

signup = signup.replace(
  '  const [activeRedirect, setActiveRedirect] = useState<string | null>(null);',
  '  const [activeRedirect, setActiveRedirect] = useState<string | null>(null);\n  const [activeLmsOrigin, setActiveLmsOrigin] = useState<string | null>(null);'
);

signup = signup.replace(
  `    const redirectFromUrl = extractRedirectParam(params);
    const lmsOriginFromUrl = extractLmsOriginParam(params);

    if (lmsOriginFromUrl) {
      saveLmsOrigin(lmsOriginFromUrl);
    }`,
  `    const redirectFromUrl = extractRedirectParam(params);
    const lmsOriginFromUrl = extractLmsOriginParam(params);
    const origin = lmsOriginFromUrl || getStoredLmsOrigin();

    if (origin) {
      saveLmsOrigin(origin);
      setActiveLmsOrigin(origin);
    }`
);

signup = signup.replace(
  'href={buildAuthHref("/login", activeRedirect)}',
  'href={buildAuthHref("/login", activeRedirect, undefined, activeLmsOrigin)}'
);

fs.writeFileSync(signupPath, signup, 'utf8');
console.log('signup/page.tsx updated');

// 4. apps/marketing/src/app/forgot-password/page.tsx
const forgotPath = 'apps/marketing/src/app/forgot-password/page.tsx';
let forgot = fs.readFileSync(forgotPath, 'utf8').replace(/\r\n/g, '\n');

forgot = forgot.replace(
  '  extractRedirectParam,\n  peekEnrollmentIntent,\n} from "@/lib/auth-redirect";',
  '  extractRedirectParam,\n  extractLmsOriginParam,\n  getStoredLmsOrigin,\n  saveLmsOrigin,\n  peekEnrollmentIntent,\n} from "@/lib/auth-redirect";'
);

forgot = forgot.replace(
  '  const [activeRedirect, setActiveRedirect] = useState<string | null>(null);',
  '  const [activeRedirect, setActiveRedirect] = useState<string | null>(null);\n  const [activeLmsOrigin, setActiveLmsOrigin] = useState<string | null>(null);'
);

forgot = forgot.replace(
  `  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const redirectFromUrl = extractRedirectParam(params);
    if (redirectFromUrl) {
      saveEnrollmentIntent({ returnUrl: redirectFromUrl });
      setActiveRedirect(redirectFromUrl);
    } else {
      const stored = peekEnrollmentIntent();
      if (stored?.returnUrl) {
        setActiveRedirect(stored.returnUrl);
      }
    }
  }, []);`,
  `  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const redirectFromUrl = extractRedirectParam(params);
    const lmsOriginFromUrl = extractLmsOriginParam(params);
    const origin = lmsOriginFromUrl || getStoredLmsOrigin();

    if (origin) {
      saveLmsOrigin(origin);
      setActiveLmsOrigin(origin);
    }

    if (redirectFromUrl) {
      saveEnrollmentIntent({ returnUrl: redirectFromUrl, lmsOrigin: origin || undefined });
      setActiveRedirect(redirectFromUrl);
    } else {
      const stored = peekEnrollmentIntent();
      if (stored?.returnUrl) {
        setActiveRedirect(stored.returnUrl);
      }
    }
  }, []);`
);

forgot = forgot.replaceAll(
  'href={buildAuthHref("/login", activeRedirect)}',
  'href={buildAuthHref("/login", activeRedirect, undefined, activeLmsOrigin)}'
);

fs.writeFileSync(forgotPath, forgot, 'utf8');
console.log('forgot-password/page.tsx updated');

// 5. apps/marketing/src/app/reset-password/page.tsx
const resetPath = 'apps/marketing/src/app/reset-password/page.tsx';
let reset = fs.readFileSync(resetPath, 'utf8').replace(/\r\n/g, '\n');

reset = reset.replace(
  'import { Suspense, useMemo, useState, type FormEvent } from "react";',
  'import { Suspense, useEffect, useMemo, useState, type FormEvent } from "react";'
);

reset = reset.replace(
  '  extractRedirectParam,\n  peekEnrollmentIntent,\n} from "@/lib/auth-redirect";',
  '  extractRedirectParam,\n  extractLmsOriginParam,\n  getStoredLmsOrigin,\n  peekEnrollmentIntent,\n} from "@/lib/auth-redirect";'
);

reset = reset.replace(
  `  const activeRedirect =
    extractRedirectParam(searchParams) ?? peekEnrollmentIntent()?.returnUrl ?? null;`,
  `  const [activeRedirect, setActiveRedirect] = useState<string | null>(null);
  const [activeLmsOrigin, setActiveLmsOrigin] = useState<string | null>(null);

  useEffect(() => {
    const redirectFromUrl = extractRedirectParam(searchParams);
    const lmsOriginFromUrl = extractLmsOriginParam(searchParams);
    const origin = lmsOriginFromUrl || getStoredLmsOrigin();

    if (origin) {
      setActiveLmsOrigin(origin);
    }

    if (redirectFromUrl) {
      setActiveRedirect(redirectFromUrl);
    } else {
      const stored = peekEnrollmentIntent();
      if (stored?.returnUrl) {
        setActiveRedirect(stored.returnUrl);
      }
    }
  }, [searchParams]);`
);

reset = reset.replace(
  'href={buildAuthHref("/forgot-password", activeRedirect)}',
  'href={buildAuthHref("/forgot-password", activeRedirect, undefined, activeLmsOrigin)}'
);

reset = reset.replaceAll(
  'href={buildAuthHref("/login", activeRedirect)}',
  'href={buildAuthHref("/login", activeRedirect, undefined, activeLmsOrigin)}'
);

fs.writeFileSync(resetPath, reset, 'utf8');
console.log('reset-password/page.tsx updated');

// 6. apps/marketing/src/app/verify-email/page.tsx
const verifyPath = 'apps/marketing/src/app/verify-email/page.tsx';
let verify = fs.readFileSync(verifyPath, 'utf8').replace(/\r\n/g, '\n');

verify = verify.replace(
  '  extractRedirectParam,\n  peekEnrollmentIntent,\n  saveEnrollmentIntent,\n} from "@/lib/auth-redirect";',
  '  extractRedirectParam,\n  extractLmsOriginParam,\n  getStoredLmsOrigin,\n  peekEnrollmentIntent,\n  saveEnrollmentIntent,\n} from "@/lib/auth-redirect";'
);

verify = verify.replace(
  '  const [activeRedirect, setActiveRedirect] = useState<string | null>(redirectFromUrl);',
  '  const [activeRedirect, setActiveRedirect] = useState<string | null>(null);\n  const [activeLmsOrigin, setActiveLmsOrigin] = useState<string | null>(null);'
);

verify = verify.replace(
  `  useEffect(() => {
    if (redirectFromUrl) {
      saveEnrollmentIntent({ returnUrl: redirectFromUrl });
      setActiveRedirect(redirectFromUrl);
    } else {
      const stored = peekEnrollmentIntent();
      if (stored?.returnUrl) {
        setActiveRedirect(stored.returnUrl);
      }
    }
  }, [redirectFromUrl]);`,
  `  useEffect(() => {
    const lmsOriginFromUrl = extractLmsOriginParam(searchParams);
    const origin = lmsOriginFromUrl || getStoredLmsOrigin();

    if (origin) {
      setActiveLmsOrigin(origin);
    }

    if (redirectFromUrl) {
      saveEnrollmentIntent({ returnUrl: redirectFromUrl, lmsOrigin: origin || undefined });
      setActiveRedirect(redirectFromUrl);
    } else {
      const stored = peekEnrollmentIntent();
      if (stored?.returnUrl) {
        setActiveRedirect(stored.returnUrl);
      }
    }
  }, [redirectFromUrl, searchParams]);`
);

verify = verify.replaceAll(
  'href={buildAuthHref("/login", activeRedirect)}',
  'href={buildAuthHref("/login", activeRedirect, undefined, activeLmsOrigin)}'
);

fs.writeFileSync(verifyPath, verify, 'utf8');
console.log('verify-email/page.tsx updated');

