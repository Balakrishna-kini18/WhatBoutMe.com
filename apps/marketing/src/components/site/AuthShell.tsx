import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import Logo from "./Logo";

/**
 * Centred card for sign-in and sign-up: a gradient panel on the left, the form
 * on the right.
 */
export default function AuthShell({
  headline,
  subtitle,
  children,
}: {
  headline: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-ink p-4 text-ink md:p-8">
      {/* the card takes about 80% of the screen and sits in the middle */}
      <div className="grid w-full max-w-[1150px] overflow-hidden rounded-[2rem] bg-white lg:h-[80vh] lg:min-h-[620px] lg:grid-cols-2">
        {/* left: gradient panel (hidden on small screens) */}
        <section className="relative m-2 hidden overflow-hidden rounded-[1.75rem] bg-[linear-gradient(150deg,#f8cf86_0%,#efa944_45%,#c9802a_100%)] p-8 lg:flex lg:flex-col lg:justify-between xl:p-10">
          {/* soft light, as in a sunrise */}
          <span
            aria-hidden
            className="absolute -left-24 -top-24 h-[28rem] w-[28rem] rounded-full bg-white/35 blur-3xl"
          />
          <span
            aria-hidden
            className="absolute -bottom-32 right-0 h-[24rem] w-[24rem] rounded-full bg-[#a9670f]/40 blur-3xl"
          />

          <div className="relative flex items-center justify-between">
            <Link href="/" aria-label="whatboutme home">
              <Logo className="h-6" />
            </Link>
            <Link
              href="/"
              aria-label="Back to the website"
              className="flex h-10 w-10 items-center justify-center rounded-full bg-white/40 transition-colors hover:bg-white/60"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </div>

          <div className="relative">
            <h2 className="text-3xl font-bold leading-[1.08] tracking-tight xl:text-4xl">
              {headline}
            </h2>
            <p className="mt-3 max-w-md text-ink/75 xl:text-lg">{subtitle}</p>
          </div>
        </section>

        {/* right: the form */}
        <section className="flex overflow-y-auto px-5 py-8 md:px-10">
          {/* auto margins centre the form yet let a tall one scroll from its top */}
          <div className="m-auto w-full max-w-sm">
            <div className="mb-10 flex items-center justify-between lg:hidden">
              <Link href="/" aria-label="whatboutme home">
                <Logo className="h-6" />
              </Link>
              <Link
                href="/"
                className="flex h-10 items-center gap-2 text-sm font-medium text-ink-soft transition-colors hover:text-ink"
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </Link>
            </div>
            {children}
          </div>
        </section>
      </div>
    </main>
  );
}
