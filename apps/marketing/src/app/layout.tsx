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
  title: "11 Steps to You — the whatboutme brain health course",
  description:
    "11 Steps to You is a CPD accredited brain health course of twelve live online classes with Roweena Britto, Brain Health Coach licensed in the UAE and India. 25 CPD hours, in person or online.",
  keywords: [
    "brain health",
    "resilience speaker",
    "11 Steps to You",
    "CPD accredited programme",
    "vision board workshop",
    "Roweena Britto",
    "whatboutme",
  ],
  authors: [{ name: "Roweena Britto" }],
  openGraph: {
    title: "11 Steps to You — the whatboutme brain health course",
    description:
      "For the people who hold everyone else together and rarely stop to ask the one question in our name.",
    siteName: "whatboutme",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#fffbf3",
  width: "device-width",
  initialScale: 1,
};

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
      <body className="bg-cream text-ink antialiased">{children}</body>
    </html>
  );
}
