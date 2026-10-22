import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  root: fileURLToPath(new URL('./fixtures', import.meta.url)),
  plugins: [vue(), tailwindcss()],
  resolve: {
    // Exercise the real overlay and engine; replace only the extension transport.
    alias: {
      '@quikfill/browser-adapter': fileURLToPath(
        new URL('./fixtures/browser-adapter.ts', import.meta.url),
      ),
    },
  },
  server: {
    host: '127.0.0.1',
    port: 4174,
    strictPort: true,
    fs: { allow: [fileURLToPath(new URL('../../', import.meta.url))] },
  },
})
