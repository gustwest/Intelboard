/**
 * Keyman.se scraper — public site, no login required.
 * Fetches assignment list page, parses links, then fetches each detail page.
 */
import prisma from '@/lib/prisma';

const BASE_URL = 'https://www.keyman.se';
const LIST_URL = `${BASE_URL}/sv/uppdrag/`;

/**
 * Scrape Keyman for new assignments.
 * @param {{ config? }} opts
 * @returns {{ ok, found, error? }}
 */
export async function scrapeKeyman({ config } = {}) {
  try {
    // 1. Fetch the assignments list page
    console.log('[keyman] Fetching list page...');
    const listRes = await fetch(LIST_URL, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TopOfMinds/1.0)' },
    });

    if (!listRes.ok) {
      return { ok: false, found: 0, error: `List page returned ${listRes.status}` };
    }

    const html = await listRes.text();

    // 2. Extract assignment links from HTML
    // Pattern: /sv/category/slug-with-id/
    const linkRegex = /href="(\/sv\/[a-z-]+\/[a-z0-9_-]+-\d+\/)"/gi;
    const links = new Set();
    let match;
    while ((match = linkRegex.exec(html)) !== null) {
      const path = match[1];
      // Filter out non-assignment pages
      if (
        !path.includes('/uppdrag/') &&
        !path.includes('/om-keyman/') &&
        !path.includes('/contact-us/') &&
        !path.includes('/event/') &&
        !path.includes('/for-') &&
        !path.includes('/konsultformedling/') &&
        !path.includes('/interimschefer/') &&
        !path.includes('/vms-') &&
        !path.includes('/prisbarometern') &&
        !path.includes('/accounting/') &&
        !path.includes('/direktbetalning/') &&
        !path.includes('/formaner/') &&
        !path.includes('/spontanansokan/') &&
        !path.includes('/allmanna-villkor/') &&
        !path.includes('/gigga-') &&
        !path.includes('/prenumerera-') &&
        !path.includes('/jobba-hos-') &&
        !path.includes('/miljo-och-') &&
        !path.includes('/gdpr/') &&
        !path.includes('/kundnojdhet/') &&
        !path.includes('/kundresor/') &&
        !path.includes('/vart-team/')
      ) {
        links.add(path);
      }
    }

    // Also try markdown-style link extraction as fallback
    const mdLinkRegex = /\[(.*?)\]\((https:\/\/www\.keyman\.se\/sv\/[a-z-]+\/[a-z0-9_-]+-\d+\/)\)/gi;
    while ((match = mdLinkRegex.exec(html)) !== null) {
      const url = new URL(match[2]);
      links.add(url.pathname);
    }

    console.log(`[keyman] Found ${links.size} assignment links`);

    // 3. Check existing assignments to avoid duplicates
    const existing = await prisma.assignment.findMany({
      where: { brokerName: { contains: 'Keyman' } },
      select: { sourceSubject: true, title: true },
    });
    const existingSet = new Set(
      existing.map((a) => (a.sourceSubject || a.title || '').toLowerCase())
    );

    // 4. Fetch each new assignment detail page
    const intakeUrl = `${process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/assignments/intake`;
    const secret = process.env.INTAKE_WEBHOOK_SECRET;
    let created = 0;
    let skipped = 0;

    for (const path of links) {
      // Extract title from path for dedup
      const slug = path.split('/').filter(Boolean).pop() || '';
      const titleFromSlug = slug.replace(/-\d+$/, '').replace(/-/g, ' ');

      if (existingSet.has(titleFromSlug.toLowerCase())) {
        skipped++;
        continue;
      }

      try {
        const detailRes = await fetch(`${BASE_URL}${path}`, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TopOfMinds/1.0)' },
        });

        if (!detailRes.ok) continue;

        const detailHtml = await detailRes.text();

        // Extract text content (strip HTML tags, get main content)
        const content = extractTextContent(detailHtml);

        if (content.length < 50) continue;

        const res = await fetch(`${intakeUrl}?secret=${secret}&runMatching=false`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            source: 'BROKER_SCRAPE',
            subject: titleFromSlug,
            body: content.slice(0, 10000),
            from: 'Keyman',
          }),
        });

        if (res.ok) created++;

        // Small delay to not hammer the server
        await new Promise((r) => setTimeout(r, 500));
      } catch (err) {
        console.warn(`[keyman] Failed to scrape ${path}:`, err.message);
      }
    }

    return {
      ok: true,
      found: created,
      total: links.size,
      skipped,
      created,
    };
  } catch (err) {
    console.error('[keyman] Scraper error:', err);
    return { ok: false, found: 0, error: err.message };
  }
}

/**
 * Extract readable text from HTML, focusing on main content.
 */
function extractTextContent(html) {
  // Remove scripts, styles, nav, header, footer
  let text = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
    .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
    .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '');

  // Try to find main/article content
  const mainMatch = text.match(/<main[^>]*>([\s\S]*?)<\/main>/i) ||
                    text.match(/<article[^>]*>([\s\S]*?)<\/article>/i) ||
                    text.match(/<div[^>]*class="[^"]*content[^"]*"[^>]*>([\s\S]*?)<\/div>/i);

  if (mainMatch) {
    text = mainMatch[1];
  }

  // Strip remaining HTML tags, decode entities
  text = text
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?(p|div|h[1-6]|li|tr)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#?\w+;/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/ {2,}/g, ' ')
    .trim();

  return text;
}
