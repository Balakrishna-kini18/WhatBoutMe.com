"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { ArrowRight } from "lucide-react";
import useEmblaCarousel from "embla-carousel-react";
import SectionHeading from "./SectionHeading";
import Reveal from "./Reveal";
import { scrollToTarget } from "@/lib/scroll";
import {
  CERTIFICATION,
  ENQUIRE_HREF,
  PROGRAMME_FACTS,
  STEP_LABELS,
} from "@/lib/content";

const STEPS = Array.from({ length: 11 }, (_, i) => i + 1);

/** Straight 11-step track; fits 100% width on all screens with zero slide. */
function StepsTrack() {
  return (
    <div className="w-full">
      {/* 11 steps in one continuous view, 100% width, NO slide */}
      <ol
        aria-label="Eleven steps, from Truth through Baseline, Daily Life and Brain Health to a Renewed You"
        className="relative flex w-full items-center justify-between pb-3 md:pb-9"
      >
        <span
          aria-hidden
          className="absolute left-[3%] right-[3%] top-1/2 -translate-y-1/2 md:top-[1.375rem] md:translate-y-0 h-px bg-gold-deep/30"
        />
        {STEPS.map((n) => {
          const label = STEP_LABELS[n];
          return (
            <li key={n} className="relative flex flex-col items-center">
              <span
                className={`relative flex items-center justify-center rounded-full text-xs sm:text-sm font-semibold tabular-nums ${
                  label
                    ? "h-8 w-8 sm:h-9 sm:w-9 md:h-11 md:w-11 bg-gold text-ink shadow-sm"
                    : "h-6 w-6 sm:h-7 sm:w-7 md:h-8 md:w-8 border border-gold-deep/30 bg-white text-ink-soft"
                }`}
              >
                {n}
              </span>
              {label && (
                <span className="absolute top-full mt-3 hidden whitespace-nowrap text-sm font-medium text-ink md:block">
                  {label}
                </span>
              )}
            </li>
          );
        })}
      </ol>

      {/* Mobile: 5 milestone labels visible in one glance with no sliding */}
      <div className="mt-1 grid grid-cols-5 gap-1 text-center md:hidden">
        {[1, 3, 5, 7, 11].map((stepNum) => (
          <div key={stepNum} className="flex flex-col items-center">
            <span className="text-[10px] font-semibold text-gold-deep">
              Step {stepNum}
            </span>
            <span className="text-[11px] font-medium leading-tight text-ink">
              {STEP_LABELS[stepNum]}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Curriculum() {
  return (
    <section id="curriculum" className="bg-sand/60 py-10 sm:py-16 md:py-24">
      <div className="mx-auto max-w-[1240px] px-5 md:px-10">
        {/* course banner: centered on mobile, side-by-side on desktop */}
        <Reveal>
          <div className="relative overflow-hidden rounded-[2rem] bg-[linear-gradient(120deg,#fbeed2,#f8d99b_55%,#fbeed2)] p-6 text-center sm:p-8 md:grid md:grid-cols-[0.8fr_1.2fr] md:items-center md:p-0 md:text-left">
            {/* Mobile: Centered portrait medallion */}
            <div className="relative mx-auto mb-5 h-24 w-24 overflow-hidden rounded-full border-2 border-white/80 bg-[linear-gradient(160deg,#f8cf86,#efa944)] shadow-[0_8px_20px_-6px_rgba(169,103,15,0.4)] sm:h-28 sm:w-28 md:hidden">
              <Image
                src="/brand/roweena.png"
                alt="Roweena Britto"
                width={200}
                height={200}
                sizes="96px"
                quality={80}
                loading="lazy"
                className="absolute left-1/2 top-1 h-[175%] w-auto max-w-none -translate-x-1/2 object-cover"
              />
            </div>

            {/* Desktop: Full portrait on the left */}
            <div className="relative hidden h-full min-h-[420px] overflow-hidden md:block">
              <Image
                src="/brand/roweena.png"
                alt="Roweena Britto"
                width={623}
                height={1289}
                quality={80}
                loading="lazy"
                sizes="(max-width: 768px) 60vw, 360px"
                className="absolute left-1/2 top-6 h-[170%] w-auto max-w-none -translate-x-1/2 md:top-10"
              />
            </div>

            {/* Content: Centered on mobile, left-aligned on desktop */}
            <div className="md:py-16 md:pl-4 md:pr-14">
              <h2 className="mx-auto max-w-2xl text-balance text-2xl font-bold leading-[1.1] tracking-tight sm:text-3xl md:mx-0 md:text-5xl">
                11 Steps to U Program
              </h2>

              <p className="mx-auto mt-4 max-w-xl text-balance leading-relaxed text-ink-soft sm:text-base md:mx-0 md:text-lg">
                Get Certified for working on yourself and earn 25 CPD Hours
                (UK). You will leave this program feeling liberated from your
                old thoughts, with a rewired brain for action, embracing the
                self you are meant to be.
              </p>

              <div className="mt-7 flex flex-wrap items-center justify-center gap-3 md:justify-start">
                <a
                  href={ENQUIRE_HREF}
                  className="group flex items-center gap-2 rounded-full bg-ink px-6 py-3.5 text-sm font-medium text-cream transition-colors duration-200 hover:bg-white hover:text-ink"
                >
                  Enquire about the course
                  <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
                </a>
                <button
                  onClick={() => scrollToTarget("#certification")}
                  className="rounded-full px-5 py-3.5 text-sm font-medium text-ink underline-offset-4 hover:underline"
                >
                  How certification works
                </button>
              </div>
            </div>
          </div>
        </Reveal>

        {/* the step track, then the three key facts */}
        <Reveal className="mt-8 sm:mt-12 md:mt-16">
          <div>
            <StepsTrack />

            <dl className="mt-8 grid grid-cols-3 divide-x divide-line border-t border-line pt-6 text-center">
              {PROGRAMME_FACTS.map((f) => (
                <div key={f.label} className="px-2 sm:px-4">
                  <dt className="eyebrow text-gold-deep">{f.label}</dt>
                  <dd className="mt-1 text-base font-bold tracking-tight sm:text-2xl md:text-3xl">
                    {f.value}
                  </dd>
                  <dd className="mt-0.5 text-xs text-ink-soft sm:text-sm">{f.body}</dd>
                </div>
              ))}
            </dl>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function CertificationMobileLoop() {
  const [emblaRef, emblaApi] = useEmblaCarousel({
    loop: true,
    align: "start",
    skipSnaps: false,
  });
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    if (!emblaApi) return;

    const onSelect = () => {
      setSelectedIndex(emblaApi.selectedScrollSnap());
    };

    emblaApi.on("select", onSelect);
    onSelect();

    let timer = setInterval(() => {
      emblaApi.scrollNext();
    }, 3200);

    const root = emblaApi.rootNode();
    const pause = () => clearInterval(timer);
    const resume = () => {
      clearInterval(timer);
      timer = setInterval(() => {
        emblaApi.scrollNext();
      }, 3200);
    };

    root.addEventListener("pointerdown", pause, { passive: true });
    root.addEventListener("pointerup", resume, { passive: true });
    root.addEventListener("pointerleave", resume, { passive: true });

    return () => {
      clearInterval(timer);
      emblaApi.off("select", onSelect);
      root.removeEventListener("pointerdown", pause);
      root.removeEventListener("pointerup", resume);
      root.removeEventListener("pointerleave", resume);
    };
  }, [emblaApi]);

  return (
    <div className="sm:hidden">
      <div ref={emblaRef} className="overflow-hidden -mx-5 px-5">
        <div className="flex gap-3.5">
          {CERTIFICATION.map((item, i) => (
            <div
              key={item}
              className="flex-[0_0_82%] rounded-3xl border border-line bg-white p-6 shadow-2xs"
            >
              <span className="block text-[1.75rem] font-bold tabular-nums tracking-tight text-gold">
                {String(i + 1).padStart(2, "0")}
              </span>
              <p className="mt-3 text-base font-medium leading-snug text-ink">
                {item}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Pagination indicators for the mobile loop */}
      <div className="mt-5 flex items-center justify-center gap-1.5">
        {CERTIFICATION.map((_, i) => (
          <button
            key={i}
            onClick={() => emblaApi?.scrollTo(i)}
            aria-label={`Go to slide ${i + 1}`}
            className={`h-1.5 rounded-full transition-all duration-300 ${
              selectedIndex === i ? "w-6 bg-gold" : "w-1.5 bg-line hover:bg-gold/50"
            }`}
          />
        ))}
      </div>
    </div>
  );
}

function Certification() {
  return (
    <section id="certification" className="bg-white py-10 sm:py-16 md:py-24">
      <div className="mx-auto max-w-[1240px] px-5 md:px-10">
        <SectionHeading
          center
          eyebrow="Certification"
          title="How Certification Works"
          intro={
            <>
              <strong className="font-semibold text-ink">
                The outcome.
              </strong>{" "}
              Upon achieving 80% passing marks on the exam and submitting your
              personal development growth plan, you will be awarded a
              CERTIFICATION OF COMPLETION.
            </>
          }
        />

        {/* Mobile: Smooth auto-sliding loop carousel */}
        <Reveal>
          <CertificationMobileLoop />
        </Reveal>

        {/* Desktop Web: Ruled grid unchanged */}
        <Reveal className="hidden sm:block">
          <ol className="grid sm:grid-cols-2 sm:overflow-hidden sm:rounded-3xl sm:border sm:border-line lg:grid-cols-3">
            {CERTIFICATION.map((item, i) => (
              <li
                key={item}
                className="border-line p-7 sm:-ml-px sm:-mt-px sm:border-l sm:border-t md:p-9"
              >
                <span className="block text-[1.75rem] font-bold sm:text-4xl tabular-nums tracking-tight text-gold md:text-5xl">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="mt-4 block text-lg leading-snug">{item}</span>
              </li>
            ))}
          </ol>
        </Reveal>
      </div>
    </section>
  );
}

export default function Programme() {
  return (
    <>
      <Curriculum />
      <Certification />
    </>
  );
}
