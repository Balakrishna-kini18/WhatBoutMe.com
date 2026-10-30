import Image from "next/image";
import { BADGES, CREDENTIALS, FUTURE_LENS, STATS, STORY } from "@/lib/content";
import { isLocalImage } from "@/lib/siteContent";

/** Full facilitator story, used on the About page. */
export default function Facilitator({ image }: { image: string }) {
  return (
    <>
      {/* intro: headline left, portrait right */}
      <section className="relative overflow-hidden border-b border-line">
        <div className="relative mx-auto grid max-w-[1240px] items-end gap-10 px-5 pt-20 sm:pt-32 md:px-10 md:pt-40 lg:grid-cols-[1.15fr_0.85fr] lg:gap-16">
          <div className="pb-4 text-center lg:pb-20 lg:text-left">
            <h1 className="text-balance text-[1.75rem] font-bold sm:text-4xl leading-[1.08] tracking-tight md:text-[3.25rem]">
              I Lived It, So I Coach It!
            </h1>
            <p className="mt-6 text-lg font-semibold tracking-tight">
              Roweena Britto
            </p>
            <p className="text-ink-soft">
              About Me · Brain Health Coach
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
              quality={80}
              sizes="(max-width: 640px) 80vw, 400px"
              className={
                isLocalImage(image)
                  ? "absolute left-1/2 top-0 h-[165%] w-auto max-w-none -translate-x-1/2"
                  : "absolute inset-0 m-auto h-[92%] w-[92%] object-contain drop-shadow-md z-10"
              }
            />
          </div>
        </div>
      </section>

      {/* the story, one readable column */}
      <section className="py-10 sm:py-16 md:py-24">
        <div className="mx-auto max-w-[760px] px-5 md:px-10">
          <p className="text-xl font-medium leading-relaxed tracking-tight md:text-2xl md:leading-relaxed">
            The moment I fell in love with my condition and my BRAIN, I chased
            it to become its best version; only to realize, it changed
            everything for the BETTER!
          </p>
          <div className="mt-8 space-y-6 leading-relaxed text-ink-soft md:text-lg md:leading-relaxed">
            <p>
              Where is my life going with all the trauma, anxiety, depression,
              and confusion battling in my brain? I often wondered if there was
              any anxiety and depression support available for someone like me.
              Will I see better days? Why go through this pain? When will I be
              free of my addictions and live with purpose? Who can help me
              navigate this mental health journey?
            </p>
            <p>
              Through my struggles with bipolar management, I found the path to
              becoming a Brain Health Coach, guiding others towards healing and
              fulfillment.
            </p>
          </div>
          <Image
            src="/brand/signature-dark.png"
            alt="Roweena Britto signature"
            width={488}
            height={208}
            quality={80}
            loading="lazy"
            sizes="(max-width: 768px) 180px, 240px"
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
                <dt className="text-sm text-ink-soft">{c.group}</dt>
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
              src="/site/gallery/roweena-04.webp"
              alt="Roweena Britto in a golden carved doorway"
              fill
              quality={80}
              loading="lazy"
              sizes="(max-width: 1024px) 100vw, 480px"
              className="object-cover object-[center_35%]"
            />
          </div>

          <div>
            <h2 className="text-2xl font-bold sm:text-3xl leading-[1.12] tracking-tight md:text-[2.75rem]">
              I&apos;m Human, Like You!
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
            Certifications and Badges
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
                  quality={80}
                  loading="lazy"
                  sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 160px"
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
