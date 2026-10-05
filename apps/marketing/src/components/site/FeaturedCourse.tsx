import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import EnrolLink from "./EnrolLink";
import { formatPrice, isOptimisable, type Course } from "@/lib/courses";

/** Banner at the top of the courses page. */
export default function FeaturedCourse({ course }: { course: Course }) {
  const facts = [
    course.duration,
    course.meta,
    course.price ? formatPrice(course.price) : "",
  ].filter(Boolean);

  return (
    <div className="grid overflow-hidden rounded-[2rem] bg-ink text-cream lg:grid-cols-2">
      <div className="p-8 md:p-12">
        <h2 className="text-2xl font-bold sm:text-3xl leading-[1.1] tracking-tight md:text-[2.75rem]">
          {course.title}
        </h2>
        <p className="mt-4 line-clamp-3 max-w-xl leading-relaxed text-cream/70 md:text-lg">
          {course.body}
        </p>

        <ul className="mt-6 flex flex-wrap gap-2">
          {facts.map((fact) => (
            <li
              key={fact}
              className="rounded-full border border-cream/20 px-4 py-1.5 text-sm text-cream/85"
            >
              {fact}
            </li>
          ))}
        </ul>

        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href={`/courses/${course.slug}`}
            className="group flex items-center gap-2 rounded-full bg-gold px-6 py-3.5 text-sm font-medium text-ink transition-colors duration-200 hover:bg-cream"
          >
            View Details
            <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
          </Link>
          {course.programId && (
            <EnrolLink
              programId={course.programId}
              className="rounded-full border border-cream/25 px-6 py-3.5 text-sm font-medium text-cream transition-colors duration-200 hover:border-gold hover:text-gold"
            >
              Enrol Now
            </EnrolLink>
          )}
        </div>
      </div>

      <div className="relative min-h-64 lg:min-h-full">
        <Image
          src={course.image}
          alt={course.alt}
          fill
          priority
          unoptimized={!isOptimisable(course.image)}
          sizes="(max-width: 1024px) 100vw, 620px"
          className="object-cover"
        />
      </div>
    </div>
  );
}
