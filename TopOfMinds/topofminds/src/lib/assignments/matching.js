import 'server-only';
import prisma from '@/lib/prisma';
import { runPipelineStep } from '@/lib/ai/runner';
import { PIPELINE_STEPS } from '@/lib/ai/provider';
import { parseJsonFromResponse } from '@/lib/ai/json-parse';
import { pLimit } from '@/lib/ai/concurrency';

const MATCH_SYSTEM_PROMPT = `Du är en erfaren konsultchef som matchar konsulter mot uppdrag. Din uppgift är att ge en nyanserad bedömning hur väl en specifik konsultprofil matchar ett givet uppdrag.

Svara ALLTID med enbart ett JSON-objekt, ingen markdown. Schema:

{
  "score": number (0-100, helhetsbedömning),
  "matchedSkills": string[] (krav från uppdraget som konsulten uppfyller),
  "missingSkills": string[] (krav konsulten saknar),
  "strengths": string[] (2-4 korta bullets varför konsulten passar),
  "concerns": string[] (0-3 korta bullets om risker eller luckor),
  "recommendation": "STRONG_MATCH" | "GOOD_MATCH" | "POSSIBLE" | "POOR",
  "summary": string (1-2 meningar på svenska, varför denna score)
}

Poängsättningsguide:
- 85-100 STRONG_MATCH: alla skallkrav uppfyllda, stark branscherfarenhet, rätt senioritet
- 70-84 GOOD_MATCH: nästan alla skallkrav, relevant erfarenhet
- 50-69 POSSIBLE: några skallkrav saknas men konsulten kan fylla rollen med inlärning
- 0-49 POOR: saknar grundkrav

Väg också in:
- Konsultens intresseområden och lärointressen (soft boost)
- Tillgänglighet och wantsNewAssignment
- Språkkrav
- Tidigare branscherfarenhet (industry)`;

function consultantProfileText(c) {
  const lines = [];
  lines.push(`Namn: ${c.firstName} ${c.lastName}`);
  if (c.title) lines.push(`Titel: ${c.title}`);
  if (c.team) lines.push(`Team: ${c.team}`);
  if (c.status) lines.push(`Tillgänglighet: ${c.status}${c.wantsNewAssignment ? ' (öppen för nya uppdrag)' : ''}`);
  if (c.skills) lines.push(`Skills: ${tryParseArrayToText(c.skills)}`);
  if (c.industryExpertise) lines.push(`Branscherfarenhet: ${tryParseArrayToText(c.industryExpertise)}`);
  if (c.certifications) lines.push(`Certifieringar: ${tryParseCertsToText(c.certifications)}`);
  if (c.languages) lines.push(`Språk: ${tryParseLanguagesToText(c.languages)}`);
  if (c.interests) lines.push(`Intresseområden: ${c.interests}`);
  if (c.developmentGoals) lines.push(`Vill lära sig: ${c.developmentGoals}`);
  if (c.bio) lines.push(`Om: ${c.bio.slice(0, 600)}`);
  if (c.experience) lines.push(`Erfarenhet (sammanfattad):\n${tryParseExperienceToText(c.experience)}`);
  return lines.join('\n');
}

function tryParseArrayToText(v) {
  try {
    const arr = JSON.parse(v);
    return Array.isArray(arr) ? arr.join(', ') : String(v);
  } catch {
    return String(v);
  }
}

function tryParseCertsToText(v) {
  try {
    const arr = JSON.parse(v);
    if (!Array.isArray(arr)) return String(v);
    return arr.map((c) => (c?.name ? `${c.name}${c.year ? ` (${c.year})` : ''}` : String(c))).join(', ');
  } catch {
    return String(v);
  }
}

function tryParseLanguagesToText(v) {
  try {
    const arr = JSON.parse(v);
    if (!Array.isArray(arr)) return String(v);
    return arr.map((l) => `${l.language || l}${l.level ? ` (${l.level})` : ''}`).join(', ');
  } catch {
    return String(v);
  }
}

function tryParseExperienceToText(v) {
  try {
    const arr = JSON.parse(v);
    if (!Array.isArray(arr)) return String(v).slice(0, 1500);
    return arr
      .slice(0, 8)
      .map((e) => `- ${e.customer || e.company || ''} | ${e.role || ''} | ${e.period || ''}: ${(e.description || '').slice(0, 220)}`)
      .join('\n');
  } catch {
    return String(v).slice(0, 1500);
  }
}

function assignmentText(a) {
  const lines = [];
  lines.push(`Titel: ${a.title}`);
  if (a.clientName) lines.push(`Kund: ${a.clientName}`);
  if (a.industry) lines.push(`Bransch: ${a.industry}`);
  if (a.seniority) lines.push(`Senioritet: ${a.seniority}`);
  if (a.location) lines.push(`Plats: ${a.location}`);
  if (a.startDate || a.endDate) {
    const s = a.startDate ? new Date(a.startDate).toLocaleDateString('sv-SE') : '?';
    const e = a.endDate ? new Date(a.endDate).toLocaleDateString('sv-SE') : '?';
    lines.push(`Period: ${s} → ${e}`);
  }
  const req = tryParseArrayToText(a.requiredSkills || '[]');
  if (req && req !== '[]') lines.push(`Skallkrav: ${req}`);
  const pref = tryParseArrayToText(a.preferredSkills || '[]');
  if (pref && pref !== '[]') lines.push(`Meriterande: ${pref}`);
  const lang = tryParseArrayToText(a.languageRequirements || '[]');
  if (lang && lang !== '[]') lines.push(`Språkkrav: ${lang}`);
  lines.push('');
  lines.push('Beskrivning:');
  lines.push(a.description);
  return lines.join('\n');
}

