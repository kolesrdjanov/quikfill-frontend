import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// Plain app/widget fixtures. No transport alias, overlay import or fake Chrome API.
export default defineConfig({
  root: fileURLToPath(new URL('./fixtures', import.meta.url)),
  plugins: [vue()],
  server: {
    host: '127.0.0.1',
    port: 4178,
    strictPort: true,
    fs: { allow: [fileURLToPath(new URL('../../', import.meta.url))] },
  },
})
