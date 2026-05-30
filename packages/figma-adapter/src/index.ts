export { scanFigma, nodeToDetectedField, clearStaleMarkers, QF_ID_KEY } from './scan-figma'
export { applyFigmaFill, applyFigmaUndo } from './fill-figma'
export { createFigmaClientStorageAdapter } from './storage-figma'
export {
  figmaFingerprint,
  figmaStructureHash,
  fnv1aHex,
  type FigmaFingerprintInput,
} from './fingerprint-figma'
export { ensureFontsLoaded, fontsOfNode, isMixed } from './fonts'
export {
  SCAN_REQUEST,
  FILL_REQUEST,
  UNDO_REQUEST,
  STORAGE_REQUEST,
  RESPONSE,
  isScanRequest,
  isFillRequest,
  isUndoRequest,
  isStorageRequest,
  isResponse,
  onScanRequest,
  onFillRequest,
  onUndoRequest,
  onStorageRequest,
  mountSandboxBridge,
  type ScanRequestMessage,
  type FillRequestMessage,
  type UndoRequestMessage,
  type StorageRequestMessage,
  type StorageOp,
  type ResponseMessage,
  type FillResponse,
  type ScanHandler,
  type FillHandler,
  type UndoHandler,
  type StorageHandler,
} from './bridge'
export type { FigmaFillOutcome, FigmaNodeRef, FontLoadOutcome } from './types'
