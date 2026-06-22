<script setup lang="ts">
import { Plus } from 'lucide-vue-next'

// Authored fresh (the design handoff's FAQ copy is not used). Answers reflect the
// real product: an in-page Fill button, no per-site setup, a redacted summary to
// Gemini, never auto-submitting, and fill-based pricing.
const faqs = [
  {
    q: "How is this different from my browser's built-in autofill?",
    a: 'Your browser only recognises a handful of standard fields by name — name, email, address. QuikFill reads each field’s label, type, placeholder and surrounding context with AI, so it fills the fields autofill ignores: custom questions, selects, dates, and fields buried in same-origin iframes or open shadow DOM.',
  },
  {
    q: 'Do I have to set up templates or map fields for each site?',
    a: 'No. There are no templates and no per-site configuration. QuikFill reads every form live, so the same one-click flow works on a job application, a checkout, or a CRM you’ve never opened before.',
  },
  {
    q: 'What does QuikFill actually send when I click Fill?',
    a: 'Only a redacted summary of the form’s structure — field labels, input types, names, placeholders and validation hints. Never your saved values, and never the page’s raw HTML. Everything else stays on your device.',
  },
  {
    q: 'Will it submit the form for me?',
    a: 'Never. QuikFill only fills the fields, writing real input events so the page registers every value. You review the result and press the site’s own submit yourself — and you can undo an entire fill in one click.',
  },
  {
    q: 'Which fields and sites can it fill?',
    a: 'Native inputs, textareas and selects on any site, including those inside same-origin iframes and open shadow DOM. Non-native custom widgets are skipped rather than risk filling them incorrectly.',
  },
  {
    q: 'How does pricing work?',
    a: 'Filling from your own saved data and generators is always free and unlimited. You only spend your monthly quota when AI fills a form — counted in form fills, not tokens. Hit the limit and QuikFill keeps filling from saved data; only AI pauses until your next cycle.',
  },
]

const openIndex = ref<number | null>(null)
const toggle = (i: number) => (openIndex.value = openIndex.value === i ? null : i)
</script>

<template>
  <section id="faq" class="section faq">
    <div class="wrap">
      <div class="section-head center reveal">
        <span class="sidx">05 / FAQ</span>
        <span class="eyebrow">FAQ</span>
        <h2>Questions, answered.</h2>
      </div>
      <div class="faq-grid">
        <div
          v-for="(item, i) in faqs"
          :key="i"
          class="faq-item reveal"
          :class="{ open: openIndex === i }"
        >
          <button
            class="faq-q"
            type="button"
            :aria-expanded="openIndex === i"
            :aria-controls="`faq-a-${i}`"
            @click="toggle(i)"
          >
            {{ item.q }}
            <span class="ic"><Plus /></span>
          </button>
          <div :id="`faq-a-${i}`" class="faq-a" role="region">
            <div class="faq-a-wrap">
              <div class="faq-a-inner">{{ item.a }}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
