/** Reduced controlled-DOM fixture: country enables state, then city, after async updates. */
export function mountDependentWidgets() {
  const root = document.getElementById('fixtures')!
  root.innerHTML =
    '<form id="dependent"><input name="email" type="email"><select name="country"><option value="">Choose country</option><option value="RS">Serbia</option></select><select name="state" disabled><option value="">Choose state</option></select><select name="city" disabled><option value="">Choose city</option></select><button type="submit">Save</button></form>'
  const country = root.querySelector('[name=country]') as HTMLSelectElement
  const state = root.querySelector('[name=state]') as HTMLSelectElement
  const city = root.querySelector('[name=city]') as HTMLSelectElement
  country.addEventListener('change', () => {
    state.disabled = true
    setTimeout(() => {
      state.innerHTML = '<option value="">Choose state</option><option value="BG">Beograd</option>'
      state.disabled = false
    }, 300)
  })
  state.addEventListener('change', () => {
    city.disabled = true
    setTimeout(() => {
      city.innerHTML = '<option value="">Choose city</option><option value="Vracar">Vracar</option>'
      city.disabled = false
    }, 800)
  })
  root.querySelector('form')!.addEventListener('submit', (event) => {
    event.preventDefault()
    root.dataset.submits = String(Number(root.dataset.submits ?? 0) + 1)
  })
}
