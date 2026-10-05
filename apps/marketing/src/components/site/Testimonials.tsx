import { Quote } from "lucide-react";
import SectionHeading from "./SectionHeading";
import Reveal from "./Reveal";
import type { SiteContent } from "@/lib/siteContent";

export default function Testimonials({
  testimonials,
}: {
  testimonials: SiteContent["testimonials"];
}) {
  // real quotes are added in the admin; with none, the section is not shown
  if (testimonials.length === 0) return null;

  return (
    <section id="testimonials" className="bg-sand/60 py-10 sm:py-16 md:py-24">
      <div className="mx-auto max-w-[1240px] px-5 md:px-10">
        <SectionHeading
          center
          eyebrow="Testimonials"
          title="What Clients Are Saying"
        />

        <div className="max-md:swipe-row md:mx-auto md:flex md:max-w-[1000px] md:flex-wrap md:justify-center md:gap-5 md:[&>*]:w-[calc(50%-0.625rem)]">
          {testimonials.map((t, i) => (
            <Reveal key={i} delay={i * 0.06} className="h-full">
              <figure className="flex h-full flex-col rounded-3xl border border-line bg-white p-7 md:p-8">
                <Quote
                  aria-hidden
                  className="h-7 w-7 fill-gold text-gold"
                  strokeWidth={0}
                />
                <blockquote className="mt-5 flex-1 text-lg leading-relaxed">
                  {t.quote}
                </blockquote>
                <figcaption className="mt-7 flex items-center gap-3 border-t border-line pt-5">
                  <span
                    aria-hidden
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-cream-deep text-sm font-semibold text-gold-deep"
                  >
                    {t.name.charAt(0)}
                  </span>
                  <span className="leading-tight">
                    <span className="block font-semibold">{t.name}</span>
                    <span className="text-sm text-ink-soft">{t.role}</span>
                  </span>
                </figcaption>
              </figure>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
