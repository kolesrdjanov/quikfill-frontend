<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { Download, ShieldCheck } from 'lucide-vue-next'
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
import { extensionSettingsFormSchema, listToLines } from '@/schemas/forms'

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
const { handleSubmit, defineField, isSubmitting, resetForm } = useFormValidation(
  extensionSettingsFormSchema,
)

const [globalEnabled] = defineField('globalEnabled')
const [blockedHostnames, blockedHostnamesAttrs] = defineField('blockedHostnames')
const [fillPaymentFields] = defineField('fillPaymentFields')
const [fillGovernmentIdFields] = defineField('fillGovernmentIdFields')
const [defaultFillSource] = defineField('defaultFillSource')
const [autoMatchProfiles] = defineField('autoMatchProfiles')
const [aiEnabled] = defineField('aiEnabled')
const [skipFilledFields] = defineField('skipFilledFields')
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

const onSubmitConfig = handleSubmit(async (values) => {
  try {
    await auth.updateSettings(values)
    toast.success('Configuration saved')
  } catch (error) {
    handleError(error)
  }
})
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
              <p class="text-muted-foreground text-sm">
                Turn the extension on or off everywhere. When off, the Fill button never appears.
              </p>
            </div>
            <Switch id="global-enabled" v-model="globalEnabled" aria-label="Enable QuikFill" />
          </div>
          <div>
            <Label for="blocked-hostnames">Blocked sites</Label>
            <p class="text-muted-foreground mb-2 text-sm">
              QuikFill never runs on these sites. One hostname per line (e.g.
              <code>bank.example.com</code>).
            </p>
            <Textarea
              id="blocked-hostnames"
              v-model="blockedHostnames"
              v-bind="blockedHostnamesAttrs"
              rows="4"
              placeholder="bank.example.com&#10;admin.work.example"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sensitive fields</CardTitle>
        </CardHeader>
        <CardContent class="space-y-5">
          <p
            class="bg-muted/50 text-muted-foreground flex items-start gap-2 rounded-lg p-3 text-sm"
          >
            <ShieldCheck class="text-primary mt-0.5 size-4 shrink-0" />
            <span>Passwords and one-time / 2FA codes are <strong>never</strong> filled.</span>
          </p>
          <div class="flex items-start justify-between gap-4">
            <div>
              <Label for="fill-payment">Allow filling payment &amp; card fields</Label>
              <p class="text-muted-foreground text-sm">Card number, expiry, CVV. Off by default.</p>
            </div>
            <Switch
              id="fill-payment"
              v-model="fillPaymentFields"
              aria-label="Allow filling payment and card fields"
            />
          </div>
          <div class="flex items-start justify-between gap-4">
            <div>
              <Label for="fill-govid">Allow filling government IDs</Label>
              <p class="text-muted-foreground text-sm">SSN, tax ID, passport. Off by default.</p>
            </div>
            <Switch
              id="fill-govid"
              v-model="fillGovernmentIdFields"
              aria-label="Allow filling government ID fields"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Fill behavior</CardTitle>
        </CardHeader>
        <CardContent class="space-y-5">
          <div>
            <Label for="fill-source">Default data source</Label>
            <p class="text-muted-foreground mb-2 text-sm">
              What QuikFill proposes when no saved mapping exists for a field.
            </p>
            <Select id="fill-source" v-model="defaultFillSource">
              <option value="recordField">Only my saved data</option>
              <option value="hybrid">My saved data, then sample data</option>
              <option value="generatorRule">Sample data</option>
              <option value="aiGenerated">Leave it for me to fill</option>
            </Select>
          </div>
          <div class="flex items-start justify-between gap-4">
            <div>
              <Label for="auto-match">Auto-match saved profiles</Label>
              <p class="text-muted-foreground text-sm">
                Apply fingerprint-matched field mappings automatically.
              </p>
            </div>
            <Switch
              id="auto-match"
              v-model="autoMatchProfiles"
              aria-label="Auto-match saved profiles"
            />
          </div>
          <div class="flex items-start justify-between gap-4">
            <div>
              <Label for="ai-enabled">Use AI for ambiguous fields</Label>
              <p class="text-muted-foreground text-sm">
                Let QuikFill ask the AI to classify fields it can't map locally.
              </p>
            </div>
            <Switch id="ai-enabled" v-model="aiEnabled" aria-label="Use AI for ambiguous fields" />
          </div>
          <div class="flex items-start justify-between gap-4">
            <div>
              <Label for="skip-filled">Skip fields that already have a value</Label>
              <p class="text-muted-foreground text-sm">Leave pre-filled inputs untouched.</p>
            </div>
            <Switch
              id="skip-filled"
              v-model="skipFilledFields"
              aria-label="Skip fields that already have a value"
            />
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
            <p class="text-muted-foreground mb-2 text-sm">
              Drives generated names, addresses, phones.
            </p>
            <Select id="locale" v-model="locale">
              <option value="en-US">English (US)</option>
              <option value="en-GB">English (UK)</option>
              <option value="sr-RS">Srpski (RS)</option>
            </Select>
          </div>
          <div>
            <Label for="date-format">Date format</Label>
            <p class="text-muted-foreground mb-2 text-sm">Preferred format for proposed dates.</p>
            <Select id="date-format" v-model="dateFormat">
              <option value="auto">Automatic (by locale)</option>
              <option value="MM/DD/YYYY">MM/DD/YYYY</option>
              <option value="DD/MM/YYYY">DD/MM/YYYY</option>
              <option value="YYYY-MM-DD">YYYY-MM-DD</option>
            </Select>
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
              <p class="text-muted-foreground text-sm">
                Mask proposed and filled values until revealed — handy when screen-sharing.
              </p>
            </div>
            <Switch
              id="hide-values"
              v-model="hideValuesByDefault"
              aria-label="Hide values by default"
            />
          </div>
          <div>
            <Label for="theme">Theme</Label>
            <p class="text-muted-foreground mb-2 text-sm">
              Appearance of the extension's surfaces.
            </p>
            <Select id="theme" v-model="theme">
              <option value="light">Light</option>
              <option value="auto">Automatic (system)</option>
              <option value="dark">Dark</option>
            </Select>
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
              <p class="text-muted-foreground text-sm">
                The floating button QuikFill shows on detected forms.
              </p>
            </div>
            <Switch
              id="show-button"
              v-model="showFillButton"
              aria-label="Show the in-page Fill button"
            />
          </div>
          <div class="grid gap-4 sm:grid-cols-2">
            <div>
              <Label for="button-size">Button size</Label>
              <Select id="button-size" v-model="buttonSize" class="mt-2">
                <option value="sm">Small</option>
                <option value="md">Medium</option>
                <option value="lg">Large</option>
              </Select>
            </div>
            <div>
              <Label for="button-position">Button position</Label>
              <Select id="button-position" v-model="buttonPosition" class="mt-2">
                <option value="bottom-right">Bottom right</option>
                <option value="bottom-left">Bottom left</option>
                <option value="top-right">Top right</option>
                <option value="top-left">Top left</option>
              </Select>
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
