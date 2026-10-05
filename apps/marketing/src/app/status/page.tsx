import type { Metadata } from "next";
import SmoothScroll from "@/components/site/SmoothScroll";
import Nav from "@/components/site/Nav";
import Footer from "@/components/site/Footer";
import StatusDashboard from "./StatusDashboard";

export const metadata: Metadata = {
  title: "Status — whatboutme",
  robots: { index: false, follow: false },
};

// Footer is an async server component, so the page shell stays on the server
export default function StatusPage() {
  return (
    <main className="relative min-h-screen bg-cream text-ink">
      <SmoothScroll />
      <Nav />
      <StatusDashboard />
      <Footer />
    </main>
  );
}
