import type { Metadata } from "next";
import Link from "next/link";
import SmoothScroll from "@/components/site/SmoothScroll";
import Nav from "@/components/site/Nav";
import Footer from "@/components/site/Footer";
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Award,
  Calendar,
  User,
  ExternalLink,
  Building,
} from "lucide-react";
import { API_BASE_URL } from "@/lib/api";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ certId: string }>;
}): Promise<Metadata> {
  const { certId } = await params;
  return {
    title: `Verify Certificate: ${certId} — whatboutme`,
    description: `Official verification portal for whatboutme accredited certification credential ${certId}.`,
  };
}

interface VerificationResult {
  valid: boolean;
  certificateCode: string;
  recipientName: string;
  programName: string;
  certificateType: string;
  issueDate: string;
  validityState: "VALID" | "REVOKED";
  cpdHours?: number | null;
  organizationName?: string | null;
  linkedInParameters?: {
    certName: string;
    organizationId: string;
    issueYear: number;
    issueMonth: number;
    certUrl: string;
  };
}

export default async function VerifyCertificatePage({
  params,
}: {
  params: Promise<{ certId: string }>;
}) {
  const { certId } = await params;
  const cleanId = decodeURIComponent(certId).trim();

  let certData: VerificationResult | null = null;
  let fetchFailed = false;

  try {
    const res = await fetch(
      `${API_BASE_URL}/certificates/verify/${encodeURIComponent(cleanId)}`,
      {
        next: { revalidate: 60, tags: ['certificates'] },
      },
    );

    if (res.ok) {
      certData = await res.json();
    } else {
      fetchFailed = true;
    }
  } catch (err) {
    console.error("Failed to verify certificate via API:", err);
    fetchFailed = true;
  }

  const isValid = certData && certData.valid && certData.validityState === "VALID";
  const isRevoked = certData && (certData.validityState === "REVOKED" || !certData.valid);

  // Format issue date nicely
  const formattedDate = certData?.issueDate
    ? new Date(certData.issueDate).toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : "";

  // Prepare LinkedIn Add-to-Profile URL
  let linkedInUrl = "";
  if (certData && isValid) {
    const certName = certData.linkedInParameters?.certName || `${certData.programName} Certification`;
    const issueDateObj = new Date(certData.issueDate);
    const issueYear = certData.linkedInParameters?.issueYear || issueDateObj.getFullYear();
    const issueMonth = certData.linkedInParameters?.issueMonth || issueDateObj.getMonth() + 1;
    const certUrl = certData.linkedInParameters?.certUrl || `https://whatboutme.com/verify/${certData.certificateCode}`;

    linkedInUrl = `https://www.linkedin.com/profile/add?startTask=CERTIFICATION_NAME&name=${encodeURIComponent(
      certName,
    )}&organizationName=whatboutme&issueYear=${issueYear}&issueMonth=${issueMonth}&certUrl=${encodeURIComponent(
      certUrl,
    )}&certId=${encodeURIComponent(certData.certificateCode)}`;
  }

  return (
    <main className="relative min-h-screen bg-cream text-ink">
      <SmoothScroll />
      <Nav />
      <section className="pt-36 pb-24 px-6 max-w-2xl mx-auto text-center">
        {isValid && certData ? (
          <div className="bg-white/85 backdrop-blur-md border border-border-warm/80 rounded-3xl p-8 sm:p-12 shadow-sm">
            <div className="w-16 h-16 bg-forest/10 text-forest rounded-full flex items-center justify-center mx-auto mb-6 shadow-inner">
              <CheckCircle2 className="w-9 h-9 text-forest" />
            </div>

            <h1 className="font-display text-3xl sm:text-4xl font-bold text-ink mb-2">
              Certificate Verified
            </h1>
            <p className="text-ink/70 mb-8 text-sm">
              Credential ID:{" "}
              <span className="font-mono font-semibold text-ink bg-warm/60 px-2.5 py-1 rounded-md border border-border-warm/40">
                {certData.certificateCode}
              </span>
            </p>

            <div className="text-left bg-warm/30 border border-border-warm/60 rounded-2xl p-6 space-y-4 mb-8">
              <div className="flex items-start justify-between border-b border-border-warm/40 pb-3">
                <div className="flex items-center gap-2 text-ink/60 text-sm">
                  <User className="w-4 h-4" />
                  <span>Recipient</span>
                </div>
                <span className="font-semibold text-ink text-base text-right">
                  {certData.recipientName}
                </span>
              </div>

              <div className="flex items-start justify-between border-b border-border-warm/40 pb-3">
                <div className="flex items-center gap-2 text-ink/60 text-sm">
                  <Award className="w-4 h-4" />
                  <span>Program Title</span>
                </div>
                <span className="font-semibold text-ink text-base text-right max-w-xs">
                  {certData.programName}
                </span>
              </div>

              <div className="flex items-center justify-between border-b border-border-warm/40 pb-3">
                <div className="flex items-center gap-2 text-ink/60 text-sm">
                  <Building className="w-4 h-4" />
                  <span>Accreditation</span>
                </div>
                <span className="font-medium text-ink text-sm">
                  {certData.cpdHours
                    ? `${certData.cpdHours} CPD Accredited Points (UK CPD)`
                    : "whatboutme Executive Certificate"}
                </span>
              </div>

              <div className="flex items-center justify-between border-b border-border-warm/40 pb-3">
                <div className="flex items-center gap-2 text-ink/60 text-sm">
                  <Calendar className="w-4 h-4" />
                  <span>Date Issued</span>
                </div>
                <span className="font-medium text-ink text-sm">{formattedDate}</span>
              </div>

              {certData.organizationName && (
                <div className="flex items-center justify-between border-b border-border-warm/40 pb-3">
                  <div className="flex items-center gap-2 text-ink/60 text-sm">
                    <Building className="w-4 h-4" />
                    <span>Sponsored Cohort</span>
                  </div>
                  <span className="font-semibold text-ink text-sm">
                    {certData.organizationName}
                  </span>
                </div>
              )}

              <div className="flex items-center justify-between pt-1">
                <span className="text-ink/60 text-sm">Status</span>
                <span className="inline-flex items-center gap-1.5 font-semibold text-forest text-xs bg-forest/15 px-3 py-1 rounded-full">
                  <span className="w-2 h-2 rounded-full bg-forest animate-pulse" />
                  Active & Verified
                </span>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              {linkedInUrl && (
                <a
                  href={linkedInUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full bg-[#0a66c2] text-white hover:bg-[#004182] transition-colors text-sm font-medium shadow-sm"
                >
                  <ExternalLink className="w-4 h-4" />
                  Add to LinkedIn Profile
                </a>
              )}
              <Link
                href="/"
                className="w-full sm:w-auto inline-flex items-center justify-center px-6 py-3 rounded-full bg-ink text-cream hover:bg-ink/90 transition-colors text-sm font-medium"
              >
                Return to Homepage
              </Link>
            </div>
          </div>
        ) : isRevoked && certData ? (
          <div className="bg-white/85 backdrop-blur-md border border-amber-200 rounded-3xl p-8 sm:p-12 shadow-sm">
            <div className="w-16 h-16 bg-amber-500/10 text-amber-600 rounded-full flex items-center justify-center mx-auto mb-6">
              <AlertTriangle className="w-9 h-9 text-amber-600" />
            </div>

            <h1 className="font-display text-3xl font-bold text-ink mb-2">
              Certificate Revoked
            </h1>
            <p className="text-ink/70 mb-6 text-sm">
              Credential ID: <span className="font-mono font-medium text-ink">{cleanId}</span>
            </p>

            <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-2xl p-6 text-left mb-8 text-sm">
              <p className="font-semibold mb-1">Notice of Invalidation</p>
              <p className="opacity-90">
                This credential previously issued to{" "}
                <strong>{certData.recipientName}</strong> has been officially revoked by the
                issuing body and is no longer valid or accredited.
              </p>
            </div>

            <Link
              href="/"
              className="inline-flex items-center justify-center px-6 py-3 rounded-full bg-ink text-cream hover:bg-ink/90 transition-colors text-sm font-medium"
            >
              Return to Homepage
            </Link>
          </div>
        ) : (
          <div className="bg-white/85 backdrop-blur-md border border-rose-200 rounded-3xl p-8 sm:p-12 shadow-sm">
            <div className="w-16 h-16 bg-rose-500/10 text-rose-600 rounded-full flex items-center justify-center mx-auto mb-6">
              <XCircle className="w-9 h-9 text-rose-600" />
            </div>

            <h1 className="font-display text-3xl font-bold text-ink mb-2">
              Certificate Not Found
            </h1>
            <p className="text-ink/70 mb-6 text-sm">
              Credential ID:{" "}
              <span className="font-mono font-medium text-rose-800 bg-rose-50 px-2 py-0.5 rounded">
                {cleanId}
              </span>
            </p>

            <p className="text-ink/80 text-sm max-w-md mx-auto mb-8">
              We could not find an accredited certificate matching this code. Please verify that the
              credential code matches the one displayed on the certificate or QR code.
            </p>

            <Link
              href="/"
              className="inline-flex items-center justify-center px-6 py-3 rounded-full bg-ink text-cream hover:bg-ink/90 transition-colors text-sm font-medium"
            >
              Return to Homepage
            </Link>
          </div>
        )}
      </section>
      <Footer />
    </main>
  );
}
