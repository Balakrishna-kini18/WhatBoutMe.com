"use client";

import { useEffect, useSyncExternalStore } from "react";
import { API_BASE_URL, LMS_URL, getLmsUrl, loginUser, signupUser, sendSignupOtp as sendSignupOtpApi } from "./api";
import {
  buildAuthHref,
  consumeEnrollmentIntent,
  extractLmsOriginParam,
  extractRedirectParam,
  getStoredLmsOrigin,
  sanitizeReturnUrl,
  saveEnrollmentIntent,
} from "./auth-redirect";

export type EnrolledProgramItem = {
  enrolmentId?: string;
  batchId?: string;
  batchName?: string;
  programId: string;
  programTitle?: string;
  slug?: string;
  status?: string;
};

/** Signed-in learner, as returned by POST /auth/login or GET /auth/me. */
export type SessionUser = {
  id: string;
  email: string;
  name?: string | null;
  role?: string;
  country?: string | null;
  timezone?: string | null;
  enrolledPrograms?: EnrolledProgramItem[];
};

const USER_KEY = "wbm_user";
const TOKEN_KEY = "wbm_token";
const REFRESH_KEY = "wbm_refresh_token";
const CHANGE_EVENT = "wbm-auth-change";

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

// the raw string is the snapshot so React sees a stable value between renders
const getSnapshot = () => {
  try {
    return localStorage.getItem(USER_KEY);
  } catch {
    return null;
  }
};
const getServerSnapshot = () => null;

/** The signed-in user, or null. Always null during server rendering. */
export function useUser(): SessionUser | null {
  const raw = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SessionUser;
  } catch {
    return null;
  }
}

