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
};

type Brochure = (typeof COURSES)[number];

const BROCHURE_CATEGORY: Record<string, string> = {
  "11-steps-to-you": "Certification",
  "resilience-speaker": "Speaking",
  "vision-board-workshop": "Workshop",
  "corporate-workshop": "Corporate",
};

// brochure course a program corresponds to, by words in its slug or title
const KEYWORDS: [string[], string][] = [
  [["11", "step"], "11-steps-to-you"],
  [["speaker"], "resilience-speaker"],
  [["vision"], "vision-board-workshop"],
  [["corporate"], "corporate-workshop"],
];

function brochureFor(program: Program): Brochure | undefined {
  const text = `${program.slug} ${program.title}`.toLowerCase();
  const slug = KEYWORDS.find(([words]) => words.every((w) => text.includes(w)))?.[1];
  return COURSES.find((c) => c.slug === slug);
}

/** Admin-entered details win; the brochure fills anything left blank. */
function toCourse(program: Program, index: number): Course {
  const info = parseCourseInfo(program.description);
  const brochure = brochureFor(program);
  const cover = brochure ?? COURSES[index % COURSES.length];

  return {
    slug: program.slug,
    title: program.title,
    category: info.type || (brochure && BROCHURE_CATEGORY[brochure.slug]) || "Course",
    duration: info.duration || brochure?.duration || info.type || "Course",
    meta: info.audience || brochure?.meta || "",
    image: info.image || cover.image,
    alt: info.image ? program.title : cover.alt,
    flagship: brochure?.flagship ?? false,
    body: info.summary || brochure?.body || "",
    inPerson: info.inPerson || brochure?.inPerson || "",
    online: info.online || brochure?.online || "",
    points: info.points.length ? info.points : [...(brochure?.points ?? [])],
    sections: brochure?.sections,
    gallery: brochure?.gallery,
    links: brochure?.links,
    programId: program.id,
    price: program.price,
  };
}

/** The landing page shows this many course cards; the courses page shows them all. */
export const MIN_COURSES = 4;

/**
 * Courses shown on the website: the active programs managed in the admin
 * portal. If there are fewer than MIN_COURSES (or the API is unreachable), the
 * list is topped up with brochure courses that are not already covered.
 */
// The API rate-limits requests, so programs are fetched at most once every
// REFRESH_MS and the last good answer is reused if a later fetch fails.
const REFRESH_MS = 15_000;
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
  const fresh = cached && Date.now() - cached.at < REFRESH_MS;
  const backingOff = Date.now() - failedAt < REFRESH_MS;
  if (!fresh && !backingOff && !refreshing) {
    refreshing = fetchActivePrograms().finally(() => {
      refreshing = null;
    });
  }
  if (cached) return cached.programs;
  return refreshing ?? [];
}

async function fetchActivePrograms(): Promise<Program[]> {
  try {
    const res = await fetch(`${API_BASE_URL}/programs`, {
      cache: "no-store",
      signal: AbortSignal.timeout(4000),
    });
    if (res.ok) {
      const programs = ((await res.json()) as Program[]).filter((p) => p.isActive);
      cached = { programs, at: Date.now() };
      return programs;
    }
  } catch {
    // API offline: fall through
  }
  failedAt = Date.now();
  return cached?.programs ?? [];
}

/**
 * Every course on the website: the four from whatboutme.com first (each
 * taking its price, enrol link and any edited details from a matching admin
 * program), followed by the admin programs that have no match.
 */
export async function getCourses(): Promise<Course[]> {
  const programs = await getActivePrograms();

  const builtIn = COURSES.map((brochure): Course => {
    const index = programs.findIndex((p) => brochureFor(p)?.slug === brochure.slug);
    if (index >= 0) {
      // keep the website's own address for the course
      return { ...toCourse(programs[index], index), slug: brochure.slug };
    }
    return {
      ...brochure,
      category: BROCHURE_CATEGORY[brochure.slug] ?? "Course",
      points: [...brochure.points],
    };
  });

  const extras = programs
    .map((program, index) => ({ program, index }))
    .filter(({ program }) => !brochureFor(program))
    .map(({ program, index }) => toCourse(program, index));

  return [...builtIn, ...extras];
}

export const enrolUrl = (programId: string) =>
  `${LMS_URL}/checkout?programId=${encodeURIComponent(programId)}`;

export const formatPrice = (price: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(price);

/** Only Unsplash is configured for image optimisation; other hosts load as-is. */
export const isOptimisable = (src: string) =>
  src.startsWith("/") || src.startsWith("https://images.unsplash.com/");
