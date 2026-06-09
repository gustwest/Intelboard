'use client';

import { useState } from 'react';
import { graphColors as C } from '../../_components/GraphPageShell';
import * as UI from '../../_components/ui';
import { fmtRelative } from '../../_lib/jobRuns';
import {
  Humanization,
  HumanizationDim,
  EnginePerceptionLine,
  Recipe,
  RecipesResp,
  Intervention,
  ViewMode,
  cardStyle,
  RECIPE_STATUS_LABEL,
  KNOWLEDGE_SOURCE_LABEL_SHORT,
  CHANNEL_LABEL_SV,
  INTERVENTION_STATUS_LABEL,
  knowledgeSourceFor,
  recipeStatusColor,
  trustGapBadge,
  gapTypeLabel,
  signedDelta,
  fmtBar,
} from '../_shared';
import { SectionHead } from './common';
import type { KnowledgeSource } from '@/lib/aiModels';

export function TrustGapCockpit({
  model, mode, recipes, recipeBusyId, generatingRecipes, onTransition, onRegenerate,
}: {
  model: Humanization;
  mode: ViewMode;
  recipes: RecipesResp | null;
  recipeBusyId: string | null;
  generatingRecipes: boolean;
  onTransition: (recipeId: string, status: 'agreed' | 'acted' | 'dismissed', note?: string) => void;
  onRegenerate: () => void;
}) {
  const dims = model.dimensions || [];
  const flags = model.opportunities_and_risks || [];
  const ranked = model.ranked_actions || [];
  const trend = model.trend;
  // Kund-läge: defaulta kollapsad (mindre brus); Ops-läge: öppen (man behöver dykningen).
  const [open, setOpen] = useState(mode === 'ops');
  // Recept per dimension för per-rad-badge i DimensionRow.
  const recipeByDimension = new Map<string, Recipe>();
  (recipes?.recipes || []).forEach((r) => {
    const existing = recipeByDimension.get(r.skeleton.dimension);
    // Aktivast först: pending > agreed > acted > verified > dismissed.
    const score = (rec: Recipe) =>
      ['pending', 'agreed', 'acted', 'verified', 'dismissed'].indexOf(rec.status);
    if (!existing || score(r) < score(existing)) {
      recipeByDimension.set(r.skeleton.dimension, r);
    }
  });
  const activeRecipes = (recipes?.recipes || []).filter(
    (r) => r.status !== 'verified' && r.status !== 'dismissed',
  );
  return (
    <div style={{ ...cardStyle, marginBottom: 18 }}>
      <SectionHead
        title="Förtroendegap — säger, belägger, AI uppfattar"
        hint={open ? "Tre lager per dimension: vad ni SÄGER om er själva, vad ni BELÄGGER med oberoende underlag, och hur AI UPPFATTAR er. Gap där emellan är handlingen — perception vägs aldrig in i poängen." : `${dims.length} dimensioner · ${ranked.length} öppna åtgärder`}
        collapsible
        open={open}
        onToggle={() => setOpen((o) => !o)}
      />
      {!open ? null : (
      <>
      <p style={{ fontSize: 13, color: C.text, margin: '0 0 14px', lineHeight: 1.6 }}>{model.coverage_plain}</p>

      {trend?.previous_date && (
        <div style={{ fontSize: 12, color: C.muted, margin: '0 0 14px', lineHeight: 1.5 }}>
          <strong style={{ color: C.text }}>Sedan {trend.previous_date}:</strong>{' '}
          belagda områden {signedDelta(trend.demonstrated_delta)} · uttalade områden {signedDelta(trend.declared_delta)}.
        </div>
      )}
      {trend?.note && !trend.previous_date && (
        <div style={{ fontSize: 12, color: C.dim, margin: '0 0 14px', fontStyle: 'italic' }}>{trend.note}</div>
      )}

      {/* Aktiva recept — sammanställning + expanderbar detalj per recept (Fas 1.5). */}
      <RecipesPanel
        recipes={recipes}
        activeRecipes={activeRecipes}
        mode={mode}
        busyId={recipeBusyId}
        generating={generatingRecipes}
        onTransition={onTransition}
        onRegenerate={onRegenerate}
      />

      {ranked.length > 0 && (
        <div style={{ marginBottom: 16, padding: '12px 14px', background: 'rgba(224, 142, 121,0.06)', border: '1px solid rgba(224, 142, 121,0.18)', borderRadius: 8 }}>
          <div style={{ fontSize: 11, color: C.accent, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>Att göra — mest angeläget först</div>
          <ol style={{ margin: 0, paddingLeft: 18, color: C.text, fontSize: 13, lineHeight: 1.65 }}>
            {ranked.map((a, i) => (
              <li key={i} style={{ marginBottom: i < ranked.length - 1 ? 6 : 0 }}>
                <strong>{a.label}:</strong> {a.why} <span style={{ color: '#16a34a' }}>{a.action}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {flags.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: C.muted, fontWeight: 600, marginBottom: 6 }}>Möjligheter &amp; risker</div>
          <ul style={{ margin: 0, paddingLeft: 18, color: C.text, fontSize: 13, lineHeight: 1.6 }}>
            {flags.map((f, i) => <li key={i}>{f}</li>)}
          </ul>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {dims.map((d) => (
          <DimensionRow
            key={d.dimension}
            dim={d}
            mode={mode}
            recipe={recipeByDimension.get(d.dimension) || null}
          />
        ))}
      </div>
      </>
      )}
    </div>
  );
}

export function DimensionRow({ dim, mode, recipe }: { dim: HumanizationDim; mode: ViewMode; recipe?: Recipe | null }) {
  const raw = dim.raw || {};
  const declared = typeof raw.declared === 'number' ? raw.declared : null;
  const demonstrated = typeof raw.demonstrated === 'number' ? raw.demonstrated : null;
  const perceived = raw.perceived || null;
  // Perceived som "AI ser er" = salience × valens-mappad till 0..1 (valens 0.5 = neutralt, 1 = positivt, 0 = svalt).
  // Salience-golv 0.25 → annars "not visible" och inga staplar.
  const salience = typeof perceived?.salience === 'number' ? perceived.salience : null;
  const valence = typeof perceived?.valence === 'number' ? perceived.valence : null;
  const perceivedBar = salience != null && salience >= 0.25 && valence != null ? salience * valence : null;
  const overClaim = demonstrated != null && perceived?.status !== 'not_visible' && valence != null && (valence - (demonstrated ?? 0)) > 0.2;
  const opportunity = demonstrated != null && valence != null && ((demonstrated ?? 0) - valence) > 0.2;
  return (
    <div style={{ padding: '14px 0', borderBottom: `1px solid ${C.border}` }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{dim.label}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {overClaim && <span style={trustGapBadge('#b45309', 'rgba(245,158,11,0.14)')}>Risk: över-claim</span>}
          {opportunity && <span style={trustGapBadge('#0e7490', 'rgba(14,116,144,0.12)')}>Möjlighet: berätta mer</span>}
          {recipe && mode === 'ops' && (
            <span style={trustGapBadge(...recipeStatusColor(recipe.status))} title={`Recept: ${RECIPE_STATUS_LABEL[recipe.status]}`}>
              {RECIPE_STATUS_LABEL[recipe.status]}
            </span>
          )}
        </div>
      </div>
      {mode === 'ops' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 10 }}>
          <TrustBar label="Säger" value={declared} hint="0 / 1" tone="declared" />
          <TrustBar label="Belägger" value={demonstrated} hint="0 → 1" tone="demonstrated" />
          <TrustBar
            label="AI uppfattar"
            value={perceivedBar}
            hint={perceived?.status === 'not_visible' ? 'AI ser er inte här ännu' : valence != null ? `salience ${salience?.toFixed(2) ?? '—'} · valens ${valence?.toFixed(2) ?? '—'}` : 'för lite synlighet'}
            tone="perceived"
          />
        </div>
      )}
      <div style={{ fontSize: 12, color: C.text, marginTop: 4, lineHeight: 1.5 }}>{dim.evidence_plain}</div>
      <div style={{ fontSize: 12, color: C.muted, marginTop: 4, lineHeight: 1.5 }}>{dim.perception_plain}</div>
      {dim.perception_by_engine.length > 0 && (() => {
        // Splitta per knowledge-source så bas-kunskap (RLHF) och live-signal (web-RAG)
        // hålls visuellt åtskilda. Aldrig medeltala över source-typer.
        // Backend levererar knowledge_source per rad; fallback till lokal lookup om
        // fältet saknas (under deploy-skew kan en gammal payload nå en ny frontend).
        const sourceOf = (l: EnginePerceptionLine): KnowledgeSource =>
          l.knowledge_source ?? knowledgeSourceFor(l.engine);
        const training = dim.perception_by_engine.filter((l) => sourceOf(l) === 'training');
        const webRag = dim.perception_by_engine.filter((l) => sourceOf(l) === 'web_rag');
        const renderGroup = (entries: EnginePerceptionLine[], title: string) => (
          entries.length > 0 && (
            <div style={{ marginTop: 6 }}>
              <div style={{ fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.muted, fontWeight: 600 }}>{title}</div>
              <ul style={{ margin: '2px 0 0', paddingLeft: 16, color: C.dim, fontSize: 11, lineHeight: 1.5 }}>
                {entries.map((l) => <li key={l.engine}>{l.text}</li>)}
              </ul>
            </div>
          )
        );
        return (
          <>
            {renderGroup(training, 'AI Base Knowledge')}
            {renderGroup(webRag, 'AI Live Signal')}
          </>
        );
      })()}
      <div style={{ fontSize: 12, color: '#16a34a', marginTop: 6, lineHeight: 1.5 }}>
        <strong>Att göra:</strong> {dim.action}
      </div>
      {dim.confidence_note && <div style={{ fontSize: 11, color: C.dim, marginTop: 4, fontStyle: 'italic' }}>{dim.confidence_note}</div>}
    </div>
  );
}

export function RecipesPanel({
  recipes, activeRecipes, mode, busyId, generating, onTransition, onRegenerate,
}: {
  recipes: RecipesResp | null;
  activeRecipes: Recipe[];
  mode: ViewMode;
  busyId: string | null;
  generating: boolean;
  onTransition: (recipeId: string, status: 'agreed' | 'acted' | 'dismissed', note?: string) => void;
  onRegenerate: () => void;
}) {
  const counts = recipes?.counts || { pending: 0, agreed: 0, acted: 0, verified: 0, dismissed: 0 };
  const isEmpty = !recipes || recipes.recipes.length === 0;
  // Kund-läge: bara en sammanställning. Ops-läge: hela detaljen.
  if (mode === 'customer') {
    if (isEmpty) return null;
    const openCount = counts.pending + counts.agreed + counts.acted;
    return (
      <div style={{ marginBottom: 14, padding: '10px 14px', background: 'rgba(14,116,144,0.06)', border: '1px solid rgba(14,116,144,0.18)', borderRadius: 8 }}>
        <div style={{ fontSize: 12, color: C.text }}>
          <strong>{openCount}</strong> öppna recept under intern review · <strong>{counts.verified}</strong> verifierade i tidigare cykler
        </div>
      </div>
    );
  }
  return (
    <div style={{ marginBottom: 16, padding: '12px 14px', background: 'rgba(14,116,144,0.04)', border: '1px solid rgba(14,116,144,0.18)', borderRadius: 8 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
        <div style={{ fontSize: 11, color: '#0e7490', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Aktiva recept</div>
        <div style={{ display: 'flex', gap: 10, fontSize: 11, color: C.muted }}>
          <span><strong style={{ color: C.accent }}>{counts.pending}</strong> förslag</span>
          <span><strong style={{ color: '#0e7490' }}>{counts.agreed}</strong> godkända</span>
          <span><strong style={{ color: '#b45309' }}>{counts.acted}</strong> mäts nu</span>
          <span><strong style={{ color: '#16a34a' }}>{counts.verified}</strong> verifierade</span>
          <button
            onClick={onRegenerate}
            disabled={generating}
            title="Kör receptmotorn mot aktuell trust_gap"
            style={{
              padding: '3px 10px', fontSize: 11, fontWeight: 600,
              background: 'transparent', color: '#0e7490',
              border: '1px solid rgba(14,116,144,0.4)', borderRadius: 6,
              cursor: generating ? 'wait' : 'pointer',
            }}
          >
            {generating ? 'Genererar…' : 'Generera om'}
          </button>
        </div>
      </div>
      {isEmpty ? (
        <p style={{ fontSize: 12, color: C.dim, margin: '6px 0 0', fontStyle: 'italic' }}>
          Inga recept genererade än. Klicka &quot;Generera om&quot; för att köra receptmotorn mot aktuell trust_gap.
        </p>
      ) : activeRecipes.length === 0 ? (
        <p style={{ fontSize: 12, color: C.dim, margin: '6px 0 0', fontStyle: 'italic' }}>
          Alla recept är avslutade — antingen verifierade eller avfärdade. Kör &quot;Generera om&quot; när nya gap upptäcks.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {activeRecipes.map((r) => (
            <RecipeRow key={r.recipe_id} recipe={r} busy={busyId === r.recipe_id} onTransition={onTransition} />
          ))}
        </div>
      )}
    </div>
  );
}

export function RecipeRow({
  recipe, busy, onTransition,
}: {
  recipe: Recipe;
  busy: boolean;
  onTransition: (recipeId: string, status: 'agreed' | 'acted' | 'dismissed', note?: string) => void;
}) {
  const [open, setOpen] = useState(recipe.status === 'pending');  // pending defaultar öppen — kö-kö-kö
  const [color, bg] = recipeStatusColor(recipe.status);
  const skel = recipe.skeleton;
  const det = recipe.details;
  return (
    <div style={{ background: '#fff', border: `1px solid ${C.border}`, borderRadius: 6, padding: '8px 12px' }}>
      <div
        {...UI.toggleProps(open, () => setOpen((o) => !o))}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, cursor: 'pointer' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <span style={{ ...trustGapBadge(color, bg), flexShrink: 0 }}>{RECIPE_STATUS_LABEL[recipe.status]}</span>
          <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{skel.dimension_label}</span>
          <span style={{ fontSize: 11, color: C.muted }}>·</span>
          <span style={{ fontSize: 11, color: C.muted, fontStyle: 'italic' }}>{gapTypeLabel(skel.gap_type)}</span>
          <span style={{ fontSize: 11, color: C.muted }}>·</span>
          <span style={{ fontSize: 11, color: C.dim }}>{KNOWLEDGE_SOURCE_LABEL_SHORT[skel.knowledge_source_target] || skel.knowledge_source_target}</span>
        </div>
        <UI.Chevron open={open} size={11} color={C.dim} />
      </div>
      {open && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px dashed ${C.border}` }}>
          {det ? (
            <>
              <p style={{ fontSize: 12, color: C.text, margin: '0 0 8px', lineHeight: 1.55 }}>
                <strong>Varför:</strong> {det.refined_why}
              </p>
              <p style={{ fontSize: 12, color: C.text, margin: '0 0 8px', lineHeight: 1.55 }}>
                <strong>Att göra:</strong> {det.detailed_action}
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, margin: '0 0 8px' }}>
                <div>
                  <div style={{ fontSize: 10, color: C.muted, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 3 }}>Kanal först</div>
                  <div style={{ fontSize: 12, color: C.text }}>
                    {CHANNEL_LABEL_SV[det.prioritized_channel] || det.prioritized_channel}
                  </div>
                  <div style={{ fontSize: 11, color: C.dim, marginTop: 2 }}>{det.prioritized_channel_reason}</div>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: C.muted, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 3 }}>Klart när</div>
                  <div style={{ fontSize: 12, color: C.text }}>{det.success_criteria}</div>
                </div>
              </div>
              {det.specific_proof_points.length > 0 && (
                <div style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 10, color: C.muted, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 3 }}>Befintliga proof points att aktivera</div>
                  <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12, color: C.text, lineHeight: 1.5 }}>
                    {det.specific_proof_points.map((p, i) => <li key={i}>{p}</li>)}
                  </ul>
                </div>
              )}
              {det.risks.length > 0 && (
                <div style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 10, color: '#b45309', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 3 }}>Se upp för</div>
                  <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12, color: C.text, lineHeight: 1.5 }}>
                    {det.risks.map((r, i) => <li key={i}>{r}</li>)}
                  </ul>
                </div>
              )}
              <div style={{ fontSize: 10, color: C.dim, marginTop: 4 }}>
                Detaljifierat av {recipe.detailifier_model}
                {recipe.detailified_at ? ` · ${fmtRelative(recipe.detailified_at)}` : ''}
              </div>
            </>
          ) : (
            <div style={{ padding: '8px 0', fontSize: 12, color: C.dim, fontStyle: 'italic' }}>
              Skelett finns men detaljifiering pågår eller misslyckades. Skäl: {skel.why_template}
            </div>
          )}
          {recipe.intervention && <InterventionStatusView intervention={recipe.intervention} />}
          <RecipeActions recipe={recipe} busy={busy} onTransition={onTransition} />
        </div>
      )}
    </div>
  );
}

export function RecipeActions({
  recipe, busy, onTransition,
}: {
  recipe: Recipe;
  busy: boolean;
  onTransition: (recipeId: string, status: 'agreed' | 'acted' | 'dismissed', note?: string) => void;
}) {
  const btn = (label: string, color: string, onClick: () => void) => (
    <button
      onClick={onClick}
      disabled={busy}
      style={{
        padding: '5px 12px', fontSize: 11, fontWeight: 600,
        background: 'transparent', color, border: `1px solid ${color}55`,
        borderRadius: 6, cursor: busy ? 'wait' : 'pointer',
      }}
    >
      {busy ? '…' : label}
    </button>
  );
  return (
    <div style={{ display: 'flex', gap: 8, marginTop: 10, paddingTop: 8, borderTop: `1px dashed ${C.border}` }}>
      {recipe.status === 'pending' && (
        <>
          {btn('Godkänn', '#0e7490', () => onTransition(recipe.recipe_id, 'agreed'))}
          {btn('Avfärda', '#6b6e7e', () => onTransition(recipe.recipe_id, 'dismissed'))}
        </>
      )}
      {recipe.status === 'agreed' && (
        <>
          {btn('Markera publicerat', '#b45309', () => onTransition(recipe.recipe_id, 'acted'))}
          {btn('Avfärda', '#6b6e7e', () => onTransition(recipe.recipe_id, 'dismissed'))}
        </>
      )}
      {recipe.status === 'acted' && (
        <>
          <span style={{ fontSize: 11, color: C.dim, fontStyle: 'italic', alignSelf: 'center' }}>
            Mäts nu — verifieras automatiskt när gapet stängs
          </span>
          {btn('Avfärda', '#6b6e7e', () => onTransition(recipe.recipe_id, 'dismissed'))}
        </>
      )}
    </div>
  );
}

export function InterventionStatusView({ intervention }: { intervention: Intervention }) {
  const i = intervention;
  const showClosure = i.status === 'resolved_full' || i.status === 'resolved_partial';
  return (
    <div style={{ marginTop: 10, padding: '8px 10px', background: 'rgba(106,126,138,0.06)', borderRadius: 6 }}>
      <div style={{ fontSize: 10, color: C.muted, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6 }}>
        Sluten-loop-mätning · {INTERVENTION_STATUS_LABEL[i.status]}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, fontSize: 11, color: C.text }}>
        <div>
          <span style={{ color: C.muted }}>Belägger:</span>{' '}
          {fmtBar(i.baseline.demonstrated)} → <strong>{fmtBar(i.current.demonstrated)}</strong>
        </div>
        <div>
          <span style={{ color: C.muted }}>AI-valens:</span>{' '}
          {fmtBar(i.baseline.valence)} → <strong>{fmtBar(i.current.valence)}</strong>
        </div>
      </div>
      {showClosure && i.closure && (
        <div style={{ marginTop: 6, fontSize: 11, color: '#16a34a' }}>
          ✓ Stängde på {i.closure.days_to_close ?? '?'} dagar
          {(i.closure.flag_kinds_removed?.length || 0) > 0 && (
            <> · borttagna flaggor: {i.closure.flag_kinds_removed.join(', ')}</>
          )}
        </div>
      )}
    </div>
  );
}

export function TrustBar({ label, value, hint, tone }: { label: string; value: number | null; hint?: string; tone: 'declared' | 'demonstrated' | 'perceived' }) {
  const colors = {
    declared: { fill: '#6b6e7e', track: 'rgba(106,126,138,0.14)' },
    demonstrated: { fill: C.accent, track: 'rgba(224, 142, 121,0.14)' },
    perceived: { fill: '#0e7490', track: 'rgba(14,116,144,0.14)' },
  }[tone];
  const pctVal = value != null ? Math.max(0, Math.min(1, value)) * 100 : 0;
  return (
    <div>
      <div style={{ fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.muted, fontWeight: 600, marginBottom: 4 }}>{label}</div>
      <div style={{ height: 8, background: colors.track, borderRadius: 4, overflow: 'hidden' }}>
        {value != null && (
          <div style={{ width: `${pctVal}%`, height: '100%', background: colors.fill, borderRadius: 4, transition: 'width .3s' }} />
        )}
      </div>
      <div style={{ fontSize: 10, color: C.dim, marginTop: 4 }}>{hint}</div>
    </div>
  );
}
