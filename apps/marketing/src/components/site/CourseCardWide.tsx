import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { formatPrice, isOptimisable, type Course } from "@/lib/courses";

/** Landscape course card: photo left, details right. Used on the courses page. */
export default function CourseCardWide({ course }: { course: Course }) {
  return (
    <Link
      href={`/courses/${course.slug}`}
      aria-label={`${course.title}: view details`}
      className="group grid h-full overflow-hidden rounded-2xl border border-[#cbb797] bg-white shadow-[0_1px_2px_rgba(20,17,15,0.05),0_10px_24px_-18px_rgba(110,63,18,0.35)] transition-[box-shadow,transform] duration-300 sm:hover:shadow-[0_24px_48px_-28px_rgba(110,63,18,0.45)] active:scale-[0.985] sm:grid-cols-[42%_1fr]"
    >
      <span className="relative block min-h-48 overflow-hidden border-b border-line bg-sand sm:min-h-full sm:border-b-0 sm:border-r">
        {course.image && (
          <Image
            src={course.image}
            alt={course.alt || course.title || "Course"}
            fill
            quality={80}
            loading="lazy"
            unoptimized={!isOptimisable(course.image)}
            sizes="(max-width: 640px) 100vw, 280px"
            className="object-cover transition-transform duration-500 ease-out group-hover:scale-[1.04]"
          />
        )}
      </span>

      <span className="flex flex-col p-6">
        <span className="block text-xl font-bold leading-snug tracking-tight">
          {course.title}
        </span>
        {(course.category || course.duration) && (
          <span className="mt-1.5 block text-sm text-ink-soft">
            {[course.category, course.duration].filter(Boolean).join(" · ")}
          </span>
        )}
        <span className="mt-2 block flex-1">
          <span className="line-clamp-2 text-sm leading-relaxed text-ink-soft">
            {course.body}
          </span>
        </span>
        <span className="mt-4 flex items-center justify-between gap-3 border-t border-line pt-4">
          <span className="text-lg font-bold tracking-tight">
            {typeof course.price === "number" && !isNaN(course.price) && course.price > 0
              ? formatPrice(course.price)
              : ""}
          </span>
          <span className="flex items-center gap-1.5 rounded-xl bg-[linear-gradient(180deg,#d98a2b_0%,#c97a1e_100%)] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_6px_16px_-8px_rgba(201,122,30,0.7),inset_0_1px_0_rgba(255,255,255,0.2)] transition-[transform,box-shadow] duration-150 group-hover:-translate-y-px motion-reduce:transition-none">
            View Details
            <ArrowRight className="h-4 w-4 transition-transform duration-150 group-hover:translate-x-0.5" strokeWidth={2} />
          </span>
        </span>
      </span>
    </Link>
  );
}
