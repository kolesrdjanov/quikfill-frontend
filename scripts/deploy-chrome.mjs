/**
 * deploy:chrome — publish a fresh Chrome-extension build the dashboard serves itself.
 *
 * Pipeline (all inside the frontend repo, one atomic commit):
 *   1. Bump the extension PATCH version (1.0.2 -> 1.0.3) so every deploy is a
 *      distinct build (baked into the manifest + zip name by `wxt zip`).
 *   2. Production build + zip (`pnpm --filter @quikfill/chrome-extension zip`).
 *   3. Copy the newest *-chrome.zip into apps/app/public/quikfill-extension-<version>.zip
 *      (version-stamped name) and write apps/app/public/extension.json {version,filename,builtAt}.
 *   4. Commit ONLY those files + the version bump and push, so the app-quikfill
 *      Cloudflare Workers Build redeploys app.quikfill.io with the fresh download.
 *
 * Run from the frontend repo: `pnpm deploy:chrome`. Requires
 * apps/chrome-extension/.env.production to set WXT_QF_API_BASE_URL (the build
 * fails otherwise).
 */
import { execSync } from 'node:child_process'
import { copyFileSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const frontendRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const extDir = join(frontendRoot, 'apps', 'chrome-extension')
const ceOutputDir = join(extDir, '.output')
const appPublicDir = join(frontendRoot, 'apps', 'app', 'public')
const manifestPath = join(appPublicDir, 'extension.json')
const EXT_PKG_PATH = 'apps/chrome-extension/package.json'

function run(cmd, cwd) {
  console.log(`\n$ ${cmd}\n  (cwd: ${cwd})`)
  execSync(cmd, { cwd, stdio: 'inherit' })
}
function capture(cmd, cwd) {
  return execSync(cmd, { cwd }).toString().trim()
}

// 1. Bump PATCH. `wxt zip` reads this version for the manifest + zip name, so it
//    MUST happen before the build. It is committed only at the end, after a
//    successful build, so a failed build never pushes a phantom version.
const currentVersion = capture('npm pkg get version', extDir).replace(/"/g, '')
const semver = currentVersion.split('.').map(Number)
if (semver.length !== 3 || semver.some(Number.isNaN)) {
  throw new Error(
    `Extension version "${currentVersion}" is not a clean x.y.z — fix it by hand first.`,
  )
}
const nextVersion = `${semver[0]}.${semver[1]}.${semver[2] + 1}`
console.log(`\nBumping extension version ${currentVersion} -> ${nextVersion}`)
run(`npm pkg set version=${nextVersion}`, extDir)

// 2. Production build + zip.
run('pnpm --filter @quikfill/chrome-extension zip', frontendRoot)

// 3. Pick the newest *-chrome.zip (wxt also emits a *-sources.zip we ignore).
const chromeZips = readdirSync(ceOutputDir)
  .filter((f) => f.endsWith('-chrome.zip'))
  .map((f) => ({ f, mtime: statSync(join(ceOutputDir, f)).mtimeMs }))
  .sort((a, b) => b.mtime - a.mtime)
if (chromeZips.length === 0) {
  throw new Error(`No *-chrome.zip found in ${ceOutputDir} — did the build/zip step run?`)
}
const newest = chromeZips[0].f
const version = /(\d+\.\d+\.\d+)/.exec(newest)?.[1] ?? nextVersion

// Publish under a version-stamped filename so every build is a distinct,
// identifiable download (e.g. quikfill-extension-1.0.6.zip). extension.json
// records this exact name and the Setup page links to it; the stale-zip sweep
// below keeps the public folder to exactly the current build.
const destZipName = `quikfill-extension-${version}.zip`
const destZip = join(appPublicDir, destZipName)

// 4. Refresh the app's public assets. Delete any existing *.zip first so the
//    folder always holds exactly one current zip (robust against stray names).
mkdirSync(appPublicDir, { recursive: true })
const staleZips = readdirSync(appPublicDir).filter((f) => f.endsWith('.zip'))
for (const z of staleZips) rmSync(join(appPublicDir, z))
console.log(`\nPublishing ${newest} -> apps/app/public/${destZipName} (version ${version})`)
copyFileSync(join(ceOutputDir, newest), destZip)
writeFileSync(
  manifestPath,
  JSON.stringify({ version, filename: destZipName, builtAt: new Date().toISOString() }, null, 2) +
    '\n',
)

// 5. Stage ONLY our explicit, quoted paths (the bump, the new zip, the manifest,
//    and any stale zip we removed) — never `git add -A`. Commit + rebase + push.
const gitPaths = new Set([
  EXT_PKG_PATH,
  relative(frontendRoot, destZip),
  relative(frontendRoot, manifestPath),
])
for (const z of staleZips) gitPaths.add(relative(frontendRoot, join(appPublicDir, z)))
const pathArgs = [...gitPaths].map((p) => `"${p}"`).join(' ')

run(`git add ${pathArgs}`, frontendRoot)
if (!capture('git diff --cached --name-only', frontendRoot)) {
  console.log('\nNo change to publish — nothing to deploy.')
  process.exit(0)
}
// --no-verify: asset + version-bump only, so skip the heavy frontend gate.
// Autostash protects any unrelated WIP during the rebase.
run(
  `git commit --no-verify -m "chore(ce): publish extension build ${version}" -- ${pathArgs}`,
  frontendRoot,
)
run('git pull --rebase --autostash origin main', frontendRoot)
run('git push --no-verify origin HEAD', frontendRoot)

console.log(
  '\n✅ Published. Cloudflare Workers Build will redeploy app.quikfill.io with the fresh download.',
)
