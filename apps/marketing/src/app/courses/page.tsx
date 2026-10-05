import type { Metadata } from "next";
import SmoothScroll from "@/components/site/SmoothScroll";
import Nav from "@/components/site/Nav";
import Footer from "@/components/site/Footer";
import CoursesGrid from "@/components/site/CoursesGrid";
import FeaturedCourse from "@/components/site/FeaturedCourse";
import PurchaseNotice from "@/components/site/PurchaseNotice";
import PromoBanner from "@/components/site/PromoBanner";
import { getSiteContent } from "@/lib/siteContent";
import { getCourses } from "@/lib/courses";

export const metadata: Metadata = {
  title: "Courses & Workshops — whatboutme",
  description:
    "Every whatboutme course and workshop, in person or online. Pick one to see what it covers and enrol.",
};

export default async function CoursesPage() {
  const [courses, { promo }] = await Promise.all([getCourses(), getSiteContent()]);
  // the flagship leads the page; otherwise the first course does
  const featured = courses.find((c) => c.flagship) ?? courses[0];

  return (
    <main className="relative min-h-screen bg-cream text-ink">
      <SmoothScroll />
      <Nav />

      <header className="relative overflow-hidden">
        <div aria-hidden className="bg-grid absolute inset-0" />
        <div className="relative mx-auto max-w-[1240px] px-5 pb-10 pt-20 sm:pt-32 text-center md:px-10 md:pb-12 md:pt-40">
          <h1 className="mx-auto max-w-3xl text-balance text-[1.75rem] font-bold sm:text-4xl leading-[1.08] tracking-tight md:text-5xl">
            All Courses &amp; Workshops
          </h1>
          <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-ink-soft sm:mt-5 sm:text-base md:text-lg">
            Pick a course to see what it covers and enrol. Every format runs in
            person or online.
          </p>
        </div>
      </header>

      <div className="-mt-2 pb-2">
        <PromoBanner promo={promo} />
      </div>

      <section className="mx-auto max-w-[1240px] px-5 pb-20 md:px-10 md:pb-28">
        <PurchaseNotice />
        <FeaturedCourse course={featured} />

        <h2 className="mb-6 mt-16 text-center text-2xl font-bold tracking-tight md:text-3xl">
          Browse All Courses
        </h2>
        <CoursesGrid courses={courses} />
      </section>

      <Footer />
    </main>
  );
}
