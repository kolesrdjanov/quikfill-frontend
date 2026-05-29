# `@quikfill/assets`

Canonical home for the QuikFill **brand assets** (logo, lockup, icons, social
image). Every surface consumes these from here — do not copy brand files into an
app's source by hand, and do not drop new ones at the repo root.

## Contents (`logos/`)

| File                     | Use                                                         |
| ------------------------ | ----------------------------------------------------------- |
| `quikfill-icon.svg`      | Primary mark (the tile). In-UI brand lockups.               |
| `quikfill-lockup.svg`    | Horizontal wordmark + icon.                                 |
| `quikfill-icon-256.png`  | Raster icon (small).                                        |
| `quikfill-icon-512.png`  | Raster icon (source for generated extension toolbar icons). |
| `quikfill-icon-1024.png` | Raster icon (store / hi-dpi).                               |
| `quikfill-lockup.png`    | Raster wordmark.                                            |
| `quikfill-og.png`        | Open Graph / social share image.                            |

## How to consume

**Vite/WXT apps (import as a URL):**

```ts
import logoUrl from '@quikfill/assets/logos/quikfill-icon.svg?url'
// <img :src="logoUrl" alt="" />
```

(`vite/client` types declare `*.svg?url`, so this also typechecks.)

**MV3 extension toolbar / Web Store icons** must be physical PNG files in the
extension's `public/icon/{16,32,48,128}.png` (Chrome can't use an SVG action
icon, and WXT only discovers icons under the extension's own `public/`). Those
files are committed in `apps/chrome-extension/public/icon/` as **derived
artifacts** generated from `logos/quikfill-icon-512.png`:

```sh
for sz in 16 32 48 128; do
  sips -z $sz $sz packages/assets/logos/quikfill-icon-512.png \
    --out apps/chrome-extension/public/icon/$sz.png
done
```

Regenerate them here (and re-commit) whenever the source icon changes.
