import { getCurrentUser } from '@/lib/auth/dal';
import { isAdmin } from '@/lib/auth/roles';
import { getAccessToken, getVertexConfig } from '@/lib/ai/vertex-auth';
import prisma from '@/lib/prisma';
import { generateTailoredCv } from '@/lib/assignments/cv';

const CHAT_MODEL = process.env.CHAT_MODEL || 'claude-sonnet-4-6';
const MAX_ITERATIONS = 8;

// ── Tool definitions ────────────────────────────────────────────────────────

const TOOLS = [
  {
    name: 'list_assignments',
    description: 'Lista uppdragsförfrågningar med mäklare, kund, deadline och matchningsstatus.',
    input_schema: {
      type: 'object',
      properties: {
        status: { type: 'string', description: 'NEW | MATCHED | SENT | CLOSED | ARCHIVED' },
        limit: { type: 'number', description: 'Max antal resultat (default 10)' },
      },
    },
  },
  {
    name: 'get_assignment',
    description: 'Hämta ett specifikt uppdrag med alla krav och toppkandidater.',
    input_schema: {
      type: 'object',
      properties: { assignment_id: { type: 'string' } },
      required: ['assignment_id'],
    },
  },
  {
    name: 'get_matches',
    description: 'Hämta alla konsultmatchningar för ett uppdrag med score, styrkor, luckor och motivering.',
    input_schema: {
      type: 'object',
      properties: {
        assignment_id: { type: 'string' },
        min_score: { type: 'number', description: 'Minsta matchningspoäng 0–100' },
      },
      required: ['assignment_id'],
    },
  },
  {
    name: 'list_consultants',
    description: 'Lista konsulter, filtrera på tillgänglighet eller kompetensord.',
    input_schema: {
      type: 'object',
      properties: {
        availability: { type: 'string', description: 'AVAILABLE | ON_CONTRACT | ON_LEAVE' },
        skill: { type: 'string', description: 'Filtrera på kompetensord, t.ex. "SAFe", "Python"' },
      },
    },
  },
  {
    name: 'get_consultant',
    description: 'Hämta komplett profil för en konsult: skills, erfarenhet, certifieringar, tillgänglighet.',
    input_schema: {
      type: 'object',
      properties: { consultant_id: { type: 'string' } },
      required: ['consultant_id'],
    },
  },
  {
    name: 'update_consultant',
    description: 'Uppdatera en konsults profilattribut. Används för att spara data från importerade CV:n eller manuella ändringar. Array-fält (skills, certifications, languages, industryExpertise, experience) skickas som arrayer.',
    input_schema: {
      type: 'object',
      properties: {
        consultant_id: { type: 'string' },
        fields: {
          type: 'object',
          description: 'Fält att uppdatera.',
          properties: {
            firstName: { type: 'string' },
            lastName: { type: 'string' },
            title: { type: 'string' },
            email: { type: 'string' },
            phone: { type: 'string' },
            bio: { type: 'string' },
            hourlyRate: { type: 'number' },
            status: { type: 'string', description: 'AVAILABLE | ON_CONTRACT | ON_LEAVE' },
            wantsNewAssignment: { type: 'boolean' },
            team: { type: 'string' },
            skills: { type: 'array', items: { type: 'string' } },
            certifications: { type: 'array', items: { type: 'string' } },
            languages: { type: 'array', items: { type: 'string' } },
            industryExpertise: { type: 'array', items: { type: 'string' } },
            experience: { type: 'array', description: 'Lista av {customer, role, period, description}' },
            interests: { type: 'string' },
            developmentGoals: { type: 'string' },
          },
        },
      },
      required: ['consultant_id', 'fields'],
    },
  },
  {
    name: 'update_contract',
    description: 'Uppdatera ett kontrakts attribut som arvode, datum, timmar, status etc. Används vid import av kontraktsdokument.',
    input_schema: {
      type: 'object',
      properties: {
        contract_id: { type: 'string' },
        fields: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            description: { type: 'string' },
            startDate: { type: 'string', description: 'ISO-datum YYYY-MM-DD' },
            endDate: { type: 'string', description: 'ISO-datum YYYY-MM-DD' },
            rate: { type: 'number' },
            rateType: { type: 'string', description: 'HOURLY | MONTHLY | FIXED' },
            estimatedHours: { type: 'number' },
            status: { type: 'string', description: 'DRAFT | ACTIVE | EXPIRING_SOON | EXPIRED | RENEWED | TERMINATED' },
            renewalNoticeDays: { type: 'number' },
            notes: { type: 'string' },
          },
        },
      },
      required: ['contract_id', 'fields'],
    },
  },
  {
    name: 'list_clients',
    description: 'Lista alla kunder i systemet.',
    input_schema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'generate_cv',
    description: 'Generera ett skräddarsytt CV för en konsult mot ett specifikt uppdrag. Sparas automatiskt.',
    input_schema: {
      type: 'object',
      properties: {
        assignment_id: { type: 'string' },
        consultant_id: { type: 'string' },
      },
      required: ['assignment_id', 'consultant_id'],
    },
  },
];

