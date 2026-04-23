#!/usr/bin/env node
// Seed realistic Swedish IT consultant assignments via the intake webhook.
//
// Usage:
//   INTAKE_URL=http://localhost:3000 INTAKE_SECRET=xxx node scripts/seed-assignments.mjs
//   INTAKE_URL=https://topofminds-abc.run.app INTAKE_SECRET=xxx node scripts/seed-assignments.mjs
//
// Flags:
//   --match      Also trigger matching after each intake
//   --only=N     Only seed the first N assignments

const INTAKE_URL = process.env.INTAKE_URL || 'http://localhost:3000';
const INTAKE_SECRET = process.env.INTAKE_SECRET;

if (!INTAKE_SECRET) {
  console.error('Missing INTAKE_SECRET env var. Set it to the value of INTAKE_WEBHOOK_SECRET on the server.');
  process.exit(1);
}

const args = process.argv.slice(2);
const runMatching = args.includes('--match');
const onlyArg = args.find((a) => a.startsWith('--only='));
const onlyN = onlyArg ? parseInt(onlyArg.split('=')[1], 10) : null;

const ASSIGNMENTS = [
  {
    subject: 'Konsultförfrågan – Senior React-utvecklare till Skatteverket',
    body: `Hej,

Skatteverket söker en senior frontend-utvecklare för vidareutveckling av deras e-tjänster riktade mot medborgare och företag. Uppdraget är en del av ett större digitaliseringsprogram.

Kund: Skatteverket
Ort: Solna (hybrid, 2–3 dagar/vecka på plats)
Startdatum: 2026-05-15
Slutdatum: 2027-05-14 (med option på 12 månaders förlängning)
Omfattning: 100 %
Sista ansökningsdag: 2026-04-30

Skallkrav:
- Minst 7 års erfarenhet som frontend-utvecklare
- Djup kompetens inom React (18+) och TypeScript
- Erfarenhet av Next.js
- Erfarenhet av tillgänglighet enligt WCAG 2.1 AA
- Svenska, flytande i tal och skrift

Meriterande:
- Erfarenhet från offentlig sektor
- Kunskap om Figma och komponentbibliotek
- GraphQL
- Jest / Playwright

Arvode: 950–1100 kr/h beroende på profil.

Uppdraget kräver godkänd säkerhetsprövning (SUA nivå 2).

Skicka gärna CV och kort motivering till mig senast 30 april.

Vänliga hälsningar,
Anna Lindqvist
Ework Group AB
anna.lindqvist@eworkgroup.com
+46 70 123 45 67`,
  },
  {
    subject: 'DevOps/Platform Engineer – Volvo Cars (Göteborg)',
    body: `Hej!

Vi på Kvadrat söker en erfaren DevOps/Platform Engineer för ett strategiskt uppdrag hos Volvo Cars i Göteborg. Kunden bygger en ny intern utvecklarplattform som ska serva ca 1500 utvecklare globalt.

Slutkund: Volvo Cars
Plats: Göteborg (hybrid, 3 dagar/vecka på plats minimum)
Period: 2026-06-01 till 2027-12-31 (18 månader)
Omfattning: heltid (40 h/vecka)
Timpris: upp till 1200 SEK/h

Måste:
- 5+ års erfarenhet av Kubernetes i produktion
- Stark i Terraform och GitOps (ArgoCD eller Flux)
- AWS (EKS, IAM, VPC) alt. Azure
- Observability-stack: Prometheus, Grafana, OpenTelemetry
- CI/CD – GitHub Actions eller GitLab CI

Bra att ha:
- Service mesh (Istio/Linkerd)
- Policy-as-code (OPA, Kyverno)
- Erfarenhet av automotive/fordonsindustri
- Engelska i tal och skrift (arbetsspråk)

Deadline ansökan: 2026-05-05

Vi matchar kandidater löpande så skicka gärna underlag så snart som möjligt.

Hälsningar,
Jonas Berg
Senior Account Manager, Kvadrat AB
jonas.berg@kvadrat.se`,
  },
  {
    subject: 'Agile Coach / SAFe RTE till Swedbank',
    body: `Hej,

Swedbank förstärker sin agila transformation och söker en erfaren Agile Coach med förmåga att agera som Release Train Engineer (RTE) för ett SAFe-tåg med 6 team (~70 personer) inom område Betaltjänster.

Kund: Swedbank
Plats: Sundbyberg (Stockholm), 2 dagar/vecka på kontoret, resten remote OK
Start: snarast, senast 2026-06-02
Längd: 6 månader med option på förlängning
Omfattning: 100 %

Krav:
- Minst 5 års erfarenhet som Agile Coach och/eller RTE
- Certifiering SAFe RTE eller SPC
- Praktisk erfarenhet av att leda PI Planning
- Erfarenhet från bank/finans eller annan reglerad bransch
- Svenska flytande

Meriterande:
- LeSS- eller Disciplined Agile-erfarenhet
- Facilitering av större workshops (50+)
- Coaching av chefsled

Takpris: 1450 SEK/h

Intervjuer sker vecka 19. Förfrågan stänger 2026-05-06.

Mvh
Kristina Nyström
Sigma IT Consulting
kristina.nystrom@sigma.se
073-441 22 10`,
  },
  {
    subject: 'Backend-utvecklare Java/Kotlin – Skanska',
    body: `Hejsan,

Skanska söker en backend-utvecklare till sitt nya produktteam som bygger digitala byggplats-verktyg. Ni får jobba i ett tvärfunktionellt team med produktägare, designers och devops.

Kund: Skanska Sverige AB
Ort: Solna (hybrid, minst 2 dagar/vecka på plats)
Startdatum: 2026-05-19
Slutdatum: 2027-02-28
Uppskattad omfattning: ca 1400 timmar under perioden
Sista svar: 2026-04-28

Obligatoriska krav:
- Minst 4 års erfarenhet som backend-utvecklare
- Java 17+ och Spring Boot
- PostgreSQL
- REST API-design
- Docker och CI/CD

Önskvärt:
- Kotlin
- Kafka eller annan event-baserad arkitektur
- AWS (ECS, RDS, S3)
- Erfarenhet av domain-driven design

Prisram: 850–950 SEK/timme.

Kort CV plus 2–3 referensuppdrag räcker initialt.

Med vänlig hälsning
Patrik Sundén
Nexer Group
patrik.sunden@nexergroup.com`,
  },
  {
    subject: 'Data Engineer till Klarna – Python/dbt/Snowflake',
    body: `Hi / Hej,

Klarna is scaling its Data Platform team and we're looking for a senior Data Engineer on behalf of them. Communication can be in English or Swedish.

End customer: Klarna Bank AB
Location: Stockholm (Södermalm), hybrid 2 days/week on site
Start: as soon as possible, latest 2026-06-15
Duration: 12 months with option to extend
Scope: 100 %
Rate ceiling: 1100 SEK/h

Must-have:
- 5+ years as Data Engineer
- Expert in Python and SQL
- Production experience with dbt
- Snowflake or BigQuery
- Airflow or similar orchestrator
- English, fluent

Nice-to-have:
- Experience with real-time streaming (Kafka, Flink)
- Machine learning pipelines (Feature stores)
- FinTech or regulated industry
- Swedish

Application deadline: 2026-05-10.

Please send CV + short cover letter to me.

Best regards,
Mikael Åberg
Dfind IT (Randstad)
mikael.aberg@dfind.se
+46 70 884 12 33`,
  },
  {
    subject: 'UX-designer / Service Designer – Försäkringskassan',
    body: `Hej!

Försäkringskassan söker en senior UX-designer med tjänstedesign-kompetens för att bidra till omarbetningen av flödet för föräldrapenning. Uppdraget är en del av myndighetens kundresa-satsning.

Kund: Försäkringskassan
Plats: Stockholm (Telefonplan), hybrid ~50 %
Start: 2026-06-09
Slut: 2026-12-19 (6 månader)
Omfattning: 80–100 %

Skallkrav:
- Minst 6 års erfarenhet som UX-designer
- Dokumenterad erfarenhet av tjänstedesign / service design
- Erfarenhet av att leda workshops (dubbeldiamant, customer journey mapping)
- Figma på expertnivå
- Svenska (myndighetsspråk, klarspråk)
- Tillgänglighet WCAG

Meriterande:
- Erfarenhet från offentlig sektor eller större myndighet
- Kvalitativa användarintervjuer
- Prototyping med realistiska data
- Erfarenhet av att jobba enligt offentlig upphandling

Arvode: 1050 SEK/h (takpris enligt ramavtal).

Uppdraget kräver registerkontroll.

Sista ansökningsdag: 2026-05-02. Skicka CV + 2 case/arbetsprover.

Hälsningar,
Lena Forsberg
Experis IT
lena.forsberg@experis.se`,
  },
];

