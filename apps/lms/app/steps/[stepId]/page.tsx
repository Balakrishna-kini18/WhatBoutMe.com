"use client";

import { useEffect, useState, use } from "react";
import styles from "./step.module.css";
import Link from "next/link";
import MuxPlayer from "@mux/mux-player-react";

export default function StepPage({ params }: { params: Promise<{ stepId: string }> }) {
  const unwrappedParams = use(params);
  const stepId = unwrappedParams.stepId;
  const [step, setStep] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [playbackId, setPlaybackId] = useState<string | null>(null);
  const [playbackToken, setPlaybackToken] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [quizResult, setQuizResult] = useState<{ passed: boolean; score: number; message: string } | null>(null);

  useEffect(() => {
    // Add auth token if we had a proper fetch abstraction
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    const headers: any = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/programs/steps/${stepId}`, { headers })
      .then(res => res.json())
      .then(data => {
        setStep(data);
        
        const lesson = data.lessons?.find((l: any) => l.type !== "PDF");
        
        if (lesson && lesson.id) {
          // Fetch the secure playback token from the API
          fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/mux/secure-playback/${lesson.id}`, { headers })
            .then(r => r.json())
            .then(muxData => {
              if (muxData.token) {
                setPlaybackToken(muxData.token);
                setPlaybackId(muxData.playbackId);
              } else {
                setPlaybackId("DS00Spx1CV902MCtPj5WknGlR102V5HFkDe");
              }
              setLoading(false);
            })
            .catch(() => {
              setPlaybackId("DS00Spx1CV902MCtPj5WknGlR102V5HFkDe"); // Fallback
              setLoading(false);
            });
        } else {
          setLoading(false);
        }
      })
      .catch(err => {
        console.error(err);
        setLoading(false);
      });
  }, [stepId]);

  if (loading) {
    return (
      <div className={styles.container}>
        <div style={{ textAlign: "center", padding: "60px 20px" }}>Loading step...</div>
      </div>
    );
  }

  if (!step) {
    return (
      <div className={styles.container}>
        <div style={{ textAlign: "center", padding: "60px 20px" }}>Step not found.</div>
      </div>
    );
  }

  const lesson = step.lessons?.find((l: any) => l.type !== "PDF"); // first video
  const documents = (step.lessons || []).filter((l: any) => l.type === "PDF");
  const quiz = step.quiz;

  // Tells the server the step is finished, so progress and today's attendance
  // are recorded on the account and not only in this browser.
  const recordCompletion = (score?: number) => {
    const token = localStorage.getItem("token");
    if (!token) return;
    fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000"}/programs/steps/${stepId}/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(score === undefined ? {} : { score }),
    }).catch(() => {});
  };

  const handleOptionChange = (qId: string, oId: string) => {
    setAnswers(prev => ({ ...prev, [qId]: oId }));
  };

  const handleQuizSubmit = () => {
    if (!quiz || !quiz.questions) return;
    
    let correctCount = 0;
    quiz.questions.forEach((q: any) => {
      const selectedOptionId = answers[q.id];
      const correctOption = q.options.find((o: any) => o.isCorrect);
      if (correctOption && selectedOptionId === correctOption.id) {
        correctCount++;
      }
    });

    const scorePercentage = Math.round((correctCount / quiz.questions.length) * 100);
    const passed = scorePercentage >= quiz.passMark;
    
    if (passed) {
      if (step && step.programId) {
        const nextSequence = (step.sequence || 1) + 1;
        const currentProgress = parseInt(localStorage.getItem(`progress_${step.programId}`) || "1", 10);
        if (nextSequence > currentProgress) {
          localStorage.setItem(`progress_${step.programId}`, nextSequence.toString());
        }
      }
      recordCompletion(scorePercentage);
      setQuizResult({ passed: true, score: scorePercentage, message: `Great job! You scored ${scorePercentage}% and passed the step.` });
    } else {
      setQuizResult({ passed: false, score: scorePercentage, message: `You scored ${scorePercentage}%. You need ${quiz.passMark}% to pass. Try again!` });
    }
  };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <Link href="/" className={styles.backBtn}>← Back to Roadmap</Link>
        <h1 className={styles.title}>Step {step.sequence}: {step.title}</h1>
        <p className={styles.subtitle}>{step.description}</p>
      </header>

      <div className={styles.contentGrid}>
        <div className={styles.mainColumn}>
          {lesson ? (
            <div className={styles.videoContainer}>
              <MuxPlayer
                playbackId={playbackId || "DS00Spx1CV902MCtPj5WknGlR102V5HFkDe"}
                tokens={playbackToken ? { playback: playbackToken } : undefined}
                metadata={{ video_title: lesson.title }}
                // a step with no quiz is finished when its video ends
                onEnded={() => {
                  if (!quiz) recordCompletion();
                }}
                style={{ width: "100%", aspectRatio: "16/9" }}
              />
              <div style={{ marginTop: "10px", fontWeight: "bold" }}>{lesson.title}</div>
            </div>
          ) : (
            <div className={styles.videoContainer}>
              <div className={styles.videoPlaceholder} style={{ textAlign: "center", padding: "40px", background: "var(--bg-soft)", borderRadius: "12px" }}>
                <p>No video content uploaded for this step yet.</p>
              </div>
            </div>
          )}

          {documents.length > 0 && (
            <div style={{ marginTop: "24px" }}>
              <h2 style={{ fontSize: "1.1rem", margin: "0 0 12px" }}>Documents</h2>
              <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "8px" }}>
                {documents.map((doc: any) => (
                  <li key={doc.id}>
                    <a
                      href={doc.mediaUrl}
                      target="_blank"
                      rel="noreferrer"
                      style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", padding: "14px 16px", border: "1px solid var(--border-light)", borderRadius: "12px", background: "var(--bg-card)", color: "var(--text-primary)", textDecoration: "none", fontWeight: 600 }}
                    >
                      <span>{doc.title}</span>
                      <span style={{ color: "var(--accent-primary)", fontSize: "0.85rem" }}>Open PDF</span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
          
          <div className={styles.descriptionCard} style={{ marginTop: "20px" }}>
            <h3>About this step</h3>
            <p>{step.description || "No detailed description available."}</p>
          </div>
        </div>

        <div className={styles.sideColumn}>
          {/* Quiz Section */}
          <div className={styles.quizCard}>
            <h3>Knowledge Check</h3>
            {quiz ? (
              <>
                <p className={styles.quizDesc}>You must score {quiz.passMark}% to unlock the next step.</p>
                {quizResult && (
                  <div style={{ padding: "12px", borderRadius: "8px", marginBottom: "15px", backgroundColor: quizResult.passed ? "var(--status-success-bg)" : "var(--status-error-bg)", color: quizResult.passed ? "var(--status-success)" : "var(--status-error)" }}>
                    <strong>{quizResult.passed ? "Passed!" : "Keep Trying!"}</strong>
                    <p style={{ margin: "4px 0 0 0", fontSize: "0.9rem" }}>{quizResult.message}</p>
                  </div>
                )}
                
                {!quizResult?.passed ? (
                  <>
                    {quiz.questions?.map((q: any, i: number) => (
                      <div key={q.id} className={styles.question} style={{ marginBottom: "15px" }}>
                        <p style={{ fontWeight: "600", marginBottom: "8px" }}>{i + 1}. {q.text}</p>
                        <div className={styles.options} style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                          {q.options?.map((opt: any) => (
                            <label key={opt.id} className={styles.option} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "10px", background: answers[q.id] === opt.id ? "var(--accent-highlight)" : "var(--bg-soft)", border: answers[q.id] === opt.id ? "1px solid var(--accent-primary)" : "1px solid transparent", borderRadius: "6px", cursor: "pointer" }}>
                              <input type="radio" name={`q_${q.id}`} value={opt.id} checked={answers[q.id] === opt.id} onChange={() => handleOptionChange(q.id, opt.id)} /> 
                              {opt.text}
                            </label>
                          ))}
                        </div>
                      </div>
                    ))}
                    <button className={styles.submitBtn} style={{ marginTop: "15px" }} onClick={handleQuizSubmit} disabled={Object.keys(answers).length !== quiz.questions.length}>
                      {Object.keys(answers).length !== quiz.questions.length ? "Answer all questions" : "Submit Quiz"}
                    </button>
                  </>
                ) : (
                  <div style={{ textAlign: "center", padding: "20px 0" }}>
                    <h3 style={{ marginBottom: "15px" }}>Ready for the next step?</h3>
                    <Link href={`/programs/${step.programId}/steps`} className={styles.submitBtn} style={{ textDecoration: "none", display: "inline-block" }}>
                      Continue to Next Step &rarr;
                    </Link>
                  </div>
                )}
              </>
            ) : (
              <p>No quiz created for this step yet.</p>
            )}
          </div>
          
          {/* Resources */}
          <div className={styles.resourceCard} style={{ marginTop: "20px" }}>
            <h3>Resources</h3>
            <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem" }}>No resources attached.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
