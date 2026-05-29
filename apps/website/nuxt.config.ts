import tailwindcss from '@tailwindcss/vite'

export default defineNuxtConfig({
  compatibilityDate: '2026-01-01',
  telemetry: false,
  devtools: { enabled: true },
  srcDir: '.',
  css: ['~/assets/css/main.css'],
  vite: {
    plugins: [tailwindcss()],
  },
  nitro: {
    prerender: {
      crawlLinks: true,
      routes: ['/'],
    },
  },
  app: {
    head: {
      htmlAttrs: { lang: 'en' },
      title: 'Quikfill',
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      ],
    },
  },
  typescript: {
    strict: true,
    typeCheck: false,
  },
})
