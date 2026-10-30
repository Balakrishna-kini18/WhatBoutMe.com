import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Award, CalendarDays, MapPin } from "lucide-react";
import { ENQUIRE_HREF } from "@/lib/content";
import { isLocalImage, type SiteContent } from "@/lib/siteContent";

const FACTS = [
  {
    icon: CalendarDays,
    label: "12 classes",
    detail: "Saturdays · 2 hours each",
  },
  {
    icon: Award,
    label: "25 CPD Hours",
    detail: "Certification (UK)",
  },
  { icon: MapPin, label: "India & UAE", detail: "11am INDIA : 9:30am UAE" },
];

// her three offerings, as named in the course list (lib/content.ts COURSES)
const HER_COURSES = ["11 Steps to U Program", "Resilience Speaker", "Vision Board"];

export default function Hero({ content }: { content: SiteContent["hero"] }) {
  // The entrance is a CSS animation (see .rise in globals.css), so the hero
  // appears without waiting for scripts; it used to stay blank until they ran.
  const rise = (delay: number) => ({ style: { animationDelay: `${delay}s` } });

  return (
    <section
      id="top"
      className="relative flex overflow-hidden border-b border-line"
    >
      {/* phones: a compact stack sized like an app's home screen (small title,
          short buttons, facts as three tiles, small portrait). xl: text and
          course facts left, portrait right */}
      <div className="relative mx-auto grid w-full max-w-[1320px] items-center gap-6 px-5 pt-16 sm:gap-10 sm:pt-28 md:px-10 xl:grid-cols-[minmax(0,1fr)_auto] xl:gap-12 xl:pt-32">
        <div className="xl:pb-10">
          <div {...rise(0.05)} className="rise text-center xl:text-left">
            {/* who she is and what she does, or custom small label from CMS */}
            <p className="mb-3 text-sm text-ink-soft sm:mb-4 sm:text-base">
              {content.eyebrow && content.eyebrow.trim() ? (
                <span className="font-semibold text-gold-deep tracking-wide uppercase text-xs sm:text-sm">
                  {content.eyebrow.trim()}
                </span>
              ) : (
                <>
                  <span className="font-semibold text-ink">Roweena Britto</span>
                  <span aria-hidden="true"> · </span>
                  <span className="whitespace-nowrap">Brain Health Coach</span>{" "}
                  <span className="whitespace-nowrap">&amp; Resilience Speaker</span>
                </>
              )}
            </p>
            {/* capitalize: the title comes from the CMS in sentence case */}
            <h1 className="text-balance text-[2.375rem] font-bold capitalize leading-[1.02] tracking-[-0.03em] text-ink sm:text-[clamp(2.75rem,10vw,4.5rem)] xl:text-[clamp(3rem,4.4vw,4.75rem)]">
              {content.title}
              <span className="block text-gold-deep">{content.highlight}</span>
            </h1>
            <p className="mx-auto mt-3 max-w-md text-[15px] font-medium leading-relaxed text-ink-soft sm:mt-5 sm:text-lg xl:mx-0">
              {content.subtitle}
            </p>
            {/* her courses, one quiet line */}
            <p className="mx-auto mt-4 max-w-lg text-sm font-medium sm:text-[15px] xl:mx-0">
              {HER_COURSES.map((c, i) => (
                <span key={c} className="whitespace-nowrap">
                  {i > 0 && <span aria-hidden="true" className="text-ink-soft/50"> · </span>}
                  <Link href="/courses" className="text-gold-deep underline-offset-4 hover:underline">
                    {c}
                  </Link>
                </span>
              ))}
            </p>
            <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5 sm:mt-7 sm:gap-3 xl:justify-start">
              <Link
                href={ENQUIRE_HREF}
                className="group flex items-center gap-2 whitespace-nowrap rounded-full bg-gold px-5 py-2.5 text-sm font-medium text-ink transition-colors duration-200 hover:bg-ink hover:text-cream sm:px-6 sm:py-3.5"
              >
                Let&apos;s Talk
                <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
              </Link>
              <Link
                href="/courses"
                className="whitespace-nowrap rounded-full border border-ink/15 bg-white px-5 py-2.5 text-sm font-medium text-ink transition-colors duration-200 hover:border-ink sm:px-6 sm:py-3.5"
              >
                Get Started
              </Link>
            </div>
          </div>

          <div
            {...rise(0.25)}
            className="rise mx-auto mt-6 w-full max-w-sm max-sm:text-center sm:mt-10 sm:max-w-2xl xl:mx-0"
          >
            <p>
              <Image
                src="/site/11-steps-wordmark.webp"
                alt="11 Steps to U Program"
                width={677}
                height={189}
                sizes="220px"
                className="h-11 w-auto max-sm:mx-auto sm:h-14"
              />
            </p>
            <ul className="mt-3 grid grid-cols-3 gap-2 sm:mt-6 sm:gap-6">
              {FACTS.map((f) => (
                <li
                  key={f.label}
                  className="flex flex-col items-center gap-1.5 rounded-2xl border border-line bg-white px-1.5 py-3 text-center sm:items-start sm:gap-3 sm:rounded-none sm:border-0 sm:bg-transparent sm:p-0 sm:text-left"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-cream-deep text-gold-deep sm:h-11 sm:w-11">
                    <f.icon
                      className="h-[18px] w-[18px] sm:h-5 sm:w-5"
                      strokeWidth={1.8}
                    />
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

        {/* portrait on the sun disc from the brochure cover */}
        <div
          {...rise(0.15)}
          className="rise relative order-last mx-auto aspect-[52/58] w-full max-w-[200px] overflow-hidden sm:max-w-[340px] xl:order-none xl:h-[min(calc(100svh-7.5rem),40vw,660px)] xl:w-auto xl:max-w-none xl:self-end xl:justify-self-end"
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
            className={
              isLocalImage(content.image)
                ? "absolute left-1/2 top-0 h-[165%] w-auto max-w-none -translate-x-1/2"
                : "absolute inset-0 m-auto h-[92%] w-[92%] object-contain drop-shadow-md z-10"
            }
          />
        </div>
      </div>
    </section>
  );
}
