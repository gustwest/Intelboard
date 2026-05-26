'use client';

/**
 * Live-fliken: realtidsstatus (staging-frontend / insiders-api / graph-api),
 * schema-browser (sök + domänfilter, utfällbara modeller) och ordlista.
 * Status hämtas från /api/admin/arkitektur/status (no-store) vid mount + knapp.
 */
import { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import css from './architecture.module.css';
import { GLOSSARY, type SchemaModel } from './data';

type StatusEntry = { name: string; url: string; ok: boolean; ms: number | null; detail: string };
type StatusResponse = { checkedAt: string; services: StatusEntry[] };

function fieldTypeClass(f: SchemaModel['fields'][number]): string {
  if (f.isRelation) return css.typeRelation;
  if (f.type === 'String' || f.type === 'Text') return css.typeString;
  if (f.type === 'Integer' || f.type === 'Float') return css.typeNumber;
  return css.typeOther;
}

export default function LiveTab({
  schemaModels,
  schemaSource,
}: {
  schemaModels: SchemaModel[];
  schemaSource: 'disk' | 'fallback';
}) {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [query, setQuery] = useState('');
  const [domain, setDomain] = useState<string>('Alla');
  const [openModel, setOpenModel] = useState<string | null>(null);
  const [glossaryQuery, setGlossaryQuery] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/arkitektur/status', { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setStatus(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Okänt fel');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const domains = ['Alla', ...Array.from(new Set(schemaModels.map((m) => m.domain))).sort()];
  const filteredModels = schemaModels.filter((m) => {
    const matchesDomain = domain === 'Alla' || m.domain === domain;
    const q = query.trim().toLowerCase();
    const matchesQuery =
      !q ||
      m.name.toLowerCase().includes(q) ||
      m.table.toLowerCase().includes(q) ||
      m.fields.some((f) => f.name.toLowerCase().includes(q));
    return matchesDomain && matchesQuery;
  });

  const filteredGlossary = GLOSSARY.filter((g) => {
    const q = glossaryQuery.trim().toLowerCase();
    return !q || g.term.toLowerCase().includes(q) || g.def.toLowerCase().includes(q);
  });

  return (
    <div>
      {/* ---- Status ---- */}
      <div className={css.toolbar}>
        <h2 className={css.sectionTitle} style={{ margin: 0 }}>
          Miljöstatus
        </h2>
        <button className={css.btn} onClick={refresh} disabled={loading}>
          <RefreshCw size={14} style={{ verticalAlign: '-2px', marginRight: 6 }} />
          {loading ? 'Pingar…' : 'Uppdatera'}
        </button>
        {status && (
          <span className={css.small + ' ' + css.muted}>
            Kontrollerat {new Date(status.checkedAt).toLocaleTimeString('sv-SE')}
          </span>
        )}
      </div>

      {error && <div className={css.banner}>Kunde inte hämta status: {error}</div>}

      <div className={css.statusGrid}>
        {(status?.services ?? []).map((s) => (
          <div key={s.url} className={css.statusCard}>
            <div className={css.statusTop}>
              <span className={`${css.statusDot} ${s.ok ? css.statusUp : css.statusDown}`} />
              <span className={css.statusName}>{s.name}</span>
              <span className={css.small + ' ' + css.muted} style={{ marginLeft: 'auto' }}>
                {s.ms != null ? `${s.ms} ms` : '—'}
              </span>
            </div>
            <div className={css.statusMeta}>{s.url}</div>
            <div className={css.statusMeta}>{s.detail}</div>
          </div>
        ))}
        {!status && !error && (
          <div className={css.statusCard}>
            <div className={css.statusTop}>
              <span className={`${css.statusDot} ${css.statusPending}`} />
              <span className={css.statusName}>Laddar…</span>
            </div>
          </div>
        )}
      </div>

      {/* ---- Schema-browser ---- */}
      <h2 className={css.sectionTitle} style={{ marginTop: 28 }}>
        Datamodell (schema-browser)
      </h2>
      <div className={css.banner}>
        Modellen läses ur <code>backend/models.py</code> (SQLAlchemy).{' '}
        {schemaSource === 'disk'
          ? 'Parsad live från disk.'
          : 'Källfilen finns inte i containern — visar inbäddad spegling (fallback).'}
      </div>

      <div className={css.toolbar}>
        <input
          className={css.input}
          placeholder="Sök modell eller fält…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {domains.map((d) => (
          <button
            key={d}
            className={`${css.btn} ${domain === d ? css.btnActive : ''}`}
            onClick={() => setDomain(d)}
          >
            {d}
          </button>
        ))}
      </div>

      {filteredModels.map((m) => {
        const isOpen = openModel === m.name;
        return (
          <div key={m.name} className={css.schemaModel}>
            <button className={css.schemaHead} onClick={() => setOpenModel(isOpen ? null : m.name)}>
              <span className={css.schemaModelName}>{m.name}</span>
              <span className={css.schemaTable}>{m.table}</span>
              <span className={css.pill} style={{ marginLeft: 'auto' }}>
                {m.domain}
              </span>
              <span className={css.schemaTable}>{m.fields.length} fält</span>
            </button>
            {isOpen && (
              <div className={css.schemaFields}>
                {m.fields.map((f) => (
                  <div key={f.name} className={css.fieldRow}>
                    <span className={css.fieldName}>{f.name}</span>
                    <span className={fieldTypeClass(f)}>
                      {f.type}
                      {f.isList ? '[]' : ''}
                      {f.optional ? '?' : ''}
                    </span>
                    {f.isRelation && <span className={css.tag}>relation</span>}
                    {f.hasDefault && <span className={css.tag}>default</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
      {filteredModels.length === 0 && <div className={css.placeholder}>Inga modeller matchar.</div>}

      {/* ---- Ordlista ---- */}
      <h2 className={css.sectionTitle} style={{ marginTop: 28 }}>
        Ordlista
      </h2>
      <input
        className={css.input}
        placeholder="Sök term…"
        value={glossaryQuery}
        onChange={(e) => setGlossaryQuery(e.target.value)}
        style={{ marginBottom: 8 }}
      />
      <div className={css.card}>
        {filteredGlossary.map((g) => (
          <div key={g.term} className={css.glossaryItem}>
            <div className={css.glossaryTerm}>{g.term}</div>
            <div className={css.glossaryDef}>{g.def}</div>
          </div>
        ))}
        {filteredGlossary.length === 0 && <div className={css.placeholder}>Inga termer matchar.</div>}
      </div>
    </div>
  );
}
