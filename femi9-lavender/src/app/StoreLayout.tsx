import { Outlet } from 'react-router-dom'
import { Nav } from '../components/Nav'
import { Footer } from '../components/Footer'

/**
 * The page's background is a static CSS field (.liquid-bg--fallback), not a
 * WebGL canvas.
 *
 * Two things were removed here on a Hallmark audit:
 *
 *  - LiquidBackground (three + R3F). Drifting mesh blobs behind the hero are a
 *    named tell ("aurora-blob background"), and a 3D scene the visitor cannot
 *    touch, reorient or customise does not earn a 220KB gzipped bundle
 *    ("three.js for a still object"). The CSS field it already fell back to on
 *    no-WebGL devices looks near-identical and costs nothing.
 *  - FluidCursor. A dot that lags behind the pointer is a named tell outright,
 *    and it was hover-only, so touch and keyboard users never had it anyway.
 *
 * Both components are still on disk if this needs revisiting.
 */
function PageField() {
  return <div className="liquid-bg liquid-bg--fallback" aria-hidden="true" />
}

export function StoreLayout() {
  return (
    <>
      <PageField />
      <Nav />
      <Outlet />
      <Footer />
    </>
  )
}
