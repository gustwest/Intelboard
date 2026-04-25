/**
 * Scraper engine — dispatches to platform-specific scrapers.
 */
import { decrypt } from '@/lib/crypto';
import { scrapeCinode } from './cinode';
import { scrapeGenericLink } from './generic-link';

/**
 * Check a broker source for new assignments.
 * @param {Object} source - BrokerSource record from DB
 * @returns {{ ok: boolean, found: number, assignments?: Array, error?: string }}
 */
export async function checkSource(source) {
  // Decrypt credentials if present
  let password = null;
  if (source.credentialsCipher) {
    try {
      password = decrypt(source.credentialsCipher);
    } catch (err) {
      return { ok: false, found: 0, error: `Failed to decrypt credentials: ${err.message}` };
    }
  }

  const config = source.config ? JSON.parse(source.config) : {};

  switch (source.type) {
    case 'PORTAL':
      return await scrapePortal(source, password, config);
    case 'EMAIL':
      // Future: Gmail polling
      return { ok: false, found: 0, error: 'EMAIL type not yet implemented' };
    case 'API':
      // Future: direct API integration
      return { ok: false, found: 0, error: 'API type not yet implemented' };
    default:
      return { ok: false, found: 0, error: `Unknown source type: ${source.type}` };
  }
}

/**
 * Dispatch portal scraping based on source name/URL.
 */
async function scrapePortal(source, password, config) {
  const name = source.name?.toLowerCase() || '';
  const url = source.url?.toLowerCase() || '';

  // Route to platform-specific scraper
  if (name.includes('cinode') || url.includes('cinode')) {
    return await scrapeCinode({
      loginUrl: source.url || 'https://app.cinode.com',
      username: source.username,
      password,
      config,
    });
  }

  // Keyman — public site, HTTP-based (no Puppeteer)
  if (name.includes('keyman') || url.includes('keyman.se')) {
    const { scrapeKeyman } = await import('./keyman');
    return await scrapeKeyman({ config });
  }

  // Upgraded — public but JS-rendered (needs Puppeteer)
  if (name.includes('upgraded') || url.includes('upgraded.se')) {
    const { scrapeUpgraded } = await import('./upgraded');
    return await scrapeUpgraded({ config });
  }

  // A Society — uses Inkopio VMS (requires credentials + Puppeteer)
  if (name.includes('a society') || name.includes('asociety') || url.includes('asociety') || url.includes('inkopio')) {
    const { scrapeASociety } = await import('./asociety');
    return await scrapeASociety({
      username: source.username,
      password,
      config,
    });
  }

  // Generic portal scraper — follows links, reads content
  if (source.url) {
    return await scrapeGenericLink({
      url: source.url,
      username: source.username,
      password,
      config,
    });
  }

  return { ok: false, found: 0, error: 'No URL configured for portal source' };
}
