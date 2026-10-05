import type { Metadata } from "next";
import localFont from "next/font/local";
import { DM_Sans } from "next/font/google";
import "./globals.css";
import AdminShell from "./AdminShell";
import AuthProvider from "./AuthProvider";

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
  title: "Admin | WhatBoutMe",
  description: "WhatBoutMe Admin Dashboard",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${dmSans.variable} ${geistSans.variable} ${geistMono.variable}`}>
        <AuthProvider>
          <AdminShell>{children}</AdminShell>
        </AuthProvider>
      </body>
    </html>
  );
}
