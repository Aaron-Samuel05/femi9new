import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/  — base '/' so assets resolve from root on nested
// client-routed paths (e.g. /product/:id) under BrowserRouter.
export default defineConfig({
  base: '/',
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        // Keep the heavy immersive 3D stack (three + R3F + drei) in its own
        // long-cached chunk so it doesn't bloat the main app bundle.
        manualChunks: {
          three: ['three', '@react-three/fiber', '@react-three/drei'],
        },
      },
    },
  },
})
