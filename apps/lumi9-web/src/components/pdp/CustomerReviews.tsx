"use client";

import { useState } from "react";
import type { ProductReview } from "@femi9/core/services/products";
import { ReviewSubmitForm } from "./ReviewSubmitForm";

/**
 * Customer-facing review section on the Lumi9 PDP.
 *
 * Deliberately minimal, matching the Femi9 empty-state screenshot:
 *   • a serif "Customer Reviews" heading on a soft plum background
 *   • the reviews themselves (text + a strip of media if attached), or an
 *     empty-state line when none exist
 *   • one call to action — "Be the first to review it" when empty,
 *     "Write a review" when reviews already exist
 *
 * The form is a MODAL that opens on click, not inline. Rationale: below the
 * fold on a busy PDP an always-open form pulls the page down a full screen
 * for a control most shoppers will not use, and the reviews are the story
 * this section is telling. The button reads as an invitation.
 */

interface Props {
  productSlug: string;
  reviews: ProductReview[];
}

export function CustomerReviews({ productSlug, reviews }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <section className="px-safe bg-canvas py-section">
      <div className="mx-auto max-w-[var(--page-max)]">
        <div className="mx-auto max-w-[960px] rounded-[24px] bg-moss-tint px-[clamp(20px,3vw,44px)] py-[clamp(28px,4vw,56px)]">
          <h2 className="text-center font-display text-[clamp(28px,3.6vw,42px)] font-normal text-midnight">
            Customer Reviews
          </h2>

          {reviews.length === 0 ? (
            <div className="mt-[clamp(20px,3vw,32px)] text-center">
              <p className="text-[15px] text-muted">No reviews yet for this product.</p>
              <button
                type="button"
                onClick={() => setOpen(true)}
                className="mt-6 rounded-full bg-moss px-8 py-3 text-[14px] font-medium text-white transition hover:bg-moss-deep"
              >
                Be the first to review it
              </button>
            </div>
          ) : (
            <>
              <div className="mt-[clamp(24px,3.4vw,40px)] grid grid-cols-1 gap-[clamp(14px,1.8vw,22px)] sm:grid-cols-2">
                {reviews.map((review) => (
                  <ReviewCard key={review.id} review={review} />
                ))}
              </div>
              <div className="mt-[clamp(24px,3.4vw,40px)] text-center">
                <button
                  type="button"
                  onClick={() => setOpen(true)}
                  className="rounded-full border-[1.5px] border-moss bg-transparent px-8 py-3 text-[14px] font-medium text-moss transition hover:bg-moss hover:text-white"
                >
                  Write a review
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {open && (
        <Modal onClose={() => setOpen(false)}>
          <ReviewSubmitForm
            productSlug={productSlug}
            onDone={() => {
              // Keep the modal open on success so the shopper reads the
              // thank-you copy; closing it immediately would suggest their
              // submission had no effect. They dismiss with the X or backdrop.
            }}
          />
        </Modal>
      )}
    </section>
  );
}

/**
 * A single approved review — headline, body, meta line (name · place ·
 * rating), and a media strip below when attachments exist. Video plays
 * inline with browser controls (small enough clips that a lightbox is
 * overkill); images open in a lightbox on click.
 */
function ReviewCard({ review }: { review: ProductReview }) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const images = review.media.filter((m) => m.kind === "image");

  return (
    <article className="flex h-full flex-col rounded-[14px] bg-paper p-5">
      <div className="flex items-center gap-2">
        <Stars rating={review.rating} />
        {review.verified && (
          <span className="text-[11px] font-medium uppercase tracking-wide text-moss-deep">
            · Verified buyer
          </span>
        )}
      </div>
      {review.title && (
        <p className="mt-2 font-display text-[17px] font-normal text-midnight">{review.title}</p>
      )}
      <p className="mt-2 flex-1 text-[15px] leading-relaxed text-midnight/85">{review.body}</p>
      <p className="mt-3 text-[12px] text-muted">
        {review.name}
        {review.place && <> · {review.place}</>}
        <> · {review.date}</>
      </p>

      {review.media.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {review.media.map((m, i) =>
            m.kind === "image" ? (
              <button
                key={m.url}
                type="button"
                onClick={() => setLightboxIndex(images.findIndex((im) => im.url === m.url))}
                className="h-16 w-16 overflow-hidden rounded-[8px] border border-moss-tint transition hover:opacity-80"
              >
                {/* Plain <img>: user-uploaded content, unpredictable size, no
                    need for the optimizer to re-encode a thumbnail. */}
                <img
                  src={m.url}
                  alt={`Review photo ${i + 1}`}
                  className="h-full w-full object-cover"
                />
              </button>
            ) : (
              <video
                key={m.url}
                src={m.url}
                controls
                preload="metadata"
                className="h-16 w-24 rounded-[8px] border border-moss-tint object-cover"
              />
            ),
          )}
        </div>
      )}

      {lightboxIndex !== null && images[lightboxIndex] && (
        <Modal onClose={() => setLightboxIndex(null)}>
          <div className="text-center">
            <img
              src={images[lightboxIndex].url}
              alt={`Review photo ${lightboxIndex + 1}`}
              className="mx-auto max-h-[80vh] w-auto max-w-full rounded-[8px]"
            />
            {images.length > 1 && (
              <div className="mt-3 flex justify-center gap-2">
                {images.map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setLightboxIndex(i)}
                    className={`h-2 w-2 rounded-full transition ${
                      i === lightboxIndex ? "bg-moss" : "bg-moss-tint"
                    }`}
                    aria-label={`Show photo ${i + 1}`}
                  />
                ))}
              </div>
            )}
          </div>
        </Modal>
      )}
    </article>
  );
}

function Stars({ rating }: { rating: number }) {
  const n = Math.max(0, Math.min(5, Math.round(rating)));
  return (
    <span className="inline-flex text-[14px] text-gold" aria-label={`${n} out of 5 stars`}>
      {[0, 1, 2, 3, 4].map((i) => (
        <span key={i} className={i < n ? "text-gold" : "text-moss-tint"}>
          ★
        </span>
      ))}
    </span>
  );
}

/** Generic modal shell — dim backdrop, click outside or press Esc to close.
 *  Kept local rather than pulled from a UI library because a global one would
 *  need Tailwind class-parity with Lumi9's tokens and there is only one usage. */
function Modal({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative max-h-[92vh] w-full max-w-[640px] overflow-auto rounded-[16px] bg-paper p-[clamp(18px,2.4vw,32px)] shadow-2xl"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full text-midnight/60 hover:bg-moss-tint"
        >
          ✕
        </button>
        {children}
      </div>
    </div>
  );
}
