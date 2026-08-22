'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { IStar, IThumbUp, IThumbDown, IChevron } from './AppIcons'
import type { ProductReview } from '@femi9/core/services/products'

/**
 * "Customer Reviews" — a paged carousel of review cards over a rating summary.
 *
 * Three behaviours make this more than a list, and each is here because the
 * reference pattern depends on it:
 *
 * • Paging, not scrolling. Cards are equal-height and read as a set of three;
 *   a free-scrolling rail leaves a half-card at the edge, which reads as an
 *   accident rather than an affordance.
 * • "Full Review" per card. Review bodies vary from one line to twelve, and a
 *   grid of equal-height cards has to clamp. Clamping without an expander hides
 *   content with no way to reach it.
 * • Helpful votes. Posted to the API, and remembered locally so the control
 *   stays settled after a refresh instead of re-arming itself.
 */

interface Props {
  reviews: ProductReview[]
  /** Average across the moderated set; falls back to the catalog's own rating. */
  averageRating: number
  reviewTotal: number
  onWriteReview: () => void
  onAskQuestion: () => void
}

/** Cards per page at desktop width. Mobile overrides this to 1 (see effect). */
const PAGE_SIZE_DESKTOP = 3

/** localStorage key holding the review ids this browser has already voted on. */
const VOTED_KEY = 'femi9:review-votes'

function Stars({ rating, className }: { rating: number; className?: string }) {
  return (
    <span
      className={`rv-stars${className ? ` ${className}` : ''}`}
      role="img"
      aria-label={`Rated ${rating.toFixed(1)} out of 5`}
    >
      {[0, 1, 2, 3, 4].map((i) => (
        <IStar key={i} className={i < Math.round(rating) ? 'rv-star rv-star--on' : 'rv-star'} />
      ))}
    </span>
  )
}

/** Reviews this browser has voted on, as `{ id: 'up' | 'down' }`. */
function readVoted(): Record<string, 'up' | 'down'> {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(VOTED_KEY)
    return raw ? (JSON.parse(raw) as Record<string, 'up' | 'down'>) : {}
  } catch {
    // A quota-exceeded or disabled store must not take the section down with it.
    return {}
  }
}

function ReviewCard({
  review,
  voted,
  onVote,
}: {
  review: ProductReview
  voted?: 'up' | 'down'
  onVote: (id: string, helpful: boolean) => void
}) {
  const [expanded, setExpanded] = useState(false)

  // Only offer the expander when there is genuinely something behind it. The
  // clamp is 4 lines; ~200 characters is where a card at this width starts to
  // overflow it, and a "Full Review" link that expands nothing is worse than
  // none at all.
  const isLong = review.body.length > 200

  // Tallies are optimistic: the vote is a single counter bump that essentially
  // cannot fail business-side, and a number that waits for a round-trip before
  // moving reads as a dead button.
  const [tally, setTally] = useState({ up: review.helpfulUp, down: review.helpfulDown })

  const vote = (helpful: boolean) => {
    if (voted) return
    setTally((t) => (helpful ? { ...t, up: t.up + 1 } : { ...t, down: t.down + 1 }))
    onVote(review.id, helpful)
  }

  return (
    <article className="rv-card">
      <header className="rv-card-head">
        <Stars rating={review.rating} />
        <time className="rv-date">{review.date}</time>
      </header>

      <div className="rv-author">
        <span className="rv-avatar" aria-hidden="true">
          {review.name.charAt(0).toUpperCase()}
        </span>
        <span className="rv-author-name">{review.name}</span>
      </div>

      {/* The headline is optional — rows written before the column existed have
          none — so the body simply moves up when it is absent. */}
      {review.title && <h3 className="rv-title">{review.title}</h3>}

      <p className={`rv-body${expanded ? ' rv-body--open' : ''}`}>{review.body}</p>

      {/* Pushes the footer to the card's baseline so a one-line review and a
          twelve-line one still align their controls across the row. */}
      <div className="rv-spacer" />

      <footer className="rv-card-foot">
        <span className="rv-source">
          {review.verified ? 'Verified purchase' : 'Review collected from a store visitor'}
        </span>

        <div className="rv-foot-row">
          {isLong ? (
            <button type="button" className="rv-more" onClick={() => setExpanded((v) => !v)}>
              {expanded ? 'Show less' : 'Full Review'}
            </button>
          ) : (
            <span />
          )}

          <div className="rv-votes">
            <button
              type="button"
              className={`rv-vote${voted === 'up' ? ' rv-vote--cast' : ''}`}
              onClick={() => vote(true)}
              disabled={Boolean(voted)}
              aria-label={`Mark ${review.name}'s review helpful`}
            >
              <IThumbUp /> <span>{tally.up}</span>
            </button>
            <button
              type="button"
              className={`rv-vote${voted === 'down' ? ' rv-vote--cast' : ''}`}
              onClick={() => vote(false)}
              disabled={Boolean(voted)}
              aria-label={`Mark ${review.name}'s review unhelpful`}
            >
              <IThumbDown /> <span>{tally.down}</span>
            </button>
          </div>
        </div>
      </footer>
    </article>
  )
}

