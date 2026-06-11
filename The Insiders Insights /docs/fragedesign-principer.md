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

## Kända bias och pågående arbete

- **Ranking-priming i polling-frågorna** ("vilka är de *ledande*…") blåser sannolikt
  upp Share of Voice. Flaggas nu av F1; **F2** kvantifierar inflationen med
  kontrollfrågor utan branschinramning (≥4 veckors A/B) och resultatet blir en
  läsanvisning i cockpit + rapport.
- **Ingen rotation.** Stabila frågor ger jämförbarhet men missar nyhetsdrivna
  skiften; kvartalsvis mallöversyn med arkiverad motivering är rutinen (F3),
  fingerprintet gör varje byte spårbart.
- **Svenska först.** Engelska varianter (F4) införs som separat mätspår, aldrig
  poolat med svenska.
- **Domarstabilitet** (F5) och **person-NER-kvalitet i Parity** (F6) återstår.

## Rutin

- Kvartalsvis: mallöversyn + evidensgenomgång (uppdatera detta dokument med datum
  och beslut).
- Varje malländring: arkivera tidigare version + motivering i git (detta dokument
  eller commit-meddelande), verifiera att fingerprint-brottet syns i veckovyn.
- Frågekvalitet följs i output-quality-baselinens månadscheck.

**Ändringslogg**
- 2026-06-11: Första versionen. F1 (kvalitetsramverk) + F3 (fingerprint, staleness)
  i drift; F2 (kontrollfrågor), F4 (sv/en), F5 (domarstabilitet), F6 (NER-audit) kvar.