const toSeed = onlyN ? ASSIGNMENTS.slice(0, onlyN) : ASSIGNMENTS;

console.log(`\n→ Target: ${INTAKE_URL}`);
console.log(`→ Assignments to seed: ${toSeed.length}${runMatching ? ' (with matching)' : ''}\n`);

const url = new URL('/api/assignments/intake', INTAKE_URL);
url.searchParams.set('secret', INTAKE_SECRET);
if (runMatching) url.searchParams.set('runMatching', '1');

let ok = 0, failed = 0;
for (let i = 0; i < toSeed.length; i++) {
  const { subject, body } = toSeed[i];
  const label = `[${i + 1}/${toSeed.length}] ${subject}`;
  process.stdout.write(`${label}\n  → posting... `);

  const started = Date.now();
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ emailSubject: subject, emailBody: body }),
    });
    const elapsed = ((Date.now() - started) / 1000).toFixed(1);
    const data = await res.json().catch(() => ({}));

    if (res.ok) {
      console.log(`✓ ${elapsed}s  assignmentId=${data.assignmentId}`);
      ok++;
    } else {
      console.log(`✗ ${res.status}  ${data.error || res.statusText}`);
      failed++;
    }
  } catch (e) {
    console.log(`✗ nätverksfel: ${e.message}`);
    failed++;
  }
}

console.log(`\nKlart. Lyckade: ${ok}  Misslyckade: ${failed}\n`);
process.exit(failed > 0 ? 1 : 0);
