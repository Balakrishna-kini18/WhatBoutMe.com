"use client";

import { useState, useSyncExternalStore, type FormEvent } from "react";
import { ArrowRight } from "lucide-react";
import { API_BASE_URL } from "@/lib/api";

const FIELD =
  "w-full rounded-xl border border-line bg-cream px-4 py-3 text-ink outline-none transition-colors focus:border-gold-deep";

// the course a visitor came from, passed as /contact?course=...
const subscribe = () => () => {};
const getCourse = () => new URLSearchParams(window.location.search).get("course") ?? "";
const getServerCourse = () => "";

/** Enquiry form. Submissions appear in the admin portal under Enquiries (CRM). */
export default function ContactForm() {
  const course = useSyncExternalStore(subscribe, getCourse, getServerCourse);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const res = await fetch(`${API_BASE_URL}/leads`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          ...(phone.trim() ? { phone: phone.trim() } : {}),
          message: [course && `Course: ${course}`, message.trim()]
            .filter(Boolean)
            .join("\n\n"),
        }),
      });
      if (res.ok) {
        setSent(true);
      } else if (res.status === 429) {
        setError("Too many messages just now. Please wait a minute and try again.");
      } else {
        const data = await res.json().catch(() => null);
        setError(data?.error?.message || "Could not send your message. Please try again.");
      }
    } catch {
      setError("Could not reach the server. Please try again in a moment.");
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <div role="status" className="rounded-2xl bg-cream-deep p-8 text-center">
        <p className="text-2xl font-bold tracking-tight">Thank You</p>
        <p className="mt-2 text-ink-soft">
          Your message is with us. We will reply to {email} shortly.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      {course && (
        <p className="rounded-xl bg-cream-deep px-4 py-3 text-sm">
          Enquiring about <strong className="font-semibold">{course}</strong>
        </p>
      )}
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="name" className="mb-2 block text-sm font-medium">
            Name
          </label>
          <input
            id="name"
            required
            maxLength={120}
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={FIELD}
          />
        </div>
        <div>
          <label htmlFor="email" className="mb-2 block text-sm font-medium">
            Email
          </label>
          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={FIELD}
          />
        </div>
      </div>
      <div>
        <label htmlFor="phone" className="mb-2 block text-sm font-medium">
          Phone <span className="text-ink-soft">(optional)</span>
        </label>
        <input
          id="phone"
          type="tel"
          maxLength={40}
          autoComplete="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className={FIELD}
        />
      </div>
      <div>
        <label htmlFor="message" className="mb-2 block text-sm font-medium">
          Tell us about the room
        </label>
        <textarea
          id="message"
          required
          rows={5}
          maxLength={3500}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          className={FIELD}
        />
      </div>

      {error && (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={busy}
        className="group flex w-full items-center justify-center gap-2 rounded-full bg-ink py-3.5 text-sm font-medium text-cream transition-colors duration-200 hover:bg-gold hover:text-ink disabled:opacity-60 sm:w-auto sm:px-8"
      >
        {busy ? "Sending…" : "Send Message"}
        <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
      </button>
    </form>
  );
}
