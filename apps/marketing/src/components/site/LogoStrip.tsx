import Image from "next/image";
import { ORGANISATIONS, STAGES } from "@/lib/content";

const BRANDS = [...ORGANISATIONS, ...STAGES];

function Row({ hidden = false }: { hidden?: boolean }) {
  return (
    <ul aria-hidden={hidden} className="flex shrink-0 items-center gap-2.5 pr-2.5 sm:gap-4 sm:pr-4">
      {BRANDS.map((b) => (
        <li
          key={b.file}
          className="flex h-10 w-24 shrink-0 items-center justify-center rounded-lg bg-white p-1.5 sm:h-16 sm:w-40 sm:rounded-xl sm:p-3"
        >
          <Image
            src={`/logos/${b.file}.png`}
            alt={hidden ? "" : b.name}
            width={200}
            height={80}
            className="max-h-full w-auto max-w-full object-contain"
          />
        </li>
      ))}
    </ul>
  );
}

/** Scrolling logo marquee that sits directly under the hero. */
export default function LogoStrip() {
  return (
    <section className="border-b border-line bg-white py-5 sm:py-12 md:py-16">
      {/* phones: a slim strip, small caption and small logos */}
      <p className="eyebrow mb-3 px-5 text-center text-ink-soft max-sm:text-[10px] max-sm:tracking-[0.14em] sm:mb-7">
        Organisations that have made room for this conversation
      </p>
      <div className="marquee overflow-hidden">
        <div className="marquee-track flex w-max">
          <Row />
          <Row hidden />
        </div>
      </div>
    </section>
  );
}
