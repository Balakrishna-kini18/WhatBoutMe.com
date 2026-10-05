import Image from "next/image";
import { BADGES, CREDENTIALS, FUTURE_LENS, STATS, STORY } from "@/lib/content";
import { isLocalImage } from "@/lib/siteContent";

/** Full facilitator story, used on the About page. */
export default function Facilitator({ image }: { image: string }) {
  return (
    <>
      {/* intro: headline left, portrait right */}
      <section className="relative overflow-hidden border-b border-line">
        <div aria-hidden className="bg-grid absolute inset-0" />
        <div className="relative mx-auto grid max-w-[1240px] items-end gap-10 px-5 pt-20 sm:pt-32 md:px-10 md:pt-40 lg:grid-cols-[1.15fr_0.85fr] lg:gap-16">
          <div className="pb-4 text-center lg:pb-20 lg:text-left">
            <h1 className="text-balance text-[1.75rem] font-bold sm:text-4xl leading-[1.08] tracking-tight md:text-[3.25rem]">
              Eighteen Years in the Corporate World. One Question That Changed
              It.
            </h1>
            <p className="mt-6 text-lg font-semibold tracking-tight">
              Roweena Britto
            </p>
            <p className="text-ink-soft">
              Founder &amp; lead facilitator · Brain Health Coach
            </p>
          </div>

          <div className="relative mx-auto aspect-[52/58] w-full max-w-[400px] overflow-hidden">
            <span className="absolute inset-x-0 bottom-0 aspect-square rounded-full bg-[linear-gradient(160deg,#f8cf86,#efa944)]" />
            <Image
              src={image}
            unoptimized={!isLocalImage(image)}
              alt="Roweena Britto, Brain Health Coach"
              width={623}
              height={1289}
              priority
              sizes="(max-width: 640px) 80vw, 400px"
              className="absolute left-1/2 top-0 h-[165%] w-auto max-w-none -translate-x-1/2"
            />
          </div>
        </div>
      </section>

      {/* the story, one readable column */}
      <section className="py-10 sm:py-16 md:py-24">
        <div className="mx-auto max-w-[760px] px-5 md:px-10">
          <p className="text-xl font-medium leading-relaxed tracking-tight md:text-2xl md:leading-relaxed">
            Roweena Britto spent eighteen years in Dubai running projects for
            multinationals like PepsiCo and DHL, in a career built on delivery,
            deadlines and looking after everyone else&apos;s outcomes.
          </p>
          <div className="mt-8 space-y-6 leading-relaxed text-ink-soft md:text-lg md:leading-relaxed">
            <p>
              What she learned there is the reason whatboutme exists: capable,
              dependable people quietly run their brains into the ground, and
              almost none of them have the language to notice it happening.
            </p>
            <p>
              Today she works as a Brain Health Coach, licensed in the UAE and
              India, translating neuroscience into something a room of
              ordinary, tired, high-performing people can actually use on a
              Monday morning, grounded in her own lived resilience story.
            </p>
          </div>
          <Image
            src="/brand/signature-dark.png"
            alt="Roweena Britto signature"
            width={488}
            height={208}
            className="mt-8 h-20 w-auto"
          />
        </div>
      </section>

      {/* numbers and credentials, no cards */}
      <section className="pb-10 sm:pb-16 md:pb-24">
        <div className="mx-auto max-w-[1240px] px-5 md:px-10">
          <dl className="grid grid-cols-2 gap-y-8 border-y border-line py-10 md:grid-cols-4">
            {STATS.map((s) => (
              <div key={s.label} className="flex flex-col-reverse text-center">
                <dt className="mt-1 text-sm text-ink-soft">{s.label}</dt>
                <dd className="text-[1.75rem] font-bold sm:text-4xl tracking-tight tabular-nums md:text-5xl">
                  {s.value}
                </dd>
              </div>
            ))}
          </dl>

          <h2 className="mt-16 text-2xl font-bold tracking-tight md:text-3xl">
            Credentials
          </h2>
          <dl className="mt-8 grid gap-x-10 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
            {CREDENTIALS.map((c) => (
              <div key={c.group} className="border-t-2 border-gold pt-5">
                <dt className="eyebrow text-gold-deep">{c.group}</dt>
                <dd className="mt-4">
                  <ul className="space-y-2.5">
                    {c.items.map((item) => (
                      <li key={item} className="leading-snug">
                        {item}
                      </li>
                    ))}
                  </ul>
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* her own story, from whatboutme.com */}
      <section className="bg-sand/60 py-10 sm:py-16 md:py-24">
        <div className="mx-auto grid max-w-[1240px] items-start gap-12 px-5 md:px-10 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
          <div className="relative aspect-square overflow-hidden rounded-[2rem] lg:sticky lg:top-28">
            <Image
              src="/site/about-photo.jpg"
              alt="Roweena Britto smiling, seated on a motorbike"
              fill
              sizes="(max-width: 1024px) 100vw, 480px"
              className="object-cover"
            />
          </div>

          <div>
            <h2 className="text-2xl font-bold sm:text-3xl leading-[1.12] tracking-tight md:text-[2.75rem]">
              I&apos;m Human, Like You
            </h2>
            <div className="mt-6 space-y-5 leading-relaxed text-ink-soft md:text-lg">
              {STORY.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </div>

            <h3 className="mt-12 text-2xl font-bold tracking-tight">Future Lens</h3>
            <ul className="mt-5 space-y-4">
              {FUTURE_LENS.map((item) => (
                <li key={item} className="flex gap-4">
                  <span className="mt-[0.65em] h-1.5 w-1.5 shrink-0 rounded-full bg-gold" />
                  <span className="leading-relaxed text-ink-soft">{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="py-10 sm:py-16 md:py-24">
        <div className="mx-auto max-w-[1240px] px-5 md:px-10">
          <h2 className="text-center text-2xl font-bold tracking-tight md:text-3xl">
            Certifications &amp; Badges
          </h2>
          <ul className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            {BADGES.map((badge) => (
              <li
                key={badge.file}
                className="flex aspect-square items-center justify-center rounded-2xl border border-line bg-white p-4"
              >
                <Image
                  src={`/site/${badge.file}`}
                  alt={badge.alt}
                  width={320}
                  height={320}
                  className="max-h-full w-auto max-w-full object-contain"
                />
              </li>
            ))}
          </ul>
        </div>
      </section>
    </>
  );
}
