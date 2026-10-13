import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { DM_Sans, Playfair_Display, Caveat } from "next/font/google";
import "./globals.css";
import styles from "./layout.module.css";
import LmsSidebar from "./LmsSidebar";
import AuthProvider from "./AuthProvider";
import LmsMain from "./LmsMain";

// WhatBoutMe brand fonts
const dmSans = DM_Sans({ subsets: ["latin"], variable: "--font-dm-sans", display: "swap" });
const playfair = Playfair_Display({ subsets: ["latin"], variable: "--font-playfair", display: "swap" });
const caveat = Caveat({ subsets: ["latin"], variable: "--font-caveat", display: "swap" });

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
});


export const metadata: Metadata = {
  title: "WhatBoutMe · Learner Portal | Brain Health & Resilience",
  description: "Brain health · Resilience · Purpose. Rewiring your brain for action with certified programmes, live sessions, and self-awareness coaching.",
};

// On Android the page shrinks when the keyboard opens, instead of sliding up
// behind it. Without this the space kept for the bottom bar showed as an
// empty band between a text field and the keyboard.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  interactiveWidget: "resizes-content",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${dmSans.variable} ${playfair.variable} ${caveat.variable} ${geistSans.variable} ${geistMono.variable}`}>
        <div className={styles.appContainer}>
          {/* Client-side Sidebar with real user data */}
          <LmsSidebar />

          <LmsMain>
            <AuthProvider>
              {children}
            </AuthProvider>
          </LmsMain>
        </div>
      </body>
    </html>
  );
}
