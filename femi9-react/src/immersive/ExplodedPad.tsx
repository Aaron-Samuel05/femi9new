import { useEffect, useRef, useState, type MutableRefObject } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { RoundedBox, Float, ContactShadows } from '@react-three/drei'
import * as THREE from 'three'
import './ExplodedPad.css'

const prefersReduced = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n))

interface Layer { name: string; desc: string; color: string; y0: number; y1: number; thickness: number }
const LAYERS: Layer[] = [
  { name: 'Soft cotton top sheet', desc: 'The skin-facing layer — soft, breathable and ultra-thin.', color: '#fff7ef', y0: 0.18, y1: 1.18, thickness: 0.12 },
  { name: 'Anion strip', desc: 'Femi9’s signature green centre strip, visible through the anatomy view.', color: '#78b995', y0: 0.06, y1: 0.42, thickness: 0.08 },
  { name: 'Absorbent core', desc: 'The cushioning layer that carries liquid away from the surface.', color: '#e1a07d', y0: -0.06, y1: -0.38, thickness: 0.16 },
  { name: 'Breathable backing', desc: 'The deep green protective base that helps guard against leaks.', color: '#0c4a3a', y0: -0.16, y1: -1.18, thickness: 0.11 },
]

function hasWebGL() { try { const c = document.createElement('canvas'); return !!window.WebGLRenderingContext && !!(c.getContext('webgl') || c.getContext('experimental-webgl')) } catch { return false } }

function PadPiece({ layer, progress, index }: { layer: Layer; progress: MutableRefObject<number>; index: number }) {
  const ref = useRef<THREE.Group>(null)
  useFrame((state, delta) => {
    const g = ref.current
    if (!g) return
    const p = prefersReduced ? 1 : progress.current
    const targetY = layer.y0 + (layer.y1 - layer.y0) * p
    g.position.y += (targetY - g.position.y) * Math.min(1, delta * 7)
    const parallax = prefersReduced ? 0 : state.pointer.x * 0.10
    g.rotation.y += ((-0.08 + parallax + Math.sin(state.clock.elapsedTime * 0.18 + index) * 0.025) - g.rotation.y) * Math.min(1, delta * 4)
    g.rotation.z += ((state.pointer.y * 0.045) - g.rotation.z) * Math.min(1, delta * 4)
  })
  const wingX = 0.82
  return (
    <group ref={ref} position={[0, layer.y0, 0]}>
      <RoundedBox args={[1.42, layer.thickness, 2.95]} radius={0.24} smoothness={8}>
        <meshPhysicalMaterial color={layer.color} roughness={index === 0 ? 0.48 : 0.72} metalness={0.01} clearcoat={index === 0 ? 0.25 : 0.05} />
      </RoundedBox>
      {index !== 2 && (
        <>
          <RoundedBox args={[0.72, Math.max(0.06, layer.thickness * 0.78), 0.78]} radius={0.18} smoothness={6} position={[-wingX, -0.01, 0.25]} rotation={[0, 0, -0.06]}>
            <meshPhysicalMaterial color={layer.color} roughness={0.7} />
          </RoundedBox>
          <RoundedBox args={[0.72, Math.max(0.06, layer.thickness * 0.78), 0.78]} radius={0.18} smoothness={6} position={[wingX, -0.01, 0.25]} rotation={[0, 0, 0.06]}>
            <meshPhysicalMaterial color={layer.color} roughness={0.7} />
          </RoundedBox>
        </>
      )}
      {index === 0 && <RoundedBox args={[0.42, 0.035, 1.9]} radius={0.12} smoothness={6} position={[0, 0.075, 0.12]}><meshPhysicalMaterial color="#d9eee2" roughness={0.52} /></RoundedBox>}
      {index === 1 && <RoundedBox args={[0.34, 0.035, 1.75]} radius={0.08} smoothness={5} position={[0, 0.06, 0.12]}><meshPhysicalMaterial color="#d5a64f" roughness={0.46} /></RoundedBox>}
    </group>
  )
}

function Layers({ progress }: { progress: MutableRefObject<number> }) {
  const group = useRef<THREE.Group>(null)
  useFrame((state, delta) => {
    const g = group.current
    if (!g) return
    const targetX = prefersReduced ? -0.48 : -0.5 + state.pointer.y * 0.06
    const targetY = prefersReduced ? -0.42 : -0.34 + state.pointer.x * 0.10
    g.rotation.x += (targetX - g.rotation.x) * Math.min(1, delta * 4)
    g.rotation.y += (targetY - g.rotation.y) * Math.min(1, delta * 4)
  })
  return <group ref={group}>{LAYERS.map((layer, index) => <PadPiece key={layer.name} layer={layer} progress={progress} index={index} />)}</group>
}

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
      const p = clamp(-rect.top, 0, total) / total
      progress.current = p
      setLabelP(prefersReduced ? 1 : p)
    }
    let raf = 0
    const onScroll = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(update) }
    update(); window.addEventListener('scroll', onScroll, { passive: true }); window.addEventListener('resize', onScroll)
    return () => { window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onScroll); cancelAnimationFrame(raf) }
  }, [])
  return (
    <div ref={wrapRef} className="exploded exploded-premium">
      <div className="exploded-sticky">
        <div className="exploded-stage">
          <div className="exploded-orb exploded-orb-one" />
          <div className="exploded-orb exploded-orb-two" />
          {webgl ? <Canvas camera={{ position: [0, 0, 5.5], fov: 34 }} gl={{ antialias: true, alpha: true }} dpr={[1, 1.8]}>
            <ambientLight intensity={1.15} />
            <directionalLight position={[4, 6, 5]} intensity={1.8} />
            <directionalLight position={[-5, 2, -4]} intensity={0.6} />
            <pointLight position={[0, 3, 2]} intensity={0.55} />
            <Float speed={0.55} rotationIntensity={0.08} floatIntensity={0.16}><Layers progress={progress} /></Float>
            <ContactShadows position={[0, -1.45, 0]} opacity={0.2} scale={4.5} blur={2.8} far={4} />
          </Canvas> : <div className="exploded-fallback" aria-hidden="true">{LAYERS.map((L) => <span key={L.name} className="exploded-fallback-layer" style={{ background: L.color }} />)}</div>}
          <div className="exploded-product-proof">
            <div className="proof-image-wrap"><img src="/assets/img/pad-detail-1.jpg" alt="Actual Femi9 pad product detail" loading="lazy" /></div>
            <div><span>ACTUAL FEMI9 PRODUCT</span><b>330mm Double Wings</b><small>Reference image from the real Femi9 range</small></div>
          </div>
        </div>
        <div className="exploded-copy-row">
          <div><span className="exploded-progress-label">SCROLL TO EXPLORE · {Math.round(labelP * 100)}%</span><h4>See what’s inside.</h4><p>One continuous, tactile animation — the pad opens layer by layer as you move through the section.</p></div>
          <ol className="exploded-legend">{LAYERS.map((L, i) => <li key={L.name} style={{ '--i': i } as React.CSSProperties}><span className="exploded-swatch" style={{ background: L.color }} /><span className="exploded-legend-text"><b>{L.name}</b><small>{L.desc}</small></span></li>)}</ol>
        </div>
      </div>
    </div>
  )
}
