"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import dash from "../../../page.module.css";
import styles from "./path.module.css";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

interface Step {
  id: string;
  sequence: number;
  title: string;
  description?: string | null;
}

const stroke = { fill: "none", stroke: "currentColor", strokeWidth: 2.5, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
const Check = <svg width="14" height="14" viewBox="0 0 24 24" {...stroke}><polyline points="20 6 9 17 4 12" /></svg>;
const Lock = <svg width="14" height="14" viewBox="0 0 24 24" {...stroke}><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>;

/** A course's steps as a timeline: done, current and locked. */
export default function ProgramStepsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [steps, setSteps] = useState<Step[]>([]);
  const [loading, setLoading] = useState(true);
  const [unlockedSequence, setUnlockedSequence] = useState(1);

  useEffect(() => {
    fetch(`${API_URL}/programs/${id}/steps`)
      .then((res) => {
        if (!res.ok) throw new Error("Unauthorized or failed to fetch");
        return res.json();
      })
      .then((data) => {
        setSteps(Array.isArray(data) ? data : []);
        // progress is kept in this browser
        const saved = localStorage.getItem(`progress_${id}`);
        if (saved) setUnlockedSequence(parseInt(saved, 10));
      })
      .catch((e) => console.error("Failed to fetch steps", e))
      .finally(() => setLoading(false));
  }, [id]);

  const total = steps.length;
  const done = steps.filter((s) => s.sequence < unlockedSequence).length;
  const percent = total ? Math.round((done / total) * 100) : 0;
  const current = steps.find((s) => s.sequence === unlockedSequence);
  const RING = 2 * Math.PI * 52;

  return (
    <div className={dash.dashboard}>
      <header className={dash.pageHeader}>
        <div>
          <Link href="/" className={styles.back}>&larr; Back to Dashboard</Link>
          <h1 className={dash.pageTitle}>Your Learning Path</h1>
          <p className={dash.pageSubtitle}>Complete the steps in order to unlock your certificate.</p>
        </div>
      </header>

      <div className={dash.board}>
        <div className={dash.boardMain}>
          <section className={`${dash.panel} ${dash.grow}`}>
            <div className={dash.panelHead}>
              <h2>Steps</h2>
              <span className={styles.count}>{loading ? "" : `${done} of ${total} completed`}</span>
            </div>

            {loading ? (
              <p className={dash.empty}>Loading your learning path...</p>
            ) : total === 0 ? (
              <p className={dash.empty}>The curriculum for this course is being built. Check back soon.</p>
            ) : (
              <ol className={styles.timeline}>
                {steps.map((step) => {
                  const isDone = step.sequence < unlockedSequence;
                  const isCurrent = step.sequence === unlockedSequence;
                  const state = isDone ? styles.done : isCurrent ? styles.current : styles.locked;
                  return (
                    <li key={step.id} className={`${styles.step} ${state}`}>
                      <span className={styles.marker}>{isDone ? Check : isCurrent ? step.sequence : Lock}</span>
                      <div className={styles.stepBody}>
                        <p className={styles.kicker}>Step {step.sequence}</p>
                        <h3>{step.title}</h3>
                        {step.description && <p className={dash.muted}>{step.description}</p>}
                      </div>
                      {isCurrent ? (
                        <Link href={`/steps/${step.id}`} className={dash.darkBtn}>Start Step</Link>
                      ) : isDone ? (
                        <Link href={`/steps/${step.id}`} className={dash.secondaryBtn}>Review</Link>
                      ) : (
                        <span className={`${dash.pill} ${dash.pillOff}`}>Locked</span>
                      )}
                    </li>
                  );
                })}
              </ol>
            )}
          </section>
        </div>

        <aside className={dash.boardSide}>
          <section className={dash.panel}>
            <div className={dash.panelHead}>
              <h2>Progress</h2>
            </div>
            <div className={dash.ringWrap}>
              <svg width="132" height="132" viewBox="0 0 120 120" role="img" aria-label={`${percent}% complete`}>
                <circle cx="60" cy="60" r="52" fill="none" stroke="var(--border-light)" strokeWidth="10" />
                <circle cx="60" cy="60" r="52" fill="none" stroke="var(--accent-secondary)" strokeWidth="10" strokeLinecap="round" strokeDasharray={RING} strokeDashoffset={RING * (1 - percent / 100)} transform="rotate(-90 60 60)" />
                <text x="60" y="67" textAnchor="middle" fontSize="24" fontWeight="800" fill="var(--text-primary)">{percent}%</text>
              </svg>
              <p className={dash.muted}>{done} of {total} steps completed</p>
            </div>
          </section>

          <section className={`${dash.panel} ${dash.nextPanel}`}>
            <p className={dash.kicker}>Up Next</p>
            {current ? (
              <>
                <h3>{current.title}</h3>
                <p>Step {current.sequence} of {total}</p>
                <Link href={`/steps/${current.id}`} className={dash.goldBtn}>Start Step</Link>
              </>
            ) : (
              <p>{loading ? "Loading..." : total === 0 ? "Steps will appear here once they are added." : "You have completed every step."}</p>
            )}
          </section>

          <section className={`${dash.panel} ${dash.grow}`}>
            <div className={dash.panelHead}>
              <h2>How It Works</h2>
            </div>
            <ul className={styles.notes}>
              <li>Steps unlock one after another.</li>
              <li>Each step closes with a short quiz.</li>
              <li>You can review a finished step at any time.</li>
            </ul>
          </section>
        </aside>
      </div>
    </div>
  );
}
