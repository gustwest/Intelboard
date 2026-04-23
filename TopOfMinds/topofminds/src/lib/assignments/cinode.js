import 'server-only';

/**
 * Normalizes a Cinode webhook payload into a plain-text "email-like" body
 * that the existing AI extraction pipeline can process.
 *
 * Cinode sends a few different shapes depending on event type and API version:
 *   { eventType, payload: {...project...} }
 *   { eventType, data: {...project...} }
 *   { ...project... }                     // flat
 *
 * Project fields vary by endpoint (ProjectAssignment vs Request vs Project),
 * so we do best-effort field discovery rather than strict mapping.
 */
export function cinodePayloadToText(body) {
  if (!body || typeof body !== 'object') return { text: null, subject: null };

  const project = body.payload || body.data || body.project || body;
  if (!project || typeof project !== 'object') return { text: null, subject: null };

  const title = pickString(project, ['title', 'name', 'projectTitle', 'assignmentTitle']);
  const description = pickString(project, ['description', 'descriptionText', 'longDescription', 'body']);
  const customer = pickString(project, ['customerName']) || pickNested(project.customer, 'name') || pickNested(project.endCustomer, 'name');
  const broker = pickString(project, ['companyName', 'brokerName']) || pickNested(project.company, 'name') || pickNested(project.broker, 'name');
  const brokerEmail = pickString(project, ['contactEmail', 'brokerEmail']) || pickNested(project.contact, 'email');
  const location = pickString(project, ['location', 'city', 'workLocation', 'place']);
  const startDate = pickString(project, ['startDate', 'plannedStart', 'start']);
  const endDate = pickString(project, ['endDate', 'plannedEnd', 'end']);
  const deadline = pickString(project, ['applicationDeadline', 'deadline', 'lastApplyDate', 'closingDate']);
  const hoursPerWeek = pickNumber(project, ['hoursPerWeek', 'weeklyHours']);
  const extent = pickString(project, ['extent', 'workload', 'occupancy']);
  const rate = pickString(project, ['rate', 'pricePerHour', 'hourlyRate']);
  const industry = pickString(project, ['industry', 'sector']);
  const url = pickString(project, ['url', 'publicUrl', 'link']);

  const skills = collectSkills(project.skills) || collectSkills(project.skillRequirements);
  const languages = collectSkills(project.languages) || collectSkills(project.languageRequirements);

  const lines = [];
  if (broker) lines.push(`Mäklare: ${broker}`);
  if (brokerEmail) lines.push(`Kontakt: ${brokerEmail}`);
  if (customer) lines.push(`Slutkund: ${customer}`);
  if (location) lines.push(`Plats: ${location}`);
  if (startDate) lines.push(`Startdatum: ${startDate}`);
  if (endDate) lines.push(`Slutdatum: ${endDate}`);
  if (deadline) lines.push(`Sista ansökningsdag: ${deadline}`);
  if (hoursPerWeek) lines.push(`Omfattning: ${hoursPerWeek} timmar/vecka`);
  else if (extent) lines.push(`Omfattning: ${extent}`);
  if (rate) lines.push(`Arvode: ${rate}`);
  if (industry) lines.push(`Bransch: ${industry}`);
  if (skills?.length) lines.push(`Kompetenskrav: ${skills.join(', ')}`);
  if (languages?.length) lines.push(`Språk: ${languages.join(', ')}`);
  if (url) lines.push(`Källa: ${url}`);

  if (description) {
    lines.push('');
    lines.push('Beskrivning:');
    lines.push(description);
  }

  const text = lines.join('\n').trim();
  if (!text) return { text: null, subject: null };

  const subject = title || 'Cinode-uppdrag';
  return { text, subject };
}

function pickString(obj, keys) {
  if (!obj) return null;
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === 'string' && v.trim().length > 0) return v.trim();
  }
  return null;
}

function pickNumber(obj, keys) {
  if (!obj) return null;
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === 'number' && !isNaN(v)) return v;
  }
  return null;
}

function pickNested(obj, key) {
  if (!obj || typeof obj !== 'object') return null;
  const v = obj[key];
  return typeof v === 'string' && v.trim().length > 0 ? v.trim() : null;
}

function collectSkills(arr) {
  if (!Array.isArray(arr)) return null;
  const names = arr
    .map((s) => {
      if (typeof s === 'string') return s;
      if (s && typeof s === 'object') return s.name || s.skillName || s.title || null;
      return null;
    })
    .filter((n) => typeof n === 'string' && n.trim().length > 0);
  return names.length > 0 ? names : null;
}
