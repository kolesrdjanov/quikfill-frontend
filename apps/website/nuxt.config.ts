import tailwindcss from '@tailwindcss/vite'

const title = 'QuikFill — Fill any form in one click'
const description =
  'QuikFill drops a button next to every form on every site. Hover, click Fill, and AI fills every field in a second — no panel, no per-site setup. Your data never leaves your device.'

// Production canonical origin. og:image / og:url MUST be absolute — Slack,
// WhatsApp, Facebook and LinkedIn do not resolve relative social-card URLs.
const siteUrl = 'https://quikfill.io'
const ogImage = `${siteUrl}/quikfill-og.png`

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
      // Chrome Web Store listing the "Add to Chrome" CTAs point to. Placeholder
      // (google.com) until the extension is published — swap here or via
      // NUXT_PUBLIC_CHROME_STORE_URL once the real listing URL exists.
      chromeStoreUrl: 'https://google.com',
    },
  },
  css: ['~/assets/css/main.css'],
  vite: {
    plugins: [tailwindcss()],
  },
  nitro: {
    prerender: {
      crawlLinks: true,
      routes: ['/', '/privacy'],
    },
  },
  app: {
    head: {
      htmlAttrs: { lang: 'en', 'data-theme': 'dark' },
      title,
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'description', content: description },
        // Open Graph (Slack, WhatsApp, Facebook, LinkedIn). URLs are absolute.
        { property: 'og:title', content: title },
        { property: 'og:description', content: description },
        { property: 'og:type', content: 'website' },
        { property: 'og:url', content: siteUrl },
        { property: 'og:site_name', content: 'QuikFill' },
        { property: 'og:image', content: ogImage },
        { property: 'og:image:type', content: 'image/png' },
        { property: 'og:image:width', content: '1200' },
        { property: 'og:image:height', content: '630' },
        { property: 'og:image:alt', content: 'QuikFill — fill any form in one click' },
        // Twitter / X
        { name: 'twitter:card', content: 'summary_large_image' },
        { name: 'twitter:title', content: title },
        { name: 'twitter:description', content: description },
        { name: 'twitter:image', content: ogImage },
        { name: 'theme-color', content: '#07090e' },
      ],
      link: [
        { rel: 'canonical', href: siteUrl },
        { rel: 'icon', type: 'image/svg+xml', href: '/quikfill-icon.svg' },
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
        {
          rel: 'stylesheet',
          href: 'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:ital,wght@0,400;0,500;0,600;0,700;0,800;1,400;1,500&family=JetBrains+Mono:wght@400;500;600;700&display=swap',
        },
      ],
      script: [
        {
          // Before first paint: apply the saved theme (no flash) and flag `js` so
          // scroll-reveal elements start hidden only when JS can reveal them.
          innerHTML:
            "try{var d=document.documentElement;d.classList.add('js');var t=localStorage.getItem('qf-theme');if(t)d.setAttribute('data-theme',t);}catch(e){}",
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
