<script setup lang="ts">
useHead({
  title: 'Privacy Policy — QuikFill',
  meta: [{ name: 'description', content: 'How QuikFill handles your data.' }],
})
</script>

<template>
  <div>
    <SiteNav />
    <main id="top" class="legal">
      <div class="wrap">
        <h1>Privacy Policy</h1>
        <p class="updated mono">Effective date: June 1, 2026</p>

        <p class="lead">
          QuikFill (“QuikFill”, “we”, “us”) is a browser extension and web dashboard that scans web
          forms and fills them with information you choose to save. This policy explains what we
          process and the choices you have.
        </p>

        <h2>1. Who we are</h2>
        <p>
          QuikFill is operated by QuikFill, based in Serbia. For any privacy question, contact us at
          <a href="mailto:hello@quikfill.io">hello@quikfill.io</a>.
        </p>

        <h2>2. Information we process</h2>
        <ul>
          <li>
            <strong>Account data</strong> — your email address, used for passwordless sign-in
            (one-time codes) and account management.
          </li>
          <li>
            <strong>Information you save (“profiles”)</strong> — the data you add to QuikFill (such
            as names, email addresses, phone numbers, postal addresses, and other fields) so it can
            fill forms. It is stored in your browser and synced to your private QuikFill account on
            our servers so it works across your devices and our extension and dashboard.
          </li>
          <li>
            <strong>Mappings &amp; configuration</strong> — the form profiles, field mappings,
            domains, and generator presets you create.
          </li>
          <li>
            <strong>Fill history</strong> — a redacted record of fill runs (field labels and the
            outcome only, <strong>not your actual values</strong>).
          </li>
          <li>
            <strong>AI assistance data</strong> — when you ask QuikFill for AI help interpreting a
            form, we send a redacted summary of the form (field labels, types, and limited context)
            to our backend, which forwards it to our AI provider. We <strong>never</strong> send
            your actual saved values or the full page content. AI returns suggestions for you to
            review; it never fills the page automatically.
          </li>
          <li>
            <strong>Subscription &amp; billing</strong> — if you buy a plan, our payment processor
            handles payment; we receive your subscription status and identifiers, not your full card
            details.
          </li>
          <li>
            <strong>Technical logs</strong> — minimal data needed to run and secure the service.
          </li>
        </ul>

        <h2>3. What we don’t do</h2>
        <p>
          The extension runs only when you open it and choose to scan — it does not track your
          browsing or read pages in the background. We never send your actual saved values or full
          page content to AI models. We do not sell your personal data or use it for advertising.
        </p>

        <h2>4. How we use your information</h2>
        <p>
          To provide and sync autofill, generate AI suggestions you review, authenticate you,
          process subscriptions, provide support, keep the service secure, and comply with the law.
        </p>

        <h2>5. Service providers</h2>
        <p>We share data only with providers that help us run QuikFill:</p>
        <ul>
          <li><strong>Resend</strong> — sending sign-in and account emails.</li>
          <li><strong>Stripe</strong> — payment processing for subscriptions.</li>
          <li>
            <strong>Google (Gemini API)</strong> — AI form interpretation (redacted summaries only).
          </li>
          <li><strong>Railway</strong> — application hosting and database.</li>
        </ul>
        <p>We may also disclose data where required by law.</p>

        <h2>6. Data retention</h2>
        <p>
          We keep your data while your account is active. You can delete records, profiles, and
          history from within the app; deleting your account removes your associated data within 30
          days, except where we are required to retain it by law.
        </p>

        <h2>7. Security</h2>
        <p>
          Data is encrypted in transit using HTTPS, and access to our systems is restricted. No
          method of transmission or storage is perfectly secure, but we work to protect your
          information.
        </p>

        <h2>8. Your rights</h2>
        <p>
          Depending on where you live (for example, under the GDPR in the EEA), you may have the
          right to access, correct, export, or delete your data, and to object to certain
          processing. To exercise these rights, contact
          <a href="mailto:hello@quikfill.io">hello@quikfill.io</a>.
        </p>

        <h2>9. International transfers</h2>
        <p>
          Our service providers may process data outside your country. Where they do, we rely on
          appropriate safeguards for the transfer.
        </p>

        <h2>10. Children</h2>
        <p>
          QuikFill is not directed to children under 16 and we do not knowingly collect their data.
        </p>

        <h2>11. Changes to this policy</h2>
        <p>
          We may update this policy from time to time. We will post any changes on this page and
          update the effective date above.
        </p>

        <h2>12. Contact</h2>
        <p>
          Questions about this policy or your data? Email
          <a href="mailto:hello@quikfill.io">hello@quikfill.io</a>.
        </p>
      </div>
    </main>
    <SiteFooter />
  </div>
</template>

<style scoped>
.legal {
  padding: 140px 0 96px;
}
.legal .wrap {
  max-width: 800px;
}
.legal h1 {
  font-size: 2.4rem;
}
.legal .updated {
  color: var(--muted);
  font-size: 0.85rem;
  margin: 10px 0 32px;
}
.legal .lead {
  color: var(--fg);
  font-size: 1.08rem;
  margin-bottom: 8px;
}
.legal h2 {
  font-size: 1.2rem;
  margin: 40px 0 12px;
}
.legal p {
  color: var(--fg-2);
  margin: 0 0 14px;
}
.legal ul {
  margin: 0 0 14px;
  padding-left: 22px;
  color: var(--fg-2);
}
.legal li {
  margin: 0 0 10px;
}
.legal strong {
  color: var(--fg);
  font-weight: 600;
}
.legal a {
  color: var(--blue-bright);
}
.legal a:hover {
  text-decoration: underline;
}
</style>
