# Deploy: Chrome ekstenzija (privatno, na push na `main`)

Workflow: [`.github/workflows/deploy-extension.yml`](../.github/workflows/deploy-extension.yml).

Push na `main` (koji dira `apps/chrome-extension/**`, `packages/**` ili
`pnpm-lock.yaml`) → CI build-uje produkcionu ekstenziju i upload-uje je na
Chrome Web Store preko WXT (`wxt zip` → `wxt submit`). Ekstenzija je **privatna** —
vidljiva samo Google nalozima koje pozoveš.

## Jednokratni setup (mora ručno — CI ovo ne radi)

### 1. Napravi listing u CWS Developer Dashboard-u

- Otvori [Developer Dashboard](https://chrome.google.com/webstore/devconsole), plati
  jednokratni $5 developer fee ako već nisi.
- Napravi novi item: upload-uj prvi build ručno jednom (`pnpm --filter
@quikfill/chrome-extension zip`, pa drag&drop `.output/*-chrome.zip`). Tek tako
  dobijaš **Extension ID** — `wxt submit` posle samo ažurira postojeći item.
- **Privacy/Visibility → Private**, pa **dodaj trusted testers** (Google email
  adrese ljudi koje pozivaš). Samo oni će moći da instaliraju ekstenziju.
- > Napomena: i privatne/trusted-tester verzije prolaze Google review pre nego što
  > postanu dostupne ("Pending review") — može da potraje.

### 2. Generiši CWS API kredencijale

Najlakše lokalno preko WXT-a (vodi te kroz Google Cloud OAuth setup i napiše
`.env.submit`):

```bash
pnpm --filter @quikfill/chrome-extension exec wxt submit init
```

Dobijaš: `CHROME_EXTENSION_ID`, `CHROME_CLIENT_ID`, `CHROME_CLIENT_SECRET`,
`CHROME_REFRESH_TOKEN`. (`.env.submit` je već gitignore-ovan preko `.env*` — ne
commit-uj ga.)

### 3. Dodaj GitHub Secrets

Repo → Settings → Secrets and variables → Actions → New repository secret:

| Secret                 | Vrednost                                                       |
| ---------------------- | -------------------------------------------------------------- |
| `WXT_QF_API_BASE_URL`  | produkcioni API origin, npr. `https://api.quikfill.com/api/v1` |
| `CHROME_EXTENSION_ID`  | iz koraka 2                                                    |
| `CHROME_CLIENT_ID`     | iz koraka 2                                                    |
| `CHROME_CLIENT_SECRET` | iz koraka 2                                                    |
| `CHROME_REFRESH_TOKEN` | iz koraka 2                                                    |

## Kako se objavljuje

Posle setup-a svaki push na `main` automatski deployuje. Verzija mora da raste pri
svakom upload-u — workflow zato setuje `1.0.<github.run_number>`. Major/minor
menjaš ručno u `apps/chrome-extension/package.json` kad želiš.

## Korisne varijante (u workflow-u)

- **Test pipeline-a bez slanja na store:** dodaj `--dry-run` na `wxt submit` —
  validira kredencijale i zip, ne upload-uje.
- **Upload bez auto-slanja na review** (objavljuješ dugme ručno u dashboard-u):
  env `CHROME_SKIP_SUBMIT_REVIEW: true` na submit koraku.
- **Eksplicitno samo trusted testers track:** env
  `CHROME_PUBLISH_TARGET: trustedTesters` na submit koraku.
