import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import EnrolLink from "./EnrolLink";
import { stripFormatting } from "./FormattedText";
import { formatPrice, isOptimisable, type Course } from "@/lib/courses";

/**
 * The first course at the top of the courses page: a plain white card in the
 * same family as the course cards below it. Phones: picture on top, then the
 * text. Desktop: text left, picture right.
 */
export default function FeaturedCourse({ course }: { course?: Course }) {
  if (!course || !course.slug) return null;
  const facts = [
    course.duration,
    course.meta,
    typeof course.price === "number" && !isNaN(course.price) && course.price > 0
      ? formatPrice(course.price)
      : "",
  ].filter(Boolean);

  return (
    <div className="grid overflow-hidden rounded-3xl border border-line bg-white lg:grid-cols-[1.1fr_1fr]">
      <div className="relative aspect-[16/10] bg-sand lg:order-2 lg:aspect-auto lg:min-h-[22rem]">
        {course.image && (
          <Image
            src={course.image}
            alt={course.alt || course.title || "Featured course"}
            fill
            priority
            quality={80}
            unoptimized={!isOptimisable(course.image)}
            sizes="(max-width: 1024px) 100vw, 560px"
            className="object-cover"
          />
        )}
      </div>

      <div className="flex flex-col justify-center p-6 sm:p-8 lg:p-12">
        <h2 className="text-2xl font-bold leading-[1.15] tracking-tight sm:text-3xl lg:text-4xl">
          {course.title}
        </h2>
        {facts.length > 0 && (
          <p className="mt-2 text-sm text-ink-soft">{facts.join(" · ")}</p>
        )}
        {course.body && (
          <p className="mt-4 line-clamp-2 max-w-xl leading-relaxed text-ink-soft">{stripFormatting(course.body)}</p>
        )}

        <div className="mt-6 flex flex-wrap items-center gap-3 sm:gap-4">
          <Link
            href={`/courses/${course.slug}`}
            className="group inline-flex h-12 items-center justify-center gap-2 rounded-full bg-ink px-6 text-sm font-medium text-cream transition-colors duration-200 hover:bg-gold hover:text-ink"
          >
            <span>View Details</span>
            <ArrowRight className="h-4 w-4 shrink-0 transition-transform duration-200 group-hover:translate-x-1" />
          </Link>
          {course.programId && (
            <EnrolLink
              programId={course.programId}
              slug={course.slug}
              showStatusBadge={false}
              className="group inline-flex h-12 items-center justify-center gap-2 rounded-full border border-ink/20 bg-white px-6 text-sm font-semibold text-ink shadow-xs transition-colors duration-200 hover:border-ink hover:bg-ink hover:text-cream"
              activeClassName="group inline-flex h-12 items-center justify-center gap-2 whitespace-nowrap rounded-full bg-gold px-6 text-sm font-bold text-ink shadow-sm transition-all duration-200 hover:bg-ink hover:text-cream active:scale-[0.98]"
            >
              <span>Enrol Now</span>
              <ArrowRight className="h-4 w-4 shrink-0 transition-transform duration-200 group-hover:translate-x-1" />
            </EnrolLink>
          )}
        </div>
      </div>
    </div>
  );
}
