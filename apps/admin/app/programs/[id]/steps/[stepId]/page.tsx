"use client";

import { useEffect, use } from "react";
import { useRouter } from "next/navigation";

/**
 * Seamlessly transitions legacy step-specific routes into the unified
 * Curriculum Authoring Studio workspace at /programs/:id.
 */
export default function StepLessonsPage({
  params,
}: {
  params: Promise<{ id: string; stepId: string }>;
}) {
  const resolvedParams = use(params);
  const { id: programId, stepId } = resolvedParams;
  const router = useRouter();

  useEffect(() => {
    router.replace(`/programs/${programId}?step=${stepId}`);
  }, [programId, stepId, router]);

  return (
    <div style={{ padding: "40px 20px", maxWidth: "900px", margin: "0 auto" }}>
      <div className="skeleton" style={{ height: 32, width: 220, marginBottom: 16, borderRadius: 8 }} />
      <div className="skeleton" style={{ height: 48, width: 440, marginBottom: 24, borderRadius: 8 }} />
      <div className="skeleton" style={{ height: 360, width: "100%", borderRadius: 20 }} />
    </div>
  );
}
