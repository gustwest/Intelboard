/**
 * A Society scraper — uses Puppeteer to log in to Inkopio VMS portal.
 * A Society (asocietygroup.com) uses Inkopio VMS at asociety.inkopio.com.
 * Requires credentials to access assignment listings.
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

const LOGIN_URL = 'https://asociety.inkopio.com/vms/Login';
const ASSIGNMENTS_URL = 'https://asociety.inkopio.com/vms/Assignments';

/**
 * Scrape A Society (Inkopio VMS) for new assignments.
 * @param {{ username?, password?, config? }} opts
 * @returns {{ ok, found, error? }}
 */
export async function scrapeASociety({ username, password, config } = {}) {
  // A Society can also work without credentials for their public feed
  // If credentials are provided, use authenticated mode via Inkopio VMS
  if (username && password) {
    return await scrapeAuthenticated({ username, password, config });
  }

  // Fallback: scrape public page (limited info)
  return await scrapePublic({ config });
}

/**
 * Authenticated scraping via Inkopio VMS portal.
 */
async function scrapeAuthenticated({ username, password, config }) {
  let browser;
  try {
    browser = await getBrowser();
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });

    // 1. Navigate to login page
    console.log('[asociety] Navigating to login:', LOGIN_URL);
    await page.goto(LOGIN_URL, { waitUntil: 'networkidle2', timeout: 30000 });
    await page.waitForTimeout(2000);

    // 2. Login — Inkopio VMS uses email/password form
    const emailInput = await page.$(
      'input[type="email"], input[name="email"], input[name="username"], input[id="email"], input[id="username"], input[name="UserName"]'
    );
    if (emailInput) {
      await emailInput.type(username);
    }

    const pwdInput = await page.$('input[type="password"]');
    if (pwdInput) {
      await pwdInput.type(password);
    }

    // Submit login form
    const submitBtn = await page.$('button[type="submit"], input[type="submit"], .login-button, #loginButton');
    if (submitBtn) await submitBtn.click();

    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(3000);

    // 3. Navigate to assignments listing
    const assignmentsPath = config?.assignmentsPath || '/vms/Assignments';
    const assignmentsUrl = config?.assignmentsUrl || `https://asociety.inkopio.com${assignmentsPath}`;

    console.log('[asociety] Navigating to assignments:', assignmentsUrl);
    await page.goto(assignmentsUrl, { waitUntil: 'networkidle2', timeout: 30000 });
    await page.waitForTimeout(3000);

    // 4. Scrape assignment list
    const assignmentLinks = await page.evaluate(() => {
      const links = [];
      // Try common VMS assignment list patterns
      const rows = document.querySelectorAll(
        'a[href*="assignment"], a[href*="Assignment"], tr[data-id], .assignment-card, .list-item, .assignment-row, table tbody tr'
      );
      rows.forEach((el) => {
        const link = el.tagName === 'A' ? el.href : el.querySelector('a')?.href;
        const title = el.textContent?.trim()?.split('\n')[0]?.slice(0, 200);
        if (link && title && title.length > 5) {
          links.push({ link, title: title.trim() });
        }
      });
      return links;
    });

    // Deduplicate by URL
    const uniqueLinks = [...new Map(assignmentLinks.map((a) => [a.link, a])).values()];
    console.log(`[asociety] Found ${uniqueLinks.length} assignment links`);

    // 5. Check existing to avoid duplicates
    const existing = await prisma.assignment.findMany({
      where: { brokerName: { contains: 'A Society' } },
      select: { title: true, sourceSubject: true },
    });
    const existingTitles = new Set(
      existing.map((a) => (a.title || a.sourceSubject || '').toLowerCase())
    );

    // 6. Scrape each new assignment detail
    const intakeUrl = `${process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/assignments/intake`;
    const secret = process.env.INTAKE_WEBHOOK_SECRET;
    let created = 0;

    for (const { link, title } of uniqueLinks) {
      if (existingTitles.has(title.toLowerCase())) continue;

      try {
        await page.goto(link, { waitUntil: 'networkidle2', timeout: 20000 });
        await page.waitForTimeout(2000);

        const content = await page.evaluate(() => {
          const main = document.querySelector('main, .content, .assignment-detail, article, .detail-view');
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
            from: 'A Society',
          }),
        });

        if (res.ok) created++;
      } catch (err) {
        console.warn(`[asociety] Failed to scrape ${link}:`, err.message);
      }
    }

    await browser.close();

    return {
      ok: true,
      found: created,
      total: uniqueLinks.length,
      created,
    };
  } catch (err) {
    if (browser) await browser.close().catch(() => {});
    console.error('[asociety] Scraper error:', err);
    return { ok: false, found: 0, error: err.message };
  }
}

/**
 * Public scraping fallback — limited, A Society doesn't list assignments publicly.
 * This is a stub that returns a helpful message.
 */
async function scrapePublic({ config }) {
  console.log('[asociety] No credentials provided — A Society requires login via Inkopio VMS');
  return {
    ok: false,
    found: 0,
    error: 'A Society kräver inloggning via Inkopio VMS (asociety.inkopio.com). Lägg till credentials i källkonfigurationen.',
  };
}
