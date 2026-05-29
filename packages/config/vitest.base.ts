import { defineConfig } from 'vitest/config'

export const baseTestConfig = defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/*.{test,spec}.ts'],
  },
})

export default baseTestConfig
