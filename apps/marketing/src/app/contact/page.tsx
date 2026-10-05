import type { Metadata } from "next";
import SmoothScroll from "@/components/site/SmoothScroll";
import Nav from "@/components/site/Nav";
import Footer from "@/components/site/Footer";
import ContactForm from "@/components/site/ContactForm";
import { CONTACT } from "@/lib/content";
import { getSiteContent } from "@/lib/siteContent";

export const metadata: Metadata = {
  title: "Contact — whatboutme",
  description:
    "Start with a conversation. Tell us about the room, and we will tell you honestly which format it needs.",
};

export default async function ContactPage() {
  const { contact } = await getSiteContent();

  return (
    <main className="relative min-h-screen bg-cream text-ink">
      <SmoothScroll />
      <Nav />

      <section className="relative overflow-hidden">
        <div aria-hidden className="bg-grid absolute inset-0" />
        <div className="relative mx-auto grid max-w-[1240px] gap-12 px-5 pb-20 pt-20 sm:pt-32 md:px-10 md:pb-28 md:pt-40 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
          <div>
            <h1 className="text-balance text-[1.75rem] font-bold sm:text-4xl leading-[1.08] tracking-tight md:text-5xl">
              Start With a Conversation
            </h1>
            <p className="mt-5 max-w-md leading-relaxed text-ink-soft md:text-lg">
              Tell us about the room, and we will tell you honestly which of
              the formats it needs.
            </p>

            <dl className="mt-10 space-y-5">
              <div>
                <dt className="eyebrow text-gold-deep">Email</dt>
                <dd className="mt-1.5">
                  <a
                    href={`mailto:${contact.email}`}
                    className="transition-colors hover:text-gold-deep"
                  >
                    {contact.email}
                  </a>
                </dd>
              </div>
              <div>
                <dt className="eyebrow text-gold-deep">WhatsApp</dt>
                <dd className="mt-1.5">
                  <a
                    href="https://wa.me/971565464014"
                    target="_blank"
                    rel="noreferrer"
                    className="transition-colors hover:text-gold-deep"
                  >
                    Message us on WhatsApp
                  </a>
                </dd>
              </div>
              <div>
                <dt className="eyebrow text-gold-deep">Mobile</dt>
                {CONTACT.phones.map((p) => (
                  <dd key={p.href} className="mt-1.5">
                    <a href={p.href} className="transition-colors hover:text-gold-deep">
                      {p.number}
                    </a>{" "}
                    <span className="text-ink-soft">· {p.place}</span>
                  </dd>
                ))}
              </div>
            </dl>
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
