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
      // Vendored static design prototypes (hand-authored reference, not maintained source).
      'design/**',
      'design_handoff_chrome_extension/**',
      'chrome_extension_states/**',
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
