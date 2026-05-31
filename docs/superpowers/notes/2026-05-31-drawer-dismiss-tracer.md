# Drawer-dismiss tracer

If a custom-select fill still collapses the host drawer in the live extension,
the mechanism lives in the **app's own bundle** (not reproducible in our jsdom
tests, which already prove the engine is safe against coordinate-, target-, and
focus-based dismissals). Use this to capture the exact teardown instead of guessing.

## How to use

1. Open the failing form (e.g. the facility-creation drawer) in the browser.
2. Open DevTools → Console and paste the snippet below, then press Enter.
3. Run a QuikFill fill that targets the custom dropdown.
4. If the drawer collapses, the console logs the event stream and a stack trace at
   the moment the drawer node is removed.

```js
;(() => {
  const drawer = document.querySelector('.drawer, [role="dialog"], [aria-modal="true"]')
  if (!drawer) return console.warn('[tracer] no drawer found')
  new MutationObserver((records) => {
    for (const r of records)
      for (const n of r.removedNodes)
        if (n === drawer || (n.contains && n.contains(drawer)))
          console.warn('[tracer] DRAWER REMOVED\n', new Error().stack)
  }).observe(document.body, { childList: true, subtree: true })
  for (const t of ['pointerdown', 'mousedown', 'click', 'focusout', 'keydown'])
    document.addEventListener(
      t,
      (e) => console.log('[tracer] evt', t, 'target=', e.target, 'trusted=', e.isTrusted),
      true,
    )
  console.log('[tracer] armed — run the fill now')
})()
```

## Reading it

- The last `[tracer] evt …` line **before** `DRAWER REMOVED` is the dismiss trigger.
- `trusted=false` confirms it was a synthetic event QuikFill dispatched.
- The stack after `DRAWER REMOVED` points at the app handler that closed it.

Feed the trigger event + target back into
[`fill.test.ts`](../../../packages/form-scanner/src/fill.test.ts) as a new case in
the "does not trip non-coordinate drawer dismissals" block, then harden
`clickElement` / `clickOption` / `closeOpenList` in
[`fill.ts`](../../../packages/form-scanner/src/fill.ts) against that specific
mechanism.
