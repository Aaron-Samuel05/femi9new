"use client";

import type { ComponentPropsWithoutRef, Ref } from "react";
import { useRevealRef } from "@/lib/motion";

type RevealTag =
  | "div"
  | "section"
  | "article"
  | "li"
  | "ul"
  | "ol"
  | "h2"
  | "h3"
  | "p"
  | "figure"
  | "blockquote";

/** Fades + lifts its child into place when 12% of it enters the viewport. */
export function Reveal({
  as = "div",
  className = "",
  delay,
  style,
  children,
  ...rest
}: ComponentPropsWithoutRef<"div"> & {
  as?: RevealTag;
  /** stagger in ms */
  delay?: number;
}) {
  const ref = useRevealRef<HTMLDivElement>();
  const Tag = as as "div";

  return (
    <Tag
      ref={ref as Ref<HTMLDivElement>}
      className={`reveal ${className}`}
      style={delay ? { transitionDelay: `${delay}ms`, ...style } : style}
      {...rest}
    >
      {children}
    </Tag>
  );
}
