"use client";

import { useState } from "react";

const SUBJECTS = ["Sizing help", "An existing order", "Subscription", "Bulk / wholesale"];

/**
 * Contact form.
 *
 * It used to flip `sent` on submit and show "Thanks for reaching out — we'll be
 * in touch shortly" without sending anything: none of the fields even carried a
 * `name`, so there was nothing to send. Its own comment asked for `onSubmit` to
 * be wired to the care inbox. It now POSTs to /api/contact, which mails the
 * message and logs the delivery, and the success panel is shown only once that
 * has actually happened — a form that says "sent" when it has not is worse than
 * one that says it is broken.
 */
export function ContactForm() {
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    const data = new FormData(event.currentTarget);
    const get = (key: string) => String(data.get(key) ?? "").trim();

    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          firstName: get("firstName"),
          lastName: get("lastName"),
          email: get("email"),
          subject: get("subject"),
          message: get("message"),
        }),
      });
      if (res.ok) {
        setSent(true);
        return;
      }
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      // The route's messages already tell the visitor what to do instead
      // (email care@lumi9.in), so surface them rather than a generic one.
      setError(body?.error ?? "We could not send your message. Please try again.");
    } catch {
      setError("Network error — please try again, or email care@lumi9.in.");
    } finally {
      setSubmitting(false);
    }
  }

  if (sent) {
    return (
      <div className="rounded-media border border-moss-tint bg-canvas p-card-lg shadow-hero">
        <div className="px-2.5 py-10 text-center">
          <div className="mx-auto mb-5 flex size-[clamp(52px,6vw,64px)] items-center justify-center rounded-full bg-moss-tint text-[clamp(24px,3vw,30px)] text-moss-deep">
            ✓
          </div>
          <h2 className="m-0 mb-2.5 font-display text-[clamp(21px,2.6vw,26px)] font-normal">Message sent!</h2>
          <p className="m-0 text-base text-muted">Thanks for reaching out — we&apos;ll be in touch shortly.</p>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="rounded-media border border-moss-tint bg-canvas p-card-lg shadow-hero">
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-[clamp(10px,1.4vw,14px)] min-[420px]:grid-cols-2">
          <input
            name="firstName"
            aria-label="First name"
            placeholder="First name"
            required
            autoComplete="given-name"
            className="field"
          />
          <input
            name="lastName"
            aria-label="Last name"
            placeholder="Last name"
            required
            autoComplete="family-name"
            className="field"
          />
        </div>
        <input
          name="email"
          type="email"
          aria-label="Email address"
          placeholder="Email address"
          required
          autoComplete="email"
          className="field"
        />
        <select name="subject" aria-label="What's this about?" required defaultValue="" className="field text-muted">
          <option value="" disabled>
            What&apos;s this about?
          </option>
          {SUBJECTS.map((subject) => (
            <option key={subject} value={subject}>
              {subject}
            </option>
          ))}
        </select>
        <textarea
          name="message"
          aria-label="Your message"
          placeholder="Your message"
          rows={5}
          required
          className="field resize-y"
        />
        {error && (
          <p className="m-0 text-sm text-[#b4232c]" role="alert" aria-live="polite">
            {error}
          </p>
        )}
        <button type="submit" disabled={submitting} className="btn btn-dark w-full font-bold disabled:opacity-60">
          {submitting ? "Sending…" : "Send message"}
        </button>
      </div>
    </form>
  );
}
