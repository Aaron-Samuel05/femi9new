import { useEffect, useRef, useState, type MutableRefObject } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { RoundedBox } from '@react-three/drei'
import * as THREE from 'three'

const prefersReduced =
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n))

interface Layer {
  name: string
  desc: string
  color: string
  y0: number // stacked resting Y
  y1: number // fully exploded Y
}

/** Radical-transparency layer stack (spec §4), top sheet → backing. */
const LAYERS: Layer[] = [
  { name: 'Organic cotton top sheet', desc: 'Breathable, chlorine-free cotton against skin', color: '#FBEFE0', y0: 0.15, y1: 1.05 },
  { name: 'Mood-lifting anion strip', desc: 'The signature Femi9 negative-ion core', color: '#7FB69B', y0: 0.05, y1: 0.35 },
  { name: 'Biodegradable absorbent core', desc: 'Locks moisture, breaks back down after use', color: '#D98E6A', y0: -0.05, y1: -0.35 },
  { name: 'Leak-proof breathable backing', desc: 'Stops leaks without trapping heat', color: '#013F2D', y0: -0.15, y1: -1.05 },
]

function hasWebGL(): boolean {
  try {
    const c = document.createElement('canvas')
    return (
      !!window.WebGLRenderingContext &&
      !!(c.getContext('webgl') || c.getContext('experimental-webgl'))
    )
  } catch {
    return false
  }
}

function Layers({ progress }: { progress: MutableRefObject<number> }) {
  const group = useRef<THREE.Group>(null)

  useFrame((state, delta) => {
    const g = group.current
    if (!g) return
    const p = prefersReduced ? 1 : progress.current
    g.children.forEach((child, i) => {
      const L = LAYERS[i]
      if (!L) return
      const targetY = L.y0 + (L.y1 - L.y0) * p
      child.position.y += (targetY - child.position.y) * Math.min(1, delta * 6)
    })
    g.rotation.x = -0.52
    g.rotation.y = prefersReduced
      ? -0.5
      : Math.sin(state.clock.elapsedTime * 0.22) * 0.35 - 0.15
  })

  return (
    <group ref={group}>
      {LAYERS.map((L) => (
        <RoundedBox
          key={L.name}
          args={[1.35, 0.085, 2.75]}
          radius={0.03}
          smoothness={3}
          position={[0, L.y0, 0]}
        >
          <meshStandardMaterial color={L.color} roughness={0.78} metalness={0.02} />
        </RoundedBox>
      ))}
    </group>
  )
}

/**
 * Interactive pad anatomy (spec §4). A 3D pad that stays pinned while the
 * section scrolls; as it does, the layers "explode" apart to reveal exactly
 * what's inside — organic cotton, anion strip, biodegradable core, leak-proof
 * backing. Reduced-motion shows the exploded state statically; no-WebGL gets a
 * flat CSS diagram.
 */
export function ExplodedPad() {
  const wrapRef = useRef<HTMLDivElement>(null)
  const progress = useRef(0)
  const [webgl] = useState(hasWebGL)
  const [labelP, setLabelP] = useState(prefersReduced ? 1 : 0)

  useEffect(() => {
    const update = () => {
      const el = wrapRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const total = Math.max(rect.height - window.innerHeight, 1)
      const scrolled = clamp(-rect.top, 0, total)
      const p = scrolled / total
      progress.current = p
      setLabelP(prefersReduced ? 1 : p)
    }
    let raf = 0
    const onScroll = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(update)
    }
    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      cancelAnimationFrame(raf)
    }
  }, [])

  return (
    <div ref={wrapRef} className="exploded">
      <div className="exploded-sticky">
        <div className="exploded-stage">
          {webgl ? (
            <Canvas
              camera={{ position: [0, 0, 5], fov: 34 }}
              gl={{ antialias: true, alpha: true }}
              dpr={[1, 1.8]}
            >
              <ambientLight intensity={0.85} />
              <directionalLight position={[3, 6, 4]} intensity={1.15} />
              <directionalLight position={[-4, -2, -3]} intensity={0.35} />
              <Layers progress={progress} />
            </Canvas>
          ) : (
            <div className="exploded-fallback" aria-hidden="true">
              {LAYERS.map((L) => (
                <span key={L.name} className="exploded-fallback-layer"
                  style={{ background: L.color }} />
              ))}
            </div>
          )}
        </div>

        <ol className="exploded-legend" style={{ '--p': labelP } as React.CSSProperties}>
          {LAYERS.map((L, i) => (
            <li key={L.name} style={{ '--i': i } as React.CSSProperties}>
              <span className="exploded-swatch" style={{ background: L.color }} />
              <span className="exploded-legend-text">
                <b>{L.name}</b>
                <small>{L.desc}</small>
              </span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  )
}
