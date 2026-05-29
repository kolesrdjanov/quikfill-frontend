import base from './packages/config/eslint.base.js'
import wxtAutoImports from './apps/chrome-extension/.wxt/eslint-auto-imports.mjs'

export default [
  ...base,
  {
    files: ['apps/chrome-extension/**/*.{vue,ts}'],
    ...wxtAutoImports,
  },
  {
    files: ['apps/website/**/*.{vue,ts,js}'],
    rules: {
      'no-undef': 'off',
    },
  },
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/.nuxt/**',
      '**/.output/**',
      '**/.wxt/**',
      '**/.wxt-modules/**',
      '**/.data/**',
      '**/playwright-report/**',
      '**/test-results/**',
    ],
  },
]
