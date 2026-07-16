/**
 * JSX typing for the <pad-exploder> custom element defined in
 * public/pad-exploder.js. React 18 passes dash-cased props straight through as
 * attributes, which is exactly what the component reads, so every attribute is
 * typed as a string.
 */
import type { DetailedHTMLProps, HTMLAttributes } from 'react'

type PadExploderAttributes = DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement> & {
  /** Folder holding frame-001.webp/.jpg … Trailing slash optional. */
  'frames-path'?: string
  /** How many frames live in that folder. */
  'frame-count'?: string
  /** "true" when files run exploded->closed on disk (ours do). */
  reverse?: string
  /** Height of the scroll runway, e.g. "420vh". Bigger = slower scrub. */
  'scroll-length'?: string
  heading?: string
  'intro-text'?: string
  /** "auto" | "webp" | "jpg" */
  'frame-ext'?: string
  debug?: string
}

declare global {
  namespace JSX {
    interface IntrinsicElements {
      'pad-exploder': PadExploderAttributes
    }
  }
}

export {}
