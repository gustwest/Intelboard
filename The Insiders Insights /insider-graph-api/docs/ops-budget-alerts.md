# Budget alerts — engångskonfiguration

GCP-budgetar konfigureras på **billing account**-nivå (inte projekt) och kräver
roller som `bootstrap.sh` inte kör med (`billing.user` / `billing.admin`). Därför
sätts de manuellt en gång. Tar ~3 min i konsolen.

## Mål

Förhindra runaway-spending (buggig LLM-loop, infinite retry, glömt jobb) från att
nå en oväntad slutsumma. Vid 50 kunder bör månadskostnaden ligga inom storleksordning
$500–$1500 (Cloud Run + Firestore + Vertex + Bright Data). Sätt budget tydligt över
det, och alerta på trösklar **innan** vi skenar.

## Konfiguration

1. **Konsol → Billing → Budgets & alerts → CREATE BUDGET**
2. Scope:
   - **Projects:** välj `${PROJECT_ID}`
   - **Services:** lämna tomt (all spend)
3. Budget amount:
   - **Type:** *Specified amount*
   - **Target:** börja på **$2 000/månad** (justera när kostnadsbilden för 50
     kunder är känd; lägre vid pilot, högre när alla connectors är på)
4. Threshold rules (alert vid procent av budget):
   - **50%** — actual spend, email
   - **80%** — actual spend, email
   - **100%** — actual spend, email
   - **120%** — *forecasted* spend, email (vakna innan vi når den)
5. Notifications:
   - **Email alerts to billing admins:** valfritt — kan vara av om man föredrar
     att se alerts i systemets inbox.
   - **Pub/Sub topic:** ✅ **välj `ops-budget-alerts`** (skapas av `bootstrap.sh`
     §7f). `/api/webhooks/ops-alerts` lyssnar och översätter trösklarna till
     ops_alerts-rader som syns i inboxen. Verifieras via query-param `?token=...`
     mot `OPS_WEBHOOK_TOKEN` — se till att den env-variabeln är satt på Cloud Run
     innan budgeten kopplas in.
   - **Notification channels (Cloud Monitoring):** behövs inte här; för
     uptime-larm används `NOTIFY_EMAIL` i `bootstrap.sh` separat.

## Hård kostnadsgräns (frivillig, defensiv)

Budget-alerts är *advisory* — de slår inte av spenderingen. För faktisk gräns:

- Lägg en **Cloud Function** (kan automatiseras senare) som lyssnar på
  budget-Pub/Sub-meddelandet vid `100% forecasted` och avaktiverar dyra APIs
  (`aiplatform`, `run`) tillfälligt. Se
  https://cloud.google.com/billing/docs/how-to/notify
- Alternativ: dagligt cap via quota override i `aiplatform.googleapis.com`.
  Säkrare än Cloud Function men trubbigt — kan stänga av riktiga kunder.

För 50 kunder räcker **alerts + våra egna timeouts** (risk_detector,
polling — alla LLM-anrop är timeout-skyddade på 8–60s, så ingen loop kan brännas
i mer än en jobb-körning).

## Verifiering

- Sätt budget till t.ex. **$1** under en helg, lägg in din email, vänta på
  alert-mejlet. Återställ.
- Eller skapa en parallell **testbudget** på $0.01 i en stund — alerts kommer
  direkt och bekräftar att kanalen fungerar.

## Återkommande review

- En gång per kvartal: bekräfta att budgeten matchar faktisk kund-volym × 1.5x.
- När en ny tung connector (Bright Data-dataset, nytt LLM-anrop) går live: höj
  proaktivt så vi inte triggar 80%-alert dag 3 i månaden av "normal" spend.
