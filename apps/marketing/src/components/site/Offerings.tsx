import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import SectionHeading from "./SectionHeading";
import Reveal from "./Reveal";
import CourseCard from "./CourseCard";
import { getCourses, MIN_COURSES } from "@/lib/courses";

export default async function Offerings() {
  // the landing page shows the first four; the courses page lists them all
  const courses = (await getCourses()).slice(0, MIN_COURSES);

  return (
    <section id="offerings" className="py-10 sm:py-16 md:py-24">
      <div className="mx-auto max-w-[1480px] px-5 md:px-10">
        <SectionHeading
          center
          eyebrow="Courses"
          title="Courses & Workshops"
          intro="From a one-hour keynote to a twelve-class certified programme, built on neuroscience and lived experience."
        />

        {/* phones swipe through the cards; from sm up, flex rather than grid
            so a short list of courses stays centred */}
        <div className="max-sm:swipe-row sm:flex sm:flex-wrap sm:justify-center sm:gap-5">
          {courses.map((c, i) => (
            <Reveal
              key={c.slug}
              delay={(i % 4) * 0.06}
              className="sm:w-[calc(50%-0.625rem)] xl:w-[calc(25%-0.9375rem)]"
            >
              <CourseCard course={c} />
            </Reveal>
          ))}
        </div>

        <Reveal className="mt-6 flex justify-center sm:mt-10">
          <Link
            href="/courses"
            className="group flex items-center gap-2 rounded-full bg-ink px-7 py-3.5 text-sm font-medium text-cream transition-colors duration-200 hover:bg-gold hover:text-ink"
          >
            View All Courses
            <ArrowUpRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </Link>
        </Reveal>
      </div>
    </section>
  );
}