/** Refreshes current user's profile and active enrollments from /auth/me */
export async function refreshUserMe(): Promise<SessionUser | null> {
  const token = typeof window !== "undefined" ? localStorage.getItem(TOKEN_KEY) : null;
  if (!token) return null;
  try {
    const res = await fetch(`${API_BASE_URL}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const me = await res.json();
      const currentRaw = localStorage.getItem(USER_KEY);
      const prev = currentRaw ? JSON.parse(currentRaw) : {};
      const updated: SessionUser = { ...prev, ...me };
      localStorage.setItem(USER_KEY, JSON.stringify(updated));
      window.dispatchEvent(new Event(CHANGE_EVENT));
      return updated;
    }
  } catch {
    // offline or network error: use existing cache
  }
  return null;
}

/**
 * Checks whether the currently logged-in learner is enrolled in a given course/program.
 * Automatically keeps enrollment state synchronized with /auth/me in the background.
 */
export function useEnrolmentStatus(programId?: string, slug?: string) {
  const user = useUser();

  useEffect(() => {
    // Refresh enrollments in background on mount so local storage stays fresh
    if (typeof window !== "undefined" && localStorage.getItem(TOKEN_KEY)) {
      refreshUserMe();
    }
  }, []);

  const enrolledItem = user?.enrolledPrograms?.find((ep) => {
    if (programId && (ep.programId === programId || (ep as any).batch?.programId === programId)) {
      return true;
    }
    if (slug && ep.slug === slug) {
      return true;
    }
    return false;
  });

  const isEnrolled = Boolean(
    enrolledItem &&
      enrolledItem.status !== "CANCELLED" &&
      enrolledItem.status !== "REJECTED" &&
      enrolledItem.status !== "ARCHIVED"
  );

  const isFullyActive = Boolean(
    isEnrolled && (enrolledItem?.status === "ACTIVE" || enrolledItem?.status === "COMPLETED")
  );

  const isPendingAgreement = Boolean(
    isEnrolled && enrolledItem?.status === "PENDING_AGREEMENT"
  );

  const isPendingPayment = Boolean(
    isEnrolled && enrolledItem?.status === "PENDING_PAYMENT"
  );

  return {
    user,
    isLoggedIn: Boolean(user),
    isEnrolled,
    isFullyActive,
    isPendingAgreement,
    isPendingPayment,
    enrolment: enrolledItem ?? null,
    status: enrolledItem?.status ?? null,
  };
}

function storeSession(data: {
  access_token: string;
  refresh_token?: string;
  user: SessionUser;
}) {
  localStorage.setItem(TOKEN_KEY, data.access_token);
  if (data.refresh_token) localStorage.setItem(REFRESH_KEY, data.refresh_token);
  localStorage.setItem(USER_KEY, JSON.stringify(data.user));
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/** `identifier` is the account email or its mobile number. */
export async function signIn(identifier: string, password: string) {
  storeSession(await loginUser(identifier, password));
}

/** Sends a 6-digit verification code to the learner's email before registration. */
export async function sendSignupOtp(details: {
  name?: string;
  email: string;
  phone?: string;
}) {
  return await sendSignupOtpApi(details);
}

/** Creates a learner account with verified OTP. Automatically stores session if tokens are returned. */
export async function signUp(details: {
  name: string;
  email: string;
  phone?: string;
  password: string;
  country?: string;
  timezone?: string;
  otp?: string;
}) {
  const res = await signupUser(details);
  if (res?.access_token && res?.user) {
    storeSession({
      access_token: res.access_token,
      refresh_token: res.refresh_token,
      user: res.user,
    });
  }
  return res;
}

export function signOut() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
  localStorage.removeItem(USER_KEY);
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/**
 * Address that opens the learner portal already signed in. The session is
 * passed in the URL fragment, which browsers never send to a server; the
 * portal's /sso page stores it and removes it from the address bar.
 * Falls back to the plain portal address when nobody is signed in here.
 */
export function portalUrl(path = "/", overrideLmsUrl?: string | null) {
  const token = localStorage.getItem(TOKEN_KEY);
  const user = localStorage.getItem(USER_KEY);
  const lmsBase = getLmsUrl(overrideLmsUrl);
  if (!token || !user) return `${lmsBase}${path}`;

  const handoff = new URLSearchParams({ token, user, next: path });
  const refresh = localStorage.getItem(REFRESH_KEY);
  if (refresh) handoff.set("refresh", refresh);
  return `${lmsBase}/sso#${handoff.toString()}`;
}

/**
 * Renews the session before it is handed to the portal. Access tokens last 15
 * minutes and the portal does not renew an expired one, so without this a
 * learner who signed in a while ago would be asked to sign in again.
 * Returns false when the session can no longer be renewed.
 */
/** Seconds until the access token expires (negative once expired). */
function secondsLeft(token: string | null) {
  try {
    const payload = JSON.parse(atob((token ?? "").split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return payload.exp - Date.now() / 1000;
  } catch {
    return -1;
  }
}

async function renewSession(force = false): Promise<boolean> {
  const token = localStorage.getItem(TOKEN_KEY);
  // still comfortably valid: hand it over as it is
  if (!force && secondsLeft(token) > 120) return true;

  const refresh = localStorage.getItem(REFRESH_KEY);
  if (!refresh) return false;
  try {
    const res = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refresh }),
    });
    if (res.status === 401) return false;
    if (!res.ok) return true; // rate limited or server error: try the current token
    const data = await res.json();
    localStorage.setItem(TOKEN_KEY, data.access_token);
    if (data.refresh_token) localStorage.setItem(REFRESH_KEY, data.refresh_token);
    return true;
  } catch {
    return true; // offline: let the portal decide
  }
}

/**
 * Asks the server whether this session is still the learner's live one. A
 * newer sign-in elsewhere ends it, and handing an ended session to the portal
 * would replace the portal's good one and sign the learner out there.
 */
