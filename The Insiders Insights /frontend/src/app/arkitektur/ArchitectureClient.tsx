'use client';

/**
 * Arkitektur & Designsystem — klientskal för den TVÅSPÅRIGA portalen.
 * Håller flik-state och renderar hero + tab-bar + rätt flik. Stack-,
 * Designsystem- och Domänmoduler-flikarna bor som lokala funktioner här;
 * Diagram/ADR/Live ligger i egna filer. ALL data importeras från ./data.
 */
import { useState } from 'react';
import { Network, Layers, Palette, Boxes, BookOpen, Radio } from 'lucide-react';
import css from './architecture.module.css';
import {
  TECH_STACK,
  LAYERS,
  COLOR_TOKENS,
  TYPE_SCALE,
  DESIGN_RULES,
  CODE_EXAMPLES,
  MODULES,
  MODULE_POSITIONS_INSIDERS,
  MODULE_POSITIONS_GEOGRAPH,
  GRAPH_VIEWBOX_INSIDERS,
  GRAPH_VIEWBOX_GEOGRAPH,
  TRACK_LABELS,
  type TechItem,
  type Track,
  type SchemaModel,
} from './data';
import DiagramTab from './DiagramTab';
import AdrTab from './AdrTab';
import LiveTab from './LiveTab';
import ModuleGraph from './ModuleGraph';

type TabId = 'diagram' | 'stack' | 'design' | 'modules' | 'adr' | 'live';

const TABS: { id: TabId; label: string; icon: typeof Network }[] = [
  { id: 'diagram', label: 'Diagram', icon: Network },
  { id: 'stack', label: 'Teknikstack', icon: Layers },
  { id: 'design', label: 'Designsystem', icon: Palette },
  { id: 'modules', label: 'Domänmoduler', icon: Boxes },
  { id: 'adr', label: 'ADRs', icon: BookOpen },
  { id: 'live', label: 'Live', icon: Radio },
];

const TRACK_CLASS: Record<Track, string> = {
  insiders: css.trackInsiders,
  geogiraph: css.trackGeogiraph,
  delad: css.trackDelad,
};

export default function ArchitectureClient({
  schemaModels,
  schemaSource,
}: {
  schemaModels: SchemaModel[];
  schemaSource: 'disk' | 'fallback';
}) {
  const [tab, setTab] = useState<TabId>('diagram');

  return (
    <div className={css.page}>
      <header className={css.hero}>
        <p className={css.heroEyebrow}>Internt · Admin · Två spår</p>
        <h1 className={css.heroTitle}>Arkitektur &amp; Designsystem</h1>
        <p className={css.heroSub}>
          Levande karta över hela systemet: <strong style={{ color: 'var(--brand-accent)' }}>The Insiders</strong>{' '}
          (KPI/LinkedIn-analys) och <strong style={{ color: 'var(--brand-purple)' }}>Geogiraph</strong>{' '}
          (AI-synlighet/GEO) — hur spåren är byggda var för sig och hur de samspelar.
        </p>
      </header>

      <nav className={css.tabBar}>
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              className={`${css.tab} ${tab === t.id ? css.tabActive : ''}`}
              onClick={() => setTab(t.id)}
            >
              <Icon size={16} />
              {t.label}
            </button>
          );
        })}
      </nav>

      {tab === 'diagram' && <DiagramTab />}
      {tab === 'stack' && <StackTab />}
      {tab === 'design' && <DesignTab />}
      {tab === 'modules' && <ModulesTab />}
      {tab === 'adr' && <AdrTab />}
      {tab === 'live' && <LiveTab schemaModels={schemaModels} schemaSource={schemaSource} />}
    </div>
  );
}

/* ================================================================== */
/* Teknikstack-fliken — lager + spårfilter                             */
/* ================================================================== */
const TRACK_FILTERS: { id: Track | 'alla'; label: string }[] = [
  { id: 'alla', label: 'Alla spår' },
  { id: 'delad', label: TRACK_LABELS.delad },
  { id: 'insiders', label: TRACK_LABELS.insiders },
  { id: 'geogiraph', label: TRACK_LABELS.geogiraph },
];

