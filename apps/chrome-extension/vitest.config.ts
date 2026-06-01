import { defineConfig } from 'vitest/config'

// Unit tests for the extension's framework-agnostic surface helpers (display maps,
// confidence/format utilities). jsdom is available for anything DOM-touching. This
// establishes a runnable `pnpm test` for the extension app.
export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['lib/**/*.{test,spec}.ts'],
  },
})
