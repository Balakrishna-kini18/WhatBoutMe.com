import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { formatPrice, isOptimisable, type Course } from "@/lib/courses";

/** Landscape course card: photo left, details right. Used on the courses page. */
export default function CourseCardWide({ course }: { course: Course }) {
  return (
    <Link
      href={`/courses/${course.slug}`}
      aria-label={`${course.title}: view details`}
      className="group grid h-full overflow-hidden rounded-3xl border border-line bg-white transition-[box-shadow,transform] duration-300 sm:hover:shadow-[0_24px_48px_-28px_rgba(20,17,15,0.4)] active:scale-[0.985] sm:grid-cols-[42%_1fr]"
    >
      <span className="relative block min-h-48 overflow-hidden sm:min-h-full">
        <Image
          src={course.image}
          alt={course.alt}
          fill
          unoptimized={!isOptimisable(course.image)}
          sizes="(max-width: 640px) 100vw, 280px"
          className="object-cover transition-transform duration-500 ease-out group-hover:scale-[1.04]"
        />
        <span className="absolute left-4 top-4 rounded-full bg-white px-3 py-1 text-xs font-semibold text-ink">
          {course.duration}
        </span>
      </span>

      <span className="flex flex-col p-6">
        <span className="text-xs font-medium uppercase tracking-[0.08em] text-gold-deep">
          {course.category}
        </span>
        <span className="mt-1.5 block text-xl font-bold leading-snug tracking-tight">
          {course.title}
        </span>
        <span className="mt-2 block flex-1">
          <span className="line-clamp-2 text-sm leading-relaxed text-ink-soft">
            {course.body}
          </span>
        </span>
        <span className="mt-5 flex items-center justify-between gap-3">
          <span className="text-lg font-bold tracking-tight">
            {course.price ? formatPrice(course.price) : ""}
          </span>
          <span className="flex items-center gap-2 rounded-full bg-cream-deep px-5 py-2.5 text-sm font-medium text-ink transition-colors duration-200 group-hover:bg-gold max-sm:bg-gold">
            View Details
            <ArrowUpRight className="h-4 w-4" strokeWidth={1.8} />
          </span>
        </span>
      </span>
    </Link>
  );
}