function StackTab() {
  const [selected, setSelected] = useState<TechItem | null>(null);
  const [trackFilter, setTrackFilter] = useState<Track | 'alla'>('alla');

  const visible = TECH_STACK.filter((t) => trackFilter === 'alla' || t.track === trackFilter);

  return (
    <div className={css.split}>
      <div>
        <div className={css.viewToggle}>
          {TRACK_FILTERS.map((f) => (
            <button
              key={f.id}
              className={`${css.btn} ${trackFilter === f.id ? css.btnActive : ''}`}
              onClick={() => setTrackFilter(f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>

        {LAYERS.map((layer) => {
          const items = visible.filter((t) => t.layer === layer.id);
          if (items.length === 0) return null;
          return (
            <div key={layer.id} className={css[layer.cls]}>
              <div className={css.layerHeader}>
                <span className={css.layerDot} />
                {layer.label}
              </div>
              <div className={css.grid}>
                {items.map((item) => (
                  <button
                    key={item.id}
                    className={`${css.card} ${css.cardClickable} ${css.layerAccentBar} ${css[item.layerClass]} ${
                      selected?.id === item.id ? css.cardSelected : ''
                    }`}
                    onClick={() => setSelected(item)}
                    style={{ textAlign: 'left' }}
                  >
                    <span className={css.cardEmoji}>{item.emoji}</span>
                    <div className={css.cardName}>{item.name}</div>
                    <div className={css.cardSnippet}>{item.snippet}</div>
                    <span className={`${css.pill} ${TRACK_CLASS[item.track]}`} style={{ marginTop: 8 }}>
                      {TRACK_LABELS[item.track]}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <aside className={`${css.detailPanel} ${selected ? css[selected.layerClass] : ''}`}>
        {selected ? (
          <>
            <div className={css.detailTitle}>
              {selected.emoji} {selected.name}
            </div>
            <span className={css.pill}>{selected.layer}</span>{' '}
            <span className={`${css.pill} ${TRACK_CLASS[selected.track]}`}>{TRACK_LABELS[selected.track]}</span>
            <div className={css.detailLabel}>Vad &amp; varför</div>
            <p className={css.detailText}>{selected.description}</p>
            <div className={css.prosCons}>
              <div>
                <div className={css.detailLabel}>Fördelar</div>
                <ul className={`${css.list} ${css.pros}`}>
                  {selected.pros.map((p, i) => (
                    <li key={i}>{p}</li>
                  ))}
                </ul>
              </div>
              <div>
                <div className={css.detailLabel}>Avvägningar</div>
                <ul className={`${css.list} ${css.cons}`}>
                  {selected.cons.map((c, i) => (
                    <li key={i}>{c}</li>
                  ))}
                </ul>
              </div>
            </div>
            <div className={css.detailLabel}>Bortvalda alternativ</div>
            {selected.alternatives.map((a, i) => (
              <p key={i} className={css.detailText} style={{ marginTop: 6 }}>
                <strong style={{ color: 'var(--brand-text)' }}>{a.name}</strong> — {a.why}
              </p>
            ))}
          </>
        ) : (
          <div className={css.placeholder}>Välj en teknik för detaljer →</div>
        )}
      </aside>
    </div>
  );
}

/* ================================================================== */
/* Designsystem-fliken                                                 */
/* ================================================================== */
function DesignTab() {
  return (
    <div>
      <h2 className={css.sectionTitle}>Färgtokens</h2>
      <div className={css.swatchGrid}>
        {COLOR_TOKENS.map((c) => (
          <div key={c.token} className={css.swatch}>
            <div className={css.swatchColor} style={{ background: c.value }} />
            <div className={css.swatchMeta}>
              <div className={css.swatchName}>{c.name}</div>
              <div className={css.swatchToken}>{c.token}</div>
              <div className={css.swatchNote}>{c.note}</div>
            </div>
          </div>
        ))}
      </div>

      <h2 className={css.sectionTitle} style={{ marginTop: 28 }}>
        Typskala
      </h2>
      <div className={css.card}>
        {TYPE_SCALE.map((t) => (
          <div key={t.token} className={css.typeRow}>
            <div>
              <div className={css.cardName}>{t.token}</div>
              <div className={css.small + ' ' + css.muted}>{t.desc}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div className={css.cardName}>{t.label}</div>
              <div className={css.swatchToken}>{t.size}</div>
            </div>
          </div>
        ))}
      </div>

      <h2 className={css.sectionTitle} style={{ marginTop: 28 }}>
        Regler
      </h2>
      <div className={css.grid}>
        {DESIGN_RULES.map((r) => (
          <div key={r.title} className={css.card}>
            <div className={css.cardName}>{r.title}</div>
            <p className={css.detailText} style={{ marginTop: 4 }}>
              {r.body}
            </p>
          </div>
        ))}
      </div>

      <h2 className={css.sectionTitle} style={{ marginTop: 28 }}>
        Kodexempel
      </h2>
      <div className={css.grid}>
        {CODE_EXAMPLES.map((e) => (
          <div key={e.title}>
            <div className={css.small + ' ' + css.muted} style={{ marginBottom: 6 }}>
              {e.title}
            </div>
            <pre className={css.codeBlock}>{e.code}</pre>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ================================================================== */
/* Domänmoduler-fliken — spårväljare                                   */
/* ================================================================== */
function ModulesTab() {
  const [track, setTrack] = useState<Exclude<Track, 'delad'>>('insiders');
  const [view, setView] = useState<'graph' | 'matrix'>('graph');

  const trackModules = MODULES.filter((m) => m.track === track);
  const positions = track === 'insiders' ? MODULE_POSITIONS_INSIDERS : MODULE_POSITIONS_GEOGRAPH;
  const viewBox = track === 'insiders' ? GRAPH_VIEWBOX_INSIDERS : GRAPH_VIEWBOX_GEOGRAPH;

  const usedBy: Record<string, { id: string; via: string }[]> = {};
  for (const m of trackModules) {
    for (const u of m.moduleUses) {
      (usedBy[u.id] ||= []).push({ id: m.id, via: u.via });
    }
  }
  const allServices = Array.from(new Set(trackModules.flatMap((m) => m.deps))).sort();

  return (
    <div>
      <div className={css.viewToggle}>
        <button
          className={`${css.btn} ${track === 'insiders' ? css.btnActive : ''}`}
          onClick={() => setTrack('insiders')}
        >
          {TRACK_LABELS.insiders}
        </button>
        <button
          className={`${css.btn} ${track === 'geogiraph' ? css.btnActive : ''}`}
          onClick={() => setTrack('geogiraph')}
        >
          {TRACK_LABELS.geogiraph}
        </button>
        <span style={{ flex: 1 }} />
        <button
          className={`${css.btn} ${view === 'graph' ? css.btnActive : ''}`}
          onClick={() => setView('graph')}
        >
          Beroendegraf
        </button>
        <button
          className={`${css.btn} ${view === 'matrix' ? css.btnActive : ''}`}
          onClick={() => setView('matrix')}
        >
          Service-matris
        </button>
      </div>

      {view === 'graph' ? (
        <ModuleGraph key={track} modules={trackModules} positions={positions} viewBox={viewBox} />
      ) : (
        <div className={css.card} style={{ overflowX: 'auto' }}>
          <table className={css.matrix}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left' }}>Modul</th>
                {allServices.map((s) => (
                  <th key={s}>{s}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {trackModules.map((m) => (
                <tr key={m.id}>
                  <td style={{ textAlign: 'left', color: 'var(--brand-text)' }}>
                    {m.emoji} {m.name}
                  </td>
                  {allServices.map((s) => (
                    <td key={s} className={m.deps.includes(s) ? css.matrixHit : ''}>
                      {m.deps.includes(s) ? '●' : '·'}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2 className={css.sectionTitle} style={{ marginTop: 28 }}>
        Moduler · {TRACK_LABELS[track]}
      </h2>
      <div className={css.grid}>
        {trackModules.map((m) => {
          const incoming = usedBy[m.id] || [];
          const degree = m.moduleUses.length + incoming.length;
          return (
            <div key={m.id} className={css.card}>
              <span className={css.cardEmoji}>{m.emoji}</span>
              <div className={css.cardName}>
                {m.name} {degree >= 3 && <span className={css.tag}>hub</span>}
                {degree === 0 && <span className={css.tag}>isolerad</span>}
              </div>
              <p className={css.detailText} style={{ margin: '4px 0 8px' }}>
                {m.description}
              </p>
              <div className={css.small + ' ' + css.muted}>Frontend: {m.frontend}</div>
              <div className={css.small + ' ' + css.muted}>Backend: {m.backend}</div>
              <div style={{ marginTop: 8 }}>
                {m.apiRoutes.map((r) => (
                  <div key={r} className={css.small} style={{ fontFamily: 'ui-monospace, monospace', color: 'var(--brand-muted)' }}>
                    {r}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
