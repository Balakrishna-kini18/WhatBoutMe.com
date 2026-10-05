import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Award, CalendarDays, MapPin } from "lucide-react";
import { ENQUIRE_HREF } from "@/lib/content";
import { isLocalImage, type SiteContent } from "@/lib/siteContent";

const FACTS = [
  { icon: CalendarDays, label: "12 classes", detail: "2 hours each, live online on Saturdays" },
  { icon: Award, label: "25 CPD hours", detail: "CPD accredited certification" },
  { icon: MapPin, label: "UAE & India", detail: "Licensed in both countries" },
];

export default function Hero({ content }: { content: SiteContent["hero"] }) {
  // The entrance is a CSS animation (see .rise in globals.css), so the hero
  // appears without waiting for scripts; it used to stay blank until they ran.
  const rise = (delay: number) => ({ style: { animationDelay: `${delay}s` } });

  return (
    <section
      id="top"
      className="relative flex overflow-hidden border-b border-line xl:min-h-[100svh]"
    >
      <div aria-hidden className="bg-grid absolute inset-0" />

      {/* phones: a compact stack sized like an app's home screen (small title,
          short buttons, facts as three tiles, small portrait). xl: text left,
          portrait centre, course facts right */}
      <div className="relative mx-auto grid w-full max-w-[1560px] items-center gap-6 px-5 pt-16 sm:gap-10 sm:pt-28 md:px-10 xl:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] xl:gap-8 xl:pt-24">
        <div {...rise(0.05)} className="rise text-center xl:pb-10 xl:text-left">
          <h1 className="text-balance text-[1.75rem] font-bold sm:text-[clamp(2.25rem,9vw,3.5rem)] leading-[1.08] tracking-tight text-ink xl:text-[clamp(2.25rem,3.1vw,3.5rem)]">
            {content.title}
            <span className="block text-gold-deep">{content.highlight}</span>
          </h1>
          <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-ink-soft sm:mt-5 sm:text-base xl:mx-0">
            {content.subtitle}
          </p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5 sm:mt-7 sm:gap-3 xl:justify-start">
            <Link
              href={ENQUIRE_HREF}
              className="group flex items-center gap-2 whitespace-nowrap rounded-full bg-gold px-5 py-2.5 text-sm font-medium text-ink transition-colors duration-200 hover:bg-ink hover:text-cream sm:px-6 sm:py-3.5"
            >
              Enquire now
              <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
            </Link>
            <Link
              href="/courses"
              className="whitespace-nowrap rounded-full border border-ink/15 bg-white px-5 py-2.5 text-sm font-medium text-ink transition-colors duration-200 hover:border-ink sm:px-6 sm:py-3.5"
            >
              View Courses
            </Link>
          </div>
        </div>

        {/* portrait on the sun disc from the brochure cover */}
        <div
          {...rise(0.15)}
          className="rise relative order-last mx-auto aspect-[52/58] w-full max-w-[200px] overflow-hidden sm:max-w-[340px] xl:order-none xl:h-[min(calc(100svh-7.5rem),40vw,660px)] xl:w-auto xl:max-w-none xl:self-end"
        >
          <span className="absolute inset-x-0 bottom-0 aspect-square rounded-full bg-[linear-gradient(160deg,#f8cf86,#efa944)]" />
          <Image
            src={content.image}
            unoptimized={!isLocalImage(content.image)}
            alt="Roweena Britto, Brain Health Coach and founder of whatboutme"
            width={623}
            height={1289}
            priority
            sizes="(max-width: 640px) 80vw, 420px"
            className="absolute left-1/2 top-0 h-[165%] w-auto max-w-none -translate-x-1/2"
          />
        </div>

        <div {...rise(0.25)} className="rise mx-auto w-full max-w-sm max-sm:text-center xl:mx-0 xl:justify-self-end xl:pb-10">
          <p className="text-xs text-gold-deep sm:text-sm">The flagship course</p>
          <p className="mt-0.5 text-lg font-bold tracking-tight sm:mt-1 sm:text-2xl md:text-3xl">
            11 Steps to You
          </p>
          <ul className="mt-3 grid grid-cols-3 gap-2 sm:mt-6 sm:block sm:space-y-4">
            {FACTS.map((f) => (
              <li
                key={f.label}
                className="flex flex-col items-center gap-1.5 rounded-2xl border border-line bg-white px-1.5 py-3 text-center sm:flex-row sm:gap-4 sm:rounded-none sm:border-0 sm:bg-transparent sm:p-0 sm:text-left"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-cream-deep text-gold-deep sm:h-11 sm:w-11">
                  <f.icon className="h-[18px] w-[18px] sm:h-5 sm:w-5" strokeWidth={1.8} />
                </span>
                <span className="text-sm leading-snug text-ink-soft">
                  <span className="block text-xs font-semibold text-ink sm:text-base">
                    {f.label}
                  </span>
                  {/* the tiles on phones have room for the label only */}
                  <span className="max-sm:hidden">{f.detail}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
