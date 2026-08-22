"use client";

import type { CSSProperties, ReactNode } from "react";
import { useParallaxRef } from "@/lib/motion";

/**
 * Drifts its children on scroll + pointer move. The design put both the drift
 * transform and the `floaty` keyframes on the same node (where the animation
 * silently won); here the wrapper owns the drift so a floating child can do both.
 */
export function Parallax({
  factor = 0.2,
  pointerScale = 60,
  className = "",
  style,
  children,
  "aria-hidden": ariaHidden,
}: {
  factor?: number;
  pointerScale?: number;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
  "aria-hidden"?: boolean;
}) {
  const ref = useParallaxRef<HTMLDivElement>(factor, pointerScale);

  return (
    <div ref={ref} className={className} style={{ willChange: "transform", ...style }} aria-hidden={ariaHidden}>
      {children}
    </div>
  );
}

/** Decorative blob: parallax wrapper + floaty inner, honouring reduced motion. */
export function FloatyBlob({
  factor = 0.2,
  pointerScale = 60,
  className = "",
  style,
  innerClassName = "",
  duration = "7s",
  delay = "0s",
}: {
  factor?: number;
  pointerScale?: number;
  className?: string;
  style?: CSSProperties;
  innerClassName?: string;
  duration?: string;
  delay?: string;
}) {
  return (
    <Parallax factor={factor} pointerScale={pointerScale} className={className} style={style} aria-hidden>
      <div
        className={`h-full w-full motion-safe:animate-floaty ${innerClassName}`}
        style={{ animationDuration: duration, animationDelay: delay }}
      />
    </Parallax>
  );
}
