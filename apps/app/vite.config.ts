import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [vue(), tailwindcss()],
  // Expose `VITE_*` (e.g. VITE_QF_API_BASE_URL) plus the literal `ALLOWED_USERS`
  // var to client code via `import.meta.env`. `ALLOWED_USERS` is a soft sign-in
  // allowlist (see src/lib/allowed-users.ts) — non-secret, so shipping it in the
  // bundle is acceptable.
  envPrefix: ['VITE_', 'ALLOWED_USERS'],
  server: {
    // Pinned to 5173: the backend only allows this origin via CORS. `/api/*` is
    // proxied to the NestJS app (global prefix `/api/v1`), which sidesteps CORS
    // in dev anyway.
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
    // No inline modulepreload polyfill, so the strict `script-src 'self'` CSP
    // (public/_headers) needs no inline-script allowance. Safe for the
    // dashboard's modern-browser (es2022) target.
    modulePreload: { polyfill: false },
  },
})
