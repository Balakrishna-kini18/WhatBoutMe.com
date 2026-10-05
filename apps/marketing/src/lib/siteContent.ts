import { CONTACT, FAQS } from "@/lib/content";
import { API_BASE_URL } from "@/lib/api";

/**
 * Website content managed in the admin portal ("Website Content"). Every
 * field is optional in the stored document; anything blank falls back to the
 * built-in content below.
 */
export type SiteContent = {
  hero: {
    eyebrow: string;
    title: string;
    highlight: string;
    subtitle: string;
    image: string;
  };
  about: { image: string };
  faqs: { q: string; a: string }[];
  /** Built-in client feedback, replaced by any testimonials added in the admin. */
  testimonials: { quote: string; name: string; role: string }[];
  contact: { email: string; social: string };
  /** Offer or announcement strip; hidden unless switched on in the admin. */
  promo: { enabled: boolean; text: string; linkLabel: string; linkUrl: string };
};

const DEFAULTS: SiteContent = {
  hero: {
    eyebrow: "Brain health · Resilience · Purpose",
    title: "Brain Matters.",
    highlight: "So Do You.",
    subtitle:
      "For the people who hold everyone else together and rarely stop to ask the one question in our name.",
    image: "/brand/roweena.png",
  },
  about: { image: "/brand/roweena.png" },
  faqs: FAQS,
  // client feedback published on whatboutme.com
  testimonials: [
    {
      quote:
        "Relatable Session to the employees, lived experience with storytelling with simple language to all.",
      name: "Standard Chartered",
      role: "Anonymous · March 2026",
    },
    {
      quote:
        "The feedback so far has been overwhelming - honestly haven't had such a good response from a speaker session!",
      name: "Mimecast",
      role: "Anonymous · February 2026",
    },
  ],
  contact: { email: CONTACT.email, social: CONTACT.social },
  promo: { enabled: false, text: "", linkLabel: "", linkUrl: "" },
};

/** Keeps the default for any key the saved document leaves empty. */
function fill<T extends Record<string, string>>(defaults: T, saved: unknown): T {
  const out = { ...defaults };
  if (saved && typeof saved === "object") {
    for (const key of Object.keys(defaults) as (keyof T)[]) {
      const value = (saved as Record<string, unknown>)[key as string];
      if (typeof value === "string" && value.trim()) out[key] = value as T[keyof T];
    }
  }
  return out;
}

const list = <T,>(saved: unknown, fallback: T[]): T[] =>
  Array.isArray(saved) && saved.length > 0 ? (saved as T[]) : fallback;

// fetched at most once every REFRESH_MS; the last good answer is reused on failure
const REFRESH_MS = 15_000;
let cached: { content: SiteContent; at: number } | null = null;
let refreshing: Promise<SiteContent> | null = null;
let failedAt = 0;

/** Same pattern as getActivePrograms in courses.ts: never make a page wait twice. */
export async function getSiteContent(): Promise<SiteContent> {
  const fresh = cached && Date.now() - cached.at < REFRESH_MS;
  const backingOff = Date.now() - failedAt < REFRESH_MS;
  if (!fresh && !backingOff && !refreshing) {
    refreshing = fetchSiteContent().finally(() => {
      refreshing = null;
    });
  }
  if (cached) return cached.content;
  return refreshing ?? DEFAULTS;
}

async function fetchSiteContent(): Promise<SiteContent> {
  try {
    const res = await fetch(`${API_BASE_URL}/site-content`, {
      cache: "no-store",
      signal: AbortSignal.timeout(4000),
    });
    if (res.ok) {
      const saved = await res.json();
      const content: SiteContent = {
        hero: fill(DEFAULTS.hero, saved?.hero),
        about: fill(DEFAULTS.about, saved?.about),
        faqs: list(saved?.faqs, DEFAULTS.faqs),
        testimonials: list(saved?.testimonials, DEFAULTS.testimonials),
        contact: fill(DEFAULTS.contact, saved?.contact),
        promo: {
          ...fill({ text: "", linkLabel: "", linkUrl: "" }, saved?.promo),
          enabled: saved?.promo?.enabled === true,
        },
      };
      cached = { content, at: Date.now() };
      return content;
    }
  } catch {
    // API offline: fall through
  }
  failedAt = Date.now();
  return cached?.content ?? DEFAULTS;
}

/** Uploaded images are served by the API as-is; only local files are optimised. */
export const isLocalImage = (src: string) => src.startsWith("/");
