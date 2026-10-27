import React from "react";

export interface TableSkeletonProps {
  columns: number;
  rows?: number;
}

export function TableSkeleton({ columns, rows = 5 }: TableSkeletonProps) {
  const widths = ["72%", "88%", "60%", "82%", "68%", "52%", "78%"];
  return (
    <>
      {Array.from({ length: rows }).map((_, rIdx) => (
        <tr key={rIdx} style={{ borderBottom: "1px solid var(--border-light, #ece4d7)" }}>
          {Array.from({ length: columns }).map((_, cIdx) => (
            <td key={cIdx} style={{ padding: "0.95rem 1rem", verticalAlign: "middle" }}>
              <div
                className="skeleton"
                style={{
                  height: "14px",
                  width: widths[(rIdx + cIdx) % widths.length],
                  borderRadius: "4px",
                }}
              />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
