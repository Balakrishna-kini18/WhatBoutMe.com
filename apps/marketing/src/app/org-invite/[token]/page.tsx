"use client";

import { use, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  ArrowRight,
  ShieldCheck,
  Ticket,
  Building2,
} from "lucide-react";
import Nav from "@/components/site/Nav";
import Footer from "@/components/site/Footer";
import SmoothScroll from "@/components/site/SmoothScroll";
import { API_BASE_URL, LMS_URL } from "@/lib/api";

interface PageProps {
  params: Promise<{ token: string }>;
}

export default function OrgInviteTokenPage({ params }: PageProps) {
  const { token: inviteToken } = use(params);

  const [activeJwt, setActiveJwt] = useState<string | null>(null);

  // Auth / Registration state
  const [isNewUser, setIsNewUser] = useState(true);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [claimResult, setClaimResult] = useState<any>(null);

  // Check if user is already signed in
  useEffect(() => {
    if (typeof window !== "undefined") {
      const storedToken = localStorage.getItem("token") || localStorage.getItem("accessToken");
      if (storedToken) setActiveJwt(storedToken);
    }
  }, []);

  const handleClaim = async (e: FormEvent) => {
    e.preventDefault();
    try {
      setIsLoading(true);
      setError(null);

      let tokenToUse = activeJwt;

      if (!tokenToUse) {
        if (isNewUser) {
          const registerRes = await fetch(`${API_BASE_URL}/auth/signup`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: fullName.trim() || email.split("@")[0], email: email.trim().toLowerCase(), password }),
          });

          if (!registerRes.ok) {
            const errData = await registerRes.json().catch(() => ({}));
            throw new Error(errData.message || "Failed to create account. Please sign in if you already have an account.");
          }

          const regData = await registerRes.json();
          tokenToUse = regData.accessToken || regData.token;
          if (tokenToUse) {
            localStorage.setItem("token", tokenToUse);
            setActiveJwt(tokenToUse);
          }
        } else {
          const loginRes = await fetch(`${API_BASE_URL}/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password }),
          });

          if (!loginRes.ok) {
            const errData = await loginRes.json().catch(() => ({}));
            throw new Error(errData.message || "Invalid email or password.");
          }

          const loginData = await loginRes.json();
          tokenToUse = loginData.accessToken || loginData.token;
          if (tokenToUse) {
            localStorage.setItem("token", tokenToUse);
            setActiveJwt(tokenToUse);
          }
        }
      }

      if (!tokenToUse) {
        throw new Error("Authentication required to redeem this invitation.");
      }

      // Claim the seat
      const claimRes = await fetch(`${API_BASE_URL}/org/claim`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tokenToUse}`,
        },
        body: JSON.stringify({ tokenOrCode: inviteToken }),
      });

      if (!claimRes.ok) {
        const errData = await claimRes.json().catch(() => ({}));
        throw new Error(errData.message || "Failed to redeem invitation token. It may have expired or already been claimed.");
      }

      const result = await claimRes.json();
      setClaimResult(result);
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="relative min-h-screen bg-cream text-ink">
      <SmoothScroll />
      <Nav />

      <section className="relative pt-28 pb-20 sm:pt-36 sm:pb-28">
        <div className="mx-auto max-w-[1000px] px-5 md:px-10">
          <div className="text-center max-w-2xl mx-auto mb-10">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-gold/15 px-3.5 py-1 text-xs font-bold uppercase tracking-wider text-gold-deep border border-gold/30">
              <Ticket className="h-3.5 w-3.5" />
              Direct Organization Invitation
            </span>
            <h1 className="mt-4 text-3xl font-bold tracking-tight text-ink sm:text-4xl">
              Activate Your Sponsored Seat
            </h1>
            <p className="mt-3 text-sm text-ink-soft sm:text-base leading-relaxed">
              You have been invited by your organization to participate in a WhatBoutMe cognitive development cohort.
            </p>
          </div>

          <div className="mx-auto max-w-lg rounded-3xl border border-line bg-white p-6 sm:p-10 shadow-sm">
            {claimResult ? (
              <div className="text-center py-4">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 mb-4">
                  <CheckCircle2 className="h-8 w-8" />
                </div>

                <h2 className="text-2xl font-bold text-ink">Enrollment Confirmed!</h2>
                <p className="mt-2 text-sm text-ink-soft leading-relaxed">
                  Your seat in <strong>{claimResult.enrolment?.program?.title || "WhatBoutMe Program"}</strong> has been officially activated.
                </p>

                <div className="mt-6 rounded-2xl bg-cream/70 border border-line p-5 text-left text-xs leading-relaxed space-y-2">
                  <div className="font-bold text-ink text-sm mb-2 flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-gold-deep" />
                    Mandatory Digital Agreement
                  </div>
                  <p className="text-ink-soft">
                    To begin your lessons and unlock Step 1, please complete your workshop digital consent and e-signature.
                  </p>
                </div>

                <div className="mt-8">
                  <a
                    href={`${LMS_URL}/agreement`}
                    className="inline-flex items-center justify-center gap-2 w-full rounded-full bg-gold py-3.5 text-sm font-bold text-ink transition-all hover:bg-gold-deep hover:text-white"
                  >
                    Proceed to Digital Agreement
                    <ArrowRight className="h-4 w-4" />
                  </a>
                </div>
              </div>
            ) : (
              <form onSubmit={handleClaim} className="space-y-4">
                {error && (
                  <div className="rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-xs text-rose-700">
                    ⚠ {error}
                  </div>
                )}

                {/* Token Confirmation Card */}
                <div className="rounded-2xl bg-cream/60 border border-line p-4 text-center">
                  <span className="block text-xs uppercase font-bold text-ink-soft tracking-wider">
                    Invitation Token
                  </span>
                  <div className="mt-1 font-mono font-bold text-gold-deep text-sm break-all">
                    {inviteToken}
                  </div>
                </div>

                {/* If user is not signed in */}
                {!activeJwt && (
                  <div className="pt-2 space-y-3">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-xs font-semibold text-ink">Learner Account</span>
                      <button
                        type="button"
                        onClick={() => setIsNewUser(!isNewUser)}
                        className="text-xs font-bold text-gold-deep hover:underline"
                      >
                        {isNewUser ? "Already have an account? Sign In" : "Need an account? Sign Up"}
                      </button>
                    </div>

                    {isNewUser && (
                      <div>
                        <label className="block text-xs font-medium text-ink-soft mb-1">
                          Full Name *
                        </label>
                        <input
                          type="text"
                          required
                          placeholder="Your official full name"
                          value={fullName}
                          onChange={(e) => setFullName(e.target.value)}
                          className="w-full rounded-xl border border-line bg-white px-4 py-2.5 text-sm outline-none focus:border-gold-deep"
                        />
                      </div>
                    )}

                    <div>
                      <label className="block text-xs font-medium text-ink-soft mb-1">
                        Email Address *
                      </label>
                      <input
                        type="email"
                        required
                        placeholder="yourname@organization.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full rounded-xl border border-line bg-white px-4 py-2.5 text-sm outline-none focus:border-gold-deep"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-ink-soft mb-1">
                        Password *
                      </label>
                      <input
                        type="password"
                        required
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full rounded-xl border border-line bg-white px-4 py-2.5 text-sm outline-none focus:border-gold-deep"
                      />
                    </div>
                  </div>
                )}

                {activeJwt && (
                  <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-xs text-emerald-800 flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                    <span>You are signed in. Click below to claim this invited seat to your profile.</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full rounded-full bg-gold py-3.5 text-sm font-bold text-ink shadow-sm transition-all hover:bg-gold-deep hover:text-white disabled:opacity-60 mt-4"
                >
                  {isLoading ? "Activating Sponsored Seat..." : "Claim Invited Seat & Proceed"}
                </button>
              </form>
            )}
          </div>
        </div>
      </section>

      <Footer />
    </main>
  );
}

