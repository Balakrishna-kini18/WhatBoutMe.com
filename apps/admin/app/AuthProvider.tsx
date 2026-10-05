"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { onThisHost } from "./lib/host";

// resolved for the device showing the page (see lib/host.ts)
const API_URL = onThisHost(process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000');

// One renewal at a time, shared by every request that hit an expired token.
// Returns the new access token, 'signed-out' when the session really ended,
// or null when the server could not answer (the learner stays signed in).
let renewing: Promise<string | 'signed-out' | null> | null = null;
function renewOnce(rawFetch: typeof fetch, failedToken: string) {
  // another request already renewed while this one was in flight
  const current = localStorage.getItem('token');
  if (current && current !== failedToken) return Promise.resolve(current);
  if (!renewing) {
    renewing = (async () => {
      const refreshToken = localStorage.getItem('refresh_token');
      if (!refreshToken) return 'signed-out' as const;
      try {
        const res = await rawFetch(`${API_URL}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: refreshToken }),
        });
        if (res.ok) {
          const data = await res.json();
          localStorage.setItem('token', data.access_token);
          if (data.refresh_token) localStorage.setItem('refresh_token', data.refresh_token);
          return data.access_token as string;
        }
        return res.status === 401 ? ('signed-out' as const) : null;
      } catch {
        return null;
      }
    })().finally(() => { renewing = null; });
  }
  return renewing;
}

// Monkey-patch window.fetch synchronously outside React so it catches the very first render's fetches
if (typeof window !== 'undefined' && !(window as any).__fetchPatched) {
  (window as any).__fetchPatched = true;
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    // a phone on Wi-Fi cannot reach "localhost": see lib/host.ts
    if (typeof input === 'string') input = onThisHost(input);
    const token = localStorage.getItem('token');
    let newInit = init;
    if (token && typeof input === 'string' && input.includes(API_URL)) {
      const headers = new Headers(init?.headers);
      if (!headers.has('Authorization')) {
        headers.set('Authorization', `Bearer ${token}`);
        newInit = { ...init, headers };
      }
    }

    let response = await originalFetch(input, newInit);
    
    // Only for requests made with a sign-in token. A wrong password on the
    // login form is also a 401 and must reach the form untouched.
    const isSignedInRequest =
      Boolean(token) &&
      typeof input === 'string' &&
      !/\/auth\/(login|signup|admin-login|refresh)/.test(input);

    if (response.status === 401 && isSignedInRequest) {
      const clone = response.clone();
      try {
        const errorData = await clone.json();
        // The API wraps errors as { error: { code, message } }. An expired
        // access token arrives as a plain UNAUTHORIZED, so that is renewed too.
        const code = typeof errorData.error === 'string' ? errorData.error : errorData.error?.code;
        if (code === 'SESSION_REVOKED') {
          localStorage.clear();
          alert("You were signed out because your account was used on another device.");
          window.location.href = '/login';
          return response;
        } else if (code === 'TOKEN_EXPIRED' || code === 'UNAUTHORIZED') {
          // Several requests can expire together; they all wait on one renewal.
          const renewed = await renewOnce(originalFetch, token as string);
          if (renewed === 'signed-out') {
            localStorage.clear();
            window.location.href = '/login';
          } else if (renewed) {
            const newHeaders = new Headers(init?.headers);
            newHeaders.set('Authorization', `Bearer ${renewed}`);
            response = await originalFetch(input, { ...init, headers: newHeaders });
          }
          // otherwise the server could not be reached: stay signed in and let
          // the page show its own error
        } else {
          // Generic 401 (e.g. invalid token after DB reset)
          if (localStorage.getItem('token')) {
            localStorage.clear();
            window.location.href = '/login';
          }
        }
      } catch(e) {
        // Not JSON
        if (localStorage.getItem('token')) {
          localStorage.clear();
          window.location.href = '/login';
        }
      }
    }
    return response;
  };
}

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  useEffect(() => {
    // Poll /auth/session every 60s
    const pollInterval = setInterval(async () => {
      const token = localStorage.getItem('token');
      if (token) {
        try {
          const res = await window.fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/auth/session`);
          if (res.status === 401) {
             const data = await res.json();
             if ((data.error?.code ?? data.error) === 'SESSION_REVOKED') {
               localStorage.clear();
               alert("You were signed out because your account was used on another device.");
               router.push('/login');
             }
          }
        } catch(e) {}
      }
    }, 60000);

    return () => {
      clearInterval(pollInterval);
    };
  }, [router]);

  return <>{children}</>;
}
