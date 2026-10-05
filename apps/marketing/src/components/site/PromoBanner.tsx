import { ArrowRight } from "lucide-react";
import type { SiteContent } from "@/lib/siteContent";

// only site paths and web addresses become links; anything else is dropped
const safeHref = (url: string) => (/^(\/|https?:\/\/)/.test(url.trim()) ? url.trim() : "");

/** Offer or announcement strip managed in the admin under Website Content. */
export default function PromoBanner({ promo }: { promo: SiteContent["promo"] }) {
  if (!promo.enabled || !promo.text.trim()) return null;
  const href = safeHref(promo.linkUrl);

  return (
    <aside aria-label="Announcement" className="px-5 py-6 sm:px-4 md:px-8">
      <div className="mx-auto flex max-w-[1240px] flex-col items-center justify-between gap-4 rounded-3xl bg-gold px-6 py-5 text-center text-ink sm:flex-row sm:text-left md:px-8">
        <p className="text-balance font-semibold leading-snug md:text-lg">{promo.text}</p>
        {href && promo.linkLabel.trim() && (
          <a
            href={href}
            className="group flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full bg-ink px-6 py-3 text-sm font-medium text-cream transition-colors duration-200 hover:bg-white hover:text-ink"
          >
            {promo.linkLabel}
            <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
          </a>
        )}
      </div>
    </aside>
  );
}
