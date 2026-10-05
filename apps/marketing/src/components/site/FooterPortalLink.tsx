"use client";

import { LMS_URL } from "@/lib/api";
import { openPortal, useUser } from "@/lib/auth";

/** Footer links that only appear for a signed-in learner. */
export default function FooterPortalLink({ className }: { className: string }) {
  const user = useUser();
  if (!user) return null;

  return (
    <>
      <li>
        <a href={LMS_URL} onClick={openPortal()} className={className}>
          Learner Portal
        </a>
      </li>
      <li>
        <a
          href={`${LMS_URL}/profile`}
          onClick={openPortal("/profile")}
          className={className}
        >
          My Profile
        </a>
      </li>
    </>
  );
}
