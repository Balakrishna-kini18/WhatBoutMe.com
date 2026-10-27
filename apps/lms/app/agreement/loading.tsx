import css from "./agreement.module.css";

export default function AgreementLoading() {
  return (
    <div className={css.page}>
      <div className={css.shell}>
        <div className={css.card}>
          {/* Header Skeleton */}
          <div style={{ marginBottom: "1.5rem" }}>
            <div className="skeleton" style={{ width: 140, height: 13, marginBottom: 10, borderRadius: 4 }} />
            <div className="skeleton" style={{ width: "70%", height: 28, marginBottom: 10, borderRadius: 8 }} />
            <div className="skeleton" style={{ width: "45%", height: 15, borderRadius: 4 }} />
          </div>

          {/* Program Card Skeleton */}
          <div
            style={{
              padding: "1rem 1.25rem",
              background: "#fdfbf7",
              border: "1px solid #e7e0d6",
              borderRadius: 12,
              marginBottom: "1.5rem",
              display: "flex",
              alignItems: "center",
              gap: "0.85rem",
            }}
          >
            <div className="skeleton" style={{ width: 40, height: 40, borderRadius: 8, flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div className="skeleton" style={{ width: "45%", height: 16, marginBottom: 6, borderRadius: 4 }} />
              <div className="skeleton" style={{ width: "25%", height: 12, borderRadius: 4 }} />
            </div>
          </div>

          {/* Operative Terms & Conditions Box Skeleton */}
          <div style={{ marginBottom: "1.75rem" }}>
            <div className="skeleton" style={{ width: 180, height: 16, marginBottom: 8, borderRadius: 4 }} />
            <div
              style={{
                background: "#fcfaf7",
                border: "1px solid #e7e0d6",
                borderRadius: 12,
                padding: "1.25rem",
                display: "flex",
                flexDirection: "column",
                gap: "0.75rem",
              }}
            >
              <div className="skeleton" style={{ width: "96%", height: 13, borderRadius: 4 }} />
              <div className="skeleton" style={{ width: "91%", height: 13, borderRadius: 4 }} />
              <div className="skeleton" style={{ width: "86%", height: 13, borderRadius: 4 }} />
              <div className="skeleton" style={{ width: "93%", height: 13, borderRadius: 4 }} />
              <div className="skeleton" style={{ width: "55%", height: 13, borderRadius: 4 }} />
            </div>
          </div>

          {/* Full Legal Name Field Skeleton */}
          <div style={{ marginBottom: "1.5rem" }}>
            <div className="skeleton" style={{ width: 160, height: 14, marginBottom: 8, borderRadius: 4 }} />
            <div className="skeleton" style={{ width: "100%", height: 46, borderRadius: 8 }} />
          </div>

          {/* Digital Signature Card Skeleton */}
          <div style={{ marginBottom: "1.5rem" }}>
            <div className="skeleton" style={{ width: 140, height: 14, marginBottom: 8, borderRadius: 4 }} />
            <div
              style={{
                height: 180,
                background: "#faf7f2",
                border: "1px dashed #d6cfc5",
                borderRadius: 12,
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                alignItems: "center",
                gap: "0.75rem",
              }}
            >
              <div className="skeleton" style={{ width: 160, height: 28, borderRadius: 6 }} />
              <div className="skeleton" style={{ width: 220, height: 14, borderRadius: 4 }} />
            </div>
          </div>

          {/* Typed Acceptance Skeleton */}
          <div style={{ marginBottom: "1.5rem" }}>
            <div className="skeleton" style={{ width: 170, height: 14, marginBottom: 8, borderRadius: 4 }} />
            <div className="skeleton" style={{ width: "100%", height: 46, borderRadius: 8 }} />
          </div>

          {/* Consent Checkbox Skeleton */}
          <div style={{ display: "flex", gap: "0.75rem", alignItems: "flex-start", marginBottom: "1.75rem" }}>
            <div className="skeleton" style={{ width: 20, height: 20, borderRadius: 4, flexShrink: 0, marginTop: 2 }} />
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "0.45rem" }}>
              <div className="skeleton" style={{ width: "95%", height: 13, borderRadius: 4 }} />
              <div className="skeleton" style={{ width: "70%", height: 13, borderRadius: 4 }} />
            </div>
          </div>

          {/* Submit Action Button Skeleton */}
          <div className="skeleton" style={{ width: "100%", height: 48, borderRadius: 10 }} />
        </div>
      </div>
    </div>
  );
}
