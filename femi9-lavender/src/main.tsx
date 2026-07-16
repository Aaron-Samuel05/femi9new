import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

// Lavender edition: Newsreader (editorial serif display) + Urbanist (body/UI),
// both loaded via the Google Fonts link in index.html.

// Lenis recommended base styles (height:auto, overscroll containment) — needed
// for the smooth scroll to behave correctly.
import 'lenis/dist/lenis.css'

// CSS imported here in cascade order: base tokens first, component styles next,
// responsive media queries LAST so they always win.
import './styles/base.css'
import './components/Nav.css'
import './components/Hero.css'
import './components/HeroBanner.css'
import './components/TrustStrip.css'
import './components/Products.css'
import './components/WhyBento.css'
import './components/Story.css'
import './components/Impact.css'
import './components/Cta.css'
import './components/Footer.css'
import './components/CartDrawer.css'
import './charts/charts.css'
import './styles/app.css'
import './styles/blog.css'
import './styles/responsive.css'
// Immersive layer last so its overrides (page transparency, editorial type) win.
import './immersive/immersive.css'

import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
