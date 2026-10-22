# Deploy: Chrome ekstenzija preko CWS API v2

Workflow: [`.github/workflows/deploy-extension.yml`](../.github/workflows/deploy-extension.yml).
Push na `main` koji menja ekstenziju, shared pakete ili lockfile pravi produkcioni
ZIP, proverava CWS v2 pristup i šalje novu verziju na Google review. Ručno
`workflow_dispatch` pokretanje podrazumevano koristi `dry_run=true`: proverava
pristup bez upload-a i bez slanja na review.

Listing QuikFill je **Public** (provereno 2026-10-22), sa objavljenom verzijom
1.1.12 pre ovog update-a. Pipeline zadržava postojeću vidljivost. CWS review i
auto-objava nakon odobrenja ostaju uključeni; zatečena verzija služi korisnike dok
traje review. Nema automatskog otkazivanja prethodnog review-a.

## Zašto API v2

Prethodni run #13 je prošao install/typecheck/43 testa/build/zip, ali je pao na
Google OAuth `invalid_grant`, pre upload-a verzije 1.1.13. Stari WXT 0.20 submit
koristi `publish-browser-extension` v4 i CWS v1.1. Google navodi kraj podrške za
v1 za 2026-10-15; obnova starog refresh tokena nije trajno rešenje.

WXT ostaje build alat. Za objavu koristimo zaseban, tačno pinovan
`publish-browser-extension@5.1.0` i `publish-extension --chrome-api-version v2`.
Ovaj dev alat se ne uključuje u extension runtime. Workflow koristi Node 24 kao i
repo. ZIP ostaje dostupan kao GitHub Actions artifact sedam dana, čak i kada CWS
pristup ne prođe.

## Google Cloud / CWS setup

1. U postojećem QuikFill Google Cloud projektu uključi **Chrome Web Store API**.
2. Napravi namenski service account za CWS objave. Nisu mu potrebne Google Cloud
   projektne IAM role, niti pristup Gemini-ju ili billing-u.
3. U CWS **Publisher → Settings → Service account** poveži njegovu email adresu.
   Ovo mu daje upravljanje svim stavkama tog publisher-a; QuikFill publisher je
   odvojen od drugih publisher naloga. Google trenutno dozvoljava jedan ovakav
   service account po publisher-u.
4. Napravi JSON ključ ili lokalni RSA privatni ključ sa javnim X.509 sertifikatom
   koji uploaduješ na service account. Sačuvaj privatni PEM i email u GitHub
   Actions Secrets dole. JSON/PEM ne ide u Git ili logove.

Promena pristupa/kreiranje novog ključa radi se zasebno od promene workflow-a.
Stari `CHROME_CLIENT_ID`, `CHROME_CLIENT_SECRET` i `CHROME_REFRESH_TOKEN` se više ne
koriste. Ne brišemo ih automatski tokom migracije.

## GitHub Actions konfiguracija

Repo: `kolesrdjanov/quikfill-frontend` → Settings → Secrets and variables → Actions.

| Secret                                | Vrednost                                                          |
| ------------------------------------- | ----------------------------------------------------------------- |
| `WXT_QF_API_BASE_URL`                 | `https://api.quikfill.io/api/v1`                                  |
| `CHROME_EXTENSION_ID`                 | ID postojećeg QuikFill item-a: `nnfiaaapphfcenegcppgdoehdalmnhce` |
| `CHROME_SERVICE_ACCOUNT_CLIENT_EMAIL` | Email namenskog CWS naloga                                        |
| `CHROME_SERVICE_ACCOUNT_PRIVATE_KEY`  | Privatni PEM ključ, sa očuvanim novim redovima                    |

Publisher ID `d2259aca-32f7-43f4-9960-a9dd6ac5214c` je javni identifikator
konfigurisan direktno u workflow-u. Nije OAuth client ID. Privatni ključ je samo
Actions secret, dostupan samo publishing koracima. Checkout ima read-only repo
pristup.

## Provera i objava

Prvo ručno pokreni workflow sa `dry_run=true`. Korak **Validate CWS v2 access (no
upload)** dobija service-account access token i čita `fetchStatus` tačno tog
item-a. Upload korak je tada preskočen. `invalid_grant` se više ne rešava starim
refresh tokenom; proveravaju se service-account ključ, uključen API i CWS veza.

