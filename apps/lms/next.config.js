import { networkInterfaces } from "node:os";

// Lets a phone on the same Wi-Fi open the dev server at http://<this Mac's
// address>:port. Next blocks its dev scripts for any host but localhost unless
// the host is listed, which leaves the page loaded but dead.
const lanAddresses = Object.values(networkInterfaces())
  .flat()
  .filter((address) => address && address.family === "IPv4" && !address.internal)
  .map((address) => address.address);

/** @type {import('next').NextConfig} */
const nextConfig = {
  allowedDevOrigins: lanAddresses,
  // the dev badge floats over the bottom tab bar and swallows taps on Home
  devIndicators: false,
  compress: true,
  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: [
      { protocol: "https", hostname: "res.cloudinary.com" },
      { protocol: "https", hostname: "*.cloudinary.com" },
    ],
  },
  experimental: {
    optimizePackageImports: ["@mux/mux-player-react"],
  },
  async redirects() {
    return [
      {
        source: "/org/:path*",
        destination: "/",
        permanent: false,
      },
      {
        source: "/org",
        destination: "/",
        permanent: false,
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "X-Frame-Options",
            value: "SAMEORIGIN",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "X-DNS-Prefetch-Control",
            value: "on",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
