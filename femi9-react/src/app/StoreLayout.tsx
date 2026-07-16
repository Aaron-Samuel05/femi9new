import { Outlet } from 'react-router-dom'
import { Nav } from '../components/Nav'
import { Footer } from '../components/Footer'
import { LiquidBackground } from '../immersive/LiquidBackground'
import { FluidCursor } from '../immersive/FluidCursor'

export function StoreLayout() {
  return (
    <>
      <LiquidBackground />
      <FluidCursor />
      <Nav />
      <Outlet />
      <Footer />
    </>
  )
}
