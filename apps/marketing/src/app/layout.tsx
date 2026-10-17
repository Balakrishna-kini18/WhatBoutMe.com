import type { Metadata, Viewport } from "next";
import { DM_Sans } from "next/font/google";
import "./globals.css";

const dmSans = DM_Sans({
  subsets: ["latin"],
  style: ["normal", "italic"],
  variable: "--font-dm-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Brain Health Coaching for Mental Wellness — whatboutme",
  description:
    "I lived it, so I coach it! Brain Health Coaching with Roweena Britto: the 11 Steps to U Program (25 CPD Hours, UK), Resilience Speaker sessions and the Vision Board Kit.",
  keywords: [
    "brain health",
    "resilience speaker",
    "11 Steps to U Program",
    "CPD hours",
    "vision board workshop",
    "Roweena Britto",
    "whatboutme",
  ],
  authors: [{ name: "Roweena Britto" }],
  openGraph: {
    title: "Brain Health Coaching for Mental Wellness — whatboutme",
    description:
      "The moment I fell in love with my condition and my BRAIN, I chased it to become its best version; only to realize, it changed everything for the BETTER!",
    siteName: "whatboutme",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#fffbf3",
  width: "device-width",
  initialScale: 1,
};

import PushNotificationOptIn from "./components/PushNotificationOptIn";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={dmSans.variable}
      suppressHydrationWarning
    >
      <body className="bg-cream text-ink antialiased">
        {children}
        <PushNotificationOptIn />
      </body>
    </html>
  );
}
