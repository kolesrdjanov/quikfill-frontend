import tailwindcss from '@tailwindcss/vite'

const description =
  'QuikFill scans any form on any site, classifies every field with AI, and fills it from your saved profiles — preview, fill, verify, undo. Built for people who live in forms.'

export default defineNuxtConfig({
  compatibilityDate: '2026-01-01',
  telemetry: false,
  devtools: { enabled: true },
  srcDir: '.',
  runtimeConfig: {
    public: {
      // Dashboard origin the pricing CTAs deep-link into. Inlined at build time
      // for the static prerender — set NUXT_PUBLIC_APP_URL in CI/prod.
      appUrl: 'http://localhost:5173',
    },
  },
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
      htmlAttrs: { lang: 'en', 'data-theme': 'dark', 'data-hero': 'a' },
      title: 'QuikFill — Fill any form in one click',
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'description', content: description },
        { property: 'og:title', content: 'QuikFill — Fill any form in one click' },
        { property: 'og:description', content: description },
        { property: 'og:type', content: 'website' },
        { property: 'og:image', content: '/quikfill-og.png' },
        { name: 'twitter:card', content: 'summary_large_image' },
        { name: 'theme-color', content: '#070a14' },
      ],
      link: [
        { rel: 'icon', type: 'image/svg+xml', href: '/quikfill-icon.svg' },
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
        {
          rel: 'stylesheet',
          href: 'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:ital,wght@0,400;0,500;0,600;0,700;0,800;1,400;1,500&family=JetBrains+Mono:wght@400;500;600&display=swap',
        },
      ],
      script: [
        {
          // Apply the saved theme before first paint to avoid a flash.
          innerHTML:
            "try{var t=localStorage.getItem('qf-theme');if(t)document.documentElement.setAttribute('data-theme',t);}catch(e){}",
          tagPosition: 'head',
        },
      ],
    },
  },
  typescript: {
    strict: true,
    typeCheck: false,
  },
})
