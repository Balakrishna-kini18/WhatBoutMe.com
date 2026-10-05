"use client";

import type { ReactNode } from "react";
import { enrolUrl } from "@/lib/courses";
import { openPortal } from "@/lib/auth";

/** "Enrol Now" link. A learner signed in here reaches checkout without signing in again. */
export default function EnrolLink({
  programId,
  className,
  children,
}: {
  programId: string;
  className: string;
  children: ReactNode;
}) {
  return (
    <a
      href={enrolUrl(programId)}
      onClick={openPortal(`/checkout?programId=${encodeURIComponent(programId)}`, {
        requirePurchase: false,
      })}
      className={className}
    >
      {children}
    </a>
  );
}
