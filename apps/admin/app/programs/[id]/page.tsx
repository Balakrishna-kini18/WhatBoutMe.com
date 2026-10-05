"use client";

import { useEffect, useState, FormEvent, use } from "react";
import styles from "../../page.module.css";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface Step {
  id: string;
  sequence: number;
  title: string;
  description: string;
}

export default function ProgramCurriculumPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const programId = resolvedParams.id;
  const router = useRouter();
  const [steps, setSteps] = useState<Step[]>([]);
  const [programTitle, setProgramTitle] = useState("Loading...");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Form states
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [sequence, setSequence] = useState(1);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  useEffect(() => {
    fetchProgram();
    fetchSteps();
  }, []);

  const fetchProgram = async () => {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || `${process.env.NEXT_PUBLIC_API_URL || `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}`}`}/programs`);
      if (res.ok) {
        const data = await res.json();
        const prog = data.find((p: any) => p.id === programId);
        if (prog) setProgramTitle(prog.title);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchSteps = async () => {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || `${process.env.NEXT_PUBLIC_API_URL || `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}`}`}/programs/${programId}/steps`);
      if (res.ok) {
        const data = await res.json();
        setSteps(data);
        setSequence(data.reduce((highest: number, step: Step) => Math.max(highest, step.sequence), 0) + 1);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  const openCreateStep = () => {
    const nextSequence = steps.reduce((highest, step) => Math.max(highest, step.sequence), 0) + 1;
    setSequence(nextSequence);
    setTitle("");
    setDescription("");
    setSaveError("");
    setIsModalOpen(true);
  };

  const handleCreateStep = async (e: FormEvent, continueToContent = false) => {
    e.preventDefault();
    setIsSaving(true);
    setSaveError("");
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || `${process.env.NEXT_PUBLIC_API_URL || `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}`}`}/programs/${programId}/steps`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description,
          sequence: Number(sequence),
        }),
      });
      if (res.ok) {
        const createdStep: Step = await res.json();
        setIsModalOpen(false);
        setTitle("");
        setDescription("");
        if (continueToContent) {
          router.push(`/programs/${programId}/steps/${createdStep.id}`);
        } else {
          fetchSteps();
        }
      } else {
        setSaveError("We couldn't create this module. Please try again.");
      }
    } catch (e) {
      console.error("Failed to create step", e);
      setSaveError("We couldn't create this module. Check your connection and try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteStep = async (stepId: string) => {
    if (!confirm("Are you sure you want to delete this section? This will also delete all associated lessons and quizzes.")) return;
    
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || `${process.env.NEXT_PUBLIC_API_URL || `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}`}`}/programs/steps/${stepId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        fetchSteps();
      } else {
        alert("Failed to delete section.");
      }
    } catch (e) {
      console.error("Error deleting section", e);
    }
  };

  return (
    <div className={styles.dashboard}>
      <header className={styles.header}>
        <div className={styles.headerText}>
          <div style={{display: 'flex', alignItems: 'center', gap: '15px'}}>
            <Link href="/programs" style={{textDecoration: 'none', color: 'var(--primary)', fontSize: '1.2rem'}}>← Back</Link>
            <h1 className={styles.title}>Curriculum: {programTitle}</h1>
          </div>
          <p className={styles.subtitle}>Build the learning path one module at a time, then add videos or quizzes to each module.</p>
        </div>
        <div className={styles.headerActions}>
          <button className={styles.primaryBtn} onClick={openCreateStep}>
            + Add Module
          </button>
        </div>
      </header>

      <section className={styles.tableSection}>
        <div className={styles.sectionHeader}>
          <div>
            <h2>Course modules</h2>
            <p className={styles.sectionSubtitle}>{steps.length} {steps.length === 1 ? "module" : "modules"} in this course</p>
          </div>
        </div>
        
        <div className={styles.tableWrapper}>
          <table className={styles.adminTable}>
            <thead>
              <tr>
                <th>Module</th>
                <th>Module title</th>
                <th>Description</th>
                <th className={styles.alignRight}>Action</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={4} style={{textAlign: "center", padding: "20px"}}>Loading curriculum...</td>
                </tr>
              ) : steps.length === 0 ? (
                <tr><td colSpan={4}>
                  <div className={styles.emptyState}>
                    <strong>Start building your course</strong>
                    <span>Create the first module, then add a video or quiz straight away.</span>
                    <button className={styles.primaryBtn} onClick={openCreateStep}>+ Create first module</button>
                  </div>
                </td></tr>
              ) : [...steps].sort((a,b) => a.sequence - b.sequence).map((step) => (
                <tr key={step.id}>
                  <td><span className={styles.moduleNumber}>Module {step.sequence}</span></td>
                  <td><span className={styles.cellUserName}>{step.title}</span></td>
                  <td><span className={styles.cellTextMuted}>{step.description || "No description"}</span></td>
                  <td className={styles.alignRight}>
                    <div className={styles.rowActions}>
                      <Link href={`/programs/${programId}/steps/${step.id}`} className={styles.primaryBtn}>Add content</Link>
                      <button className={styles.textButton} onClick={() => handleDeleteStep(step.id)}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* CREATE STEP MODAL */}
      {isModalOpen && (
        <div className={styles.modalOverlay} onClick={() => setIsModalOpen(false)}>
          <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div>
                <h2>Create module</h2>
                <p className={styles.modalIntro}>Module {sequence} will be added to the end of this course.</p>
              </div>
              <button className={styles.closeBtn} aria-label="Close create module dialog" onClick={() => setIsModalOpen(false)}>×</button>
            </div>
            
            <form className={styles.modalForm} onSubmit={handleCreateStep}>
              <div className={styles.formGroup}>
                <label htmlFor="module-title">Module title</label>
                <input id="module-title" type="text" placeholder="e.g. Foundations of Resilience" required value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
              </div>
              
              <div className={styles.formGroup}>
                <label htmlFor="module-description">What learners will cover <span className={styles.optionalLabel}>(optional)</span></label>
                <textarea id="module-description" rows={3} placeholder="e.g. Learn the core principles and prepare for the exercises ahead." value={description} onChange={(e) => setDescription(e.target.value)}></textarea>
              </div>

              {saveError && <p className={styles.formError} role="alert">{saveError}</p>}

              <div className={styles.modalFooter}>
                <button type="button" className={styles.secondaryBtn} onClick={() => setIsModalOpen(false)} disabled={isSaving}>Cancel</button>
                <button type="submit" className={styles.secondaryBtn} disabled={isSaving}>Save module</button>
                <button type="button" className={styles.primaryBtn} disabled={isSaving} onClick={(e) => handleCreateStep(e as unknown as FormEvent, true)}>
                  {isSaving ? "Creating..." : "Save & add content"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
