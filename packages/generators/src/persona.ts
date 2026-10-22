import { FIRST_NAMES, LAST_NAMES } from './data'
import { createRng } from './rng'

/** One synthetic identity shared by all fields in a plan. Never persisted. */
export interface SamplePersona {
  firstName: string
  lastName: string
  email: string
  phone: string
  street: string
  city: string
  state: string
  zip: string
  country: string
}

export function createSamplePersona(seed?: string | number, locale = 'en-US'): SamplePersona {
  const rng = createRng(seed, `persona:${locale}`)
  const region = locale === 'sr-RS' ? 'RS' : locale === 'en-GB' ? 'GB' : 'US'
  const firstName = rng.pick(region === 'RS' ? ['Ana', 'Mila', 'Luka', 'Nikola'] : FIRST_NAMES)
  const lastName = rng.pick(
    region === 'RS' ? ['Petrovic', 'Jovanovic', 'Nikolic', 'Ilic'] : LAST_NAMES,
  )
  const addresses = {
    US: { street: '123 Example Street', city: 'New York', state: 'NY', zip: '10001' },
    GB: { street: '10 Example Road', city: 'London', state: 'London', zip: 'SW1A 1AA' },
    RS: { street: 'Primer ulica 12', city: 'Beograd', state: 'Beograd', zip: '11000' },
  }
  const phone = { US: '+1-202-555-01##', GB: '+44-1632-960###', RS: '+381-60-###-####' }[
    region
  ].replace(/#/g, () => String(rng.int(0, 9)))
  return {
    firstName,
    lastName,
    email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}${rng.int(1, 999)}@example.com`,
    phone,
    ...addresses[region],
    country: region,
  }
}
