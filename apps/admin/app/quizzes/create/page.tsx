"use client";

import { useEffect, useState } from "react";
import styles from "../../page.module.css";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";

function QuizForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialProgramId = searchParams.get("programId") || "";
  const initialStepId = searchParams.get("stepId") || "";
  
  const [programs, setPrograms] = useState<any[]>([]);
  const [selectedProgramId, setSelectedProgramId] = useState(initialProgramId);
  const [steps, setSteps] = useState<any[]>([]);
  const [selectedStepId, setSelectedStepId] = useState(initialStepId);
  const [passMark, setPassMark] = useState(75);
  const [questions, setQuestions] = useState([{ text: "", options: [{ text: "", isCorrect: true }, { text: "", isCorrect: false }] }]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    fetchPrograms();
  }, []);

  const fetchPrograms = async () => {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || `${process.env.NEXT_PUBLIC_API_URL || `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}`}`}/programs`);
      if (res.ok) {
        const data = await res.json();
        setPrograms(data);
      }
    } catch (e) {
      console.error("Failed to fetch programs", e);
    }
  };

  useEffect(() => {
    if (!selectedProgramId) {
      setSteps([]);
      setSelectedStepId("");
      return;
    }
    const fetchSteps = async () => {
      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || `${process.env.NEXT_PUBLIC_API_URL || `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}`}`}/programs/${selectedProgramId}/steps`);
        if (res.ok) {
          const data = await res.json();
          setSteps(data);
        }
      } catch (e) {
        console.error("Failed to fetch steps", e);
      }
    };
    fetchSteps();
  }, [selectedProgramId]);

  const addQuestion = () => {
    setQuestions([...questions, { text: "", options: [{ text: "", isCorrect: true }, { text: "", isCorrect: false }] }]);
  };

  const updateQuestionText = (index: number, text: string) => {
    const newQ = [...questions];
    if (newQ[index]) newQ[index].text = text;
    setQuestions(newQ);
  };

  const addOption = (qIndex: number) => {
    const newQ = [...questions];
    if (newQ[qIndex]) newQ[qIndex].options.push({ text: "", isCorrect: false });
    setQuestions(newQ);
  };

  const updateOptionText = (qIndex: number, oIndex: number, text: string) => {
    const newQ = [...questions];
    if (newQ[qIndex] && newQ[qIndex].options[oIndex]) {
      newQ[qIndex].options[oIndex].text = text;
    }
    setQuestions(newQ);
  };

  const setCorrectOption = (qIndex: number, oIndex: number) => {
    const newQ = [...questions];
    if (newQ[qIndex]) {
      newQ[qIndex].options.forEach((o, i) => {
        o.isCorrect = i === oIndex;
      });
    }
    setQuestions(newQ);
  };

  const removeQuestion = (qIndex: number) => {
    const newQ = [...questions];
    newQ.splice(qIndex, 1);
    setQuestions(newQ);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStepId) return alert("Please select a step.");
    if (isSubmitting) return;
    
    setIsSubmitting(true);

    const payload = {
      stepId: selectedStepId,
      passMark: passMark,
      questions: {
        create: questions.map(q => ({
          text: q.text,
          options: {
            create: q.options.map(o => ({
              text: o.text,
              isCorrect: o.isCorrect
            }))
          }
        }))
      }
    };

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || `${process.env.NEXT_PUBLIC_API_URL || `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}`}`}/quizzes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        router.push("/quizzes");
      } else {
        alert("Failed to create quiz. Step might already have a quiz.");
        setIsSubmitting(false);
      }
    } catch (error) {
      console.error(error);
      alert("Error creating quiz");
      setIsSubmitting(false);
    }
  };

  return (
    <div className={styles.dashboard}>
      <header className={styles.header}>
        <div className={styles.headerText}>
          <div style={{display: 'flex', alignItems: 'center', gap: '15px'}}>
            <Link href="/quizzes" style={{textDecoration: 'none', color: 'var(--primary)', fontSize: '1.2rem'}}>← Back</Link>
            <h1 className={styles.title}>Create Assessment (Quiz)</h1>
          </div>
          <p className={styles.subtitle}>Build interactive quizzes with multiple choices.</p>
        </div>
      </header>

      <form onSubmit={handleSubmit} className={styles.quizFormCard}>
        
        <div className={styles.formRow}>
          <div className={styles.formGroup} style={{ flex: 1.5 }}>
            <label>Select Program</label>
            <select value={selectedProgramId} onChange={e => { setSelectedProgramId(e.target.value); setSelectedStepId(""); }} required>
              <option value="">Select a program...</option>
              {programs.map(p => (
                <option key={p.id} value={p.id}>{p.title}</option>
              ))}
            </select>
          </div>
          <div className={styles.formGroup} style={{ flex: 1.5 }}>
            <label>Link to Step / Lesson</label>
            <select value={selectedStepId} onChange={e => setSelectedStepId(e.target.value)} required disabled={!selectedProgramId}>
              <option value="">{selectedProgramId ? "Select a step..." : "Select program first"}</option>
              {steps.map(s => (
                <option key={s.id} value={s.id}>Step {s.sequence}: {s.title}</option>
              ))}
            </select>
          </div>
          <div className={styles.formGroup} style={{ maxWidth: '200px' }}>
            <label>Passing Score (%)</label>
            <input type="number" min="0" max="100" value={passMark} onChange={e => setPassMark(parseInt(e.target.value))} required />
          </div>
        </div>

        <div style={{marginTop: '2.5rem'}}>
          <h2 className={styles.quizSectionTitle}>Questions</h2>
          
          {questions.map((q, qIdx) => (
            <div key={qIdx} className={styles.questionCard}>
              <div className={styles.questionHeader}>
                <h3>Question {qIdx + 1}</h3>
                {questions.length > 1 && (
                  <button type="button" onClick={() => removeQuestion(qIdx)} className={styles.removeBtn}>Remove</button>
                )}
              </div>
              
              <div className={styles.formGroup}>
                <input type="text" placeholder="Enter question text here..." value={q.text} onChange={e => updateQuestionText(qIdx, e.target.value)} required />
              </div>

              <div style={{marginTop: '1.5rem'}}>
                <p style={{fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em'}}>Options (Select the correct one)</p>
                {q.options.map((opt, oIdx) => (
                  <div key={oIdx} className={styles.optionRow}>
                    <input type="radio" name={`correct_${qIdx}`} checked={opt.isCorrect} onChange={() => setCorrectOption(qIdx, oIdx)} className={styles.optionRadio} />
                    <input type="text" placeholder={`Option ${oIdx + 1}`} value={opt.text} onChange={e => updateOptionText(qIdx, oIdx, e.target.value)} className={styles.optionInput} required />
                  </div>
                ))}
                <button type="button" onClick={() => addOption(qIdx)} className={styles.addOptionBtn}>+ Add Option</button>
              </div>
            </div>
          ))}

          <button type="button" onClick={addQuestion} className={styles.dashedAddBtn}>
            + Add New Question
          </button>
        </div>

        <div className={styles.modalFooter} style={{marginTop: '3rem'}}>
          <button type="button" className={styles.secondaryBtn} onClick={() => router.push('/quizzes')}>Cancel</button>
          <button type="submit" className={styles.primaryBtn} disabled={isSubmitting}>
            {isSubmitting ? "Saving..." : "Save Assessment"}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function CreateQuizPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <QuizForm />
    </Suspense>
  );
}
