"use client";

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import { onThisHost } from "./lib/host";
import { cachedFetch, autoInvalidateOnMutation, clearApiCache } from "./lib/api";

// Resolved host for the device showing the page
const API_URL = onThisHost(process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000");

export interface UserData {
  id: string;
  email: string;
  name: string;
  role: string;
  permissions?: string[];
  avatar?: string | null;
}

export interface AuthContextType {
  user: UserData | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  revalidateUser: (force?: boolean) => Promise<UserData | null>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Synchronously read stored auth on initial client render so the shell never blocks or flashes
function getInitialUser(): UserData | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem("user");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function getInitialToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem("token");
  } catch {
    return null;
  }
}

// One renewal at a time, shared by every request that hit an expired token
let renewing: Promise<string | "signed-out" | null> | null = null;
function renewOnce(rawFetch: typeof fetch, failedToken: string) {
  const current = localStorage.getItem("token");
  if (current && current !== failedToken) return Promise.resolve(current);
  if (!renewing) {
    renewing = (async () => {
      const refreshToken = localStorage.getItem("refresh_token");
      if (!refreshToken) return "signed-out" as const;
      try {
        const res = await rawFetch(`${API_URL}/auth/refresh`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refresh_token: refreshToken }),
        });
        if (res.ok) {
          const data = await res.json();
          localStorage.setItem("token", data.access_token);
          if (data.refresh_token) localStorage.setItem("refresh_token", data.refresh_token);
          return data.access_token as string;
        }
        return res.status === 401 ? ("signed-out" as const) : null;
      } catch {
        return null;
      }
    })().finally(() => {
      renewing = null;
    });
  }
  return renewing;
}

