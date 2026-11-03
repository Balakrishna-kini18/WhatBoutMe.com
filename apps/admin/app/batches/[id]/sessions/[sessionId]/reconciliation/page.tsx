"use client";

import { useEffect, use } from "react";
import { useRouter } from "next/navigation";

export default function SessionReconciliationRedirectPage({
  params,
}: {
  params: Promise<{ id: string; sessionId: string }>;
}) {
  const resolvedParams = use(params);
  const { id: batchId, sessionId } = resolvedParams;
  const router = useRouter();

  useEffect(() => {
    router.replace(`/batches/${batchId}/sessions/${sessionId}/attendance`);
  }, [batchId, sessionId, router]);

  return null;
}
