<script setup lang="ts">
import { nextTick, onMounted, ref, watch } from 'vue'

// Six segmented digit boxes — better than one field for pasting a code into a
// narrow 384px panel. Owns only the keyboard/paste mechanics; the joined value
// is the model, and the parent decides what a complete code means.
const props = withDefaults(
  defineProps<{ modelValue: string; error?: boolean; disabled?: boolean }>(),
  { error: false, disabled: false },
)
const emit = defineEmits<{
  'update:modelValue': [value: string]
  submit: []
}>()

const LENGTH = 6
const digits = ref<string[]>(Array.from({ length: LENGTH }, () => ''))
const boxes = ref<(HTMLInputElement | null)[]>([])
const shaking = ref(false)

function setBox(el: unknown, index: number): void {
  boxes.value[index] = (el as HTMLInputElement | null) ?? null
}

function syncFromModel(value: string): void {
  const chars = value.replace(/\D/g, '').slice(0, LENGTH).split('')
  digits.value = Array.from({ length: LENGTH }, (_, i) => chars[i] ?? '')
}

function emitValue(): void {
  emit('update:modelValue', digits.value.join(''))
}

function focusFirstEmpty(): void {
  const target = boxes.value.find((el) => el && !el.value) ?? boxes.value[LENGTH - 1]
  target?.focus()
}

function onInput(index: number, event: Event): void {
  const raw = (event.target as HTMLInputElement).value.replace(/\D/g, '')
  digits.value[index] = raw.slice(-1) ?? ''
  emitValue()
  if (digits.value[index] && index < LENGTH - 1) boxes.value[index + 1]?.focus()
}

function onKeydown(index: number, event: KeyboardEvent): void {
  if (event.key === 'Backspace' && !digits.value[index] && index > 0) {
    event.preventDefault()
    digits.value[index - 1] = ''
    emitValue()
    boxes.value[index - 1]?.focus()
  } else if (event.key === 'ArrowLeft' && index > 0) {
    event.preventDefault()
    boxes.value[index - 1]?.focus()
  } else if (event.key === 'ArrowRight' && index < LENGTH - 1) {
    event.preventDefault()
    boxes.value[index + 1]?.focus()
  } else if (event.key === 'Enter' && digits.value.join('').length === LENGTH) {
    emit('submit')
  }
}

function onPaste(event: ClipboardEvent): void {
  event.preventDefault()
  const pasted = (event.clipboardData?.getData('text') ?? '').replace(/\D/g, '').slice(0, LENGTH)
  syncFromModel(pasted)
  emitValue()
  void nextTick(focusFirstEmpty)
}

watch(
  () => props.modelValue,
  (value) => {
    if (value !== digits.value.join('')) syncFromModel(value)
  },
)

// Re-trigger the shake each time an error appears (reduced-motion users get the
// danger styling without the animation — see the scoped media query).
watch(
  () => props.error,
  (isError) => {
    if (!isError) return
    shaking.value = false
    void nextTick(() => {
      shaking.value = true
      setTimeout(() => (shaking.value = false), 420)
    })
  },
)

onMounted(() => {
  syncFromModel(props.modelValue)
  if (!props.disabled) void nextTick(focusFirstEmpty)
})
</script>

<template>
  <div class="flex w-full justify-center gap-2" :class="{ shake: shaking }">
    <input
      v-for="(digit, i) in digits"
      :key="i"
      :ref="(el) => setBox(el, i)"
      type="text"
      inputmode="numeric"
      maxlength="1"
      autocomplete="one-time-code"
      :value="digit"
      :disabled="disabled"
      :aria-label="`Digit ${i + 1}`"
      :aria-invalid="error"
      class="bg-card text-foreground focus:border-primary h-[54px] w-full max-w-[46px] rounded-lg border-[1.5px] text-center font-mono text-[22px] font-bold transition-colors focus:shadow-[var(--shadow-focus)] focus:outline-none disabled:cursor-not-allowed disabled:opacity-70"
      :class="
        error
          ? 'border-destructive bg-destructive/10 text-destructive'
          : digit
            ? 'border-primary bg-accent'
            : 'border-input'
      "
      @input="onInput(i, $event)"
      @keydown="onKeydown(i, $event)"
      @paste="onPaste"
    />
  </div>
</template>

<style scoped>
@media (prefers-reduced-motion: no-preference) {
  .shake {
    animation: otp-shake 0.4s ease;
  }
  @keyframes otp-shake {
    10%,
    90% {
      transform: translateX(-1px);
    }
    20%,
    80% {
      transform: translateX(2px);
    }
    30%,
    50%,
    70% {
      transform: translateX(-4px);
    }
    40%,
    60% {
      transform: translateX(4px);
    }
  }
}
</style>
