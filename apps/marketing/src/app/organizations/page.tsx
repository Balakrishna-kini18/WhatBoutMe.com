import { notFound } from "next/navigation";

// The Organizations page is currently disabled and commented out from the marketing site.
export default function OrganizationsPage() {
  notFound();
  return null;
}

/* =========================================================================
   ORIGINAL ORGANIZATIONS PAGE IMPLEMENTATION (COMMENTED OUT)
   =========================================================================
*/
// "use client";
// 
// import { useState, type FormEvent } from "react";
// import Link from "next/link";
// import {
//   Building2,
//   Users,
//   Award,
//   CheckCircle2,
//   ArrowRight,
//   TrendingDown,
//   ShieldCheck,
//   Calendar,
//   Sparkles,
//   FileSpreadsheet,
// } from "lucide-react";
// import Nav from "@/components/site/Nav";
// import Footer from "@/components/site/Footer";
// import SmoothScroll from "@/components/site/SmoothScroll";
// import { API_BASE_URL } from "@/lib/api";
// 
// export default function OrganizationsPage() {
//   // Volume Pricing Calculator State
//   const [seatCount, setSeatCount] = useState<number>(30);
//   const [currency, setCurrency] = useState<"USD" | "AED" | "INR">("USD");
// 
//   // Form State
//   const [orgName, setOrgName] = useState("");
//   const [contactName, setContactName] = useState("");
//   const [email, setEmail] = useState("");
//   const [phone, setPhone] = useState("");
//   const [orgType, setOrgType] = useState("CORPORATE");
//   const [notes, setNotes] = useState("");
//   const [isSubmitting, setIsSubmitting] = useState(false);
//   const [submitted, setSubmitted] = useState(false);
//   const [formError, setFormError] = useState<string | null>(null);
// 
//   // Pricing math
//   const getTierDiscountPercent = (count: number) => {
//     if (count >= 50) return 0.25;
//     if (count >= 25) return 0.15;
//     if (count >= 10) return 0.10;
//     return 0.0;
//   };
// 
//   const getBasePrice = () => {
//     if (currency === "AED") return 1850;
//     if (currency === "INR") return 42000;
//     return 499;
//   };
// 
//   const discountPercent = getTierDiscountPercent(seatCount);
//   const basePrice = getBasePrice();
//   const discountedUnit = Math.round(basePrice * (1 - discountPercent) * 100) / 100;
//   const gross = basePrice * seatCount;
//   const savings = Math.round(gross * discountPercent * 100) / 100;
//   const net = Math.round((gross - savings) * 100) / 100;
//   const currSymbol = currency === "USD" ? "$" : currency === "AED" ? "AED " : "₹";
// 
//   const handleSubmitLead = async (e: FormEvent) => {
//     e.preventDefault();
//     try {
//       setIsSubmitting(true);
//       setFormError(null);
// 
//       const res = await fetch(`${API_BASE_URL}/leads`, {
//         method: "POST",
//         headers: { "Content-Type": "application/json" },
//         body: JSON.stringify({
//           fullName: contactName,
//           email,
//           phone,
//           category: "Course Inquiry",
//           notes: `[Organization Inquiry: ${orgName} | Type: ${orgType} | Desired Seats: ${seatCount} | Currency: ${currency}] ${notes}`,
//           organizationName: orgName,
//           expectedSeats: seatCount,
//         }),
//       });
// 
//       if (!res.ok) {
//         throw new Error("Unable to submit registration inquiry. Please check your network or email share@whatboutme.com.");
//       }
// 
//       setSubmitted(true);
//     } catch (err: any) {
//       setFormError(err.message || "Failed to submit request.");
//     } finally {
//       setIsSubmitting(false);
//     }
//   };
// 
//   return (
//     <main className="relative min-h-screen bg-cream text-ink">
//       <SmoothScroll />
//       <Nav />
// 
//       {/* Hero Section */}
//       <section className="relative overflow-hidden pt-28 pb-16 sm:pt-36 sm:pb-24">
//         <div className="mx-auto max-w-[1240px] px-5 md:px-10">
//           <div className="max-w-3xl">
//             <span className="inline-flex items-center gap-2 rounded-full bg-gold/15 px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-gold-deep border border-gold/30">
//               <Building2 className="h-3.5 w-3.5" />
//               Institutional Licensing & Reseller Partnerships
//             </span>
// 
//             <h1 className="mt-5 text-balance text-3xl font-extrabold leading-[1.1] tracking-tight sm:text-5xl md:text-6xl text-ink">
//               Empower Your Organization with Neuroscience-Backed Cognitive Agility.
//             </h1>
// 
//             <p className="mt-6 max-w-2xl text-base leading-relaxed text-ink-soft sm:text-lg">
//               Equip your university students, corporate executives, or coaching clientele with WhatBoutMe&apos;s
//               rigorous 11-step master curriculum, live cohort workshops, 1-on-1 faculty mentorship, and verifiable digital certificates.
//             </p>
// 
//             <div className="mt-8 flex flex-wrap items-center gap-4">
//               <a
//                 href="#pricing-calculator"
//                 className="inline-flex items-center gap-2 rounded-full bg-gold px-7 py-3.5 text-sm font-semibold text-ink transition-all hover:bg-gold-deep hover:text-white"
//               >
//                 Calculate Volume Pricing
//                 <ArrowRight className="h-4 w-4" />
//               </a>
//               <a
//                 href="#register-org"
//                 className="inline-flex items-center gap-2 rounded-full border border-line bg-white/70 px-6 py-3.5 text-sm font-semibold text-ink transition-colors hover:bg-white"
//               >
//                 Register Organization
//               </a>
//             </div>
//           </div>
//         </div>
//       </section>
// 
//       {/* 4 Core Value Pillars */}
//       <section className="border-y border-line/60 bg-white/60 py-16">
//         <div className="mx-auto max-w-[1240px] px-5 md:px-10">
//           <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
//             <div className="rounded-2xl border border-line bg-cream/70 p-6">
//               <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gold/20 text-gold-deep">
//                 <ShieldCheck className="h-6 w-6" />
//               </div>
//               <h3 className="mt-4 text-lg font-bold text-ink">Strict 6-Gate Integrity</h3>
//               <p className="mt-2 text-sm leading-relaxed text-ink-soft">
//                 Zero diploma-mill risk. Every learner must complete digital consent, 11 video steps, live attendance, 1-on-1 faculty mentorship, and a comprehensive final exam.
//               </p>
//             </div>
// 
//             <div className="rounded-2xl border border-line bg-cream/70 p-6">
//               <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gold/20 text-gold-deep">
//                 <FileSpreadsheet className="h-6 w-6" />
//               </div>
//               <h3 className="mt-4 text-lg font-bold text-ink">Dedicated Portal & CSV</h3>
//               <p className="mt-2 text-sm leading-relaxed text-ink-soft">
//                 Real-time dashboard for HR and educators. Bulk assign learners via CSV, monitor individual gate progression, and export accredited compliance reports.
//               </p>
//             </div>
// 
//             <div className="rounded-2xl border border-line bg-cream/70 p-6">
//               <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gold/20 text-gold-deep">
//                 <Users className="h-6 w-6" />
//               </div>
//               <h3 className="mt-4 text-lg font-bold text-ink">Authorized Reseller Codes</h3>
//               <p className="mt-2 text-sm leading-relaxed text-ink-soft">
//                 Purchase wholesale seats and distribute via single-use voucher codes (<code>WBM-SLOT-XXXX</code>) or automated direct invitations for your clients.
//               </p>
//             </div>
// 
//             <div className="rounded-2xl border border-line bg-cream/70 p-6">
//               <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gold/20 text-gold-deep">
//                 <Award className="h-6 w-6" />
//               </div>
//               <h3 className="mt-4 text-lg font-bold text-ink">Tax Invoices & Net-30</h3>
//               <p className="mt-2 text-sm leading-relaxed text-ink-soft">
//                 Multi-currency institutional billing in USD, AED, and INR. Corporate PO support, proforma invoices, and automated VAT receipts from WhatBoutMe FZE.
//               </p>
//             </div>
//           </div>
//         </div>
//       </section>
// 
//       {/* Interactive Volume Pricing Calculator */}
//       <section id="pricing-calculator" className="py-20">
//         <div className="mx-auto max-w-[1240px] px-5 md:px-10">
//           <div className="text-center">
//             <span className="text-xs font-bold uppercase tracking-wider text-gold-deep">
//               Transparent Tiered Volume Discounts
//             </span>
//             <h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl text-ink">
//               Batch Slot Investment Calculator
//             </h2>
//             <p className="mt-3 text-ink-soft max-w-xl mx-auto text-sm sm:text-base">
//               Scale mental agility training across your workforce. Higher slot commitments unlock enterprise tier pricing.
//             </p>
//           </div>
// 
//           <div className="mt-12 mx-auto max-w-4xl rounded-3xl border border-line bg-white p-6 sm:p-10 shadow-sm">
//             {/* Currency Selector */}
//             <div className="flex justify-center gap-2 mb-8">
//               {(["USD", "AED", "INR"] as const).map((curr) => (
//                 <button
//                   key={curr}
//                   type="button"
//                   onClick={() => setCurrency(curr)}
//                   className={`rounded-full px-5 py-2 text-sm font-semibold transition-colors ${
//                     currency === curr
//                       ? "bg-ink text-cream shadow-sm"
//                       : "bg-cream text-ink-soft hover:bg-cream-deep hover:text-ink"
//                   }`}
//                 >
//                   {curr === "USD" ? "$ USD" : curr === "AED" ? "AED (UAE)" : "₹ INR (India)"}
//                 </button>
//               ))}
//             </div>
// 
//             {/* Range Slider & Quick Buttons */}
//             <div className="space-y-4">
//               <div className="flex justify-between items-center">
//                 <span className="text-sm font-semibold text-ink">Cohort Student Slots</span>
//                 <span className="text-2xl font-black text-ink">{seatCount} Seats</span>
//               </div>
// 
//               <input
//                 type="range"
//                 min={5}
//                 max={150}
//                 step={5}
//                 value={seatCount}
//                 onChange={(e) => setSeatCount(parseInt(e.target.value) || 5)}
//                 className="w-full h-3 bg-cream rounded-lg appearance-none cursor-pointer accent-gold-deep"
//               />
// 
//               <div className="flex flex-wrap gap-2 pt-2">
//                 {[10, 25, 30, 50, 75, 100].map((count) => (
//                   <button
//                     key={count}
//                     type="button"
//                     onClick={() => setSeatCount(count)}
//                     className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
//                       seatCount === count
//                         ? "border-gold-deep bg-gold/15 text-gold-deep"
//                         : "border-line bg-cream/40 text-ink-soft hover:border-ink/20"
//                     }`}
//                   >
//                     {count} Seats
//                   </button>
//                 ))}
//               </div>
//             </div>
// 
//             {/* Discount Callouts */}
//             <div className="mt-6 grid grid-cols-3 gap-2 text-center text-xs">
//               <div
//                 className={`rounded-xl border p-2.5 ${
//                   seatCount >= 10 && seatCount < 25
//                     ? "border-gold-deep bg-gold/15 text-gold-deep font-bold"
//                     : "border-line/70 bg-cream/30 text-ink-soft"
//                 }`}
//               >
//                 10–24 Seats: <strong>10% Off</strong>
//               </div>
//               <div
//                 className={`rounded-xl border p-2.5 ${
//                   seatCount >= 25 && seatCount < 50
//                     ? "border-gold-deep bg-gold/15 text-gold-deep font-bold"
//                     : "border-line/70 bg-cream/30 text-ink-soft"
//                 }`}
//               >
//                 25–49 Seats: <strong>15% Off</strong>
//               </div>
//               <div
//                 className={`rounded-xl border p-2.5 ${
//                   seatCount >= 50
//                     ? "border-emerald-500 bg-emerald-50 text-emerald-700 font-bold"
//                     : "border-line/70 bg-cream/30 text-ink-soft"
//                 }`}
//               >
//                 50+ Seats: <strong>25% Enterprise</strong>
//               </div>
//             </div>
// 
//             {/* Pricing Summary Box */}
//             <div className="mt-8 rounded-2xl bg-cream/60 border border-line p-6">
//               <div className="grid gap-4 sm:grid-cols-3 text-center sm:text-left">
//                 <div>
//                   <div className="text-xs uppercase font-semibold text-ink-soft">Effective Rate</div>
//                   <div className="mt-1 text-2xl font-bold text-ink">
//                     {currSymbol}{discountedUnit.toLocaleString()}
//                     <span className="text-xs font-normal text-ink-soft"> / seat</span>
//                   </div>
//                   {discountPercent > 0 && (
//                     <div className="text-xs text-emerald-600 font-semibold mt-0.5">
//                       {discountPercent * 100}% Volume Discount
//                     </div>
//                   )}
//                 </div>
// 
//                 <div>
//                   <div className="text-xs uppercase font-semibold text-ink-soft">Total Savings</div>
//                   <div className="mt-1 text-2xl font-bold text-emerald-600">
//                     {savings > 0 ? `${currSymbol}${savings.toLocaleString()}` : "—"}
//                   </div>
//                   <div className="text-xs text-ink-soft mt-0.5">Institutional Benefit</div>
//                 </div>
// 
//                 <div className="sm:text-right">
//                   <div className="text-xs uppercase font-semibold text-ink-soft">Total Investment</div>
//                   <div className="mt-1 text-3xl font-extrabold text-gold-deep">
//                     {currSymbol}{net.toLocaleString()}
//                   </div>
//                   <div className="text-xs text-ink-soft mt-0.5">Proforma PO or Card</div>
//                 </div>
//               </div>
//             </div>
// 
//             <div className="mt-8 text-center">
//               <a
//                 href="#register-org"
//                 className="inline-flex items-center gap-2 rounded-full bg-gold px-8 py-3.5 font-bold text-ink shadow-sm transition-all hover:bg-gold-deep hover:text-white"
//               >
//                 Lock In This Tier & Request Agreement
//                 <ArrowRight className="h-4 w-4" />
//               </a>
//             </div>
//           </div>
//         </div>
//       </section>
// 
//       {/* Registration & Lead Inquiry Form */}
//       <section id="register-org" className="border-t border-line/60 bg-white py-20">
//         <div className="mx-auto max-w-[1240px] px-5 md:px-10">
//           <div className="grid gap-12 lg:grid-cols-[1fr_1.2fr] items-start">
//             <div>
//               <span className="text-xs font-bold uppercase tracking-wider text-gold-deep">
//                 Get Started
//               </span>
//               <h2 className="mt-2 text-3xl font-bold tracking-tight text-ink sm:text-4xl">
//                 Partner with WhatBoutMe
//               </h2>
//               <p className="mt-4 text-base leading-relaxed text-ink-soft">
//                 Register your institution or reseller agency. Our enterprise solutions team will establish your
//                 dedicated Organization Portal, provision batch seats, and provide co-branded enrollment vouchers.
//               </p>
// 
//               <div className="mt-8 space-y-4">
//                 <div className="flex items-start gap-3">
//                   <CheckCircle2 className="h-5 w-5 text-gold-deep shrink-0 mt-0.5" />
//                   <span className="text-sm text-ink font-medium">
//                     Same-day portal provisioning & branded voucher generation
//                   </span>
//                 </div>
//                 <div className="flex items-start gap-3">
//                   <CheckCircle2 className="h-5 w-5 text-gold-deep shrink-0 mt-0.5" />
//                   <span className="text-sm text-ink font-medium">
//                     1-on-1 Faculty Mentorship session guaranteed for every enrolled student
//                   </span>
//                 </div>
//                 <div className="flex items-start gap-3">
//                   <CheckCircle2 className="h-5 w-5 text-gold-deep shrink-0 mt-0.5" />
//                   <span className="text-sm text-ink font-medium">
//                     Automated tax invoicing & net-30 bank wire options
//                   </span>
//                 </div>
//               </div>
// 
//               <div className="mt-10 rounded-2xl bg-cream/70 border border-line p-6">
//                 <h4 className="text-sm font-bold text-ink">Prefer a Direct Discovery Call?</h4>
//                 <p className="mt-1 text-xs leading-relaxed text-ink-soft">
//                   Schedule a private 15-minute briefing directly with Roweena to discuss curriculum tailoring for your organization.
//                 </p>
//                 <Link
//                   href="/contact"
//                   className="mt-4 inline-flex items-center gap-1.5 text-xs font-bold text-gold-deep hover:underline"
//                 >
//                   Book 1-on-1 Discovery Call →
//                 </Link>
//               </div>
//             </div>
// 
//             {/* Registration Form */}
//             <div className="rounded-3xl border border-line bg-cream/40 p-8 sm:p-10">
//               {submitted ? (
//                 <div className="text-center py-8">
//                   <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 mb-4">
//                     <CheckCircle2 className="h-8 w-8" />
//                   </div>
//                   <h3 className="text-2xl font-bold text-ink">Inquiry Received!</h3>
//                   <p className="mt-2 text-sm text-ink-soft leading-relaxed max-w-md mx-auto">
//                     Thank you for registering <strong>{orgName}</strong>. Our enterprise team is preparing your
//                     volume agreement proposal for {seatCount} seats.
//                   </p>
//                   <div className="mt-6">
//                     <Link
//                       href="/contact"
//                       className="inline-flex items-center gap-2 rounded-full bg-gold px-6 py-3 text-sm font-semibold text-ink hover:bg-gold-deep hover:text-white"
//                     >
//                       Book Your 15-Min Discovery Call Now
//                       <Calendar className="h-4 w-4" />
//                     </Link>
//                   </div>
//                 </div>
//               ) : (
//                 <form onSubmit={handleSubmitLead} className="space-y-4">
//                   <h3 className="text-xl font-bold text-ink mb-2">Organization Registration</h3>
// 
//                   {formError && (
//                     <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
//                       ⚠ {formError}
//                     </div>
//                   )}
// 
//                   <div>
//                     <label className="block text-xs font-semibold text-ink mb-1">
//                       Organization / School / Agency Name *
//                     </label>
//                     <input
//                       type="text"
//                       required
//                       placeholder="e.g. Sahyadri College or TechCorp Global"
//                       value={orgName}
//                       onChange={(e) => setOrgName(e.target.value)}
//                       className="w-full rounded-xl border border-line bg-white px-4 py-2.5 text-sm outline-none focus:border-gold-deep"
//                     />
//                   </div>
// 
//                   <div className="grid gap-4 sm:grid-cols-2">
//                     <div>
//                       <label className="block text-xs font-semibold text-ink mb-1">
//                         Contact Person Name *
//                       </label>
//                       <input
//                         type="text"
//                         required
//                         placeholder="e.g. Dr. Jane Smith"
//                         value={contactName}
//                         onChange={(e) => setContactName(e.target.value)}
//                         className="w-full rounded-xl border border-line bg-white px-4 py-2.5 text-sm outline-none focus:border-gold-deep"
//                       />
//                     </div>
// 
//                     <div>
//                       <label className="block text-xs font-semibold text-ink mb-1">
//                         Corporate / Work Email *
//                       </label>
//                       <input
//                         type="email"
//                         required
//                         placeholder="jane@organization.com"
//                         value={email}
//                         onChange={(e) => setEmail(e.target.value)}
//                         className="w-full rounded-xl border border-line bg-white px-4 py-2.5 text-sm outline-none focus:border-gold-deep"
//                       />
//                     </div>
//                   </div>
// 
//                   <div className="grid gap-4 sm:grid-cols-2">
//                     <div>
//                       <label className="block text-xs font-semibold text-ink mb-1">
//                         Phone / WhatsApp *
//                       </label>
//                       <input
//                         type="tel"
//                         required
//                         placeholder="+971 50 ... or +91 98 ..."
//                         value={phone}
//                         onChange={(e) => setPhone(e.target.value)}
//                         className="w-full rounded-xl border border-line bg-white px-4 py-2.5 text-sm outline-none focus:border-gold-deep"
//                       />
//                     </div>
// 
//                     <div>
//                       <label className="block text-xs font-semibold text-ink mb-1">
//                         Organization Type *
//                       </label>
//                       <select
//                         value={orgType}
//                         onChange={(e) => setOrgType(e.target.value)}
//                         className="w-full rounded-xl border border-line bg-white px-4 py-2.5 text-sm outline-none focus:border-gold-deep"
//                       >
//                         <option value="CORPORATE">Corporate Enterprise</option>
//                         <option value="UNIVERSITY">University / Higher Ed</option>
//                         <option value="TRAINING_INSTITUTE">Training Institute</option>
//                         <option value="COMMUNITY_HUB">Community Hub / NGO</option>
//                         <option value="RESELLER_AGENCY">Authorized Reseller Partner</option>
//                       </select>
//                     </div>
//                   </div>
// 
//                   <div>
//                     <label className="block text-xs font-semibold text-ink mb-1">
//                       Additional Requirements / Cohort Timeline
//                     </label>
//                     <textarea
//                       rows={3}
//                       placeholder="Specify your preferred start dates, cohort size, or specific team focus areas..."
//                       value={notes}
//                       onChange={(e) => setNotes(e.target.value)}
//                       className="w-full rounded-xl border border-line bg-white px-4 py-2.5 text-sm outline-none focus:border-gold-deep resize-none"
//                     />
//                   </div>
// 
//                   <button
//                     type="submit"
//                     disabled={isSubmitting}
//                     className="w-full rounded-full bg-gold py-3.5 text-sm font-bold text-ink shadow-sm transition-all hover:bg-gold-deep hover:text-white disabled:opacity-60"
//                   >
//                     {isSubmitting
//                       ? "Submitting Registration..."
//                       : `Submit Partnership Inquiry (${seatCount} Seats)`}
//                   </button>
//                 </form>
//               )}
//             </div>
//           </div>
//         </div>
//       </section>
// 
//       <Footer />
//     </main>
//   );
// }
// 
// 
