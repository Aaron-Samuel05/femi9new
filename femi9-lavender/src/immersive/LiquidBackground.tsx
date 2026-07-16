import { useMemo, useRef, useState } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { ScreenQuad } from '@react-three/drei'
import * as THREE from 'three'
import { useCycleMode, type CycleMode } from './CycleMode'

const prefersReduced =
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * Lavender-edition palettes for the liquid — soft lilac + pale-gold blobs over a
 * lavender-white base, moving away from the neon-pink period-brand cliché
 * (spec §1). The palette shifts with cycle mode: calmer & lighter in the active
 * phase, a touch warmer & more editorial in the planning phase.
 */
const PALETTES: Record<CycleMode, { base: string; a: string; b: string; c: string }> = {
  // Lavender edition: soft lavender base with barely-there lilac + pale-gold
  // blobs, so the page reads as a premium pastel field.
  menstrual: { base: '#FBF9FF', a: '#EFE6FB', b: '#F1EAF9', c: '#FBF3DE' },
  // Planning phase leans a touch warmer with more gold, still pastel.
  planning: { base: '#FCF9FF', a: '#E9DBF7', b: '#F5E7C5', c: '#EFE6FB' },
}

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`

const fragmentShader = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform float uTime;
  uniform vec2 uResolution;
  uniform vec3 uBase;
  uniform vec3 uA;
  uniform vec3 uB;
  uniform vec3 uC;

  // Ashima 2D simplex noise
  vec3 mod289(vec3 x){ return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec2 mod289(vec2 x){ return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec3 permute(vec3 x){ return mod289(((x * 34.0) + 1.0) * x); }
  float snoise(vec2 v){
    const vec4 C = vec4(0.211324865405187, 0.366025403784439,
                        -0.577350269189626, 0.024390243902439);
    vec2 i  = floor(v + dot(v, C.yy));
    vec2 x0 = v - i + dot(i, C.xx);
    vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    vec4 x12 = x0.xyxy + C.xxzz;
    x12.xy -= i1;
    i = mod289(i);
    vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0))
           + i.x + vec3(0.0, i1.x, 1.0));
    vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy),
                            dot(x12.zw, x12.zw)), 0.0);
    m = m * m; m = m * m;
    vec3 x = 2.0 * fract(p * C.www) - 1.0;
    vec3 h = abs(x) - 0.5;
    vec3 ox = floor(x + 0.5);
    vec3 a0 = x - ox;
    m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
    vec3 g;
    g.x  = a0.x * x0.x + h.x * x0.y;
    g.yz = a0.yz * x12.xz + h.yz * x12.yw;
    return 130.0 * dot(m, g);
  }
  float fbm(vec2 p){
    float v = 0.0;
    float amp = 0.5;
    for (int i = 0; i < 5; i++) {
      v += amp * snoise(p);
      p *= 2.0;
      amp *= 0.5;
    }
    return v;
  }

  void main() {
    float aspect = uResolution.x / max(uResolution.y, 1.0);
    vec2 p = vec2(vUv.x * aspect, vUv.y);
    float t = uTime * 0.05;

    float n1 = fbm(p * 1.5 + vec2(t, -t * 0.7));
    float n2 = fbm(p * 2.3 + vec2(-t * 0.8, t * 0.5) + n1);

    float blobA = smoothstep(-0.15, 0.9, n1);
    float blobB = smoothstep(0.0, 1.0, n2);
    float blobC = smoothstep(0.3, 1.0, n1 * n2 + 0.2);

    vec3 col = uBase;
    col = mix(col, uA, blobA * 0.85);
    col = mix(col, uB, blobB * 0.55);
    col = mix(col, uC, blobC * 0.45);

    // keep the whole thing airy so foreground text stays readable — subtle
    // enough that the page still reads as clean cream, just gently alive
    col = mix(uBase, col, 0.42);

    gl_FragColor = vec4(col, 1.0);
  }
`

function LiquidPlane() {
  const { mode } = useCycleMode()
  const matRef = useRef<THREE.ShaderMaterial>(null)
  // Mutable color targets we lerp toward — gives a smooth palette morph when
  // the cycle mode flips, instead of a hard cut.
  const target = useRef({
    base: new THREE.Color(PALETTES.menstrual.base),
    a: new THREE.Color(PALETTES.menstrual.a),
    b: new THREE.Color(PALETTES.menstrual.b),
    c: new THREE.Color(PALETTES.menstrual.c),
  })

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uResolution: { value: new THREE.Vector2(1, 1) },
      uBase: { value: new THREE.Color(PALETTES.menstrual.base) },
      uA: { value: new THREE.Color(PALETTES.menstrual.a) },
      uB: { value: new THREE.Color(PALETTES.menstrual.b) },
      uC: { value: new THREE.Color(PALETTES.menstrual.c) },
    }),
    [],
  )

  const pal = PALETTES[mode]
  target.current.base.set(pal.base)
  target.current.a.set(pal.a)
  target.current.b.set(pal.b)
  target.current.c.set(pal.c)

  useFrame((state, delta) => {
    const m = matRef.current
    if (!m) return
    if (!prefersReduced) m.uniforms.uTime.value = state.clock.elapsedTime
    m.uniforms.uResolution.value.set(state.size.width, state.size.height)
    const k = Math.min(1, delta * 2.2)
    ;(m.uniforms.uBase.value as THREE.Color).lerp(target.current.base, k)
    ;(m.uniforms.uA.value as THREE.Color).lerp(target.current.a, k)
    ;(m.uniforms.uB.value as THREE.Color).lerp(target.current.b, k)
    ;(m.uniforms.uC.value as THREE.Color).lerp(target.current.c, k)
  })

  return (
    <ScreenQuad>
      <shaderMaterial
        ref={matRef}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        depthTest={false}
        depthWrite={false}
      />
    </ScreenQuad>
  )
}

function hasWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas')
    return (
      !!window.WebGLRenderingContext &&
      !!(canvas.getContext('webgl') || canvas.getContext('experimental-webgl'))
    )
  } catch {
    return false
  }
}

/**
 * Organic liquid-gradient backdrop (spec §1). Fixed behind the whole page; the
 * cream sections that sit on top mask it, so it reads strongest through the
 * transparent hero — a slow, breathing field of warm colour. Falls back to a
 * static CSS gradient when WebGL is unavailable, and freezes (no rAF) under
 * reduced-motion.
 */
export function LiquidBackground() {
  const [webgl] = useState(hasWebGL)

  if (!webgl) {
    return <div className="liquid-bg liquid-bg--fallback" aria-hidden="true" />
  }

  return (
    <div className="liquid-bg" aria-hidden="true">
      <Canvas
        gl={{ antialias: false, alpha: false, powerPreference: 'low-power' }}
        dpr={[1, 1.5]}
        frameloop={prefersReduced ? 'demand' : 'always'}
      >
        <LiquidPlane />
      </Canvas>
    </div>
  )
}
