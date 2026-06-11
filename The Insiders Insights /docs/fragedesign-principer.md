# Frågedesign-principer (Etapp 5 / F7)

**Datum:** 2026-06-11 · **Ägs av:** frågedesign-programmet (utvecklingsplanens Etapp 5)
**Omfattar:** alla tre frågebatterier — polling-frågor (Share of Voice), risk-frågor
(beslutssäkerhet, människogrindade) och warmth-prober (förtroendegap, 10 personas × 6
dimensioner × neutral/adversariell).

Syftet: ett forskningsbaserat, dokumenterat och över tid optimerat sätt att ställa
frågor om synlighet — inte mallar som råkar ligga i koden.

## Principer (med motivering)

1. **Adversariell parning.** Varje warmth-dimension frågas både neutralt och
   adversariellt; domaren läser båda. Balanserar formuleringsbias — en ensam positiv
   fråga mäter artighet, en ensam negativ mäter misstänksamhet.
2. **Salience-grindning.** "Vet inte" ger låg salience, aldrig lågt betyg. Förhindrar
   att osynlighet bokförs som negativ perception.
3. **Kalibrerade domare.** Median över flera domarkörningar + per-motor-baselines
   (EWMA) som räknar bort motorernas systematiska optimism före gap-beräkning.
4. **Människogrind på riskfrågor.** LLM-genererade frågor körs aldrig skarpt utan
   godkännande. F1-flaggorna (nedan) är granskarens läsanvisning i den grinden.
5. **Kvalitetsflaggning, inte blockering (F1).** `services/question_quality.py`
   flaggar ledande språk: negativ presupposition, superlativ-/ranking-inramning,
   emotiva ord, falsk dikotomi, flerledade frågor, du-tilltal utan företagsnamn.
   Adversariella frågor är AVSIKTLIGT negativt inramade — flaggan gör inramningen
   synlig så att den är ett val, inte en olycka.
6. **Proveniens i datat (F3).** Varje veckoresultat bär `questions_fingerprint`;
   byts mall, substitution eller egna frågor markerar UI:t ett jämförbarhetsbrott
   (samma princip som modellbyten via `models_used`). Trend över ett byte är inte
   en trend.
7. **Kontext åldras (F3).** `measurement_config_updated_at` stämplas vid varje
   konfigändring; >90 dagar orörd kontext flaggas i frågepanelen. En kund som
   pivoterat mäts annars mot fel marknad.
8. **Aldrig medeltala över olika mätinstrument.** Bas-kunskap (training) och
   live-signal (web-RAG) redovisas separat; samma sak gäller språk (sv/en, F4) när
   det införs — citerbarhet är motor- och språkspecifik (GEO-citerbarhetsevidensen).
9. **Kontrollfrågor som referens (F2).** Vid sidan av det ledande-inramade batteriet
   ställs neutralt formulerade kontrollfrågor (`CONTROL_QUESTIONS`) varje vecka.
   Skillnaden i nämn-frekvens = den del av Share of Voice som drivs av frågekonstruktion.
   Kontrollfrågorna poolas ALDRIG in i rubrik-SoV (eget mätinstrument, princip 8) och
   inflationen rapporteras först efter ≥4 veckors underlag (`services/sov_inflation.py`),
   aldrig som en tvärsäker siffra på tunt underlag.

## Kända bias och pågående arbete

- **Ranking-priming i polling-frågorna** ("vilka är de *ledande*…") blåser sannolikt
  upp Share of Voice. Flaggas av F1; **F2 är nu i drift** — neutrala kontrollfrågor
  mäts varje vecka och `services/sov_inflation.py` summerar inflationen över ≥4 veckor
  till en läsanvisning i cockpiten (under Veckovis synlighet). Siffran i rapporten
  väntar tills tillräckligt underlag finns och inramas då som band/insikt, inte rå %.
- **Ingen rotation.** Stabila frågor ger jämförbarhet men missar nyhetsdrivna
  skiften; kvartalsvis mallöversyn med arkiverad motivering är rutinen (F3),
  fingerprintet gör varje byte spårbart.
- **Svenska först.** Engelska varianter (F4) införs som separat mätspår, aldrig
  poolat med svenska. **Polling-spåret är i drift** (`measurement_language` sv/en,
  engelska default-/kontrollfrågemallar, resultat taggat med språk, språk i fingerprint).
  Warmth-proberna (F4b) mäts tills vidare på svenska — engelska kräver författade prober
  + egna per-motor-baselines (språkspecifika), ett eget mätspår som inte poolas.
- **Domarstabilitet (F5) och person-NER-kvalitet i Parity (F6) är i drift** —
  `direction_stable` + full valens-fördelning surfas som konfidensnot; NER-kvalitet
  spåras anonymt (`parity_ner_quality`) med konfidensgrind på könsestimaten.

## Rutin

- Kvartalsvis: mallöversyn + evidensgenomgång (uppdatera detta dokument med datum
  och beslut).
- Varje malländring: arkivera tidigare version + motivering i git (detta dokument
  eller commit-meddelande), verifiera att fingerprint-brottet syns i veckovyn.
- Frågekvalitet följs i output-quality-baselinens månadscheck.

**Ändringslogg**
- 2026-06-11: Första versionen. F1 (kvalitetsramverk) + F3 (fingerprint, staleness)
  i drift; F2 (kontrollfrågor), F4 (sv/en), F5 (domarstabilitet), F6 (NER-audit) kvar.
- 2026-06-11: **F2 i drift** — kontrollfrågor (egen `kontroll`-kategori) mäts varje
  vecka, exkluderas ur rubrik-SoV/per-motor/sentiment/paritet, och inflationen
  summeras över ≥4 veckor (`services/sov_inflation.py`) med underlagsgrind. Visas som
  läsanvisning i cockpiten.
- 2026-06-11: **F5 + F6 + F4 (polling-spåret) i drift.** F5: domarstabilitet
  (`direction_stable`, `valence_runs`) → konfidensnot. F6: anonymt NER-kvalitetsaggregat
  + konfidensgrind (`CONFIDENT_BEARERS`). F4: `measurement_language` sv/en med engelska
  fråge-/kontrollmallar, taggat resultat, språk i fingerprint. Kvar: F4b (engelska
  warmth-prober + en-baselines) + inflationssiffran in i rapporten när underlaget vuxit.
