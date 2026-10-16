import type { Metadata } from "next";
import { notFound } from "next/navigation";
import SmoothScroll from "@/components/site/SmoothScroll";
import Nav from "@/components/site/Nav";
import Footer from "@/components/site/Footer";
import { getPublicEventBySlug } from "@/lib/api";
import EventDetailClient from "./EventDetailClient";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const event = await getPublicEventBySlug(slug);

  if (!event) {
    return {
      title: "Event Not Found — whatboutme",
      description: "The requested event or webinar could not be found.",
    };
  }

  const title = `${event.title} — whatboutme Events`;
  const description =
    event.description?.slice(0, 160) ||
    "Join live brain health masterclasses, resilience workshops, and interactive webinars with Roweena Britto.";

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: event.bannerUrl ? [{ url: event.bannerUrl }] : undefined,
      siteName: "whatboutme",
      type: "website",
    },
  };
}

export default async function EventDetailPage({ params }: Props) {
  const { slug } = await params;
  const event = await getPublicEventBySlug(slug);

  if (!event || !event.isPublished) {
    notFound();
  }

  return (
    <main className="relative min-h-screen bg-cream text-ink">
      <SmoothScroll />
      <Nav />
      <EventDetailClient initialEvent={event} />
      <Footer />
    </main>
  );
}
