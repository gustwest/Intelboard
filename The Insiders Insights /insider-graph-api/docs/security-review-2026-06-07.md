# Säkerhetsgenomgång — Insider Graph (2026-06-07)

Helsystems-analys av backend (`insider-graph-api`), admin-frontend, Cloud Run-infra,
Firestore, CDN, mejl (Brevo) och tredjepartsflöden. Syftet med systemet — ett B2B-
GEO-verktyg som hanterar **persondata** och vars hela pitch är **trovärdig
datahantering** — gör att säkerhet här inte är polish utan kärnvärde: en öppen API
med kunddata + raderingsmakt + risk för molncred-stöld är en existentiell
förtroende- och GDPR-risk.

> Metod: fyra parallella läs-svep (auth/API-exponering, hemligheter/PII/tredjepart,
> input/SSRF/uppladdning, infra/IAM/CDN). Allt verifierat mot kod + live-konfig.

---

## Sammanfattande bedömning

**Grunden är förvånansvärt stark** på dataskydd och drift — men **två kritiska hål**
gör att systemet i nuläget inte bör betraktas som produktionssäkert mot en aktiv
angripare:

1. **Hela backend-API:t är öppet** (ingen `ADMIN_API_KEY` + `allUsers` + CORS `*`).
2. **SSRF** i de server-side URL-hämtningarna → kan nå GCP-metadata och **stjäla
   service-kontots token** = full projekt-kompromiss.

Resten är hanterbart (webhook-signatur, XML-parsing, headers, rate limiting,
logg-PII). Admin-**UI:t** är redan korrekt skyddat (Google-login + 4-personers
allowlist) — det var aldrig problemet.

---

## ✅ Det som redan är bra (bevara)

| Område | Status |
|---|---|
| **EU-residens för resonemangsmodeller** | Full kunddata går bara via Vertex AI EU, ingen US-fallback (hård no-op om EU saknas). |
| **Probe-motorer (US) får bara publikt** | Endast bolagsnamn + generisk fråga skickas till GPT/Perplexity/Anthropic — ingen PII/kunddata. |
| **Ingen PII i den publika profilen** | Compilern emitterar bara org-nivå; inga personnamn, inga sociala mätvärden, ingen författare. |
| **Privat uppladdnings-bucket** | LinkedIn-skärmklipp/underlag (PII) ligger i privat bucket, nås bara bakom API:t. |
| **Privat backup-bucket + retention** | Firestore-export veckovis, privat, lifecycle 60 dgr, PITR på. |
| **Secret Manager för allt** | Inga hårdkodade hemligheter; sanering + placeholder-skydd vid laddning. |
| **GDPR-radering** | `delete_client` + `delete_employee` rensar Firestore + CDN + uppladdningar + körspår; källösa claims städas. |
| **XSS-säker rendering** | Profilsidans HTML `html.escape`:ar allt; JSON-LD via `json.dumps`. |
| **Bounded crawl** | Sid-tak (200), storleks-tak, paginering-tak → ingen oändlig loop. |
| **Admin-UI bakom login** | NextAuth + Google + mejl-allowlist (guswes/josefin/benjamin/erik). |

---

## 🔴 Kritiska fynd

### C1 — Backend-API:t är helt öppet
`ADMIN_API_KEY` är osatt på den deployade servicen → `ApiKeyMiddleware` släpper
igenom **allt** (`auth.py:37`). Servicen är dessutom `allUsers` och CORS `*`. Vem som
helst på internet kan idag:
- **Läsa** hela kundregistret, full kundkonfig, månadsrapporter (`/api/reports/.../html`
  = fullständig riskanalys), kostnadsdata, inbox.
- **Skriva/radera**: `DELETE /api/clients/{id}` (raderar hel kund + CDN + underlag),
  `DELETE …/employees/{id}`, `POST /api/onboard`, godkänna/avvisa claims, ändra
  connectors/konfig.
- **Trigga dyra jobb**: `POST /api/jobs/{scrape-active,polling,warmth-probes,esg-monthly,…}`
  → kostnads-DoS (LLM-anrop per kund).

**Varför det är allvarligt för oss/kunden:** persondata exponerad utan auth =
GDPR-incident; raderingsmakt = sabotage; jobb-triggers = okontrollerad GCP-kostnad.

**Rätt fix (icke-trivial — kräver design):** admin-UI:t anropar backend *direkt från
webbläsaren*, så en `NEXT_PUBLIC`-nyckel hamnar i publik JS och skyddar inte. Lösning:
**server-side proxy** i Next (`/api/graph/*`) som kollar NextAuth-sessionen +
allowlist och vidarebefordrar med en **server-only** nyckel → backend sätter
`ADMIN_API_KEY`. **Blockerare:** delningslänken `/api/reports/{id}/{month}/html` är en
direkt, oautentiserad backend-länk → kräver ett **publikt share-token** för att inte
brytas. (Detaljscope finns; se Plan P1-B.)

