"use client";

import { useId, useState } from "react";

/**
 * Footer newsletter capture — an outlined pill on the moss panel with a butter
 * "Join" button tucked inside.
 *
 * It used to flip `signedUp` on submit and throw the address away, so every
 * visitor who gave Lumi9 their email was told they were on a list that did not
 * exist. It POSTs to /api/newsletter now, which writes a NewsletterSubscriber —
 * the model the shared schema has carried since Femi9's two forms had the same
 * defect. The success panel is shown only once the row is written.
 */
export function NewsletterForm() {
  const id = useId();
  const [email, setEmail] = useState("");
  const [signedUp, setSignedUp] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/newsletter", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, source: "footer" }),
      });
      if (res.ok) {
        setSignedUp(true);
        return;
      }
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      // The route's messages are already reader-facing ("Enter a valid email
      // address.", and the 429 copy), so surface them rather than a generic one.
      setError(body?.error ?? "We could not sign you up just now. Please try again.");
    } catch {
      setError("Network error — please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (signedUp) {
    return (
      <p className="mb-[clamp(20px,3vw,30px)] max-w-[440px] rounded-pill border-[1.5px] border-butter/40 bg-butter/15 px-6 py-4 text-[15px] text-butter">
        You’re on the list — welcome to Lumi9.
      </p>
    );
  }

  return (
    <form
      /* input + button sit side by side from 420px up; below that the button drops
         onto its own row (and the pill relaxes to a panel) so neither gets squeezed */
      className="mb-[clamp(20px,3vw,30px)] flex max-w-[440px] flex-col gap-2 rounded-panel border-[1.5px] border-butter/40 bg-butter/10 p-2 min-[420px]:flex-row min-[420px]:items-center min-[420px]:rounded-pill min-[420px]:pl-6"
      onSubmit={onSubmit}
    >
      <label htmlFor={id} className="sr-only">
        Email address
      </label>
      <input
        id={id}
        type="email"
        required
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        placeholder="Your email"
        className="min-h-11 min-w-0 flex-1 border-none bg-transparent px-4 text-[max(16px,1rem)] text-butter outline-none placeholder:text-butter/60 min-[420px]:px-0"
      />
      <button
        type="submit"
        disabled={submitting}
        className="min-h-11 shrink-0 cursor-pointer rounded-pill bg-butter px-[clamp(22px,2.8vw,32px)] text-[clamp(15px,1.4vw,16px)] font-bold text-midnight transition-colors hover:bg-[#ffe97f] disabled:opacity-60"
      >
        {submitting ? "Joining…" : "Join"}
      </button>
      {error && (
        <p className="m-0 basis-full px-4 text-[13px] text-butter/80" role="alert" aria-live="polite">
          {error}
        </p>
      )}
    </form>
  );
}
