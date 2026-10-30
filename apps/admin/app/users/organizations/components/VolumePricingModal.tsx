"use client";

import React, { useState, useEffect } from "react";
import Modal from "../../../components/Modal";
import { apiPut, errorMessage } from "../../../lib/api";

export interface VolumeTier {
  minSeats: number;
  discountPercent: number;
  label?: string;
}

export interface VolumePricingConfig {
  enabled: boolean;
  tiers: VolumeTier[];
  quickPresets: number[];
  customNote?: string;
  updatedAt?: string;
  updatedBy?: string;
}

interface VolumePricingModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: VolumePricingConfig;
  onConfigSaved: (newConfig: VolumePricingConfig) => void;
}

export default function VolumePricingModal({
  isOpen,
  onClose,
  config,
  onConfigSaved,
}: VolumePricingModalProps) {
  const [formData, setFormData] = useState<VolumePricingConfig>({
    enabled: true,
    tiers: [],
    quickPresets: [10, 25, 50, 100],
    customNote: "",
  });
  const [presetsInput, setPresetsInput] = useState("10, 25, 50, 100");
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && config) {
      setFormData(JSON.parse(JSON.stringify(config)));
      setPresetsInput((config.quickPresets || [10, 25, 50, 100]).join(", "));
      setErrorMsg(null);
    }
  }, [isOpen, config]);

  const handleTierChange = (index: number, field: keyof VolumeTier, value: any) => {
    setFormData((prev) => {
      const current = prev.tiers[index];
      if (!current) return prev;
      const nextTiers = [...prev.tiers];
      nextTiers[index] = {
        minSeats: field === "minSeats" ? Number(value) || 0 : current.minSeats,
        discountPercent: field === "discountPercent" ? Number(value) || 0 : current.discountPercent,
        label: field === "label" ? value : current.label,
      };
      return { ...prev, tiers: nextTiers };
    });
  };

  const handleAddTier = () => {
    setFormData((prev) => {
      const lastTier = prev.tiers[prev.tiers.length - 1];
      const nextMin = lastTier ? lastTier.minSeats + 25 : 10;
      const nextDisc = lastTier ? Math.min(100, lastTier.discountPercent + 5) : 10;
      return {
        ...prev,
        tiers: [
          ...prev.tiers,
          { minSeats: nextMin, discountPercent: nextDisc, label: `${nextMin}+ seats` },
        ],
      };
    });
  };

  const handleRemoveTier = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      tiers: prev.tiers.filter((_, i) => i !== index),
    }));
  };

  const handleAutoGenerateNote = () => {
    const sorted = [...formData.tiers].sort((a, b) => a.minSeats - b.minSeats);
    const parts = sorted.map((t) => `${t.minSeats}+ seats: ${t.discountPercent}% off`);
    const note = parts.length > 0 ? `Volume discounts: ${parts.join(" • ")}` : "No active volume discounts.";
    setFormData((prev) => ({ ...prev, customNote: note }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setErrorMsg(null);

    try {
      // Parse presets
      const parsedPresets = presetsInput
        .split(",")
        .map((s) => Math.round(Number(s.trim())))
        .filter((n) => !isNaN(n) && n > 0);

      const payload: VolumePricingConfig = {
        ...formData,
        quickPresets: parsedPresets.length > 0 ? Array.from(new Set(parsedPresets)).sort((a, b) => a - b) : [10, 25, 50, 100],
        tiers: formData.tiers
          .filter((t) => t.minSeats > 0 && t.discountPercent >= 0)
          .sort((a, b) => a.minSeats - b.minSeats),
      };

      const result = await apiPut<VolumePricingConfig>("/admin/organizations/pricing-tiers", payload);
      onConfigSaved(result);
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to save volume pricing configuration.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        if (!isSaving) onClose();
      }}
      maxWidth="620px"
      title="Dynamic Volume Pricing & Offer Settings"
      subtitle="Configure tiered slot discounts, quick presets, and promotional offers for organization bookings."
      footer={
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" }}>
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            style={{
              padding: "8px 18px",
              borderRadius: "8px",
              border: "1px solid #cbd5e1",
              background: "#ffffff",
              color: "#475569",
              fontWeight: 600,
              fontSize: "0.86rem",
              cursor: isSaving ? "not-allowed" : "pointer",
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSaving}
            style={{
              padding: "9px 22px",
              borderRadius: "8px",
              border: "none",
              background: "linear-gradient(135deg, #c97a1e 0%, #b45309 100%)",
              color: "#ffffff",
              fontWeight: 700,
              fontSize: "0.88rem",
              cursor: isSaving ? "not-allowed" : "pointer",
              boxShadow: "0 2px 6px rgba(201, 122, 30, 0.3)",
            }}
          >
            {isSaving ? "Saving Settings..." : "Save Pricing Tiers & Offers"}
          </button>
        </div>
      }
    >
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
        {errorMsg && (
          <div
            style={{
              background: "#fee2e2",
              border: "1px solid #f87171",
              color: "#991b1b",
              padding: "10px 14px",
              borderRadius: "8px",
              fontSize: "0.84rem",
            }}
          >
            {errorMsg}
          </div>
        )}

        {/* Master Toggle */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "12px 16px",
            background: formData.enabled ? "#f0fdf4" : "#f8fafc",
            border: formData.enabled ? "1.5px solid #86efac" : "1.5px solid #e2e8f0",
            borderRadius: "10px",
          }}
        >
          <div>
            <div style={{ fontWeight: 700, fontSize: "0.9rem", color: formData.enabled ? "#166534" : "#475569" }}>
              {formData.enabled ? "✓ Volume Discounts Active" : "Volume Discounts Disabled"}
            </div>
            <div style={{ fontSize: "0.76rem", color: "#64748b", marginTop: "2px" }}>
              When enabled, organizations booking course slots receive automatic tiered discounts.
            </div>
          </div>
          <label style={{ position: "relative", display: "inline-block", width: "44px", height: "24px" }}>
            <input
              type="checkbox"
              checked={formData.enabled}
              onChange={(e) => setFormData((prev) => ({ ...prev, enabled: e.target.checked }))}
              style={{ opacity: 0, width: 0, height: 0 }}
            />
            <span
              style={{
                position: "absolute",
                cursor: "pointer",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: formData.enabled ? "#16a34a" : "#cbd5e1",
                borderRadius: "24px",
                transition: "0.2s",
              }}
            >
              <span
                style={{
                  position: "absolute",
                  height: "18px",
                  width: "18px",
                  left: formData.enabled ? "23px" : "3px",
                  bottom: "3px",
                  backgroundColor: "white",
                  borderRadius: "50%",
                  transition: "0.2s",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                }}
              />
            </span>
          </label>
        </div>

        {/* Tiers List */}
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
            <label style={{ fontSize: "0.85rem", fontWeight: 700, color: "#1e293b" }}>
              Volume Discount Tiers
            </label>
            <button
              type="button"
              onClick={handleAddTier}
              style={{
                fontSize: "0.78rem",
                fontWeight: 700,
                color: "#c97a1e",
                background: "#fef3c7",
                border: "1px solid #fde68a",
                padding: "3px 10px",
                borderRadius: "6px",
                cursor: "pointer",
              }}
            >
              + Add Tier
            </button>
          </div>

          <div
            style={{
              border: "1px solid #e2e8f0",
              borderRadius: "10px",
              overflow: "hidden",
              background: "#ffffff",
            }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1.2fr 1fr 1fr 40px",
                gap: "8px",
                padding: "8px 12px",
                background: "#f8fafc",
                borderBottom: "1px solid #e2e8f0",
                fontSize: "0.75rem",
                fontWeight: 700,
                color: "#64748b",
              }}
            >
              <span>Min Seats</span>
              <span>Discount %</span>
              <span>Label</span>
              <span />
            </div>

            {formData.tiers.length === 0 ? (
              <div style={{ padding: "16px", textAlign: "center", color: "#94a3b8", fontSize: "0.82rem" }}>
                No discount tiers configured. Click &quot;+ Add Tier&quot; above to add one.
              </div>
            ) : (
              formData.tiers.map((tier, idx) => (
                <div
                  key={idx}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1.2fr 1fr 1fr 40px",
                    gap: "8px",
                    padding: "8px 12px",
                    alignItems: "center",
                    borderBottom: idx === formData.tiers.length - 1 ? "none" : "1px solid #f1f5f9",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                    <input
                      type="number"
                      min={1}
                      value={tier.minSeats}
                      onChange={(e) => handleTierChange(idx, "minSeats", e.target.value)}
                      style={{
                        width: "100%",
                        padding: "6px 8px",
                        borderRadius: "6px",
                        border: "1px solid #cbd5e1",
                        fontSize: "0.85rem",
                        fontWeight: 600,
                      }}
                    />
                    <span style={{ fontSize: "0.75rem", color: "#64748b" }}>+</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={tier.discountPercent}
                      onChange={(e) => handleTierChange(idx, "discountPercent", e.target.value)}
                      style={{
                        width: "100%",
                        padding: "6px 8px",
                        borderRadius: "6px",
                        border: "1px solid #cbd5e1",
                        fontSize: "0.85rem",
                        fontWeight: 600,
                        color: "#16a34a",
                      }}
                    />
                    <span style={{ fontSize: "0.75rem", color: "#64748b" }}>%</span>
                  </div>
                  <input
                    type="text"
                    value={tier.label || `${tier.minSeats}+ seats`}
                    onChange={(e) => handleTierChange(idx, "label", e.target.value)}
                    placeholder="e.g. 10+ seats"
                    style={{
                      width: "100%",
                      padding: "6px 8px",
                      borderRadius: "6px",
                      border: "1px solid #cbd5e1",
                      fontSize: "0.82rem",
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => handleRemoveTier(idx)}
                    style={{
                      border: "none",
                      background: "transparent",
                      color: "#ef4444",
                      fontSize: "1.1rem",
                      cursor: "pointer",
                      padding: "4px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                    title="Remove tier"
                  >
                    ×
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Quick Presets */}
        <div>
          <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 700, color: "#1e293b", marginBottom: "4px" }}>
            Quick-Select Preset Quantities
          </label>
          <div style={{ fontSize: "0.76rem", color: "#64748b", marginBottom: "6px" }}>
            Comma-separated seat quantities shown as quick-pick chips in the booking modal:
          </div>
          <input
            type="text"
            value={presetsInput}
            onChange={(e) => setPresetsInput(e.target.value)}
            placeholder="e.g. 10, 25, 50, 100"
            style={{
              width: "100%",
              padding: "8px 12px",
              borderRadius: "8px",
              border: "1px solid #cbd5e1",
              fontSize: "0.86rem",
              fontWeight: 600,
            }}
          />
        </div>

        {/* Promotional Hint & Offer Note */}
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
            <label style={{ fontSize: "0.85rem", fontWeight: 700, color: "#1e293b" }}>
              Offer Message &amp; Promotional Note
            </label>
            <button
              type="button"
              onClick={handleAutoGenerateNote}
              style={{
                fontSize: "0.74rem",
                color: "#c97a1e",
                background: "transparent",
                border: "none",
                fontWeight: 600,
                cursor: "pointer",
                textDecoration: "underline",
              }}
            >
              Auto-generate from Tiers
            </button>
          </div>
          <textarea
            rows={2}
            value={formData.customNote || ""}
            onChange={(e) => setFormData((prev) => ({ ...prev, customNote: e.target.value }))}
            placeholder="e.g. Volume discounts: 10+ seats: 10% off • 25+ seats: 15% off • 50+ seats: 25% off"
            style={{
              width: "100%",
              padding: "8px 12px",
              borderRadius: "8px",
              border: "1px solid #cbd5e1",
              fontSize: "0.84rem",
              fontFamily: "inherit",
              resize: "vertical",
            }}
          />
        </div>
      </form>
    </Modal>
  );
}
