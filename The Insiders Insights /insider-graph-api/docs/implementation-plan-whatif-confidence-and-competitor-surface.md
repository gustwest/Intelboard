# Implementationsplan: #1a What-if (beslutssäkerhet) + #2 Konkurrent-yta per kategori

Skriven 2026-06-08. Förankrad i nuvarande kod. Båda byggena är medvetet small-scope och
respekterar matvaliditets-principerna (P0–P8): visa aldrig en rörelse mindre än brusbandet.

---

## #1a — What-if på beslutssäkerheten ("om vi löser/publicerar X → vart rör sig talet")

### Mål
Innan operatören åtgärdar en risk (publicerar en korrigering/proof-point) ska hen se den
**projicerade** beslutssäkerheten: "72 → 75" plus det projicerade brusbandet och om rörelsen
överstiger bandet. Plus en separat **täcknings-lever**: "ni är kapade vid 74 tills tredje
personan mäts — då låses +21 i tak upp".

### Varför detta är litet och defensibelt
Beslutssäkerheten är en **ren, linjär formel** (`monthly_report.py:204`):
`score = round(min(100·safe/total, ceiling))`, `safe = total − antal_öppna_findings`.
Varje löst finding ger alltså exakt **+100/total** poäng tills taket. Taket är 95 vid full
persona-täckning, annars 74 (`monthly_report.py:206`, `COVERAGE_CEILING`). Brusbandet
(`_confidence_score_se`, rad 172) krymper när findings löses — robusta fynd (detection_rate=1)
bidrar 0, vingliga dominerar. What-if är alltså att köra **samma** funktion igen med en
filtrerad finding-lista → noll datakostnad, noll modelldrift.

### Backend-ändringar

**1. Surfa finding-id i render-modellen** — `services/monthly_report.py:128`
Idag slängs doc-id: `findings = [d for _i, d in fs.iter_risk_findings(client_id)]`.
Ändra till att behålla id så what-if vet vilka findings som kan lösas:
```python
findings = []
for fid, d in fs.iter_risk_findings(client_id):
    d["_id"] = fid
    findings.append(d)
```
Lägg även `"id": d.get("_id")` i `_finding_row` (rad 336) så `detected[]` i rapporten/UI
bär id:t (idag saknas det helt — UI:t kan inte peka ut en specifik risk att simulera).

**2. Ny ren projektionsfunktion** — `services/monthly_report.py` (efter `_decision_confidence`)
```python
def project_confidence(
    open_findings: list[dict],
    answers_by_persona: dict[str, int],
    *,
    resolve_ids: set[str] | None = None,
    simulate_persona_answers: dict[str, int] | None = None,
) -> dict[str, Any]:
    """What-if: beslutssäkerhet om vissa findings löses och/eller täckning breddas.

    Återanvänder _decision_confidence rakt av (ingen parallell formel → ingen drift).
    'after' = formeln med de lösta findingsen borttagna + ev. simulerad persona-täckning.
    """
    resolve_ids = resolve_ids or set()
    before = _decision_confidence(open_findings, answers_by_persona)
    kept = [f for f in open_findings if f.get("_id") not in resolve_ids]
    abp = dict(answers_by_persona)
    for p, n in (simulate_persona_answers or {}).items():
        abp[p] = abp.get(p, 0) + n
    after = _decision_confidence(kept, abp)
    delta = (after["score"] - before["score"]) if (after["score"] is not None and before["score"] is not None) else None
    band = before.get("score_se")  # rörelsen bedöms mot NUVARANDE band
    return {
        "before": before,
        "after": after,
        "delta": delta,
        # matvaliditets-grindar: rörelse < band = inte en trovärdig rörelse än
        "exceeds_band": (delta is not None and band is not None and abs(delta) >= 1.96 * band),
        "ceiling_unlocked": after.get("ceiling", 0) - before.get("ceiling", 0),
    }
```

