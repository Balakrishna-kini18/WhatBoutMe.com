import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import Reveal from "./Reveal";
import { isLocalImage } from "@/lib/siteContent";

const FACTS = [
  { value: "18", label: "Yrs corporate" },
  { value: "02", label: "Countries licensed" },
  { value: "25", label: "CPD hours" },
];

/** Short facilitator intro for the landing page; the full story lives on /about. */
export default function AboutTeaser({ image }: { image: string }) {
  return (
    <section id="facilitator" className="px-5 sm:px-4 py-16 md:px-8 md:py-24">
      <Reveal className="mx-auto grid max-w-[1240px] overflow-hidden rounded-[2rem] bg-ink text-cream lg:grid-cols-[1.2fr_0.8fr]">
        <div className="p-8 md:p-14">
          <h2 className="text-2xl font-bold sm:text-3xl tracking-tight md:text-5xl">
            Roweena Britto
          </h2>
          <p className="mt-5 max-w-xl leading-relaxed text-cream/70 md:text-lg">
            Brain Health Coach, licensed in the UAE and India, after eighteen
            years in the corporate world running projects for multinationals
            like PepsiCo and DHL.
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
            About Roweena
            <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
          </Link>
        </div>

        {/* portrait on the sun disc, flush with the panel bottom */}
        <div className="relative mx-auto aspect-[52/50] w-full max-w-[420px] self-end overflow-hidden">
          <span className="absolute inset-x-[6%] top-[14%] aspect-square rounded-full bg-[linear-gradient(160deg,#f8cf86,#efa944)]" />
          <Image
            src={image}
            unoptimized={!isLocalImage(image)}
            alt="Roweena Britto, Brain Health Coach"
            width={623}
            height={1289}
            sizes="(max-width: 1024px) 80vw, 420px"
            className="absolute left-1/2 top-[4%] h-[190%] w-auto max-w-none -translate-x-1/2"
          />
        </div>
      </Reveal>
    </section>
  );
}
