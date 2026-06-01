import { defineConfig } from 'vitest/config'

// Unit tests for the dashboard's framework-agnostic logic (e.g. the token store,
// helpers). jsdom provides localStorage/DOM. Component/render tests can layer on
// @vue/test-utils later; this establishes a runnable `pnpm test` for the app.
export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['src/**/*.{test,spec}.ts'],
  },
})
