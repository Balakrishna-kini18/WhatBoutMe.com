import type { Metadata } from "next";
import SmoothScroll from "@/components/site/SmoothScroll";
import Nav from "@/components/site/Nav";
import Facilitator from "@/components/site/Facilitator";
import LogoStrip from "@/components/site/LogoStrip";
import Footer from "@/components/site/Footer";
import { getSiteContent } from "@/lib/siteContent";

export const metadata: Metadata = {
  title: "About Me — whatboutme",
  description:
    "I'm human, like you! Roweena Britto on her mental health journey with Bipolar Disorder and becoming a Brain Health Coach.",
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
