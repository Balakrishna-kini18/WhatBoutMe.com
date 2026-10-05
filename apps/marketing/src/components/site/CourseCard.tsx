import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { isOptimisable, type Course } from "@/lib/courses";

/**
 * Course card used on the landing page and the courses page. Phones have no
 * hover, so there the gold button is the resting state (no shadow) and pressing the card gives a small press-in.
 */
export default function CourseCard({ course }: { course: Course }) {
  return (
    <Link
      href={`/courses/${course.slug}`}
      aria-label={`${course.title}: view details`}
      className="group flex h-full w-full flex-col overflow-hidden rounded-3xl border border-line bg-white text-left transition-[box-shadow,transform] duration-300 sm:hover:shadow-[0_24px_48px_-28px_rgba(20,17,15,0.4)] active:scale-[0.985]"
    >
      <span className="relative block aspect-[4/3] overflow-hidden">
        <Image
          src={course.image}
          alt={course.alt}
          fill
          unoptimized={!isOptimisable(course.image)}
          sizes="(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 360px"
          className="object-cover transition-transform duration-500 ease-out group-hover:scale-[1.04]"
        />
        <span className="absolute left-4 top-4 rounded-full bg-white px-3 py-1 text-xs font-semibold text-ink">
          {course.duration}
        </span>
      </span>

      <span className="flex flex-1 flex-col p-5">
        <span className="block text-lg font-bold leading-snug tracking-tight">
          {course.title}
        </span>
        {course.meta && (
          <span className="mt-1.5 block truncate text-xs font-medium uppercase tracking-[0.08em] text-gold-deep">
            {course.meta}
          </span>
        )}
        {/* wrapper takes the spare height so the clamp stays at two lines */}
        <span className="mt-2 block flex-1">
          <span className="line-clamp-2 text-sm leading-relaxed text-ink-soft">
            {course.body}
          </span>
        </span>
        <span className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-cream-deep py-3 text-sm font-medium text-ink transition-colors duration-200 group-hover:bg-gold max-sm:bg-gold">
          View Details
          <ArrowUpRight className="h-4 w-4" strokeWidth={1.8} />
        </span>
      </span>
    </Link>
  );
}
