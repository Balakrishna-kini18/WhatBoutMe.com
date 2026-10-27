"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Volume2, VolumeX } from "lucide-react";

// the YouTube video, played from START seconds and looped back to it
const YOUTUBE_ID = "iAuqu4ARjUQ";
const START = 60;
const POSTER = "/site/gallery/events-01.webp";

const EMBED_SRC =
  `https://www.youtube-nocookie.com/embed/${YOUTUBE_ID}?autoplay=1&mute=1&start=${START}` +
  "&controls=0&disablekb=1&playsinline=1&rel=0&iv_load_policy=3&cc_load_policy=0&enablejsapi=1";

// talks to the embed over postMessage (the YouTube IFrame API protocol, without its script)
function send(frame: HTMLIFrameElement | null, message: object) {
  frame?.contentWindow?.postMessage(JSON.stringify(message), "*");
}
const command = (frame: HTMLIFrameElement | null, func: string, args: unknown[] = []) =>
  send(frame, { event: "command", func, args });

/** Full-width, edge-to-edge banner after the courses: a silent looping video behind a short message. */
export default function VideoBanner() {
  const frame = useRef<HTMLIFrameElement>(null);
  const [muted, setMuted] = useState(true);
  // the poster shows until the video is actually playing, hiding YouTube's loading screen
  const [playing, setPlaying] = useState(false);

  // the embed reports its state over postMessage once we say we're listening;
  // it ignores us until its player is ready, so keep asking until it answers
  useEffect(() => {
    const ask = window.setInterval(() => send(frame.current, { event: "listening", id: 1, channel: "widget" }), 500);
    let captionsOff = false;
    const onMessage = (e: MessageEvent) => {
      if (e.source !== frame.current?.contentWindow || typeof e.data !== "string") return;
      let data: { info?: { playerState?: number; currentTime?: number } | null };
      try {
        data = JSON.parse(e.data);
      } catch {
        return;
      }
      window.clearInterval(ask);
      const state = data.info?.playerState;
      if (state === 1 || (data.info?.currentTime ?? 0) > START) {
        setPlaying(true);
        // captions would sit under the headline; YouTube turns them on for some viewers
        if (!captionsOff) command(frame.current, "unloadModule", ["captions"]);
        captionsOff = true;
      }
      // ended: back to the start point instead of YouTube's end screen
      if (state === 0) {
        command(frame.current, "seekTo", [START, true]);
        command(frame.current, "playVideo");
      }
    };
    window.addEventListener("message", onMessage);
    return () => {
      window.clearInterval(ask);
      window.removeEventListener("message", onMessage);
    };
  }, []);

  return (
    <section aria-label="whatboutme in action" className="relative w-full overflow-hidden bg-ink">
      <div className="relative aspect-[24/9] min-h-56 w-full [container-type:size]">
        <Image
          src={POSTER}
          alt=""
          fill
          loading="lazy"
          sizes="100vw"
          className="object-cover"
        />

        {/* a 16:9 frame scaled to cover the banner, cropping the overflow */}
        <iframe
          ref={frame}
          src={EMBED_SRC}
          title="whatboutme with Roweena Britto"
          loading="lazy"
          allow="autoplay; encrypted-media; picture-in-picture"
          tabIndex={-1}
          className={`pointer-events-none absolute left-1/2 top-1/2 h-[max(56.25cqw,100cqh)] w-[max(100cqw,177.78cqh)] -translate-x-1/2 -translate-y-1/2 border-0 transition-opacity duration-700 ${
            playing ? "opacity-100" : "opacity-0"
          }`}
        />

        {/* the message, centred over a soft shade so it stays readable on any frame */}
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-ink/45 px-5 text-center">
          <h2 className="max-w-3xl text-2xl font-bold leading-[1.1] tracking-tight text-cream sm:text-4xl md:text-5xl">
            Brain Health Coaching for Mental Wellness
          </h2>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-cream/85 sm:mt-4 sm:text-lg">
            Courses, talks and workshops with Roweena Britto, built on lived experience.
          </p>
        </div>
      </div>

      {playing && (
        <button
          type="button"
          onClick={() => {
            command(frame.current, muted ? "unMute" : "mute");
            setMuted(!muted);
          }}
          aria-label={muted ? "Turn sound on" : "Turn sound off"}
          className="absolute bottom-4 right-4 flex h-11 w-11 items-center justify-center rounded-full bg-ink/60 text-cream backdrop-blur transition-colors hover:bg-ink/80 sm:bottom-6 sm:right-6"
        >
          {muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
        </button>
      )}
    </section>
  );
}
