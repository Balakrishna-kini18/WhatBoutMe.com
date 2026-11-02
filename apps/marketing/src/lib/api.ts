import {
  extractLmsOriginParam,
  getStoredLmsOrigin,
  sanitizeLmsOrigin,
  saveLmsOrigin,
} from "./auth-redirect";

/**
 * Production-Level Host & API URL Resolution (Marketing Website)
 *
 * Provides resilient, self-healing API URL resolution:
 * 1. Checks if explicit env var exists AND belongs to the active domain family.
 *    (Prevents build-time inlined production/preview URLs from leaking into staging or localhost).
 * 2. Client-side runtime detection (window.location):
 *    - Local development (localhost / 127.0.0.1) -> http://localhost:4000
 *    - Local Wi-Fi LAN IP -> http://<ip>:4000
 *    - Staging (*.testfox.in) -> https://whatboutme.testfox.in (API), https://marketing.testfox.in (Marketing), https://admin.testfox.in (Admin), https://lms.testfox.in (LMS)
 *    - Vercel deployments (*.vercel.app) -> https://what-bout-me-com.vercel.app (API), https://what-bout-me-com-admin.vercel.app (Admin), https://what-bout-me-com-lms.vercel.app (LMS)
 *    - Live Custom Domains (e.g. whatboutme.com) -> https://api.<root-domain>, https://admin.<root-domain>, https://learn.<root-domain>
 */

export function matchesDomainFamily(candidateUrl: string, currentHost: string): boolean {
  try {
    const candidateHost = new URL(candidateUrl).hostname.toLowerCase();
    const host = currentHost.toLowerCase();

    // Localhost
    if (host === "localhost" || host === "127.0.0.1") {
      return candidateHost === "localhost" || candidateHost === "127.0.0.1";
    }

    // Local LAN IP
    if (/^(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)/.test(host)) {
      return (
        /^(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)/.test(candidateHost) ||
        candidateHost === "localhost"
      );
    }

    // Staging testfox.in
    if (host.endsWith("testfox.in")) {
      return candidateHost.endsWith("testfox.in");
    }

    // Vercel deployment preview domains
    if (host.endsWith("vercel.app")) {
      return candidateHost.endsWith("vercel.app");
    }

    // Custom domain production (whatboutme.com)
    if (host.endsWith("whatboutme.com")) {
      return candidateHost.endsWith("whatboutme.com");
    }

    // Fallback: compare root domains
    const parts = host.split(".");
    if (parts.length >= 2) {
      const rootDomain = parts.slice(-2).join(".");
      return candidateHost.endsWith(rootDomain);
    }
    return true;
  } catch {
    return false;
  }
}

export function getApiBaseUrl(): string {
  const envUrl = process.env.NEXT_PUBLIC_API_URL;
  if (envUrl && typeof envUrl === "string" && envUrl.trim().length > 0) {
    const trimmed = envUrl.trim().replace(/\/+$/, "");
    if (typeof window !== "undefined" && window.location?.hostname) {
      if (matchesDomainFamily(trimmed, window.location.hostname)) {
        return trimmed;
      }
    } else {
      return trimmed;
    }
  }

  if (typeof window !== "undefined" && window.location) {
    const { hostname } = window.location;
    if (hostname === "localhost" || hostname === "127.0.0.1") {
      return "http://localhost:4000";
    }
    if (/^(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)/.test(hostname)) {
      return `http://${hostname}:4000`;
    }
    // Staging testfox.in
    if (hostname.endsWith("testfox.in")) {
      return "https://whatboutme.testfox.in";
    }
    if (hostname.endsWith(".vercel.app")) {
      return "https://what-bout-me-com.vercel.app";
    }
    const parts = hostname.split(".");
    const rootDomain = parts.length >= 2 ? parts.slice(-2).join(".") : hostname;
    return `https://api.${rootDomain}`;
  }

  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }

  return "http://localhost:4000";
}

