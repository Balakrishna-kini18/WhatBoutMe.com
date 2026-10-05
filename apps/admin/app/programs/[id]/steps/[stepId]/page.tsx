"use client";

import { useEffect, useState, use } from "react";
import styles from "../../../../page.module.css";
import Link from "next/link";
import MuxUploader from "@mux/mux-uploader-react";
import { API_URL, errorMessage, uploadFile } from "../../../../lib/api";

interface Lesson {
  id: string;
  title: string;
  type: string;
  mediaUrl: string;
}

interface StepDetails {
  title: string;
  description?: string;
}

export default function StepLessonsPage({ params }: { params: Promise<{ id: string, stepId: string }> }) {
  const resolvedParams = use(params);
  const { id: programId, stepId } = resolvedParams;
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [quiz, setQuiz] = useState<any>(null);
  const [step, setStep] = useState<StepDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [uploadUrl, setUploadUrl] = useState("");
  const [uploadId, setUploadId] = useState("");
  const [title, setTitle] = useState("");
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploadError, setUploadError] = useState("");
  const [pdfStatus, setPdfStatus] = useState("");

  // Upload a PDF and add it to this module as a lesson
  const handlePdfSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setPdfStatus("Uploading PDF...");
    try {
      const url = await uploadFile(file);
      const res = await fetch(`${API_URL}/programs/steps/${stepId}/lessons`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: file.name.replace(/\.pdf$/i, ""), type: "PDF", mediaUrl: url }),
      });
      if (!res.ok) throw new Error(await errorMessage(res, "The PDF uploaded, but could not be added to this module"));
      setPdfStatus("");
      fetchLessons();
    } catch (err) {
      setPdfStatus(err instanceof Error ? err.message : "Could not upload the PDF.");
    }
  };

  useEffect(() => {
    fetchLessons();
  }, []);

  const fetchLessons = async () => {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || `${process.env.NEXT_PUBLIC_API_URL || `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}`}`}/programs/steps/${stepId}`);
      if (res.ok) {
        const data = await res.json();
        setStep(data);
        setLessons(data.lessons || []);
        setQuiz(data.quiz || null);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteLesson = async (lessonId: string) => {
    if (!confirm("Are you sure you want to delete this lesson?")) return;
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || `${process.env.NEXT_PUBLIC_API_URL || `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}`}`}/programs/lessons/${lessonId}`, {
        method: "DELETE"
      });
      if (res.ok) {
        fetchLessons();
      } else {
        alert("Failed to delete lesson");
      }
    } catch (e) {
      console.error(e);
    }
  };

  const openUploadModal = async () => {
    setTitle("");
    setUploadUrl("");
    setUploadProgress(null);
    setUploadError("");
    setIsModalOpen(true);
    
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || `${process.env.NEXT_PUBLIC_API_URL || `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}`}`}/mux/upload-url`, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setUploadUrl(data.url);
        setUploadId(data.uploadId);
      }
    } catch (e) {
      console.error("Failed to get upload URL", e);
      setUploadError("We couldn't prepare a secure upload. Please close this window and try again.");
    }
  };

  const handleUploadSuccess = async () => {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || `${process.env.NEXT_PUBLIC_API_URL || `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}`}`}/programs/steps/${stepId}/lessons`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title || "New Video Lesson",
          type: "VIDEO",
          mediaUrl: `upload:${uploadId}`, // Save as uploadId with a prefix
        }),
      });
      if (res.ok) {
        setIsModalOpen(false);
        fetchLessons();
      }
    } catch (e) {
      console.error("Failed to save lesson", e);
      setUploadError("Your video uploaded, but we couldn't add it to this module. Please try again.");
    }
  };

  return (
    <div className={styles.dashboard}>
      <header className={styles.header}>
        <div className={styles.headerText}>
          <div style={{display: 'flex', alignItems: 'center', gap: '15px'}}>
            <Link href={`/programs/${programId}`} style={{textDecoration: 'none', color: 'var(--primary)', fontSize: '1.2rem'}}>← Back to Sections</Link>
            <h1 className={styles.title}>{step?.title || "Module content"}</h1>
          </div>
          <p className={styles.subtitle}>{step?.description || "Add the learning content for this module."}</p>
        </div>
        <div className={styles.headerActions}>
          <Link href={`/quizzes/create?programId=${programId}&stepId=${stepId}`} className={styles.secondaryBtn}>
            + Add quiz
          </Link>
          <label className={styles.secondaryBtn} style={{ cursor: 'pointer', margin: 0 }}>
            + Add PDF
            <input type="file" accept="application/pdf" onChange={handlePdfSelected} style={{ display: 'none' }} />
          </label>
          <button className={styles.primaryBtn} onClick={openUploadModal}>
            + Add video
          </button>
        </div>
      </header>

      {pdfStatus && (
        <p role="status" style={{ margin: '0 0 1rem', padding: '0.75rem 1rem', borderRadius: '8px', background: 'var(--bg-main)', fontSize: '0.9rem' }}>{pdfStatus}</p>
      )}

      <section className={styles.tableSection}>
        <div className={styles.sectionHeader}>
          <div>
            <h2>Learning content</h2>
            <p className={styles.sectionSubtitle}>{lessons.length + (quiz ? 1 : 0)} {lessons.length + (quiz ? 1 : 0) === 1 ? "item" : "items"} in this module</p>
          </div>
        </div>
        
        <div className={styles.tableWrapper}>
          <table className={styles.adminTable}>
            <thead>
              <tr>
                <th>Title</th>
                <th>Type</th>
                <th>Status</th>
                <th className={styles.alignRight}>Action</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={4} style={{textAlign: "center", padding: "20px"}}>Loading lessons...</td>
                </tr>
              ) : lessons.length === 0 && !quiz ? (
                <tr><td colSpan={4}>
                  <div className={styles.emptyState}>
                    <strong>This module is ready for content</strong>
                    <span>Add a video lesson, a knowledge-check quiz, or both.</span>
                    <div className={styles.rowActions}>
                      <button className={styles.primaryBtn} onClick={openUploadModal}>+ Add video</button>
                      <Link href={`/quizzes/create?programId=${programId}&stepId=${stepId}`} className={styles.secondaryBtn}>+ Add quiz</Link>
                    </div>
                  </div>
                </td></tr>
              ) : lessons.map((lesson) => (
                <tr key={lesson.id}>
                  <td><span className={styles.cellUserName}>{lesson.title}</span></td>
                  <td><span className={styles.cellTextMuted}>{lesson.type}</span></td>
                  <td><span className={`${styles.statusChip} ${styles.active}`}>Ready</span></td>
                  <td className={styles.alignRight}>
                    <button className={styles.secondaryBtn} style={{color: 'red'}} onClick={() => handleDeleteLesson(lesson.id)}>Delete</button>
                  </td>
                </tr>
              ))}
              
              {/* Render Quiz if it exists */}
              {quiz && (
                <tr style={{ background: "var(--bg-main)" }}>
                  <td>
                    <span className={styles.cellUserName}>{quiz.title}</span>
                    <br/>
                    <small style={{color: "var(--text-secondary)"}}>{quiz.questions?.length || 0} Questions</small>
                  </td>
                  <td><span className={styles.cellTextMuted}>QUIZ</span></td>
                  <td><span className={`${styles.statusChip} ${styles.active}`}>Ready</span></td>
                  <td className={styles.alignRight}>
                    <Link href={`/quizzes/${quiz.id}/edit`} className={styles.secondaryBtn} style={{marginRight: '10px', textDecoration: 'none'}}>Edit</Link>
                    <button className={styles.secondaryBtn} style={{color: 'red'}} onClick={async () => {
                      if(confirm('Delete this quiz?')) {
                        await fetch(`${process.env.NEXT_PUBLIC_API_URL || `${process.env.NEXT_PUBLIC_API_URL || `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}`}`}/quizzes/${quiz.id}`, { method: 'DELETE' });
                        fetchLessons();
                      }
                    }}>Delete</button>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* UPLOAD MODAL */}
      {isModalOpen && (
        <div className={styles.modalOverlay} onClick={() => setIsModalOpen(false)}>
          <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div>
                <h2>Add video lesson</h2>
                <p className={styles.modalIntro}>Give the lesson a clear name, then choose the video file to upload.</p>
              </div>
              <button className={styles.closeBtn} aria-label="Close add video dialog" onClick={() => setIsModalOpen(false)}>×</button>
            </div>
            
            <div className={styles.modalForm}>
              <div className={styles.formGroup}>
                <label htmlFor="lesson-title">Lesson title</label>
                <input id="lesson-title" type="text" placeholder="e.g. Introduction to resilience" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
              </div>

              <div className={styles.formGroup} style={{marginTop: '20px'}}>
                <label>Select video file</label>
                {uploadUrl ? (
                  <>
                    <MuxUploader
                      endpoint={uploadUrl}
                      onSuccess={handleUploadSuccess}
                      onProgress={(e: any) => setUploadProgress(e.detail)}
                    />
                    {uploadProgress !== null && (
                      <div style={{ marginTop: '15px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '0.85rem', fontWeight: '500', color: 'var(--textSecondary)' }}>
                          <span>Uploading...</span>
                          <span>{Math.round(uploadProgress)}%</span>
                        </div>
                        <div style={{ width: '100%', backgroundColor: '#eaeaea', borderRadius: '8px', height: '10px', overflow: 'hidden' }}>
                          <div style={{ 
                            width: `${uploadProgress}%`, 
                            backgroundColor: 'var(--primary)', 
                            height: '100%', 
                            borderRadius: '8px',
                            transition: 'width 0.2s ease-in-out'
                          }} />
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <p className={styles.cellTextMuted}>Preparing a secure upload…</p>
                )}
              </div>
              {uploadError && <p className={styles.formError} role="alert">{uploadError}</p>}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
