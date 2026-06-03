import { z } from 'zod'

/**
 * Shape of `/extension.json`, the version manifest the deploy:chrome script writes
 * into apps/app/public alongside the downloadable zip. Fetched same-origin by the
 * Setup page and Zod-parsed before use (untrusted static asset).
 */
export const extensionManifestSchema = z.object({
  version: z.string(),
  filename: z.string(),
  builtAt: z.string(),
})

export type ExtensionManifest = z.infer<typeof extensionManifestSchema>

/** The fixed download URL when no manifest has been published yet. */
const FALLBACK_HREF = '/quikfill-extension.zip'

/**
 * Build the download link. With a manifest we append `?v=<version>` so a new build
 * always defeats any cached copy; without one we point at the fixed URL.
 */
export function buildDownloadHref(manifest: ExtensionManifest | null): string {
  if (!manifest) return FALLBACK_HREF
  return `/${manifest.filename}?v=${manifest.version}`
}
