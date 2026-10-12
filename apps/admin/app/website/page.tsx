"use client";

import { ChangeEvent, FormEvent, useEffect, useState } from "react";
import styles from "../page.module.css";
import { API_URL, errorMessage, uploadFile } from "../lib/api";

type Faq = { q: string; a: string };
type Testimonial = { quote: string; name: string; role: string };

/** The document stored at /site-content. Anything left blank uses the website's built-in text. */
type SiteContent = {
  hero: { eyebrow: string; title: string; highlight: string; subtitle: string; image: string };
  about: { image: string };
  faqs: Faq[];
  testimonials: Testimonial[];
  contact: { email: string; social: string };
  promo: { enabled: boolean; text: string; linkLabel: string; linkUrl: string };
};

const EMPTY: SiteContent = {
  hero: { eyebrow: "", title: "", highlight: "", subtitle: "", image: "" },
  about: { image: "" },
  faqs: [],
  testimonials: [],
  contact: { email: "", social: "" },
  promo: { enabled: false, text: "", linkLabel: "", linkUrl: "" },
};

function ImageField({ label, value, onChange }: { label: string; value: string; onChange: (url: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError("");
    setBusy(true);
    try {
      onChange(await uploadFile(file));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not upload the image.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.formGroup}>
      <label>{label}</label>
      <div style={{ display: "flex", gap: "1rem", alignItems: "center", flexWrap: "wrap", marginTop: "0.25rem" }}>
        {value && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={value} alt="" style={{ width: "72px", height: "72px", objectFit: "cover", borderRadius: "10px", border: "1px solid var(--border-light)" }} />
        )}
        <label className={styles.secondaryBtn} style={{ cursor: "pointer", margin: 0, display: "inline-flex", alignItems: "center", gap: "0.5rem" }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
            <polyline points="17 8 12 3 7 8"></polyline>
            <line x1="12" y1="3" x2="12" y2="15"></line>
          </svg>
          <span>{busy ? "Uploading..." : value ? "Replace Image" : "Upload Image"}</span>
          <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={onFile} disabled={busy} style={{ display: "none" }} />
        </label>
        {value && (
          <button type="button" className={styles.dangerBtnSmall} onClick={() => onChange("")}>
            Remove
          </button>
        )}
      </div>
      {error && <span style={{ color: "var(--status-error)", fontSize: "0.8rem", marginTop: "4px" }}>{error}</span>}
    </div>
  );
}

export default function WebsiteContentPage() {
  const [content, setContent] = useState<SiteContent>(EMPTY);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_URL}/site-content`);
        if (res.ok) {
          const saved = await res.json();
          setContent({
            hero: { ...EMPTY.hero, ...saved.hero },
            about: { ...EMPTY.about, ...saved.about },
            faqs: Array.isArray(saved.faqs) ? saved.faqs : [],
            testimonials: Array.isArray(saved.testimonials) ? saved.testimonials : [],
            contact: { ...EMPTY.contact, ...saved.contact },
            promo: { ...EMPTY.promo, ...saved.promo, enabled: saved.promo?.enabled === true },
          });
        }
      } catch (e) {
        console.error("Failed to load website content", e);
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const setHero = (key: keyof SiteContent["hero"], value: string) =>
    setContent((c) => ({ ...c, hero: { ...c.hero, [key]: value } }));
  const setPromo = <K extends keyof SiteContent["promo"]>(key: K, value: SiteContent["promo"][K]) =>
    setContent((c) => ({ ...c, promo: { ...c.promo, [key]: value } }));
  const setContact = (key: keyof SiteContent["contact"], value: string) =>
    setContent((c) => ({ ...c, contact: { ...c.contact, [key]: value } }));
  const setFaq = (i: number, key: keyof Faq, value: string) =>
    setContent((c) => ({ ...c, faqs: c.faqs.map((f, n) => (n === i ? { ...f, [key]: value } : f)) }));
  const setTestimonial = (i: number, key: keyof Testimonial, value: string) =>
    setContent((c) => ({ ...c, testimonials: c.testimonials.map((t, n) => (n === i ? { ...t, [key]: value } : t)) }));

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    setMessage(null);
    setIsSaving(true);
    try {
      // drop rows left completely empty
      const payload: SiteContent = {
        ...content,
        faqs: content.faqs.filter((f) => f.q.trim() && f.a.trim()),
        testimonials: content.testimonials.filter((t) => t.quote.trim() && t.name.trim()),
      };
      const res = await fetch(`${API_URL}/site-content`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        setContent(payload);
        setMessage({ ok: true, text: "Saved. The website shows the changes within a minute." });
      } else {
        setMessage({ ok: false, text: await errorMessage(res, "Could not save the website content") });
      }
    } catch (err) {
      console.error("Failed to save website content", err);
      setMessage({ ok: false, text: "Could not reach the server. Check that the API is running." });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className={styles.dashboard}>
        <p style={{ color: "var(--text-secondary)", padding: "2rem" }}>Loading website content...</p>
      </div>
    );
  }

  return (
    <form className={styles.dashboard} onSubmit={handleSave}>
      <header className={styles.header}>
        <div className={styles.headerText}>
          <h1 className={styles.title}>Website Content</h1>
          <p className={styles.subtitle}>Text and images on the public website. Anything left blank keeps the website&apos;s built-in content.</p>
        </div>
        <div className={styles.headerActions}>
          <button
            type="submit"
            className={styles.primaryBtn}
            disabled={isSaving}
            style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem" }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
              <polyline points="17 21 17 13 7 13 7 21"></polyline>
              <polyline points="7 3 7 8 15 8"></polyline>
            </svg>
            <span>{isSaving ? "Saving..." : "Save Changes"}</span>
          </button>
        </div>
      </header>

      {message && (
        <div
          role="status"
          style={{
            margin: "0 0 1.5rem",
            padding: "12px 16px",
            borderRadius: "8px",
            fontSize: "0.88rem",
            display: "flex",
            alignItems: "center",
            gap: "10px",
            background: message.ok ? "var(--status-success-bg)" : "var(--status-error-bg)",
            color: message.ok ? "var(--status-success)" : "var(--status-error)",
            border: `1px solid ${message.ok ? "#bbf7d0" : "#fecaca"}`
          }}
        >
          {message.ok ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
              <polyline points="22 4 12 14.01 9 11.01"></polyline>
            </svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="8" x2="12" y2="12"></line>
              <line x1="12" y1="16" x2="12.01" y2="16"></line>
            </svg>
          )}
          <span>{message.text}</span>
        </div>
      )}

      <section className={styles.tableSection} style={{ padding: "1.75rem", marginBottom: "1.5rem" }}>
        <h2 style={{ margin: "0 0 0.35rem 0", fontSize: "1.15rem", fontWeight: 700 }}>Home Page Banner</h2>
        <p style={{ margin: "0 0 1.25rem 0", fontSize: "0.85rem", color: "var(--text-secondary)" }}>The first screen visitors see.</p>
        <div className={styles.modalForm}>
          <div className={styles.formGroup}>
            <label>Small Label</label>
            <input type="text" placeholder="Brain health · Resilience · Purpose" value={content.hero.eyebrow} onChange={(e) => setHero("eyebrow", e.target.value)} />
          </div>
          <div className={styles.formRow}>
            <div className={styles.formGroup}>
              <label>Headline, Line 1</label>
              <input type="text" placeholder="Brain Matters." value={content.hero.title} onChange={(e) => setHero("title", e.target.value)} />
            </div>
            <div className={styles.formGroup}>
              <label>Headline, Line 2 (gold)</label>
              <input type="text" placeholder="So Do You." value={content.hero.highlight} onChange={(e) => setHero("highlight", e.target.value)} />
            </div>
          </div>
          <div className={styles.formGroup}>
            <label>Description</label>
            <textarea rows={2} placeholder="For the people who hold everyone else together..." value={content.hero.subtitle} onChange={(e) => setHero("subtitle", e.target.value)} />
          </div>
          <ImageField label="Banner Photo (cut-out on a transparent background works best)" value={content.hero.image} onChange={(url) => setHero("image", url)} />
        </div>
      </section>

      <section className={styles.tableSection} style={{ padding: "1.75rem", marginBottom: "1.5rem" }}>
        <h2 style={{ margin: "0 0 0.35rem 0", fontSize: "1.15rem", fontWeight: 700 }}>Promotional Banner</h2>
        <p style={{ margin: "0 0 1.25rem 0", fontSize: "0.85rem", color: "var(--text-secondary)" }}>A highlighted strip under the home page banner and on the courses page, for an offer or announcement.</p>
        <div className={styles.modalForm}>
          <label style={{ display: "flex", alignItems: "center", gap: "0.6rem", fontSize: "0.88rem", fontWeight: 600, cursor: "pointer" }}>
            <input type="checkbox" checked={content.promo.enabled} onChange={(e) => setPromo("enabled", e.target.checked)} style={{ width: "16px", height: "16px", accentColor: "var(--accent-primary)" }} />
            Show the banner on the website
          </label>
          <div className={styles.formGroup}>
            <label htmlFor="promo-text">Message</label>
            <input id="promo-text" type="text" maxLength={140} placeholder="Early-bird pricing for the January cohort ends 15 December" value={content.promo.text} onChange={(e) => setPromo("text", e.target.value)} />
          </div>
          <div className={styles.formRow}>
            <div className={styles.formGroup}>
              <label htmlFor="promo-label">Button Label (optional)</label>
              <input id="promo-label" type="text" maxLength={30} placeholder="Enrol now" value={content.promo.linkLabel} onChange={(e) => setPromo("linkLabel", e.target.value)} />
            </div>
            <div className={styles.formGroup}>
              <label htmlFor="promo-url">Button Link (optional)</label>
              <input id="promo-url" type="text" placeholder="/courses" value={content.promo.linkUrl} onChange={(e) => setPromo("linkUrl", e.target.value)} />
            </div>
          </div>
        </div>
      </section>

      <section className={styles.tableSection} style={{ padding: "1.75rem", marginBottom: "1.5rem" }}>
        <h2 style={{ margin: "0 0 0.35rem 0", fontSize: "1.15rem", fontWeight: 700 }}>About Page</h2>
        <p style={{ margin: "0 0 1.25rem 0", fontSize: "0.85rem", color: "var(--text-secondary)" }}>The facilitator photo on the About page and the home page panel.</p>
        <div className={styles.modalForm}>
          <ImageField label="Facilitator Photo" value={content.about.image} onChange={(url) => setContent((c) => ({ ...c, about: { image: url } }))} />
        </div>
      </section>

      <section className={styles.tableSection} style={{ padding: "1.75rem", marginBottom: "1.5rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem", marginBottom: "0.35rem" }}>
          <h2 style={{ margin: 0, fontSize: "1.15rem", fontWeight: 700 }}>Testimonials</h2>
          <button
            type="button"
            className={styles.secondaryBtnSmall}
            onClick={() => setContent((c) => ({ ...c, testimonials: [...c.testimonials, { quote: "", name: "", role: "" }] }))}
            style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
            <span>Add Testimonial</span>
          </button>
        </div>
        <p style={{ margin: "0 0 1.25rem 0", fontSize: "0.85rem", color: "var(--text-secondary)" }}>Use real quotes only. With none added, the website hides the testimonials section.</p>
        <div className={styles.modalForm}>
          {content.testimonials.map((t, i) => (
            <div key={i} style={{ border: "1px solid var(--border-light)", borderRadius: "10px", padding: "1.25rem", display: "flex", flexDirection: "column", gap: "0.75rem", background: "var(--bg-main)" }}>
              <div className={styles.formGroup}>
                <label>Quote</label>
                <textarea rows={3} value={t.quote} onChange={(e) => setTestimonial(i, "quote", e.target.value)} />
              </div>
              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label>Name</label>
                  <input type="text" value={t.name} onChange={(e) => setTestimonial(i, "name", e.target.value)} />
                </div>
                <div className={styles.formGroup}>
                  <label>Role, Organisation</label>
                  <input type="text" value={t.role} onChange={(e) => setTestimonial(i, "role", e.target.value)} />
                </div>
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <button type="button" className={styles.dangerBtnSmall} onClick={() => setContent((c) => ({ ...c, testimonials: c.testimonials.filter((_, n) => n !== i) }))}>
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className={styles.tableSection} style={{ padding: "1.75rem", marginBottom: "1.5rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem", marginBottom: "0.35rem" }}>
          <h2 style={{ margin: 0, fontSize: "1.15rem", fontWeight: 700 }}>Questions (FAQ)</h2>
          <button
            type="button"
            className={styles.secondaryBtnSmall}
            onClick={() => setContent((c) => ({ ...c, faqs: [...c.faqs, { q: "", a: "" }] }))}
            style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
            <span>Add Question</span>
          </button>
        </div>
        <p style={{ margin: "0 0 1.25rem 0", fontSize: "0.85rem", color: "var(--text-secondary)" }}>With none added, the website shows its built-in questions.</p>
        <div className={styles.modalForm}>
          {content.faqs.map((f, i) => (
            <div key={i} style={{ border: "1px solid var(--border-light)", borderRadius: "10px", padding: "1.25rem", display: "flex", flexDirection: "column", gap: "0.75rem", background: "var(--bg-main)" }}>
              <div className={styles.formGroup}>
                <label>Question</label>
                <input type="text" value={f.q} onChange={(e) => setFaq(i, "q", e.target.value)} />
              </div>
              <div className={styles.formGroup}>
                <label>Answer</label>
                <textarea rows={2} value={f.a} onChange={(e) => setFaq(i, "a", e.target.value)} />
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <button type="button" className={styles.dangerBtnSmall} onClick={() => setContent((c) => ({ ...c, faqs: c.faqs.filter((_, n) => n !== i) }))}>
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className={styles.tableSection} style={{ padding: "1.75rem" }}>
        <h2 style={{ margin: "0 0 0.35rem 0", fontSize: "1.15rem", fontWeight: 700 }}>Contact Details</h2>
        <p style={{ margin: "0 0 1.25rem 0", fontSize: "0.85rem", color: "var(--text-secondary)" }}>Shown in the website footer.</p>
        <div className={styles.formRow}>
          <div className={styles.formGroup}>
            <label>Email</label>
            <input type="email" placeholder="share@whatboutme.com" value={content.contact.email} onChange={(e) => setContact("email", e.target.value)} />
          </div>
          <div className={styles.formGroup}>
            <label>Social Handle</label>
            <input type="text" placeholder="@whatboutme11" value={content.contact.social} onChange={(e) => setContact("social", e.target.value)} />
          </div>
        </div>
      </section>
    </form>
  );
}
