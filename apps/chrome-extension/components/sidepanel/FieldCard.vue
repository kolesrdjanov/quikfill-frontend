<script setup lang="ts">
import { computed } from 'vue'
import { Badge } from '@quikfill/ui'
import type { AiSuggestion, DetectedField } from '@quikfill/schemas'
import AiSuggestionInset from './AiSuggestionInset.vue'

const props = defineProps<{
  field: DetectedField
  ambiguous?: boolean
  suggestion?: AiSuggestion
  acceptedType?: string
}>()
defineEmits<{ accept: []; reject: [] }>()

const skipped = computed(() => !props.field.visible)
const label = computed(
  () => props.field.labelText || props.field.name || props.field.domId || props.field.id,
)
</script>

<template>
  <div class="bg-card rounded-[11px] border p-3" :class="skipped && 'opacity-[0.58]'">
    <div class="flex items-center justify-between gap-2">
      <span class="min-w-0 flex-1 truncate text-[13.5px] font-semibold">{{ label }}</span>
      <span class="text-muted-foreground shrink-0 font-mono text-[11px]">
        {{ skipped ? 'hidden' : field.inputType }}
      </span>
    </div>

    <div class="mt-2 flex flex-wrap gap-1.5">
      <template v-if="skipped">
        <Badge variant="gray">skipped</Badge>
      </template>
      <template v-else>
        <Badge variant="gray">{{ field.currentValue ? 'has value' : 'empty' }}</Badge>
        <Badge v-if="field.required" variant="danger">required</Badge>
        <Badge v-if="field.options?.length" variant="info"
          >{{ field.options.length }} options</Badge
        >
        <Badge v-if="ambiguous" variant="warning">ambiguous</Badge>
      </template>
    </div>

    <AiSuggestionInset
      v-if="!skipped && suggestion"
      :suggestion="suggestion"
      @accept="$emit('accept')"
      @reject="$emit('reject')"
    />
    <p v-else-if="!skipped && acceptedType" class="text-success mt-1.5 text-[12px] font-medium">
      AI mapped → {{ acceptedType }}
    </p>
  </div>
</template>
