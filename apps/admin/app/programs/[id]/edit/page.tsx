"use client";

import { useEffect, use } from "react";
import { useRouter } from "next/navigation";

export default function EditProgramPage({
  params,
}: {
  params: Promise<{ id: string }> | { id: string };
}) {
  const unwrapped = typeof (params as any)?.then === "function" ? use(params as any) : params;
  const programId = (unwrapped as { id: string }).id;
  const router = useRouter();

  useEffect(() => {
    router.replace(`/programs/${programId}`);
  }, [programId, router]);

  return (
    <div style={{ padding: "40px 20px", maxWidth: "900px", margin: "0 auto" }}>
      <div className="skeleton" style={{ height: 32, width: 220, marginBottom: 16, borderRadius: 8 }} />
      <div className="skeleton" style={{ height: 48, width: 440, marginBottom: 24, borderRadius: 8 }} />
      <div className="skeleton" style={{ height: 360, width: "100%", borderRadius: 20 }} />
    </div>
  );
}