export function getAdminUrl(): string {
  const envUrl = process.env.NEXT_PUBLIC_ADMIN_URL;
  if (envUrl && typeof envUrl === "string" && envUrl.trim().length > 0) {
    const trimmed = envUrl.trim().replace(/\/+$/, "");
    if (typeof window !== "undefined" && window.location?.hostname) {
      if (matchesDomainFamily(trimmed, window.location.hostname)) {
        return trimmed;
      }
    } else {
      return trimmed;
    }
  }

  if (typeof window !== "undefined" && window.location) {
    const { hostname } = window.location;
    if (hostname === "localhost" || hostname === "127.0.0.1") return "http://localhost:3002";
    if (/^(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)/.test(hostname)) {
      return `http://${hostname}:3002`;
    }
    // Staging testfox.in
    if (hostname.endsWith("testfox.in")) {
      return "https://admin.testfox.in";
    }
    if (hostname.endsWith(".vercel.app")) return "https://what-bout-me-com-admin.vercel.app";
    const parts = hostname.split(".");
    const rootDomain = parts.length >= 2 ? parts.slice(-2).join(".") : hostname;
    return `https://admin.${rootDomain}`;
  }
  return "http://localhost:3002";
}

export function getLmsUrl(candidateOrigin?: string | null): string {
  // 1. Explicit candidate origin passed as parameter
  const candidateSanitized = sanitizeLmsOrigin(candidateOrigin);
  if (candidateSanitized) {
    return candidateSanitized;
  }

  // 2. Client-side URL search param (?lms_origin=...) or storage fallback
  if (typeof window !== "undefined") {
    if (window.location?.search) {
      const fromParam = extractLmsOriginParam(window.location.search);
      if (fromParam) {
        saveLmsOrigin(fromParam);
        return fromParam;
      }
    }
    const fromStorage = getStoredLmsOrigin();
    if (fromStorage) {
      const host = window.location.hostname;
      if (matchesDomainFamily(fromStorage, host)) {
        return fromStorage;
      }
    }
  }

  // 3. Environment variable NEXT_PUBLIC_LMS_URL validated against current domain family
  const envUrl = process.env.NEXT_PUBLIC_LMS_URL;
  if (envUrl && typeof envUrl === "string" && envUrl.trim().length > 0) {
    const trimmed = envUrl.trim().replace(/\/+$/, "");
    if (typeof window !== "undefined" && window.location?.hostname) {
      if (matchesDomainFamily(trimmed, window.location.hostname)) {
        return trimmed;
      }
    } else {
      return trimmed;
    }
  }

  // 4. Client-side runtime domain detection
  if (typeof window !== "undefined" && window.location) {
    const { hostname } = window.location;
    if (hostname === "localhost" || hostname === "127.0.0.1") return "http://localhost:3003";
    if (/^(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)/.test(hostname)) {
      return `http://${hostname}:3003`;
    }
    // Staging testfox.in
    if (hostname.endsWith("testfox.in")) {
      return "https://lms.testfox.in";
    }
    // Vercel deployment preview domains
    if (hostname.endsWith(".vercel.app")) {
      return "https://what-bout-me-com-lms.vercel.app";
    }
    const parts = hostname.split(".");
    const rootDomain = parts.length >= 2 ? parts.slice(-2).join(".") : hostname;
    return `https://learn.${rootDomain}`;
  }
  return "http://localhost:3003";
}

export function onThisHost(url: string) {
  if (typeof window === "undefined") return url;
  const host = window.location.hostname;
  if (host === "localhost" || host === "127.0.0.1") return url;
  if (/^(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)/.test(host)) {
    return url.replace(/^(https?:\/\/)(localhost|127\.0\.0\.1)(?=[:/]|$)/, `$1${host}`);
  }
  return getApiBaseUrl();
}

export const API_BASE_URL = getApiBaseUrl();
export const ADMIN_URL = getAdminUrl();
export const LMS_URL = getLmsUrl();

export interface Program {
  id: string;
  title: string;
  slug: string;
  description?: string;
  price: number;
  isActive: boolean;
  hasCertificate: boolean;
  certificateTemplate?: string | null;
  faqs?: any;
  createdAt: string;
  updatedAt: string;
}

