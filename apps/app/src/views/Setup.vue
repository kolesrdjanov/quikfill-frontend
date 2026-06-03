<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { Download } from 'lucide-vue-next'
import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from '@quikfill/ui'
import {
  buildDownloadHref,
  extensionManifestSchema,
  type ExtensionManifest,
} from '@/schemas/extension'

const manifest = ref<ExtensionManifest | null>(null)

// `/extension.json` is a same-origin STATIC asset (written by deploy:chrome), not
// the backend API — so it is fetched directly, NOT through @quikfill/api-client.
// Parsed with Zod; on any failure the fixed download URL still works (no badge).
onMounted(async () => {
  try {
    const res = await fetch('/extension.json', { cache: 'no-store' })
    if (!res.ok) return
    manifest.value = extensionManifestSchema.parse(await res.json())
  } catch {
    // Manifest missing/malformed — leave the version hidden; download still works.
  }
})

const downloadHref = computed(() => buildDownloadHref(manifest.value))
</script>

<template>
  <div class="mx-auto max-w-2xl space-y-5">
    <Card>
      <CardHeader>
        <CardTitle class="flex items-center gap-2">
          Chrome extension
          <Badge v-if="manifest" variant="gray">v{{ manifest.version }}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent class="space-y-5">
        <p class="text-muted-foreground text-sm">
          Download the QuikFill Chrome extension and load it as an unpacked extension. Every release
          here is the latest build — re-download any time to update.
        </p>

        <Button as="a" :href="downloadHref" download>
          <Download class="size-4" />
          Download extension
        </Button>

        <div class="space-y-2">
          <p class="text-sm font-medium">Loading it into Chrome</p>
          <ol class="text-muted-foreground list-decimal space-y-1.5 pl-5 text-sm">
            <li>Download the file above and unzip it.</li>
            <li>Open <code class="text-foreground">chrome://extensions</code> in Chrome.</li>
            <li>
              Turn on <span class="text-foreground font-medium">Developer mode</span> (top-right).
            </li>
            <li>
              Click <span class="text-foreground font-medium">Load unpacked</span> and select the
              unzipped folder.
            </li>
          </ol>
        </div>
      </CardContent>
    </Card>
  </div>
</template>
