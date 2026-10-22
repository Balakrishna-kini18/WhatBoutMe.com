import Link from "next/link";
import Image from "next/image";
import { ArrowRight } from "lucide-react";
import SectionHeading from "./SectionHeading";
import Reveal from "./Reveal";
import { getPublicGallery } from "@/lib/api";

const BRAND_FALLBACK_IMG =
  "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='800' height='600' viewBox='0 0 800 600' fill='%23faf7f2'><rect width='800' height='600' fill='%23f5efe6'/><circle cx='400' cy='280' r='48' fill='%23d4a359' opacity='0.25'/><text x='50%25' y='52%25' dominant-baseline='middle' text-anchor='middle' font-family='sans-serif' font-size='20' font-weight='700' fill='%231f2421'>WhatBoutMe</text><text x='50%25' y='58%25' dominant-baseline='middle' text-anchor='middle' font-family='sans-serif' font-size='14' fill='%23707571'>Photo Preview</text></svg>";

export default async function GalleryTeaser() {
  const { items } = await getPublicGallery();

  // If no published gallery photos exist yet, hide the section gracefully on the homepage
  if (!items || items.length === 0) {
    return null;
  }

  const showcaseItems = items.slice(0, 3);

  return (
    <section id="gallery-showcase" className="bg-sand/40 py-12 sm:py-16 md:py-24">
      <div className="mx-auto max-w-[1240px] px-5 md:px-10">
        <SectionHeading
          center
          title="Courses, Conferences & Global Moments"
        />

        <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {showcaseItems.map((item, index) => (
            <Reveal key={item.id} delay={index * 0.08} className="h-full">
              <Link
                href="/gallery"
                className="group flex h-full flex-col overflow-hidden rounded-2xl border border-line bg-white shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:border-gold/40"
              >
                {/* 4:3 Aspect Ratio for Zero CLS */}
                <div className="relative aspect-[4/3] w-full overflow-hidden bg-cream-soft">
                  <Image
                    src={item.imageUrl}
                    alt={item.altText || item.title}
                    fill
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                    className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
                    loading="lazy"
                    unoptimized={!item.imageUrl.startsWith("https://res.cloudinary.com") && !item.imageUrl.startsWith("/")}
                  />
                </div>

                <div className="flex flex-1 flex-col p-5">
                  <h3 className="line-clamp-2 text-base font-bold leading-snug text-ink transition-colors group-hover:text-gold-deep">
                    {item.title}
                  </h3>
                  {item.description && (
                    <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-ink-soft">
                      {item.description}
                    </p>
                  )}
                  <div className="mt-auto pt-4 flex items-center gap-1.5 text-xs font-semibold text-gold-deep">
                    <span>View full photo</span>
                    <ArrowRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-1" />
                  </div>
                </div>
              </Link>
            </Reveal>
          ))}
        </div>

        <div className="mt-10 text-center">
          <Link
            href="/gallery"
            className="group inline-flex items-center gap-2 rounded-full bg-ink px-6 py-3 text-sm font-medium text-cream transition-colors duration-200 hover:bg-gold hover:text-ink"
          >
            <span>Explore All Gallery Photos</span>
            <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
          </Link>
        </div>
      </div>
    </section>
  );
}
