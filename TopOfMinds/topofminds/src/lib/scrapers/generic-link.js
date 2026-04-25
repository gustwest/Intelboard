/**
 * Generic link scraper — follows a URL, optionally logs in, reads page content.
 * Used for E-Work-style brokers that send email with title + link.
 */

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
 * Scrape a single URL, with optional login.
 * @param {{ url, username?, password?, config? }} opts
 * @returns {{ ok, found, content?, error? }}
 */
export async function scrapeGenericLink({ url, username, password, config }) {
  if (!url) {
    return { ok: false, found: 0, error: 'No URL provided' };
  }

  let browser;
  try {
    browser = await getBrowser();
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });

    // Navigate to target URL
    console.log('[generic-link] Navigating to:', url);
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    await page.waitForTimeout(2000);

    // Check if we got redirected to a login page
    const currentUrl = page.url();
    const needsLogin = username && password && (
      currentUrl.includes('login') ||
      currentUrl.includes('sign-in') ||
      currentUrl.includes('auth') ||
      (await page.$('input[type="password"]')) !== null
    );

    if (needsLogin) {
      console.log('[generic-link] Login required, attempting...');

      // Find email/username input
      const emailInput = await page.$(
        'input[type="email"], input[name="email"], input[name="username"], input[id="email"], input[id="username"]'
      );
      if (emailInput) {
        await emailInput.type(username);
      }

      // Find password input
      const pwdInput = await page.$('input[type="password"]');
      if (pwdInput) {
        await pwdInput.type(password);
      }

      // Submit
      const submitBtn = await page.$('button[type="submit"], input[type="submit"]');
      if (submitBtn) await submitBtn.click();

      await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {});
      await page.waitForTimeout(3000);

      // Re-navigate to original URL after login
      if (page.url() !== url) {
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
        await page.waitForTimeout(2000);
      }
    }

    // Extract page content
    const content = await page.evaluate(() => {
      const main = document.querySelector('main, .content, article, .assignment-detail, .job-detail');
      return (main || document.body).innerText;
    });

    const title = await page.title();

    await browser.close();

    if (!content || content.length < 50) {
      return { ok: false, found: 0, error: 'Page content too short or empty' };
    }

    // Send to intake
    try {
      const intakeUrl = `${process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/assignments/intake`;
      const secret = process.env.INTAKE_WEBHOOK_SECRET;

      const res = await fetch(`${intakeUrl}?secret=${secret}&runMatching=true`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: 'BROKER_SCRAPE',
          subject: title || 'Scraped Assignment',
          body: content.slice(0, 10000),
          from: 'Generic Scraper',
        }),
      });

      if (res.ok) {
        return { ok: true, found: 1, content: content.slice(0, 500) };
      } else {
        return { ok: false, found: 0, error: `Intake API returned ${res.status}` };
      }
    } catch (err) {
      return { ok: false, found: 0, error: `Intake failed: ${err.message}` };
    }
  } catch (err) {
    if (browser) await browser.close().catch(() => {});
    console.error('[generic-link] error:', err);
    return { ok: false, found: 0, error: err.message };
  }
}
