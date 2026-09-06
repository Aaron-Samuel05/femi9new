"use client";

import { useState } from "react";

/**
 * Inline "Share your experience" form on the Lumi9 PDP.
 *
 * Sits below the approved reviews grid. Submits to POST /api/reviews, which
 * writes a `pending` row through the shared `submitReview` service — nothing
 * publishes here directly; the console's moderation queue is the gate. On
 * success the form collapses to a thank-you card so a shopper does not send
 * the same review a second time by refreshing.
 *
 * Tokens: moss-* is the brand accent, midnight is body text, muted is help
 * text — same palette CheckoutForm uses so the two feel like one storefront.
 */

interface Props {
  productSlug: string;
}

const RATING_LABELS: Record<number, string> = {
  1: "Not for us",
  2: "It was okay",
  3: "Good",
  4: "Really good",
  5: "Loved it",
};

const INPUT_CLASSES =
  "w-full rounded-[10px] border-[1.5px] border-moss-tint bg-canvas px-3 py-2 text-[15px] text-midnight outline-none focus:border-moss";

export function ReviewSubmitForm({ productSlug }: Props) {
  const [name, setName] = useState("");
  const [place, setPlace] = useState("");
  const [rating, setRating] = useState(5);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setStatus("submitting");
    try {
      const res = await fetch("/api/reviews", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          productSlug,
          name: name.trim(),
          rating,
          body: body.trim(),
          place: place.trim() || undefined,
          title: title.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => ({}))) as { error?: string };
        setError(payload.error || "Couldn't send your review. Please try again.");
        setStatus("idle");
        return;
      }
      setStatus("done");
    } catch {
      setError("Couldn't send your review. Please try again.");
      setStatus("idle");
    }
  }

  if (status === "done") {
    return (
      <div className="mx-auto max-w-[720px] rounded-[16px] border-[1.5px] border-moss-tint bg-paper px-6 py-10 text-center">
        <p className="font-display text-[clamp(20px,2.2vw,26px)] font-normal text-midnight">
          Thanks for sharing.
        </p>
        <p className="mx-auto mt-3 max-w-[440px] text-[15px] leading-relaxed text-muted">
          Your review is with our team for a quick moderation. Approved reviews
          appear on this page within a working day.
        </p>
      </div>
    );
  }

  const canSubmit = Boolean(name.trim() && body.trim() && rating >= 1 && rating <= 5);

  return (
    <form
      onSubmit={submit}
      className="mx-auto max-w-[720px] rounded-[16px] border-[1.5px] border-moss-tint bg-paper px-[clamp(18px,2.4vw,32px)] py-[clamp(22px,2.6vw,36px)]"
    >
      <div className="mb-6">
        <p className="text-[13px] font-bold uppercase tracking-[0.1em] text-moss-deep">
          Share your experience
        </p>
        <p className="mt-1 text-[15px] text-muted">
          Reviews go to a quick human check before they publish here.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-[13px] font-medium text-midnight">Your name</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={80}
            disabled={status === "submitting"}
            className={INPUT_CLASSES}
            placeholder="Priya S."
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[13px] font-medium text-midnight">
            Where you&rsquo;re from <span className="font-normal text-muted">(optional)</span>
          </span>
          <input
            type="text"
            value={place}
            onChange={(e) => setPlace(e.target.value)}
            maxLength={80}
            disabled={status === "submitting"}
            className={INPUT_CLASSES}
            placeholder="Chennai, TN"
          />
        </label>
      </div>

      <div className="mt-5">
        <span className="mb-1 block text-[13px] font-medium text-midnight">Your rating</span>
        <div className="flex items-center gap-2">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setRating(n)}
              disabled={status === "submitting"}
              aria-label={`${n} star${n === 1 ? "" : "s"}`}
              aria-pressed={rating === n}
              className={`text-[28px] leading-none transition ${
                n <= rating ? "text-gold" : "text-moss-tint hover:text-butter"
              }`}
            >
              ★
            </button>
          ))}
          <span className="ml-3 text-[13px] text-muted">{RATING_LABELS[rating]}</span>
        </div>
      </div>

      <label className="mt-5 block">
        <span className="mb-1 block text-[13px] font-medium text-midnight">
          Headline <span className="font-normal text-muted">(optional)</span>
        </span>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={120}
          disabled={status === "submitting"}
          className={INPUT_CLASSES}
          placeholder="Kept our little one dry through the night"
        />
      </label>

      <label className="mt-5 block">
        <span className="mb-1 block text-[13px] font-medium text-midnight">Your review</span>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          required
          maxLength={2000}
          rows={5}
          disabled={status === "submitting"}
          className={`${INPUT_CLASSES} leading-relaxed`}
          placeholder="What worked well? What could be better?"
        />
        <span className="mt-1 block text-[12px] text-muted">{body.length}/2000</span>
      </label>

      {error && (
        <p className="mt-3 text-[13px] text-[#b4232c]" role="alert">
          {error}
        </p>
      )}

      <div className="mt-6 flex justify-end">
        <button
          type="submit"
          disabled={!canSubmit || status === "submitting"}
          className="rounded-full bg-moss px-6 py-2.5 text-[14px] font-medium text-white transition disabled:cursor-not-allowed disabled:opacity-50 hover:bg-moss-deep"
        >
          {status === "submitting" ? "Sending…" : "Post review"}
        </button>
      </div>
    </form>
  );
}
