import SmoothScroll from "@/components/site/SmoothScroll";
import Nav from "@/components/site/Nav";
import Hero from "@/components/site/Hero";
import PromoBanner from "@/components/site/PromoBanner";
import Offerings from "@/components/site/Offerings";
import Programme from "@/components/site/Programme";
import AboutTeaser from "@/components/site/AboutTeaser";
import LogoStrip from "@/components/site/LogoStrip";
import Testimonials from "@/components/site/Testimonials";
import GalleryTeaser from "@/components/site/GalleryTeaser";
import Faq from "@/components/site/Faq";
import Footer from "@/components/site/Footer";
import { getSiteContent } from "@/lib/siteContent";

export default async function Home() {
  const content = await getSiteContent();

  return (
    <main className="relative min-h-screen bg-cream text-ink">
      <SmoothScroll />
      <Nav />
      <Hero content={content.hero} />
      <PromoBanner promo={content.promo} />
      <LogoStrip />
      <Offerings />
      <Programme />
      <AboutTeaser image={content.about.image} />
      <GalleryTeaser />
      <Testimonials testimonials={content.testimonials} />
      <Faq faqs={content.faqs} />
      <Footer />
    </main>
  );
}
