"use client";

import { useState } from "react";

const SUBJECTS = ["Sizing help", "An existing order", "Subscription", "Bulk / wholesale"];

/** Contact form; swaps to a success panel on submit. Wire `onSubmit` to the care inbox. */
export function ContactForm() {
  const [sent, setSent] = useState(false);

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
    <form
      onSubmit={(event) => {
        event.preventDefault();
        setSent(true);
      }}
      className="rounded-media border border-moss-tint bg-canvas p-card-lg shadow-hero"
    >
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-[clamp(10px,1.4vw,14px)] min-[420px]:grid-cols-2">
          <input aria-label="First name" placeholder="First name" required autoComplete="given-name" className="field" />
          <input aria-label="Last name" placeholder="Last name" required autoComplete="family-name" className="field" />
        </div>
        <input
          type="email"
          aria-label="Email address"
          placeholder="Email address"
          required
          autoComplete="email"
          className="field"
        />
        <select aria-label="What's this about?" required defaultValue="" className="field text-muted">
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
          aria-label="Your message"
          placeholder="Your message"
          rows={5}
          required
          className="field resize-y"
        />
        <button type="submit" className="btn btn-dark w-full font-bold">
          Send message
        </button>
      </div>
    </form>
  );
}
