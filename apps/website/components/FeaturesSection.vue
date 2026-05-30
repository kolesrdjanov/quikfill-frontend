<script setup lang="ts">
import {
  ScanLine,
  Sparkles,
  Bookmark,
  Eye,
  Dices,
  Database,
  Type,
  Mail,
  ChevronDown,
  CheckSquare,
  Calendar,
  Layers,
  SquareDashed,
} from 'lucide-vue-next'
</script>

<template>
  <section id="features" class="section">
    <div class="wrap">
      <div class="section-head">
        <span class="eyebrow">Features</span>
        <h2>Less a form-filler.<br />More a form brain.</h2>
        <p>
          Three things make QuikFill different from the autofill already built into your browser.
        </p>
      </div>
      <div class="feat-grid">
        <div class="fcard lg">
          <span class="ico"><ScanLine /></span>
          <h3>Scan any form on any site</h3>
          <p>
            No templates, no per-site config. QuikFill detects inputs, selects, checkboxes, radios,
            contenteditable and common custom controls — even inside same-origin iframes and open
            shadow DOM.
          </p>
          <div class="fc-visual">
            <div class="chip-row">
              <span class="dchip"><Type /> text</span>
              <span class="dchip"><Mail /> email</span>
              <span class="dchip"><ChevronDown /> select</span>
              <span class="dchip"><CheckSquare /> checkbox</span>
              <span class="dchip"><Calendar /> date</span>
              <span class="dchip"><Layers /> shadow DOM</span>
              <span class="dchip"><SquareDashed /> iframe</span>
            </div>
          </div>
        </div>

        <div class="fcard sm">
          <span class="ico"><Sparkles /></span>
          <h3>AI field classification</h3>
          <p>
            When labels are missing or weird, Gemini reads the field's context and proposes what it
            is and where to fill from — always reviewable, never trusted blindly.
          </p>
        </div>

        <div class="fcard sm">
          <span class="ico"><Bookmark /></span>
          <h3>Saved form profiles</h3>
          <p>
            Save a form once. QuikFill recognises the page again by URL pattern and field
            fingerprint — not brittle exact-URL matching — and reuses your mappings instantly.
          </p>
        </div>

        <div class="fcard sm">
          <span class="ico"><Eye /></span>
          <h3>Preview, verify &amp; undo</h3>
          <p>
            Every fill is previewed first, verified after, and reversible in one click. You're
            always in control of what lands on the page.
          </p>
        </div>

        <div class="fcard sm">
          <span class="ico"><Dices /></span>
          <h3>Smart generators</h3>
          <p>
            Fake-but-valid people, emails, phones, addresses and more — locale-aware and seedable.
            Perfect for QA and test fixtures.
          </p>
        </div>

        <div class="fcard sm">
          <span class="ico"><Database /></span>
          <h3>Reusable records</h3>
          <p>
            Keep People, Companies, Addresses and custom entities once, then map any field to them
            across every form you fill.
          </p>
        </div>
      </div>
    </div>
  </section>
</template>
