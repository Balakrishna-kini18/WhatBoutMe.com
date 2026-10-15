import type { NextConfig } from "next";
import { networkInterfaces } from "node:os";

// Lets a phone on the same Wi-Fi open the dev server at http://<this Mac's
// address>:port. Next blocks its dev scripts for any host but localhost unless
// the host is listed, which leaves the page loaded but dead.
const lanAddresses = Object.values(networkInterfaces())
  .flat()
  .filter((address) => address && address.family === "IPv4" && !address.internal)
  .map((address) => address!.address);

const nextConfig: NextConfig = {
  output: process.env.VERCEL ? undefined : "standalone",
  allowedDevOrigins: lanAddresses,
  // the dev badge floats over the bottom tab bar and swallows taps on Home
  devIndicators: false,
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  images: {
    remotePatterns: [{ protocol: "https", hostname: "images.unsplash.com" }],
  },
  async rewrites() {
    const backendUrl =
      process.env.NEXT_PUBLIC_API_URL ||
      (process.env.VERCEL ? "https://what-bout-me-com.vercel.app" : "http://localhost:4000");
    return [
      {
        source: "/api/backend",
        destination: `${backendUrl}/`,
      },
      {
        source: "/api/backend/:path*",
        destination: `${backendUrl}/:path*`,
      },
    ];
  },
  async redirects() {
    return [
      {
        source: "/11-steps-to-u",
        destination: "/courses/11-steps-to-you",
        permanent: true,
      },
      {
        source: "/vision-boards",
        destination: "/courses/vision-board-workshop",
        permanent: true,
      },
      {
        source: "/speaker",
        destination: "/courses/resilience-speaker",
        permanent: true,
      },
      {
        source: "/lets-talk",
        destination: "/contact",
        permanent: true,
      },
    ];
  },

};


export default nextConfig;