export interface BackendHealth {
  status: string;
  service: string;
  version: string;
  timestamp: string;
  endpoints: Record<string, unknown>;
}

export async function checkBackendHealth(): Promise<BackendHealth | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/`, {
      cache: "no-store",
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (error) {
    console.warn("Backend health check failed:", error);
    return null;
  }
}

export async function getPrograms(): Promise<Program[]> {
  try {
    const res = await fetch(`${API_BASE_URL}/programs`, {
      cache: "no-store",
    });
    if (!res.ok) {
      throw new Error(`Failed to fetch programs: ${res.statusText}`);
    }
    return await res.json();
  } catch (error) {
    console.error("Error fetching programs from backend:", error);
    return [];
  }
}

export async function getPublicPrograms(): Promise<Program[]> {
  try {
    const res = await fetch(`${API_BASE_URL}/programs/public`, {
      cache: "no-store",
    });
    if (!res.ok) {
      return getPrograms();
    }
    return await res.json();
  } catch {
    return getPrograms();
  }
}

export async function getBatches(programId?: string) {
  try {
    const url = programId
      ? `${API_BASE_URL}/batches?programId=${encodeURIComponent(programId)}`
      : `${API_BASE_URL}/batches`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return [];
    return await res.json();
  } catch (error) {
    console.error("Error fetching batches:", error);
    return [];
  }
}

/** The API wraps errors as { error: { code, message } }. */
async function authRequest(path: string, body: Record<string, unknown>, fallback: string) {
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error("Could not reach the server. Please try again in a moment.");
  }
  if (!res.ok) {
    if (res.status === 429) {
      throw new Error("Too many attempts. Please wait a minute and try again.");
    }
    const data = await res.json().catch(() => null);
    const raw = data?.error?.message ?? data?.message;
    throw new Error((Array.isArray(raw) ? raw.join(", ") : raw) || fallback);
  }
  return await res.json();
}

/** Sign in with the account email or its mobile number. */
export async function loginUser(identifier: string, password: string) {
  const id = identifier.trim();
  return authRequest(
    "/auth/login",
    id.includes("@") ? { email: id, password } : { phone: id, password },
    "Could not sign in.",
  );
}

export async function sendSignupOtp(details: {
  email: string;
  name?: string;
  phone?: string;
}) {
  return authRequest(
    "/auth/signup/send-otp",
    {
      email: details.email.trim().toLowerCase(),
      name: details.name?.trim(),
      phone: details.phone?.trim(),
    },
    "Could not send verification code.",
  );
}

export async function signupUser(details: {
  name: string;
  email: string;
  phone?: string;
  password: string;
  country?: string;
  timezone?: string;
  otp?: string;
}) {
  return authRequest("/auth/signup", details, "Could not create the account.");
}

export async function verifyEmailUser(token: string) {
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}/auth/verify-email?token=${encodeURIComponent(token.trim())}`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });
  } catch {
    throw new Error("Could not reach the server. Please try again in a moment.");
  }
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    const raw = data?.error?.message ?? data?.message;
    throw new Error((Array.isArray(raw) ? raw.join(", ") : raw) || "Invalid or expired verification token.");
  }
  return await res.json();
}

export async function requestPasswordResetUser(email: string) {
  return authRequest(
    "/auth/password-reset/request",
    { email: email.trim().toLowerCase() },
    "Could not request password reset.",
  );
}

export async function confirmPasswordResetUser(token: string, newPassword: string) {
  return authRequest(
    "/auth/password-reset/confirm",
    { token: token.trim(), newPassword },
    "Could not reset password.",
  );
}

export type CurrencyCode = "USD" | "AED" | "INR";
export type EventLocationType = "ONLINE" | "PHYSICAL";
export type EventPaymentStatus = "PENDING" | "PAID" | "FAILED" | "REFUNDED";

