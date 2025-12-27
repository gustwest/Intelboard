import { test, expect } from '@playwright/test';

test.describe('Request Lifecycle Happy Flow', () => {
    const requestTitle = `Test Request ${Date.now()}`;
    const requestDesc = 'This is a test request description created by automated test.';

    test('Customer creates request, Admin assigns, Specialist sees it', async ({ page }) => {
        // 1. Customer Flow
        await page.goto('/');

        // Wait for page to load and ensure login button is present
        const loginBtn = page.getByTestId('login-button');
        await expect(loginBtn).toBeVisible({ timeout: 15000 });
        await loginBtn.click();

        // Click role category - using text since these are usually stable or we can use regex
        await page.getByRole('button', { name: /Corporate Client|Kund/i }).click();

        // Select user Alice
        await page.getByRole('button', { name: 'Alice', exact: false }).click();

        // Wait for redirect to board
        await expect(page).toHaveURL(/\/board/, { timeout: 15000 });

        // Create Request
        await page.goto('/requests/new');

        // Translatable labels
        const titleLabel = /Request Title|Rubrik/i;
        const descLabel = /Description|Beskrivning/i;
        const submitBtn = /Create Request|Skicka Förfrågan/i;

        await page.getByLabel(titleLabel).fill(requestTitle);
        await page.getByLabel(descLabel).fill(requestDesc);
        await page.getByRole('button', { name: submitBtn }).click();

        // Verify redirect to board with requestId
        await expect(page).toHaveURL(/\/board\?requestId=r/, { timeout: 20000 });

        // 2. Admin Flow
        // Logout using the user menu
        await page.locator('header').getByRole('button').filter({ hasText: 'Alice' }).first().click();
        await page.getByRole('menuitem', { name: /Logout|Logga ut/i }).click();

        // Login as Admin
        await page.getByTestId('login-button').click();
        await page.getByRole('button', { name: /Admin/i }).click();
        await page.getByRole('button', { name: /IntelBoard Admin/i }).click();

        await expect(page).toHaveURL(/\/board/);

        // Find the request on the board
        const requestCard = page.locator('.group.relative.bg-white', { hasText: requestTitle });
        await expect(requestCard).toBeVisible({ timeout: 10000 });
        await requestCard.click();

        // Assign Specialist
        await page.getByRole('button', { name: /Assign Specialist/i }).click();
        await page.getByRole('button', { name: 'Alice Chen', exact: false }).click();

        // 3. Specialist Flow
        // Logout Admin
        await page.locator('header').getByRole('button').filter({ hasText: /Admin/i }).first().click();
        await page.getByRole('menuitem', { name: /Logout|Logga ut/i }).click();

        // Login as Specialist (Alice Chen)
        await page.getByTestId('login-button').click();
        await page.getByRole('button', { name: /Specialist/i }).click();
        await page.getByRole('button', { name: 'Alice Chen', exact: false }).click();

        await expect(page).toHaveURL(/\/board/);

        // Verify request is visible
        await expect(page.locator('.group.relative.bg-white', { hasText: requestTitle })).toBeVisible({ timeout: 10000 });
    });
});
