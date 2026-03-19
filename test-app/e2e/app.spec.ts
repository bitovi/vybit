import { test, expect } from '@playwright/test';

test.describe('Test App', () => {
  test('loads the page with header', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1').first()).toContainText('Tailwind Visual Editor');
  });

  test('renders all Card instances', async ({ page }) => {
    await page.goto('/');
    const cards = page.locator('.bg-white.rounded-lg.shadow-sm.border');
    await expect(cards).toHaveCount(3);
  });

  test('renders all Button instances', async ({ page }) => {
    await page.goto('/');
    // 2 header buttons + 6 body buttons + 2 nested buttons = 10
    const buttons = page.locator('button');
    const count = await buttons.count();
    expect(count).toBeGreaterThanOrEqual(10);
  });

  test('renders all Badge instances', async ({ page }) => {
    await page.goto('/');
    const badges = page.locator('.rounded-full.text-xs.font-medium');
    const count = await badges.count();
    expect(count).toBeGreaterThanOrEqual(5);
  });
});
