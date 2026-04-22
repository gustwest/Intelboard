import Link from 'next/link';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth/dal';
import { PIPELINE_STEPS } from '@/lib/ai/provider';
import SettingForm from './SettingForm';

export const metadata = { title: 'AI Pipeline-inställningar — TopOfMinds' };
export const dynamic = 'force-dynamic';

const STEP_LABELS = {
  EMAIL_EXTRACTION: { title: 'Email-extraktion', desc: 'Extraherar uppdragsdetaljer ur inkommande mäklarmail.' },
  MATCHING: { title: 'Matchningsanalys', desc: 'Jämför konsultprofil mot uppdragskrav, ger score och förklaring.' },
  CV_GENERATION: { title: 'CV-generering', desc: 'Skräddarsyr CV för konsult + specifikt uppdrag.' },
  CV_PARSING: { title: 'CV-inläsning', desc: 'Extraherar profildata ur uppladdade CV-dokument.' },
};

export default async function SettingsPage() {
  await requireAdmin();

  const [settings, models] = await Promise.all([
    prisma.aISetting.findMany({
      include: {
        champion: { select: { modelId: true, displayName: true, provider: true } },
        challenger: { select: { modelId: true, displayName: true, provider: true } },
      },
    }),
    prisma.modelRegistry.findMany({
      where: { enabled: true },
      orderBy: [{ provider: 'asc' }, { displayName: 'asc' }],
    }),
  ]);

  const settingsByStep = Object.fromEntries(settings.map((s) => [s.pipelineStep, s]));
  const stepKeys = Object.keys(PIPELINE_STEPS);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <Link href="/admin/ai" className="page-back">← Tillbaka</Link>
          <h1 className="page-title">Pipeline-inställningar</h1>
          <p className="page-subtitle">
            Sätt champion-modell per steg. Lägg till challenger för att köra A/B-shadow-tester.
          </p>
        </div>
      </div>

      <div className="ai-settings-list">
        {stepKeys.map((step) => {
          const setting = settingsByStep[step];
          const label = STEP_LABELS[step] || { title: step, desc: '' };
          return (
            <SettingForm
              key={step}
              pipelineStep={step}
              stepTitle={label.title}
              stepDesc={label.desc}
              setting={setting}
              models={models}
            />
          );
        })}
      </div>
    </div>
  );
}
