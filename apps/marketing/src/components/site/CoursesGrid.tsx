"use client";

import { useState } from "react";
import CourseCardWide from "./CourseCardWide";
import type { Course } from "@/lib/courses";

const ALL = "All";

/** Every course as a card, with a category filter that starts on "All". */
export default function CoursesGrid({ courses }: { courses: Course[] }) {
  const [filter, setFilter] = useState(ALL);
  const categories = [ALL, ...new Set(courses.map((c) => c.category))];
  const visible =
    filter === ALL ? courses : courses.filter((c) => c.category === filter);

  return (
    <>
      <div
        role="group"
        aria-label="Filter courses"
        className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5 pb-2 overscroll-x-contain md:mx-0 md:flex-wrap md:justify-center md:px-0"
      >
        {categories.map((category) => {
          const active = category === filter;
          return (
            <button
              key={category}
              aria-pressed={active}
              onClick={() => setFilter(category)}
              className={`shrink-0 whitespace-nowrap rounded-full px-5 py-2.5 text-sm font-medium transition-colors duration-200 ${
                active
                  ? "bg-ink text-cream"
                  : "border border-line bg-white text-ink-soft hover:border-ink hover:text-ink"
              }`}
            >
              {category}
            </button>
          );
        })}
      </div>

      <ul className="mt-8 grid gap-5 lg:grid-cols-2">
        {visible.map((course) => (
          <li key={course.slug}>
            <CourseCardWide course={course} />
          </li>
        ))}
      </ul>
    </>
  );
}
