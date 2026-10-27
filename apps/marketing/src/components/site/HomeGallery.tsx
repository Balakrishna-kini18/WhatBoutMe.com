"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ChevronLeft, ChevronRight, X } from "lucide-react";
import SectionHeading from "./SectionHeading";
import { GALLERY_PHOTOS, type GalleryCategory } from "@/lib/galleryPhotos";

const TABS: { key: "all" | GalleryCategory; label: string }[] = [
  { key: "all", label: "All" },
  { key: "events", label: "Events" },
  { key: "kit", label: "Vision Board Kit" },
  { key: "roweena", label: "Roweena" },
];

// "All" opens on a mix: one photo from each group in turn
const MIXED = (() => {
  const byCat = (["events", "kit", "roweena"] as const).map((c) => GALLERY_PHOTOS.filter((p) => p.category === c));
  const out = [];
  for (let i = 0; out.length < GALLERY_PHOTOS.length; i++) {
    for (const list of byCat) if (list[i]) out.push(list[i]);
  }
  return out;
})();

// the home page shows a few; the gallery page shows them all
const HOME_COUNT = 8;
// already shown in other home sections (AboutTeaser, Programme), so not repeated here
const HOME_SKIP = new Set(["/site/gallery/roweena-01.webp", "/site/gallery/roweena-03.webp"]);

/**
 * Events, the Vision Board Kit and Roweena, in a masonry grid with a simple viewer.
 * "home": a short mix and a link to the gallery page. "full": every photo, with tabs.
 */
export default function HomeGallery({ variant = "home" }: { variant?: "home" | "full" }) {
  const full = variant === "full";
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("all");
  const [open, setOpen] = useState<number | null>(null);

  const photos = useMemo(
    () => (tab === "all" ? MIXED : GALLERY_PHOTOS.filter((p) => p.category === tab)),
    [tab],
  );
  const shown = full ? photos : MIXED.filter((p) => !HOME_SKIP.has(p.src)).slice(0, HOME_COUNT);

  // viewer keys: Escape closes, arrows move
  useEffect(() => {
    if (open === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(null);
      if (e.key === "ArrowRight") setOpen((i) => (i === null ? i : (i + 1) % shown.length));
      if (e.key === "ArrowLeft") setOpen((i) => (i === null ? i : (i - 1 + shown.length) % shown.length));
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, shown.length]);

  const current = open === null ? null : shown[open];

  return (
    <section id={full ? "moments" : "gallery"} className={full ? "pb-6 pt-2 sm:pb-10" : "py-12 sm:py-16 md:py-24"}>
      <div className="mx-auto max-w-[1240px] px-5 md:px-10">
        <SectionHeading
          center
          title="Moments From whatboutme"
          intro="Talks and events, the Vision Board Kit, and Roweena at work."
        />

        {full && (
        <div role="tablist" aria-label="Gallery" className="mx-auto -mt-2 mb-8 flex w-fit max-w-full gap-1 overflow-x-auto rounded-full bg-sand p-1 sm:mb-10">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => setTab(t.key)}
              className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium transition-colors duration-200 ${
                tab === t.key ? "bg-white text-ink shadow-[0_1px_3px_rgba(20,17,15,0.12)]" : "text-ink-soft hover:text-ink"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        )}

        {/* justified rows: every row the same height and full width, each photo
            as wide as its own shape needs, so rows end level and nothing is cropped */}
        <ul className="flex flex-wrap gap-3 [--row-h:130px] sm:gap-4 sm:[--row-h:190px] lg:[--row-h:230px]">
          {shown.map((p, i) => {
            const ratio = p.width / p.height;
            return (
              <li
                key={p.src}
                style={{
                  flexGrow: ratio,
                  flexBasis: `calc(${ratio} * var(--row-h))`,
                  // a short last row still fills the width, but a lone photo stays sensible
                  maxWidth: `calc(${ratio} * var(--row-h) * 2)`,
                }}
              >
                <button
                  type="button"
                  onClick={() => setOpen(i)}
                  aria-label={`Open photo: ${p.alt}`}
                  style={{ aspectRatio: `${p.width} / ${p.height}` }}
                  className="group relative block w-full overflow-hidden rounded-2xl border border-[#cbb797] bg-sand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-deep"
                >
                  <Image
                    src={p.src}
                    alt={p.alt}
                    fill
                    loading="lazy"
                    sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 400px"
                    className="object-cover transition-transform duration-500 ease-out group-hover:scale-[1.03] motion-reduce:transition-none"
                  />
                </button>
              </li>
            );
          })}
        </ul>

        {!full && (
          <div className="mt-6 text-center sm:mt-8">
            <Link
              href="/gallery#moments"
              className="group inline-flex items-center gap-2 rounded-full bg-ink px-6 py-3 text-sm font-medium text-cream transition-colors duration-200 hover:bg-gold hover:text-ink"
            >
              View Full Gallery
              <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
            </Link>
          </div>
        )}
      </div>

      {current && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={current.alt}
          onClick={() => setOpen(null)}
          className="fixed inset-0 z-[200] flex items-center justify-center bg-ink/85 p-4 sm:p-10"
        >
          <Image
            src={current.src}
            alt={current.alt}
            width={current.width}
            height={current.height}
            sizes="90vw"
            onClick={(e) => e.stopPropagation()}
            className="h-auto max-h-[85vh] w-[min(92vw,1100px)] rounded-xl object-contain"
          />
          <button
            type="button"
            onClick={() => setOpen(null)}
            aria-label="Close"
            className="absolute right-4 top-4 flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-white transition-colors hover:bg-white/25"
          >
            <X className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setOpen((i) => (i === null ? i : (i - 1 + shown.length) % shown.length));
            }}
            aria-label="Previous photo"
            className="absolute left-3 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 text-white transition-colors hover:bg-white/25 sm:left-6"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setOpen((i) => (i === null ? i : (i + 1) % shown.length));
            }}
            aria-label="Next photo"
            className="absolute right-3 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 text-white transition-colors hover:bg-white/25 sm:right-6"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      )}
    </section>
  );
}
