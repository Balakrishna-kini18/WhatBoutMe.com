/**
 * WhatBoutMe Backend API Client
 * Provides typed methods for interacting with the NestJS backend API.
 */

/**
 * The apps are configured with localhost addresses for development. On a
 * phone opening them over Wi-Fi, "localhost" is the phone itself, so in the
 * browser a localhost address is pointed at whichever host served the page.
 * A real (deployed) address is returned unchanged.
 */
export function onThisHost(url: string) {
  if (typeof window === "undefined") return url;
  const host = window.location.hostname;
  if (host === "localhost" || host === "127.0.0.1") return url;
  return url.replace(/^(https?:\/\/)(localhost|127\.0\.0\.1)(?=[:/]|$)/, `$1${host}`);
}

export const API_BASE_URL = onThisHost(
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000",
);

export const ADMIN_URL = onThisHost(
  process.env.NEXT_PUBLIC_ADMIN_URL || "http://localhost:3002",
);

export const LMS_URL = onThisHost(
  process.env.NEXT_PUBLIC_LMS_URL || "http://localhost:3003",
);

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
  venueName?: string | null;
  venueAddress?: string | null;
  price: number;
  currency: CurrencyCode;
  seatLimit?: number | null;
  seatsBooked: number;
  seatsRemaining?: number | null;
  isSoldOut?: boolean;
  isPublished: boolean;
  createdAt: string;
  updatedAt?: string;

  // Backward compatibility aliases
  type?: "EVENT" | "WEBINAR";
  status?: "SCHEDULED" | "REGISTRATION_OPEN" | "ONGOING" | "ENDED" | "CANCELLED";
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


