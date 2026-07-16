import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/  — base '/' so assets resolve from root on nested
// client-routed paths (e.g. /product/:id) under BrowserRouter.
export default defineConfig({
  base: '/',
  plugins: [react()],
  // No manualChunks. There used to be a `three` chunk here pinning
  // three/R3F/drei together, but naming a chunk that way puts it in the entry's
  // graph, and Vite then emits <link rel="modulepreload"> for it — so the 968KB
  // 3D bundle was downloaded eagerly on every page load even though its only
  // consumer (LiquidBackground) is imported lazily.
  //
  // Letting Rollup split at the dynamic-import boundary instead means three
  // lands in LiquidBackground's own chunk and is fetched only when that
  // component actually mounts (on idle, after first paint).
})
