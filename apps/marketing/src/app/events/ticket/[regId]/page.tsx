import type { Metadata } from "next";
import Link from "next/link";
import SmoothScroll from "@/components/site/SmoothScroll";
import Nav from "@/components/site/Nav";
import Footer from "@/components/site/Footer";
import {
  CheckCircle2,
  XCircle,
  MapPin,
  Calendar,
  Ticket,
  User,
  Clock,
  Sparkles,
  ArrowRight,
} from "lucide-react";
import { API_BASE_URL } from "@/lib/api";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ regId: string }>;
}): Promise<Metadata> {
  const { regId } = await params;
  return {
    title: `Event Ticket Verification: ${regId} — whatboutme`,
    description: `Official ticket verification portal for whatboutme workshop and event booking ${regId}.`,
  };
}

interface TicketData {
  id: string;
  attendeeName: string;
  status: string;
  amount: number;
  currency: string;
  createdAt: string;
  event: {
    id: string;
    title: string;
    slug: string;
    startDateTime: string;
    endDateTime?: string;
    locationType: "ONLINE" | "PHYSICAL";
    venueName?: string;
    venueAddress?: string;
    meetingLink?: string;
    timezone?: string;
  };
}

async function fetchTicket(regId: string): Promise<TicketData | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/events/ticket/${encodeURIComponent(regId)}`, {
      cache: "no-store",
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export default async function EventTicketVerificationPage({
  params,
}: {
  params: Promise<{ regId: string }>;
}) {
  const { regId } = await params;
  const ticket = await fetchTicket(regId);

  const isValid = Boolean(
    ticket &&
      (ticket.status === "PAID" || ticket.status === "REGISTERED" || ticket.status === "CONFIRMED")
  );

  const eventDate = ticket?.event?.startDateTime
    ? new Date(ticket.event.startDateTime).toLocaleDateString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : "Upcoming";

  const eventTime = ticket?.event?.startDateTime
    ? new Date(ticket.event.startDateTime).toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        timeZone: ticket.event.timezone || "Asia/Dubai",
      }) + ` (${ticket.event.timezone || "GST"})`
    : "";

  return (
    <main className="relative min-h-screen bg-cream text-ink">
      <SmoothScroll />
      <Nav />

      <section className="relative mx-auto max-w-[720px] px-5 pb-20 pt-28 md:pt-36">
        {isValid && ticket ? (
          <div className="overflow-hidden rounded-2xl border border-emerald-200 bg-white shadow-xl shadow-emerald-500/5">
            {/* Verified Header Banner */}
            <div className="bg-gradient-to-r from-emerald-600 to-teal-600 px-6 py-6 text-white text-center sm:px-8 sm:py-8">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-white/20 backdrop-blur-sm">
                <CheckCircle2 className="h-8 w-8 text-white" />
              </div>
              <h1 className="mt-4 text-2xl font-bold tracking-tight sm:text-3xl">
                Verified Event Ticket
              </h1>
              <p className="mt-1 text-sm text-emerald-100">
                Official WhatBoutMe Registration Record
              </p>
            </div>

            {/* Ticket Details Body */}
            <div className="p-6 sm:p-8">
              {/* Event Title Card */}
              <div className="rounded-xl border border-gray-100 bg-gray-50/60 p-5">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
                  <Sparkles className="h-3 w-3" />
                  Live Masterclass
                </span>
                <h2 className="mt-2.5 text-xl font-bold text-gray-900 sm:text-2xl">
                  {ticket.event.title}
                </h2>

                <div className="mt-4 space-y-2 text-sm text-gray-600">
                  <div className="flex items-center gap-2.5">
                    <Calendar className="h-4 w-4 text-gray-400 shrink-0" />
                    <span>{eventDate}</span>
                  </div>
                  {eventTime && (
                    <div className="flex items-center gap-2.5">
                      <Clock className="h-4 w-4 text-gray-400 shrink-0" />
                      <span>{eventTime}</span>
                    </div>
                  )}
                  {ticket.event.venueName && (
                    <div className="flex items-start gap-2.5">
                      <MapPin className="h-4 w-4 text-gray-400 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-semibold text-gray-900">{ticket.event.venueName}</span>
                        {ticket.event.venueAddress && (
                          <span className="block text-xs text-gray-500">{ticket.event.venueAddress}</span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Attendee & Verification Metadata */}
              <div className="mt-6 rounded-xl border border-gray-200 divide-y divide-gray-100">
                <div className="flex items-center justify-between px-5 py-3.5 text-sm">
                  <span className="flex items-center gap-2 text-gray-500">
                    <User className="h-4 w-4" /> Attendee Name
                  </span>
                  <span className="font-semibold text-gray-900">{ticket.attendeeName}</span>
                </div>

                <div className="flex items-center justify-between px-5 py-3.5 text-sm">
                  <span className="flex items-center gap-2 text-gray-500">
                    <Ticket className="h-4 w-4" /> Ticket Reference
                  </span>
                  <span className="font-mono text-xs font-bold text-gray-700 bg-gray-100 px-2.5 py-1 rounded">
                    {ticket.id}
                  </span>
                </div>

                <div className="flex items-center justify-between px-5 py-3.5 text-sm">
                  <span className="text-gray-500">Registration Status</span>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-emerald-700">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    Confirmed &amp; Valid
                  </span>
                </div>

                <div className="flex items-center justify-between px-5 py-3.5 text-sm">
                  <span className="text-gray-500">Admission Type</span>
                  <span className="font-semibold text-gray-900">
                    {ticket.amount > 0 ? `${ticket.currency} ${ticket.amount}` : "Standard Admission (Free RSVP)"}
                  </span>
                </div>
              </div>

              {/* In-Person Door Notice */}
              <div className="mt-6 rounded-lg bg-emerald-50/60 border border-emerald-100 p-4 text-center text-xs leading-relaxed text-emerald-900">
                ✅ <strong>Express Check-in Approved</strong>: This ticket has been verified against the WhatBoutMe event database.
              </div>

              {/* Action Buttons */}
              <div className="mt-6 text-center">
                <Link
                  href="/events"
                  className="inline-flex items-center gap-2 text-sm font-semibold text-gray-700 hover:text-black transition-colors"
                >
                  Browse More Events <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-rose-200 bg-white p-8 text-center shadow-lg">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-rose-100">
              <XCircle className="h-8 w-8 text-rose-600" />
            </div>
            <h1 className="mt-4 text-2xl font-bold text-gray-900">Ticket Not Found</h1>
            <p className="mt-2 text-sm text-gray-600">
              The ticket reference <code className="bg-gray-100 px-2 py-0.5 rounded font-mono text-xs">{regId}</code> could not be verified or has expired.
            </p>
            <div className="mt-6">
              <Link
                href="/events"
                className="inline-flex items-center gap-2 rounded-lg bg-black px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-gray-800 transition-colors"
              >
                Return to Events Directory
              </Link>
            </div>
          </div>
        )}
      </section>

      <Footer />
    </main>
  );
}

