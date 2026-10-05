import type { Metadata } from "next";
import SmoothScroll from "@/components/site/SmoothScroll";
import Nav from "@/components/site/Nav";
import Facilitator from "@/components/site/Facilitator";
import LogoStrip from "@/components/site/LogoStrip";
import Footer from "@/components/site/Footer";
import { getSiteContent } from "@/lib/siteContent";

export const metadata: Metadata = {
  title: "About Roweena Britto — whatboutme",
  description:
    "Roweena Britto spent eighteen years in the corporate world before becoming a Brain Health Coach, licensed in the UAE and India, and founding whatboutme.",
};

export default async function AboutPage() {
  const { about } = await getSiteContent();

  return (
    <main className="relative min-h-screen bg-cream text-ink">
      <SmoothScroll />
      <Nav />
      <Facilitator image={about.image} />
      <LogoStrip />
      <Footer />
    </main>
  );
}