// ── Tool implementations ────────────────────────────────────────────────────

function safeJson(v) {
  if (!v) return null;
  try { return JSON.parse(v); } catch { return v; }
}

const JSON_CONSULTANT_FIELDS = new Set(['skills', 'certifications', 'languages', 'industryExpertise', 'experience']);

async function executeTool(name, input, userId) {
  switch (name) {
    case 'list_assignments': {
      const rows = await prisma.assignment.findMany({
        where: input.status ? { status: input.status } : undefined,
        orderBy: { createdAt: 'desc' },
        take: Math.min(input.limit || 10, 20),
        include: {
          _count: { select: { matches: true, applications: true } },
          matches: { select: { score: true }, orderBy: { score: 'desc' }, take: 1 },
        },
      });
      return rows.map((a) => ({
        id: a.id,
        title: a.title,
        broker: a.brokerName,
        client: a.clientName,
        location: a.location,
        startDate: a.startDate?.toISOString().slice(0, 10),
        deadline: a.applicationDeadline?.toISOString().slice(0, 10),
        status: a.status,
        matchCount: a._count.matches,
        topScore: a.matches[0]?.score ?? null,
        applications: a._count.applications,
      }));
    }

    case 'get_assignment': {
      const a = await prisma.assignment.findUnique({
        where: { id: input.assignment_id },
        include: {
          matches: {
            include: { consultant: { select: { id: true, firstName: true, lastName: true, title: true, status: true } } },
            orderBy: { score: 'desc' },
            take: 10,
          },
          _count: { select: { applications: true } },
        },
      });
      if (!a) return { error: 'Uppdrag hittades inte' };
      return {
        id: a.id,
        title: a.title,
        broker: a.brokerName,
        brokerEmail: a.brokerEmail,
        client: a.clientName,
        industry: a.industry,
        location: a.location,
        seniority: a.seniority,
        startDate: a.startDate?.toISOString().slice(0, 10),
        endDate: a.endDate?.toISOString().slice(0, 10),
        deadline: a.applicationDeadline?.toISOString().slice(0, 10),
        rateMin: a.rateMin,
        rateMax: a.rateMax,
        rateType: a.rateType,
        requiredSkills: safeJson(a.requiredSkills),
        preferredSkills: safeJson(a.preferredSkills),
        languageRequirements: safeJson(a.languageRequirements),
        description: a.description?.slice(0, 1200),
        status: a.status,
        applications: a._count.applications,
        topMatches: a.matches.map((m) => ({
          consultantId: m.consultantId,
          name: `${m.consultant.firstName} ${m.consultant.lastName}`,
          title: m.consultant.title,
          score: m.score,
          recommendation: m.recommendation,
          summary: m.summary,
          availability: m.consultant.status,
        })),
      };
    }

    case 'get_matches': {
      const matches = await prisma.assignmentMatch.findMany({
        where: {
          assignmentId: input.assignment_id,
          ...(input.min_score != null ? { score: { gte: input.min_score } } : {}),
        },
        include: {
          consultant: { select: { id: true, firstName: true, lastName: true, title: true, status: true, wantsNewAssignment: true } },
        },
        orderBy: { score: 'desc' },
      });
      return matches.map((m) => ({
        consultantId: m.consultantId,
        name: `${m.consultant.firstName} ${m.consultant.lastName}`,
        title: m.consultant.title,
        availability: m.consultant.status,
        wantsNewAssignment: m.consultant.wantsNewAssignment,
        score: m.score,
        recommendation: m.recommendation,
        summary: m.summary,
        strengths: safeJson(m.strengths),
        concerns: safeJson(m.concerns),
        matchedSkills: safeJson(m.matchedSkills),
        missingSkills: safeJson(m.missingSkills),
      }));
    }

    case 'list_consultants': {
      const where = {};
      if (input.availability) where.status = input.availability;
      if (input.skill) where.skills = { contains: input.skill };
      const rows = await prisma.consultant.findMany({
        where,
        take: 25,
        orderBy: { firstName: 'asc' },
        select: {
          id: true, firstName: true, lastName: true, title: true, team: true,
          status: true, wantsNewAssignment: true, skills: true, industryExpertise: true, email: true,
        },
      });
      return rows.map((c) => ({
        id: c.id,
        name: `${c.firstName} ${c.lastName}`,
        email: c.email,
        title: c.title,
        team: c.team,
        availability: c.status,
        wantsNewAssignment: c.wantsNewAssignment,
        skills: safeJson(c.skills)?.slice(0, 10),
        industries: safeJson(c.industryExpertise)?.slice(0, 5),
      }));
    }

    case 'get_consultant': {
      const c = await prisma.consultant.findUnique({ where: { id: input.consultant_id } });
      if (!c) return { error: 'Konsult hittades inte' };
      return {
        id: c.id,
        name: `${c.firstName} ${c.lastName}`,
        email: c.email,
        title: c.title,
        team: c.team,
        availability: c.status,
        wantsNewAssignment: c.wantsNewAssignment,
        bio: c.bio?.slice(0, 600),
        skills: safeJson(c.skills),
        industries: safeJson(c.industryExpertise),
        certifications: safeJson(c.certifications),
        languages: safeJson(c.languages),
        interests: c.interests,
        developmentGoals: c.developmentGoals,
        experience: safeJson(c.experience)?.slice(0, 6)?.map((e) => ({
          customer: e.customer || e.company,
          role: e.role,
          period: e.period,
          description: (e.description || '').slice(0, 200),
        })),
      };
    }

    case 'update_consultant': {
      const { consultant_id, fields } = input;
      if (!consultant_id || !fields) return { error: 'consultant_id och fields krävs' };

      const data = {};
      for (const [key, value] of Object.entries(fields)) {
        if (value === undefined || value === null) continue;
        if (JSON_CONSULTANT_FIELDS.has(key)) {
          data[key] = Array.isArray(value) ? JSON.stringify(value) : String(value);
        } else if (key === 'hourlyRate') {
          data[key] = parseFloat(value);
        } else {
          data[key] = value;
        }
      }

      if (Object.keys(data).length === 0) return { error: 'Inga fält att uppdatera' };

      try {
        const updated = await prisma.consultant.update({ where: { id: consultant_id }, data });
        return { ok: true, updated: Object.keys(data), name: `${updated.firstName} ${updated.lastName}` };
      } catch (e) {
        return { error: e.message };
      }
    }

    case 'update_contract': {
      const { contract_id, fields } = input;
      if (!contract_id || !fields) return { error: 'contract_id och fields krävs' };

      const data = {};
      for (const [key, value] of Object.entries(fields)) {
        if (value === undefined || value === null) continue;
        if (key === 'startDate' || key === 'endDate') {
          data[key] = new Date(value);
        } else if (key === 'rate') {
          data[key] = parseFloat(value);
        } else if (key === 'estimatedHours' || key === 'renewalNoticeDays') {
          data[key] = parseInt(value, 10);
        } else {
          data[key] = value;
        }
      }

      if (Object.keys(data).length === 0) return { error: 'Inga fält att uppdatera' };

      try {
        const updated = await prisma.contract.update({ where: { id: contract_id }, data });
        return { ok: true, updated: Object.keys(data), title: updated.title };
      } catch (e) {
        return { error: e.message };
      }
    }

    case 'list_clients': {
      const clients = await prisma.client.findMany({
        orderBy: { name: 'asc' },
        select: { id: true, name: true, contactPerson: true, contactEmail: true },
      });
      return clients;
    }

    case 'generate_cv': {
      try {
        const { cvText } = await generateTailoredCv({
          assignmentId: input.assignment_id,
          consultantId: input.consultant_id,
          userId,
        });
        await prisma.application.upsert({
          where: { assignmentId_consultantId: { assignmentId: input.assignment_id, consultantId: input.consultant_id } },
          create: { assignmentId: input.assignment_id, consultantId: input.consultant_id, status: 'DRAFT_CV', tailoredCv: cvText },
          update: { tailoredCv: cvText, status: 'DRAFT_CV' },
        });
        return {
          ok: true,
          preview: cvText.slice(0, 600) + (cvText.length > 600 ? '\n\n[…se fullständigt CV i matchningspanelen]' : ''),
        };
      } catch (e) {
        return { error: e.message };
      }
    }

    default:
      return { error: `Okänt verktyg: ${name}` };
  }
}

