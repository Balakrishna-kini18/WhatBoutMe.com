import type { Metadata } from "next";
import SmoothScroll from "@/components/site/SmoothScroll";
import Nav from "@/components/site/Nav";
import Footer from "@/components/site/Footer";
import PromoBanner from "@/components/site/PromoBanner";
import { getSiteContent } from "@/lib/siteContent";
import EventsClient from "./EventsClient";

export const metadata: Metadata = {
  title: "Events & Webinars — whatboutme",
  description:
    "Join live brain health masterclasses, resilience workshops, and interactive webinars with Roweena Britto. In-person in Dubai & India or online globally.",
  keywords: [
    "brain health webinars",
    "mental resilience workshops",
    "Roweena Britto events",
    "bipolar management masterclass",
    "brain coaching events",
    "whatboutme",
  ],
  openGraph: {
    title: "Events & Webinars — whatboutme",
    description:
      "Join live brain health masterclasses, resilience workshops, and interactive webinars with Roweena Britto.",
    siteName: "whatboutme",
    type: "website",
  },
};

export default async function EventsPage() {
  const { promo } = await getSiteContent();

  return (
    <main className="relative min-h-screen bg-cream text-ink">
      <SmoothScroll />
      <Nav />

      {/* Hero Header */}
      <header className="relative overflow-hidden">
        <div aria-hidden className="bg-grid absolute inset-0 opacity-40" />
        <div className="relative mx-auto max-w-[1240px] px-5 pb-8 pt-20 text-center sm:pt-32 md:px-10 md:pb-12 md:pt-40">
          <div className="mx-auto mb-3 inline-flex items-center gap-2 rounded-full border border-gold/40 bg-gold-deep/10 px-3.5 py-1 text-xs font-semibold uppercase tracking-wider text-gold-deep">
            <span>Live Interactive Sessions</span>
          </div>
          <h1 className="mx-auto max-w-3xl text-balance text-[1.75rem] font-bold leading-[1.08] tracking-tight sm:text-4xl md:text-5xl">
            Upcoming Events &amp; Webinars
          </h1>
          <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-ink-soft sm:mt-5 sm:text-base md:text-lg">
            Join Roweena Britto for immersive brain health masterclasses, emotional resilience
            breakthroughs, and interactive Q&amp;A sessions. Reserve your free pass below.
          </p>
        </div>
      </header>

      {/* Optional Promo Banner */}
      <div className="-mt-2 pb-2">
        <PromoBanner promo={promo} />
      </div>

      {/* Main Interactive Showcase */}
      <EventsClient />

      <Footer />
    </main>
  );
}
