import { COURSES } from "@/lib/content";
import { API_BASE_URL, LMS_URL, type Program } from "@/lib/api";
import { parseCourseInfo } from "@/lib/courseInfo";

export type Course = {
  slug: string;
  title: string;
  /** Used by the filter on the courses page. */
  category: string;
  duration: string;
  meta: string;
  image: string;
  alt: string;
  flagship: boolean;
  body: string;
  fullDescription?: string;
  inPerson: string;
  online: string;
  points: string[];
  /** Extra blocks on the course page; only the built-in courses have them. */
  sections?: { title: string; text: string }[];
  gallery?: { src: string; alt: string }[];
  links?: { label: string; href: string }[];
  /** Present when the course comes from the admin portal. */
  programId?: string;
  price?: number;
  faqs?: Array<{
    id?: string;
    question: string;
    answer: string;
    sortOrder?: number;
  }>;
};

type Brochure = (typeof COURSES)[number];

const BROCHURE_CATEGORY: Record<string, string> = {
  "11-steps-to-you": "Certification",
  "resilience-speaker": "Speaking",
  "vision-board-workshop": "Workshop",
};

// brochure course a program corresponds to, by words in its slug or title
const KEYWORDS: [string[], string][] = [
  [["11", "step"], "11-steps-to-you"],
  [["speaker"], "resilience-speaker"],
  [["vision"], "vision-board-workshop"],
];

function brochureFor(program: Program): Brochure | undefined {
  const text = `${program.slug} ${program.title}`.toLowerCase();
  const slug = KEYWORDS.find(([words]) => words.every((w) => text.includes(w)))?.[1];
  return COURSES.find((c) => c.slug === slug);
}

// each course's own photo, by words in its slug or title; the learner portal
// keeps the same list (apps/lms/app/lib/courseImage.ts) so both show the same picture
const PHOTOS: [string[], string, string][] = [
  [["first", "step"], "/site/course-learning.webp", "Learners working on laptops in a bright classroom"],
  [["sigma"], "/site/course-celebrate.webp", "A team celebrating a win together around a laptop"],
];

function photoFor(program: Program): { image: string; alt: string } | undefined {
  const text = `${program.slug} ${program.title}`.toLowerCase();
  const hit = PHOTOS.find(([words]) => words.every((w) => text.includes(w)));
  return hit ? { image: hit[1], alt: hit[2] } : undefined;
}

/** Admin-entered details win; the course's own photo, then the brochure, fill anything left blank. */
function toCourse(program: Program, index: number): Course {
  const info = parseCourseInfo(program.description);
  const brochure = brochureFor(program);
  const cover = brochure ?? (COURSES.length > 0 ? COURSES[index % COURSES.length] : undefined);
  const photo = photoFor(program);
  const image = info.image || photo?.image || cover?.image || "";
  const alt = info.image ? (program.title || "Course") : (photo?.alt ?? cover?.alt ?? program.title ?? "Course");

  let rawFaqs: any[] = [];
  if (Array.isArray((program as any).faqs) && (program as any).faqs.length > 0) {
    rawFaqs = (program as any).faqs;
  } else if (typeof (program as any).faqs === "string") {
    try {
      rawFaqs = JSON.parse((program as any).faqs);
    } catch {}
  } else if (info.faqs && info.faqs.length > 0) {
    rawFaqs = info.faqs;
  }

  const faqs = (Array.isArray(rawFaqs) ? rawFaqs : [])
    .filter((f) => f && (f.question || f.q) && (f.answer || f.a))
    .map((f, i) => ({
      id: f.id || `faq-${i}`,
      question: (f.question || f.q || "").trim(),
      answer: (f.answer || f.a || "").trim(),
      sortOrder: typeof f.sortOrder === "number" ? f.sortOrder : i,
    }))
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

  return {
    slug: program.slug || `program-${index}`,
    title: program.title || "Untitled Course",
    category: (program as any).category || info.type || (brochure && BROCHURE_CATEGORY[brochure.slug]) || "Course",
    duration: info.duration || brochure?.duration || info.type || "Course",
    meta: info.audience || brochure?.meta || "",
    image,
    alt,
    flagship: brochure?.flagship ?? false,
    body: info.short || (program as any).shortDescription || info.summary || brochure?.body || "",
    fullDescription: info.summary || info.short || (program as any).shortDescription || brochure?.body || "",
    inPerson: info.inPerson || brochure?.inPerson || "",
    online: info.online || brochure?.online || "",
    points: info.points?.length ? info.points : [...(brochure?.points ?? [])],
    sections: brochure?.sections,
    gallery: brochure?.gallery,
    links: brochure?.links,
    programId: program.id,
    price: typeof program.price === "number" && !isNaN(program.price) ? program.price : undefined,
    faqs,
  };
}

/** The landing page shows this many course cards; the courses page shows them all. */
export const MIN_COURSES = 4;

/**
 * Courses shown on the website: the active programs managed dynamically
 * in the database via the admin portal.
 */
// In development, refresh almost immediately (1s) so admin changes reflect instantly.
// In production, programs are cached for 15s to keep the site fast and rate-limit safe.
const isDev = process.env.NODE_ENV === "development";
const REFRESH_MS = isDev ? 1_000 : 15_000;
let cached: { programs: Program[]; at: number } | null = null;
let refreshing: Promise<Program[]> | null = null;
let failedAt = 0;

/**
 * Pages never wait on the API once there is an answer in memory: a stale
 * answer is returned at once and renewed in the background. After a failed
 * fetch the API is left alone for a while, so an API that is down costs one
 * timeout, not one per page.
 */
async function getActivePrograms(): Promise<Program[]> {
  const fresh = !isDev && cached && Date.now() - cached.at < REFRESH_MS;
  const backingOff = Date.now() - failedAt < (isDev ? 2_000 : REFRESH_MS);
  if (!fresh && !backingOff && !refreshing) {
    refreshing = fetchActivePrograms().finally(() => {
      refreshing = null;
    });
  }
  if (!isDev && cached) return cached.programs;
  return refreshing ?? cached?.programs ?? [];
}

async function fetchActivePrograms(): Promise<Program[]> {
  try {
    const res = await fetch(`${API_BASE_URL}/programs`, {
      next: { revalidate: isDev ? 1 : 15, tags: ['programs'] },
      signal: AbortSignal.timeout(4000),
    });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data)) {
        const programs = data.filter(
          (p): p is Program => Boolean(p && typeof p === "object" && p.isActive && p.slug)
        );
        cached = { programs, at: Date.now() };
        return programs;
      }
    }
  } catch {
    // API offline: fall through
  }
  failedAt = Date.now();
  return cached?.programs ?? [];
}

/**
 * Courses shown on the website: dynamically fetched from active programs
 * managed in the backend database.
 */
export async function getCourses(): Promise<Course[]> {
  const programs = await getActivePrograms();
  const validPrograms = (Array.isArray(programs) ? programs : []).filter(
    (p): p is Program => Boolean(p && typeof p === "object" && p.slug && p.title)
  );
  return validPrograms.map((program, index) => toCourse(program, index));
}

export const enrolUrl = (programId: string) =>
  `${LMS_URL}/agreement?programId=${encodeURIComponent(programId)}`;

export const formatPrice = (price: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(price);

/** Only Unsplash is configured for image optimisation; other hosts load as-is. */
export const isOptimisable = (src: string) =>
  src.startsWith("/") || src.startsWith("https://images.unsplash.com/");
