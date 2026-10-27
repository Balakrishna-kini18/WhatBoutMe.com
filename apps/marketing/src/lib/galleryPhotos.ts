// Photos for the home page gallery (components/site/HomeGallery.tsx), from
// the client's own pictures: events, the Vision Board Kit and Roweena.
export type GalleryCategory = "events" | "kit" | "roweena";

export type GalleryPhoto = { src: string; width: number; height: number; alt: string; category: GalleryCategory };

export const GALLERY_PHOTOS: GalleryPhoto[] = [
  { src: "/site/gallery/events-01.webp", width: 1280, height: 853, alt: "Roweena Britto at a whatboutme event", category: "events" },
  { src: "/site/gallery/events-02.webp", width: 585, height: 438, alt: "Roweena Britto at a whatboutme event", category: "events" },
  { src: "/site/gallery/events-03.webp", width: 585, height: 438, alt: "Roweena Britto at a whatboutme event", category: "events" },
  { src: "/site/gallery/events-04.webp", width: 380, height: 853, alt: "Roweena Britto at a whatboutme event", category: "events" },
  { src: "/site/gallery/events-05.webp", width: 585, height: 438, alt: "Roweena Britto at a whatboutme event", category: "events" },
  { src: "/site/gallery/events-06.webp", width: 585, height: 438, alt: "Roweena Britto at a whatboutme event", category: "events" },
  { src: "/site/gallery/events-07.webp", width: 585, height: 438, alt: "Roweena Britto at a whatboutme event", category: "events" },
  { src: "/site/gallery/events-08.webp", width: 933, height: 1400, alt: "Roweena Britto at a whatboutme event", category: "events" },
  { src: "/site/gallery/events-09.webp", width: 1008, height: 1400, alt: "Roweena Britto at a whatboutme event", category: "events" },
  { src: "/site/gallery/events-10.webp", width: 945, height: 1400, alt: "Roweena Britto at a whatboutme event", category: "events" },
  { src: "/site/gallery/events-11.webp", width: 1001, height: 1400, alt: "Roweena Britto at a whatboutme event", category: "events" },
  { src: "/site/gallery/events-12.webp", width: 585, height: 438, alt: "Roweena Britto at a whatboutme event", category: "events" },
  { src: "/site/gallery/events-13.webp", width: 585, height: 438, alt: "Roweena Britto at a whatboutme event", category: "events" },
  { src: "/site/gallery/kit-01.webp", width: 1050, height: 1400, alt: "The whatboutme Vision Board Kit", category: "kit" },
  { src: "/site/gallery/kit-02.webp", width: 1050, height: 1400, alt: "The whatboutme Vision Board Kit", category: "kit" },
  { src: "/site/gallery/kit-03.webp", width: 1050, height: 1400, alt: "The whatboutme Vision Board Kit", category: "kit" },
  { src: "/site/gallery/kit-04.webp", width: 1050, height: 1400, alt: "The whatboutme Vision Board Kit", category: "kit" },
  { src: "/site/gallery/kit-05.webp", width: 1050, height: 1400, alt: "The whatboutme Vision Board Kit", category: "kit" },
  { src: "/site/gallery/kit-06.webp", width: 1050, height: 1400, alt: "The whatboutme Vision Board Kit", category: "kit" },
  { src: "/site/gallery/kit-07.webp", width: 1050, height: 1400, alt: "The whatboutme Vision Board Kit", category: "kit" },
  { src: "/site/gallery/kit-08.webp", width: 1050, height: 1400, alt: "The whatboutme Vision Board Kit", category: "kit" },
  { src: "/site/gallery/kit-09.webp", width: 1050, height: 1400, alt: "The whatboutme Vision Board Kit", category: "kit" },
  { src: "/site/gallery/kit-10.webp", width: 1050, height: 1400, alt: "The whatboutme Vision Board Kit", category: "kit" },
  { src: "/site/gallery/kit-11.webp", width: 1050, height: 1400, alt: "The whatboutme Vision Board Kit", category: "kit" },
  { src: "/site/gallery/roweena-01.webp", width: 1383, height: 1400, alt: "Roweena Britto", category: "roweena" },
  { src: "/site/gallery/roweena-02.webp", width: 1050, height: 1400, alt: "Roweena Britto", category: "roweena" },
  { src: "/site/gallery/roweena-03.webp", width: 934, height: 1400, alt: "Roweena Britto", category: "roweena" },
  { src: "/site/gallery/roweena-04.webp", width: 934, height: 1400, alt: "Roweena Britto", category: "roweena" },
  { src: "/site/gallery/roweena-05.webp", width: 933, height: 1400, alt: "Roweena Britto", category: "roweena" },
  { src: "/site/gallery/roweena-06.webp", width: 854, height: 1280, alt: "Roweena Britto", category: "roweena" },
  { src: "/site/gallery/roweena-07.webp", width: 554, height: 1400, alt: "Roweena Britto", category: "roweena" },
];
