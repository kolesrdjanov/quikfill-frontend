import type { Component } from 'vue'
import {
  Ban,
  Blocks,
  Check,
  Database,
  Dices,
  MessageSquareText,
  Minus,
  MousePointerClick,
  Pin,
  ShieldX,
  SquareArrowOutUpRight,
  WandSparkles,
  X,
} from 'lucide-vue-next'
import type { AiClassifyReason } from '@quikfill/browser-adapter'
import type { FillResult, FillSourceType, ScanLimitation } from '@quikfill/schemas'

type BadgeTone = 'primary' | 'info' | 'success' | 'warning' | 'danger' | 'gray'

export interface SourceMeta {
  label: string
  short: string
  badge: BadgeTone
  icon: Component
}

/** Fill-source presentation, keyed by `FillSource.sourceType`. */
export const SOURCE_META: Record<FillSourceType, SourceMeta> = {
  recordField: { label: 'Your saved data', short: 'Saved', badge: 'primary', icon: Database },
  // Synthetic, generated values — labeled "Sample" everywhere so they are never
  // mistaken for the user's real information.
  generatorRule: { label: 'Sample data', short: 'Sample', badge: 'info', icon: Dices },
  aiGenerated: { label: 'Needs a value', short: 'Add value', badge: 'warning', icon: WandSparkles },
  staticValue: { label: 'Static value', short: 'Static', badge: 'gray', icon: Pin },
  runtimeValue: { label: 'Ask me', short: 'Ask me', badge: 'gray', icon: MessageSquareText },
  composed: { label: 'Composed', short: 'Composed', badge: 'primary', icon: Blocks },
}

/** User-facing copy for an AI failure cause (see `AiClassifyReason`). */
export const AI_REASON_MESSAGE: Record<AiClassifyReason, string> = {
  'not-configured': 'Quikfill AI isn’t enabled on the server right now.',
  quota: 'You’ve reached this month’s AI limit — it resets next month.',
  'rate-limited': 'Too many AI requests just now — wait a moment and try again.',
  auth: 'Your session expired — sign in again to use AI.',
  offline: 'Quikfill AI is unreachable. Check your connection and try again.',
  error: 'Quikfill AI hit an unexpected error — you can still preview and fill.',
}

/** Order the per-field "change source" pill cycles through. */
export const SOURCE_CYCLE: FillSourceType[] = [
  'recordField',
  'generatorRule',
  'aiGenerated',
  'staticValue',
  'runtimeValue',
]

/** Limitation copy + icon, keyed by `ScanLimitation.kind`. */
export const LIMITATION_META: Record<ScanLimitation['kind'], { icon: Component; label: string }> = {
  closedShadow: { icon: ShieldX, label: 'Closed shadow DOM' },
  crossOriginFrame: { icon: SquareArrowOutUpRight, label: 'Cross-origin iframe' },
  inaccessible: { icon: Ban, label: 'Inaccessible' },
}

/** Result-status presentation, keyed by `FillResult.status`. */
export const STATUS_META: Record<
  FillResult['status'],
  { icon: Component; tone: BadgeTone; iconClass: string }
> = {
  success: { icon: Check, tone: 'success', iconClass: 'text-success' },
  skipped: { icon: Minus, tone: 'gray', iconClass: 'text-muted-foreground' },
  failed: { icon: X, tone: 'danger', iconClass: 'text-destructive' },
  assisted: {
    icon: MousePointerClick,
    tone: 'warning',
    iconClass: 'text-[#b7791f] dark:text-warning',
  },
}

/** Confidence-meter color band by threshold (≥.85 success, <.6 warning, else primary). */
export function confidenceTone(confidence: number): BadgeTone {
  if (confidence >= 0.85) return 'success'
  if (confidence < 0.6) return 'warning'
  return 'primary'
}

export function pct(confidence: number): string {
  return `${Math.round(confidence * 100)}%`
}

/** Mask a value to dots when "hide values" is on; never reveal user data below it. */
export function mask(value: string | null | undefined, hide: boolean): string {
  const v = value ?? ''
  if (!v || !hide) return v
  return '•'.repeat(Math.min(Math.max(v.length, 6), 12))
}
