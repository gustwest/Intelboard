import 'server-only';
import prisma from '@/lib/prisma';
import { extractAssignmentFromEmail } from '@/lib/assignments/extraction';

function toDateOrNull(v) {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

function toStringArrayJson(v) {
  if (!Array.isArray(v)) return null;
  const clean = v.filter((x) => typeof x === 'string' && x.trim().length > 0);
  return clean.length > 0 ? JSON.stringify(clean) : null;
}

export async function intakeAssignmentFromEmail({ emailBody, emailSubject, sourceType = 'EMAIL', userId }) {
  if (!emailBody || emailBody.trim().length === 0) {
    throw new Error('emailBody is required');
  }

  const { data, jobId, modelId } = await extractAssignmentFromEmail({ emailBody, emailSubject, userId });

  const assignment = await prisma.assignment.create({
    data: {
      title: data.title || emailSubject || 'Nytt uppdrag',
      description: data.description || emailBody.slice(0, 2000),
      clientName: data.clientName || null,
      brokerName: data.brokerName || null,
      brokerEmail: data.brokerEmail || null,
      location: data.location || null,
      startDate: toDateOrNull(data.startDate),
      endDate: toDateOrNull(data.endDate),
      applicationDeadline: toDateOrNull(data.applicationDeadline),
      estimatedHours: typeof data.estimatedHours === 'number' ? Math.round(data.estimatedHours) : null,
      rateMin: typeof data.rateMin === 'number' ? data.rateMin : null,
      rateMax: typeof data.rateMax === 'number' ? data.rateMax : null,
      rateType: data.rateType || null,
      requiredSkills: toStringArrayJson(data.requiredSkills),
      preferredSkills: toStringArrayJson(data.preferredSkills),
      languageRequirements: toStringArrayJson(data.languageRequirements),
      industry: data.industry || null,
      seniority: data.seniority || null,
      status: 'NEW',
      sourceType,
      sourceRaw: emailBody,
      sourceSubject: emailSubject || null,
      extractionConfidence: typeof data.extractionConfidence === 'number' ? data.extractionConfidence : null,
      extractionNotes: data.extractionNotes || null,
    },
  });

  return { assignment, extractionJobId: jobId, extractionModelId: modelId };
}
