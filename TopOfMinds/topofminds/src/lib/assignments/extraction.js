import 'server-only';
import { runPipelineStep } from '@/lib/ai/runner';
import { PIPELINE_STEPS } from '@/lib/ai/provider';
import { parseJsonFromResponse } from '@/lib/ai/json-parse';

const EXTRACTION_SYSTEM_PROMPT = `Du är en assistent som extraherar strukturerad data om konsultuppdrag från mail skickade av konsultmäklare (ofta på svenska, ibland engelska).

Svara ALLTID med enbart ett JSON-objekt, inget annat. Ingen markdown, ingen förklarande text före eller efter. Använd null för fält som saknas.

Schema:
{
  "title": string (kort beskrivande titel),
  "clientName": string | null (slutkund),
  "brokerName": string | null (mäklaren/konsultbolaget som skickade),
  "brokerEmail": string | null,
  "location": string | null ("Remote", "Stockholm", "Hybrid – Stockholm 3d/v", etc.),
  "startDate": string | null (ISO 8601 YYYY-MM-DD),
  "endDate": string | null (ISO 8601 YYYY-MM-DD),
  "applicationDeadline": string | null (ISO 8601 YYYY-MM-DD eller ISO datetime),
  "estimatedHours": number | null,
  "rateMin": number | null (SEK),
  "rateMax": number | null (SEK),
  "rateType": "HOURLY" | "MONTHLY" | "FIXED" | null,
  "requiredSkills": string[] (måste-krav — tekniker, metoder, erfarenhet),
  "preferredSkills": string[] (meriterande),
  "languageRequirements": string[] ("Svenska", "Engelska", etc.),
  "industry": string | null,
  "seniority": "JUNIOR" | "MID" | "SENIOR" | null,
  "category": string (klassificering — välj exakt EN: "Backend", "Frontend", "Fullstack", "DevOps/Cloud", "Data/BI", "AI/ML", "Projektledning", "Arkitektur", "Testning/QA", "Infrastruktur/Nätverk", "SAP/ERP", "Säkerhet", "Agile/Scrum", "UX/Design", "Management", "Övrigt IT", "Ej IT"),
  "description": string (sammanfattad men komplett beskrivning av uppdraget, 2-5 meningar),
  "extractionConfidence": number (0.0-1.0, hur säker du är),
  "extractionNotes": string | null (om något var otydligt eller gissade)
}

Viktigt:
- Extrahera krav som de är listade i mailet, översätt inte skills
- Om uppdraget är på engelska, håll skills på engelska
- Om pris anges i timpris -> HOURLY, per månad -> MONTHLY, fast pris -> FIXED
- Gissa inte datum som inte står i mailet, returnera null
- Klassificera alltid med "category" baserat på uppdragets primära kompetensområde`;

export async function extractAssignmentFromEmail({ emailBody, emailSubject, userId }) {
  const userContent = [
    emailSubject ? `Ämne: ${emailSubject}` : null,
    '',
    'Mailinnehåll:',
    emailBody,
  ]
    .filter((l) => l !== null)
    .join('\n');

  const result = await runPipelineStep({
    pipelineStep: PIPELINE_STEPS.EMAIL_EXTRACTION,
    messages: [
      { role: 'system', content: EXTRACTION_SYSTEM_PROMPT },
      { role: 'user', content: userContent },
    ],
    userId,
  });

  let parsed;
  try {
    parsed = parseJsonFromResponse(result.text);
  } catch (e) {
    throw new Error(`Model returned non-JSON response: ${e.message}`);
  }

  return { data: parsed, jobId: result.jobId, modelId: result.modelId };
}
