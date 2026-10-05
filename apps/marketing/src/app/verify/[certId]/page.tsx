import type { Metadata } from "next";
import Link from "next/link";
import SmoothScroll from "@/components/site/SmoothScroll";
import Nav from "@/components/site/Nav";
import Footer from "@/components/site/Footer";
import { CheckCircle2 } from "lucide-react";

export const metadata: Metadata = {
  title: "Verify Certificate — whatboutme",
  description: "Verify authenticity of whatboutme credentials and certificates.",
};

export default async function VerifyCertificatePage({
  params,
}: {
  params: Promise<{ certId: string }>;
}) {
  const { certId } = await params;

  return (
    <main className="relative min-h-screen bg-cream text-ink">
      <SmoothScroll />
      <Nav />
      <section className="pt-36 pb-24 px-6 max-w-2xl mx-auto text-center">
        <div className="bg-white/80 backdrop-blur-sm border border-border-warm/60 rounded-3xl p-8 sm:p-12 shadow-sm">
          <div className="w-16 h-16 bg-forest/10 text-forest rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 className="w-9 h-9 text-forest" />
          </div>

          <h1 className="font-display text-3xl font-bold text-ink mb-2">
            Certificate Verified
          </h1>
          <p className="text-ink/70 mb-8">
            Credential ID: <span className="font-mono font-medium text-ink bg-warm/50 px-2 py-0.5 rounded">{certId}</span>
          </p>

          <div className="text-left bg-warm/30 border border-border-warm/40 rounded-2xl p-6 space-y-3 mb-8">
            <div className="flex justify-between items-center text-sm border-b border-border-warm/40 pb-2">
              <span className="text-ink/60">Recipient</span>
              <span className="font-medium text-ink">Credential Holder</span>
            </div>
            <div className="flex justify-between items-center text-sm border-b border-border-warm/40 pb-2">
              <span className="text-ink/60">Programme</span>
              <span className="font-medium text-ink">11 Steps to You (CPD Accredited)</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-ink/60">Status</span>
              <span className="inline-flex items-center gap-1.5 font-medium text-forest text-xs bg-forest/10 px-2.5 py-1 rounded-full">
                Active & Verified
              </span>
            </div>
          </div>

          <Link
            href="/"
            className="inline-flex items-center justify-center px-6 py-3 rounded-full bg-ink text-cream hover:bg-ink/90 transition-colors text-sm font-medium"
          >
            Return to Homepage
          </Link>
        </div>
      </section>
      <Footer />
    </main>
  );
}
