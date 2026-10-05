import { Quote } from "lucide-react";
import Reveal from "./Reveal";
import { LIVED_IT } from "@/lib/content";

/** Roweena's own story, in her words, from whatboutme.com. */
export default function LivedIt() {
  return (
    <section className="py-10 sm:py-16 md:py-24">
      <div className="mx-auto grid max-w-[1240px] gap-8 px-5 sm:gap-12 md:px-10 lg:grid-cols-2 lg:gap-20">
        <Reveal className="text-center lg:text-left">
          <Quote
            aria-hidden
            className="mx-auto h-8 w-8 fill-gold text-gold sm:h-9 sm:w-9 lg:mx-0"
            strokeWidth={0}
          />
          <blockquote className="mx-auto mt-4 max-w-xl text-balance text-xl font-bold leading-snug tracking-tight sm:text-2xl md:text-[2rem] lg:mx-0 lg:max-w-none">
            {LIVED_IT.quote}
          </blockquote>
          <p className="mt-4 font-semibold text-ink sm:mt-5">Roweena Britto</p>
        </Reveal>

        <Reveal delay={0.08} className="text-center lg:text-left">
          <h2 className="mx-auto max-w-xl text-balance text-2xl font-bold leading-[1.12] tracking-tight sm:text-3xl md:text-[2.75rem] lg:mx-0 lg:max-w-none">
            {LIVED_IT.heading}
          </h2>
          <p className="mx-auto mt-4 max-w-xl leading-relaxed text-ink-soft sm:mt-6 sm:text-base md:text-lg lg:mx-0 lg:max-w-none">
            {LIVED_IT.questions}
          </p>
          <p className="mx-auto mt-3 max-w-xl leading-relaxed text-ink sm:mt-5 sm:text-base md:text-lg lg:mx-0 lg:max-w-none">
            {LIVED_IT.answer}
          </p>
        </Reveal>
      </div>
    </section>
  );
}
