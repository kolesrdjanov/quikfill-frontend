<script setup lang="ts">
import { CollapsibleContent, CollapsibleRoot, CollapsibleTrigger } from 'reka-ui'
import { ChevronDown } from 'lucide-vue-next'

defineProps<{ title: string; description?: string }>()
</script>

<template>
  <CollapsibleRoot class="bg-card overflow-hidden rounded-xl border">
    <CollapsibleTrigger
      class="group hover:bg-muted/40 focus-visible:ring-ring flex min-h-12 w-full items-center justify-between gap-3 px-4 py-3 text-left text-[13px] font-semibold transition-colors focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset"
    >
      {{ title }}
      <ChevronDown
        class="text-muted-foreground size-4 shrink-0 transition-transform group-data-[state=open]:rotate-180"
      />
    </CollapsibleTrigger>
    <CollapsibleContent class="border-t">
      <div class="space-y-4 p-4">
        <p v-if="description" class="text-muted-foreground text-xs leading-relaxed">
          {{ description }}
        </p>
        <slot />
      </div>
    </CollapsibleContent>
  </CollapsibleRoot>
</template>
