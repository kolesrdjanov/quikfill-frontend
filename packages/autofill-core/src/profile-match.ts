import type { FormProfile, FormProfileMatchCandidate } from '@quikfill/schemas'

/** Signals about the current page used to rank saved profiles. */
export interface ProfileMatchContext {
  hostname: string
  url: string
  pageTitle?: string
  fieldFingerprintHash?: string
  fieldCount?: number
  structureHash?: string
}

/** A saved profile paired with its domain's hostnames (the hostname gate). */
export interface MatchableProfile {
  profile: FormProfile
  hostnames: string[]
}

// Signal weights. Fingerprint/structure are strong; URL/title/count are softer.
const W = {
  urlPattern: 25,
  pageTitle: 15,
  fingerprint: 40,
  structure: 30,
  fieldCountExact: 15,
  fieldCountClose: 8,
}

/** Convert a glob (`*`, `?`) to an anchored RegExp. */
export function globToRegExp(glob: string): RegExp {
  const escaped = glob.replace(/[.+^${}()|[\]\\]/g, '\\$&')
  const pattern = escaped.replace(/\*/g, '.*').replace(/\?/g, '.')
  return new RegExp(`^${pattern}$`)
}

function matchesAnyGlob(globs: string[], value: string): boolean {
  return globs.some((g) => {
    try {
      return globToRegExp(g).test(value)
    } catch {
      return false
    }
  })
}

/**
 * Rank saved profiles for the current page. Mirrors the backend v1 algorithm:
 * hostname gate → urlPattern glob → pageTitle → fingerprint exact → field-count
 * proximity → structure similarity; tie-break by most-recently-updated.
 * Profiles failing the hostname gate are excluded entirely. Pure + deterministic.
 */
export function matchProfiles(
  candidates: MatchableProfile[],
  ctx: ProfileMatchContext,
): FormProfileMatchCandidate[] {
  const ranked: (FormProfileMatchCandidate & { updatedAt: string })[] = []

  for (const { profile, hostnames } of candidates) {
    // Hostname gate: if hostnames are declared, the page must be one of them.
    if (hostnames.length > 0 && !hostnames.includes(ctx.hostname)) continue

    let score = 0
    const reasons: string[] = []

    if (profile.urlPatterns.length && matchesAnyGlob(profile.urlPatterns, ctx.url)) {
      score += W.urlPattern
      reasons.push('urlPattern')
    }
    if (
      ctx.pageTitle &&
      profile.pageTitlePatterns.length &&
      matchesAnyGlob(profile.pageTitlePatterns, ctx.pageTitle)
    ) {
      score += W.pageTitle
      reasons.push('pageTitle')
    }
    if (
      ctx.fieldFingerprintHash &&
      profile.fieldFingerprintHash &&
      profile.fieldFingerprintHash === ctx.fieldFingerprintHash
    ) {
      score += W.fingerprint
      reasons.push('fingerprint')
    }
    const meta = profile.structureMetadata
    if (ctx.structureHash && meta?.structureHash && meta.structureHash === ctx.structureHash) {
      score += W.structure
      reasons.push('structure')
    }
    if (ctx.fieldCount != null && meta?.fieldCount != null) {
      const delta = Math.abs(meta.fieldCount - ctx.fieldCount)
      if (delta === 0) {
        score += W.fieldCountExact
        reasons.push('fieldCount')
      } else if (delta <= 2) {
        score += W.fieldCountClose
        reasons.push('fieldCount~')
      }
    }

    if (score > 0) {
      ranked.push({ formProfileId: profile.id, score, reasons, updatedAt: profile.updatedAt ?? '' })
    }
  }

  ranked.sort((a, b) => b.score - a.score || b.updatedAt.localeCompare(a.updatedAt))
  return ranked.map(({ formProfileId, score, reasons }) => ({ formProfileId, score, reasons }))
}
