# Clean-URL-cutover: profilsidorna på `profiles.geogiraph.com`

Profilsidan är produktens kanoniska sanningskälla — den AI-motorerna läser och den
kunden länkar till via badge + identitets-snutt. Den ska därför ligga på en egen,
stabil, migrations-säker domän, inte på den råa `storage.googleapis.com`-URL:en.

Den här runbooken tar oss från GCS path-style → `https://profiles.geogiraph.com/...`
bakom en HTTPS-load balancer + Cloud CDN.

> **Förkrav klart:** vi äger `geogiraph.com` och kan sätta DNS.

## Bakgrund: varför det inte "bara funkar"

- Sidan laddas upp som objektet `clients/<id>/index.html` i CDN-bucketen.
- GCS path-style-endpointen (`storage.googleapis.com/BUCKET/...`) serverar **inte**
  `index.html` för en katalog-URL med avslutande `/`. Därför pekar `compile-schema`
  i dag direkt på `…/clients/<id>/index.html` (fungerar, men ful URL låst till
  bucket-/projektnamnet).
- `MainPageSuffix=index.html` (website-config) honoreras bara bakom en HTTPS-LB —
  inte på path-style-URL:en. LB:n ger oss alltså både den egna domänen *och* rena
  katalog-URL:er.

## Steg 1 — Provisionera infran (idempotent)

Körs en gång. Allt ligger i `scripts/bootstrap.sh` (sektion 3b), gated på
`PROFILE_DOMAIN`:

```bash
PROFILE_DOMAIN=profiles.geogiraph.com ./scripts/bootstrap.sh
```

Detta skapar: global statisk IP, backend-bucket med Cloud CDN, URL-map, managed
SSL-cert, target-HTTPS-proxy och forwarding-rule (443), samt sätter
`MainPageSuffix=index.html` på bucketen. Skriptet skriver ut LB-IP:t.

> Skriptet flippar **inte** `CDN_BASE_URL` — det gör vi medvetet i steg 4.

## Steg 2 — Peka DNS

Skapa en A-record hos vår DNS-leverantör mot IP:t från steg 1:

```
profiles.geogiraph.com   A   <LB_IP>
```

## Steg 3 — Vänta tills certet är ACTIVE

Google-managed-certet provisioneras först när DNS pekar rätt. Kan ta 15–60 min.

```bash
gcloud compute ssl-certificates describe insider-graph-cdn-cert \
  --global --format='value(managed.status)'
# → PROVISIONING ... till slut ACTIVE
```

Röktest när ACTIVE (en redan kompilerad kund):

```bash
curl -sI https://profiles.geogiraph.com/clients/<id>/index.html | head -1   # 200
curl -sI https://profiles.geogiraph.com/clients/<id>/            | head -1   # 200 (MainPageSuffix)
```

## Steg 4 — Flippa origin-URL:en

En enda variabel flyttar `schema.json`, profilsidan **och** badge-länken till den nya
domänen. Kör om bootstrap (uppdaterar både Cloud Run-servicen och alla jobb):

```bash
PROFILE_DOMAIN=profiles.geogiraph.com \
CDN_BASE_URL=https://profiles.geogiraph.com \
  ./scripts/bootstrap.sh
```

(Alternativt sätt `CDN_BASE_URL` i `cloudbuild.yaml` så det överlever framtida deploys —
annars återställer nästa deploy default-värdet. Gör det till en permanent ändring när
cutover är verifierad.)

## Steg 5 — Recompile

Nya URL:er skrivs först vid nästa compile. Tack vare den idempotenta
metadata-skrivningen i `compile_schema.py` räcker en omkörning även om grafen är
oförändrad:

```bash
gcloud run jobs execute compile-all-schemas --region=europe-north1
```

Verifiera i Leverans-fliken att "Öppna" går till `https://profiles.geogiraph.com/...`
och laddar sidan.

## Valfritt steg 6 — Kanonik-koherens (polish)

Efter steg 4 serveras sidan på den fina domänen, men `<link rel="canonical">` i sidan
pekar fortfarande på `DEFAULT_BASE/<id>` (`https://profiles.geogiraph.com/<id>`), vilket
inte är samma URL som den faktiskt serveras på (`…/clients/<id>/index.html`). För en
GEO-produkt är det värt att stänga den glappet så crawlers ser en kanonik som matchar
serverad adress.

Minsta ändring i `schema_org/compiler.py` (`build_render_model`):

```python
# före:
base = (data.get("profile_base_url") or f"{DEFAULT_BASE}/{client_id}").rstrip("/")

# efter — kanonik = där sidan faktiskt bor (premium-kundens egen domän går före):
base = data.get("profile_base_url")
base = base.rstrip("/") if base else f"{settings.cdn_base_url}/clients/{client_id}/index.html"
```

Obs:
- Detta ändrar alla `@id`-IRI:er i JSON-LD-grafen (de härleds ur `base`). Det är
  bara identifierare, men ändringen triggar en engångs-recompile för alla kunder
  (change-agenten ser en diff) — väntat.
- `profile_base_url`-grenen (premium custom domain) lämnas orörd: där deklarerar vi
  medvetet kundens egen domän som kanonik även om vi hostar sidan.
- Gör den här ändringen **först efter** att LB:n är live (annars pekar kanoniken på en
  path-style-URL som 404:ar).

## Rollback

Sätt `CDN_BASE_URL` tillbaka till `https://storage.googleapis.com/<BUCKET>`, kör om
bootstrap + recompile. LB-resurserna kan ligga kvar (kostar ören) — inget behöver rivas.