Posle uspešne provere, push na `main` sa relevantnim promenama ili ručni run sa
`dry_run=false` radi upload i submit. Google review može trajati; uspešan submit
nije isto što i objavljena verzija. Proveri item status u CWS dashboard-u.

Verzija paketa u CI-ju je efemerna `1.1.<github.run_number>`; ne menja Git fajlove.
CWS zahteva strogo rastuću verziju. Ne vraćati broj prethodno upload-ovane verzije.
Workflow se ne pokreće samo zbog izmene samog workflow fajla, osim ručno.

Lokalno, ako je već pripremljen ignorisani `.env.submit` sa v2 vrednostima:

```sh
pnpm --filter @quikfill/chrome-extension zip
# Provera bez upload-a:
pnpm --filter @quikfill/chrome-extension exec publish-extension --chrome-api-version v2 --dry-run --chrome-zip .output/<release>-chrome.zip
# Read-only status:
pnpm --filter @quikfill/chrome-extension exec publish-extension status --chrome-api-version v2
```

Lokalni package.json je i dalje 1.0.13; za upload moraš prethodno napraviti paket
sa verzijom većom od poslednje CWS verzije. Za redovne objave koristi workflow.
Nemoj koristiti stari `wxt submit` iz WXT 0.20 za ovu migriranu konfiguraciju.

## Podešen pristup (2026-10-22)

Chrome Web Store API je uključen u projektu `gen-lang-client-0767866553`.
Publisher koristi `quikfill-cws-publisher@gen-lang-client-0767866553.iam.gserviceaccount.com`,
kreiran bez projektnih IAM rola. Novi email i privatni PEM su u Actions secrets;
stari OAuth secrets nisu obrisani, ali ih workflow više ne koristi.

Aktivni javni sertifikat/ključ ima ID `b8a99dc878262159d9039189e5087489a56e3980`
i ističe **2027-10-22 20:36:47 UTC**. Pre isteka zameniti Actions privatni ključ i
odgovarajući javni sertifikat ili preći na podržan keyless pristup. Prvi Google
JSON ključ nije korišćen zbog neuspelog browser preuzimanja i obrisan je uz
odobrenje korisnika. Lokalni privatni PEM je uklonjen nakon uspešnog submit-a;
aktivna privatna kopija ostaje u Actions secrets.

Lokalni v2 dry run je prošao bez upload-a. GitHub Actions
[run #15](https://github.com/kolesrdjanov/quikfill-frontend/actions/runs/39850873938)
je prošao install, typecheck, 43 testa, build/ZIP, čuvanje artefakta i v2 proveru;
upload je preskočen. Run #14 je otkrio da `upload-artifact@v4` podrazumevano
preskače skriveni `.output` direktorijum. `include-hidden-files: true` sada važi
samo za eksplicitni ZIP glob.

## Poslednja objava

[Run #16](https://github.com/kolesrdjanov/quikfill-frontend/actions/runs/39851141228)
je **uspešan** na commit-u `20f70d15cfedc4d34ebaed4bfea1ecfafd926af4`.
Paket **1.1.16** je uploadovan i poslat na review 2026-10-22 u 20:43 UTC.
CWS dashboard potvrđuje **Pending review**; to još nije nova objavljena verzija.
Objavljena 1.1.12 ostaje dostupna dok Google ne odobri update. ZIP je zadržan kao
`chrome-extension-16` artifact sedam dana.

Pre submit-a su sačuvani ispravljeni detaljan opis, single-purpose tekst i
objašnjenja dozvola. Tekstovi su u [STORE_LISTING.md](./STORE_LISTING.md).
Naglašeni su lokalni QA tok, opciona AI provera, account-backed sačuvani podaci,
ograničenja widgeta i činjenica da metadata nije garantovano anonimizovana.

## Granice

Workflow ne menja listing metadata, privacy odgovore, vidljivost, članove ili
pravne deklaracije. Taj sadržaj se održava u CWS; tekstualni predlozi su u
[STORE_LISTING.md](./STORE_LISTING.md).

Izvori: [CWS v1 kraj podrške](https://developer.chrome.com/docs/webstore/api/v1),
[CWS service accounts](https://developer.chrome.com/docs/webstore/service-accounts),
[publisher konfiguracija](https://github.com/aklinker1/publish-browser-extension/blob/main/docs/config-reference.md).