async function matchOne({ assignment, consultant, userId }) {
  const messages = [
    { role: 'system', content: MATCH_SYSTEM_PROMPT },
    {
      role: 'user',
      content:
        `UPPDRAG:\n${assignmentText(assignment)}\n\n` +
        `KONSULT:\n${consultantProfileText(consultant)}`,
    },
  ];

  const result = await runPipelineStep({
    pipelineStep: PIPELINE_STEPS.MATCHING,
    messages,
    assignmentId: assignment.id,
    consultantId: consultant.id,
    userId,
  });

  const parsed = parseJsonFromResponse(result.text);
  return {
    score: Math.max(0, Math.min(100, Math.round(parsed.score ?? 0))),
    matchedSkills: Array.isArray(parsed.matchedSkills) ? parsed.matchedSkills : [],
    missingSkills: Array.isArray(parsed.missingSkills) ? parsed.missingSkills : [],
    strengths: Array.isArray(parsed.strengths) ? parsed.strengths : [],
    concerns: Array.isArray(parsed.concerns) ? parsed.concerns : [],
    recommendation: parsed.recommendation || null,
    summary: parsed.summary || null,
    modelId: result.modelId,
    jobId: result.jobId,
  };
}

export async function runMatchingForAssignment({ assignmentId, consultantIds, userId, concurrency = 5 }) {
  const assignment = await prisma.assignment.findUnique({ where: { id: assignmentId } });
  if (!assignment) throw new Error(`Assignment not found: ${assignmentId}`);

  const consultants = await prisma.consultant.findMany({
    where: consultantIds?.length ? { id: { in: consultantIds } } : {},
    orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
  });

  console.log(`[matching] start assignmentId=${assignmentId} title="${assignment.title}" consultants=${consultants.length} concurrency=${concurrency}`);

  if (consultants.length === 0) {
    console.warn(`[matching] no consultants found — returning early`);
    return { matches: [], errors: [] };
  }

  const results = await pLimit(consultants, concurrency, async (consultant) => {
    try {
      const match = await matchOne({ assignment, consultant, userId });
      console.log(`[matching] ok consultantId=${consultant.id} name="${consultant.firstName} ${consultant.lastName}" score=${match.score} recommendation=${match.recommendation}`);
      return { consultantId: consultant.id, ok: true, match };
    } catch (error) {
      console.error(`[matching] failed consultantId=${consultant.id} name="${consultant.firstName} ${consultant.lastName}" error="${error?.message || error}"`);
      return { consultantId: consultant.id, ok: false, error: error?.message || String(error) };
    }
  });

  const successes = results.filter((r) => r?.ok);
  const errors = results.filter((r) => r && !r.ok);

  // Persist matches (upsert so reruns replace older matches)
  await Promise.all(
    successes.map((r) =>
      prisma.assignmentMatch.upsert({
        where: { assignmentId_consultantId: { assignmentId, consultantId: r.consultantId } },
        create: {
          assignmentId,
          consultantId: r.consultantId,
          score: r.match.score,
          matchedSkills: JSON.stringify(r.match.matchedSkills),
          missingSkills: JSON.stringify(r.match.missingSkills),
          strengths: JSON.stringify(r.match.strengths),
          concerns: JSON.stringify(r.match.concerns),
          summary: r.match.summary,
          recommendation: r.match.recommendation,
          modelId: r.match.modelId,
          jobId: r.match.jobId,
        },
        update: {
          score: r.match.score,
          matchedSkills: JSON.stringify(r.match.matchedSkills),
          missingSkills: JSON.stringify(r.match.missingSkills),
          strengths: JSON.stringify(r.match.strengths),
          concerns: JSON.stringify(r.match.concerns),
          summary: r.match.summary,
          recommendation: r.match.recommendation,
          modelId: r.match.modelId,
          jobId: r.match.jobId,
        },
      }),
    ),
  );

  // Mark assignment as MATCHED if any matches succeeded
  if (successes.length > 0) {
    await prisma.assignment.update({
      where: { id: assignmentId },
      data: { status: 'MATCHED' },
    });
  }

  if (errors.length > 0) {
    console.error(`[matching] ${errors.length} consultant(s) failed for assignmentId=${assignmentId}:`);
    for (const e of errors) {
      console.error(`  consultantId=${e.consultantId} error="${e.error}"`);
    }
  }
  console.log(`[matching] done assignmentId=${assignmentId} successes=${successes.length} errors=${errors.length}`);

  return {
    matchesCount: successes.length,
    errorsCount: errors.length,
    errors,
  };
}
