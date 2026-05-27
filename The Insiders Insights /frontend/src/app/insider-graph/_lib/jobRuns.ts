'use client';

import { useCallback, useEffect, useState } from 'react';
import { graphFetch } from './api';

export type JobRun = {
  id: string;
  job_type: string;
  client_id: string | null;
  status: 'running' | 'success' | 'failed';
  started_at: string | null;
  duration_seconds: number | null;
  summary: Record<string, unknown>;
  error_message: string | null;
};

export type TriggerStatus = 'idle' | 'running' | 'success' | 'failed';

export function fmtRelative(iso: string | null | undefined): string {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (isNaN(t)) return '';
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 60) return 'nyss';
  if (s < 3600) return `${Math.floor(s / 60)} min sedan`;
  if (s < 86400) return `${Math.floor(s / 3600)} tim sedan`;
  return `${Math.floor(s / 86400)} d sedan`;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Körningar per kund + jobbtriggning med riktig progress.
 *
 * `latest(jobType)` → senaste körningen (för "senast körd"-stämplar).
 * `trigger(key, path, jobType)` → POSTar och pollar /api/jobs/runs tills körningen
 * är klar (running→success/failed). Timeout → faller tillbaka till idle (t.ex. när
 * connectorn inte är tillämplig för kunden och ingen per-kund-körning spårades).
 */
export function useJobRuns(clientId: string | null) {
  const [runs, setRuns] = useState<JobRun[] | null>(null);
  const [active, setActive] = useState<Record<string, TriggerStatus>>({});

  // clientId satt → körningar för den kunden; null → globalt (alla kunder).
  const query = clientId ? `client_id=${encodeURIComponent(clientId)}&limit=50` : 'limit=50';

  const refresh = useCallback(() => {
    graphFetch<{ runs: JobRun[] }>(`/api/jobs/runs?${query}`)
      .then((d) => setRuns(d.runs))
      .catch(() => setRuns([]));
  }, [query]);

  // Initial/byte: hämta inline (bara async setState → inga cascading renders).
  useEffect(() => {
    let cancelled = false;
    graphFetch<{ runs: JobRun[] }>(`/api/jobs/runs?${query}`)
      .then((d) => { if (!cancelled) setRuns(d.runs); })
      .catch(() => { if (!cancelled) setRuns([]); });
    return () => { cancelled = true; };
  }, [query]);

  // runs är nyast-först → first match = senaste.
  const latest = useCallback(
    (jobType: string): JobRun | null => (runs || []).find((r) => r.job_type === jobType) ?? null,
    [runs],
  );

  const trigger = useCallback(
    async (key: string, path: string, jobType: string) => {
      setActive((p) => ({ ...p, [key]: 'running' }));
      const t0 = Date.now();
      try {
        await graphFetch(path, { method: 'POST' });
      } catch {
        setActive((p) => ({ ...p, [key]: 'failed' }));
        return;
      }
      const deadline = Date.now() + 45000;
      let sawFresh = false;
      while (Date.now() < deadline) {
        await sleep(2000);
        try {
          const params = new URLSearchParams({ job_type: jobType, limit: '5' });
          if (clientId) params.set('client_id', clientId);
          const d = await graphFetch<{ runs: JobRun[] }>(`/api/jobs/runs?${params.toString()}`);
          // En körning som startade efter att vi triggade (4s marginal för klock-skav).
          const fresh = d.runs.find((r) => r.started_at && new Date(r.started_at).getTime() >= t0 - 4000);
          if (fresh) {
            sawFresh = true;
            if (fresh.status !== 'running') {
              setActive((p) => ({ ...p, [key]: fresh.status }));
              refresh();
              // Lämna kvar resultatet en stund, återgå sedan till idle.
              setTimeout(() => setActive((p) => ({ ...p, [key]: 'idle' })), 6000);
              return;
            }
          } else if (!sawFresh && Date.now() - t0 > 8000) {
            // Ingen körning dök upp inom 8s → jobbet var troligen ej tillämpligt för
            // kunden (t.ex. xml-sync utan jobfeed) eller en batch utan per-kund-spår.
            // Sluta snurra istället för att vänta ut hela timeouten.
            break;
          }
        } catch {
          /* fortsätt polla */
        }
      }
      setActive((p) => ({ ...p, [key]: 'idle' }));
      refresh();
    },
    [clientId, refresh],
  );

  return { runs, latest, active, trigger, refresh };
}
