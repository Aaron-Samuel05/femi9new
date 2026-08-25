import { Fragment, type ReactNode } from "react";
import Link from "next/link";

/**
 * Renders a journal article's body blocks.
 *
 * Block grammar (see `src/lib/journal.ts` for the authoring notes):
 *
 *   "## …"        section heading      "### …"     sub-heading
 *   "> …"         pull quote           "• a\n• b"  bullet list
 *   "1. a\n2. b"  numbered list        anything else — a paragraph
 *
 * A list is ONE block whose items are separated by embedded newlines. Rendering
 * that as a paragraph would let HTML whitespace collapsing eat every separator
 * and produce one run-on sentence with bullet characters stranded mid-line, so
 * the split happens here rather than at authoring time.
 *
 * The numbered branch requires an embedded newline as well as the "N. " marker,
 * so an ordinary paragraph opening with a figure — "2026 marked a new chapter…"
 * — can never be mistaken for a one-item ordered list.
 */

const LIST_MARKER = /^\s*(?:•|\d+\.)\s+/;

function listKind(block: string): "ul" | "ol" | null {
  if (/^\s*•\s/.test(block)) return "ul";
  if (block.includes("\n") && /^\s*\d+\.\s/.test(block)) return "ol";
  return null;
}

/**
 * Inline markdown: `**bold**` and `[label](href)`.
 *
 * Both are matched in one pass so a link inside bold text (or the reverse)
 * cannot be half-parsed. Anything that is not one of the two forms is emitted
 * as plain text — no HTML is ever interpreted, so authored copy cannot inject
 * markup into the page.
 */
const INLINE = /\*\*(.+?)\*\*|\[([^\]]+)\]\(([^)\s]+)\)/g;

function inline(text: string, keyPrefix: string): ReactNode {
  const parts: ReactNode[] = [];
  let last = 0;
  let match: RegExpExecArray | null;

  INLINE.lastIndex = 0;
  while ((match = INLINE.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    const key = `${keyPrefix}-${match.index}`;

    if (match[1] !== undefined) {
      parts.push(
        <strong key={key} className="font-semibold text-midnight">
          {match[1]}
        </strong>,
      );
    } else {
      const [label, href] = [match[2], match[3]];
      const external = /^https?:\/\//.test(href);
      parts.push(
        external ? (
          <a
            key={key}
            href={href}
            target="_blank"
            /* noreferrer as well as noopener: without it the destination gets
               this article's URL in its referrer log, and `target=_blank`
               without noopener hands it a live `window.opener` handle. */
            rel="noopener noreferrer nofollow"
            className="font-medium text-moss-deep underline decoration-moss-soft underline-offset-[3px] transition-colors hover:decoration-moss-deep"
          >
            {label}
          </a>
        ) : (
          <Link
            key={key}
            href={href}
            className="font-medium text-moss-deep underline decoration-moss-soft underline-offset-[3px] transition-colors hover:decoration-moss-deep"
          >
            {label}
          </Link>
        ),
      );
    }
    last = match.index + match[0].length;
  }

  if (last < text.length) parts.push(text.slice(last));
  return parts.length === 1 ? parts[0] : <>{parts.map((part, i) => <Fragment key={i}>{part}</Fragment>)}</>;
}

/** `id` for a heading, so the in-page anchors in a long guide stay linkable. */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 60);
}

export function ArticleBody({ blocks }: { blocks: string[] }) {
  return (
    <div className="flex flex-col gap-[clamp(16px,1.8vw,22px)]">
      {blocks.map((block, i) => {
        if (block.startsWith("## ")) {
          const text = block.slice(3);
          return (
            <h2
              key={i}
              id={slugify(text)}
              className="m-0 mt-[clamp(20px,3vw,38px)] scroll-mt-28 font-display text-[clamp(22px,4.4vw,32px)] leading-[1.16] font-normal tracking-[-0.015em] text-midnight"
            >
              {inline(text, `h2-${i}`)}
            </h2>
          );
        }

        if (block.startsWith("### ")) {
          const text = block.slice(4);
          return (
            <h3
              key={i}
              id={slugify(text)}
              className="m-0 mt-[clamp(10px,1.6vw,18px)] scroll-mt-28 text-[clamp(17px,2vw,20px)] leading-[1.3] font-bold text-midnight"
            >
              {inline(text, `h3-${i}`)}
            </h3>
          );
        }

        if (block.startsWith("> ")) {
          return (
            <blockquote
              key={i}
              className="my-[clamp(8px,1.4vw,16px)] m-0 rounded-card border-l-4 border-[var(--accent)] bg-moss-tint/40 py-[clamp(16px,2vw,24px)] pr-[clamp(16px,2vw,26px)] pl-[clamp(16px,2vw,26px)] font-display text-[clamp(17px,1.8vw,21px)] leading-[1.45] text-midnight"
            >
              {inline(block.slice(2), `q-${i}`)}
            </blockquote>
          );
        }

        const kind = listKind(block);
        if (kind) {
          const items = block
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean)
            .map((line) => line.replace(LIST_MARKER, ""));

          const shared =
            "m-0 flex flex-col gap-2.5 pl-[1.35em] text-[clamp(15px,1.25vw,17px)] leading-[1.72] text-muted marker:text-moss";

          return kind === "ol" ? (
            <ol key={i} className={`${shared} list-decimal`}>
              {items.map((item, j) => (
                <li key={j} className="pl-1">
                  {inline(item, `ol-${i}-${j}`)}
                </li>
              ))}
            </ol>
          ) : (
            <ul key={i} className={`${shared} list-disc`}>
              {items.map((item, j) => (
                <li key={j} className="pl-1">
                  {inline(item, `ul-${i}-${j}`)}
                </li>
              ))}
            </ul>
          );
        }

        return (
          <p key={i} className="m-0 text-[clamp(15px,1.25vw,17px)] leading-[1.72] text-muted">
            {inline(block, `p-${i}`)}
          </p>
        );
      })}
    </div>
  );
}