### C2 — SSRF → molncred-stöld
Flera server-side-hämtningar tar **kund-kontrollerade URL:er** utan host-validering och
med `follow_redirects=True`:
- `services/delivery_health.py` — `check_snippet_on_site()` hämtar kundens `website`/
  `settings.website.start_url` (infördes i P-C1).
- `services/web_crawl.py` — crawlern följer `start_url` + interna länkar.
- `connectors/rss.py`, `connectors/jobfeed.py` — feed-URL:er.

En kund (eller, p.g.a. C1, vem som helst) kan peka en URL mot
`http://169.254.169.254/…` / `metadata.google.internal` → servern hämtar **service-
kontots access-token** → full projekt-kompromiss (Firestore, buckets, secrets).

**Varför det är allvarligt:** det här är den enda buggen som ensam kan ge total
kontroll över hela molnprojektet — värre än dataläckan i C1.

**Rätt fix:** en delad SSRF-grind före varje server-fetch: slå upp värdnamnet, **neka
privata/link-local/metadata-intervall** (127/8, 10/8, 172.16/12, 192.168/16,
169.254/16, ::1, fd00::/8, `metadata.google.internal`), och **återvalidera varje
redirect-hop** (eller `follow_redirects=False`). Crawlern *måste* kunna hämta
godtyckliga kund-domäner, så det är en **blocklist** (inte allowlist) + DNS-pinning.

### C3 — SendGrid inbound-webhook utan signatur
`POST /api/webhooks/sendgrid` (`routers/webhooks.py`) är publik, **verifierar ingen
signatur** (`sendgrid_webhook_secret` finns men används aldrig) och **skriver
raw_items** ur `to`/`from`/`subject`/`body`. En angripare kan injicera påhittade mejl
→ data-poisoning i kundprofiler. *(Moderering: inbound-parse är inte DNS-kopplat ännu,
så det är inte live — men endpointen är öppen och skriver.)*

**Fix:** verifiera SendGrid-signaturen, **eller** — eftersom vi bytt till Brevo för
*utgående* och inbound inte används — **stäng/guarda endpointen** tills den faktiskt
behövs.

---

## 🟠 Höga fynd

| # | Fynd | Plats | Effekt |
|---|---|---|---|
| H1 | **Ingen rate limiting** | hela API:t | Kostnads-DoS via jobb-triggers; brute force. |
| H2 | **XXE** i XML-parsing (`ET.fromstring`, ej `defusedxml`) | `connectors/rss.py`, `jobfeed.py` | Kund-feed kan läsa filer/intern-SSRF/DoS. |
| H3 | **CORS `*` + `allow_credentials`** + **saknade säkerhetsheaders** (HSTS/CSP/X-Content-Type-Options/X-Frame-Options) | `main.py:24` | Bredare browser-attackyta; gäller även publika profilsidor. |

## 🟡 Medel

| # | Fynd | Plats | Effekt |
|---|---|---|---|
| M1 | **Inga filstorleks-tak** på uppladdning | `routers/attested.py`, `verification.py` | OOM-DoS (admin-only, men öppet via C1). |
| M2 | **`xlrd` (deprek.) + zip-bomb-risk** i xlsx/pdf | `services/attested_ingest.py` | DoS via uppladdad fil. |
| M3 | **PII i loggar** (kund-mejl, inbound to/from/subject) | `notifications.py`, `webhooks.py` | Persondata i Cloud Logging. |
| M4 | **Eventarc-compile-trigger** oautentiserad | `routers/jobs.py` | Compile-DoS. |
| M5 | **Ingen HTTP→HTTPS-redirect** på clean-URL-LB:n | `bootstrap.sh` | `http://profiles…` ger connection refused (UX, ej bypass). |

## ⚪ Låga / noterade
Prompt-injection (mildras av granskning) · ops-webhook-token i query-param (URL-loggar)
· `storage.objectAdmin` något brett · Brevo-nyckeln delades i klartext (**rotera**) ·
`/health` exponerar commit-SHA (försumbart).

---

## Planering & rekommendation

Ordnat efter **risk × hävstång**, inte efter hur det dök upp. Allt utom P1-B är
litet/medel och oberoende.

### P0 — Denna vecka (stoppa blödningen)
- **P0-A · SSRF-grind (C2).** Delad `safe_fetch`-helper (blocklist + DNS-pinning +
  redirect-revalidering); koppla in i delivery_health, web_crawl, rss, jobfeed.
  *Störst enskild risk, ~1 modul + 4 anropsställen. Oberoende av allt annat — gör först.*
