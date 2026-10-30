import type { Metadata } from "next";
import Image from "next/image";
import SmoothScroll from "@/components/site/SmoothScroll";
import Nav from "@/components/site/Nav";
import Footer from "@/components/site/Footer";
import ContactForm from "@/components/site/ContactForm";
import { CONTACT } from "@/lib/content";
import { getSiteContent, isLocalImage } from "@/lib/siteContent";

export const metadata: Metadata = {
  title: "Let's Talk — whatboutme",
  description:
    "Contact Us. Thank you for investing your time on BRAIN HEALTH.",
};

export default async function ContactPage() {
  const { contact, about } = await getSiteContent();

  return (
    <main className="relative min-h-screen bg-cream text-ink">
      <SmoothScroll />
      <Nav />

      <section className="relative overflow-hidden">
        <div className="relative mx-auto grid max-w-[1240px] gap-12 px-5 pb-20 pt-20 sm:pt-32 md:px-10 md:pb-28 md:pt-40 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
          <div>
            <h1 className="text-balance text-[1.75rem] font-bold sm:text-4xl leading-[1.08] tracking-tight md:text-5xl">
              Contact Us
            </h1>
            <p className="mt-5 max-w-md leading-relaxed text-ink-soft md:text-lg">
              Thank you for investing your time on BRAIN HEALTH.
            </p>

            <dl className="mt-10 space-y-6">
              <div>
                <dt className="text-sm text-ink-soft">Email Us</dt>
                <dd className="mt-1.5">
                  <a
                    href={`mailto:${contact.email}`}
                    className="text-lg font-medium transition-colors hover:text-gold-deep"
                  >
                    {contact.email}
                  </a>
                </dd>
              </div>
              {contact.social && (
                <div>
                  <dt className="text-sm text-ink-soft">Social</dt>
                  <dd className="mt-1.5">
                    <a
                      href={contact.social.startsWith("http") ? contact.social : `https://${contact.social}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-lg font-medium transition-colors hover:text-gold-deep"
                    >
                      {contact.social}
                    </a>
                  </dd>
                </div>
              )}
              <div>
                <dt className="text-sm text-ink-soft">Enquiries & Consultations</dt>
                <dd className="mt-1.5 text-sm text-ink-soft leading-relaxed">
                  Submit a General or Course Enquiry using the form. Our coaching team reviews and responds to all messages within 24 hours.
                </dd>
              </div>
              <div>
                <dt className="text-sm text-ink-soft">Location & Global Reach</dt>
                <dd className="mt-1.5 text-sm text-ink-soft">
                  Dubai, UAE & Mangalore, India · Serving global learners worldwide
                </dd>
              </div>
            </dl>

            {/* desktop: who you are writing to */}
            <figure className="mt-10 hidden max-w-xs lg:block">
              <div className="relative aspect-[4/5] overflow-hidden rounded-[2rem] border border-[#cbb797]">
                <Image
                  src={about.image || "/site/gallery/roweena-05.webp"}
                  unoptimized={!isLocalImage(about.image || "/site/gallery/roweena-05.webp")}
                  alt="Roweena Britto, Brain Health Coach"
                  fill
                  loading="lazy"
                  sizes="320px"
                  className="object-cover"
                />
              </div>
              <figcaption className="mt-3 text-sm text-ink-soft">
                <span className="font-semibold text-ink">Roweena Britto</span> · Brain Health Coach
              </figcaption>
            </figure>
          </div>

          <div className="rounded-[2rem] border border-line bg-white p-7 md:p-10">
            <ContactForm />
          </div>
        </div>
      </section>

      <Footer />
    </main>
  );
}
