"use client";

import { useRef, useState } from "react";

/**
 * "Share your experience" form. Lives inside the CustomerReviews modal, not
 * on the page directly. Text fields + a media picker below.
 *
 * Media pipeline:
 *   1. Shopper picks a file (or drops one).
 *   2. This component POSTs it to /api/reviews/upload immediately, one at a
 *      time. Each upload returns { url, kind }; we render a thumbnail with a
 *      remove button.
 *   3. On Post review, we send the review body + the media array (already
 *      uploaded). The submit endpoint validates each URL against a strict
 *      /uploads/lumi9/reviews/… allowlist — no external pastes.
 *
 * Nothing is written to Review until Post review. If the shopper closes the
 * modal after uploading but before submitting, the S3 objects are orphaned
 * (small, cheap, cleaned by a bucket lifecycle rule; not this code's
 * problem).
 *
 * Budgets: up to 4 images + 1 video per review. Small enough for a moderator
 * to review at a glance and to keep the card readable; large enough for a
 * parent to show a whole scenario ("here's the fit, here's the leak-free
 * night, here's my hand for scale").
 */

interface Props {
  productSlug: string;
  /** Called once the "Thanks for sharing" state has been on screen for the
   *  shopper to read — the parent modal usually leaves itself open so this
   *  is a hint, not a command. Optional. */
  onDone?: () => void;
}

interface Attachment {
  url: string;
  kind: "image" | "video";
}

const MAX_IMAGES = 4;
const MAX_VIDEOS = 1;

const RATING_LABELS: Record<number, string> = {
  1: "Not for us",
  2: "It was okay",
  3: "Good",
  4: "Really good",
  5: "Loved it",
};

const INPUT_CLASSES =
  "w-full rounded-[10px] border-[1.5px] border-moss-tint bg-canvas px-3 py-2 text-[15px] text-midnight outline-none focus:border-moss";

export function ReviewSubmitForm({ productSlug, onDone }: Props) {
  const [name, setName] = useState("");
  const [place, setPlace] = useState("");
  const [rating, setRating] = useState(5);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState<"idle" | "submitting" | "done">("idle");
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const imageCount = attachments.filter((a) => a.kind === "image").length;
  const videoCount = attachments.filter((a) => a.kind === "video").length;

  async function onPickFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError(null);
    setUploading(true);
    const nextAttachments: Attachment[] = [...attachments];
    for (const file of Array.from(files)) {
      const kindGuess = file.type.startsWith("video/") ? "video" : "image";
      // Client-side budget check first — the server enforces the same caps
      // but rejecting here saves the shopper a round-trip.
      if (kindGuess === "image" && nextAttachments.filter((a) => a.kind === "image").length >= MAX_IMAGES) {
        setError(`You can attach up to ${MAX_IMAGES} photos.`);
        break;
      }
      if (kindGuess === "video" && nextAttachments.filter((a) => a.kind === "video").length >= MAX_VIDEOS) {
        setError(`You can attach up to ${MAX_VIDEOS} video.`);
        break;
      }
      const fd = new FormData();
      fd.append("file", file);
      try {
        const res = await fetch("/api/reviews/upload", { method: "POST", body: fd });
        const payload = (await res.json().catch(() => ({}))) as {
          url?: string;
          kind?: "image" | "video";
          error?: string;
        };
        if (!res.ok || !payload.url || !payload.kind) {
          setError(payload.error || `Couldn't upload "${file.name}".`);
          break;
        }
        nextAttachments.push({ url: payload.url, kind: payload.kind });
      } catch {
        setError(`Couldn't upload "${file.name}". Check your connection and try again.`);
        break;
      }
    }
    setAttachments(nextAttachments);
    setUploading(false);
    // Reset the input so re-selecting the same file re-fires onChange.
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function removeAttachment(url: string) {
    setAttachments((prev) => prev.filter((a) => a.url !== url));
  }

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
          media: attachments.length > 0 ? attachments : undefined,
        }),
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => ({}))) as { error?: string };
        setError(payload.error || "Couldn't send your review. Please try again.");
        setStatus("idle");
        return;
      }
      setStatus("done");
      onDone?.();
    } catch {
      setError("Couldn't send your review. Please try again.");
      setStatus("idle");
    }
  }

  if (status === "done") {
    return (
      <div className="py-6 text-center">
        <p className="font-display text-[clamp(20px,2.4vw,26px)] font-normal text-midnight">
          Thanks for sharing.
        </p>
        <p className="mx-auto mt-3 max-w-[440px] text-[15px] leading-relaxed text-muted">
          Your review is with our team for a quick moderation. Approved reviews
          appear on this page within a working day.
        </p>
      </div>
    );
  }

  const canSubmit =
    Boolean(name.trim() && body.trim() && rating >= 1 && rating <= 5) &&
    status !== "submitting" &&
    !uploading;

  return (
    <form onSubmit={submit}>
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

      {/* Media picker */}
      <div className="mt-5">
        <span className="mb-1 block text-[13px] font-medium text-midnight">
          Photos &amp; video <span className="font-normal text-muted">(optional — up to {MAX_IMAGES} photos, {MAX_VIDEOS} short video)</span>
        </span>
        {attachments.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {attachments.map((a) => (
              <div
                key={a.url}
                className="relative h-16 w-16 overflow-hidden rounded-[8px] border border-moss-tint"
              >
                {a.kind === "image" ? (
                  <img src={a.url} alt="" className="h-full w-full object-cover" />
                ) : (
                  <video src={a.url} className="h-full w-full object-cover" muted />
                )}
                <button
                  type="button"
                  onClick={() => removeAttachment(a.url)}
                  aria-label="Remove"
                  className="absolute right-0 top-0 flex h-5 w-5 items-center justify-center rounded-bl-[8px] bg-black/70 text-[11px] text-white hover:bg-black"
                >
                  ✕
                </button>
                {a.kind === "video" && (
                  <span className="absolute bottom-0 left-0 rounded-tr-[6px] bg-black/70 px-1 text-[9px] text-white">
                    VIDEO
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
        {(imageCount < MAX_IMAGES || videoCount < MAX_VIDEOS) && (
          <label
            className={`inline-flex cursor-pointer items-center gap-2 rounded-full border-[1.5px] border-dashed border-moss-tint px-4 py-2 text-[13px] text-moss-deep transition hover:border-moss ${
              uploading ? "opacity-50" : ""
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime,video/webm"
              onChange={(e) => onPickFiles(e.target.files)}
              disabled={uploading || status === "submitting"}
              className="hidden"
            />
            {uploading ? "Uploading…" : "+ Add photo or video"}
          </label>
        )}
      </div>

      {error && (
        <p className="mt-3 text-[13px] text-[#b4232c]" role="alert">
          {error}
        </p>
      )}

      <div className="mt-6 flex justify-end">
        <button
          type="submit"
          disabled={!canSubmit}
          className="rounded-full bg-moss px-6 py-2.5 text-[14px] font-medium text-white transition disabled:cursor-not-allowed disabled:opacity-50 hover:bg-moss-deep"
        >
          {status === "submitting" ? "Sending…" : "Post review"}
        </button>
      </div>
    </form>
  );
}