// Monkey-patch window.fetch synchronously outside React so it catches the very first render's fetches
if (typeof window !== "undefined" && !(window as any).__fetchPatched) {
  (window as any).__fetchPatched = true;
  const originalFetch = window.fetch.bind(window);
  (window as any).__rawOriginalFetch = originalFetch;

  window.fetch = async (input, init) => {
    if (typeof input === "string") input = onThisHost(input);
    const token = localStorage.getItem("token");
    let newInit = init;

    if (token && typeof input === "string" && input.includes(API_URL)) {
      const headers = new Headers(init?.headers);
      if (!headers.has("Authorization")) {
        headers.set("Authorization", `Bearer ${token}`);
        newInit = { ...init, headers };
      }
    }

    const method = (newInit?.method || "GET").toUpperCase();
    if (method !== "GET" && typeof input === "string") {
      autoInvalidateOnMutation(input);
    }

    let response!: Response;
    try {
      response = await cachedFetch(input, newInit);
    } catch (fetchErr: any) {
      // If the API server is momentarily restarting or recompiling in watch mode,
      // attempt progressive retries with raw fetch
      if (typeof input === "string" && (input.includes(":4000") || input.includes(API_URL))) {
        let lastError = fetchErr;
        let succeeded = false;
        for (const delay of [400, 800, 1500]) {
          await new Promise((r) => setTimeout(r, delay));
          try {
            response = await originalFetch(input, newInit);
            succeeded = true;
            break;
          } catch (retryErr: any) {
            lastError = retryErr;
          }
        }
        if (!succeeded) {
          throw lastError;
        }
      } else {
        throw fetchErr;
      }
    }

    // Only for requests made with a sign-in token. A wrong password on login form is untouched.
    const isSignedInRequest =
      Boolean(token) &&
      typeof input === "string" &&
      !/\/auth\/(login|signup|admin-login|refresh|2fa)/.test(input);

    if (response.status === 401 && isSignedInRequest) {
      const clone = response.clone();
      try {
        const errorData = await clone.json();
        const code = typeof errorData.error === "string" ? errorData.error : errorData.error?.code;

        if (code === "SESSION_REVOKED") {
          localStorage.clear();
          clearApiCache();
          alert("You were signed out because your account was used on another device.");
          window.location.href = "/login";
          return response;
        } else if (code === "TOKEN_EXPIRED" || code === "UNAUTHORIZED") {
          const renewed = await renewOnce(originalFetch, token as string);
          if (renewed === "signed-out") {
            localStorage.clear();
            clearApiCache();
            window.location.href = "/login";
          } else if (renewed) {
            const newHeaders = new Headers(init?.headers);
            newHeaders.set("Authorization", `Bearer ${renewed}`);
            response = await originalFetch(input, { ...init, headers: newHeaders });
          }
        } else {
          if (localStorage.getItem("token")) {
            localStorage.clear();
            clearApiCache();
            window.location.href = "/login";
          }
        }
      } catch {
        if (localStorage.getItem("token")) {
          localStorage.clear();
          clearApiCache();
          window.location.href = "/login";
        }
      }
    }
    return response;
  };
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    // Graceful fallback for components mounted outside provider
    const user = getInitialUser();
    const token = getInitialToken();
    return {
      user,
      token,
      isLoading: false,
      isAuthenticated: Boolean(token && user),
      revalidateUser: async () => user,
      logout: async () => {
        if (typeof window !== "undefined") {
          localStorage.clear();
          clearApiCache();
          window.location.href = "/login";
        }
      },
    };
  }
  return context;
}

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  // Non-blocking synchronous hydration: populated immediately from memory/storage on frame 1
  const [user, setUser] = useState<UserData | null>(getInitialUser);
  const [token, setToken] = useState<string | null>(getInitialToken);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  // In-memory SWR verification tracker: prevents redundant /auth/me network calls on navigation
  const lastVerifiedAtRef = useRef<number>(user ? Date.now() : 0);
  const isVerifyingRef = useRef<boolean>(false);

  const revalidateUser = useCallback(
    async (force: boolean = false): Promise<UserData | null> => {
      if (typeof window === "undefined") return null;

      const currentToken = localStorage.getItem("token");
      if (!currentToken) {
        setUser(null);
        setToken(null);
        return null;
      }

      const now = Date.now();
      // Stale-While-Revalidate window: 60 seconds
      const isFresh = !force && now - lastVerifiedAtRef.current < 60_000;
      if (isFresh && user) {
        return user;
      }

      if (isVerifyingRef.current) return user;
      isVerifyingRef.current = true;

      try {
        const rawFetch = (window as any).__rawOriginalFetch || fetch;
        const res = await rawFetch(`${API_URL}/auth/me`, {
          headers: { Authorization: `Bearer ${currentToken}` },
        });

        if (res.ok) {
          const verifiedUser: UserData = await res.json();
          lastVerifiedAtRef.current = Date.now();
          setUser(verifiedUser);
          setToken(currentToken);
          localStorage.setItem("user", JSON.stringify(verifiedUser));
          return verifiedUser;
        } else if (res.status === 401) {
          localStorage.removeItem("token");
          localStorage.removeItem("refresh_token");
          localStorage.removeItem("user");
          clearApiCache();
          setUser(null);
          setToken(null);
          if (pathname !== "/login") {
            router.push("/login");
          }
          return null;
        }
      } catch (err) {
        // Offline or transient server restart: preserve cached user session
        console.warn("[AuthProvider] Non-blocking auth revalidation using cached session:", err);
      } finally {
        isVerifyingRef.current = false;
      }

      return user;
    },
    [pathname, router, user]
  );

  const logout = useCallback(async () => {
    try {
      const currentToken = localStorage.getItem("token");
      if (currentToken) {
        const rawFetch = (window as any).__rawOriginalFetch || fetch;
        rawFetch(`${API_URL}/auth/logout`, {
          method: "POST",
          headers: { Authorization: `Bearer ${currentToken}` },
        }).catch(() => {});
      }
    } finally {
      localStorage.removeItem("token");
      localStorage.removeItem("refresh_token");
      localStorage.removeItem("user");
      clearApiCache();
      setUser(null);
      setToken(null);
      lastVerifiedAtRef.current = 0;
      router.push("/login");
    }
  }, [router]);

  // Non-blocking navigation check: verify session validity without blocking shell render
  useEffect(() => {
    if (pathname === "/login") return;

    const currentToken = localStorage.getItem("token");
    if (!currentToken) {
      router.push("/login");
      return;
    }

    // Background SWR revalidation (only runs if last check > 60s ago)
    revalidateUser(false);
  }, [pathname, revalidateUser, router]);

  const contextValue: AuthContextType = {
    user,
    token,
    isLoading,
    isAuthenticated: Boolean(token && user),
    revalidateUser,
    logout,
  };

  return <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>;
}
