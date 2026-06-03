<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { Download } from 'lucide-vue-next'
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Label,
  Select,
  Switch,
  Textarea,
  toast,
} from '@quikfill/ui'
import { DEFAULT_EXTENSION_SETTINGS } from '@quikfill/schemas'
import {
  buildDownloadHref,
  extensionManifestSchema,
  type ExtensionManifest,
} from '@/schemas/extension'
import { useAuthStore } from '@/stores/auth'
import { useApiError } from '@/composables/useApiError'
import { useFormValidation } from '@/composables/useFormValidation'
import { extensionSettingsFormSchema, linesToList, listToLines } from '@/schemas/forms'

// --- Extension download (manifest-driven) ---
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

// --- Extension configuration (this dashboard is the source of truth; the
// extension syncs + applies these on sign-in/refresh) ---
const auth = useAuthStore()
const { handleError } = useApiError()
const { handleSubmit, defineField, errors, isSubmitting, resetForm } = useFormValidation(
  extensionSettingsFormSchema,
)

const [globalEnabled] = defineField('globalEnabled')
const [blockedHostnames, blockedHostnamesAttrs] = defineField('blockedHostnames')
const [locale] = defineField('locale')
const [dateFormat] = defineField('dateFormat')
const [hideValuesByDefault] = defineField('hideValuesByDefault')
const [theme] = defineField('theme')
const [showFillButton] = defineField('showFillButton')
const [buttonSize] = defineField('buttonSize')
const [buttonPosition] = defineField('buttonPosition')

/** Seed the form from the signed-in user's settings (backend always sends a full object). */
function seedConfig(): void {
  const s = auth.user?.extensionSettings ?? DEFAULT_EXTENSION_SETTINGS
  resetForm({
    values: {
      ...s,
      blockedHostnames: listToLines(s.blockedHostnames),
    },
  })
}

onMounted(seedConfig)

