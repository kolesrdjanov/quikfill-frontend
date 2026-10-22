// Real Chromium characterization; no production site, network calls, or backend needed.
// npm install --prefix /private/tmp/quikfill-audit-react --ignore-scripts react@19.2.6 react-dom@19.2.6
// node packages/form-scanner/audit/browser.mjs
import { createRequire } from 'node:module'
import { readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const frontend = fileURLToPath(new URL('../../../', import.meta.url))
const requireE2e = createRequire(path.join(frontend, 'apps/e2e/package.json'))
const { chromium } = requireE2e('@playwright/test')
const esbuildDir = readdirSync(path.join(frontend, 'node_modules/.pnpm')).find((n) =>
  n.startsWith('esbuild@'),
)
const { build } = await import(
  path.join(frontend, 'node_modules/.pnpm', esbuildDir, 'node_modules/esbuild/lib/main.js')
)
const reactDir = process.env.QF_AUDIT_REACT_DIR ?? '/private/tmp/quikfill-audit-react/node_modules'
const bundled = await build({
  stdin: {
    contents: `
    import { applyFill } from './packages/form-scanner/src/fill.ts';
    import { scanForms } from './packages/form-scanner/src/scan.ts';
    import { valuesToFillInstructions } from './packages/ai/src/fill-request.ts';
    import React from 'react';
    import { createRoot } from 'react-dom/client';
    window.audit = { applyFill, scanForms, valuesToFillInstructions, React, createRoot };
  `,
    resolveDir: frontend,
  },
  alias: { react: path.join(reactDir, 'react'), 'react-dom': path.join(reactDir, 'react-dom') },
  bundle: true,
  write: false,
  format: 'iife',
  platform: 'browser',
  define: { 'process.env.NODE_ENV': '"production"' },
})
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.QF_AUDIT_CHROMIUM,
})
try {
  const page = await browser.newPage()
  await page.setContent('<!doctype html><html><body></body></html>')
  await page.addScriptTag({ content: bundled.outputFiles[0].text })
  const results = await page.evaluate(async () => {
    const { applyFill, scanForms, React, createRoot } = window.audit
    const ins = (id, value, extra = {}) => ({
      detectedFieldId: id,
      selectorCandidates: [`#${id}`],
      frame: 'main',
      shadow: false,
      tagName: 'input',
      inputType: 'text',
      fillStrategy: 'nativeInput',
      proposedValue: value,
      ...extra,
    })
    const widget = {
      kind: 'datepicker',
      triggerSelectorCandidates: [],
      valueDisplaySelectorCandidates: [],
      optionItemSelector: '[role="option"]',
      optionsOpenOnDemand: true,
    }
    const out = {}
    document.body.innerHTML =
      '<form><input id="date" readonly><div class="current-month">June 2032</div><button type="button" role="gridcell" aria-label="June 15, 2032">15</button><button type="submit">Save</button></form>'
    let submissions = 0
    document.querySelector('form').addEventListener('submit', (e) => {
      e.preventDefault()
      submissions++
    })
    const date = await applyFill([
      ins('date', '2032-06-15', { fillStrategy: 'customSelect', customWidget: widget }),
    ])
    out.datepickerSubmit = { submissions, result: date.results[0] }
    document.body.innerHTML = '<input id="age" type="number" min="18" max="99">'
    const number = await applyFill([ins('age', '200', { inputType: 'number' })])
    out.invalidNumber = {
      valid: document.getElementById('age').validity.valid,
      result: number.results[0],
    }
    document.body.innerHTML =
      '<input aria-label="Country" role="combobox"><button type="button" role="checkbox" aria-checked="false">Accept</button>'
    out.customDetection = scanForms().fields.map((f) => ({
      inputType: f.inputType,
      customWidget: f.customWidget ?? null,
    }))
    document.body.innerHTML = '<div id="host"></div>'
    const shadow = document.getElementById('host').attachShadow({ mode: 'open' })
    shadow.innerHTML = '<input id="inside">'
    let outsideEvents = 0
    const onInput = () => outsideEvents++
    document.addEventListener('input', onInput)
    const shadowOutcome = await applyFill([ins('inside', 'hello', { shadow: true })])
    document.removeEventListener('input', onInput)
    out.shadowInput = { outsideEvents, result: shadowOutcome.results[0] }
    document.body.innerHTML = '<div id="root"></div>'
    let latestChecked = false
    let changes = 0
    let rerender
    function Demo() {
      const [checked, setChecked] = React.useState(false)
      const [tick, setTick] = React.useState(0)
      latestChecked = checked
      rerender = () => setTick((v) => v + 1)
      return React.createElement(
        'div',
        { 'data-tick': tick },
        React.createElement('input', {
          id: 'check',
          type: 'checkbox',
          checked,
          onChange: (e) => {
            changes++
            setChecked(e.target.checked)
          },
        }),
      )
    }
    const root = createRoot(document.getElementById('root'))
    root.render(React.createElement(Demo))
    for (let i = 0; i < 30 && !document.getElementById('check'); i++)
      await new Promise((r) => setTimeout(r, 10))
    const checkbox = await applyFill([
      ins('check', 'true', { inputType: 'checkbox', fillStrategy: 'clickToggle' }),
    ])
    const before = {
      checked: document.getElementById('check').checked,
      state: latestChecked,
      changes,
    }
    rerender()
    await new Promise((r) => setTimeout(r, 40))
    out.reactCheckbox = {
      result: checkbox.results[0],
      beforeRerender: before,
      afterRerender: {
        checked: document.getElementById('check').checked,
        state: latestChecked,
        changes,
      },
    }
    root.unmount()
    return out
  })
  console.log(
    JSON.stringify(
      {
        chromium: browser.version(),
        react: '19.2.6',
        kind: 'engine characterization, not full extension E2E',
        results,
      },
      null,
      2,
    ),
  )
} finally {
  await browser.close()
}
