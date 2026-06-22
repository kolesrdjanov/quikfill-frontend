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
        <p class="updated mono">Effective date: June 22, 2026</p>

        <p class="lead">
          QuikFill (“QuikFill”, “we”, “us”, “our”) provides a browser extension, web dashboard, and
          website that detect fields on web forms and help you fill them. This Privacy Policy
          explains what personal data we process, why we process it, and the choices and rights you
          have. It applies to our extension, dashboard, and website (together, the “Service”).
        </p>

        <h2>1. Who we are</h2>
        <p>
          QuikFill operates the QuikFill extension, dashboard, and website, and is the data
          controller for the personal data described in this policy. For any privacy question, or to
          exercise your rights, contact us at
          <a href="mailto:hello@quikfill.io">hello@quikfill.io</a>.
        </p>

        <h2>2. Privacy at a glance</h2>
        <ul>
          <li>
            The extension acts <strong>only when you choose to fill a form</strong>. It does not
            track your browsing or read pages in the background.
          </li>
          <li>
            We <strong>never</strong> send the values you type, your saved values, or full page
            content to AI models — only redacted field descriptions (labels, types, and options).
          </li>
          <li>
            We use <strong>no advertising or analytics cookies</strong>, run no third-party
            trackers, and do no cross-site tracking.
          </li>
          <li>
            We <strong>never sell or “share”</strong> your personal data, as those terms are defined
            under U.S. state privacy laws.
          </li>
          <li>
            You can <strong>export or delete your data at any time</strong> — from your account
            settings, or by emailing us.
          </li>
        </ul>

        <h2>3. Information we process</h2>
        <ul>
          <li>
            <strong>Account data</strong> — your email address (required, for passwordless
            one-time-code sign-in) and, optionally, your first and last name. We do not store
            passwords.
          </li>
          <li>
            <strong>Saved profile data</strong> — information you choose to save for autofill (such
            as names, email addresses, phone numbers, and postal addresses), stored in your private
            QuikFill account so it works across your devices.
          </li>
          <li>
            <strong>Configuration</strong> — your extension settings, field mappings, domain
            preferences, and generator presets.
          </li>
          <li>
            <strong>Fill history</strong> — a redacted record of fill runs containing only field
            labels and outcomes (for example “filled” or “skipped”),
            <strong>never the values that were filled</strong>.
          </li>
          <li>
            <strong>AI assistance data</strong> — when you use AI to interpret a form, we send a
            redacted summary of the form (field labels, input types, options, and limited
            surrounding context) plus your locale preference to our backend, which forwards it to
            our AI provider. We <strong>never</strong> send your saved values or page content. We
            keep a redacted record of the request (the summary, timing, and token counts) for
            security and abuse prevention.
          </li>
          <li>
            <strong>Subscription &amp; billing data</strong> — if you buy a plan, our payment
            processor handles your payment details. We store your subscription status, plan, billing
            period, usage counters, and processor identifiers — not your full card number.
          </li>
          <li>
            <strong>Account security &amp; technical data</strong> — sign-in sessions (including the
            browser/device user-agent and timestamps), one-time codes (stored only as hashes), and
            minimal logs needed to operate and secure the Service.
          </li>
        </ul>

        <h2>4. How we use your information, and our legal bases</h2>
        <p>We process your data to:</p>
        <ul>
          <li>
            provide and synchronize autofill across your devices — to perform our contract with you;
          </li>
          <li>
            generate AI suggestions you review — to perform our contract and, where applicable, with
            your consent;
          </li>
          <li>
            authenticate you and keep your account secure — our contract and our legitimate interest
            in security;
          </li>
          <li>
            process subscriptions and prevent quota abuse — our contract and legitimate interest;
          </li>
          <li>provide support and send service notices — our contract and legitimate interest;</li>
          <li>comply with legal obligations — to meet a legal obligation.</li>
        </ul>
        <p>
          The legal bases above are those under the GDPR. Where we rely on consent, you may withdraw
          it at any time.
        </p>

        <h2>5. AI processing</h2>
        <p>
          QuikFill’s AI features are <strong>review-first</strong>: AI proposes values that you
          review before anything is submitted, and AI never submits a form for you. To generate
          suggestions, we send only a redacted, structured summary of the form to Google’s Gemini
          API — field labels, input types, options, and limited context, capped in size and stripped
          of page markup by an automated privacy guard. We do not send the values you enter, your
          saved profile values, or full page content. Google processes this redacted data as our
          service provider, under its API terms, solely to return suggestions to us.
        </p>

        <h2>6. Cookies, tracking &amp; local storage</h2>
        <p>
          The QuikFill website and product do not use advertising or analytics cookies, and we do
          not embed third-party trackers or perform cross-site tracking. We use only essential local
          storage: the extension stores your sign-in tokens and settings in your browser’s extension
          storage so you stay signed in, and the dashboard keeps the technical state needed to
          operate the app. Because we use no non-essential cookies, no cookie-consent banner is
          required.
        </p>

        <h2>7. Service providers (subprocessors)</h2>
        <p>
          We share personal data only with the providers that help us operate QuikFill, under
          contracts that require them to protect it:
        </p>
        <ul>
          <li>
            <strong>Google (Gemini API)</strong> — AI form interpretation; receives redacted form
            summaries only.
          </li>
          <li>
            <strong>Stripe</strong> — payment and subscription processing; receives your billing
            details and email.
          </li>
          <li>
            <strong>Resend</strong> — transactional email (sign-in codes and account emails);
            receives your email address and name.
          </li>
          <li>
            <strong>Railway</strong> — application hosting and database; stores the account data
            described above.
          </li>
        </ul>
        <p>
          We may also disclose data where required by law, or to protect our rights, our users, or
          the public.
        </p>

        <h2>8. International data transfers</h2>
        <p>
          We and our service providers may process your data in countries other than your own. Where
          we transfer personal data internationally, we rely on appropriate safeguards, such as the
          European Commission’s Standard Contractual Clauses or an equivalent mechanism.
        </p>

        <h2>9. Data retention</h2>
        <p>
          We keep your data for as long as your account is active. You can delete saved profiles and
          history within the app at any time. When you delete your account, we delete your
          associated personal data within 30 days, except where we must retain limited records to
          comply with legal, tax, or security obligations. Redacted, non-identifying logs may be
          retained longer.
        </p>

        <h2>10. Security</h2>
        <p>
          We protect your data with encryption in transit (HTTPS), hashed credentials and tokens,
          and restricted access to our systems. No method of transmission or storage is perfectly
          secure, but we work continuously to safeguard your information, and we will notify you and
          the relevant authorities of a breach where the law requires it.
        </p>

        <h2>11. Your privacy rights</h2>
        <p>
          Depending on where you live, you have rights over your personal data. We honor these
          rights for all users, wherever you are.
        </p>
        <p>
          <strong>If you are in the EEA, the UK, or a similar jurisdiction (GDPR / UK GDPR)</strong
          >, you may: access a copy of your data; correct inaccurate data; delete your data;
          restrict or object to certain processing; port your data to another service; and withdraw
          consent at any time. You also have the right to lodge a complaint with your local data
          protection authority.
        </p>
        <p>
          <strong>If you are a California resident (CCPA / CPRA)</strong>, you may: know what
          personal information we collect and how we use it; access and delete it; correct it; and
          opt out of the “sale” or “sharing” of personal information. We do not sell or share your
          personal information, and we do not use sensitive personal information for purposes that
          require an opt-out. We will not discriminate against you for exercising your rights.
        </p>
        <p>
          <strong>How to exercise your rights:</strong> use the <strong>Export my data</strong> and
          <strong>Delete account</strong> controls in your account settings, or email
          <a href="mailto:hello@quikfill.io">hello@quikfill.io</a>. We verify requests against your
          account email and respond within the time the law requires (generally 30 days under the
          GDPR, 45 days under the CCPA). You may use an authorized agent where the law allows.
        </p>

        <h2>12. Children</h2>
        <p>
          QuikFill is not directed to children under 16, and we do not knowingly collect personal
          data from them. If you believe a child has provided us data, contact
          <a href="mailto:hello@quikfill.io">hello@quikfill.io</a> and we will delete it.
        </p>

        <h2>13. Changes to this policy</h2>
        <p>
          We may update this Privacy Policy from time to time. We will post the updated version on
          this page and revise the effective date above; we will communicate significant changes
          where appropriate.
        </p>

        <h2>14. Contact us</h2>
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
