import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import Reveal from "./Reveal";

const FACTS = [
  { value: "25", label: "CPD Hours" },
  { value: "12", label: "Classes" },
  { value: "11", label: "Steps to U" },
];

/** Short facilitator intro for the landing page; the full story lives on /about. */
export default function AboutTeaser() {
  return (
    <section id="facilitator" className="px-5 sm:px-4 py-16 md:px-8 md:py-24">
      <Reveal className="mx-auto grid max-w-[1240px] overflow-hidden rounded-[2rem] bg-ink text-cream lg:grid-cols-[1.2fr_0.8fr]">
        <div className="p-8 md:p-14">
          <h2 className="text-2xl font-bold sm:text-3xl tracking-tight md:text-5xl">
            Roweena Britto
          </h2>
          <p className="mt-5 max-w-xl leading-relaxed text-cream/70 md:text-lg">
            I have been where you are! Through my struggles with bipolar
            management, I found the path to becoming a Brain Health Coach,
            guiding others towards healing and fulfillment.
          </p>

          <dl className="mt-8 flex max-w-md divide-x divide-cream/15">
            {FACTS.map((f) => (
              <div
                key={f.label}
                className="flex flex-1 flex-col-reverse px-5 first:pl-0 last:pr-0"
              >
                <dt className="mt-1 text-xs text-cream/60 md:text-sm">
                  {f.label}
                </dt>
                <dd className="text-2xl font-bold sm:text-3xl tracking-tight tabular-nums text-gold md:text-4xl">
                  {f.value}
                </dd>
              </div>
            ))}
          </dl>

          <Link
            href="/about"
            className="group mt-9 inline-flex items-center gap-2 rounded-full bg-gold px-6 py-3.5 text-sm font-medium text-ink transition-colors duration-200 hover:bg-cream"
          >
            About Me
            <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
          </Link>
        </div>

        {/* her own photo, filling the panel's right side */}
        <div className="relative aspect-square w-full lg:aspect-auto">
          <Image
            src="/site/gallery/roweena-01.webp"
            alt="Roweena Britto on her motorbike"
            fill
            quality={80}
            loading="lazy"
            sizes="(max-width: 1024px) 100vw, 500px"
            className="object-cover object-[40%_center]"
          />
        </div>
      </Reveal>
    </section>
  );
}