export function ProductReviews({
  reviews,
  averageRating,
  reviewTotal,
  onWriteReview,
  onAskQuestion,
}: Props) {
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(PAGE_SIZE_DESKTOP)
  const [showAll, setShowAll] = useState(false)
  const [voted, setVoted] = useState<Record<string, 'up' | 'down'>>({})
  const liveRef = useRef<HTMLParagraphElement>(null)

  // localStorage is not available during SSR, so the voted map starts empty and
  // fills in on mount. Reading it inline would make the server and client render
  // different button states and trip a hydration mismatch.
  useEffect(() => setVoted(readVoted()), [])

  // One card per page below 760px. Three equal columns do not survive a phone,
  // and shrinking them to fit produces a 90px-wide card with two-word lines.
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 760px)')
    const apply = () => {
      setPageSize(mq.matches ? 1 : PAGE_SIZE_DESKTOP)
      setPage(0) // A page index from the old size can point past the new end.
    }
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [])

  const pageCount = Math.max(1, Math.ceil(reviews.length / pageSize))
  const visible = showAll
    ? reviews
    : reviews.slice(page * pageSize, page * pageSize + pageSize)

  const go = useCallback(
    (delta: number) => {
      setPage((p) => {
        // Wraps deliberately: with at most a handful of pages, a disabled arrow
        // at each end is a dead control most of the time.
        const next = (p + delta + pageCount) % pageCount
        return next
      })
    },
    [pageCount],
  )

  // Announce the page change. The cards swap without moving focus, so a screen
  // reader would otherwise get no indication that the content changed at all.
  useEffect(() => {
    if (liveRef.current) liveRef.current.textContent = `Page ${page + 1} of ${pageCount}`
  }, [page, pageCount])

  const histogram = useMemo(
    () =>
      [5, 4, 3, 2, 1].map((stars) => {
        const count = reviews.filter((r) => Math.round(r.rating) === stars).length
        return { stars, count, pct: reviews.length ? Math.round((count / reviews.length) * 100) : 0 }
      }),
    [reviews],
  )

  const castVote = useCallback(async (id: string, helpful: boolean) => {
    // Record locally FIRST so a failed request still settles the control. The
    // server holds the authoritative one-vote-per-visitor constraint; this is
    // only here to stop the same browser re-arming the button on every render.
    setVoted((v) => {
      const next = { ...v, [id]: helpful ? ('up' as const) : ('down' as const) }
      try {
        window.localStorage.setItem(VOTED_KEY, JSON.stringify(next))
      } catch {
        // Private-mode quota. The vote still posts; only the memory is lost.
      }
      return next
    })

    try {
      await fetch(`/api/reviews/${id}/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ helpful }),
      })
      // A 409 (already voted) needs no handling: the control is already settled
      // and the tally the visitor sees is the one their own vote produced.
    } catch {
      // Offline or blocked. Nothing to surface — a helpfulness vote is not work
      // the shopper needs to know failed.
    }
  }, [])

  if (reviews.length === 0) {
    return (
      <section className="rv-section" aria-labelledby="rv-heading">
        <h2 className="rv-heading" id="rv-heading">
          Customer Reviews
        </h2>
        <div className="rv-empty">
          <p>No reviews yet for this product.</p>
          <button type="button" className="rv-btn rv-btn--solid" onClick={onWriteReview}>
            Be the first to review it
          </button>
        </div>
      </section>
    )
  }

  return (
    <section className="rv-section" aria-labelledby="rv-heading">
      <h2 className="rv-heading" id="rv-heading">
        Customer Reviews
      </h2>

      <div className="rv-carousel">
        {/* Arrows are hidden when everything already fits on one page, rather
            than disabled — two dead chevrons flanking three cards is clutter. */}
        {!showAll && pageCount > 1 && (
          <button
            type="button"
            className="rv-arrow rv-arrow--prev"
            onClick={() => go(-1)}
            aria-label="Previous reviews"
          >
            <IChevron />
          </button>
        )}

        {/* Column count follows the page, not the page SIZE: a product with two
            reviews would otherwise get two cards crushed into the left two
            thirds of a three-column track with a hole beside them. */}
        <div
          className={`rv-grid${showAll ? ' rv-grid--all' : ''}`}
          style={
            showAll
              ? undefined
              : ({ '--rv-cols': Math.min(pageSize, reviews.length) } as CSSProperties)
          }
        >
          {visible.map((r) => (
            <ReviewCard key={r.id} review={r} voted={voted[r.id]} onVote={castVote} />
          ))}
        </div>

        {!showAll && pageCount > 1 && (
          <button
            type="button"
            className="rv-arrow rv-arrow--next"
            onClick={() => go(1)}
            aria-label="Next reviews"
          >
            <IChevron />
          </button>
        )}
      </div>

      <p ref={liveRef} className="rv-sr-only" role="status" aria-live="polite" />

      {reviews.length > pageSize && (
        <div className="rv-more-row">
          <button
            type="button"
            className="rv-btn rv-btn--pill"
            onClick={() => {
              setShowAll((v) => !v)
              setPage(0)
            }}
          >
            {showAll ? 'Show fewer reviews' : 'Read More Reviews'}
          </button>
        </div>
      )}

      <div className="rv-summary">
        <div className="rv-summary-score">
          <Stars rating={averageRating} className="rv-stars--lg" />
          <span className="rv-score-value">{averageRating.toFixed(2)} out of 5</span>
          <span className="rv-score-count">
            Based on {reviewTotal} {reviewTotal === 1 ? 'review' : 'reviews'}
          </span>
        </div>

        <div className="rv-summary-bars">
          {histogram.map((row) => (
            <div className="rv-bar-row" key={row.stars}>
              <Stars rating={row.stars} className="rv-stars--sm" />
              <span className="rv-bar-track">
                <span className="rv-bar-fill" style={{ width: `${row.pct}%` }} />
              </span>
              <span className="rv-bar-count">{row.count}</span>
            </div>
          ))}
        </div>

        <div className="rv-summary-actions">
          <button type="button" className="rv-btn rv-btn--solid" onClick={onWriteReview}>
            Write a review
          </button>
          <button type="button" className="rv-btn rv-btn--outline" onClick={onAskQuestion}>
            Ask a question
          </button>
        </div>
      </div>
    </section>
  )
}
