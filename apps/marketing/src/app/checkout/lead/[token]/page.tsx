import { redirect } from "next/navigation";
import { getLmsUrl } from "@/lib/api";

export default async function MarketingLeadCheckoutRedirect({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const lmsUrl = getLmsUrl();
  redirect(`${lmsUrl}/checkout/lead/${encodeURIComponent(token)}`);
}
