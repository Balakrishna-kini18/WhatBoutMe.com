"use client";

import React, { useEffect, useState, useMemo, useCallback } from "react";
import {
  getPublicGallery,
  type PublicGalleryItem,
} from "@/lib/api";
import {
  X,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Calendar,
  Sparkles,
} from "lucide-react";

const BRAND_FALLBACK_IMG =
  "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='800' height='600' viewBox='0 0 800 600' fill='%23faf7f2'><rect width='800' height='600' fill='%23f5efe6'/><circle cx='400' cy='280' r='48' fill='%23d4a359' opacity='0.25'/><text x='50%25' y='52%25' dominant-baseline='middle' text-anchor='middle' font-family='sans-serif' font-size='20' font-weight='700' fill='%231f2421'>WhatBoutMe</text><text x='50%25' y='58%25' dominant-baseline='middle' text-anchor='middle' font-family='sans-serif' font-size='14' fill='%23707571'>Photo Preview Unavailable</text></svg>";

export default function GalleryClient() {
  const [items, setItems] = useState<PublicGalleryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState<string>("ALL");
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  // Fetch published gallery items
  useEffect(() => {
    let isMounted = true;
    (async () => {
      setIsLoading(true);
      try {
        const data = await getPublicGallery();
        if (isMounted) {
          setItems(data.items || []);
        }
      } catch (err) {
        console.warn("Failed to load gallery:", err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    })();
    return () => {
      isMounted = false;
    };
  }, []);

  // Filter items by active category
  const filteredItems = useMemo(() => {
    if (activeCategory === "ALL") return items;
    return items.filter(
      (item) =>
        item.category &&
        item.category.toLowerCase() === activeCategory.toLowerCase()
    );
  }, [items, activeCategory]);

  // Extract distinct categories
  const categories = useMemo(() => {
    const set = new Set<string>();
    items.forEach((item) => {
      if (item.category) set.add(item.category);
    });
    return Array.from(set);
  }, [items]);

  // Lightbox navigation handlers
  const openLightbox = (index: number) => {
    setLightboxIndex(index);
  };

  const closeLightbox = useCallback(() => {
    setLightboxIndex(null);
  }, []);

  const showPrev = useCallback(() => {
    if (lightboxIndex === null || filteredItems.length === 0) return;
    setLightboxIndex((prev) =>
      prev === 0 ? filteredItems.length - 1 : (prev ?? 0) - 1
    );
  }, [lightboxIndex, filteredItems.length]);

  const showNext = useCallback(() => {
    if (lightboxIndex === null || filteredItems.length === 0) return;
    setLightboxIndex((prev) =>
      prev === filteredItems.length - 1 ? 0 : (prev ?? 0) + 1
    );
  }, [lightboxIndex, filteredItems.length]);

  // Keyboard navigation for Lightbox
  useEffect(() => {
    if (lightboxIndex === null) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        closeLightbox();
      } else if (e.key === "ArrowLeft") {
        showPrev();
      } else if (e.key === "ArrowRight") {
        showNext();
      }
    };

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [lightboxIndex, closeLightbox, showPrev, showNext]);

  const currentPhoto =
    lightboxIndex !== null ? filteredItems[lightboxIndex] : null;

  return (
    <section className="mx-auto max-w-[1240px] px-5 py-8 md:px-10 md:py-12">
      {/* Category Filter Bar */}
      {categories.length > 0 && (
        <div className="mb-10 flex flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => setActiveCategory("ALL")}
            className={`rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-wider transition-all duration-200 ${
              activeCategory === "ALL"
                ? "bg-ink text-cream shadow-sm"
                : "border border-ink/10 bg-white/70 text-ink-soft hover:bg-white hover:text-ink"
            }`}
          >
            All Moments ({items.length})
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setActiveCategory(cat)}
              className={`rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-wider transition-all duration-200 ${
                activeCategory.toLowerCase() === cat.toLowerCase()
                  ? "bg-ink text-cream shadow-sm"
                  : "border border-ink/10 bg-white/70 text-ink-soft hover:bg-white hover:text-ink"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      )}

      {/* Loading Skeletons */}
      {isLoading ? (
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <div
              key={n}
              className="animate-pulse rounded-2xl border border-ink/5 bg-white/40 p-4 shadow-sm"
            >
              <div className="aspect-[4/3] w-full rounded-xl bg-ink/10" />
              <div className="mt-4 h-5 w-3/4 rounded bg-ink/10" />
              <div className="mt-2 h-4 w-full rounded bg-ink/5" />
              <div className="mt-1 h-4 w-2/3 rounded bg-ink/5" />
            </div>
          ))}
        </div>
      ) : filteredItems.length === 0 ? (
        /* Empty State */
        <div className="rounded-3xl border border-dashed border-ink/15 bg-white/50 px-6 py-20 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gold/15 text-gold-deep">
            <Sparkles className="h-7 w-7" />
          </div>
          <h2 className="text-xl font-bold text-ink sm:text-2xl">
            {activeCategory === "ALL"
              ? "Gallery Photos Coming Soon"
              : `No photos currently under "${activeCategory}"`}
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-ink-soft">
            {activeCategory === "ALL"
              ? "Check back soon as we update this section with moments from international research symposiums and leadership cohorts."
              : "Try switching to another category or viewing all moments."}
          </p>
          {activeCategory !== "ALL" && (
            <button
              type="button"
              onClick={() => setActiveCategory("ALL")}
              className="mt-6 inline-flex rounded-full bg-ink px-5 py-2.5 text-xs font-semibold uppercase tracking-wider text-cream transition-colors hover:bg-ink-soft"
            >
              Show All Moments
            </button>
          )}
        </div>
      ) : (
        /* Photo Grid with Zero CLS (aspect-ratio: 4/3) */
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {filteredItems.map((item, index) => (
            <article
              key={item.id}
              onClick={() => openLightbox(index)}
              className="group cursor-pointer overflow-hidden rounded-2xl border border-ink/10 bg-white shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-gold/50 hover:shadow-xl"
            >
              {/* Photo Container: aspect-ratio: 4 / 3 guarantees ZERO CLS */}
              <div className="relative aspect-[4/3] w-full overflow-hidden bg-cream-soft">
                <img
                  src={item.imageUrl}
                  alt={item.altText || item.title}
                  loading="lazy"
                  className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).src = BRAND_FALLBACK_IMG;
                  }}
                />

                {/* Subtle Hover Overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-ink/60 via-ink/10 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />

                {/* Category Pill */}
                {item.category && (
                  <div className="absolute left-3 top-3">
                    <span className="rounded-full bg-cream/95 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-ink shadow-sm backdrop-blur-sm">
                      {item.category}
                    </span>
                  </div>
                )}

                {/* Expand Indicator on Hover */}
                <div className="absolute bottom-3 right-3 flex h-9 w-9 items-center justify-center rounded-full bg-cream/95 text-ink opacity-0 shadow-md backdrop-blur-sm transition-all duration-300 group-hover:opacity-100 group-hover:scale-100 scale-90">
                  <Maximize2 className="h-4 w-4" />
                </div>
              </div>

              {/* Card Caption Area */}
              <div className="flex flex-col p-5">
                <h3 className="line-clamp-2 text-base font-bold leading-snug text-ink transition-colors group-hover:text-gold-deep">
                  {item.title}
                </h3>

                {item.description ? (
                  <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-ink-soft">
                    {item.description}
                  </p>
                ) : (
                  <p className="mt-2 text-xs italic text-ink-soft/70">
                    Course &amp; conference moment.
                  </p>
                )}
              </div>
            </article>
          ))}
        </div>
      )}

      {/* FULLSCREEN LIGHTBOX MODAL */}
      {currentPhoto && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={currentPhoto.title}
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/90 p-3 backdrop-blur-md sm:p-6 md:p-10 animate-in fade-in duration-200"
          onClick={closeLightbox}
        >
          {/* Main Lightbox Card */}
          <div
            className="relative flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-ink-light border border-cream/15 text-cream shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Top Toolbar */}
            <div className="flex items-center justify-between border-b border-cream/10 px-5 py-3.5 bg-ink/40">
              <div className="flex items-center gap-3">
                {currentPhoto.category && (
                  <span className="rounded-full border border-gold/40 bg-gold/15 px-3 py-0.5 text-xs font-semibold uppercase tracking-wider text-gold">
                    {currentPhoto.category}
                  </span>
                )}
                <span className="text-xs text-cream/60">
                  Photo {(lightboxIndex ?? 0) + 1} of {filteredItems.length}
                </span>
              </div>

              <button
                type="button"
                onClick={closeLightbox}
                className="rounded-full p-1.5 text-cream/70 hover:bg-cream/10 hover:text-cream transition-colors"
                title="Close lightbox (Escape)"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Photo Container: object-fit: contain shows the uncropped full photo */}
            <div className="relative flex flex-1 items-center justify-center bg-black/60 p-2 sm:p-4 min-h-[340px] max-h-[64vh]">
              <img
                src={currentPhoto.imageUrl}
                alt={currentPhoto.altText || currentPhoto.title}
                className="max-h-[60vh] max-w-full rounded-lg object-contain shadow-2xl transition-all"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).src = BRAND_FALLBACK_IMG;
                }}
              />

              {/* Prev Button */}
              {filteredItems.length > 1 && (
                <button
                  type="button"
                  onClick={showPrev}
                  className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-ink/80 p-2.5 text-cream backdrop-blur-sm transition-all hover:bg-gold hover:text-ink hover:scale-105"
                  title="Previous photo (Left Arrow)"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
              )}

              {/* Next Button */}
              {filteredItems.length > 1 && (
                <button
                  type="button"
                  onClick={showNext}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-ink/80 p-2.5 text-cream backdrop-blur-sm transition-all hover:bg-gold hover:text-ink hover:scale-105"
                  title="Next photo (Right Arrow)"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              )}
            </div>

            {/* Caption & Context Below Image */}
            <div className="border-t border-cream/10 bg-ink/80 px-6 py-4">
              <h2 className="text-lg font-bold text-cream sm:text-xl">
                {currentPhoto.title}
              </h2>
              {currentPhoto.description && (
                <p className="mt-1.5 text-sm leading-relaxed text-cream/80 sm:text-base">
                  {currentPhoto.description}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
