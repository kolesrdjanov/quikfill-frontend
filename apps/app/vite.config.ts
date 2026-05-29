import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [vue(), tailwindcss()],
  server: {
    // Pinned to 5173: the backend's APP_URL builds magic-link `devLink`s at this
    // origin and only allows it via CORS. `/api/*` is proxied to the NestJS app
    // (global prefix `/api/v1`), which sidesteps CORS in dev.
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://localhost:4010',
        changeOrigin: true,
      },
    },
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    target: 'es2022',
  },
})
