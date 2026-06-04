# Persona-modell (Fas 2.1)

Beslutad design för per-persona-projektion, mätning och receptmotor.
Detta dokument är **kontraktet** — innan koden rör persona-relaterade
fält, läs härifrån. Ändringar i designen kräver beslut, inte en patch.

---

## 1. Filosofi

Personor är en **operatörs-UX-abstraktion** och en **mätaxel** — inte en
retrieval-mekanism för AI-motorer. AI-motorer hämtar på intent, inte
persona. Personor ger oss:

1. **Mätning** — gruppera probe-data så vi kan upptäcka när olika
   målgrupper uppfattar kunden olika (gap-typen `persona_mismatch`).
2. **Operatör-UX** — segmentera handlings-listan ("för kandidater: gör X").
3. **Recept-routing** — olika kanaler är effektiva för olika personor
   (Glassdoor för kandidat, case study för kund, pressmeddelande för investerare).

Vi gör **inte** separata `llms-customer.txt` / `llms-candidate.txt` på CDN.
Vi gör **en kanonisk** `llms.txt` med audience-sektioner + Schema.org
`Audience`-markup per claim.

---

## 2. Palett (fast vokabulär — ingen free-form)

10 kuraterade personor. Kunden väljer max **5 aktiva** från paletten.
Inga anpassade personor — bryter cross-customer-benchmarks och ökar
probe-kostnad utan tydligt värde.

| # | id | Label SV | Beskrivning (visas i UI) | Schema.org `audienceType` |
|---|---|---|---|---|
| 1 | `customer` | Kund | Köpare/beslutsfattare av era produkter eller tjänster | `Customer` |
| 2 | `employee` | Anställd & kandidat | Nuvarande personal och potentiella sökande | `Employee` |
| 3 | `investor` | Investerare | Institutionella, privata och retail-investerare | `Investor` |
| 4 | `partner` | Partner | Återförsäljare, integratörer, leverantörer, samarbeten | `BusinessAudience` |
| 5 | `media` | Media | Journalister, branschanalytiker, bloggare | `MediaAudience` |
| 6 | `regulator` | Myndighet | Tillsynsorgan, revisorer, branschorgan | `GovernmentAudience` |
| 7 | `patient` | Patient | Personer som tar emot er vård/behandling (vårdkontext) | `Patient` |
| 8 | `student` | Student | Sökande och alumni (utbildningskontext) | `EducationalAudience` |
| 9 | `donor` | Givare | Filantropi, stiftelser, ideellt engagemang | `Donor` |
| 10 | `citizen` | Medborgare | Politiker, väljare, kommun-/regiondialog (offentlig sektor) | `Citizen` |

**Default vid kund-onboarding:** `customer` + `employee` + `investor`
aktiveras automatiskt. Operatören kan toggla av/på från resterande
palett upp till totalt 5 aktiva.

---

## 3. Persona-datakontrakt

Varje canonical persona är ett komplett paket — inte bara ett namn:

```python
@dataclass(frozen=True)
class CanonicalPersona:
    id: str                            # stabil slug, t.ex. "customer"
    label_sv: str                      # "Kund"
    description_sv: str                # 1-meningsbeskrivning för UI
    schema_audience_type: str          # "Customer", "Employee", ...
    probe_templates: dict[str, tuple[str, str]]
    # ^ per dimension (ethics, wellbeing, ...) → (neutral_q, adversarial_q)
    default_channels: tuple[str, ...]
    # ^ rangordnade kanaler för recipe-motorn vid persona-gap
    is_default: bool                   # True för customer/employee/investor
```

**Probe-templates: handskrivna per (persona × dimension).** Variant A
från diskussionen — autentiska persona-frågor, inte generiska prompter
med persona-prefix. 10 personor × 6 dimensioner × 2 (neutral + adversarial)
= 120 handskrivna prompts i `services/persona_registry.py`. Vi kalibrerar
en gång, alla kunder får nytta.

**Default-kanaler per persona** (för Lager A av receptmotorn):

| Persona | Primära kanaler |
|---|---|
| customer | case study, press, website, RSS |
| employee | Glassdoor, LinkedIn, careers-sida, attesterad upload |
| investor | press, finansiella rapporter, attesterad upload |
| partner | partner-portal, RSS, press, website |
| media | press, RSS, attesterad upload |
| regulator | attesterad upload, press, compliance-sida |
| patient | website, press, vårdguide-portaler |
| student | careers-sida, alumni-stories, LinkedIn |
| donor | annual report, press, transparency-sida |
| citizen | press, transparency-sida, website |

---

## 4. Datamodell-ändringar

### 4.1 Klient-dok

```
clients/{id}.personas = {
  active: ["customer", "employee", "investor"],  // max 5
  updated_at: iso-string
}
```

### 4.2 Claim-modell

`Claim` får ett nytt fält:

```python
audience: tuple[str, ...] = ()
# ^ persona-id:n från paletten. Tom = "alla". Härleds först av
#   persona_derivation (existerande LLM-tjänst) + kan ops-justeras
#   i admin-UI. Schema.org-compilern emitterar Audience-markup baserat
#   på detta fält.
```

### 4.3 Warmth-probes

`polling_results/warmth-latest` får en extra axel:

```python
{
  "dimensions": {
    "wellbeing": {
      "per_persona": {
        "employee":  {"salience": ..., "valence": ..., "by_engine": {...}},
        "customer":  {"salience": ..., "valence": ..., "by_engine": {...}},
        ...
      },
      // Bakåtkompat: aggregerad over personor finns kvar i toppnivå
      "salience": ...,
      "valence": ...,
    }
  }
}
```

### 4.4 Trust-gap-dok