export interface EventItem {
  id: string;
  title: string;
  slug: string;
  description: string;
  bannerUrl?: string | null;
  startDateTime: string;
  endDateTime?: string | null;
  timezone: string;
  locationType: EventLocationType;
  meetingLink?: string | null;
  onlineMeetingLink?: string | null;
  venueName?: string | null;
  venueAddress?: string | null;
  physicalAddress?: string | null;
  price: number;
  amount?: number;
  currency: CurrencyCode;
  seatLimit?: number | null;
  capacity?: number | null;
  seatsBooked: number;
  seatsRemaining?: number | null;
  isSoldOut?: boolean;
  isPublished: boolean;
  createdAt: string;
  updatedAt?: string;

  // Backward compatibility aliases
  type?: "EVENT" | "WEBINAR";
  status?: "SCHEDULED" | "REGISTRATION_OPEN" | "ONGOING" | "ENDED" | "CANCELLED";
  startDateTimeUtc?: string;
  endDateTimeUtc?: string | null;
  startAt?: string;
  endAt?: string;
  location?: string | null;
  coverImageUrl?: string | null;
  maxRegistrations?: number | null;
  registrationCount?: number;
  registeredByMe?: boolean;
}

export interface RegisterEventPayload {
  fullName: string;
  email: string;
  phone: string;
  category?: string;
  categoryOther?: string;
  organization?: string;
  designation?: string;
  notes?: string;
}

export interface EventRegistrationItem {
  id: string;
  eventId: string;
  userId?: string | null;
  attendeeName: string;
  attendeeEmail: string;
  attendeePhone: string;
  amount: number;
  currency: CurrencyCode;
  paymentGateway?: string;
  gatewayOrderId?: string | null;
  gatewayPaymentId?: string | null;
  paymentStatus: EventPaymentStatus;
  emailSent?: boolean;
  registeredAt?: string;
  createdAt?: string;
  meetingLink?: string | null;
}

export interface CheckoutEventResponse {
  registrationId: string;
  orderId?: string;
  amount?: number;
  currency?: CurrencyCode;
  keyId?: string;
  status?: string;
  isFree?: boolean;
  isSimulated?: boolean;
  simulation?: boolean;
  alreadyRegistered?: boolean;
  message?: string;
  meetingLink?: string | null;
  venueName?: string | null;
  venueAddress?: string | null;
  registration?: EventRegistrationItem;
  event?: EventItem;
}

export interface VerifyEventPaymentResponse {
  success: boolean;
  message?: string;
  alreadyConfirmed?: boolean;
  registrationId?: string;
  status?: string;
  meetingLink?: string | null;
  venueName?: string | null;
  venueAddress?: string | null;
  registration: EventRegistrationItem;
  event: EventItem;
}

export async function getPublicEvents(params?: {
  type?: string;
  locationType?: string;
  upcoming?: boolean;
  search?: string;
}): Promise<EventItem[]> {
  try {
    const searchParams = new URLSearchParams();
    if (params?.type && params.type !== "ALL") searchParams.set("type", params.type);
    if (params?.locationType && params.locationType !== "ALL")
      searchParams.set("locationType", params.locationType);
    if (params?.upcoming !== undefined) searchParams.set("upcoming", String(params.upcoming));
    if (params?.search) searchParams.set("search", params.search);
    const url = `${API_BASE_URL}/events${searchParams.toString() ? `?${searchParams.toString()}` : ""}`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return [];
    const data = await res.json();
    if (Array.isArray(data)) return data;
    if (Array.isArray(data?.items)) return data.items;
    return [];
  } catch (error) {
    console.error("Error fetching public events:", error);
    return [];
  }
}