**3. Nytt endpoint** — `routers/forecast.py` (ny fil, monteras i `main.py` som övriga routers)
```python
@router.post("/{client_id}/confidence/whatif")
def whatif_confidence(client_id: str, body: WhatIfRequest) -> dict[str, Any]:
    # body: { resolve_finding_ids: list[str], simulate_third_persona: bool }
    # 1. ladda findings (samma normalisering som build_report_model rad 128–134)
    # 2. ladda answers_by_persona från risk_run_summary_doc (rad 136–138)
    # 3. simulate_persona_answers: vid simulate_third_persona, fyll otäckta personas
    #    med medianantal svar från de täckta (så taket går 74→95 i simuleringen)
    # 4. return monthly_report.project_confidence(...)
```
Validera 404 på klient som i `recipes.py:49`.

### Frontend-ändringar
Ankaret är **Granska-fliken / detected-risks-listan** (där korrigeringar redan görs via
`review.py` risk-action-flödet) och beslutssäkerhets-kortet i cockpiten
(`polling/_components/RiskLoop.tsx` + `Panels.tsx`, som redan renderar `decision_confidence`).

1. I risk-action-drawern: när operatören väljer "agera" på en risk, anropa
   `POST /forecast/{cid}/confidence/whatif` med `resolve_finding_ids:[denna]` och visa
   **"Beslutssäkerhet: 72 → 75 (±band)"**. Om `exceeds_band=false` → grå-tona och skriv
   "inom felmarginalen — effekten syns först efter mätning" (samma språk som SoV-trend, P1).
2. Multi-select: "om du löser dessa 3 → 72 → 80". Linjärt, så summan är trivial att förhandsvisa.
3. **Täcknings-levern** som egen rad i beslutssäkerhets-kortet: om `covered_personas < 3`,
   visa "Mät tredje personan → taket höjs 74 → 95 (+21 möjliga)". Detta är den minst
   uppenbara och mest värdefulla insikten — idag kapas talet tyst vid 74.

### Matvaliditets-grindar (icke förhandlingsbart)
- Visa aldrig en projicerad delta som < 1.96·band som en "rörelse" — märk den som brus.
- Respektera taket: findings utöver `headroom` ger ingen poäng → visa "redan vid taket".
- Det är en **deterministisk projektion av formeln, inte en empirisk prognos** — formulera
  i UI som "om dessa räknas som lösta blir talet X", inte "talet kommer bli X".

### Tester — `tests/test_forecast.py` (ny)
- Linjäritet: lösa 1 av N findings → +round(100/total), kapat vid ceiling.
- Tak-lever: `simulate_third_persona` höjer ceiling 74→95 och kan lyfta score.
- Band: löser vingligt fynd (dr≈0.5) krymper band mer än robust (dr=1).
- exceeds_band: delta under bandet → false.
- Redan vid taket → delta 0.

### Insats
~1 vecka. Backend ~1,5 dag (funktion + endpoint + id-surfning + tester), frontend ~2 dagar
(drawer-integration, kort-rad, brus-grindning), QA ~0,5 dag.

### Öppna beslut
- **Recept→finding-koppling saknas** (ingen `finding_id` i `recipes.py`). v1 är därför
  **finding-nivå** ("om denna risk löses"), inte "om detta recept körs". Recept-nivå kräver
  en heuristisk mappning (gap_type/dimension/persona → harm/persona) som är opålitlig — lägg
  som senare steg, inte v1. Detta matchar ändå användarens ram (korrigering/proof-point ≈ en
  åtgärdad risk).

---

## #2 — Konkurrent-kontext per kategori som egen analytisk yta

### Mål
Lyft dagens hopfällda CategoryRow-drilldown ("Vilka AI nämner istället",
`WeeklyVisibility.tsx:300–315`) till en egen yta: vem äger berättelsen per kategori **över tid**,
var är gapet störst, och vilka konkurrenter är återkommande/på uppgång.

### Vad som redan finns (stor genväg)
Rådata finns **redan veckovis och skeppas redan till frontend**:
- `category_competitors: {kategori: [{name, mentions, share}]}` beräknas i
  `polling.py:589–607` och persisteras (`polling.py:664`-trakten).
- `GET /api/polling/{client_id}` returnerar upp till 12 veckors `category_competitors`
  (`routers/polling.py:154`). Typen `Competitor` finns (`_shared.tsx:170`).
- 4 fasta kategorier (`clients.py:31`: affar/finans/innovation/hr) → strukturellt jämförbart.

Det betyder att **MVP-ytan kan byggas nästan helt på frontend** ur redan levererad `weeks[]` —
ingen ny datapipeline krävs för v1.