function toolSummary(name, result) {
  if (result?.error) return `Fel: ${result.error}`;
  switch (name) {
    case 'list_assignments': return `${Array.isArray(result) ? result.length : 0} uppdrag hämtade`;
    case 'get_assignment': return result.title ? `Hämtade: ${result.title}` : 'Uppdrag hämtat';
    case 'get_matches': return `${Array.isArray(result) ? result.length : 0} matchningar`;
    case 'list_consultants': return `${Array.isArray(result) ? result.length : 0} konsulter`;
    case 'get_consultant': return result.name ? `Profil: ${result.name}` : 'Profil hämtad';
    case 'update_consultant': return result.ok ? `Uppdaterade ${result.name}: ${result.updated?.join(', ')}` : 'Misslyckades';
    case 'update_contract': return result.ok ? `Uppdaterade: ${result.updated?.join(', ')}` : 'Misslyckades';
    case 'list_clients': return `${Array.isArray(result) ? result.length : 0} kunder`;
    case 'generate_cv': return result.ok ? 'CV genererat och sparat' : 'Misslyckades';
    default: return 'Klar';
  }
}

async function buildSystemPrompt(context) {
  const lines = [
    'Du är en AI-assistent inbyggd i TopOfMinds — ett konsultresurshanteringssystem.',
    '',
    'Du hjälper konsultchefer att:',
    '- Analysera uppdragsförfrågningar och bedöma vilka konsulter som passar',
    '- Förstå matchningsresultat och vad som saknas för en perfekt matchning',
    '- Sätta ihop starka, skräddarsydda CV:n och svar till mäklare',
    '- Hitta rätt kompetens bland konsulterna för specifika uppdrag',
    '- Importera och spara data från bifogade CV:n och kontrakt',
    '',
    'Använd verktyg proaktivt för att hämta aktuell data — gissa inte på ID:n, sök istället.',
    'När användaren bifogar ett dokument: extrahera all relevant information och använd update_consultant/update_contract för att spara den direkt. Fråga om saker som är oklara eller saknas.',
    'Svara på svenska om inget annat begärs. Var konkret. Använd tabeller och listor när det passar bättre än löptext.',
  ];

  if (context?.assignmentId) {
    lines.push('', `Användaren tittar på uppdrag-ID: ${context.assignmentId}. Hämta det direkt med get_assignment om du behöver detaljer.`);
  }

  if (context?.consultantId) {
    lines.push('', `Aktiv konsult-ID: ${context.consultantId}.`);
    try {
      const c = await prisma.consultant.findUnique({
        where: { id: context.consultantId },
        select: {
          firstName: true, lastName: true, title: true, email: true, status: true,
          skills: true, bio: true, hourlyRate: true, wantsNewAssignment: true,
        },
      });
      if (c) {
        lines.push(
          `Konsult: ${c.firstName} ${c.lastName} — ${c.title || 'ingen titel'} (${c.status})`,
          `Kompetenser: ${safeJson(c.skills)?.join(', ') || 'inga registrerade'}`,
          `Timarvode: ${c.hourlyRate ? `${c.hourlyRate} kr/h` : 'ej angivet'}`,
          'Du kan uppdatera denna konsults profil med update_consultant(consultant_id, fields).',
        );
      }
    } catch {}
  }

  if (context?.contractId) {
    lines.push('', `Aktivt kontrakt-ID: ${context.contractId}.`);
    try {
      const ct = await prisma.contract.findUnique({
        where: { id: context.contractId },
        select: {
          title: true, status: true, startDate: true, endDate: true,
          rate: true, rateType: true, estimatedHours: true,
          consultant: { select: { firstName: true, lastName: true } },
          client: { select: { name: true } },
        },
      });
      if (ct) {
        lines.push(
          `Kontrakt: ${ct.title} (${ct.status})`,
          `Konsult: ${ct.consultant?.firstName} ${ct.consultant?.lastName}`,
          `Kund: ${ct.client?.name || 'ej kopplad'}`,
          `Period: ${ct.startDate?.toISOString().slice(0, 10)} – ${ct.endDate?.toISOString().slice(0, 10)}`,
          `Arvode: ${ct.rate ? `${ct.rate} kr ${ct.rateType === 'HOURLY' ? '/h' : ct.rateType === 'MONTHLY' ? '/mån' : 'fast'}` : 'ej angivet'}`,
          'Du kan uppdatera detta kontrakt med update_contract(contract_id, fields).',
        );
      }
    } catch {}
  }

  return lines.join('\n');
}

