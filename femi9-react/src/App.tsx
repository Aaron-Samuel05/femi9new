import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { CartProvider } from './store/cart'
import { StoreLayout } from './app/StoreLayout'
import { Home } from './pages/Home'
import { ProductDetail } from './pages/ProductDetail'
import { ProductOptions } from './pages/ProductOptions'
import { Blog } from './pages/Blog'
import { BlogPost } from './pages/BlogPost'
import { UserDashboard } from './pages/UserDashboard'
import { Account } from './pages/Account'
import { AdminDashboard } from './pages/AdminDashboard'
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
        <BrowserRouter>
          <SmoothScroll>
            <ScrollManager />
            <Routes>
              <Route element={<StoreLayout />}>
                <Route path="/" element={<Home />} />
                <Route path="/product-options/:id" element={<ProductOptions />} />
                <Route path="/product/:id" element={<ProductDetail />} />
                <Route path="/blog" element={<Blog />} />
                <Route path="/blog/:slug" element={<BlogPost />} />
              </Route>
              <Route path="/dashboard" element={<UserDashboard />} />
              <Route path="/account" element={<Account />} />
              <Route path="/admin" element={<AdminDashboard />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
            <CartDrawer />
            <Toast />
          </SmoothScroll>
        </BrowserRouter>
      </CycleModeProvider>
    </CartProvider>
  )
}
