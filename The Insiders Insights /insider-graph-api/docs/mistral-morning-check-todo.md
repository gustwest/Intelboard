# Ops-TODO: Mistral-morgontest (2026-06-05)

**Kontext**: Mistral Medium 3 gick från 404 → 400 FAILED_PRECONDITION efter att Subscribe
påbörjades 2026-06-04. Det betyder modellen är hittad men billing-/subscription-
preconditionen inte helt propagerad. Testa imorgon bitti om den hunnit aktiveras.

**Projekt**: `round-plating-480321-j7` · **Service-account**: `insider-graph-sa@...`

## Steg 1 — testa om Mistral svarar nu (~2 min)

```bash
TOKEN=$(gcloud auth print-access-token)
curl -s -w "\nHTTP %{http_code}\n" -X POST \
  "https://europe-west4-aiplatform.googleapis.com/v1beta1/projects/round-plating-480321-j7/locations/europe-west4/endpoints/openapi/chat/completions" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"model":"mistralai/mistral-medium-3","messages":[{"role":"user","content":"säg OK"}],"max_tokens":10}'
```

**Tolkning**:
- **HTTP 200** med JSON-svar → ✅ aktiverad! Gå till Steg 2.
- **HTTP 400 FAILED_PRECONDITION** → fortfarande inte klar. Kolla i Console att
  Mistral Medium 3 har en aktiv subscription kopplad till faktureringskontot
  (Model Garden → Mistral Medium 3 → verifiera "Subscribed"-status). Vänta ev. fler
  timmar för propagering.
- **HTTP 404** → subscriben tappades. Gör om Subscribe-steget.

## Steg 2 — om 200: flippa Mistral till live (~2 min)

I `insider-graph-api/services/llm.py`, hitta `PROBE_ENGINE_REGISTRY` och Mistral-raden:

```python
{"id": model_registry.get_id("probe_mistral"), "label": "Mistral Le Chat",
 "vendor": "Mistral AI (Vertex MaaS)", "status": "planned",   # ← ändra till "live"
 "note": "..."},   # ← sätt note till None
```

Ändra `"status": "planned"` → `"status": "live"` och `"note"` → `None`. Pusha:

```bash
cd "The Insiders Insights" && git add insider-graph-api/services/llm.py
git commit -m "feat(geogiraph): aktivera Mistral-probe (subscription klar)"
git push origin main
```

Verifiera efter deploy (~5 min):
```bash
curl -s "https://insider-graph-api-6fqkbpmhrq-lz.a.run.app/api/polling/engine-health?force=true" \
  | python3 -c "import json,sys; [print(e['id'], e['status'], e.get('ok')) for e in json.load(sys.stdin)['engines']]"
```
Mistral ska visa `live True`.

## Steg 3 — om INTE 200 efter rimlig väntan: pausa Mistral

Enligt Gustavs beslut: fungerar den inte, sätt på paus och jobba med de 4 som funkar
(Claude, Gemini, ChatGPT, Perplexity). Inget kod-ändring krävs — Mistral är redan
`"planned"` och skippas tyst i polling. Lämna den så tills Mistral-supporten löser
sin sida, eller tills vi prioriterar deras direkt-API (api.mistral.ai, kräver nyckel).

## Bakgrund
- Mistral är EU-baserad probe-motor (Le Chat) — extra-värde för EU-marknadskunder.
- Inte blockerande: 4/5 probarna är live och levererar mätdata (verifierat polling
  2026-W23: alla 4 körde, konkurrent-extraktion fungerar).
- Diagnostik-historik: se `docs/claude-mistral-activation-todo.md`.
