"use client";

import { useEffect, useMemo, type RefObject } from "react";
import { Box3, Vector3, type Group } from "three";
import { useGLTF } from "@react-three/drei";
import { MASCOT_URL, DRACO_DECODER_PATH } from "@/lib/mascot";

/**
 * The model URL and decoder path live in `@/lib/mascot` - a plain module - so the
 * home page's server-rendered `<link rel="preload">` can import the same string
 * this canvas loads. Re-exported here because that is where the three components
 * already reach for them.
 */
export { MASCOT_URL, DRACO_DECODER_PATH } from "@/lib/mascot";

/**
 * Half-extents of the scaled model, expressed as what the camera actually has to
 * cover: the vertical half-height, and the largest horizontal half-width the
 * silhouette can reach while spinning about Y (the radius in the XZ plane).
 * Using the XZ radius - not just half of X - is what keeps the mascot uncropped
 * at every point of its idle sway and scroll rotation.
 */
export type MascotExtents = { halfHeight: number; halfWidth: number };

export const DEFAULT_EXTENTS: MascotExtents = { halfHeight: 1, halfWidth: 1 };

/** Studio rig from the handoff: hemisphere + white key + butter fill (+ moss rim). */
export function MascotLights({ rim = false }: { rim?: boolean }) {
  return (
    <>
      <hemisphereLight args={[0xffffff, 0x9aa86a, rim ? 1.15 : 1.2]} />
      <directionalLight color={0xffffff} intensity={2.1} position={[4, 6, 5]} />
      <directionalLight color={0xfff0a3} intensity={0.7} position={[-5, 1, 3]} />
      {rim && <directionalLight color={0xa7b578} intensity={0.9} position={[-2, 3, -5]} />}
    </>
  );
}

/**
 * Loads the mascot GLB (Draco-compressed), then normalises it: uniformly scaled so
 * its longest axis measures `fit`, and re-centred on the origin. Reports its
 * measured extents so <FitCamera> can frame it at any canvas ratio.
 */
export function MascotModel({
  fit,
  extentsRef,
}: {
  fit: number;
  extentsRef?: RefObject<MascotExtents>;
}) {
  const { scene } = useGLTF(MASCOT_URL, DRACO_DECODER_PATH);

  const { model, extents } = useMemo(() => {
    const clone = scene.clone(true);
    const box = new Box3().setFromObject(clone);
    const size = box.getSize(new Vector3());
    const center = box.getCenter(new Vector3());
    const scale = fit / Math.max(size.x, size.y, size.z);
    clone.scale.setScalar(scale);
    clone.position.sub(center.multiplyScalar(scale));

    const half = size.multiplyScalar(scale / 2);
    return {
      model: clone,
      extents: { halfHeight: half.y, halfWidth: Math.hypot(half.x, half.z) } satisfies MascotExtents,
    };
  }, [scene, fit]);

  // Hand the measurements to <FitCamera> after render; it re-frames on the next frame.
  useEffect(() => {
    if (extentsRef) extentsRef.current = extents;
  }, [extents, extentsRef]);

  return <primitive object={model} />;
}

/** Shared idle bob used by both mascots. */
export function idleBob(pivot: Group | null, elapsed: number) {
  if (pivot) pivot.position.y = Math.sin(elapsed * 0.9) * 0.12;
}

useGLTF.preload(MASCOT_URL, DRACO_DECODER_PATH);