export async function getPublicEventBySlug(slug: string): Promise<EventItem | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/events/${encodeURIComponent(slug)}`, {
      cache: "no-store",
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (error) {
    console.error("Error fetching event by slug:", error);
    return null;
  }
}

export async function checkoutEvent(
  eventIdOrSlug: string,
  payload: { attendeeName: string; attendeeEmail: string; attendeePhone: string }
): Promise<CheckoutEventResponse> {
  const token = typeof window !== "undefined" ? localStorage.getItem("wbm_token") || undefined : undefined;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}/events/${encodeURIComponent(eventIdOrSlug)}/checkout`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });
  } catch {
    throw new Error("Could not reach the server. Please check your network connection.");
  }

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = data?.error?.message ?? data?.message ?? "Checkout failed. Please try again.";
    throw new Error(Array.isArray(msg) ? msg.join(", ") : msg);
  }
  return data;
}

export async function verifyEventPayment(payload: {
  registrationId: string;
  gatewayOrderId: string;
  gatewayPaymentId?: string;
  gatewaySignature?: string;
  isSimulated?: boolean;
}): Promise<VerifyEventPaymentResponse> {
  const token = typeof window !== "undefined" ? localStorage.getItem("wbm_token") || undefined : undefined;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}/events/verify-payment`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        ...payload,
        simulation: payload.isSimulated ?? true,
      }),
    });
  } catch {
    throw new Error("Could not reach the server. Please check your network connection.");
  }

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = data?.error?.message ?? data?.message ?? "Payment verification failed.";
    throw new Error(Array.isArray(msg) ? msg.join(", ") : msg);
  }
  return data;
}

export async function registerForEvent(eventId: string, payload: RegisterEventPayload, token?: string) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}/events/${eventId}/register`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });
  } catch {
    throw new Error("Could not reach the server. Please check your network connection.");
  }

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = data?.error?.message ?? data?.message ?? "Registration failed. Please try again.";
    throw new Error(Array.isArray(msg) ? msg.join(", ") : msg);
  }
  return data;
}

// -----------------------------------------------------------------------------
// PUBLIC GALLERY INTERFACES & HELPERS
// -----------------------------------------------------------------------------

export interface PublicGalleryItem {
  id: string;
  title: string;
  description?: string | null;
  imageUrl: string;
  altText?: string | null;
  category?: string | null;
  displayOrder: number;
  sortOrder?: number;
  isPublished: boolean;
  createdAt: string;
  updatedAt: string;
}

export async function getPublicGallery(category?: string): Promise<{ items: PublicGalleryItem[]; total: number }> {
  const query = new URLSearchParams();
  if (category && category !== "ALL") query.set("category", category);
  const qs = query.toString();
  const endpoint = qs ? `${API_BASE_URL}/gallery?${qs}` : `${API_BASE_URL}/gallery`;

  try {
    const res = await fetch(endpoint, {
      next: { revalidate: 30 },
    });
    if (!res.ok) {
      return { items: [], total: 0 };
    }
    const data = await res.json();
    if (Array.isArray(data)) {
      return { items: data, total: data.length };
    }
    return { items: data.items || [], total: data.total ?? (data.items?.length || 0) };
  } catch (error) {
    console.warn("Failed to fetch public gallery:", error);
    return { items: [], total: 0 };
  }
}

// -----------------------------------------------------------------------------
// WEB PUSH HELPERS (TASK 13)
// -----------------------------------------------------------------------------

export function urlBase64ToUint8Array(base64String: string): BufferSource {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const buffer = new ArrayBuffer(rawData.length);
  const outputArray = new Uint8Array(buffer);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export async function fetchVapidPublicKey(): Promise<string> {
  try {
    const res = await fetch(`${API_BASE_URL}/notifications/vapid-public-key`);
    if (!res.ok) return '';
    const data = await res.json();
    return data.publicKey || '';
  } catch {
    return '';
  }
}

export async function registerPushSubscription(sub: PushSubscription): Promise<boolean> {
  const subJson = sub.toJSON();
  if (!subJson.endpoint || !subJson.keys?.p256dh || !subJson.keys?.auth) return false;

  try {
    const res = await fetch(`${API_BASE_URL}/notifications/push-subscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        endpoint: subJson.endpoint,
        keys: {
          p256dh: subJson.keys.p256dh,
          auth: subJson.keys.auth,
        },
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}



