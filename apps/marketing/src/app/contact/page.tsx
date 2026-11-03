import type { Metadata } from "next";
import SmoothScroll from "@/components/site/SmoothScroll";
import Nav from "@/components/site/Nav";
import Footer from "@/components/site/Footer";
import ContactView from "@/components/site/ContactView";
import { getSiteContent } from "@/lib/siteContent";
import { getCourses } from "@/lib/courses";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Let's Talk — whatboutme",
  description:
    "Contact Us. Thank you for investing your time on BRAIN HEALTH.",
};

  export default async function ContactPage({
    searchParams,
  }: {
    searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
  }) {
    const [content, courses] = await Promise.all([getSiteContent(), getCourses()]);
    const resolvedSearchParams = searchParams ? await searchParams : {};
    const rawCourse =
      resolvedSearchParams.course ||
      resolvedSearchParams.programId ||
      resolvedSearchParams.slug ||
      "";
    const initialCourseQuery = Array.isArray(rawCourse) ? rawCourse[0] || "" : rawCourse;

    return (
      <main className="relative min-h-screen bg-[#FEFBF4] text-ink antialiased">
        <SmoothScroll />
        <Nav />
      <ContactView
          contact={content.contact}
          courses={courses}
          initialCourseQuery={initialCourseQuery}
        />
        <Footer />
      </main>
    );
  }
