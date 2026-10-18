import { redirect } from "next/navigation";

export default async function MarketingLeadCheckoutRedirect({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const lmsUrl = process.env.NEXT_PUBLIC_LMS_URL || "http://localhost:3003";
  redirect(`${lmsUrl}/checkout/lead/${encodeURIComponent(token)}`);
}
