"use client";

import { Suspense, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { ACESFilmicToneMapping, SRGBColorSpace, type Group } from "three";
import { DEFAULT_EXTENTS, MascotLights, MascotModel, idleBob, type MascotExtents } from "./mascot-shared";
import { FitCamera } from "./FitCamera";
import { useNearViewport, usePrefersReducedMotion } from "@/lib/motion";

const FIT = 2.6;
const FOV = 38;

function IdleMascot({
  animate,
  extentsRef,
}: {
  animate: boolean;
  extentsRef: React.RefObject<MascotExtents>;
}) {
  const pivot = useRef<Group>(null);

  useFrame(({ clock }) => {
    if (!animate || !pivot.current) return;
    const t = clock.getElapsedTime();
    pivot.current.rotation.y = Math.sin(t * 0.4) * 0.35;
    idleBob(pivot.current, t);
  });

  return (
    <group ref={pivot}>
      <MascotModel fit={FIT} extentsRef={extentsRef} />
    </group>
  );
}

/** Renders the mascot only once the footer is close to the viewport. */
export function FooterMascot() {
  const host = useRef<HTMLDivElement>(null);
  const reducedMotion = usePrefersReducedMotion();
  const extentsRef = useRef<MascotExtents>(DEFAULT_EXTENTS);

  /**
   * `active` is one-way on purpose — tearing the canvas down would drop the GL
   * context and re-decode the GLB every time the footer scrolled away.
   *
   * `near` is the one that keeps reporting, and it is what gates the frame loop
   * below. Before, reaching the footer once left this canvas rendering at 60fps
   * for the rest of the session, on EVERY page — the footer is in PageShell.
   */
  const { near, seen: active } = useNearViewport(host, "400px");

  // Full-bleed in the tall desktop rail; capped and centred when the footer stacks,
  // so the canvas never becomes a very wide, short letterbox and Lumi keeps a
  // comfortable size at every ratio.
  return (
    <div
      ref={host}
      className="absolute inset-y-0 left-1/2 z-2 w-full max-w-[min(100%,460px)] -translate-x-1/2"
      aria-hidden
    >
      {active && (
        <Canvas
          camera={{ fov: FOV, position: [0, 0, 8], near: 0.1, far: 100 }}
          dpr={[1, 2.5]}
          resize={{ debounce: 0 }}
          gl={{ antialias: true, alpha: true, toneMapping: ACESFilmicToneMapping, outputColorSpace: SRGBColorSpace }}
          onCreated={({ gl }) => {
            gl.toneMappingExposure = 1.05;
          }}
          frameloop={near && !reducedMotion ? "always" : "demand"}
        >
          {/* the handoff framed this loosely (×1.3); hold that on desktop and tighten
              a little on a phone-width panel so Lumi doesn't shrink to a dot */}
          <FitCamera
            extentsRef={extentsRef}
            padding={1.3}
            minPadding={1.12}
            tightBelow={280}
            looseAbove={560}
            tiltAllowance={1}
          />
          <MascotLights />
          <Suspense fallback={null}>
            <IdleMascot animate={!reducedMotion} extentsRef={extentsRef} />
          </Suspense>
        </Canvas>
      )}
    </div>
  );
}
