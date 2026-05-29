export { scanForms } from './scan'
export { applyFill, applyUndo, type FillOutcome } from './fill'
export { fingerprint, structureHash, type FingerprintInput } from './fingerprint'
export { fnv1aHex } from './hash'
export {
  isFormControl,
  getInputType,
  getCurrentValue,
  getLabelText,
  getSelectorCandidates,
  isVisible,
  type FormControl,
} from './extract'
