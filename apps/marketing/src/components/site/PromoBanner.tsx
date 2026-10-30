import { ArrowRight } from "lucide-react";
import type { SiteContent } from "@/lib/siteContent";

// Robust link resolution so buttons always work even if user enters plain path or domain
function resolvePromoHref(url?: string): string {
  const trimmed = (url || "").trim();
  if (!trimmed) return "/courses";
  if (/^(https?:\/\/|\/|#|mailto:|tel:)/i.test(trimmed)) {
    return trimmed;
  }
  if (trimmed.includes(".")) {
    return `https://${trimmed}`;
  }
  return `/${trimmed.replace(/\s+/g, "-").toLowerCase()}`;
}

/** Offer or announcement strip managed in the admin under Website Content. */
export default function PromoBanner({ promo }: { promo: SiteContent["promo"] }) {
  if (!promo.enabled || !promo.text?.trim()) return null;
  const href = resolvePromoHref(promo.linkUrl);
  const label = promo.linkLabel?.trim() || "Learn More";

  return (
    <aside aria-label="Announcement" className="px-5 py-6 sm:px-4 md:px-8">
      <div className="mx-auto flex max-w-[1240px] flex-col items-center justify-between gap-4 rounded-3xl bg-gold px-6 py-5 text-center text-ink sm:flex-row sm:text-left md:px-8">
        <p className="text-balance font-semibold leading-snug md:text-lg">{promo.text}</p>
        {label && (
          <a
            href={href}
            className="group flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full bg-ink px-6 py-3 text-sm font-medium text-cream transition-colors duration-200 hover:bg-white hover:text-ink"
          >
            {label}
            <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
          </a>
        )}
      </div>
    </aside>
  );
}
