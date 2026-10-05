import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import SmoothScroll from "@/components/site/SmoothScroll";
import Nav from "@/components/site/Nav";
import Footer from "@/components/site/Footer";
import CourseCard from "@/components/site/CourseCard";
import EnrolLink from "@/components/site/EnrolLink";
import { formatPrice, getCourses, isOptimisable } from "@/lib/courses";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const course = (await getCourses()).find((c) => c.slug === slug);
  return course
    ? { title: `${course.title} — whatboutme`, description: course.body }
    : { title: "Course not found — whatboutme" };
}

export default async function CoursePage({ params }: Props) {
  const { slug } = await params;
  const courses = await getCourses();
  const course = courses.find((c) => c.slug === slug);
  if (!course) notFound();

  const facts = [
    { label: "Duration", value: course.duration },
    { label: "In person", value: course.inPerson },
    { label: "Online", value: course.online },
    { label: "For", value: course.meta },
    { label: "Price", value: course.price ? formatPrice(course.price) : "" },
  ].filter((f) => f.value);

  const others = courses.filter((c) => c.slug !== course.slug).slice(0, 3);

  return (
    <main className="relative min-h-screen bg-cream text-ink">
      <SmoothScroll />
      <Nav />

      <div className="mx-auto max-w-[1240px] px-5 pb-20 pt-20 sm:pt-32 md:px-10 md:pb-28 md:pt-36">
        <Link
          href="/courses"
          className="inline-flex items-center gap-2 text-sm font-medium text-ink-soft transition-colors hover:text-ink"
        >
          <ArrowLeft className="h-4 w-4" />
          All Courses
        </Link>

        <div className="mt-6 grid gap-8 lg:grid-cols-[1.5fr_1fr] lg:gap-10">
          {/* about the course */}
          <div>
            <div className="relative aspect-[16/9] overflow-hidden rounded-3xl">
              <Image
                src={course.image}
                alt={course.alt}
                fill
                priority
                unoptimized={!isOptimisable(course.image)}
                sizes="(max-width: 1024px) 100vw, 720px"
                className="object-cover"
              />
            </div>

            <h1 className="mt-8 text-2xl font-bold sm:text-3xl tracking-tight md:text-5xl">
              {course.title}
            </h1>
            <p className="mt-4 max-w-2xl whitespace-pre-line leading-relaxed text-ink-soft md:text-lg">
              {course.body}
            </p>

            {course.points.length > 0 && (
              <>
                <h2 className="mt-10 text-xl font-bold tracking-tight md:text-2xl">
                  What It Covers
                </h2>
                <ul className="mt-5 grid gap-x-8 gap-y-3 sm:grid-cols-2">
                  {course.points.map((point) => (
                    <li key={point} className="flex gap-3">
                      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-cream-deep text-gold-deep">
                        <Check aria-hidden className="h-3.5 w-3.5" strokeWidth={3} />
                      </span>
                      <span className="leading-relaxed text-ink-soft">{point}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}

            {course.sections?.map((section) => (
              <div key={section.title} className="mt-10">
                <h2 className="text-xl font-bold tracking-tight md:text-2xl">
                  {section.title}
                </h2>
                <p className="mt-3 max-w-2xl leading-relaxed text-ink-soft md:text-lg">
                  {section.text}
                </p>
              </div>
            ))}

            {course.gallery && course.gallery.length > 0 && (
              <ul className="mt-10 grid grid-cols-2 gap-4">
                {course.gallery.map((photo) => (
                  <li
                    key={photo.src}
                    className="relative aspect-[4/5] overflow-hidden rounded-2xl border border-line bg-white"
                  >
                    <Image
                      src={photo.src}
                      alt={photo.alt}
                      fill
                      sizes="(max-width: 1024px) 50vw, 340px"
                      className="object-cover"
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* summary card */}
          <aside className="h-fit rounded-3xl border border-line bg-white p-6 md:p-8 lg:sticky lg:top-28">
            <p className="text-lg font-bold tracking-tight">Course Details</p>
            <dl className="mt-4 divide-y divide-line">
              {facts.map((f) => (
                <div key={f.label} className="py-4">
                  <dt className="eyebrow text-gold-deep">{f.label}</dt>
                  <dd className="mt-1.5 leading-relaxed">{f.value}</dd>
                </div>
              ))}
            </dl>

            {course.programId && (
              <EnrolLink
                programId={course.programId}
                className="group mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-ink py-3.5 text-sm font-medium text-cream transition-colors duration-200 hover:bg-gold hover:text-ink"
              >
                Enrol Now
                <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
              </EnrolLink>
            )}
            <a
              href={`/contact?course=${encodeURIComponent(course.title)}`}
              className="group mt-3 flex w-full items-center justify-center gap-2 rounded-full bg-gold py-3.5 text-sm font-medium text-ink transition-colors duration-200 hover:bg-ink hover:text-cream"
            >
              Enquire Now
              <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
            </a>
            {course.links?.map((link) => (
              <a
                key={link.href}
                href={link.href}
                target="_blank"
                rel="noreferrer"
                className="mt-3 flex w-full items-center justify-center rounded-full border border-ink/15 py-3.5 text-sm font-medium text-ink transition-colors duration-200 hover:border-ink"
              >
                {link.label}
              </a>
            ))}
            {course.flagship && (
              <Link
                href="/#curriculum"
                className="mt-3 flex w-full items-center justify-center rounded-full border border-ink/15 py-3.5 text-sm font-medium text-ink transition-colors duration-200 hover:border-ink"
              >
                See the 11 Steps
              </Link>
            )}
            <p className="mt-5 text-xs leading-relaxed text-ink-soft">
              Travel and accommodation costs excluded for in-person engagements.
            </p>
          </aside>
        </div>

        {others.length > 0 && (
          <section className="mt-20 border-t border-line pt-14">
            <h2 className="text-2xl font-bold tracking-tight md:text-3xl">
              More Courses
            </h2>
            <ul className="mt-8 max-sm:swipe-row sm:grid sm:grid-cols-2 sm:gap-5 lg:grid-cols-3">
              {others.map((c) => (
                <li key={c.slug}>
                  <CourseCard course={c} />
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      <Footer />
    </main>
  );
}
