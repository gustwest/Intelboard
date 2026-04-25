/**
 * Upgraded.se scraper — public site but JS-rendered, needs Puppeteer.
 * Fetches assignment listing, then scrapes each detail page.
 */
import prisma from '@/lib/prisma';

async function getBrowser() {
  const puppeteer = await import('puppeteer-core');
  const execPath = process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium';

  return puppeteer.default.launch({
    executablePath: execPath,
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--single-process',
    ],
  });
}

/**
 * Scrape Upgraded.se for new assignments.
 * @param {{ config? }} opts
 * @returns {{ ok, found, error? }}
 */
export async function scrapeUpgraded({ config } = {}) {
  let browser;
  try {
    browser = await getBrowser();
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });

    // 1. Navigate to assignments page
    console.log('[upgraded] Navigating to assignments...');
    await page.goto('https://upgraded.se/lediga-uppdrag/', {
      waitUntil: 'networkidle2',
      timeout: 30000,
    });
    await page.waitForTimeout(3000);

    // 2. Extract assignment links
    const assignments = await page.evaluate(() => {
      const items = [];
      // Look for links that go to individual assignment pages
      const links = document.querySelectorAll('a[href*="lediga-uppdrag/"], a[href*="/uppdrag/"]');
      links.forEach((a) => {
        const href = a.href;
        const title = a.textContent?.trim();
        // Filter: must be a detail link, not the listing page itself
        if (
          href &&
          title &&
          title.length > 10 &&
          !href.endsWith('/lediga-uppdrag/') &&
          !href.includes('#') &&
          !href.includes('tidigare-')
        ) {
          items.push({ url: href, title: title.slice(0, 200) });
        }
      });
      return items;
    });

    // Deduplicate by URL
    const uniqueAssignments = [...new Map(assignments.map((a) => [a.url, a])).values()];

    console.log(`[upgraded] Found ${uniqueAssignments.length} assignment links`);

    // 3. Check existing assignments
    const existing = await prisma.assignment.findMany({
      where: { brokerName: { contains: 'Upgraded' } },
      select: { title: true, sourceSubject: true },
    });
    const existingTitles = new Set(
      existing.map((a) => (a.title || '').toLowerCase())
    );

    // 4. Scrape each new assignment
    const intakeUrl = `${process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/assignments/intake`;
    const secret = process.env.INTAKE_WEBHOOK_SECRET;
    let created = 0;

    for (const { url, title } of uniqueAssignments) {
      if (existingTitles.has(title.toLowerCase())) continue;

      try {
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 20000 });
        await page.waitForTimeout(2000);

        const content = await page.evaluate(() => {
          const main = document.querySelector('main, .entry-content, article, .content');
          return (main || document.body).innerText;
        });

        if (!content || content.length < 50) continue;

        const res = await fetch(`${intakeUrl}?secret=${secret}&runMatching=false`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            source: 'BROKER_SCRAPE',
            subject: title,
            body: content.slice(0, 10000),
            from: 'Upgraded',
          }),
        });

        if (res.ok) created++;
      } catch (err) {
        console.warn(`[upgraded] Failed to scrape ${url}:`, err.message);
      }
    }

    await browser.close();

    return {
      ok: true,
      found: created,
      total: uniqueAssignments.length,
      created,
    };
  } catch (err) {
    if (browser) await browser.close().catch(() => {});
    console.error('[upgraded] Scraper error:', err);
    return { ok: false, found: 0, error: err.message };
  }
}
