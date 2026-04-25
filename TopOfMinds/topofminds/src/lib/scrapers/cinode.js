/**
 * Cinode portal scraper — uses Puppeteer to log in and scrape assignments.
 */
import prisma from '@/lib/prisma';

// Dynamic import — puppeteer-core is only available in environments with Chrome
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
 * Scrape Cinode for new assignments.
 * @param {{ loginUrl, username, password, config }} opts
 * @returns {{ ok, found, assignments?, error? }}
 */
export async function scrapeCinode({ loginUrl, username, password, config }) {
  if (!username || !password) {
    return { ok: false, found: 0, error: 'Missing username or password' };
  }

  let browser;
  try {
    browser = await getBrowser();
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });

    // 1. Navigate to login page
    console.log('[cinode] Navigating to:', loginUrl);
    await page.goto(loginUrl, { waitUntil: 'networkidle2', timeout: 30000 });

    // 2. Login — Cinode uses email/password form
    // Look for email input
    await page.waitForSelector('input[type="email"], input[name="email"], input[id="email"]', { timeout: 10000 });
    await page.type('input[type="email"], input[name="email"], input[id="email"]', username);

    // Find and click next/continue button
    const nextBtn = await page.$('button[type="submit"], button:has-text("Logga in"), button:has-text("Next")');
    if (nextBtn) await nextBtn.click();
    await page.waitForTimeout(2000);

    // Enter password if separate step
    const pwdInput = await page.$('input[type="password"]');
    if (pwdInput) {
      await pwdInput.type(password);
      const loginBtn = await page.$('button[type="submit"]');
      if (loginBtn) await loginBtn.click();
    }

    // Wait for navigation to complete
    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(3000);

    // 3. Navigate to assignments page
    const assignmentsPath = config?.assignmentsPath || '/assignments';
    const baseUrl = new URL(loginUrl).origin;
    const assignmentsUrl = `${baseUrl}${assignmentsPath}`;

    console.log('[cinode] Navigating to assignments:', assignmentsUrl);
    await page.goto(assignmentsUrl, { waitUntil: 'networkidle2', timeout: 30000 });
    await page.waitForTimeout(3000);

    // 4. Scrape assignment list
    const assignmentLinks = await page.evaluate(() => {
      const links = [];
      // Try common Cinode assignment list patterns
      const rows = document.querySelectorAll('a[href*="assignment"], tr[data-id], .assignment-card, .list-item');
      rows.forEach((el) => {
        const link = el.tagName === 'A' ? el.href : el.querySelector('a')?.href;
        const title = el.textContent?.trim()?.slice(0, 200);
        if (link && title) links.push({ link, title });
      });
      return links;
    });

    console.log(`[cinode] Found ${assignmentLinks.length} assignment links`);

    // 5. Get existing assignment titles to avoid duplicates
    const existing = await prisma.assignment.findMany({
      where: { brokerName: { contains: 'Cinode' } },
      select: { title: true },
    });
    const existingTitles = new Set(existing.map((a) => a.title.toLowerCase()));

    // 6. Scrape each new assignment
    const newAssignments = [];
    for (const { link, title } of assignmentLinks) {
      // Skip if we already have this assignment
      const shortTitle = title.split('\n')[0].trim();
      if (existingTitles.has(shortTitle.toLowerCase())) continue;

      try {
        await page.goto(link, { waitUntil: 'networkidle2', timeout: 20000 });
        await page.waitForTimeout(2000);

        const content = await page.evaluate(() => {
          // Get main content area
          const main = document.querySelector('main, .content, .assignment-detail, article');
          return main ? main.innerText : document.body.innerText;
        });

        if (content && content.length > 50) {
          newAssignments.push({
            title: shortTitle,
            rawContent: content.slice(0, 10000),
            sourceUrl: link,
          });
        }
      } catch (err) {
        console.warn(`[cinode] Failed to scrape ${link}:`, err.message);
      }
    }

    // 7. Send each new assignment to intake
    let created = 0;
    for (const assignment of newAssignments) {
      try {
        const intakeUrl = `${process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/assignments/intake`;
        const secret = process.env.INTAKE_WEBHOOK_SECRET;

        const res = await fetch(`${intakeUrl}?secret=${secret}&runMatching=true`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            source: 'BROKER_SCRAPE',
            subject: assignment.title,
            body: assignment.rawContent,
            from: 'Cinode Portal',
          }),
        });

        if (res.ok) created++;
      } catch (err) {
        console.warn(`[cinode] Failed to ingest ${assignment.title}:`, err.message);
      }
    }

    await browser.close();

    return {
      ok: true,
      found: created,
      total: assignmentLinks.length,
      new: newAssignments.length,
      created,
    };
  } catch (err) {
    if (browser) await browser.close().catch(() => {});
    console.error('[cinode] Scraper error:', err);
    return { ok: false, found: 0, error: err.message };
  }
}
