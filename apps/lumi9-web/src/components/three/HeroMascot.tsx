"use client";

import { Component, Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { ACESFilmicToneMapping, SRGBColorSpace, type Group } from "three";
import { DEFAULT_EXTENTS, MascotLights, MascotModel, idleBob, type MascotExtents } from "./mascot-shared";
import { FitCamera } from "./FitCamera";
import { useNearViewport, usePrefersReducedMotion } from "@/lib/motion";

const FIT = 3.4;

/** Rotates with the pointer, drifts with page scroll, and breathes on its own. */
function ReactiveMascot({
  animate,
  onReady,
  extentsRef,
}: {
  animate: boolean;
  onReady: () => void;
  extentsRef: React.RefObject<MascotExtents>;
}) {
  const pivot = useRef<Group>(null);
  const pointer = useRef({ x: 0, y: 0, targetX: 0, targetY: 0 });

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      // Touch drags shouldn't yank the mascot around while the user scrolls.
      if (event.pointerType !== "mouse") return;
      pointer.current.targetX = event.clientX / window.innerWidth - 0.5;
      pointer.current.targetY = event.clientY / window.innerHeight - 0.5;
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, []);

  useEffect(onReady, [onReady]);

  useFrame(({ clock }) => {
    const group = pivot.current;
    if (!group) return;

    const p = pointer.current;
    p.x += (p.targetX - p.x) * 0.05;
    p.y += (p.targetY - p.y) * 0.05;

    if (!animate) {
      group.rotation.set(0, 0, 0);
      return;
    }

    const t = clock.getElapsedTime();
    const scrollFactor = window.scrollY * 0.0016;
    group.rotation.y = p.x * 0.7 + scrollFactor + Math.sin(t * 0.4) * 0.08;
    group.rotation.x = p.y * 0.35 + Math.sin(t * 0.5) * 0.03;
    idleBob(group, t);
  });

  return (
    <group ref={pivot}>
      <MascotModel fit={FIT} extentsRef={extentsRef} />
    </group>
  );
}

export function HeroMascot() {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const reducedMotion = usePrefersReducedMotion();
  const extentsRef = useRef<MascotExtents>(DEFAULT_EXTENTS);
  const host = useRef<HTMLDivElement>(null);
  const { near } = useNearViewport(host);

  /**
   * The canvas only drives a frame loop while the hero is actually on screen.
   *
   * It carried no `frameloop` at all, and r3f's default is "always" — so this
   * canvas rendered WebGL at 60fps for the whole session, including the ~13,000px
   * of homepage below it and while the tab sat in the background. Paired with the
   * footer mascot doing the same thing, that is two live GL contexts competing
   * with the compositor for every scroll frame, which is what the page felt like.
   *
   * "demand" rather than "never": the last frame stays on screen, so scrolling
   * back up finds Lumi exactly where you left him instead of a blank canvas, and
   * a resize can still invalidate one frame to re-fit the camera.
   */
  const frameloop = near && !reducedMotion ? "always" : "demand";

  return (
    <div
      ref={host}
      className="
        relative z-2 w-full
        h-[min(52svh,360px)]
        min-[420px]:h-[min(56svh,440px)]
        md:h-[min(78svh,720px)]
        [@media(max-height:560px)]:h-[min(70svh,260px)]
      "
    >
      <Canvas
        camera={{ fov: 38, position: [0, 0, 6], near: 0.1, far: 100 }}
        dpr={[1, 2]}
        resize={{ debounce: 0 }}
        gl={{ antialias: true, alpha: true, toneMapping: ACESFilmicToneMapping, outputColorSpace: SRGBColorSpace }}
        onCreated={({ gl }) => {
          gl.toneMappingExposure = 1.05;
        }}
        frameloop={frameloop}
        style={{ cursor: "grab", touchAction: "pan-y" }}
      >
        {/* generous framing on desktop; near-edge-to-edge on a phone, but still
            never clipping whatever pose the pointer/scroll rotation lands on */}
        <FitCamera extentsRef={extentsRef} padding={1.16} minPadding={1.02} tightBelow={360} looseAbove={820} />
        <MascotLights rim />
        <Suspense fallback={null}>
          <MascotBoundary onError={() => setFailed(true)}>
            <ReactiveMascot animate={!reducedMotion} onReady={() => setLoaded(true)} extentsRef={extentsRef} />
          </MascotBoundary>
        </Suspense>
      </Canvas>

      {!loaded && (
        <div className="pointer-events-none absolute inset-0 z-3 flex flex-col items-center justify-center gap-3 px-4 text-center text-[13px] text-muted">
          {failed ? (
            "Lumi is napping (model failed to load)."
          ) : (
            <>
              <span className="size-[26px] rounded-full border-3 border-moss-tint border-t-moss motion-safe:animate-ring" />
              Waking up Lumi…
            </>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Minimal boundary so a GLB/WebGL failure degrades to the "napping" caption
 * instead of taking the hero (and the page) down.
 */
class MascotBoundary extends Component<{ children: ReactNode; onError: () => void }, { crashed: boolean }> {
  state = { crashed: false };

  static getDerivedStateFromError() {
    return { crashed: true };
  }

  componentDidCatch(error: unknown) {
    console.error("mascot init failed", error);
    this.props.onError();
  }

  render() {
    return this.state.crashed ? null : this.props.children;
  }
}
