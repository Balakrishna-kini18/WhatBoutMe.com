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
};

export default nextConfig;