- **P0-C · Stäng/guarda SendGrid-webhooken (C3).** Snabbt; signatur eller avstängd.
- **P0-D · XXE + filstorleks-tak (H2, M1).** `defusedxml` + en storlekskoll före
  `file.read()`. Litet och oberoende.

### P1 — Härnäst (största exponeringen, mer jobb)
- **P1-B · Stäng API:t (C1).** Next-server-proxy (session + allowlist) + server-only
  nyckel + `ADMIN_API_KEY` på backend + **share-token** för rapport-delningslänken +
  server/klient-split i `api.ts`. Två samordnade deploys, testas mot kundens
  live-verktyg. *Eget, testat pass — det här är "fix (1)" vi scope:ade.*
- **P1-E · Rate limiting (H1)** på jobb-/webhook-endpoints (slowapi).
- **P1-F · CORS explicit + säkerhetsheaders (H3).**

### P2 — Senare (defense-in-depth)
Logg-redigering av PII (M3) · roll-baserad åtkomst (läs vs admin) · audit-logg ·
HTTP→HTTPS-redirect (M5) · `xlrd`→`openpyxl` (M2) · ops-token→header · SA-roll-trimning
· självbetjänad GDPR-radering i UI.

---

## Vad jag rekommenderar konkret
1. **Börja med P0-A (SSRF) idag** — det är den katastrofala-men-snabba fixen, och den
   städar dessutom upp en sink jag själv införde i P-C1.
2. **Gör P1-B (stäng API:t) som ett eget, testat pass** — störst kunddata-exponering,
   men kräver share-token + samordnad deploy mot kundens live-UI; rusa inte.
3. **Klämm in P0-C/D + P1-E/F** som snabba vinster längs vägen.

Eftersom UI:t redan är team-låst är den **akuta** sannolikheten att någon utnyttjar
C1 lägre (URL:en är inte publikt länkad) — men C2 (SSRF) kräver bara att någon hittar
backend-URL:en i den publika JS:en, så **P0-A bör inte vänta**.

---

# Åtgärdsstatus — uppdaterad 2026-06-08

Allt nedan är **deployat till prod och verifierat** om inget annat anges.

## ✅ Stängt (kritiskt + högt)
- **C2 SSRF (P0-A)** — `services/safe_fetch` (blocklist privata/loopback/link-local/metadata-IP:n,
  schema-allowlist, omvaliderade redirects) inkopplad i delivery_health, web_crawl, rss, jobfeed. *Live.*
- **C3 inbound-webhook** — `/api/webhooks/sendgrid` stängd (säker default: kräver token, tom secret = avvisa allt). *Live.*
- **H2 XXE + M1 filstorlek (P0-D)** — `defusedxml` i rss/jobfeed; `read_capped` (25 MB → 413) på alla uppladdningar. *Live.*
- **C1 öppet API (P1-B)** — backend kräver `ADMIN_API_KEY`; admin-UI:t anropar via en Next-server-proxy
  (`/api/graph`, NextAuth-session + team-allowlist) med server-only nyckel som aldrig når webbläsaren.
  Rapport-delningslänk + bevisarkiv-export routas via proxyn (login-gate:ade). `/api/badge/` publik (kund-embeds).
  Avvisning ger rent **401** (ej 500). *Live & verifierat: anonymt → 401, badge GET → 200, UI funkar.*
- **H1 rate limiting (P1-E)** — slowapi, generöst globalt IP-tak som flood-backstop. *Live.*
- **H3 CORS + headers (P1-F)** — CORS utan credentials-antimönstret; HSTS + X-Content-Type-Options +
  Referrer-Policy + X-Frame-Options DENY (badge undantagen för embeds). *Live.*

## ✅ Stängt (medel/hygien)
- **M3 logg-PII** — `services/log_redact.mask_email` maskerar lokaldelen i e-post i loggar
  (`benjamin@…` → `b***@…`). *Klart.*

## ⏳ Kvarstår — överlämnat (kräver dig eller omsorg)
- **M4 Eventarc-trigger-auth** — `/api/jobs/compile-via-eventarc` är fortsatt publik. Rätt fix = verifiera
  Eventarcs OIDC-token (audience + SA), men en felaktig audience-check **bryter auto-recompile tyst**.
  Görs som eget pass med test mot live-triggern. Rate-limitern ger interim flood-broms. *Ej autonomt.*
- **Brevo-nyckel-rotation** — nyckeln delades i klartext i chatt → generera ny i Brevo, så byter jag secret-versionen. *Kräver dig.*
- **IAM-trimning (SA `storage.objectAdmin`), roll-baserad åtkomst (läs/admin), self-service GDPR-radering,
  HTTP→HTTPS-redirect på LB:n, `xlrd`→annan .xls-läsare, ops-token→header** — P2-backlog, defense-in-depth,
  inget blockerar. Tas löpande.
