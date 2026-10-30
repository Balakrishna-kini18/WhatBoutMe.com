"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  Sparkles,
  Mail,
  Globe,
  MessageSquare,
  MapPin,
  ArrowUpRight,
} from "lucide-react";
import ContactForm, { type ProgramOption } from "./ContactForm";
import type { Course } from "@/lib/courses";
import { isOptimisable } from "@/lib/courses";

interface ContactViewProps {
  contact: {
    email: string;
    phone?: string;
    location?: string;
    social?: string;
  };
  courses: Course[];
  initialCourseQuery?: string;
}

export function findCourseByQuery(courses: Course[], query?: string | null): Course | undefined {
  if (!query) return undefined;
  const q = query.trim().toLowerCase();
  return (
    courses.find((c) => c.programId?.toLowerCase() === q) ||
    courses.find((c) => c.slug.toLowerCase() === q) ||
    courses.find((c) => c.title.toLowerCase() === q) ||
    courses.find((c) => c.slug.toLowerCase().includes(q) || c.title.toLowerCase().includes(q))
  );
}

export default function ContactView({
  contact,
  courses,
  initialCourseQuery = "",
}: ContactViewProps) {
  // Resolve initial course from query param or fallback to flagship/first
  const defaultCourse =
    findCourseByQuery(courses, initialCourseQuery) ||
    courses.find((c) => c.flagship) ||
    courses[0] ||
    null;

  const [activeCourse, setActiveCourse] = useState<Course | null>(defaultCourse);

  // Sync if initialCourseQuery prop changes
  useEffect(() => {
    if (initialCourseQuery) {
      const matched = findCourseByQuery(courses, initialCourseQuery);
      if (matched) {
        setActiveCourse(matched);
      }
    }
  }, [initialCourseQuery, courses]);

  // Synchronize with selection inside the consultation form
  const handleFormCourseChange = (formCourse: ProgramOption | null) => {
    if (!formCourse) return;
    const found =
      courses.find((c) => c.programId === formCourse.id) ||
      courses.find((c) => c.slug === formCourse.slug) ||
      courses.find((c) => c.title.toLowerCase() === formCourse.title.toLowerCase()) ||
      (formCourse.image ? (formCourse as unknown as Course) : null);

    if (found) {
      setActiveCourse(found);
    }
  };

  const ICON_CIRCLE =
    "flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#FFEDD0] text-[#9A4C0A]";

  const courseImage = activeCourse?.image || "/site/course-photo.webp";
  const courseTitle = activeCourse?.title || "11 Steps to U Program";
  const courseSlug = activeCourse?.slug || "11-steps-to-you";
  const courseCategory = activeCourse?.category || "Featured Cohort";

  // Map courses to ProgramOption format for ContactForm
  const formCourses: ProgramOption[] = courses.map((c) => ({
    id: c.programId || c.slug,
    title: c.title,
    slug: c.slug,
    image: c.image,
    category: c.category,
    duration: c.duration,
  }));

  return (
    <>
      {/* Floating navbar smooth fade mask on scroll */}
      <div
        aria-hidden="true"
        className="fixed top-0 inset-x-0 h-20 sm:h-24 z-[100] pointer-events-none bg-gradient-to-b from-[#FEFBF4] via-[#FEFBF4]/90 to-transparent"
      />

      {/* Main Section perfectly balanced below top navbar */}
      <section className="relative overflow-hidden pt-20 sm:pt-24 lg:pt-28 pb-16 sm:pb-24">
        <div className="relative mx-auto max-w-[1100px] px-4 sm:px-6 lg:px-8">
          
          {/* Mobile-only header block */}
          <div className="lg:hidden mb-6">
            <div className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/25 bg-amber-500/10 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-amber-900 mb-2">
              <Sparkles className="h-3 w-3 text-amber-700 fill-amber-700" />
              <span>Let&apos;s Connect</span>
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight text-ink leading-tight">
              Contact Us
            </h1>
            <p className="mt-1.5 text-xs text-ink-soft leading-relaxed">
              Thank you for investing your time on BRAIN HEALTH.
            </p>
          </div>

          <div className="flex flex-col lg:flex-row items-start gap-8 lg:gap-10 xl:gap-12">
            
            {/* ── LEFT INFORMATION COLUMN ────────────────────────────── */}
            <aside className="w-full lg:w-[280px] xl:w-[300px] shrink-0 order-2 lg:order-1 flex flex-col space-y-4">
              
              {/* Desktop-only Heading & Subtitle Block */}
              <div className="hidden lg:block pb-1">
                <div className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/25 bg-amber-500/10 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-amber-900 mb-3">
                  <Sparkles className="h-3 w-3 text-amber-700 fill-amber-700" />
                  <span>Let&apos;s Connect</span>
                </div>

                <h1 className="text-4xl xl:text-[2.75rem] font-black tracking-tight text-[#1A1412] leading-[1.06]">
                  Contact
                  <br />
                  Us
                </h1>
                <p className="mt-2.5 text-xs text-stone-600 leading-relaxed font-normal">
                  Thank you for investing your
                  <br />
                  time on BRAIN HEALTH.
                </p>
              </div>

              {/* 1. Email Us Row */}
              <div className="flex items-center gap-3 pt-1">
                <div className={ICON_CIRCLE}>
                  <Mail className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <span className="block text-[11px] font-medium text-stone-500 leading-tight">
                    Email Us
                  </span>
                  <a
                    href={`mailto:${contact.email}`}
                    className="block truncate text-xs sm:text-sm font-bold text-[#1A1412] hover:text-amber-700 transition-colors"
                  >
                    {contact.email}
                  </a>
                </div>
              </div>

              {/* 2. Social Row */}
              {contact.social && (
                <div className="flex items-center gap-3">
                  <div className={ICON_CIRCLE}>
                    <Globe className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <span className="block text-[11px] font-medium text-stone-500 leading-tight">
                      Social
                    </span>
                    <a
                      href={
                        contact.social.startsWith("http")
                          ? contact.social
                          : `https://${contact.social}`
                      }
                      target="_blank"
                      rel="noreferrer"
                      className="block truncate text-xs sm:text-sm font-bold text-[#1A1412] hover:text-amber-700 transition-colors"
                    >
                      {contact.social.replace(/^https?:\/\/(www\.)?/, "")}
                    </a>
                  </div>
                </div>
              )}

              {/* 3. Enquiries & Consultations Row */}
              <div className="flex items-start gap-3">
                <div className={`${ICON_CIRCLE} mt-0.5`}>
                  <MessageSquare className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <span className="block text-xs font-bold text-[#1A1412] leading-tight">
                    Enquiries &amp; Consultations
                  </span>
                  <p className="mt-1 text-[11px] text-stone-600 leading-relaxed">
                    Submit a General or Course Enquiry using the form. Our coaching team reviews and responds to all messages within 24 hours.
                  </p>
                </div>
              </div>

              {/* 4. Location & Global Reach Row */}
              <div className="flex items-start gap-3">
                <div className={`${ICON_CIRCLE} mt-0.5`}>
                  <MapPin className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <span className="block text-xs font-bold text-[#1A1412] leading-tight">
                    Location &amp; Global Reach
                  </span>
                  <p className="mt-1 text-[11px] text-stone-600 leading-relaxed">
                    Dubai, UAE &amp; Mangalore, India — Serving global learners worldwide
                  </p>
                </div>
              </div>

              {/* 5. Dynamic Course Preview Card (Updated when navigating or selecting a course) */}
              <div className="pt-2">
                <div className="group relative overflow-hidden rounded-2xl border border-stone-200/80 bg-white p-3 shadow-xs transition-all hover:border-amber-400 hover:shadow-sm">
                  <div className="relative aspect-square w-full overflow-hidden rounded-xl bg-[#FFF8EE]">
                    <Image
                      src={courseImage}
                      alt={courseTitle}
                      fill
                      unoptimized={!isOptimisable(courseImage)}
                      sizes="(max-width: 768px) 100vw, 300px"
                      className="object-cover transition-transform duration-300 group-hover:scale-105"
                    />

                    {/* Top right diagonal arrow linking to the active course */}
                    <Link
                      href={`/courses/${courseSlug}`}
                      aria-label={`View ${courseTitle}`}
                      className="absolute top-2.5 right-2.5 z-10 flex h-7 w-7 items-center justify-center rounded-lg bg-[#D97706] text-white shadow-xs transition-transform hover:scale-110 active:scale-95"
                    >
                      <ArrowUpRight className="h-4 w-4" />
                    </Link>

                    {/* Bottom overlay with Course Category & Course Title */}
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-3 pt-6 pointer-events-none">
                      <span className="inline-block rounded-md bg-amber-500/90 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-black mb-1">
                        {courseCategory}
                      </span>
                      <h4 className="line-clamp-1 text-xs font-bold text-white drop-shadow-xs">
                        {courseTitle}
                      </h4>
                    </div>
                  </div>
                </div>

                <div className="mt-2.5 pl-0.5 flex items-center justify-between">
                  <div>
                    <h3 className="text-xs sm:text-sm font-bold text-[#1A1412]">
                      Rowena Britto
                    </h3>
                    <p className="text-[11px] text-stone-500 font-medium">
                      Brain Health Coach
                    </p>
                  </div>
                  {activeCourse?.duration && (
                    <span className="text-[10px] font-semibold text-stone-500 bg-stone-100 px-2 py-0.5 rounded-full">
                      {activeCourse.duration}
                    </span>
                  )}
                </div>
              </div>

            </aside>

            {/* ── RIGHT MAIN CONSULTATION FORM ────────────────────── */}
            <div className="w-full flex-1 min-w-0 order-1 lg:order-2 rounded-[2rem] border border-stone-200/80 bg-white p-5 sm:p-7 md:p-9 shadow-[0_4px_24px_-8px_rgba(20,17,15,0.06),0_20px_48px_-16px_rgba(20,17,15,0.04)]">
              <ContactForm
                initialCourses={formCourses}
                onCourseChange={handleFormCourseChange}
              />
            </div>

          </div>
        </div>
      </section>
    </>
  );
}

