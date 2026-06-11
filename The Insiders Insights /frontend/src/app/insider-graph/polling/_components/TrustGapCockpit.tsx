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
  const [showExplainer, setShowExplainer] = useState(false);

  // E2: sortera dimensionerna efter |gap| (mest att göra överst); omätbara sist.
  // Gap = AI:s valens − belagd evidens, samma kvantiteter som over-claim/möjlighets-
  // badgarna använder, så sortering och badge alltid pekar åt samma håll.
  const gapOf = (d: HumanizationDim): number | null => {
    const raw = d.raw || {};
    const demonstrated = typeof raw.demonstrated === 'number' ? raw.demonstrated : null;
    const valence = typeof raw.perceived?.valence === 'number' ? raw.perceived.valence : null;
    if (demonstrated == null || valence == null || raw.perceived?.status === 'not_visible') return null;
    return valence - demonstrated;
  };
  const sortedDims = [...dims].sort((a, b) => {
    const ga = gapOf(a), gb = gapOf(b);
    if (ga == null && gb == null) return 0;
    if (ga == null) return 1;
    if (gb == null) return -1;
    return Math.abs(gb) - Math.abs(ga);
  });
  const measurable = dims.map((d) => ({ d, gap: gapOf(d) })).filter((x): x is { d: HumanizationDim; gap: number } => x.gap != null);
  const worstOver = measurable.filter((x) => x.gap > 0.2).sort((a, b) => b.gap - a.gap)[0] || null;
  const bestOpp = measurable.filter((x) => x.gap < -0.2).sort((a, b) => a.gap - b.gap)[0] || null;
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
        hint={open ? "Gapet mellan vad ni säger om er själva, vad ni kan bevisa och hur AI beskriver er. Positivt gap = AI överdriver er bild (trovärdighetsrisk om någon granskar); negativt gap = ni gör mer än som syns (berätta, så hinner AI ikapp)." : `${dims.length} dimensioner · ${ranked.length} öppna åtgärder`}
        collapsible
        open={open}
        onToggle={() => setOpen((o) => !o)}
      />
      {!open ? null : (
      <>
      <p style={{ fontSize: 13, color: C.text, margin: '0 0 8px', lineHeight: 1.6 }}>{model.coverage_plain}</p>

      {/* E2: förklaringslager — modellen i klartext bakom en rad, för den som inte sett måttet förr */}
      <button
        onClick={() => setShowExplainer((s) => !s)}
        style={{ padding: 0, marginBottom: 12, fontSize: 11, fontWeight: 600, color: C.muted, background: 'transparent', border: 'none', cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 3 }}
      >
        {showExplainer ? 'Dölj förklaringen' : 'Så funkar måttet ▾'}
      </button>
      {showExplainer && (
        <div style={{ marginBottom: 14, padding: '10px 14px', background: 'rgba(106,126,138,0.05)', border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 12, color: C.text, lineHeight: 1.6 }}>
          <p style={{ margin: '0 0 6px' }}><strong>Säger</strong> (✓/—): finns det överhuvudtaget ett claim där ni påstår detta om er själva? Binärt.</p>
          <p style={{ margin: '0 0 6px' }}><strong>Belägger</strong> (●): hur mycket <em>verifierad evidens</em> som finns — varje belagt claim viktas efter försäkringsnivå (oberoende verifierat väger mest, självdeklarerat minst).</p>
          <p style={{ margin: '0 0 6px' }}><strong>AI uppfattar</strong> (○): hur varmt motorerna faktiskt beskriver er på dimensionen, mätt via persona-frågor och kalibrerat så att motorernas generella optimism räknas bort.</p>
          <p style={{ margin: 0 }}>Pilen mellan ● och ○ är gapet. <span style={{ color: '#b45309', fontWeight: 600 }}>AI över beläggen</span> = trovärdighetsrisk — bilden håller inte om någon granskar. <span style={{ color: '#0e7490', fontWeight: 600 }}>Beläggen över AI</span> = möjlighet — ni underkommunicerar. Perception vägs aldrig in i beslutssäkerhets-poängen.</p>
        </div>
      )}

      {/* E2: topp-sammanfattning — var ska man börja? */}
      {(worstOver || bestOpp) && (
        <div style={{ marginBottom: 14, padding: '10px 14px', background: 'rgba(245,158,11,0.05)', border: '1px solid rgba(245,158,11,0.18)', borderRadius: 8, fontSize: 12, color: C.text, lineHeight: 1.6 }}>
          {worstOver && (
            <span><strong style={{ color: '#b45309' }}>Största trovärdighetsrisk:</strong> {worstOver.d.label}</span>
          )}
          {worstOver && bestOpp && <span style={{ color: C.dim }}> · </span>}
          {bestOpp && (
            <span><strong style={{ color: '#0e7490' }}>Största outnyttjade möjlighet:</strong> {bestOpp.d.label}</span>
          )}
        </div>
      )}

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
        {sortedDims.map((d) => (
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
  // Salience-golv 0.25 → annars "not visible" och inget gap att visa.
  const salience = typeof perceived?.salience === 'number' ? perceived.salience : null;
  const valence = typeof perceived?.valence === 'number' ? perceived.valence : null;
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
      {/* E2: gapet ÄR visualiseringen — dumbbell Belägger ● → AI uppfattar ○,
          färgad efter riktning. "Säger" är binär i datat och visas som ✓/—. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 10, flexWrap: 'wrap' }}>
        <span
          title="Säger: finns ett claim där ni påstår detta om er själva? (binärt)"
          style={{ fontSize: 11, fontWeight: 600, color: declared ? C.text : C.dim, whiteSpace: 'nowrap', cursor: 'help' }}
        >
          Säger {declared ? '✓' : '—'}
        </span>
        <GapDumbbell demonstrated={demonstrated} valence={valence} salience={salience} notVisible={perceived?.status === 'not_visible'} />
      </div>
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

/**
 * E2: dumbbell-diagram — en punkt för Belägger (●, evidens), en för AI uppfattar
 * (○, kalibrerad valens), pilen mellan dem ÄR gapet. Färg efter riktning:
 * AI över beläggen = trovärdighetsrisk (varning), beläggen över AI = möjlighet,
 * i linje = neutral/grön. Inga råa 0–1-tal — riktningen sägs i ord.
 */
export function GapDumbbell({ demonstrated, valence, salience, notVisible }: {
  demonstrated: number | null;
  valence: number | null;
  salience: number | null;
  notVisible: boolean;
}) {
  if (notVisible || valence == null || salience == null || salience < 0.25) {
    return (
      <span style={{ fontSize: 11, color: C.dim, fontStyle: 'italic' }}>
        AI ser er inte här ännu — inget gap att mäta förrän dimensionen blir synlig.
      </span>
    );
  }
  if (demonstrated == null) {
    return <span style={{ fontSize: 11, color: C.dim, fontStyle: 'italic' }}>Evidensläget är inte beräknat för dimensionen.</span>;
  }
  const d = Math.max(0, Math.min(1, demonstrated));
  const v = Math.max(0, Math.min(1, valence));
  const gap = v - d;
  const overClaim = gap > 0.2;
  const opportunity = gap < -0.2;
  const color = overClaim ? '#b45309' : opportunity ? '#0e7490' : '#16a34a';
  const word = overClaim ? 'AI överdriver er bild här' : opportunity ? 'ni underkommunicerar — berätta mer' : 'bild och belägg i linje';
  const leftPct = Math.min(d, v) * 100;
  const widthPct = Math.abs(gap) * 100;
  return (
    <div style={{ flex: 1, minWidth: 220 }}>
      <div style={{ position: 'relative', height: 14 }}>
        <div style={{ position: 'absolute', top: 6, left: 0, right: 0, height: 2, background: 'rgba(106,126,138,0.18)', borderRadius: 1 }} />
        {widthPct > 0.5 && (
          <div style={{ position: 'absolute', top: 6, left: `${leftPct}%`, width: `${widthPct}%`, height: 2, background: color, borderRadius: 1 }} />
        )}
        <span
          title="Belägger — verifierad evidens (viktas efter försäkringsnivå)"
          style={{ position: 'absolute', top: 3, left: `calc(${d * 100}% - 4px)`, width: 8, height: 8, borderRadius: '50%', background: C.accent, cursor: 'help' }}
        />
        <span
          title="AI uppfattar — kalibrerad valens ur persona-proberna"
          style={{ position: 'absolute', top: 2, left: `calc(${v * 100}% - 5px)`, width: 10, height: 10, borderRadius: '50%', background: '#fff', border: '2px solid #0e7490', boxSizing: 'border-box', cursor: 'help' }}
        />
      </div>
      <div style={{ fontSize: 10, color: C.dim, marginTop: 2 }}>
        <span style={{ color: C.accent }}>●</span> Belägger · <span style={{ color: '#0e7490' }}>○</span> AI uppfattar ·{' '}
        <span style={{ color, fontWeight: 600 }}>{word}</span>
      </div>
    </div>
  );
}
