import 'server-only';
import prisma from '@/lib/prisma';
import { runPipelineStep } from '@/lib/ai/runner';
import { PIPELINE_STEPS } from '@/lib/ai/provider';

const CV_SYSTEM_PROMPT = `Du är en erfaren konsultchef som skriver skräddarsydda CV-utdrag på svenska (om inte uppdraget är på engelska – då på engelska). Du skriver professionellt, sakligt och marknadsför konsultens styrkor utan överdrifter.

Uppgift: Skriv ett CV-utkast som lyfter fram konsultens bakgrund på ett sätt som är relevant för det specifika uppdraget. Betona matchande skills, relevant branscherfarenhet, liknande tidigare uppdrag och certifieringar.

Struktur:
1. "Sammanfattning" — 3-5 meningar om konsultens profil, skräddarsydd mot uppdraget
2. "Relevanta kompetenser" — punktlista med 6-10 skills som är mest relevanta för uppdraget
3. "Utvalda uppdrag" — 3-5 tidigare uppdrag mest relevanta för detta, i formatet: **Kund | Roll | Period**\\nKort beskrivning fokuserad på aspekter som matchar uppdraget
4. "Certifieringar" — relevanta certifieringar med år

Ton: Sakligt, trovärdigt, inte för säljigt. Skriv i tredje person ("hen", "konsulten" eller med namn).
Format: Ren markdown.
Längd: 400-700 ord.
Hitta inte på fakta som inte finns i underlaget. Om något är oklart – utelämna det hellre än att gissa.`;

export async function generateTailoredCv({ assignmentId, consultantId, userId }) {
  const [assignment, consultant] = await Promise.all([
    prisma.assignment.findUnique({ where: { id: assignmentId } }),
    prisma.consultant.findUnique({ where: { id: consultantId } }),
  ]);
  if (!assignment) throw new Error(`Assignment not found: ${assignmentId}`);
  if (!consultant) throw new Error(`Consultant not found: ${consultantId}`);

  const profile = formatConsultant(consultant);
  const job = formatAssignment(assignment);

  const result = await runPipelineStep({
    pipelineStep: PIPELINE_STEPS.CV_GENERATION,
    messages: [
      { role: 'system', content: CV_SYSTEM_PROMPT },
      {
        role: 'user',
        content: `UPPDRAGSBESKRIVNING:\n${job}\n\n===\n\nKONSULTPROFIL (full data):\n${profile}`,
      },
    ],
    assignmentId,
    consultantId,
    userId,
  });

  return { cvText: result.text, modelId: result.modelId, jobId: result.jobId };
}

function safeArrayParse(v) {
  if (!v) return [];
  try {
    const a = JSON.parse(v);
    return Array.isArray(a) ? a : [];
  } catch {
    return [];
  }
}

function formatConsultant(c) {
  const lines = [];
  lines.push(`Namn: ${c.firstName} ${c.lastName}`);
  if (c.title) lines.push(`Titel: ${c.title}`);
  if (c.team) lines.push(`Team: ${c.team}`);
  if (c.bio) lines.push(`\nBio:\n${c.bio}`);
  const skills = safeArrayParse(c.skills);
  if (skills.length) lines.push(`\nSkills:\n- ${skills.join('\n- ')}`);
  const industries = safeArrayParse(c.industryExpertise);
  if (industries.length) lines.push(`\nBranscherfarenhet:\n- ${industries.join('\n- ')}`);
  const certs = safeArrayParse(c.certifications);
  if (certs.length) {
    lines.push(
      `\nCertifieringar:\n${certs.map((ce) => `- ${ce.name}${ce.year ? ` (${ce.year})` : ''}`).join('\n')}`,
    );
  }
  const langs = safeArrayParse(c.languages);
  if (langs.length) {
    lines.push(`\nSpråk:\n${langs.map((l) => `- ${l.language}${l.level ? ` (${l.level})` : ''}`).join('\n')}`);
  }
  const edu = safeArrayParse(c.education);
  if (edu.length) {
    lines.push(`\nUtbildning:\n${edu.map((e) => `- ${typeof e === 'string' ? e : JSON.stringify(e)}`).join('\n')}`);
  }
  const exp = safeArrayParse(c.experience);
  if (exp.length) {
    lines.push(
      `\nUppdragshistorik (full):\n${exp
        .map(
          (e) =>
            `- ${e.customer || e.company || ''} | ${e.role || ''} | ${e.period || ''}\n  ${e.description || ''}`,
        )
        .join('\n')}`,
    );
  }
  const emp = safeArrayParse(c.employmentHistory);
  if (emp.length) {
    lines.push(`\nAnställningshistorik:\n${emp.map((e) => `- ${e.company} | ${e.role} | ${e.period}`).join('\n')}`);
  }
  if (c.interests) lines.push(`\nIntresseområden: ${c.interests}`);
  if (c.developmentGoals) lines.push(`Vill lära sig: ${c.developmentGoals}`);
  return lines.join('\n');
}

function formatAssignment(a) {
  const lines = [];
  lines.push(`Titel: ${a.title}`);
  if (a.clientName) lines.push(`Kund: ${a.clientName}`);
  if (a.industry) lines.push(`Bransch: ${a.industry}`);
  if (a.location) lines.push(`Plats: ${a.location}`);
  if (a.seniority) lines.push(`Senioritet: ${a.seniority}`);
  const req = safeArrayParse(a.requiredSkills);
  if (req.length) lines.push(`\nSkallkrav:\n- ${req.join('\n- ')}`);
  const pref = safeArrayParse(a.preferredSkills);
  if (pref.length) lines.push(`\nMeriterande:\n- ${pref.join('\n- ')}`);
  lines.push(`\nBeskrivning:\n${a.description}`);
  return lines.join('\n');
}
