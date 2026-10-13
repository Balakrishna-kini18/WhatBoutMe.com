"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import styles from "../../page.module.css";

export default function CreateBatchPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/batches?create=1");
  }, [router]);

  return (
    <div
      className={styles.dashboardContainer}
      style={{
        minHeight: "50vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div style={{ color: "var(--text-secondary)", fontSize: "0.95rem" }}>
        Loading batch setup...
      </div>
    </div>
  );
}
