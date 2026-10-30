"use client";

import { useEffect, useState, FormEvent, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import styles from "../../page.module.css";
import { API_URL, createBatch, errorMessage, cachedFetch } from "../../lib/api";
import {
  getTimezoneOptions,
  getSystemTimezone,
} from "../../lib/timezone";
import { CustomSelect, useToast } from "../../components";

interface ProgramOption {
  id: string;
  title: string;
  price: number;
  currency?: string | null;
  priceUSD?: number | null;
  priceAED?: number | null;
  priceINR?: number | null;
}

interface ManagerOption {
  id: string;
  name: string;
  email: string;
  role: string;
}

export default function CreateBatchPage() {
  const router = useRouter();
  const { success: toastSuccess, error: toastError } = useToast();

  const [programs, setPrograms] = useState<ProgramOption[]>([]);
  const [managers, setManagers] = useState<ManagerOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  // Form Fields
  const [name, setName] = useState("");
  const [programId, setProgramId] = useState("");
  const [managerId, setManagerId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [registrationDeadline, setRegistrationDeadline] = useState("");
  const [capacity, setCapacity] = useState(50);
  const [status, setStatus] = useState<"UPCOMING" | "ACTIVE">("UPCOMING");

  // Multi-Currency Pricing
  const [currency, setCurrency] = useState<"USD" | "AED" | "INR">("USD");
  const [basePrice, setBasePrice] = useState<string>("");
  const [priceUSD, setPriceUSD] = useState<string>("");
  const [priceAED, setPriceAED] = useState<string>("");
  const [priceINR, setPriceINR] = useState<string>("");

  const [displayTimezone, setDisplayTimezone] = useState<string>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("wbm_display_tz");
      if (saved) return saved;
    }
    return getSystemTimezone();
  });

  const timezoneOptions = useMemo(() => getTimezoneOptions(), []);

  useEffect(() => {
    const loadInitialData = async () => {
      try {
        const [progsRes, usersRes] = await Promise.all([
          cachedFetch(`${API_URL}/programs`),
          cachedFetch(`${API_URL}/users?limit=100`),
        ]);

        if (progsRes.ok) {
          const progsData = await progsRes.json();
          if (Array.isArray(progsData)) {
            const published = progsData.filter((p: any) => p && p.isActive !== false && p.status !== "DRAFT");
            setPrograms(published);
            if (published.length > 0) {
              setProgramId(published[0].id);
              // Prepopulate suggested pricing from selected program
              if (published[0].price !== undefined) {
                setBasePrice(String(published[0].price));
              }
              if (published[0].currency) {
                setCurrency(published[0].currency as any);
              }
              if (published[0].priceUSD) setPriceUSD(String(published[0].priceUSD));
              if (published[0].priceAED) setPriceAED(String(published[0].priceAED));
              if (published[0].priceINR) setPriceINR(String(published[0].priceINR));
            }
          }
        }

        if (usersRes.ok) {
          const usersData = await usersRes.json();
          const userList = Array.isArray(usersData)
            ? usersData
            : usersData?.data || usersData?.users || [];
          setManagers(
            userList.filter(
              (u: any) =>
                u.role === "MANAGER" ||
                u.role === "SUPER_ADMIN" ||
                u.role === "ADMIN",
            ),
          );
        }
      } catch (err) {
        console.error("Failed to load initial data for batch creation", err);
      } finally {
        setIsLoading(false);
      }
    };

    loadInitialData();
  }, []);

  // Update suggested pricing when program selection changes
  const handleProgramChange = (selectedId: string) => {
    setProgramId(selectedId);
    const prog = programs.find((p) => p.id === selectedId);
    if (prog) {
      if (prog.price !== undefined && !basePrice) {
        setBasePrice(String(prog.price));
      }
      if (prog.currency) {
        setCurrency(prog.currency as any);
      }
      if (prog.priceUSD && !priceUSD) setPriceUSD(String(prog.priceUSD));
      if (prog.priceAED && !priceAED) setPriceAED(String(prog.priceAED));
      if (prog.priceINR && !priceINR) setPriceINR(String(prog.priceINR));
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError("");

    if (!name.trim()) {
      setFormError("Batch name is required.");
      return;
    }

    if (!programId) {
      setFormError("Please select a parent curriculum program.");
      return;
    }

    if (!startDate) {
      setFormError("Please select a batch start date.");
      return;
    }

    const todayStr = new Date().toISOString().slice(0, 10);
    if (startDate < todayStr) {
      setFormError("Batch start date cannot be in the past.");
      return;
    }

    if (!registrationDeadline) {
      setFormError("Registration deadline is required.");
      return;
    }

    if (registrationDeadline < todayStr) {
      setFormError("Registration deadline cannot be in the past.");
      return;
    }

    if (endDate && new Date(registrationDeadline).getTime() > new Date(endDate).getTime()) {
      setFormError("Registration deadline cannot be after the batch end date.");
      return;
    }

    if (capacity < 1) {
      setFormError("Capacity must be at least 1 learner.");
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        name: name.trim(),
        programId,
        managerId: managerId || null,
        startDate: new Date(startDate).toISOString(),
        endDate: endDate ? new Date(endDate).toISOString() : null,
        registrationDeadline: new Date(registrationDeadline).toISOString(),
        capacity: Number(capacity),
        status,
        currency,
        price: basePrice.trim() ? parseFloat(basePrice) : null,
        priceUSD: priceUSD.trim() ? parseFloat(priceUSD) : null,
        priceAED: priceAED.trim() ? parseFloat(priceAED) : null,
        priceINR: priceINR.trim() ? parseFloat(priceINR) : null,
      };

      const res = await fetch(`${API_URL}/batches`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(typeof window !== "undefined" && localStorage.getItem("token")
            ? { Authorization: `Bearer ${localStorage.getItem("token")}` }
            : {}),
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const msg = await errorMessage(res, "Failed to create batch.");
        setFormError(msg);
        toastError(msg);
        return;
      }

      toastSuccess(`Batch "${name.trim()}" created successfully!`);
      router.push("/batches");
    } catch (err: any) {
      console.error("Batch creation failed", err);
      const msg = err?.message || "Could not reach server to create batch.";
      setFormError(msg);
      toastError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className={styles.dashboardContainer} style={{ maxWidth: "1000px", margin: "0 auto", paddingBottom: "3rem" }}>
      {/* Header with Navigation Breadcrumb */}
      <div
        style={{
          background: "#ffffff",
          border: "1px solid var(--border-light, #ece4d7)",
          borderRadius: "12px",
          padding: "1.25rem 1.5rem",
          boxShadow: "var(--shadow-sm, 0 1px 3px rgba(20, 17, 15, 0.04))",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "1rem",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.85rem", color: "var(--text-muted, #78716a)" }}>
            <Link href="/batches" style={{ textDecoration: "none", color: "var(--accent-primary, #c97a1e)", fontWeight: 600 }}>
              &larr; Batches
            </Link>
            <span>/</span>
            <span>New Batch</span>
          </div>
          <h1 style={{ margin: 0, fontSize: "1.5rem", fontWeight: 700, color: "var(--text-primary, #14110f)", fontFamily: "var(--font-sans)" }}>
            Create New Batch
          </h1>
          {/* <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--text-secondary, #4a443d)" }}>
            Configure batch schedule, assign a batch manager, and specify multi-currency pricing tiers (USD, AED, INR).
          </p> */}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.45rem",
              fontSize: "0.8125rem",
              color: "var(--text-secondary, #4a443d)",
              background: "var(--bg-card-muted, #fdfbf7)",
              padding: "0.4rem 0.75rem",
              borderRadius: "8px",
              border: "1px solid var(--border-light, #ece4d7)",
            }}
          >
            <span style={{ width: "7px", height: "7px", background: "#16a34a", borderRadius: "50%", display: "inline-block" }} />
            <select
              aria-label="Display timezone"
              value={displayTimezone}
              onChange={(e) => setDisplayTimezone(e.target.value)}
              style={{
                background: "transparent",
                border: "none",
                fontSize: "0.8125rem",
                fontWeight: 600,
                color: "var(--text-primary, #14110f)",
                cursor: "pointer",
                outline: "none",
              }}
            >
              {timezoneOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Main Creation Form Card */}
      <form
        onSubmit={handleSubmit}
        style={{
          background: "#ffffff",
          border: "1px solid var(--border-light, #ece4d7)",
          borderRadius: "12px",
          padding: "2rem",
          boxShadow: "var(--shadow-sm, 0 1px 3px rgba(20, 17, 15, 0.04))",
          display: "flex",
          flexDirection: "column",
          gap: "2rem",
        }}
      >
        {formError && (
          <div
            role="alert"
            style={{
              background: "#fee2e2",
              border: "1px solid #fca5a5",
              color: "#991b1b",
              padding: "0.75rem 1rem",
              borderRadius: "8px",
              fontSize: "0.875rem",
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
            }}
          >
            <span style={{ fontWeight: 700 }}>&bull;</span>
            <span>{formError}</span>
          </div>
        )}

        {/* Section 1: Curriculum & Manager */}
        <div>
          <h2 style={{ fontSize: "1.1rem", fontWeight: 700, margin: "0 0 0.5rem 0", color: "var(--text-primary, #14110f)" }}>
            1. Curriculum Program &amp; Manager Assignment
          </h2>
          <p style={{ margin: "0 0 1.25rem 0", fontSize: "0.85rem", color: "var(--text-secondary, #4a443d)" }}>
            Select the course curriculum and assign the manager who has attendance and reconciliation ownership.
          </p>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.25rem" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
              <label style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--text-primary, #14110f)" }}>
                Parent Program <span style={{ color: "var(--accent-primary, #c97a1e)" }}>*</span>
              </label>
              <CustomSelect
                ariaLabel="Select parent program"
                value={programId}
                onChange={handleProgramChange}
                options={programs.map((p) => ({ value: p.id, label: p.title }))}
              />
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
              <label style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--text-primary, #14110f)" }}>
                Batch Manager (Roweena / Staff)
              </label>
              <CustomSelect
                ariaLabel="Select batch manager"
                value={managerId}
                onChange={setManagerId}
                options={[
                  { value: "", label: "-- Unassigned (Global Staff) --" },
                  ...managers.map((m) => ({
                    value: m.id,
                    label: `${m.name || m.email} (${m.role})`,
                  })),
                ]}
              />
            </div>
          </div>
        </div>

        {/* Section 2: Batch Details & Schedule */}
        <div>
          <h2 style={{ fontSize: "1.1rem", fontWeight: 700, margin: "0 0 0.5rem 0", color: "var(--text-primary, #14110f)" }}>
            2. Batch Details &amp; Schedule
          </h2>
          <p style={{ margin: "0 0 1.25rem 0", fontSize: "0.85rem", color: "var(--text-secondary, #4a443d)" }}>
            Define the batch identifier, max learner capacity, and active dates.
          </p>

          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "1.25rem", marginBottom: "1.25rem" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
              <label style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--text-primary, #14110f)" }}>
                Batch Name <span style={{ color: "var(--accent-primary, #c97a1e)" }}>*</span>
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Batch 2026-A (Spring Weekend Masterclass)"
                value={name}
                onChange={(e) => setName(e.target.value)}
                style={{
                  height: "42px",
                  padding: "0.55rem 0.85rem",
                  fontSize: "0.875rem",
                  borderRadius: "8px",
                  border: "1px solid var(--border-light, #ece4d7)",
                  outline: "none",
                }}
              />
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
              <label style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--text-primary, #14110f)" }}>
                Learner Capacity <span style={{ color: "var(--accent-primary, #c97a1e)" }}>*</span>
              </label>
              <input
                type="number"
                min={1}
                max={500}
                required
                value={capacity}
                onChange={(e) => setCapacity(parseInt(e.target.value, 10) || 1)}
                style={{
                  height: "42px",
                  padding: "0.55rem 0.85rem",
                  fontSize: "0.875rem",
                  borderRadius: "8px",
                  border: "1px solid var(--border-light, #ece4d7)",
                  outline: "none",
                }}
              />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.25rem" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
              <label style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--text-primary, #14110f)" }}>
                Start Date <span style={{ color: "var(--accent-primary, #c97a1e)" }}>*</span>
              </label>
              <input
                type="date"
                required
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                style={{
                  height: "42px",
                  padding: "0.55rem 0.85rem",
                  fontSize: "0.875rem",
                  borderRadius: "8px",
                  border: "1px solid var(--border-light, #ece4d7)",
                  outline: "none",
                }}
              />
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
              <label style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--text-primary, #14110f)" }}>
                End Date (Optional)
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                style={{
                  height: "42px",
                  padding: "0.55rem 0.85rem",
                  fontSize: "0.875rem",
                  borderRadius: "8px",
                  border: "1px solid var(--border-light, #ece4d7)",
                  outline: "none",
                }}
              />
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
              <label style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--text-primary, #14110f)", display: "inline-flex", alignItems: "center", gap: "6px" }}>
                <span>Registration Deadline</span>
                <span style={{ color: "var(--accent-primary, #c97a1e)" }}>*</span>
                <div className={styles.helpTooltip}>
                  <span
                    className={styles.helpIcon}
                    aria-label="Registration Cutoff Information"
                    tabIndex={0}
                  >
                    ?
                  </span>
                  <div className={styles.helpTooltipContent}>
                    Learners cannot self-enroll after this date. Admins can manually assign students anytime.
                  </div>
                </div>
              </label>
              <input
                type="date"
                required
                value={registrationDeadline}
                onChange={(e) => setRegistrationDeadline(e.target.value)}
                style={{
                  height: "42px",
                  padding: "0.55rem 0.85rem",
                  fontSize: "0.875rem",
                  borderRadius: "8px",
                  border: "1px solid var(--border-light, #ece4d7)",
                  outline: "none",
                }}
              />
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
              <label style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--text-primary, #14110f)" }}>
                Initial Status
              </label>
              <CustomSelect
                ariaLabel="Initial status"
                value={status}
                onChange={(val) => setStatus(val as any)}
                options={[
                  { value: "UPCOMING", label: "Upcoming (Pre-enrolment)" },
                  { value: "ACTIVE", label: "Active (In Session)" },
                ]}
              />
            </div>
          </div>
        </div>

        {/* Section 3: Multi-Currency Pricing Engine */}
        <div
          style={{
            background: "var(--bg-card-muted, #fdfbf7)",
            padding: "1.5rem",
            borderRadius: "10px",
            border: "1px solid var(--border-light, #ece4d7)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
            <h2 style={{ fontSize: "1.1rem", fontWeight: 700, margin: 0, color: "var(--text-primary, #14110f)" }}>
              3. Multi-Currency Batch Pricing (USD, AED, INR)
            </h2>
            <span
              style={{
                fontSize: "0.75rem",
                fontWeight: 600,
                color: "#16a34a",
                background: "#dcfce7",
                padding: "0.2rem 0.5rem",
                borderRadius: "4px",
              }}
            >
              Multi-Currency Engine
            </span>
          </div>
          <p style={{ margin: "0 0 1.25rem 0", fontSize: "0.85rem", color: "var(--text-secondary, #4a443d)" }}>
            Specify batch-specific price overrides for domestic and international learners. Leave individual currency overrides blank to inherit the program default.
          </p>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: "1.25rem", marginBottom: "1.25rem" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
              <label style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--text-primary, #14110f)" }}>
                Primary Billing Currency
              </label>
              <CustomSelect
                ariaLabel="Primary Currency"
                value={currency}
                onChange={(val) => setCurrency(val as any)}
                options={[
                  { value: "USD", label: "USD ($) · US Dollar" },
                  { value: "AED", label: "AED (د.إ) · UAE Dirham" },
                  { value: "INR", label: "INR (₹) · Indian Rupee" },
                ]}
              />
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
              <label style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--text-primary, #14110f)" }}>
                Base Batch Price ({currency})
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                placeholder="e.g. 499.00"
                value={basePrice}
                onChange={(e) => setBasePrice(e.target.value)}
                style={{
                  height: "42px",
                  padding: "0.55rem 0.85rem",
                  fontSize: "0.875rem",
                  borderRadius: "8px",
                  border: "1px solid var(--border-light, #ece4d7)",
                  outline: "none",
                  background: "#ffffff",
                }}
              />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "1.25rem" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
              <label style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--text-primary, #14110f)" }}>
                USD Price ($)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                placeholder="e.g. 499"
                value={priceUSD}
                onChange={(e) => setPriceUSD(e.target.value)}
                style={{
                  height: "42px",
                  padding: "0.55rem 0.85rem",
                  fontSize: "0.875rem",
                  borderRadius: "8px",
                  border: "1px solid var(--border-light, #ece4d7)",
                  outline: "none",
                  background: "#ffffff",
                }}
              />
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
              <label style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--text-primary, #14110f)" }}>
                AED Price (د.إ)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                placeholder="e.g. 1850"
                value={priceAED}
                onChange={(e) => setPriceAED(e.target.value)}
                style={{
                  height: "42px",
                  padding: "0.55rem 0.85rem",
                  fontSize: "0.875rem",
                  borderRadius: "8px",
                  border: "1px solid var(--border-light, #ece4d7)",
                  outline: "none",
                  background: "#ffffff",
                }}
              />
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
              <label style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--text-primary, #14110f)" }}>
                INR Price (₹)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                placeholder="e.g. 41500"
                value={priceINR}
                onChange={(e) => setPriceINR(e.target.value)}
                style={{
                  height: "42px",
                  padding: "0.55rem 0.85rem",
                  fontSize: "0.875rem",
                  borderRadius: "8px",
                  border: "1px solid var(--border-light, #ece4d7)",
                  outline: "none",
                  background: "#ffffff",
                }}
              />
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            gap: "1rem",
            paddingTop: "1rem",
            borderTop: "1px solid var(--border-light, #ece4d7)",
          }}
        >
          <Link
            href="/batches"
            style={{
              padding: "0.65rem 1.25rem",
              borderRadius: "8px",
              border: "1px solid var(--border-light, #ece4d7)",
              color: "var(--text-secondary, #4a443d)",
              textDecoration: "none",
              fontSize: "0.875rem",
              fontWeight: 600,
            }}
          >
            Cancel
          </Link>

          <button
            type="submit"
            disabled={isSubmitting || isLoading}
            style={{
              background: "var(--accent-primary, #c97a1e)",
              color: "#ffffff",
              border: "none",
              padding: "0.65rem 1.75rem",
              borderRadius: "8px",
              fontSize: "0.875rem",
              fontWeight: 600,
              cursor: isSubmitting ? "not-allowed" : "pointer",
              boxShadow: "0 2px 6px rgba(201, 122, 30, 0.28)",
              opacity: isSubmitting ? 0.7 : 1,
            }}
          >
            {isSubmitting ? "Creating Batch..." : "Create Batch"}
          </button>
        </div>
      </form>
    </div>
  );
}
