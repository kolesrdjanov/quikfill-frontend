export { scanForms } from './scan'
export { scanFormsGrouped, findSubmitButton, type GroupedScanResult } from './group'
export { resolveScopeRoot, type ResolvedScope } from './scope'
export {
  applyFill,
  applyUndo,
  captureFillTargets,
  type FillOutcome,
  type FillOptions,
  type FillTarget,
} from './fill'
export { probeFields } from './probe'
export { fingerprint, structureHash, type FingerprintInput } from './fingerprint'
export { fnv1aHex } from './hash'
export {
  isFormControl,
  getInputType,
  getCurrentValue,
  getLabelText,
  getSelectorCandidates,
  isVisible,
  looksLikeDatepickerInput,
  type FormControl,
} from './extract'
export { MIN_FILLABLE_FIELDS, qualifiesForFill, isOccludingHit } from './placement'
