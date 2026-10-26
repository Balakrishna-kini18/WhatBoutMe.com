"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { onThisHost } from "./lib/host";
import { renewOnce, clearApiCache } from "./lib/api";

// resolved for the device showing the page (see lib/host.ts)
const API_URL = onThisHost(process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000');

// Monkey-patch window.fetch synchronously outside React so it catches the very first render's fetches
if (typeof window !== 'undefined' && !(window as any).__fetchPatched) {
  (window as any).__fetchPatched = true;
  (window as any).__apiFetchPatched = true;
  const originalFetch = window.fetch.bind(window);
  (window as any).__rawOriginalFetch = originalFetch;

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
    let response!: Response;
    try {
      response = await originalFetch(input, newInit);
    } catch (fetchErr: any) {
      // If the API server is momentarily restarting or recompiling in watch mode,
      // attempt progressive retries before bubbling the error
      if (typeof input === 'string' && (input.includes(':4000') || input.includes(API_URL))) {
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
        // The API wraps errors as { error: { code, message, reason } }. An expired
        // access token arrives as a plain UNAUTHORIZED, so that is renewed too.
        const code = typeof errorData.error === 'string' ? errorData.error : errorData.error?.code;
        const reason = errorData.reason || errorData.error?.reason;
        if (code === 'SESSION_REVOKED') {
          localStorage.removeItem('token');
          localStorage.removeItem('refresh_token');
          localStorage.removeItem('user');
          clearApiCache();
          window.dispatchEvent(new CustomEvent('wbm-session-revoked', { detail: { reason: reason || 'SESSION_REVOKED' } }));
          return response;
        } else if (code === 'TOKEN_EXPIRED' || code === 'UNAUTHORIZED') {
          // Several requests can expire together; they all wait on one renewal.
          const renewed = await renewOnce(originalFetch, token as string);
          if (renewed === 'signed-out') {
            localStorage.clear();
            clearApiCache();
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
            clearApiCache();
            window.location.href = '/login';
          }
        }
      } catch(e) {
        // Not JSON
        if (localStorage.getItem('token')) {
          localStorage.clear();
          clearApiCache();
          window.location.href = '/login';
        }
      }
    }
    return response;
  };
}

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [revokedReason, setRevokedReason] = React.useState<string | null>(null);

  React.useEffect(() => {
    const onRevoked = (e: any) => {
      setRevokedReason(e.detail?.reason || 'SESSION_REVOKED');
    };
    window.addEventListener('wbm-session-revoked', onRevoked);
    return () => window.removeEventListener('wbm-session-revoked', onRevoked);
  }, []);

  const isDeviceLimit = revokedReason === 'DEVICE_LIMIT_EXCEEDED';
  const isTokenReused = revokedReason === 'TOKEN_REUSED';
  const isExpired = revokedReason === 'EXPIRED';

  const modalTitle = isDeviceLimit
    ? "Signed In on Another Device"
    : isTokenReused
    ? "Security Revocation"
    : isExpired
    ? "Session Expired"
    : "Session Ended";

  const modalDescription = isDeviceLimit ? (
    <>
      Your account was signed in from another browser or device. To protect your course materials and account security, WhatBoutMe permits only <strong>1 active device</strong> at a time.
    </>
  ) : isTokenReused ? (
    <>
      Your session was ended because an old security token was reused. Please sign in again to verify your identity.
    </>
  ) : isExpired ? (
    <>
      Your session has expired due to inactivity. Please sign in again to continue your coursework.
    </>
  ) : (
    <>
      Your session has ended or been revoked. Please sign in again to access your account.
    </>
  );

  const buttonText = isDeviceLimit
    ? "Sign In on This Device"
    : isExpired
    ? "Sign In Again"
    : "Return to Login";

  return (
    <>
      {children}
      {revokedReason && (
        <div
          role="alertdialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 999999,
            backgroundColor: 'rgba(15, 23, 42, 0.75)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1.25rem',
            animation: 'fadeIn 0.2s ease-out',
          }}
        >
          <div
            style={{
              maxWidth: '440px',
              width: '100%',
              backgroundColor: '#ffffff',
              borderRadius: '24px',
              padding: '2.25rem 2rem 2rem',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)',
              textAlign: 'center',
              border: '1px solid rgba(226, 232, 240, 0.9)',
              fontFamily: 'inherit',
            }}
          >
            <div
              style={{
                width: '60px',
                height: '60px',
                borderRadius: '50%',
                backgroundColor: '#FEF3C7',
                color: '#D97706',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 1.25rem',
              }}
            >
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
                <line x1="8" y1="21" x2="16" y2="21"/>
                <line x1="12" y1="17" x2="12" y2="21"/>
              </svg>
            </div>
            <h2 style={{ fontSize: '1.35rem', fontWeight: 800, margin: '0 0 0.5rem', color: '#0F172A', letterSpacing: '-0.02em' }}>
              {modalTitle}
            </h2>
            <p style={{ fontSize: '0.9rem', color: '#475569', lineHeight: 1.55, margin: '0 0 1.75rem' }}>
              {modalDescription}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <button
                type="button"
                onClick={() => {
                  localStorage.clear();
                  clearApiCache();
                  window.location.href = `/login?reason=${encodeURIComponent(revokedReason || 'SESSION_REVOKED')}`;
                }}
                style={{
                  width: '100%',
                  padding: '0.85rem 1.25rem',
                  borderRadius: '12px',
                  backgroundColor: '#0F172A',
                  color: '#ffffff',
                  fontWeight: 700,
                  fontSize: '0.925rem',
                  border: 'none',
                  cursor: 'pointer',
                  transition: 'background-color 0.15s ease',
                }}
              >
                {buttonText}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
