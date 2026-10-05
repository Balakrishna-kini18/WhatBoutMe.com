import type { Metadata } from "next";
import SmoothScroll from "@/components/site/SmoothScroll";
import Nav from "@/components/site/Nav";
import Footer from "@/components/site/Footer";

export const metadata: Metadata = {
  title: "Privacy Policy — whatboutme",
  description: "Privacy policy and data protection information for whatboutme.",
};

export default function PrivacyPage() {
  return (
    <main className="relative min-h-screen bg-cream text-ink">
      <SmoothScroll />
      <Nav />
      <section className="pt-32 pb-20 px-6 max-w-4xl mx-auto">
        <h1 className="font-display text-4xl sm:text-5xl font-bold tracking-tight text-ink mb-4 text-center">
          Privacy Policy
        </h1>
        <p className="text-sm text-ink/60 text-center mb-12">Last updated: September 30, 2026</p>

        <div className="space-y-8 text-ink/80 leading-relaxed text-base sm:text-lg">
          <div>
            <h2 className="font-display text-xl font-semibold text-ink mb-2">1. Information We Collect</h2>
            <p>
              We collect information that you provide directly to us when you register for an account,
              sign up for a workshop or programme, fill out an enquiry or contact form, or otherwise communicate with us.
            </p>
          </div>

          <div>
            <h2 className="font-display text-xl font-semibold text-ink mb-2">2. How We Use Your Information</h2>
            <p>
              We use the information we collect to deliver and facilitate our educational programmes, process
              registrations and payments, issue certifications and CPD records, and respond to your questions.
            </p>
          </div>

          <div>
            <h2 className="font-display text-xl font-semibold text-ink mb-2">3. Data Security</h2>
            <p>
              We apply technical and organisational security measures to protect your personal information against
              unauthorised access, disclosure, alteration, and loss.
            </p>
          </div>

          <div>
            <h2 className="font-display text-xl font-semibold text-ink mb-2">4. Contact Us</h2>
            <p>
              If you have any questions about this Privacy Policy or your data, please contact us at{" "}
              <a href="mailto:privacy@whatboutme.com" className="text-forest underline underline-offset-4 hover:opacity-80">
                privacy@whatboutme.com
              </a>.
            </p>
          </div>
        </div>
      </section>
      <Footer />
    </main>
  );
}
