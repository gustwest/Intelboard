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

## Steg 4 — Flippa origin-läget

Två variabler flyttar `schema.json`, profilsidan, badge-länken **och kanoniken** till
den nya domänen — och släpper `clients/`-prefixet så katalog-URL:erna blir rena. Kör om
bootstrap (uppdaterar både Cloud Run-servicen och alla jobb):

```bash
PROFILE_DOMAIN=profiles.geogiraph.com \
CDN_BASE_URL=https://profiles.geogiraph.com \
CDN_CLEAN_URLS=true \
  ./scripts/bootstrap.sh
```

- `CDN_BASE_URL` → vilken domän URL:erna pekar på.
- `CDN_CLEAN_URLS=true` → innehåll i `<id>/` (utan `clients/`-prefix), rena
  katalog-URL:er (`…/<id>/`, serveras via MainPageSuffix), och **kanonik == serverad
  adress** (stänger GEO-glappet automatiskt — ingen kodändring behövs).

All URL-logik bor i `schema_org/urls.py`; flaggorna styr den. Lås beteendet med
`tests/test_urls.py` (båda lägena testas).

> Sätt båda variablerna permanent i `cloudbuild.yaml` när cutover är verifierad —
> annars återställer nästa deploy default-värdena (path-style).

## Steg 5 — Recompile

Layouten ändras till `<id>/...`, så artefakterna måste skrivas om till de nya
objektnamnen. Tack vare den idempotenta metadata-skrivningen i `compile_schema.py`
räcker en omkörning även om grafen är oförändrad:

```bash
gcloud run jobs execute compile-all-schemas --region=europe-north1
```

(De gamla `clients/<id>/`-objekten blir kvar som föräldralösa — städa bort dem med
`gsutil -m rm -r gs://$BUCKET/clients` när allt verifierats.)

Verifiera i Leverans-fliken att "Öppna" går till `https://profiles.geogiraph.com/<slug>/`
och laddar sidan, och att sidans `<link rel="canonical">` är samma URL.

## Premium: kundens egen domän (`profile_base_url`)

GEO-mässigt starkast är att sanningskällan ligger på *kundens* domän — då är innehållet
första-parts och väger tyngst hos AI-motorer/sök. Fältet finns redan på premium-kortet
("Profilsidans bas-URL"). När det är satt deklarerar `urls.canonical_url()` automatiskt
kundens domän som kanonik (badge + identitets-snutt + JSON-LD `@id` följer med). Kvar är
att faktiskt *servera* sidan på den domänen — två vägar:

1. **Kund-proxy (lägst ops för oss):** kunden lägger en reverse-proxy/redirect från
   `ai.kund.se` → `https://profiles.geogiraph.com/<slug>/`. Inget LB-arbete vår sida.
   Bra default för premium.
2. **White-glove (egen backend-bucket):** kunden CNAME:ar `ai.kund.se` → vår LB-IP, vi
   lägger domänen på managed-certet (`--domains` tar flera) och kopplar en host-regel i
   URL-mappen till en backend-bucket vars rot är kundens innehåll. OBS: backend-buckets
   stödjer inte path-rewrite — kundens artefakter måste därför ligga i bucket-roten
   (egen bucket per premium-kund, eller separat prefix som serveras som rot). Verifiera
   host-routningen i en stage-uppsättning innan vi lovar noll-touch.

Oavsett väg: certet blir ACTIVE först när kundens DNS pekar rätt.

## Rollback

Sätt `CDN_BASE_URL` tillbaka till `https://storage.googleapis.com/<BUCKET>`, kör om
bootstrap + recompile. LB-resurserna kan ligga kvar (kostar ören) — inget behöver rivas.
