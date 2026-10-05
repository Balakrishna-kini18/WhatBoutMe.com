"use client";

import { useEffect, useState, FormEvent } from "react";
import styles from "../page.module.css";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatCourseInfo, parseCourseInfo } from "./courseInfo";
import { uploadFile } from "../lib/api";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

interface Program {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  price: number;
  isActive: boolean;
}

const slugify = (text: string) =>
  text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)+/g, "");

export default function ProgramsPage() {
  const router = useRouter();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProgramId, setEditingProgramId] = useState<string | null>(null);
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Form states
  const [title, setTitle] = useState("");
  const [type, setType] = useState("Certification");
  const [price, setPrice] = useState("");
  const [description, setDescription] = useState("");
  const [isActive, setIsActive] = useState(true);
  // Shown on the public website; saved inside the description text
  const [duration, setDuration] = useState("");
  const [audience, setAudience] = useState("");
  const [inPerson, setInPerson] = useState("");
  const [online, setOnline] = useState("");
  const [image, setImage] = useState("");
  const [points, setPoints] = useState("");
  const [formError, setFormError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    fetchPrograms();
  }, []);

  const fetchPrograms = async () => {
    try {
      const res = await fetch(`${API_URL}/programs`);
      if (res.ok) {
        const data = await res.json();
        setPrograms(data);
      }
    } catch (e) {
      console.error("Failed to fetch programs", e);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleDropdown = (id: string) => {
    setActiveDropdown(activeDropdown === id ? null : id);
  };

  const openEditModal = (prog: Program) => {
    const info = parseCourseInfo(prog.description);
    setEditingProgramId(prog.id);
    setTitle(prog.title);
    setType(info.type || "Certification");
    setPrice(prog.price ? prog.price.toString() : "");
    setDescription(info.summary);
    setIsActive(prog.isActive);
    setDuration(info.duration);
    setAudience(info.audience);
    setInPerson(info.inPerson);
    setOnline(info.online);
    setImage(info.image);
    setPoints(info.points.join("\n"));
    setFormError("");
    setIsModalOpen(true);
    setActiveDropdown(null);
  };

  const openCreateModal = () => {
    setEditingProgramId(null);
    setTitle("");
    setType("Certification");
    setPrice("");
    setDescription("");
    setIsActive(true);
    setDuration("");
    setAudience("");
    setInPerson("");
    setOnline("");
    setImage("");
    setPoints("");
    setFormError("");
    setIsModalOpen(true);
  };

  const handleDeleteProgram = async (id: string) => {
    if (!confirm("Are you sure you want to archive this program?")) return;
    try {
      const res = await fetch(`${API_URL}/programs/${id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        fetchPrograms();
      }
    } catch (e) {
      console.error("Failed to delete program", e);
    }
    setActiveDropdown(null);
  };

  const handleSaveProgram = async (e: FormEvent) => {
    e.preventDefault();
    setFormError("");
    setIsSaving(true);

    // Only the fields the API accepts; website details travel in the description
    const payload = {
      title: title.trim(),
      description: formatCourseInfo({
        summary: description,
        type,
        duration,
        audience,
        inPerson,
        online,
        image,
        points: points.split("\n"),
      }),
      price: parseFloat(price) || 0,
      // slug and active flag are only set on creation: the slug stays fixed so
      // existing links keep working, and the API ignores isActive on update
      ...(editingProgramId ? {} : { slug: slugify(title), isActive }),
    };

    try {
      const res = await fetch(
        editingProgramId ? `${API_URL}/programs/${editingProgramId}` : `${API_URL}/programs`,
        {
          method: editingProgramId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );

      if (res.ok) {
        const savedProgram = await res.json();
        setIsModalOpen(false);
        setEditingProgramId(null);
        if (editingProgramId) {
          fetchPrograms();
        } else {
          router.push(`/programs/${savedProgram.id}`);
        }
      } else {
        // the API wraps errors as { error: { code, message } }
        const data = await res.json().catch(() => null);
        const raw = data?.error?.message ?? data?.message;
        const message = Array.isArray(raw) ? raw.join(", ") : raw;
        setFormError(message || `Could not save the program (error ${res.status}).`);
      }
    } catch (e) {
      console.error("Failed to save program", e);
      setFormError("Could not reach the server. Check that the API is running.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className={styles.dashboard}>
      <header className={styles.header}>
        <div className={styles.headerText}>
          <h1 className={styles.title}>Programs & Curriculum</h1>
          <p className={styles.subtitle}>Create a program, then build its curriculum with modules and learning content.</p>
        </div>
        <div className={styles.headerActions}>
          <button className={styles.primaryBtn} onClick={openCreateModal}>
            + Create Program
          </button>
        </div>
      </header>

      <section className={styles.tableSection}>
        <div className={styles.sectionHeader}>
          <h2>All Programs</h2>
        </div>
        
        <div className={styles.tableWrapper}>
          <table className={styles.adminTable}>
            <thead>
              <tr>
                <th>Program Title</th>
                <th>Type</th>
                <th>Price</th>
                <th>Steps/Modules</th>
                <th>Status</th>
                <th className={styles.alignRight}>Action</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={6} style={{textAlign: "center", padding: "20px"}}>Loading programs from database...</td>
                </tr>
              ) : programs.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{textAlign: "center", padding: "20px"}}>No programs found. Create one!</td>
                </tr>
              ) : programs.map((prog) => (
                <tr key={prog.id}>
                  <td>
                    <span className={styles.cellUserName}>{prog.title}</span>
                  </td>
                  <td><span className={styles.cellTextMuted}>{parseCourseInfo(prog.description).type || "Course"}</span></td>
                  <td><span className={styles.cellText}>${prog.price}</span></td>
                  <td><span className={styles.cellText}>--</span></td>
                  <td>
                    <span className={`${styles.statusChip} ${prog.isActive ? styles.active : styles.locked}`}>
                      {prog.isActive ? "Active" : "Hidden"}
                    </span>
                  </td>
                  <td className={styles.alignRight} style={{ position: 'relative' }}>
                    <button 
                      className={styles.iconActionBtn} 
                      title="More Actions"
                      onClick={() => toggleDropdown(prog.id)}
                    >
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                        <circle cx="5" cy="12" r="2"></circle>
                        <circle cx="12" cy="12" r="2"></circle>
                        <circle cx="19" cy="12" r="2"></circle>
                      </svg>
                    </button>
                    {activeDropdown === prog.id && (
                      <div className={styles.actionDropdown}>
                        <Link href={`/programs/${prog.id}`} className={styles.dropdownItem} style={{display: 'block', textDecoration: 'none'}}>Edit Curriculum (Steps)</Link>
                        <button className={styles.dropdownItem} onClick={() => openEditModal(prog)}>Edit Program Settings</button>
                        <button className={`${styles.dropdownItem} ${styles.textDanger}`} onClick={() => handleDeleteProgram(prog.id)}>Archive Program</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* CREATE PROGRAM MODAL */}
      {isModalOpen && (
        <div className={styles.modalOverlay} onClick={() => setIsModalOpen(false)}>
          <div className={styles.modalContent} style={{ maxWidth: '640px', maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2>{editingProgramId ? "Edit Program" : "Create New Program"}</h2>
              {!editingProgramId && (
                <p style={{ margin: '0.25rem 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Step 1 of 2 · Website details. Step 2 adds the LMS content: modules, videos and quizzes.</p>
              )}
              <button className={styles.closeBtn} onClick={() => setIsModalOpen(false)}>×</button>
            </div>
            
            <form className={styles.modalForm} onSubmit={handleSaveProgram}>
              <div className={styles.formGroup}>
                <label>Program Title</label>
                <input type="text" placeholder="e.g. 11 Steps to U" required value={title} onChange={(e) => setTitle(e.target.value)} />
              </div>
              
              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label>Type</label>
                  <select value={type} onChange={(e) => setType(e.target.value)}>
                    <option>Certification</option>
                    <option>Corporate</option>
                    <option>Single Session</option>
                  </select>
                </div>
                <div className={styles.formGroup}>
                  <label>Price (USD)</label>
                  <input type="number" placeholder="1999" value={price} onChange={(e) => setPrice(e.target.value)} />
                </div>
              </div>

              <div className={styles.formGroup}>
                <label>Short Description</label>
                <textarea rows={3} placeholder="Briefly describe what this program covers..." value={description} onChange={(e) => setDescription(e.target.value)}></textarea>
              </div>

              <div style={{ borderTop: '1px solid var(--border-light)', paddingTop: '1rem' }}>
                <h3 style={{ margin: 0, fontSize: '0.95rem' }}>Website Details</h3>
                <p style={{ margin: '0.25rem 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Shown on the course card and course page of the public website. All optional.</p>
              </div>

              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label>Duration</label>
                  <input type="text" placeholder="e.g. 3 days" value={duration} onChange={(e) => setDuration(e.target.value)} />
                </div>
                <div className={styles.formGroup}>
                  <label>Who It Is For</label>
                  <input type="text" placeholder="e.g. Individuals · Teams · Leaders" value={audience} onChange={(e) => setAudience(e.target.value)} />
                </div>
              </div>

              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label>In Person</label>
                  <input type="text" placeholder="e.g. 3 days · 6 hrs/day" value={inPerson} onChange={(e) => setInPerson(e.target.value)} />
                </div>
                <div className={styles.formGroup}>
                  <label>Online</label>
                  <input type="text" placeholder="e.g. 1 hour, delivered live" value={online} onChange={(e) => setOnline(e.target.value)} />
                </div>
              </div>

              <div className={styles.formGroup}>
                <label>Cover Image</label>
                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                  {image && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={image} alt="" style={{ width: '56px', height: '42px', objectFit: 'cover', borderRadius: '8px', border: '1px solid var(--border-light)' }} />
                  )}
                  <input type="url" placeholder="Upload an image, or paste a link" value={image} onChange={(e) => setImage(e.target.value)} style={{ flex: 1, minWidth: 0 }} />
                  <label className={styles.secondaryBtn} style={{ cursor: 'pointer', margin: 0, whiteSpace: 'nowrap' }}>
                    {isUploading ? "Uploading..." : "Upload"}
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/gif"
                      disabled={isUploading}
                      style={{ display: 'none' }}
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        e.target.value = "";
                        if (!file) return;
                        setFormError("");
                        setIsUploading(true);
                        try {
                          setImage(await uploadFile(file));
                        } catch (err) {
                          setFormError(err instanceof Error ? err.message : "Could not upload the image.");
                        } finally {
                          setIsUploading(false);
                        }
                      }}
                    />
                  </label>
                </div>
              </div>

              <div className={styles.formGroup}>
                <label>What It Covers (one point per line)</label>
                <textarea rows={4} placeholder={"11 modules, each closing with a short quiz\nA final exam drawn from the full programme"} value={points} onChange={(e) => setPoints(e.target.value)}></textarea>
              </div>

              {/* The API only reads the active flag when a program is created */}
              {!editingProgramId && (
                <div className={styles.formGroup} style={{ flexDirection: 'row', alignItems: 'center', gap: '0.5rem', borderTop: '1px solid var(--border-light)', paddingTop: '1rem' }}>
                  <input type="checkbox" id="isActive" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} style={{ width: 'auto' }} />
                  <label htmlFor="isActive" style={{ margin: 0 }}>Active (visible on the public website)</label>
                </div>
              )}

              {formError && (
                <p role="alert" style={{ margin: 0, padding: '0.75rem 1rem', borderRadius: '8px', background: '#fef2f2', color: '#b91c1c', fontSize: '0.85rem' }}>{formError}</p>
              )}

              <div className={styles.modalFooter}>
                <button type="button" className={styles.secondaryBtn} onClick={() => setIsModalOpen(false)}>Cancel</button>
                <button type="submit" className={styles.primaryBtn} disabled={isSaving}>
                  {isSaving ? "Saving..." : editingProgramId ? "Save Program" : "Create & Add Curriculum"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
