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

export async function signupUser(details: {
  name: string;
  email: string;
  phone?: string;
  password: string;
}) {
  return authRequest("/auth/signup", details, "Could not create the account.");
}
