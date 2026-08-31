"use client";

import { useRef, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import type { PerspectiveCamera } from "three";
import type { MascotExtents } from "./mascot-shared";

/**
 * Keeps the mascot fully framed at any canvas size or ratio - phone, tablet,
 * desktop, landscape, or a footer panel that's wider than it is tall.
 *
 * Given the model's half-height and its worst-case half-width while spinning
 * (see MascotExtents), the camera needs to clear both limits:
 *
 *   tan(fovV / 2)              → vertical half-angle
 *   tan(fovH / 2) = tanV * aspect  → horizontal half-angle
 *   z = max(halfHeight / tanV, halfWidth / tanH) * padding
 *
 * Taking the max is what stops a tall, narrow phone canvas from slicing the
 * mascot's sides - the aspect-fit idea from the handoff's footer-mascot.js, made
 * exact by measuring the model instead of assuming a square silhouette.
 *
 * `padding` is the breathing room around the model; it eases down towards
 * `minPadding` on small canvases so the mascot still reads large on a phone
 * without ever touching the frame edge.
 */
export function FitCamera({
  extentsRef,
  padding = 1.12,
  minPadding = padding,
  /** canvas width at or below which `minPadding` fully applies */
  tightBelow = 380,
  /** canvas width at or above which `padding` fully applies */
  looseAbove = 900,
  /** extra allowance for the small X-axis tilt in the hero animation */
  tiltAllowance = 1.05,
}: {
  extentsRef: RefObject<MascotExtents>;
  padding?: number;
  minPadding?: number;
  tightBelow?: number;
  looseAbove?: number;
  tiltAllowance?: number;
}) {
  const last = useRef({ aspect: 0, width: 0, halfHeight: 0, halfWidth: 0 });

  useFrame(({ camera, size }) => {
    if (!size.width || !size.height) return;

    const { halfHeight, halfWidth } = extentsRef.current;
    const aspect = size.width / size.height;

    // Only recompute when the frame changed shape or the model finished loading.
    const previous = last.current;
    if (
      Math.abs(aspect - previous.aspect) < 0.002 &&
      Math.abs(size.width - previous.width) < 1 &&
      halfHeight === previous.halfHeight &&
      halfWidth === previous.halfWidth
    ) {
      return;
    }
    last.current = { aspect, width: size.width, halfHeight, halfWidth };

    const perspective = camera as PerspectiveCamera;
    const tanV = Math.tan(((perspective.fov * Math.PI) / 180) / 2);
    const tanH = tanV * aspect;

    const distV = (halfHeight * tiltAllowance) / tanV;
    const distH = halfWidth / tanH;

    const t = Math.min(1, Math.max(0, (size.width - tightBelow) / (looseAbove - tightBelow)));
    const easedPadding = minPadding + (padding - minPadding) * t;

    perspective.position.z = Math.max(distV, distH) * easedPadding;
    perspective.aspect = aspect;
    perspective.updateProjectionMatrix();
  });

  return null;
}
