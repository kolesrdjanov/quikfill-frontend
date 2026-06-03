import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'

// Unit tests for the dashboard's framework-agnostic logic (e.g. the token store,
// helpers, Pinia stores). jsdom provides localStorage/DOM. Component/render tests
// can layer on @vue/test-utils later; this establishes a runnable `pnpm test`.
export default defineConfig({
  resolve: {
    // Mirror vite.config.ts so `@/...` imports resolve in tests.
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.{test,spec}.ts'],
  },
})
