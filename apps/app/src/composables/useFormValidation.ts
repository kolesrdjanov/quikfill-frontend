// The implementation now lives in `@quikfill/ui` (rule 4: shared UI + utils), so
// the dashboard and the extension validate forms through one copy. Re-exported
// here to keep the existing `@/composables/useFormValidation` import path stable.
export { useFormValidation } from '@quikfill/ui'
