import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import * as Checkbox from '@radix-ui/react-checkbox'
import * as Switch from '@radix-ui/react-switch'
import * as RadixSelect from '@radix-ui/react-select'
import ReactSelect from 'react-select'
import Autocomplete from '@mui/material/Autocomplete'
import TextField from '@mui/material/TextField'
import Select from '@mui/material/Select'
import MenuItem from '@mui/material/MenuItem'
import { Combobox, ComboboxInput, ComboboxOptions, ComboboxOption } from '@headlessui/react'

const h = React.createElement
let root: Root | undefined
export function mountReactWidgets(
  kind:
    | 'toggles'
    | 'conditional'
    | 'radixSelect'
    | 'radixRestore'
    | 'reactSelect'
    | 'reactMulti'
    | 'reactAsync'
    | 'muiSelect'
    | 'muiAutocomplete'
    | 'headlessCombobox' = 'toggles',
  delay = 800,
) {
  root?.unmount()
  function Toggles() {
    const [checked, setChecked] = React.useState<Checkbox.CheckedState>(false)
    const [enabled, setEnabled] = React.useState(false)
    const [tick, setTick] = React.useState(0)
    return h(
      'form',
      { 'data-tick': tick, 'data-checked': String(checked), 'data-enabled': String(enabled) },
      h(
        Checkbox.Root,
        {
          name: 'terms',
          required: true,
          checked,
          onCheckedChange: setChecked,
          'aria-label': 'Terms',
        },
        h(Checkbox.Indicator, null, '✓'),
      ),
      h(
        Switch.Root,
        {
          name: 'updates',
          required: true,
          checked: enabled,
          onCheckedChange: setEnabled,
          'aria-label': 'Updates',
        },
        h(Switch.Thumb),
      ),
      kind === 'conditional' && enabled
        ? h('input', { name: 'company', 'aria-label': 'Company', required: true })
        : null,
      h('button', { type: 'button', onClick: () => setTick((t) => t + 1) }, 'Rerender widgets'),
    )
  }
  function Choices() {
    type Option = { value: string; label: string }
    const multi = kind === 'reactMulti'
    const [value, setValue] = React.useState<Option | null | readonly Option[]>(multi ? [] : null)
    const [radix, setRadix] = React.useState(kind === 'radixRestore' ? 'previous' : '')
    const [tick, setTick] = React.useState(0)
    const [ready, setReady] = React.useState(kind !== 'reactAsync')
    const requested = React.useRef(false)
    const choices: Option[] = [{ value: 'chosen', label: multi ? 'Doe, Jane' : 'Editor' }]
    return h(
      'form',
      {
        'data-tick': tick,
        'data-selection':
          kind === 'radixSelect' || kind === 'radixRestore' || kind === 'muiSelect'
            ? radix
            : JSON.stringify(value),
      },
      h('input', { type: 'email', name: 'email', 'aria-label': 'Email' }),
      h(
        'div',
        { id: 'choice-field' },
        kind === 'radixSelect' || kind === 'radixRestore'
          ? h(
              RadixSelect.Root,
              { name: 'choice', value: radix, onValueChange: setRadix },
              h(
                RadixSelect.Trigger,
                { 'aria-label': 'Choice' },
                h(RadixSelect.Value, { placeholder: 'Choose role' }),
              ),
              h(
                RadixSelect.Portal,
                null,
                h(
                  RadixSelect.Content,
                  { position: 'popper' },
                  h(
                    RadixSelect.Viewport,
                    null,
                    h(
                      RadixSelect.Item,
                      { value: 'disabled', disabled: true },
                      h(RadixSelect.ItemText, null, 'Disabled'),
                    ),
                    kind === 'radixRestore'
                      ? h(
                          RadixSelect.Item,
                          { value: 'previous' },
                          h(RadixSelect.ItemText, null, 'Reviewer'),
                        )
                      : null,
                    h(
                      RadixSelect.Item,
                      { value: 'chosen' },
                      h(RadixSelect.ItemText, null, 'Editor'),
                    ),
                  ),
                ),
              ),
            )
          : kind === 'muiSelect'
            ? h(
                Select,
                {
                  name: 'choice',
                  value: radix,
                  onChange: (event) => setRadix(event.target.value as string),
                  displayEmpty: true,
                  inputProps: { 'aria-label': 'Choice' },
                  renderValue: (v) => (v ? 'Editor' : 'Choose role'),
                },
                h(MenuItem, { value: 'chosen' }, 'Editor'),
              )
            : kind === 'muiAutocomplete'
              ? h(Autocomplete<Option, false, false, false>, {
                  options: choices,
                  value: value as Option | null,
                  onChange: (_event, next) => setValue(next),
                  renderInput: (params) =>
                    h(TextField, {
                      ...params,
                      label: 'Choice',
                      inputProps: { ...params.inputProps, 'aria-label': 'Choice' },
                    }),
                })
              : kind === 'headlessCombobox'
                ? h(
                    Combobox,
                    {
                      name: 'choice',
                      by: (a: unknown, b: unknown) =>
                        (a as Option | null)?.value === (b as Option | null)?.value,
                      value,
                      immediate: true,
                      onChange: (next: unknown) => setValue(next as Option | null),
                    },
                    h(ComboboxInput, {
                      'aria-label': 'Choice',
                      displayValue: (next: unknown) => (next as Option | null)?.label ?? '',
                    }),
                    h(
                      ComboboxOptions,
                      { anchor: 'bottom', portal: true },
                      h(ComboboxOption, { value: choices[0] }, choices[0].label),
                    ),
                  )
                : h(ReactSelect<Option, boolean>, {
                    instanceId: kind,
                    name: 'choice',
                    'aria-label': 'Choice',
                    classNamePrefix: 'fixture-select',
                    options: ready ? choices : [],
                    value,
                    onChange: setValue,
                    isMulti: multi,
                    isLoading: !ready,
                    menuPortalTarget: document.body,
                    menuPosition: 'fixed',
                    onMenuOpen: () => {
                      if (!requested.current && !ready) {
                        requested.current = true
                        setTimeout(() => setReady(true), delay)
                      }
                    },
                  }),
      ),
      kind === 'muiAutocomplete'
        ? h('input', {
            type: 'hidden',
            name: 'choice',
            value: (value as Option | null)?.value ?? '',
          })
        : null,
      h('button', { type: 'button', onClick: () => setTick((t) => t + 1) }, 'Rerender widgets'),
    )
  }
  root = createRoot(document.getElementById('fixtures')!)
  root.render(h(kind === 'toggles' || kind === 'conditional' ? Toggles : Choices))
}
