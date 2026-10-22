/** Explicit localized DOM contract, not a claim to cover every calendar library. */
export function mountCalendarWidget(locale: 'en-US' | 'en-GB' | 'sr-RS', wrongMonth = false) {
  const root = document.getElementById('fixtures')!
  const format =
    locale === 'en-US' ? 'MM/DD/YYYY' : locale === 'sr-RS' ? 'DD.MM.YYYY' : 'DD/MM/YYYY'
  document.documentElement.lang = locale
  root.innerHTML = `<form><input name="email" type="email"><input name="date" readonly placeholder="${format}" min="2032-06-05" max="2032-06-05" aria-controls="owned-calendar" aria-expanded="false"><button type="button" id="rerender-calendar">Rerender calendar</button></form><div id="foreign-calendar" role="grid"><span class="cal-title">June 2032</span><button type="button" role="gridcell">5</button></div>`
  const input = root.querySelector('[name=date]') as HTMLInputElement
  let value = ''
  let currentMonth = 4
  const close = () => {
    document.getElementById('owned-calendar')?.remove()
    input.setAttribute('aria-expanded', 'false')
  }
  const render = () => {
    document.getElementById('owned-calendar')?.remove()
    const calendar = document.createElement('div')
    calendar.id = 'owned-calendar'
    calendar.setAttribute('role', 'grid')
    calendar.innerHTML = `<span class="cal-title">${new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(2032, currentMonth, 1)))}</span><button type="button" class="next" aria-label="Next month">Next</button><button type="button" class="prev" aria-label="Previous month">Previous</button><button type="button" role="gridcell">5</button>`
    calendar.querySelector('.next')!.addEventListener('click', () => {
      currentMonth++
      render()
    })
    calendar.querySelector('.prev')!.addEventListener('click', () => {
      currentMonth--
      render()
    })
    calendar.querySelector('[role=gridcell]')!.addEventListener('click', () => {
      value = wrongMonth
        ? '06/05/2032'
        : locale === 'en-US'
          ? '06/05/2032'
          : locale === 'sr-RS'
            ? '05.06.2032'
            : '05/06/2032'
      input.value = value
      root.dataset.date = value
      close()
    })
    document.body.appendChild(calendar)
    input.setAttribute('aria-expanded', 'true')
  }
  input.addEventListener('click', render)
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') close()
  })
  root.querySelector('#rerender-calendar')!.addEventListener('click', () => {
    input.value = value
  })
  root.querySelector('#foreign-calendar button')!.addEventListener('click', () => {
    root.dataset.foreign = 'clicked'
  })
}