```python
{
  "dimensions": {
    "wellbeing": {
      "per_persona": {
        "employee":  {"credibility_gap": ..., ...},
        "customer":  {"credibility_gap": ..., ...},
      },
      // Aggregat över alla aktiva personor (för bakåtkompat)
      "credibility_gap": ...,
    }
  },
  "flags": [
    // Befintliga typer kvar
    {"kind": "over_claim", "dimension": "ethics", ...},
    // Ny aktiverad typ (var stubbad sedan Fas 1.1):
    {"kind": "persona_mismatch", "dimension": "wellbeing",
     "warmest_persona": "customer", "coolest_persona": "employee",
     "spread": 0.4, ...}
  ]
}
```

---

## 5. `persona_mismatch`-detektion

Aktiverar gap-typen som är stubbad sedan Fas 1.1.

**Logik (mirror av `contradiction` men över persona-axeln):**

```python
# I jobs/compute_trust_gap._detect_flags
eligible = [
    (persona, stats.get("valence"))
    for persona, stats in dim_data.get("per_persona", {}).items()
    if stats.get("valence") is not None
    and stats.get("salience", 0) >= SALIENCE_FLOOR
]
if len(eligible) >= 2:
    vals = [v for _, v in eligible]
    spread = max(vals) - min(vals)
    if spread >= PERSONA_MISMATCH_SPREAD_MIN:  # ny konstant, ~0.3
        # Resa persona_mismatch-flagga
```

Recept-motorns Lager A får en ny regel (`_rule_persona_mismatch`) som
rekommenderar kanaler kopplade till den **coolaste personan**.

---

## 6. Schema.org-projektion

**En kanonisk `llms.txt`**, ej per-persona-filer. Struktur:

```markdown
# {Company Name}

## Om företaget
[evergreen claims, alla personor]

## För kunder
[claims taggade med audience=customer]

## För anställda & kandidater
[claims taggade med audience=employee]

## För investerare
[claims taggade med audience=investor]

...
```

JSON-LD-claimsen behåller en kanonisk lista men varje `Claim` får en
`audience`-property som array av `Audience`-objekt. AI-motorer som tolkar
Schema.org plockar upp det; de som inte gör det förlorar bara markup-
metadatat, inte innehållet.

---

## 7. Tiers (säljmaterial, ej kod-gated)

Dokumenterade här för säljteamets referens. **Kod-gating skippas i Fas 2.1**
— tiers sätts manuellt via `monthly_token_limit` per kund tills vi har
10+ kunder och behöver formal billing-koppling (då tas det in i Fas 4).

| Tier | Aktiva personor | Probe-cadence | Cross-persona-features | `monthly_token_limit` (~USD) |
|---|---|---|---|---|
| **Bas** | 3 (customer + employee + investor) | Veckovis | Per-persona-mätning | $50 |
| **Pro** | 5 fritt valda | Veckovis + on-demand | `persona_mismatch`-flagga, cross-persona-recept | $100 |
| **Enterprise** | Alla 10 (max-cap) | Veckovis + dagligt för prio | Branschbenchmarks, persona-A/B på recept | $200 |

Fas 1.6:s cost-budget-enforcement biter automatiskt — sätter operatören
en Bas-kund i `monthly_token_limit=50_000_000_tokens` och de aktiverar 5
personor får de varning vid 80% och hård spärr vid 100%.

---

## 8. Hård cap + räddningsventiler

- **Max 5 aktiva personor per kund** (frontend-validering + backend-spärr i `clients/{id}.personas`-skrivpath).
- **Cost-budget enforcement** från Fas 1.6 fångar excess persona-cycles i händelse av räddning-bypass.
- **Default-personor (customer/employee/investor) kan aldrig avaktiveras alla samtidigt** — alltid minst 1 aktiv (annars trust_gap-rapporten kan inte renderas meningsfullt).

---

## 9. Vad som *inte* ingår i Fas 2.1

- **Custom personor** — palett-only. Om en kund behöver "shareholder distinkt från investor" får det vara ett designsamtal i framtiden.
- **Per-persona-LLM-detaljifiering** (recept-detaljer per persona) — Lager B i receptmotorn använder samma LLM-prompt, men `default_channels` och `target_personas`-metadata i skelettet skiljer sig per persona-gap.
- **Code-gated tiers** — dokumenterat men inte kod-håll. Senare arbete.
- **Persona-A/B på recept** — Enterprise-tier feature, byggs när det finns Enterprise-kunder.

---

## 10. Implementationssteg (Fas 2.1)

| Steg | Vad | Effort |
|---|---|---|
| 2.1a | `services/persona_registry.py` med palett, dataklasser, 120 probe-templates | ~3 dagar |
| 2.1b | `Claim.audience`-fält + `persona_derivation` uppdaterad att tagga claims | ~2 dagar |
| 2.1c | `warmth_probes` kör per persona, lagrar `per_persona`-struktur | ~2 dagar |
| 2.1d | `compute_trust_gap` aggregerar per-persona, reser `persona_mismatch` | ~2 dagar |
| 2.1e | `gap_recipes._rule_persona_mismatch` + persona-aware kanaler i andra regler | ~1 dag |
| 2.1f | `schema_org/compiler` emitterar `Audience`-markup + `llms.txt` får sektioner | ~2 dagar |
| 2.1g | Frontend: `AudiencePrioritiesEditor` byter till palett-väljare + persona-filter i TrustGapCockpit | ~3 dagar |
| Tester + verifiering | | ~2 dagar |

Total: ~17 dagar (~3.5 veckor) — något längre än ursprunglig estimat
(2 veckor) p.g.a. de 120 handskrivna probe-templates. Värt det:
kalibreringen är engångskostnad, signal-kvaliteten beror på den.

---

**Dokumentversion:** 1.0 · 2026-06-03
