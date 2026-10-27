import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import Logo from "./Logo";
import AuthKeyboard from "./AuthKeyboard";

/**
 * Sign-in and sign-up layout.
 * Phones and tablets: the logo and the page's message over the picture's sun
 * and ridges, and the form on a white sheet docked to the bottom edge. While a
 * field has focus (html[data-typing], set by AuthKeyboard) the picture folds
 * away so the form sits at the top, clear of the keyboard.
 * Desktop: a centred card, a gradient panel on the left and the form on the
 * right, over the picture zoomed to the full width.
 */
export default function AuthShell({
  headline,
  subtitle,
  children,
  maxWidth = "max-w-sm",
}: {
  headline: string;
  subtitle: string;
  children: ReactNode;
  maxWidth?: string;
}) {
  return (
    <main className="flex min-h-dvh flex-col bg-[#f8dfab] bg-[url('/brand/auth-bg.webp')] bg-[length:100%_auto] bg-[position:center_-10vw] bg-no-repeat text-ink lg:items-center lg:justify-center lg:bg-cover lg:bg-[position:center_52%] lg:p-8">
      <AuthKeyboard />
      {/* phones and tablets: the logo and the page's message centred over the
          sun, the ridges rising behind the top of the sheet */}
      <header className="flex flex-1 flex-col items-center px-6 pb-12 pt-[max(2.25rem,env(safe-area-inset-top))] text-center md:px-8 lg:hidden [@media(max-height:700px)]:pb-10 [@media(max-height:700px)]:pt-[max(1.5rem,env(safe-area-inset-top))] [html[data-typing]_&]:hidden">
        <Link href="/" aria-label="whatboutme home">
          <Logo className="h-5" />
        </Link>
        <h2 className="mt-8 text-[1.75rem] font-bold leading-[1.1] tracking-tight [@media(max-height:700px)]:mt-5">{headline}</h2>
        {/* short phones keep just the headline so the whole form fits */}
        <p className="mt-2 max-w-[18rem] text-[15px] leading-snug text-ink/75 [@media(max-height:700px)]:hidden">{subtitle}</p>
      </header>

      {/* while typing (phones): the sheet fills the screen from the top */}
      <div className="-mt-6 grid w-full flex-none overflow-hidden rounded-t-[2rem] bg-white shadow-[0_-16px_40px_-28px_rgba(110,63,18,0.6)] [html[data-typing]_&]:mt-0 [html[data-typing]_&]:flex-1 [html[data-typing]_&]:rounded-none [html[data-typing]_&]:pt-[env(safe-area-inset-top)] lg:mt-0 lg:h-[80vh] lg:min-h-[620px] lg:max-w-[1150px] lg:flex-none lg:grid-cols-2 lg:rounded-[2rem] lg:shadow-[0_40px_90px_-40px_rgba(110,63,18,0.55)] lg:ring-1 lg:ring-white/70">
        {/* left: Roweena's photo with a warm shade under the headline (desktop only) */}
        <section className="relative m-2 hidden overflow-hidden rounded-[1.75rem] bg-[#efa944] p-8 lg:flex lg:flex-col lg:justify-between xl:p-10">
          <Image
            src="/site/gallery/roweena-06.webp"
            alt=""
            fill
            sizes="560px"
            className="object-cover object-[center_30%]"
          />
          <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-3/5 bg-[linear-gradient(to_top,#f8cf86_15%,rgba(248,207,134,0.85)_45%,rgba(248,207,134,0))]" />
          <span aria-hidden="true" className="absolute inset-x-0 top-0 h-28 bg-[linear-gradient(to_bottom,rgba(255,251,243,0.75),rgba(255,251,243,0))]" />
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
        {/* while typing (phones): room below the form so the lower fields can
            scroll up above the keyboard */}
        <section className="flex px-6 pb-[max(2.5rem,env(safe-area-inset-bottom))] pt-8 md:px-8 [html[data-typing]_&]:pb-[45vh] lg:overflow-y-auto lg:py-8">
          {/* auto margins centre the form yet let a tall one scroll from its top */}
          <div className={`mx-auto w-full lg:my-auto ${maxWidth}`}>{children}</div>
        </section>
      </div>
    </main>
  );
}
