<script setup lang="ts">
import { MousePointerClick, WandSparkles, CheckCheck } from 'lucide-vue-next'
</script>

<template>
  <section id="how" class="section how">
    <div class="wrap">
      <div class="section-head center">
        <span class="eyebrow">How it works</span>
        <h2>One button. One click.</h2>
        <p>
          Sign in once with your email — no password, no templates, no field mapping. After that
          QuikFill spots each form, drops a Fill button right by its submit, and on a single click
          its AI detects every field and fills the whole form.
        </p>
      </div>
      <div class="steps">
        <div class="step">
          <span class="num"><MousePointerClick /><span>1</span></span>
          <h3>The button appears</h3>
          <p>
            QuikFill detects the form and adds a Fill button next to its submit. Nothing runs in the
            background — it waits for your click.
          </p>
        </div>
        <div class="step">
          <span class="num"><WandSparkles /><span>2</span></span>
          <h3>One click, full AI fill</h3>
          <p>
            Click once. QuikFill's AI detects and classifies every field — text, selects, dates,
            even inside same-origin iframes and open shadow DOM — and fills the entire form in a
            single pass.
          </p>
        </div>
        <div class="step">
          <span class="num"><CheckCheck /><span>3</span></span>
          <h3>Review &amp; submit</h3>
          <p>
            Your details land, ready to check. QuikFill never submits anything for you — you send
            the form when it looks right.
          </p>
        </div>
      </div>

      <!--
        Replaced 2026-06-01. The old "Four steps" flow below described a manual journey
        (scan, then match & classify, then preview, then fill/verify with undo) that no longer
        matches the product — it is now a one-click in-page AI fill. Kept here for reference;
        the full original markup is in git history.

        H2: Four steps. About a second.
        Intro: Sign in once with your email, no password. After that, QuikFill never touches a
               page until you ask: it reads the page on your device and shows you everything
               before it writes a thing.
        1. Scan — Open QuikFill and scan. It reads every input, label, placeholder and ARIA hint,
           even inside same-origin iframes and open shadow DOM.
        2. Match & classify — Saved profiles match first. Heuristics catch the obvious. Gemini
           classifies anything ambiguous and proposes a source.
        3. Preview — See the proposed value, source and confidence for every field. Nothing is
           written to the page yet; edit or reject anything.
        4. Fill & verify — One click fills natively, dispatches real events, and verifies each
           value landed. Changed your mind? Undo the whole run.
      -->
    </div>
  </section>
</template>
