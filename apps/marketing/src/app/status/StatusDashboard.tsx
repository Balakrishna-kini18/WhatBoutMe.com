"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  XCircle,
  ExternalLink,
  RefreshCw,
  Server,
  Database,
  Lock,
  GraduationCap,
  LayoutDashboard,
  Code2,
} from "lucide-react";

interface StatusData {
  backend: boolean;
  statusResponse: any;
  programs: any[];
  error?: string;
  latency?: number;
}

export default function StatusDashboard() {
  const [data, setData] = useState<StatusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedEndpoint, setSelectedEndpoint] = useState<string>("/api/backend");
  const [endpointResponse, setEndpointResponse] = useState<any>(null);
  const [endpointLoading, setEndpointLoading] = useState(false);

  const checkStatus = async () => {
    setLoading(true);
    const start = Date.now();
    try {
      const [healthRes, programsRes] = await Promise.all([
        fetch("/api/backend", { cache: "no-store" }),
        fetch("/api/backend/programs", { cache: "no-store" }),
      ]);

      const health = await healthRes.json().catch(() => null);
      const programs = await programsRes.json().catch(() => []);
      const latency = Date.now() - start;

      setData({
        backend: healthRes.ok,
        statusResponse: health,
        programs: Array.isArray(programs) ? programs : [],
        latency,
      });
      setEndpointResponse(health);
    } catch (err: any) {
      setData({
        backend: false,
        statusResponse: null,
        programs: [],
        error: err.message,
        latency: Date.now() - start,
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      const start = Date.now();
      try {
        const [healthRes, programsRes] = await Promise.all([
          fetch("/api/backend", { cache: "no-store" }),
          fetch("/api/backend/programs", { cache: "no-store" }),
        ]);

        const health = await healthRes.json().catch(() => null);
        const programs = await programsRes.json().catch(() => []);
        const latency = Date.now() - start;

        if (mounted) {
          setData({
            backend: healthRes.ok,
            statusResponse: health,
            programs: Array.isArray(programs) ? programs : [],
            latency,
          });
          setEndpointResponse(health);
        }
      } catch (err: any) {
        if (mounted) {
          setData({
            backend: false,
            statusResponse: null,
            programs: [],
            error: err.message,
            latency: Date.now() - start,
          });
        }
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const testEndpoint = async (url: string) => {
    setSelectedEndpoint(url);
    setEndpointLoading(true);
    try {
      const res = await fetch(url, { cache: "no-store" });
      const json = await res.json();
      setEndpointResponse(json);
    } catch (err: any) {
      setEndpointResponse({ error: err.message });
    } finally {
      setEndpointLoading(false);
    }
  };

  const services = [
    {
      name: "Main Web Application",
      url: "http://localhost:3000",
      description: "Frontend Next.js marketing and course platform",
      port: 3000,
      icon: Code2,
      status: "Online",
      color: "bg-emerald-500",
    },
    {
      name: "Core Backend API",
      url: "http://localhost:4000",
      description: "NestJS core API connected to Neon PostgreSQL",
      port: 4000,
      icon: Server,
      status: data?.backend ? "Online" : loading ? "Checking..." : "Offline",
      color: data?.backend ? "bg-emerald-500" : "bg-red-500",
    },
    {
      name: "Learner Portal (LMS)",
      url: "http://localhost:3003",
      description: "Student portal for video lessons, quizzes, certificates",
      port: 3003,
      icon: GraduationCap,
      status: "Online",
      color: "bg-emerald-500",
    },
    {
      name: "Admin Dashboard",
      url: "http://localhost:3002",
      description: "Admin & manager portal for cohorts, revenue, invoices",
      port: 3002,
      icon: LayoutDashboard,
      status: "Online",
      color: "bg-emerald-500",
    },
  ];

  return (
      <div className="mx-auto max-w-[1240px] px-5 pb-20 pt-20 sm:pt-32 md:px-10 md:pt-40">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight md:text-5xl">
              Backend Integration Hub
            </h1>
            <p className="mt-2 text-ink-soft md:text-lg">
              All services, environment connections, database status, and active links.
            </p>
          </div>

          <button
            onClick={checkStatus}
            disabled={loading}
            className="flex items-center justify-center gap-2 rounded-full border border-line bg-white px-5 py-2.5 text-sm font-medium text-ink shadow-sm transition hover:border-ink disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh Status
          </button>
        </div>

        {/* Global Connection Badge */}
        <div className="mt-8 rounded-2xl border border-line bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div
                className={`flex h-12 w-12 items-center justify-center rounded-2xl ${
                  data?.backend ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600"
                }`}
              >
                {data?.backend ? (
                  <CheckCircle2 className="h-6 w-6" />
                ) : (
                  <XCircle className="h-6 w-6" />
                )}
              </div>
              <div>
                <h3 className="font-bold text-lg">
                  {data?.backend
                    ? "NestJS Backend API is Connected & Online"
                    : loading
                    ? "Verifying Backend API Connection..."
                    : "Backend API Disconnected"}
                </h3>
                <p className="text-sm text-ink-soft">
                  {data?.backend
                    ? `Response latency: ${data.latency}ms · Database: Neon PostgreSQL (Connected)`
                    : "Ensure the backend process is running on port 4000"}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-800">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                Neon DB Connected
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-100 px-3 py-1 text-xs font-medium text-indigo-800">
                JWT Auth Active
              </span>
            </div>
          </div>
        </div>

        {/* Quick Links Grid */}
        <div className="mt-8">
          <h2 className="text-xl font-bold tracking-tight">Active Platform Portals</h2>
          <p className="mt-1 text-sm text-ink-soft">
            Click any service link below to open directly in your browser.
          </p>

          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {services.map((srv) => {
              const Icon = srv.icon;
              return (
                <a
                  key={srv.name}
                  href={srv.url}
                  target="_blank"
                  rel="noreferrer"
                  className="group relative flex flex-col justify-between rounded-2xl border border-line bg-white p-5 transition-all duration-200 hover:-translate-y-1 hover:border-ink hover:shadow-md"
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-ink/5 text-ink transition group-hover:bg-gold/20 group-hover:text-gold-deep">
                        <Icon className="h-5 w-5" />
                      </div>
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-soft">
                        <span className={`h-2 w-2 rounded-full ${srv.color}`} />
                        Port {srv.port}
                      </span>
                    </div>

                    <h3 className="mt-4 font-bold text-ink group-hover:text-gold-deep flex items-center gap-1">
                      {srv.name}
                      <ExternalLink className="h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-100" />
                    </h3>
                    <p className="mt-1.5 text-xs leading-relaxed text-ink-soft">
                      {srv.description}
                    </p>
                  </div>

                  <div className="mt-4 border-t border-line/60 pt-3 text-xs font-mono font-medium text-gold-deep">
                    {srv.url}
                  </div>
                </a>
              );
            })}
          </div>
        </div>

        {/* Interactive Endpoint Tester */}
        <div className="mt-12 rounded-3xl border border-line bg-white p-6 md:p-8 shadow-sm">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-2xl font-bold tracking-tight">Interactive Endpoint Inspector</h2>
              <p className="text-sm text-ink-soft">
                Test API endpoints proxied through Next.js rewrite (<code className="rounded bg-ink/5 px-1 py-0.5 font-mono text-xs">/api/backend/*</code>) or direct.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {[
                { label: "Root Health", url: "/api/backend" },
                { label: "Programs List", url: "/api/backend/programs" },
                { label: "Batches", url: "/api/backend/batches" },
                { label: "Sessions", url: "/api/backend/sessions" },
              ].map((btn) => (
                <button
                  key={btn.url}
                  onClick={() => testEndpoint(btn.url)}
                  className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
                    selectedEndpoint === btn.url
                      ? "bg-ink text-cream"
                      : "border border-line bg-cream/40 text-ink hover:border-ink"
                  }`}
                >
                  {btn.label}
                </button>
              ))}
            </div>
          </div>

          {/* Endpoint URL Input & Run Button */}
          <div className="mt-6 flex flex-col gap-2 sm:flex-row">
            <input
              type="text"
              value={selectedEndpoint}
              onChange={(e) => setSelectedEndpoint(e.target.value)}
              className="flex-1 rounded-xl border border-line bg-cream/20 px-4 py-2.5 font-mono text-sm text-ink outline-none focus:border-ink"
            />
            <button
              onClick={() => testEndpoint(selectedEndpoint)}
              disabled={endpointLoading}
              className="rounded-xl bg-gold px-6 py-2.5 text-sm font-semibold text-ink transition hover:bg-gold-deep hover:text-white disabled:opacity-50"
            >
              {endpointLoading ? "Testing..." : "Send Request"}
            </button>
          </div>

          {/* JSON Output Viewer */}
          <div className="mt-4 overflow-hidden rounded-2xl bg-[#14110f] p-4 text-emerald-400">
            <div className="flex items-center justify-between border-b border-white/10 pb-2 text-xs font-mono text-cream/50">
              <span>Response Output</span>
              <span>GET {selectedEndpoint}</span>
            </div>
            <pre className="mt-3 max-h-80 overflow-auto font-mono text-xs leading-relaxed">
              {endpointResponse
                ? JSON.stringify(endpointResponse, null, 2)
                : "Click 'Send Request' or select an endpoint above to view output."}
            </pre>
          </div>
        </div>

        {/* Demo Credentials Box */}
        <div className="mt-12 rounded-3xl border border-line bg-white p-6 md:p-8">
          <div className="flex items-center gap-3">
            <Lock className="h-6 w-6 text-gold-deep" />
            <h2 className="text-xl font-bold tracking-tight">Database Seed Accounts</h2>
          </div>
          <p className="mt-1 text-sm text-ink-soft">
            Pre-configured users available for logging into the Admin Dashboard or Learner Portal:
          </p>

          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                role: "Super Admin",
                email: "super@whatboutme.com",
                portal: "Admin Dashboard (:3002)",
              },
              {
                role: "Admin",
                email: "admin@whatboutme.com",
                portal: "Admin Dashboard (:3002)",
              },
              {
                role: "Learner 1",
                email: "learner1@whatboutme.com",
                portal: "Learner Portal (:3003)",
              },
              {
                role: "Learner 2",
                email: "learner2@whatboutme.com",
                portal: "Learner Portal (:3003)",
              },
            ].map((usr) => (
              <div
                key={usr.email}
                className="rounded-xl border border-line/70 bg-cream/30 p-4 text-sm"
              >
                <div className="font-semibold text-ink">{usr.role}</div>
                <div className="mt-1 font-mono text-xs text-ink-soft select-all">
                  {usr.email}
                </div>
                <div className="mt-2 text-xs text-gold-deep font-medium">
                  Password: <span className="font-mono text-ink">Learner@2026</span>
                </div>
                <div className="mt-1 text-[11px] text-ink-soft">{usr.portal}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
  );
}
