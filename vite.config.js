import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    // /api/* are Cloudflare Pages Functions (image upload → R2 etc.) and only
    // exist on the deployed site; forward them there so uploads work in dev.
    proxy: {
      '/api': { target: 'https://possiwaracafe.pages.dev', changeOrigin: true, secure: true },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom'],
          'vendor-firebase': ['firebase/app', 'firebase/auth', 'firebase/firestore'],
          'vendor-ui': ['framer-motion', 'lucide-react'],
          'vendor-charts': ['recharts'],
        }
      }
    }
  }
})
