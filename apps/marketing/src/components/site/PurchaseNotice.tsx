"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};
const getSnapshot = () =>
  new URLSearchParams(window.location.search).get("purchase") === "required";
const getServerSnapshot = () => false;

/** Shown on the courses page when a learner tried to open the portal without a course. */
export default function PurchaseNotice() {
  const show = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  if (!show) return null;

  return (
    <p
      role="status"
      className="mx-auto mb-8 max-w-2xl rounded-2xl border border-gold bg-cream-deep px-5 py-4 text-center text-ink"
    >
      <strong className="font-semibold">Purchase a course to open the LMS Portal.</strong>{" "}
      Pick a course below and enrol; your lessons appear in the portal straight
      after.
    </p>
  );
}
