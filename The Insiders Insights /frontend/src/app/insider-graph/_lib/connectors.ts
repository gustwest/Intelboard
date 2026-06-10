// Vänliga connector-namn (ON7) — EN källa, delad av onboarding-modalen, ConnectorsEditor
// och kundkortet, så samma connector aldrig visas som rått id ('gleif') på ett ställe och
// "GLEIF (org-data)" på ett annat.
export const CONNECTOR_NAME: Record<string, string> = {
  linkedin: 'LinkedIn',
  linkedin_capacity: 'LinkedIn-kapacitet (kvartal)',
  rss: 'RSS-feeds',
  jobfeed: 'Platsannonser (ATS)',
  website: 'Webbplats',
  gleif: 'GLEIF (org-data)',
  wikipedia: 'Wikipedia/Wikidata',
};

export function connectorLabel(id: string): string {
  return CONNECTOR_NAME[id] || id;
}