// ── Route handler ───────────────────────────────────────────────────────────

export async function POST(req) {
  const user = await getCurrentUser();
  if (!user) return new Response('Unauthorized', { status: 401 });
  if (!isAdmin(user.role)) return new Response('Forbidden', { status: 403 });

  let body;
  try { body = await req.json(); } catch { return new Response('Invalid JSON', { status: 400 }); }

  const { messages = [], context = {} } = body;

  const stream = new ReadableStream({
    async start(controller) {
      const push = (data) => {
        try { controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(data)}\n\n`)); } catch {}
      };

      try {
        const { project, location } = getVertexConfig();
        const endpoint =
          `https://${location}-aiplatform.googleapis.com/v1/projects/${project}` +
          `/locations/${location}/publishers/anthropic/models/${CHAT_MODEL}:rawPredict`;

        const systemPrompt = await buildSystemPrompt(context);
        const conv = messages.map((m) => ({ role: m.role, content: m.content }));
        let iterations = 0;

        while (iterations < MAX_ITERATIONS) {
          const token = await getAccessToken();
          const res = await fetch(endpoint, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              anthropic_version: 'vertex-2023-10-16',
              system: systemPrompt,
              messages: conv,
              tools: TOOLS,
              max_tokens: 4096,
            }),
          });

          if (!res.ok) {
            const errText = await res.text();
            push({ type: 'error', message: `AI-fel (${res.status}): ${errText.slice(0, 300)}` });
            break;
          }

          const data = await res.json();
          const content = data.content || [];

          if (data.stop_reason === 'tool_use') {
            conv.push({ role: 'assistant', content });

            const uses = content.filter((c) => c.type === 'tool_use');
            const results = [];

            for (const use of uses) {
              push({ type: 'tool_start', id: use.id, name: use.name });
              const result = await executeTool(use.name, use.input, user.id);
              push({ type: 'tool_done', id: use.id, name: use.name, summary: toolSummary(use.name, result) });
              results.push({ type: 'tool_result', tool_use_id: use.id, content: JSON.stringify(result) });
            }

            conv.push({ role: 'user', content: results });
            iterations++;
          } else {
            const text = content.filter((c) => c.type === 'text').map((c) => c.text).join('');
            if (text) push({ type: 'text', content: text });
            break;
          }
        }
      } catch (err) {
        push({ type: 'error', message: err.message || 'Okänt fel' });
      } finally {
        push({ type: 'done' });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
