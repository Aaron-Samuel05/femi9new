import { lazy, Suspense, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { CartProvider } from './store/cart'
import { StoreLayout } from './app/StoreLayout'
import { Home } from './pages/Home'

/* Home stays eagerly imported: it is the landing route, so code-splitting it
   would only add a round trip. Every other route is split out so a visitor
   who lands on / never downloads the blog, the wall, the dashboards or the
   admin panel. */
const ProductDetail = lazy(() => import('./pages/ProductDetail').then((m) => ({ default: m.ProductDetail })))
const Blog = lazy(() => import('./pages/Blog').then((m) => ({ default: m.Blog })))
const BlogPost = lazy(() => import('./pages/BlogPost').then((m) => ({ default: m.BlogPost })))
const PeriodsWall = lazy(() => import('./pages/PeriodsWall').then((m) => ({ default: m.PeriodsWall })))
const Partner = lazy(() => import('./pages/Partner').then((m) => ({ default: m.Partner })))
const Affiliate = lazy(() => import('./pages/Affiliate').then((m) => ({ default: m.Affiliate })))
const UserDashboard = lazy(() => import('./pages/UserDashboard').then((m) => ({ default: m.UserDashboard })))
const Account = lazy(() => import('./pages/Account').then((m) => ({ default: m.Account })))
const AdminDashboard = lazy(() => import('./pages/AdminDashboard').then((m) => ({ default: m.AdminDashboard })))

import { CartDrawer } from './components/CartDrawer'
import { Toast } from './components/Toast'
import { CycleModeProvider } from './immersive/CycleMode'
import { SmoothScroll, useLenis } from './immersive/SmoothScroll'

function ScrollManager() {
  const { pathname, hash } = useLocation()
  const lenis = useLenis()
  useEffect(() => {
    if (hash) {
      const el = document.getElementById(hash.slice(1))
      if (el) {
        if (lenis) lenis.scrollTo(el, { offset: -70 })
        else el.scrollIntoView({ behavior: 'smooth' })
        return
      }
    }
    if (lenis) lenis.scrollTo(0, { immediate: true })
    else window.scrollTo({ top: 0 })
  }, [pathname, hash, lenis])
  return null
}

export default function App() {
  return (
    <CartProvider>
      <CycleModeProvider>
        <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <SmoothScroll>
            <ScrollManager />
            {/* fallback is null rather than a spinner: the split routes resolve
                in a few ms on a warm connection, and a flashed loader reads
                worse than a brief hold on the current paint. */}
            <Suspense fallback={null}>
              <Routes>
                <Route element={<StoreLayout />}>
                  <Route path="/" element={<Home />} />
                  <Route path="/product/:id" element={<ProductDetail />} />
                  <Route path="/blog" element={<Blog />} />
                  <Route path="/blog/:slug" element={<BlogPost />} />
                  <Route path="/periods-wall" element={<PeriodsWall />} />
                  <Route path="/partner" element={<Partner />} />
                  <Route path="/affiliate" element={<Affiliate />} />
                </Route>
                <Route path="/dashboard" element={<UserDashboard />} />
                <Route path="/account" element={<Account />} />
                <Route path="/admin" element={<AdminDashboard />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Suspense>
            <CartDrawer />
            <Toast />
          </SmoothScroll>
        </BrowserRouter>
      </CycleModeProvider>
    </CartProvider>
  )
}
