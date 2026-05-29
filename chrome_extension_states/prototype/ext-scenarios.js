/* ============================================================================
   QuikFill — Chrome Extension prototype · scenario data
   Each scenario models a real third-party page: the host form on the left and
   everything the side panel needs (detected fields, saved-profile match, AI
   suggestions, fill sources, fill outcomes, scan limitations).
   Field shapes mirror @quikfill/schemas (DetectedField / FillPlanItem /
   FillSource / FillResult / ScanLimitation).
   ============================================================================ */

/* Fill-source presentation map — keyed by FillSource.sourceType. */
const SOURCE_META = {
  recordField:   { label: 'Saved record', short: 'Record',    badge: 'primary', icon: 'database' },
  generatorRule: { label: 'Generator',    short: 'Generator', badge: 'info',    icon: 'dices' },
  aiGenerated:   { label: 'AI draft',     short: 'AI',        badge: 'warning', icon: 'wand-sparkles' },
  staticValue:   { label: 'Static value', short: 'Static',    badge: 'gray',    icon: 'pin' },
  runtimeValue:  { label: 'Ask me',       short: 'Ask me',    badge: 'gray',    icon: 'message-square-text' },
  composed:      { label: 'Composed',     short: 'Composed',  badge: 'primary', icon: 'blocks' },
};

/* The order the per-field "change source" control cycles through. */
const SOURCE_CYCLE = ['recordField', 'generatorRule', 'aiGenerated', 'staticValue', 'runtimeValue'];

const STRATEGY_LABEL = {
  nativeInput: 'native input',
  select: 'select',
  clickToggle: 'click toggle',
  customSelect: 'custom widget',
};

/* Limitation copy keyed by ScanLimitation.kind. */
const LIMITATION_META = {
  closedShadow:     { icon: 'shield-x',  label: 'Closed shadow DOM' },
  crossOriginFrame: { icon: 'square-arrow-out-up-right', label: 'Cross-origin iframe' },
  inaccessible:     { icon: 'ban',       label: 'Inaccessible' },
};

