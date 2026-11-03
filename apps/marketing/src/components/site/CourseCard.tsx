import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { isOptimisable, type Course } from "@/lib/courses";
import { stripFormatting } from "./FormattedText";

/**
 * Course card used on the landing page and the course pages, in the same style
 * as the learner portal's course cards: a darker outline, the picture on top
 * with a line under it, the details, then the button in its own footer.
 * Pressing the card gives a small press-in on phones.
 */
export default function CourseCard({ course }: { course: Course }) {
  return (
    <Link
      href={`/courses/${course.slug}`}
      aria-label={`${course.title}: view details`}
      className="group flex h-full w-full flex-col overflow-hidden rounded-2xl border border-[#cbb797] bg-white text-left shadow-[0_1px_2px_rgba(20,17,15,0.05),0_10px_24px_-18px_rgba(110,63,18,0.35)] transition-[box-shadow,transform] duration-300 sm:hover:shadow-[0_24px_48px_-28px_rgba(110,63,18,0.45)] active:scale-[0.985]"
    >
      <span className="relative block aspect-[16/10] overflow-hidden border-b border-line bg-gradient-to-br from-[#fcf9f2] via-[#f7f1e4] to-[#ebe1ce]">
        {course.image ? (
          <Image
            src={course.image}
            alt={course.alt || course.title || "Course"}
            fill
            quality={80}
            loading="lazy"
            unoptimized={!isOptimisable(course.image)}
            sizes="(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 360px"
            className="object-cover transition-transform duration-500 ease-out group-hover:scale-[1.04]"
          />
        ) : (
          <span className="flex h-full w-full flex-col items-center justify-center p-4 text-center select-none">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#c97a1e]/15 text-xl font-bold text-[#c97a1e] ring-1 ring-[#c97a1e]/25">
              {course.title.trim().charAt(0).toUpperCase()}
            </span>
            <span className="mt-2 text-xs font-semibold uppercase tracking-wider text-[#8c6538]">
              {course.category || "WhatBoutMe"}
            </span>
          </span>
        )}
      </span>

      <span className="flex flex-1 flex-col px-4 pt-4">
        <span className="block text-lg font-bold leading-snug tracking-tight">
          {course.title}
        </span>
        {(course.duration || course.meta) && (
          <span className="mt-1 block truncate text-sm text-ink-soft">
            {[course.duration, course.meta].filter(Boolean).join(" · ")}
          </span>
        )}
        {/* wrapper takes the spare height so the clamp stays at two lines */}
        <span className="mt-2 block flex-1">
          <span className="line-clamp-2 text-sm leading-relaxed text-ink-soft">
            {stripFormatting(course.body)}
          </span>
        </span>
      </span>

      {/* the action, in its own footer */}
      <span className="mx-4 mb-4 mt-4 block border-t border-line pt-3">
        <span className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-[linear-gradient(180deg,#d98a2b_0%,#c97a1e_100%)] py-2.5 text-sm font-semibold text-white shadow-[0_6px_16px_-8px_rgba(201,122,30,0.7),inset_0_1px_0_rgba(255,255,255,0.2)] transition-[transform,box-shadow] duration-150 group-hover:-translate-y-px group-hover:shadow-[0_10px_22px_-10px_rgba(201,122,30,0.8),inset_0_1px_0_rgba(255,255,255,0.2)] motion-reduce:transition-none">
          View Details
          <ArrowRight className="h-4 w-4 transition-transform duration-150 group-hover:translate-x-0.5" strokeWidth={2} />
        </span>
      </span>
    </Link>
  );
}
