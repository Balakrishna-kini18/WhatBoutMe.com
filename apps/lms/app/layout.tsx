import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { DM_Sans } from "next/font/google";
import "./globals.css";
import styles from "./layout.module.css";
import LmsSidebar from "./LmsSidebar";
import AuthProvider from "./AuthProvider";
import LmsMain from "./LmsMain";

// same family as the public website
const dmSans = DM_Sans({ subsets: ["latin"], variable: "--font-dm-sans", display: "swap" });

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
});

export const metadata: Metadata = {
  title: "WhatBoutMe Learner Portal",
  description: "Your journey to resilience.",
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
      <body className={`${dmSans.variable} ${geistSans.variable} ${geistMono.variable}`}>
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