const SCENARIOS = {
  /* ----------------------------------------------------------------------- *
   * A — Fresh job application. No saved profile. Heuristics + saved identity
   *     record cover most; 2 ambiguous fields need AI; 1 AI cover-letter draft
   *     needs confirmation. Ends by saving a new profile.
   * ----------------------------------------------------------------------- */
  globex: {
    id: 'globex',
    fav: 'G',
    hostname: 'careers.globex.io',
    url: 'careers.globex.io/apply?role=design-lead',
    secure: true,
    pageTitle: 'Apply — Senior Product Designer',
    pageSub: 'Globex Corporation · Remote · Full-time',
    pageKind: 'application',
    savedForDomain: 0,
    matchedProfile: null,
    limitations: [],
    fields: [
      { id: 'f1', control: 'input', inputType: 'text', label: 'First name', name: 'first_name', required: true, group: 'About you',
        source: 'recordField', proposed: 'Jane', confidence: 0.97, strategy: 'nativeInput' },
      { id: 'f2', control: 'input', inputType: 'text', label: 'Last name', name: 'last_name', required: true, group: 'About you',
        source: 'recordField', proposed: 'Cooper', confidence: 0.96, strategy: 'nativeInput' },
      { id: 'f3', control: 'input', inputType: 'email', label: 'Email address', name: 'email', required: true, group: 'About you',
        source: 'recordField', proposed: 'jane.cooper@example.com', confidence: 0.99, strategy: 'nativeInput' },
      { id: 'f4', control: 'input', inputType: 'tel', label: 'Phone', name: 'phone', group: 'About you',
        source: 'recordField', proposed: '+1-415-555-0132', confidence: 0.9, strategy: 'nativeInput' },
      { id: 'f5', control: 'input', inputType: 'url', label: 'LinkedIn / portfolio', name: 'portfolio', group: 'About you',
        source: 'recordField', proposed: 'linkedin.com/in/janecooper', confidence: 0.83, strategy: 'nativeInput' },
      { id: 'f6', control: 'select', inputType: 'select-one', label: 'Location', name: 'location', required: true, group: 'Role details',
        options: ['Remote — US', 'San Francisco, CA', 'New York, NY', 'Austin, TX', 'London, UK', 'Berlin, DE'],
        source: 'generatorRule', generator: 'selectOption', proposed: 'Remote — US', confidence: 0.71, strategy: 'select',
        requiresConfirmation: true, warnings: ['Picked the closest option — confirm it matches.'] },
      { id: 'f7', control: 'input', inputType: 'number', label: 'Years of experience', name: 'years_exp', group: 'Role details',
        ambiguous: true, source: 'generatorRule', generator: 'number', proposed: '7', confidence: 0.34, strategy: 'nativeInput',
        ai: { semanticType: 'number · experience', confidence: 0.88,
              reasons: ['Label "Years of experience" maps to a numeric range', 'Nearby text mentions "8+ years preferred"'] },
        aiProposed: '8', aiConfidence: 0.88 },
      { id: 'f8', control: 'select', inputType: 'select-one', label: 'Notice period', name: 'notice', group: 'Role details',
        options: ['Immediately', '2 weeks', '1 month', '2 months', '3 months'],
        ambiguous: true, source: 'generatorRule', generator: 'selectOption', proposed: 'Immediately', confidence: 0.3, strategy: 'select',
        ai: { semanticType: 'enum · availability', confidence: 0.81,
              reasons: ['Options look like notice durations', 'Profile default is "2 weeks"'] },
        aiProposed: '2 weeks', aiConfidence: 0.81 },
      { id: 'f9', control: 'input', inputType: 'text', label: 'Desired salary (USD)', name: 'salary', group: 'Role details',
        source: 'generatorRule', generator: 'currency', proposed: '$145,000', confidence: 0.58, strategy: 'nativeInput' },
      { id: 'f10', control: 'datefield', inputType: 'date', label: 'Earliest start date', name: 'start_date', group: 'Role details',
        source: 'generatorRule', generator: 'date', proposed: '2026-07-15', confidence: 0.69, strategy: 'nativeInput' },
      { id: 'f11', control: 'textarea', inputType: 'textarea', label: 'Why do you want to work here?', name: 'cover_letter', required: true, group: 'Tell us more',
        source: 'aiGenerated', proposed: "I'm drawn to Globex's design culture and the chance to shape a 0→1 product. My background in systems-led product design maps directly to the role's scope…",
        confidence: 0.42, strategy: 'nativeInput', requiresConfirmation: true, warnings: ['AI draft — review and personalise before submitting.'] },
      { id: 'f12', control: 'hidden', inputType: 'hidden', label: 'utm_source', name: 'utm_source', group: 'hidden',
        hidden: true, skip: true, skipReason: 'Hidden tracking field — skipped.' },
    ],
  },

  /* ----------------------------------------------------------------------- *
   * B — Returning user. Saved profile matches by fingerprint, mappings
   *     pre-applied → straight to a confident preview. Shows a password field
   *     held back by policy, a custom-select that needs confirmation, and an
   *     opt-in checkbox excluded by default.
   * ----------------------------------------------------------------------- */
  northwind: {
    id: 'northwind',
    fav: 'N',
    hostname: 'checkout.northwind.shop',
    url: 'checkout.northwind.shop/account/new',
    secure: true,
    pageTitle: 'Create your account',
    pageSub: 'Northwind Market — checkout',
    pageKind: 'signup',
    savedForDomain: 1,
    matchedProfile: { name: 'Northwind — checkout', mappingCount: 7, matchedBy: 'fingerprint', lastFill: '6 days ago' },
    limitations: [],
    fields: [
      { id: 'n1', control: 'input', inputType: 'text', label: 'Full name', name: 'name', required: true, group: 'Your details',
        source: 'recordField', mapped: true, proposed: 'Jane Cooper', confidence: 0.99, strategy: 'nativeInput' },
      { id: 'n2', control: 'input', inputType: 'email', label: 'Email', name: 'email', required: true, group: 'Your details',
        source: 'recordField', mapped: true, proposed: 'jane.cooper@example.com', confidence: 0.99, strategy: 'nativeInput' },
      { id: 'n3', control: 'input', inputType: 'password', label: 'Create password', name: 'password', required: true, group: 'Your details',
        source: 'staticValue', proposed: '••••••••••••', confidence: 0.2, strategy: 'nativeInput', excludeByDefault: true,
        requiresConfirmation: true, warnings: ['Passwords are never auto-filled — set this yourself.'] },
      { id: 'n4', control: 'input', inputType: 'tel', label: 'Phone number', name: 'phone', group: 'Your details',
        source: 'recordField', mapped: true, proposed: '+1-415-555-0132', confidence: 0.95, strategy: 'nativeInput' },
      { id: 'n5', control: 'input', inputType: 'text', label: 'Street address', name: 'address', required: true, group: 'Shipping',
        source: 'recordField', mapped: true, proposed: '482 Maple Ave', confidence: 0.9, strategy: 'nativeInput' },
      { id: 'n6', control: 'input', inputType: 'text', label: 'City', name: 'city', required: true, group: 'Shipping',
        source: 'recordField', mapped: true, proposed: 'Riverton', confidence: 0.9, strategy: 'nativeInput' },
      { id: 'n7', control: 'customselect', inputType: 'select-one', label: 'State', name: 'state', required: true, group: 'Shipping',
        options: ['CA', 'NY', 'TX', 'WA', 'IL', 'MA', 'CO', 'OR'],
        source: 'recordField', mapped: true, proposed: 'CA', confidence: 0.74, strategy: 'customSelect',
        requiresConfirmation: true, warnings: ['Custom dropdown — verify the selection after fill.'] },
      { id: 'n8', control: 'input', inputType: 'text', label: 'ZIP code', name: 'zip', required: true, group: 'Shipping',
        source: 'recordField', mapped: true, proposed: '94107', confidence: 0.92, strategy: 'nativeInput' },
      { id: 'n9', control: 'select', inputType: 'select-one', label: 'Country', name: 'country', required: true, group: 'Shipping',
        options: ['United States', 'Canada', 'United Kingdom', 'Germany', 'Australia'],
        source: 'recordField', mapped: true, proposed: 'United States', confidence: 0.97, strategy: 'select' },
      { id: 'n10', control: 'checkbox', inputType: 'checkbox', label: 'Email me deals & updates', name: 'newsletter', group: 'Shipping',
        source: 'staticValue', proposed: 'unchecked', confidence: 0.5, strategy: 'clickToggle', excludeByDefault: true,
        warnings: ['Opt-in left off by default.'] },
      { id: 'n11', control: 'hidden', inputType: 'hidden', label: 'cart_token', name: 'cart_token', group: 'hidden',
        hidden: true, skip: true, skipReason: 'Hidden session field — skipped.' },
    ],
  },

  /* ----------------------------------------------------------------------- *
   * C — Hard page. Honest about browser limits: a cross-origin payment iframe
   *     and a closed-shadow web component can't be touched; a custom React
   *     combobox and a custom date picker fail on fill; a file input is
   *     skipped. Native fields still succeed → a *partial* result.
   * ----------------------------------------------------------------------- */
  vertex: {
    id: 'vertex',
    fav: 'V',
    hostname: 'app.vertex.io',
    url: 'app.vertex.io/onboarding/profile',
    secure: true,
    pageTitle: 'Set up your workspace',
    pageSub: 'Vertex — step 2 of 4',
    pageKind: 'onboarding',
    savedForDomain: 0,
    matchedProfile: null,
    limitations: [
      { kind: 'crossOriginFrame', detail: 'Payment fields load in a secure iframe from js.stripe.com — QuikFill can\u2019t read or fill cross-origin frames.' },
      { kind: 'closedShadow', detail: 'A <vertex-theme-picker> uses a closed shadow root; the scanner can\u2019t see inside it.' },
    ],
    fields: [
      { id: 'v1', control: 'input', inputType: 'email', label: 'Work email', name: 'work_email', required: true, group: 'Profile',
        source: 'recordField', proposed: 'jane.cooper@example.com', confidence: 0.94, strategy: 'nativeInput', outcome: 'success' },
      { id: 'v2', control: 'input', inputType: 'text', label: 'Company name', name: 'company', required: true, group: 'Profile',
        source: 'generatorRule', generator: 'company', proposed: 'Vertex Systems', confidence: 0.7, strategy: 'nativeInput', outcome: 'success' },
      { id: 'v3', control: 'select', inputType: 'select-one', label: 'Team size', name: 'team_size', group: 'Profile',
        options: ['Just me', '2–10', '11–50', '51–200', '200+'],
        source: 'generatorRule', generator: 'selectOption', proposed: '11–50', confidence: 0.66, strategy: 'select', outcome: 'success' },
      { id: 'v4', control: 'customselect', inputType: 'select-one', label: 'Your role', name: 'role', group: 'Profile',
        options: ['Founder', 'Product Designer', 'Engineer', 'PM', 'Marketing'],
        source: 'generatorRule', generator: 'selectOption', proposed: 'Product Designer', confidence: 0.55, strategy: 'customSelect',
        requiresConfirmation: true, warnings: ['React combobox — fill may not register.'], outcome: 'failed',
        outcomeReason: 'Custom dropdown rejected the value — set it manually.' },
      { id: 'v5', control: 'datepicker', inputType: 'text', label: 'Start date', name: 'start', group: 'Profile',
        source: 'generatorRule', generator: 'date', proposed: '2026-07-01', confidence: 0.5, strategy: 'customSelect',
        requiresConfirmation: true, warnings: ['Custom date widget — verify after fill.'], outcome: 'failed',
        outcomeReason: 'Date picker is a custom widget; native fill was reverted.' },
      { id: 'v6', control: 'textarea', inputType: 'textarea', label: 'Short bio', name: 'bio', group: 'Profile',
        source: 'aiGenerated', proposed: 'Product designer focused on systems, autofill, and tools that get out of the way.',
        confidence: 0.4, strategy: 'nativeInput', requiresConfirmation: true, warnings: ['AI draft — review before submit.'], outcome: 'success' },
      { id: 'v7', control: 'file', inputType: 'file', label: 'Profile photo', name: 'avatar', group: 'Profile',
        skip: true, skipReason: 'File inputs can\u2019t be filled — browser security.' },
      { id: 'v8', control: 'iframe', inputType: 'iframe', label: 'Card number', name: 'card', group: 'Billing',
        skip: true, limitation: 'crossOriginFrame', skipReason: 'Inside a cross-origin Stripe iframe — not fillable.' },
      { id: 'v9', control: 'shadow', inputType: 'custom', label: 'Theme', name: 'theme', group: 'Billing',
        skip: true, limitation: 'closedShadow', skipReason: 'Closed shadow DOM — invisible to the scanner.' },
    ],
  },
};

const SCENARIO_ORDER = ['globex', 'northwind', 'vertex'];
