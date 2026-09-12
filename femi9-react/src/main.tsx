import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

// Editorial display serif (existing brand content).
import '@fontsource/fraunces/400.css'
import '@fontsource/fraunces/500.css'
import '@fontsource/fraunces/600.css'
import '@fontsource/fraunces/700.css'
import '@fontsource/fraunces/500-italic.css'
import '@fontsource/fraunces/600-italic.css'

import 'lenis/dist/lenis.css'
import './styles/base.css'
import './styles/type.css'
import './components/Nav.css'
import './components/Hero.css'
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
import './immersive/immersive.css'
import './styles/product-detail.css'

import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
