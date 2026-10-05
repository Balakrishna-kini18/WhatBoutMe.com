import type { ReactNode } from "react";
import Reveal from "./Reveal";

type SectionHeadingProps = {
  eyebrow?: string;
  title: ReactNode;
  intro?: ReactNode;
  center?: boolean;
};

export default function SectionHeading({
  title,
  intro,
  center = false,
}: SectionHeadingProps) {
  return (
    <Reveal
      className={`mb-6 sm:mb-12 md:mb-14 ${center ? "mx-auto max-w-2xl text-center" : ""}`}
    >
      <h2 className="max-w-3xl text-balance text-2xl font-bold leading-[1.12] tracking-tight text-ink sm:text-3xl md:text-[2.75rem]">
        {title}
      </h2>
      {intro && (
        <p
          className={`mt-3 max-w-2xl text-sm leading-relaxed text-ink-soft sm:mt-5 sm:text-base md:text-lg ${center ? "mx-auto" : ""}`}
        >
          {intro}
        </p>
      )}
    </Reveal>
  );
}
