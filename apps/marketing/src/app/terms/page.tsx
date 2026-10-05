import type { Metadata } from "next";
import SmoothScroll from "@/components/site/SmoothScroll";
import Nav from "@/components/site/Nav";
import Footer from "@/components/site/Footer";

export const metadata: Metadata = {
  title: "Terms & Conditions — whatboutme",
  description: "Terms and conditions for participation in whatboutme programmes and workshops.",
};

export default function TermsPage() {
  return (
    <main className="relative min-h-screen bg-cream text-ink">
      <SmoothScroll />
      <Nav />
      <section className="pt-32 pb-20 px-6 max-w-4xl mx-auto">
        <h1 className="font-display text-4xl sm:text-5xl font-bold tracking-tight text-ink mb-4 text-center">
          Terms & Conditions
        </h1>
        <p className="text-sm text-ink/60 text-center mb-12">Last updated: September 30, 2026</p>

        <div className="space-y-8 text-ink/80 leading-relaxed text-base sm:text-lg">
          <div>
            <h2 className="font-display text-xl font-semibold text-ink mb-2">1. Introduction</h2>
            <p>
              Welcome to whatboutme. These terms and conditions govern your participation in our programmes,
              workshops, and access to the learning portal.
            </p>
          </div>

          <div>
            <h2 className="font-display text-xl font-semibold text-ink mb-2">2. Programme Commitment</h2>
            <p>
              By enrolling in the "11 Steps to You" programme or any speaker session or workshop, you agree to
              engage respectfully with facilitators and fellow participants. We reserve the right to remove any participant
              exhibiting disruptive behaviour without refund.
            </p>
          </div>

          <div>
            <h2 className="font-display text-xl font-semibold text-ink mb-2">3. Refund Policy</h2>
            <p>
              Due to the limited cohort sizes and digital resources provided, refund requests are evaluated individually
              prior to commencement. Once live cohorts begin, fees are non-refundable.
            </p>
          </div>

          <div>
            <h2 className="font-display text-xl font-semibold text-ink mb-2">4. Intellectual Property</h2>
            <p>
              All course material, worksheets, videos, and methodologies are the proprietary intellectual property
              of whatboutme FZE / Roweena Britto. Reproduction, sharing, or distribution without prior written consent
              is prohibited.
            </p>
          </div>
        </div>
      </section>
      <Footer />
    </main>
  );
}
