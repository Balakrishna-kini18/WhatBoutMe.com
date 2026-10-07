"use client";

import { useEffect, useState, FormEvent } from "react";
import styles from "../../page.module.css";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { API_URL, errorMessage } from "../../lib/api";

interface ProgramOption {
  id: string;
  title: string;
}

interface ManagerOption {
  id: string;
  name: string;
  email: string;
  role: string;
}

export default function CreateBatchPage() {
  const router = useRouter();

  const [programs, setPrograms] = useState<ProgramOption[]>([]);
  const [managers, setManagers] = useState<ManagerOption[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(true);

  const [name, setName] = useState("");
  const [programId, setProgramId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [capacity, setCapacity] = useState<number | "">(50);
  const [managerId, setManagerId] = useState("");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    async function loadOptions() {
      setLoadingOptions(true);
      try {
        const token = localStorage.getItem("token");
        const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};

        const [pRes, uRes] = await Promise.all([
          fetch(`${API_URL}/programs`, { headers }),
          fetch(`${API_URL}/users?limit=100`, { headers }),
        ]);

        if (pRes.ok) {
          const pData = await pRes.json();
          setPrograms(pData);
          if (pData.length > 0) setProgramId(pData[0].id);
        }

        if (uRes.ok) {
          const uJson = await uRes.json();
          const userList = uJson.data || uJson || [];
          const eligibleManagers = userList.filter(
            (u: any) => u.role === "MANAGER" || u.role === "ADMIN" || u.role === "SUPER_ADMIN"
          );
          setManagers(eligibleManagers);
          if (eligibleManagers.length > 0) setManagerId(eligibleManagers[0].id);
        }
      } catch (err: any) {
        console.error("Failed to load options:", err);
      } finally {
        setLoadingOptions(false);
      }
    }
    loadOptions();
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setFormError("Batch name is required.");
      return;
    }
    if (!programId) {
      setFormError("Please select a program.");
      return;
    }
    if (!startDate) {
      setFormError("Start date is required.");
      return;
    }

    setIsSubmitting(true);
    setFormError(null);

    try {
      const token = localStorage.getItem("token");
      const payload: any = {
        name: name.trim(),
        programId,
        startDate: new Date(startDate).toISOString(),
        capacity: Number(capacity) || 50,
      };

      if (endDate) {
        payload.endDate = new Date(endDate).toISOString();
      }

      if (managerId) {
        payload.managerId = managerId;
      }

      const res = await fetch(`${API_URL}/batches`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        throw new Error(await errorMessage(res, "Failed to create batch"));
      }

      router.push("/batches");
    } catch (err: any) {
      setFormError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className={styles.dashboard}>
      <header className={styles.header}>
        <div className={styles.headerText}>
          <Link href="/batches" className={styles.backLink}>← Back to Batches</Link>
          <h1 className={styles.title}>Create New Batch Cohort</h1>
          <p className={styles.subtitle}>Set up a scheduled cohort, set student capacity, and assign a cohort manager.</p>
        </div>
      </header>

      {formError && (
        <div style={{ backgroundColor: "#fef2f2", border: "1px solid #f87171", color: "#991b1b", padding: "12px 16px", borderRadius: "8px", marginBottom: "1.5rem", maxWidth: "800px" }}>
          ⚠️ {formError}
        </div>
      )}

      <section className={styles.tableSection} style={{ padding: "2rem", maxWidth: "800px" }}>
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          <div className={styles.formGroup}>
            <label style={{ fontSize: "0.9rem", fontWeight: 600, display: "block", marginBottom: "6px" }}>
              Batch Name <span style={{ color: "#ef4444" }}>*</span>
            </label>
            <input
              type="text"
              placeholder="e.g. November Cohort 2026"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={styles.formInput}
              required
              style={{ width: "100%" }}
            />
          </div>

          <div className={styles.formGroup}>
            <label style={{ fontSize: "0.9rem", fontWeight: 600, display: "block", marginBottom: "6px" }}>
              Program <span style={{ color: "#ef4444" }}>*</span>
            </label>
            <select
              value={programId}
              onChange={(e) => setProgramId(e.target.value)}
              className={styles.formInput}
              required
              disabled={loadingOptions}
              style={{ width: "100%" }}
            >
              {programs.length === 0 ? (
                <option value="">Loading programs...</option>
              ) : (
                programs.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))
              )}
            </select>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem" }}>
            <div className={styles.formGroup}>
              <label style={{ fontSize: "0.9rem", fontWeight: 600, display: "block", marginBottom: "6px" }}>
                Start Date <span style={{ color: "#ef4444" }}>*</span>
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className={styles.formInput}
                required
                style={{ width: "100%" }}
              />
            </div>
            <div className={styles.formGroup}>
              <label style={{ fontSize: "0.9rem", fontWeight: 600, display: "block", marginBottom: "6px" }}>
                End Date (Optional)
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className={styles.formInput}
                style={{ width: "100%" }}
              />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem" }}>
            <div className={styles.formGroup}>
              <label style={{ fontSize: "0.9rem", fontWeight: 600, display: "block", marginBottom: "6px" }}>
                Assigned Cohort Manager
              </label>
              <select
                value={managerId}
                onChange={(e) => setManagerId(e.target.value)}
                className={styles.formInput}
                disabled={loadingOptions}
                style={{ width: "100%" }}
              >
                <option value="">Unassigned</option>
                {managers.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({m.role})
                  </option>
                ))}
              </select>
            </div>

            <div className={styles.formGroup}>
              <label style={{ fontSize: "0.9rem", fontWeight: 600, display: "block", marginBottom: "6px" }}>
                Capacity (Max Students) <span style={{ color: "#ef4444" }}>*</span>
              </label>
              <input
                type="number"
                min={1}
                value={capacity}
                onChange={(e) => setCapacity(e.target.value === "" ? "" : Number(e.target.value))}
                className={styles.formInput}
                required
                style={{ width: "100%" }}
              />
            </div>
          </div>

          <div style={{ marginTop: "1rem", display: "flex", gap: "12px", justifyContent: "flex-end" }}>
            <Link
              href="/batches"
              className={styles.secondaryBtn}
              style={{ padding: "10px 20px", textDecoration: "none" }}
            >
              Cancel
            </Link>
            <button
              type="submit"
              className={styles.primaryBtn}
              disabled={isSubmitting}
              style={{ padding: "10px 24px" }}
            >
              {isSubmitting ? "Creating Batch..." : "Create Batch"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