const onSubmitConfig = handleSubmit(
  async (values) => {
    try {
      await auth.updateSettings({
        ...values,
        blockedHostnames: linesToList(values.blockedHostnames),
      })
      toast.success('Configuration saved')
    } catch (error) {
      handleError(error)
    }
  },
  () => toast.error('Please fix the highlighted fields'),
)
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

    <!-- Customize how the extension behaves and looks. Saved here, synced to the extension. -->
    <form class="space-y-5" novalidate @submit="onSubmitConfig">
      <Card>
        <CardHeader>
          <CardTitle>Activation</CardTitle>
        </CardHeader>
        <CardContent class="space-y-5">
          <div class="flex items-start justify-between gap-4">
            <div>
              <Label for="global-enabled">Enable QuikFill</Label>
              <p class="text-muted-foreground text-xs">
                Turn the extension on or off everywhere. When off, the Fill button never appears.
              </p>
              <p v-if="errors.globalEnabled" class="text-destructive mt-1.5 text-xs">
                {{ errors.globalEnabled }}
              </p>
            </div>
            <Switch
              id="global-enabled"
              v-model="globalEnabled"
              aria-label="Enable QuikFill"
              :aria-invalid="!!errors.globalEnabled"
            />
          </div>
          <div>
            <Label for="blocked-hostnames">Blocked sites</Label>
            <p class="text-muted-foreground mb-2 text-xs">
              QuikFill never runs on these sites. One hostname per line (e.g.
              <code>bank.example.com</code>).
            </p>
            <Textarea
              id="blocked-hostnames"
              v-model="blockedHostnames"
              v-bind="blockedHostnamesAttrs"
              rows="4"
              placeholder="bank.example.com&#10;admin.work.example"
              :aria-invalid="!!errors.blockedHostnames"
            />
            <p v-if="errors.blockedHostnames" class="text-destructive mt-1.5 text-xs">
              {{ errors.blockedHostnames }}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Generated data</CardTitle>
        </CardHeader>
        <CardContent class="grid gap-4 sm:grid-cols-2">
          <div>
            <Label for="locale">Locale</Label>
            <p class="text-muted-foreground mb-2 text-xs">
              Drives generated names, addresses, phones.
            </p>
            <Select id="locale" v-model="locale" :aria-invalid="!!errors.locale">
              <option value="en-US">English (US)</option>
              <option value="en-GB">English (UK)</option>
              <option value="sr-RS">Srpski (RS)</option>
            </Select>
            <p v-if="errors.locale" class="text-destructive mt-1.5 text-xs">{{ errors.locale }}</p>
          </div>
          <div>
            <Label for="date-format">Date format</Label>
            <p class="text-muted-foreground mb-2 text-xs">Preferred format for proposed dates.</p>
            <Select id="date-format" v-model="dateFormat" :aria-invalid="!!errors.dateFormat">
              <option value="auto">Automatic (by locale)</option>
              <option value="MM/DD/YYYY">MM/DD/YYYY</option>
              <option value="DD/MM/YYYY">DD/MM/YYYY</option>
              <option value="YYYY-MM-DD">YYYY-MM-DD</option>
            </Select>
            <p v-if="errors.dateFormat" class="text-destructive mt-1.5 text-xs">
              {{ errors.dateFormat }}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Privacy &amp; display</CardTitle>
        </CardHeader>
        <CardContent class="space-y-5">
          <div class="flex items-start justify-between gap-4">
            <div>
              <Label for="hide-values">Hide values by default</Label>
              <p class="text-muted-foreground text-xs">
                Mask proposed and filled values until revealed — handy when screen-sharing.
              </p>
              <p v-if="errors.hideValuesByDefault" class="text-destructive mt-1.5 text-xs">
                {{ errors.hideValuesByDefault }}
              </p>
            </div>
            <Switch
              id="hide-values"
              v-model="hideValuesByDefault"
              aria-label="Hide values by default"
              :aria-invalid="!!errors.hideValuesByDefault"
            />
          </div>
          <div>
            <Label for="theme">Theme</Label>
            <p class="text-muted-foreground mb-2 text-xs">
              Appearance of the extension's surfaces.
            </p>
            <Select id="theme" v-model="theme" :aria-invalid="!!errors.theme">
              <option value="light">Light</option>
              <option value="auto">Automatic (system)</option>
              <option value="dark">Dark</option>
            </Select>
            <p v-if="errors.theme" class="text-destructive mt-1.5 text-xs">{{ errors.theme }}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Fill button</CardTitle>
        </CardHeader>
        <CardContent class="space-y-5">
          <div class="flex items-start justify-between gap-4">
            <div>
              <Label for="show-button">Show the in-page Fill button</Label>
              <p class="text-muted-foreground text-xs">
                The floating button QuikFill shows on detected forms.
              </p>
              <p v-if="errors.showFillButton" class="text-destructive mt-1.5 text-xs">
                {{ errors.showFillButton }}
              </p>
            </div>
            <Switch
              id="show-button"
              v-model="showFillButton"
              aria-label="Show the in-page Fill button"
              :aria-invalid="!!errors.showFillButton"
            />
          </div>
          <div class="grid gap-4 sm:grid-cols-2">
            <div>
              <Label for="button-size">Button size</Label>
              <Select
                id="button-size"
                v-model="buttonSize"
                class="mt-2"
                :aria-invalid="!!errors.buttonSize"
              >
                <option value="sm">Small</option>
                <option value="md">Medium</option>
                <option value="lg">Large</option>
              </Select>
              <p v-if="errors.buttonSize" class="text-destructive mt-1.5 text-xs">
                {{ errors.buttonSize }}
              </p>
            </div>
            <div>
              <Label for="button-position">Button position</Label>
              <Select
                id="button-position"
                v-model="buttonPosition"
                class="mt-2"
                :aria-invalid="!!errors.buttonPosition"
              >
                <option value="bottom-right">Bottom right</option>
                <option value="bottom-left">Bottom left</option>
                <option value="top-right">Top right</option>
                <option value="top-left">Top left</option>
              </Select>
              <p v-if="errors.buttonPosition" class="text-destructive mt-1.5 text-xs">
                {{ errors.buttonPosition }}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div class="flex justify-end">
        <Button type="submit" :disabled="isSubmitting">Save changes</Button>
      </div>
    </form>
  </div>
</template>