### Den obekväma sanningen (måste hanteras, P-konsistens)
Konkurrent-NER körs **bara på representativa svar (run_idx=0)** för att inte multiplicera
LLM-kostnaden (`polling.py:562–564, 593`). Konkurrentsiffrorna är alltså **n≈1** — de har
*inte* fått den upprepade samplingen som SoV fick (P0). En naken "konkurrent över tid"-kurva
ärver alltså obekräftat brus, precis det n=1-fel hela backloggen rättade. Två vägar:

- **Väg A (billig, ärlig):** Behåll extraktion på reps. Bygg ytan men (a) släta över ≥2–3
  veckor innan en konkurrent-trend ritas som riktning, och (b) skriv en upplysning
  "konkurrentandelar mäts på ett svar per fråga, inte upprepat — läs som riktning, inte exakt"
  (speglar kund-mejlets metodruta, `monthly_report.py:76`).
- **Väg B (dyr, exakt):** Kör org-NER på alla körningar och beräkna ett run-to-run-band per
  konkurrent (återanvänd `_runtorun_se`-mönstret, `polling.py:542`). Kostar ~7× org-NER-anrop.

**Rekommendation: Väg A för v1.** Bygg ytan på befintlig data + tydlig disclosure; höj till
Väg B bara om en kund faktiskt fattar beslut på en enskild konkurrent-rörelse.

### Backend-ändringar (minimala för v1)
v1 behöver inget nytt endpoint — datan finns i `weeks[]`. Lägg endast en **read-time
rollup-helper** om vi vill avlasta klienten (valfritt):
`routers/polling.py` → ny `GET /{client_id}/competitors` som ur lagrade veckor bygger:
```python
{
  "categories": {
    "affar": {
      "leaderboard": [{name, avg_share, weeks_present, trend: "up|down|flat", spark:[...]}],
      "client_share_series": [...],      # er egen SoV i kategorin per vecka
      "largest_gap": {competitor, gap}, # top-konkurrent minus er andel
    }, ...
  },
  "cross_category": [                     # vilka aktörer äger flera kategorier
    {name, categories:[...], categories_count, avg_share}
  ],
}
```
Trend = jämför senaste fönstret mot föregående; **grå-tona om skillnaden < smoothing-tröskel**
(samma princip som `sov_trend.significant`). Återanvänd inte SoV:s binomial-SE här (fel modell
för n=1) — använd en enkel "minst K veckors närvaro + min delta"-grind.

### Frontend-ändringar
Ny flik/yta "Konkurrenter" bredvid AI-synlighet (`polling/page.tsx`):
1. **Kategori-väljare** (4 fasta) → per kategori:
   - Konkurrent-leaderboard över valt fönster (återanvänd `CompetitorBar`, `WeeklyVisibility.tsx:320`).
   - Gap-vy: er andel vs top-konkurrent (er rad highlightad som idag, rad 306).
   - Tidsserie per konkurrent (återanvänd `Sparkline` som redan finns i samma fil).
2. **Cross-category-matris:** aktörer (rader) × 4 kategorier (kolumner), cell = andel — visar
   vem som äger flera berättelser.
3. **Disclosure-ruta** (Väg A): konkurrentandelar = ett svar per fråga, läs som riktning.

CategoryRow-drilldownen i AI-synlighet behålls som "snabbtitt"; nya ytan är djupdyket.

### Tester
- Backend rollup: `tests/test_polling.py` — leaderboard-sortering, trend-grindning under
  tröskel = "flat", cross-category-aggregat, tom-data → tomma listor (inte krasch).
- Frontend: snapshot på leaderboard + matris med fixtur-veckor.

### Insats
~1 vecka för Väg A. Frontend ~3 dagar (ny flik, leaderboard, matris, sparklines —
återanvänder befintliga komponenter), backend rollup ~1 dag (valfritt), QA ~0,5 dag.
Väg B (uppsamplad mätning) är +0,5–1 vecka och +löpande LLM-kostnad — separat beslut.

### Öppna beslut
- Väg A vs B (mätrigorositet vs kostnad) — rekommendation A.
- Server-side rollup-endpoint vs ren klient-beräkning ur `weeks[]` — börja klient-side,
  flytta till endpoint bara om prestanda kräver.
```
