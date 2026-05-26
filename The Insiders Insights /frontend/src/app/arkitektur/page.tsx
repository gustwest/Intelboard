/**
 * Arkitektur & Designsystem — admin-skyddad portal (Server Component).
 *
 * Tre ansvar (jfr handover §3):
 *  1. Admin-guard — kräver inloggad session med roll ADMIN/SUPERADMIN, annars redirect.
 *  2. Schema-parsning — försöker läsa backend/models.py (SQLAlchemy, EJ Prisma) från
 *     disk och regex-parsa modeller + fält. I Cloud Run-containern finns inte filen
 *     (frontend-imagen strippar backend-källan) → faller tillbaka på SCHEMA_MODELS_FALLBACK.
 *  3. Renderar <ArchitectureClient />.
 */
import { redirect } from 'next/navigation';
import fs from 'node:fs';
import path from 'node:path';
import { auth } from '@/lib/auth';
import ArchitectureClient from './ArchitectureClient';
import { SCHEMA_MODELS_FALLBACK, type SchemaModel, type SchemaField } from './data';

export const dynamic = 'force-dynamic';

/** Gissa domän utifrån modell-/tabellnamn (samma idé som BeachVibes inferDomain). */
function inferDomain(modelName: string, table: string): string {
  const n = (modelName + ' ' + table).toLowerCase();
  if (n.includes('customer') || n.includes('goal')) return 'Kunder';
  if (n.includes('source')) return 'Källor';
  if (n.includes('dataset')) return 'Dataset';
  if (n.includes('module')) return 'Moduler';
  if (n.includes('report') || n.includes('dashboard')) return 'Rapporter';
  if (n.includes('aichat') || n.includes('ai_chat')) return 'AI-assistent';
  if (n.includes('conversation') || n.includes('chatmessage') || n.includes('chat_message')) return 'Chat';
  if (n.includes('issue')) return 'Kanban';
  if (n.includes('agent')) return 'AI-agent';
  if (n.includes('note')) return 'Kunder';
  return 'Övrigt';
}

/**
 * Parsa SQLAlchemy-modeller ur models.py-källan.
 * Plockar "class X(Base):" + "__tablename__" + "Column(...)"/"relationship(...)"-rader.
 */
function parseSqlAlchemyModels(src: string): SchemaModel[] {
  const models: SchemaModel[] = [];
  // Dela upp på class-deklarationer som ärver Base.
  const classRegex = /^class\s+(\w+)\(Base\):/gm;
  const matches = [...src.matchAll(classRegex)];

  for (let i = 0; i < matches.length; i++) {
    const name = matches[i][1];
    const start = matches[i].index ?? 0;
    const end = i + 1 < matches.length ? (matches[i + 1].index ?? src.length) : src.length;
    const body = src.slice(start, end);

    const tableMatch = body.match(/__tablename__\s*=\s*["'](\w+)["']/);
    const table = tableMatch ? tableMatch[1] : name.toLowerCase();

    const fields: SchemaField[] = [];

    // Kolumner: "name = Column(Type, ...)"
    const colRegex = /^\s{4}(\w+)\s*=\s*Column\(\s*(\w+)([^\n]*)\)/gm;
    for (const c of body.matchAll(colRegex)) {
      const fname = c[1];
      const ftype = c[2];
      const rest = c[3] || '';
      fields.push({
        name: fname,
        type: ftype,
        optional: /nullable\s*=\s*True/.test(rest),
        isList: false,
        isRelation: /ForeignKey/.test(rest),
        hasDefault: /default\s*=/.test(rest),
      });
    }

    // Relationer: "name = relationship("Target", ...)"
    const relRegex = /^\s{4}(\w+)\s*=\s*relationship\(\s*["'](\w+)["']([^\n]*)\)/gm;
    for (const r of body.matchAll(relRegex)) {
      const fname = r[1];
      const target = r[2];
      const rest = r[3] || '';
      fields.push({
        name: fname,
        type: target,
        optional: false,
        isList: /uselist\s*=\s*False/.test(rest) ? false : true,
        isRelation: true,
        hasDefault: false,
      });
    }

    if (fields.length > 0) {
      models.push({ name, table, domain: inferDomain(name, table), fields });
    }
  }
  return models;
}

/** Läs models.py från någon av de troliga sökvägarna; null om den inte finns (prod). */
function loadSchemaModels(): { models: SchemaModel[]; source: 'disk' | 'fallback' } {
  const candidates = [
    path.join(process.cwd(), '..', 'backend', 'models.py'),
    path.join(process.cwd(), 'backend', 'models.py'),
    path.join(process.cwd(), '..', '..', 'backend', 'models.py'),
  ];
  for (const p of candidates) {
    try {
      const src = fs.readFileSync(p, 'utf-8');
      const parsed = parseSqlAlchemyModels(src);
      if (parsed.length > 0) return { models: parsed, source: 'disk' };
    } catch {
      // filen finns inte här — prova nästa
    }
  }
  return { models: SCHEMA_MODELS_FALLBACK, source: 'fallback' };
}

export default async function ArkitekturPage() {
  // 1. Admin-guard — server-side. Sidan exponerar intern arkitektur.
  const session = await auth();
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (!session?.user || (role !== 'ADMIN' && role !== 'SUPERADMIN')) {
    redirect('/login');
  }

  // 2. Schema-parsning (med fallback).
  const { models, source } = loadSchemaModels();

  // 3. Render.
  return <ArchitectureClient schemaModels={models} schemaSource={source} />;
}
