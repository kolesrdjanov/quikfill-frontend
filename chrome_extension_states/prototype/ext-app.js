/* ============================================================================
   QuikFill — Chrome Extension prototype · interactive engine
   A small state machine that drives the whole flow the CHROME_EXTENSION_PLAN
   describes: open panel → scan → match profile → heuristics → (AI) → preview →
   fill → verify → undo → save. Plus the toolbar popup and the options page.
   ============================================================================ */
(function () {
  'use strict';

  /* ---------------- tiny seeded RNG + value generators ------------------- */
  function rngFrom(str) {
    let h = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i++) { h = Math.imul(h ^ str.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
    return function () { h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
  }
  const FIRST = ['Ada', 'Bram', 'Carmen', 'Diego', 'Elena', 'Hiro', 'Ines', 'Kira', 'Liam', 'Noor', 'Omar', 'Priya'];
  const LAST = ['Alvarez', 'Becker', 'Cohen', 'Devi', 'Eriksson', 'Gupta', 'Jensen', 'Khan', 'Lopez', 'Nakamura', 'Owens', 'Park'];
  const STREETS = ['Maple', 'Oak', 'Cedar', 'Pine', 'Elm', 'Birch', 'Willow', 'Aspen', 'Walnut'];
  const SUFFIX = ['St', 'Ave', 'Blvd', 'Rd', 'Ln', 'Way'];
  const COMPANY_P = ['North', 'Blue', 'Bright', 'Cedar', 'Vertex', 'Apex', 'Lumen', 'Nova'];
  const COMPANY_S = ['Labs', 'Systems', 'Group', 'Works', 'Industries'];
  function genValue(field, seed) {
    const r = rngFrom(seed + ':' + field.id);
    const pick = (a) => a[Math.floor(r() * a.length)];
    switch (field.generator) {
      case 'company': return pick(COMPANY_P) + ' ' + pick(COMPANY_S);
      case 'currency': return '$' + (90 + Math.floor(r() * 120)) + ',000';
      case 'number': return String(3 + Math.floor(r() * 12));
      case 'date': { const d = new Date(2026, Math.floor(r() * 6) + 4, Math.floor(r() * 27) + 1); return d.toISOString().slice(0, 10); }
      case 'selectOption': return field.options ? pick(field.options) : field.proposed;
      case 'notes': return field.proposed;
      default: return field.proposed;
    }
  }

  /* --------------------------- state ------------------------------------- */
  const PREF_DEFAULTS = { defaultSource: 'hybrid', ai: true, autoMatch: true, hideValues: false, locale: 'en-US', appearance: 'auto' };
  let prefs = loadPrefs();
  const state = {
    scenarioId: 'globex',
    panelOpen: true,
    phase: 'prescan',        // prescan | scanning | detected | preview | filling | results
    popupOpen: false,
    optionsOpen: false,
    aiPhase: 'idle',         // idle | loading | ready | unavailable
    aiOpen: false,
    hideValues: prefs.hideValues,
    seed: 'seed-1',
    saved: false,
    fieldState: {},          // id -> { excluded, source, aiAccepted, aiRejected }
    filledIds: new Set(),
    limitsOpen: false,
  };

  function loadPrefs() {
    try { return Object.assign({}, PREF_DEFAULTS, JSON.parse(localStorage.getItem('qf-prefs') || '{}')); }
    catch (e) { return Object.assign({}, PREF_DEFAULTS); }
  }
  function savePrefs() { localStorage.setItem('qf-prefs', JSON.stringify(prefs)); }

  const scn = () => SCENARIOS[state.scenarioId];
  function fs(id) { return state.fieldState[id] || (state.fieldState[id] = {}); }

  /* fields shown in scan/plan: everything not a hidden tracking field */
  function visibleFields() { return scn().fields.filter((f) => !f.hidden); }
  function planFields() { return scn().fields.filter((f) => !f.hidden && !f.skip); }
  function skippedFields() { return scn().fields.filter((f) => f.skip); }

  /* effective source/value/confidence for a field given runtime state */
  function effective(f) {
    const st = fs(f.id);
    let source = st.source || f.source;
    let value = f.proposed;
    let confidence = f.confidence;
    let aiBadge = false;
    if (f.ambiguous && st.aiAccepted) { source = 'aiGenerated'; value = f.aiProposed; confidence = f.aiConfidence; aiBadge = true; }
    else if (st.source) {
      if (st.source === 'generatorRule') { value = genValue(f, state.seed); confidence = 0.62; }
      else if (st.source === 'aiGenerated') { value = f.aiProposed || f.proposed; confidence = 0.45; }
      else if (st.source === 'staticValue') { value = f.proposed; confidence = 0.5; }
      else if (st.source === 'runtimeValue') { value = 'Ask on fill'; confidence = 1; }
      else if (st.source === 'recordField') { value = f.proposed; confidence = Math.max(f.confidence, 0.9); }
    } else if (source === 'generatorRule' && state.seed !== 'seed-1') {
      value = genValue(f, state.seed);
    }
    return { source, value, confidence, aiBadge };
  }

  function isExcluded(f) {
    const st = fs(f.id);
    if (st.excluded !== undefined) return st.excluded;
    return !!f.excludeByDefault;
  }
  function includedFields() { return planFields().filter((f) => !isExcluded(f)); }

  function ambiguousFields() { return planFields().filter((f) => f.ambiguous && !fs(f.id).aiAccepted && !fs(f.id).aiRejected); }
  function hasAmbiguous() { return ambiguousFields().length > 0; }

  /* a field's fill outcome when included */
  function outcomeOf(f) {
    if (f.skip) return { status: 'skipped', reason: f.skipReason };
    if (isExcluded(f)) return null;
    if (f.outcome === 'failed') return { status: 'failed', reason: f.outcomeReason };
    return { status: 'success' };
  }

  /* ----------------------------- helpers --------------------------------- */
  const el = (id) => document.getElementById(id);
  function icons() { if (window.lucide) lucide.createIcons(); }
  function pct(c) { return Math.round(c * 100) + '%'; }
  function meterClass(c) { return c >= 0.85 ? 'qf-meter--success' : c < 0.6 ? 'qf-meter--warning' : ''; }
  function mask(v) { return state.hideValues ? '••••••••' : v; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

  /* =======================================================================
     RENDER — browser chrome
     ======================================================================= */
  function renderChrome() {
    const s = scn();
    el('scenarioChips').innerHTML = SCENARIO_ORDER.map((id) => {
      const sc = SCENARIOS[id];
      const on = id === state.scenarioId;
      return `<button class="scn-chip${on ? ' on' : ''}" data-action="set-scenario" data-id="${id}">
        <span class="scn-fav">${sc.fav}</span><span class="scn-host">${sc.hostname}</span></button>`;
    }).join('');
    el('tabFav').textContent = s.fav;
    el('tabTitle').textContent = s.pageTitle;
    el('urlText').innerHTML = `<i data-lucide="${s.secure ? 'lock' : 'lock-open'}"></i>${esc(s.url)}`;
    el('toolbarBtn').classList.toggle('active', state.panelOpen);
    el('toolbarDot').style.display = state.phase === 'results' ? 'block' : (state.phase === 'prescan' ? 'none' : 'block');
  }

  /* =======================================================================
     RENDER — host page form (the third-party site)
     ======================================================================= */
  function controlHtml(f) {
    const filled = state.filledIds.has(f.id);
    const eff = effective(f);
    const val = filled ? eff.value : '';
    const cls = 'hf-control' + (filled ? ' filled' : '');
    switch (f.control) {
      case 'textarea':
        return `<div class="${cls}" data-field="${f.id}"><div class="hf-ta">${filled ? esc(val) : '<span class="hf-ph">' + esc(f.placeholder || '') + '</span>'}</div></div>`;
      case 'select':
        return `<div class="${cls} hf-select" data-field="${f.id}"><span>${filled ? esc(val) : 'Select…'}</span><i data-lucide="chevron-down"></i></div>`;
      case 'customselect':
        return `<div class="${cls} hf-select hf-custom" data-field="${f.id}"><span>${filled ? esc(val) : 'Choose…'}</span><i data-lucide="chevrons-up-down"></i></div>`;
      case 'datefield':
        return `<div class="${cls} hf-select" data-field="${f.id}"><span>${filled ? esc(val) : 'mm/dd/yyyy'}</span><i data-lucide="calendar"></i></div>`;
      case 'datepicker':
        return `<div class="${cls} hf-select hf-custom" data-field="${f.id}"><span>${filled ? esc(val) : 'Pick a date'}</span><i data-lucide="calendar-days"></i></div>`;
      case 'checkbox':
        return `<label class="hf-check" data-field="${f.id}"><span class="hf-box${filled && val !== 'unchecked' ? ' on' : ''}"></span>${esc(f.label)}</label>`;
      case 'file':
        return `<div class="hf-file" data-field="${f.id}"><i data-lucide="upload"></i> Upload a file</div>`;
      case 'iframe':
        return `<div class="hf-iframe" data-field="${f.id}"><i data-lucide="square-arrow-out-up-right"></i><span>Secure field · js.stripe.com</span></div>`;
      case 'shadow':
        return `<div class="hf-shadow" data-field="${f.id}"><i data-lucide="shield-x"></i><span>&lt;vertex-theme-picker&gt;</span></div>`;
      default:
        return `<div class="${cls}" data-field="${f.id}">${filled ? esc(val) : '<span class="hf-ph">' + esc(f.placeholder || '') + '</span>'}</div>`;
    }
  }
  function renderHost() {
    const s = scn();
    const groups = [];
    visibleFields().forEach((f) => {
      let g = groups.find((x) => x.name === f.group);
      if (!g) { g = { name: f.group, fields: [] }; groups.push(g); }
      g.fields.push(f);
    });
    const wideKeys = { textarea: 1, iframe: 1, shadow: 1, file: 1 };
    el('hostPage').innerHTML = `
      <div class="hp-head">
        <h2>${esc(s.pageTitle)}</h2>
        <p>${esc(s.pageSub)}</p>
      </div>
      ${groups.map((g) => `
        <div class="hp-group">
          <div class="hp-glabel">${esc(g.name)}</div>
          <div class="hp-grid">
            ${g.fields.map((f) => `
              <div class="hp-field${(f.control === 'textarea' || wideKeys[f.control] || f.control === 'checkbox') ? ' wide' : ''}">
                ${f.control === 'checkbox' ? '' : `<label>${esc(f.label)}${f.required ? '<em>*</em>' : ''}</label>`}
                ${controlHtml(f)}
              </div>`).join('')}
          </div>
        </div>`).join('')}
      <div class="hp-actions"><span class="hp-submit">Submit application</span></div>`;
    icons();
  }

  /* =======================================================================
     RENDER — side panel (the product)
     ======================================================================= */
  function badge(kind, text, icon) {
    return `<span class="qf-badge qf-badge--${kind}">${icon ? `<i data-lucide="${icon}"></i>` : ''}${text}</span>`;
  }
  function srcBadge(source) { const m = SOURCE_META[source]; return badge(m.badge, m.label, m.icon); }

  function panelHeader(meta) {
    const s = scn();
    return `<div class="panel-head">
      <div class="panel-top">
        <div class="panel-brand"><img src="assets/logo-icon.svg" alt="" /><span>Quik<span class="fill">Fill</span></span></div>
        <div class="panel-icons">
          <button class="panel-iconbtn" data-action="toggle-hide" title="${state.hideValues ? 'Show values' : 'Hide values'}"><i data-lucide="${state.hideValues ? 'eye-off' : 'eye'}"></i></button>
          <button class="panel-iconbtn" data-action="panel-settings" title="Settings"><i data-lucide="settings"></i></button>
          <button class="panel-iconbtn" data-action="panel-close" title="Close panel"><i data-lucide="x"></i></button>
        </div>
      </div>
      <div class="site-chip"><span class="fav">${s.fav}</span> <span class="host">${esc(s.hostname)}</span>${meta ? ` · ${meta}` : ''}</div>
    </div>`;
  }

  function fieldRowDetected(f) {
    const st = fs(f.id);
    const chips = [];
    chips.push(badge('gray', f.currentValue ? 'has value' : 'empty'));
    if (f.required) chips.push(badge('danger', 'required'));
    if (f.options) chips.push(badge('info', f.options.length + ' options'));
    if (f.strategy === 'customSelect') chips.push(badge('warning', 'custom widget'));
    let ai = '';
    if (f.ambiguous && state.aiOpen) {
      if (st.aiAccepted) ai = `<p class="frow-ai-ok"><i data-lucide="check"></i> AI mapped → ${esc(f.ai.semanticType)}</p>`;
      else if (st.aiRejected) ai = `<p class="frow-ai-no">Suggestion dismissed</p>`;
      else if (state.aiPhase === 'ready' && f.ai) ai = aiSuggestionCard(f);
    } else if (f.ambiguous) {
      chips.push(badge('warning', 'ambiguous'));
    }
    return `<div class="frow-card">
      <div class="frow-top"><span class="frow-label"><span class="nm">${esc(f.label)}</span></span><span class="frow-type">${esc(f.inputType)}</span></div>
      <div class="frow-chips">${chips.join('')}</div>
      ${ai}
    </div>`;
  }

  function aiSuggestionCard(f) {
    return `<div class="ai-card">
      <div class="ai-head"><i data-lucide="wand-sparkles"></i> AI suggests <b>${esc(f.ai.semanticType)}</b> <span class="ai-conf">${pct(f.ai.confidence)}</span></div>
      <ul class="ai-reasons">${f.ai.reasons.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>
      <div class="ai-acts">
        <button class="qf-btn qf-btn--primary qf-btn--sm" data-action="ai-accept" data-id="${f.id}"><i data-lucide="check"></i> Accept</button>
        <button class="qf-btn qf-btn--ghost qf-btn--sm" data-action="ai-reject" data-id="${f.id}">Reject</button>
      </div>
    </div>`;
  }

  function fieldRowPreview(f) {
    const eff = effective(f);
    const excluded = isExcluded(f);
    const warn = (f.warnings || []);
    return `<div class="frow-card${excluded ? ' muted' : ''}">
      <div class="frow-top">
        <label class="frow-label"><input type="checkbox" class="qf-check" ${excluded ? '' : 'checked'} data-action="toggle-field" data-id="${f.id}" /><span class="nm">${esc(f.label)}</span></label>
        <button class="frow-srcbtn" data-action="cycle-source" data-id="${f.id}" title="Change fill source">${SOURCE_META[eff.source].short}<i data-lucide="chevron-down"></i></button>
      </div>
      <div class="frow-vals"><span class="cur">${f.currentValue ? esc(f.currentValue) : 'empty'}</span><span class="arr">→</span><span class="prop">${esc(mask(eff.value))}</span></div>
      <div class="frow-foot">${srcBadge(eff.source)}<div class="qf-meter ${meterClass(eff.confidence)}"><span style="width:${pct(eff.confidence)}"></span></div><span class="pct">${pct(eff.confidence)}</span></div>
      ${warn.length ? `<div class="frow-chips">${warn.map((w) => `<span class="qf-badge qf-badge--gray"><i data-lucide="triangle-alert"></i> ${esc(w)}</span>`).join('')}</div>` : ''}
      ${f.requiresConfirmation && !excluded ? `<div class="frow-confirm"><i data-lucide="shield-alert"></i> Needs your confirmation before submit</div>` : ''}
    </div>`;
  }

  function fieldRowResult(f) {
    const oc = outcomeOf(f);
    if (!oc) return '';
    const eff = effective(f);
    const map = {
      success: { icon: 'check', color: 'var(--qf-success)', badge: 'success', text: 'filled' },
      skipped: { icon: 'minus', color: 'var(--qf-body-2)', badge: 'gray', text: 'skipped' },
      failed: { icon: 'x', color: 'var(--qf-danger)', badge: 'danger', text: 'failed' },
    }[oc.status];
    return `<div class="frow-card">
      <div class="frow-top"><span class="frow-label"><i data-lucide="${map.icon}" style="width:15px;height:15px;color:${map.color}"></i><span class="nm">${esc(f.label)}</span></span>${badge(map.badge, map.text)}</div>
      ${oc.status === 'success' ? `<div class="frow-vals"><span class="prop">${esc(mask(eff.value))}</span></div>` : ''}
      ${oc.reason ? `<div class="frow-reason">${esc(oc.reason)}</div>` : ''}
    </div>`;
  }

  function limitationsBlock() {
    const lims = scn().limitations;
    if (!lims.length) return '';
    return `<div class="lim-block">
      <button class="lim-toggle" data-action="toggle-limits"><i data-lucide="triangle-alert"></i> ${lims.length} scan limitation${lims.length === 1 ? '' : 's'}<i data-lucide="chevron-${state.limitsOpen ? 'up' : 'down'}" class="caret"></i></button>
      ${state.limitsOpen ? lims.map((l) => `<div class="lim-row"><i data-lucide="${LIMITATION_META[l.kind].icon}"></i><div><div class="lim-k">${LIMITATION_META[l.kind].label}</div><div class="lim-d">${esc(l.detail)}</div></div></div>`).join('') : ''}
    </div>`;
  }

  function renderPanel() {
    const dock = el('dock');
    document.querySelector('.bwin-body').classList.toggle('dock-open', state.panelOpen);
    if (!state.panelOpen) { dock.innerHTML = ''; return; }
    const s = scn();
    let body = '', foot = '', meta = '';

    if (state.phase === 'prescan') {
      meta = '';
      const tip = s.savedForDomain > 0
        ? `<div class="qf-alert qf-alert--info tip"><i data-lucide="bookmark-check"></i><div>You have <strong>${s.savedForDomain} saved profile${s.savedForDomain === 1 ? '' : 's'}</strong> for this domain.</div></div>`
        : `<div class="qf-alert qf-alert--info tip"><i data-lucide="shield-check"></i><div>Nothing is read until you scan. Values stay on your device.</div></div>`;
      body = `<div class="empty">
        <div class="orb"><i data-lucide="scan-line"></i></div>
        <h3>Scan this page</h3>
        <p>Detect every field, then preview a fill plan before anything is written.</p>
        ${tip}
      </div>`;
      foot = `<button class="qf-btn qf-btn--primary qf-btn--block" data-action="scan"><i data-lucide="scan-line"></i> Scan page</button>`;
    }

    else if (state.phase === 'scanning') {
      body = `<div class="empty"><div class="orb spin"><i data-lucide="loader-2"></i></div><h3>Scanning…</h3><p>Detecting fields, reading labels, fingerprinting the form.</p></div>`;
      foot = `<button class="qf-btn qf-btn--primary qf-btn--block" disabled><i data-lucide="loader-2" class="spin"></i> Scanning…</button>`;
    }

    else if (state.phase === 'detected') {
      const vf = planFields(), sk = skippedFields();
      meta = vf.length + ' fields';
      const matched = s.matchedProfile;
      body = `
        ${matched ? `<div class="qf-alert qf-alert--success"><i data-lucide="bookmark-check"></i><div><strong>Matched “${esc(matched.name)}”.</strong> ${matched.mappingCount} saved mappings applied · by ${esc(matched.matchedBy)}.</div></div>` : ''}
        ${state.aiPhase === 'unavailable' ? `<div class="qf-alert qf-alert--warning"><i data-lucide="cloud-off"></i><div>Quikfill AI is unavailable — it's optional, you can still preview and fill.</div></div>` : ''}
        ${hasAmbiguous() && !state.aiOpen ? `<div class="qf-alert qf-alert--info"><i data-lucide="wand-sparkles"></i><div><strong>${ambiguousFields().length} field${ambiguousFields().length === 1 ? '' : 's'} ${ambiguousFields().length === 1 ? 'is' : 'are'} ambiguous.</strong> Heuristics weren't confident — ask AI to classify.</div></div>` : ''}
        ${state.aiOpen && state.aiPhase === 'ready' ? `<p class="qf-hint privacy"><i data-lucide="lock"></i> Only redacted field summaries were sent — never your values.</p>` : ''}
        ${vf.map(fieldRowDetected).join('')}
        ${sk.map((f) => `<div class="frow-card muted"><div class="frow-top"><span class="frow-label"><span class="nm">${esc(f.label)}</span></span><span class="frow-type">${esc(f.inputType)}</span></div><div class="frow-chips">${badge('gray', 'skipped')}</div><div class="frow-reason">${esc(f.skipReason || '')}</div></div>`).join('')}
        ${limitationsBlock()}`;
      const aiBtn = hasAmbiguous() && prefs.ai
        ? `<button class="qf-btn qf-btn--outline qf-btn--block qf-btn--sm" data-action="askai" ${state.aiPhase === 'loading' ? 'disabled' : ''}><i data-lucide="${state.aiPhase === 'loading' ? 'loader-2' : 'wand-sparkles'}" ${state.aiPhase === 'loading' ? 'class="spin"' : ''}></i> ${state.aiPhase === 'loading' ? 'Asking AI…' : 'Ask QuikFill AI'}</button>`
        : '';
      foot = `<button class="qf-btn qf-btn--primary qf-btn--block" data-action="preview"><i data-lucide="list-checks"></i> Preview fill</button>${aiBtn}`;
    }

    else if (state.phase === 'preview') {
      const vf = planFields();
      meta = includedFields().length + ' of ' + vf.length + ' included';
      const conf = vf.filter((f) => f.requiresConfirmation && !isExcluded(f)).length;
      body = `
        ${scn().matchedProfile ? `<div class="qf-alert qf-alert--success"><i data-lucide="bookmark-check"></i><div><strong>Plan from “${esc(scn().matchedProfile.name)}”.</strong> Saved mappings + heuristics.</div></div>` : ''}
        ${conf ? `<div class="qf-alert qf-alert--warning"><i data-lucide="shield-alert"></i><div><strong>${conf} field${conf === 1 ? '' : 's'} need${conf === 1 ? 's' : ''} confirmation.</strong> Review before you fill.</div></div>` : ''}
        <div class="panel-meta"><span class="cnt">${includedFields().length} of ${vf.length} included</span><button class="qf-btn qf-btn--ghost qf-btn--sm" data-action="regenerate"><i data-lucide="refresh-cw"></i> Regenerate</button></div>
        ${vf.map(fieldRowPreview).join('')}
        ${limitationsBlock()}`;
      foot = `
        <button class="qf-btn qf-btn--primary qf-btn--block" data-action="fill" ${includedFields().length ? '' : 'disabled'}><i data-lucide="check-check"></i> Fill ${includedFields().length} field${includedFields().length === 1 ? '' : 's'}</button>
        <div class="frow">
          <button class="qf-btn qf-btn--outline qf-btn--block qf-btn--sm" data-action="save"><i data-lucide="bookmark"></i> ${scn().matchedProfile || state.saved ? 'Update profile' : 'Save profile'}</button>
          ${hasAmbiguous() && prefs.ai ? `<button class="qf-btn qf-btn--ghost qf-btn--block qf-btn--sm" data-action="askai"><i data-lucide="wand-sparkles"></i> Ask AI</button>` : ''}
        </div>`;
    }

    else if (state.phase === 'filling') {
      body = `<div class="empty"><div class="orb spin"><i data-lucide="loader-2"></i></div><h3>Filling…</h3><p>Writing values, dispatching events, verifying each field.</p></div>`;
      foot = `<button class="qf-btn qf-btn--primary qf-btn--block" disabled><i data-lucide="loader-2" class="spin"></i> Filling…</button>`;
    }

    else if (state.phase === 'results') {
      const vf = planFields();
      const res = vf.map(outcomeOf).filter(Boolean);
      const ok = res.filter((r) => r.status === 'success').length;
      const fail = res.filter((r) => r.status === 'failed').length;
      const skip = scn().fields.filter((f) => f.skip || (isExcluded(f) && !f.hidden)).length;
      const alertKind = fail ? 'warning' : 'success';
      const alertIcon = fail ? 'shield-alert' : 'check-check';
      meta = '';
      body = `
        <div class="qf-alert qf-alert--${alertKind}"><i data-lucide="${alertIcon}"></i><div><strong>${ok} filled${fail ? ' · ' + fail + ' failed' : ''}${skip ? ' · ' + skip + ' skipped' : ''}.</strong> ${fail ? 'Some custom widgets need a manual touch.' : 'Verified on the page.'}</div></div>
        ${vf.map(fieldRowResult).join('')}
        ${skippedFields().map((f) => `<div class="frow-card muted"><div class="frow-top"><span class="frow-label"><i data-lucide="minus" style="width:15px;height:15px;color:var(--qf-body-2)"></i><span class="nm">${esc(f.label)}</span></span>${badge('gray', 'skipped')}</div><div class="frow-reason">${esc(f.skipReason || '')}</div></div>`).join('')}
        ${limitationsBlock()}
        ${state.saved ? `<p class="qf-hint privacy"><i data-lucide="bookmark-check"></i> Profile saved — next visit fills instantly.</p>` : ''}`;
      foot = `
        <button class="qf-btn qf-btn--outline qf-btn--block" data-action="undo"><i data-lucide="undo-2"></i> Undo last fill</button>
        <button class="qf-btn qf-btn--soft qf-btn--block qf-btn--sm" data-action="save"><i data-lucide="bookmark-check"></i> ${state.saved ? 'Profile saved ✓' : 'Save profile'}</button>`;
    }

    dock.innerHTML = `<div class="ext-panel">
      ${panelHeader(meta)}
      <div class="panel-body qf-scroll">${body}</div>
      <div class="panel-foot">${foot}</div>
    </div>`;
    icons();
  }

  /* =======================================================================
     RENDER — toolbar popup
     ======================================================================= */
  function renderPopup() {
    const mount = el('popupMount');
    if (!state.popupOpen) { mount.innerHTML = ''; return; }
    const ready = state.phase !== 'prescan' && state.phase !== 'scanning';
    mount.innerHTML = `<div class="popup">
      <div class="panel-head" style="border-radius:0">
        <div class="panel-top"><div class="panel-brand"><img src="assets/logo-icon.svg" alt="" /><span>Quik<span class="fill">Fill</span></span></div>${badge(ready ? 'success' : 'gray', ready ? 'Plan ready' : 'Idle')}</div>
      </div>
      <div class="popup-body">
        <button class="qf-btn qf-btn--primary qf-btn--block" data-action="open-panel"><i data-lucide="panel-right-open"></i> Open side panel</button>
        <hr class="qf-divider" />
        <button class="popup-row" data-action="popup-scan"><i data-lucide="scan-line"></i><div><div class="t">Quick scan</div><div class="s">Detect fields on this page</div></div></button>
        <button class="popup-row" data-action="popup-mydata"><i data-lucide="database"></i><div><div class="t">My data</div><div class="s">1 record · 3 generators</div></div></button>
        <button class="popup-row" data-action="popup-settings"><i data-lucide="settings"></i><div><div class="t">Settings</div><div class="s">Open options page</div></div></button>
      </div>
    </div>`;
    icons();
  }

  /* =======================================================================
     RENDER — options page (overlay inside the browser)
     ======================================================================= */
  function optRow(title, sub, control) {
    return `<div class="opt-row"><div><div class="t">${title}</div><div class="s">${sub}</div></div>${control}</div>`;
  }
  function switchEl(key) { return `<input type="checkbox" class="qf-switch" ${prefs[key] ? 'checked' : ''} data-action="pref-toggle" data-key="${key}" />`; }
  function renderOptions() {
    const mount = el('optionsMount');
    if (!state.optionsOpen) { mount.innerHTML = ''; mount.classList.remove('show'); return; }
    mount.classList.add('show');
    const seg = (key, opts) => `<div class="qf-tabs">${opts.map((o) => `<button class="qf-tab" ${prefs[key] === o.v ? 'aria-selected="true"' : ''} data-action="pref-seg" data-key="${key}" data-val="${o.v}">${o.l}</button>`).join('')}</div>`;
    mount.innerHTML = `<div class="opt-shroud" data-action="options-close"></div>
      <div class="opt-modal qf-scroll">
        <div class="opt-modal-head">
          <div class="panel-brand"><img src="assets/logo-icon.svg" alt="" /><span>Quik<span class="fill">Fill</span> · Options</span></div>
          <button class="panel-iconbtn" data-action="options-close"><i data-lucide="x"></i></button>
        </div>
        <div class="opt-sec-title">Filling</div>
        <div class="options">
          ${optRow('Default fill source', 'What QuikFill proposes when no mapping exists.', `<select class="qf-select opt-select" data-action="pref-source"><option value="hybrid"${prefs.defaultSource === 'hybrid' ? ' selected' : ''}>Hybrid (record → generator)</option><option value="recordField"${prefs.defaultSource === 'recordField' ? ' selected' : ''}>Saved record</option><option value="generatorRule"${prefs.defaultSource === 'generatorRule' ? ' selected' : ''}>Generator preset</option><option value="aiGenerated"${prefs.defaultSource === 'aiGenerated' ? ' selected' : ''}>Ask AI</option></select>`)}
          ${optRow('Auto-match saved profiles', 'Apply mappings on scan by fingerprint — never URL alone.', switchEl('autoMatch'))}
          ${optRow('Hide values by default', 'Mask proposed values until you reveal them.', switchEl('hideValues'))}
        </div>
        <div class="opt-sec-title">AI assistance</div>
        <div class="options">
          ${optRow('QuikFill AI', 'Send redacted field summaries to classify ambiguous fields.', switchEl('ai'))}
          ${optRow('Locale', 'Region used by value generators.', `<select class="qf-select opt-select" data-action="pref-locale"><option value="en-US"${prefs.locale === 'en-US' ? ' selected' : ''}>English (US)</option><option value="en-GB"${prefs.locale === 'en-GB' ? ' selected' : ''}>English (UK)</option><option value="sr-RS"${prefs.locale === 'sr-RS' ? ' selected' : ''}>Srpski (RS)</option></select>`)}
        </div>
        <div class="opt-sec-title">Appearance & permissions</div>
        <div class="options">
          ${optRow('Theme', 'Match the system or pick one.', seg('appearance', [{ v: 'light', l: 'Light' }, { v: 'auto', l: 'Auto' }, { v: 'dark', l: 'Dark' }]))}
          ${optRow('Host access', 'QuikFill requests access only when you click Scan.', `<span class="qf-badge qf-badge--success"><i data-lucide="shield-check"></i> On click only</span>`)}
        </div>
        <div class="opt-sec-title">Data</div>
        <div class="options">
          ${optRow('Saved profiles & records', 'Stored locally on this device.', `<button class="qf-btn qf-btn--outline qf-btn--sm" data-action="noop"><i data-lucide="external-link"></i> Manage</button>`)}
          ${optRow('Clear all data', 'Remove every profile, mapping and preference.', `<button class="qf-btn qf-btn--danger qf-btn--sm" data-action="noop"><i data-lucide="trash-2"></i> Clear</button>`)}
        </div>
      </div>`;
    icons();
  }

  /* =======================================================================
     RENDER all
     ======================================================================= */
  function render() { renderChrome(); renderHost(); renderPanel(); renderPopup(); renderOptions(); }

  /* =======================================================================
     ACTIONS
     ======================================================================= */
  function scan() {
    state.phase = 'scanning'; state.popupOpen = false; renderPanel(); renderChrome();
    setTimeout(() => { state.phase = 'detected'; render(); }, 850);
  }
  function preview() { state.phase = 'preview'; render(); }
  function askAi() {
    if (!prefs.ai) return;
    state.aiOpen = true; state.aiPhase = 'loading'; renderPanel();
    setTimeout(() => { state.aiPhase = 'ready'; if (state.phase === 'preview') state.phase = 'detected'; renderPanel(); }, 950);
  }
  function fill() {
    state.phase = 'filling'; renderPanel();
    setTimeout(() => {
      includedFields().forEach((f) => { const oc = outcomeOf(f); if (oc && oc.status === 'success') state.filledIds.add(f.id); });
      state.phase = 'results'; render();
    }, 950);
  }
  function undo() {
    state.filledIds = new Set();
    state.phase = 'preview'; render();
  }
  function saveProfile() { state.saved = true; renderPanel(); }
  function regenerate() {
    state.seed = 'seed-' + Math.floor(Math.random() * 1e9);
    renderPanel(); renderHost();
  }
  function resetFlow() {
    state.phase = 'prescan'; state.aiPhase = 'idle'; state.aiOpen = false; state.saved = false;
    state.seed = 'seed-1'; state.fieldState = {}; state.filledIds = new Set(); state.limitsOpen = false;
  }
  function setScenario(id) { if (id === state.scenarioId) return; state.scenarioId = id; resetFlow(); render(); }

  function applyAppearance() {
    const a = prefs.appearance;
    const dark = a === 'dark' || (a === 'auto' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.classList.toggle('dark', dark);
    localStorage.setItem('qf-theme', dark ? 'dark' : 'light');
  }

  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-action]');
    if (!t) {
      // click outside popup closes it
      if (state.popupOpen && !e.target.closest('#popupMount') && !e.target.closest('#toolbarBtn')) { state.popupOpen = false; renderPopup(); renderChrome(); }
      return;
    }
    const a = t.dataset.action, id = t.dataset.id, key = t.dataset.key;
    switch (a) {
      case 'set-scenario': setScenario(id); break;
      case 'scan': scan(); break;
      case 'preview': preview(); break;
      case 'askai': askAi(); break;
      case 'ai-accept': fs(id).aiAccepted = true; renderPanel(); break;
      case 'ai-reject': fs(id).aiRejected = true; renderPanel(); break;
      case 'fill': fill(); break;
      case 'undo': undo(); break;
      case 'save': saveProfile(); break;
      case 'regenerate': regenerate(); break;
      case 'toggle-field': { const cur = isExcluded(scn().fields.find((f) => f.id === id)); fs(id).excluded = !cur; renderPanel(); break; }
      case 'cycle-source': cycleSource(id); break;
      case 'toggle-hide': state.hideValues = !state.hideValues; renderPanel(); renderChrome(); break;
      case 'toggle-limits': state.limitsOpen = !state.limitsOpen; renderPanel(); break;
      case 'panel-close': state.panelOpen = false; render(); break;
      case 'panel-settings': state.optionsOpen = true; state.popupOpen = false; renderPopup(); renderOptions(); break;
      case 'toolbar': state.popupOpen = !state.popupOpen; renderPopup(); renderChrome(); break;
      case 'open-panel': state.popupOpen = false; state.panelOpen = true; render(); break;
      case 'popup-scan': state.popupOpen = false; state.panelOpen = true; renderPopup(); renderPanel(); renderChrome(); scan(); break;
      case 'popup-mydata': state.popupOpen = false; state.optionsOpen = true; renderPopup(); renderOptions(); break;
      case 'popup-settings': state.popupOpen = false; state.optionsOpen = true; renderPopup(); renderOptions(); break;
      case 'options-close': state.optionsOpen = false; renderOptions(); break;
      case 'pref-toggle': prefs[key] = !prefs[key]; savePrefs(); if (key === 'hideValues') state.hideValues = prefs.hideValues; renderOptions(); renderPanel(); break;
      case 'pref-seg': prefs[key] = t.dataset.val; savePrefs(); if (key === 'appearance') applyAppearance(); renderOptions(); break;
      case 'noop': break;
      default: break;
    }
  });

  document.addEventListener('change', (e) => {
    const t = e.target.closest('[data-action]');
    if (!t) return;
    const a = t.dataset.action;
    if (a === 'pref-source') { prefs.defaultSource = t.value; savePrefs(); }
    else if (a === 'pref-locale') { prefs.locale = t.value; savePrefs(); }
  });

  function cycleSource(id) {
    const f = scn().fields.find((x) => x.id === id);
    const st = fs(id);
    const cur = st.source || f.source;
    let idx = SOURCE_CYCLE.indexOf(cur);
    if (idx < 0) idx = 0;
    st.source = SOURCE_CYCLE[(idx + 1) % SOURCE_CYCLE.length];
    if (f.ambiguous) st.aiAccepted = false; // manual override clears AI mapping
    renderPanel();
  }

  // toolbar button uses its own action name
  document.addEventListener('DOMContentLoaded', init);
  function init() {
    el('toolbarBtn').dataset.action = 'toolbar';
    applyAppearance();
    render();
  }
  if (document.readyState !== 'loading') init();
})();
