import Link from "next/link";
import { ArrowRight } from "lucide-react";
import Logo from "./Logo";
import FooterPortalLink from "./FooterPortalLink";
import { CONTACT, DISCLAIMER, ENQUIRE_HREF, SOCIALS } from "@/lib/content";
import { getSiteContent } from "@/lib/siteContent";

const LINKS = [
  { label: "Courses", href: "/courses" },
  { label: "About", href: "/about" },
  { label: "Certification", href: "/#certification" },
  { label: "FAQ", href: "/#faq" },
  { label: "API Endpoints", href: "/api/backend", external: true },
];

const LINK = "text-ink-soft transition-colors hover:text-ink";


export default async function Footer() {
  const { contact } = await getSiteContent();

  return (
    <>
      {/* closing call to action */}
      <section id="contact" className="px-5 sm:px-4 md:px-8">
        <div className="mx-auto max-w-[1240px] rounded-[2rem] bg-ink px-6 py-14 text-center text-cream md:py-20">
          <h2 className="text-[1.75rem] font-bold sm:text-4xl leading-[1.08] tracking-tight md:text-5xl">
            Brain Matters.{" "}
            <span className="whitespace-nowrap text-gold">So Do You.</span>
          </h2>
          <p className="mx-auto mt-5 max-w-lg leading-relaxed text-cream/70 md:text-lg">
            Start with a conversation. Tell us about the room, and we will tell
            you honestly which of the three formats it needs.
          </p>
          <a
            href={ENQUIRE_HREF}
            className="group mt-8 inline-flex items-center gap-2 rounded-full bg-gold px-7 py-3.5 text-sm font-medium text-ink transition-colors duration-200 hover:bg-cream"
          >
            Start a Conversation
            <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
          </a>
        </div>
      </section>

      {/* phones get a short footer: the bottom bar already carries the links */}
      <footer className="mx-auto max-w-[1240px] px-5 max-sm:text-center md:px-10">
        <div className="flex flex-col gap-5 py-8 sm:gap-8 sm:py-12 md:flex-row md:items-start md:justify-between">
          <div>
            <Logo className="h-5 max-sm:mx-auto sm:h-6" />
            <p className="mt-3 text-sm text-ink-soft">
              Brain health · Resilience · Purpose
            </p>
          </div>

          <nav aria-label="Footer" className="max-sm:hidden">
            <ul className="flex flex-wrap gap-x-8 gap-y-3 text-[15px]">
              {LINKS.map((l) => (
                <li key={l.href}>
                  {l.external ? (
                    <a
                      href={l.href}
                      target="_blank"
                      rel="noreferrer"
                      className={LINK}
                    >
                      {l.label}
                    </a>
                  ) : (
                    <Link href={l.href} className={LINK}>
                      {l.label}
                    </Link>
                  )}
                </li>
              ))}
              <FooterPortalLink className={LINK} />
            </ul>
          </nav>

          <ul className="space-y-1 text-sm sm:space-y-1.5 sm:text-[15px]">
            <li>
              <a href={`mailto:${contact.email}`} className={LINK}>
                {contact.email}
              </a>
            </li>
            {CONTACT.phones.map((p) => (
              <li key={p.href}>
                <a href={p.href} className={LINK}>
                  {p.number} · {p.place}
                </a>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex flex-col gap-3 border-t border-line py-5 text-sm text-ink-soft max-sm:items-center sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:py-6">
          <span>Licensed in the UAE &amp; India</span>
          <ul className="flex flex-wrap gap-x-6 gap-y-2 max-sm:justify-center">
            {SOCIALS.map((s) => (
              <li key={s.label}>
                <a href={s.href} target="_blank" rel="noreferrer" className={LINK}>
                  {s.label}
                </a>
              </li>
            ))}
          </ul>
        </div>

        <p className="border-t border-line py-5 text-[11px] leading-relaxed text-ink-soft sm:py-6 sm:text-xs">
          <strong className="font-semibold text-ink">Disclaimer.</strong> {DISCLAIMER}
        </p>
      </footer>
      {/* keeps the end of the page clear of the phone tab bar */}
      <div aria-hidden className="h-[calc(60px+env(safe-area-inset-bottom))] sm:hidden" />
    </>
  );
}
