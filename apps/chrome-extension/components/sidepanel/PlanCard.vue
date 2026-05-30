<script setup lang="ts">
import { computed } from 'vue'
import { Loader2, RotateCw, ShieldAlert, TriangleAlert, X } from 'lucide-vue-next'
import { Badge, Button, Checkbox } from '@quikfill/ui'
import type { AiSuggestion, FillPlanItem } from '@quikfill/schemas'
import type { AiFieldStatus } from '../../lib/useFillSession'
import { SOURCE_META, mask } from '../../lib/display-maps'
import ConfidenceMeter from './ConfidenceMeter.vue'
import SourcePill from './SourcePill.vue'
import AiSuggestionInset from './AiSuggestionInset.vue'

const props = defineProps<{
  item: FillPlanItem
  excluded?: boolean
  hideValues?: boolean
  suggestion?: AiSuggestion
  aiStatus?: AiFieldStatus
}>()
defineEmits<{
  toggle: []
  cycle: []
  accept: []
  reject: []
  retry: []
  remove: []
  openSettings: []
}>()

const meta = computed(() => SOURCE_META[props.item.fillSource.sourceType])
// Custom selects always fill with the first available option (the actual option
// text isn't known until the dropdown is opened at fill time), so preview that
// intent rather than a proposed value the filler ignores.
const proposed = computed(() =>
  props.item.fillStrategy === 'customSelect'
    ? 'First available option'
    : mask(props.item.proposedValue, !!props.hideValues) || '—',
)
const needsValue = computed(() => props.item.fillSource.sourceType === 'aiGenerated')
</script>

<template>
  <div class="bg-card rounded-[11px] border p-3" :class="excluded && 'opacity-[0.55]'">
    <div class="flex items-center justify-between gap-2">
      <label class="flex min-w-0 flex-1 items-center gap-2.5 text-[13.5px] font-semibold">
        <Checkbox :model-value="!excluded" @update:model-value="$emit('toggle')" />
        <span class="truncate">{{ item.label }}</span>
      </label>
      <SourcePill :source-type="item.fillSource.sourceType" @cycle="$emit('cycle')" />
      <Button
        variant="ghost"
        size="icon"
        class="text-muted-foreground hover:text-foreground size-7 shrink-0"
        aria-label="Remove field"
        @click="$emit('remove')"
      >
        <X class="size-4" />
      </Button>
    </div>

    <div class="mt-2 flex flex-wrap items-center gap-1.5 text-[12px]">
      <span class="text-muted-foreground">{{ item.currentValue || 'empty' }}</span>
      <span class="text-muted-foreground">→</span>
      <span class="bg-accent text-foreground rounded-md px-1.5 py-0.5 font-mono font-semibold">
        {{ proposed }}
      </span>
    </div>

    <div class="mt-2.5 flex items-center gap-2">
      <Badge :variant="meta.badge">
        <component :is="meta.icon" />
        {{ meta.label }}
      </Badge>
      <ConfidenceMeter :confidence="item.confidence" />
    </div>

    <!-- On-demand single-field AI status takes over the warning area while it resolves. -->
    <p
      v-if="aiStatus === 'loading'"
      class="text-muted-foreground mt-1.5 flex items-center gap-1.5 text-[12px] font-medium"
    >
      <Loader2 class="size-3.5 animate-spin" />
      Asking AI…
    </p>
    <button
      v-else-if="aiStatus === 'unavailable'"
      type="button"
      class="text-warning hover:text-warning/80 mt-1.5 flex items-center gap-1.5 text-[12px] font-medium"
      @click="$emit('retry')"
    >
      <RotateCw class="size-3.5" />
      AI unavailable — click to retry
    </button>
    <template v-else>
      <div v-if="item.warnings.length" class="mt-1.5 flex flex-wrap gap-1.5">
        <Badge v-for="(w, i) in item.warnings" :key="i" variant="gray">
          <TriangleAlert />
          {{ w }}
        </Badge>
      </div>
      <p
        v-if="item.requiresConfirmation && !excluded"
        class="text-warning mt-1.5 flex items-center gap-1.5 text-[12px] font-medium"
      >
        <ShieldAlert class="size-3.5" />
        Needs your confirmation before submit
      </p>
      <div v-if="needsValue && !excluded" class="mt-2 flex flex-wrap items-center gap-2">
        <span class="text-muted-foreground text-[11px]">
          Switch the source above to <strong>Saved</strong> or <strong>Sample</strong>, or
        </span>
        <Button
          variant="outline"
          size="sm"
          class="h-6 px-2 text-[11px]"
          @click="$emit('openSettings')"
        >
          Turn on sample data
        </Button>
      </div>
    </template>

    <AiSuggestionInset
      v-if="suggestion"
      :suggestion="suggestion"
      @accept="$emit('accept')"
      @reject="$emit('reject')"
    />
  </div>
</template>