async function sessionEnded(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE_URL}/auth/session`, {
      headers: { Authorization: `Bearer ${localStorage.getItem(TOKEN_KEY)}` },
    });
    if (res.status !== 401) return false;
    // an expired token also answers 401; one renewal tells the two apart
    return !(await renewSession(true));
  } catch {
    return false; // offline: let the portal decide
  }
}

/** Only paths inside the portal, so a link cannot send the session elsewhere. */
export const portalPath = (path: string | null) => {
  const clean = sanitizeReturnUrl(path, "");
  return clean || null;
};

/** The website sign-in, remembering where in the portal the learner was going. */
export const loginUrl = (path: string) =>
  path === "/" ? "/login" : buildAuthHref("/login", path);

/** The website sign-up, remembering where in the portal the learner was going. */
export const signupUrl = (path: string) =>
  path === "/" ? "/signup" : buildAuthHref("/signup", path);

/**
 * Whether the signed-in learner has bought at least one course. Asks the API
 * so a purchase made a moment ago counts; falls back to what sign-in returned.
 */
async function hasPurchased(): Promise<boolean | "signed-out"> {
  const stored = (): SessionUser | null => {
    try {
      return JSON.parse(localStorage.getItem(USER_KEY) ?? "null");
    } catch {
      return null;
    }
  };
  const ask = () =>
    fetch(`${API_BASE_URL}/auth/me`, {
      headers: { Authorization: `Bearer ${localStorage.getItem(TOKEN_KEY)}` },
    });
  try {
    let res = await ask();
    if (res.status === 401) {
      // expired, or ended by a sign-in elsewhere: renew once, else sign out
      if (!(await renewSession(true))) return "signed-out";
      res = await ask();
      if (res.status === 401) return "signed-out";
    }
    if (res.ok) {
      const me = await res.json();
      localStorage.setItem(USER_KEY, JSON.stringify({ ...stored(), ...me }));
      window.dispatchEvent(new Event(CHANGE_EVENT));
    }
  } catch {
    // offline: use the stored answer
  }
  return (stored()?.enrolledPrograms?.length ?? 0) > 0;
}

/** Where a learner is sent when they try to open the portal without a course. */
export const PURCHASE_FIRST_URL = "/courses?purchase=required";

/**
 * Click handler for portal links. The portal opens, already signed in, only
 * for learners who have bought a course; everyone else is sent to the courses
 * page. Pass `requirePurchase: false` for the checkout link itself.
 */
export function openPortal(
  path = "/",
  {
    requirePurchase = true,
    preferSignupWhenSignedOut = false,
    lmsOrigin,
  }: {
    requirePurchase?: boolean;
    preferSignupWhenSignedOut?: boolean;
    lmsOrigin?: string | null;
  } = {},
) {
  return async (e: { preventDefault(): void }) => {
    e.preventDefault();
    if (!localStorage.getItem(USER_KEY)) {
      if (path && path !== "/") {
        saveEnrollmentIntent({ returnUrl: path, lmsOrigin: lmsOrigin || undefined });
      }
      window.location.assign(
        preferSignupWhenSignedOut ? signupUrl(path) : loginUrl(path),
      );
      return;
    }
    // with requirePurchase, hasPurchased() below asks the server anyway and
    // signs out on an ended session; the separate check is for checkout only
    if (!(await renewSession()) || (!requirePurchase && (await sessionEnded()))) {
      // the session ended (signed in elsewhere, or expired): sign in again here
      signOut();
      if (path && path !== "/") {
        saveEnrollmentIntent({ returnUrl: path, lmsOrigin: lmsOrigin || undefined });
      }
      window.location.assign(loginUrl(path));
      return;
    }
    if (requirePurchase) {
      const purchased = await hasPurchased();
      if (purchased === "signed-out") {
        signOut();
        if (path && path !== "/") {
          saveEnrollmentIntent({ returnUrl: path, lmsOrigin: lmsOrigin || undefined });
        }
        window.location.assign(loginUrl(path));
        return;
      }
      if (!purchased) {
        window.location.assign(PURCHASE_FIRST_URL);
        return;
      }
    }
    window.location.assign(portalUrl(path, lmsOrigin));
  };
}

/**
 * Carries on to the portal after signing in or up, when the learner was sent
 * here from it (`?redirect=/path`, `?returnTo=/path`, `?portal=/path`, or stored
 * 30-min enrollment intent). Returns false when there is nowhere to go.
 */
export function continueToPortal(
  explicitRedirect?: string | null,
  explicitLmsOrigin?: string | null,
): boolean {
  const search = typeof window !== "undefined" ? window.location.search : "";
  const fromParams = extractRedirectParam(search);
  const path = consumeEnrollmentIntent(explicitRedirect ?? fromParams, "");
  if (!path) return false;

  const resolvedLmsOrigin =
    explicitLmsOrigin ||
    (typeof window !== "undefined" ? extractLmsOriginParam(search) || getStoredLmsOrigin() : null);

  // Only the portal's home needs a course first. Checkout/Agreement/Programs are how one is
  // bought, and My Courses and Profile are open to every signed-in learner
  // (My Courses shows an empty state with a way to explore).
  const open = [
    "/agreement",
    "/agreements",
    "/checkout",
    "/courses",
    "/programs",
    "/profile",
  ].some((p) => path === p || path.startsWith(`${p}/`) || path.startsWith(`${p}?`));
  void openPortal(path, { requirePurchase: !open, lmsOrigin: resolvedLmsOrigin })({ preventDefault() {} });
  return true;
}

export const initialsOf = (user: SessionUser) =>
  (user.name || user.email)
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
