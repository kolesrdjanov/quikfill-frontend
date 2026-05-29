<script setup lang="ts">
import { computed } from 'vue'
import { Loader2, RotateCw, ShieldAlert, TriangleAlert } from 'lucide-vue-next'
import { Badge, Checkbox } from '@quikfill/ui'
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
defineEmits<{ toggle: []; cycle: []; accept: []; reject: []; retry: [] }>()

const meta = computed(() => SOURCE_META[props.item.fillSource.sourceType])
const proposed = computed(() => mask(props.item.proposedValue, !!props.hideValues) || '—')
</script>

<template>
  <div class="bg-card rounded-[11px] border p-3" :class="excluded && 'opacity-[0.55]'">
    <div class="flex items-center justify-between gap-2">
      <label class="flex min-w-0 flex-1 items-center gap-2.5 text-[13.5px] font-semibold">
        <Checkbox :model-value="!excluded" @update:model-value="$emit('toggle')" />
        <span class="truncate">{{ item.label }}</span>
      </label>
      <SourcePill :source-type="item.fillSource.sourceType" @cycle="$emit('cycle')" />
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
    </template>

    <AiSuggestionInset
      v-if="suggestion"
      :suggestion="suggestion"
      @accept="$emit('accept')"
      @reject="$emit('reject')"
    />
  </div>
</template>
