import { test, expect } from '@playwright/test';
import { openAndSelectElement } from './helpers';

async function openPanelForPrimaryButton(page: any) {
  await page.goto('/');
  await page.waitForTimeout(1500);
  const frame = await openAndSelectElement(page, page.locator('button:has-text("Primary")').first());
  await frame.locator('[data-layer="padding"] .bm-slot', { hasText: 'x-4' }).first().waitFor({ timeout: 8000 });
  return frame;
}

async function getFooterCount(panel: any, label: string) {
  const button = panel.locator('button', { hasText: new RegExp(`\\d+ ${label}`) }).first();
  await expect(button).toBeVisible({ timeout: 8000 });
  const text = (await button.textContent()) ?? '';
  return parseInt(text.match(/(\d+)/)?.[1] ?? '0', 10);
}

async function stagePaddingXChange(panel: any, page: any) {
  const beforeCount = await getFooterCount(panel, 'draft');
  await panel.locator('[data-layer="padding"] .bm-slot', { hasText: 'x-4' }).click();
  await page.waitForTimeout(300);
  await panel.locator('.bm-mini-dropdown-item', { hasText: /^px-8$/ }).click();
  await expect.poll(async () => (await getFooterCount(panel, 'draft')) > beforeCount).toBe(true);
}

test.describe('PatchPopover footer menus', () => {
  test.beforeEach(async () => {
    await fetch('http://localhost:3333/patches', { method: 'DELETE' });
  });

  test('clicking "1 draft" opens a popover listing the draft patch', async ({ page }) => {
    const panel = await openPanelForPrimaryButton(page);

    await stagePaddingXChange(panel, page);

    const draftBtn = panel.locator('button', { hasText: /[1-9]\d* draft/ }).first();
    await expect(draftBtn).toBeVisible({ timeout: 5000 });

    await draftBtn.click();
    await page.waitForTimeout(300);

    const popover = panel.getByText(/draft \(\d+\)/i);
    await expect(popover).toBeVisible({ timeout: 3000 });

    // The patch should show the class change px-4 → px-8
    await expect(panel.locator('text=px-4')).toBeVisible({ timeout: 2000 });
    await expect(panel.locator('text=px-8')).toBeVisible({ timeout: 2000 });

    // Bulk action buttons should be visible
    await expect(panel.locator('button', { hasText: 'Commit All' })).toBeVisible();
    await expect(panel.locator('button', { hasText: 'Discard All' })).toBeVisible();
  });

  test('discard removes the patch and closes the popover', async ({ page }) => {
    const panel = await openPanelForPrimaryButton(page);

    await stagePaddingXChange(panel, page);
    const draftBeforeDiscard = await getFooterCount(panel, 'draft');

    await panel.locator('button', { hasText: /[1-9]\d* draft/ }).first().click();
    await page.waitForTimeout(300);

    await panel.locator('button', { hasText: 'Discard All' }).click();
    await page.waitForTimeout(500);

    await expect.poll(async () => (await getFooterCount(panel, 'draft')) < draftBeforeDiscard).toBe(true);
  });

  test('commit all sends patches to server and increments committed count', async ({ page }) => {
    const panel = await openPanelForPrimaryButton(page);

    // Capture the current committed count before staging
    const committedBtnBefore = panel.locator('button', { hasText: /\d+ committed/ });
    await expect(committedBtnBefore).toBeVisible({ timeout: 5000 });
    const beforeText = await committedBtnBefore.textContent();
    const beforeCount = parseInt(beforeText?.match(/(\d+)/)?.[1] ?? '0', 10);

    await stagePaddingXChange(panel, page);

    await panel.locator('button', { hasText: /[1-9]\d* draft/ }).first().click();
    await page.waitForTimeout(300);
    await panel.locator('button', { hasText: 'Commit All' }).click();
    await page.waitForTimeout(1000);

    await expect(panel.locator('button', { hasText: '0 draft' })).toBeVisible({ timeout: 3000 });
    await expect.poll(async () => {
      const afterText = await panel.locator('button', { hasText: /\d+ committed/ }).first().textContent();
      const afterCount = parseInt(afterText?.match(/(\d+)/)?.[1] ?? '0', 10);
      return afterCount > beforeCount;
    }).toBe(true);
  });

  test('popover closes on Escape key', async ({ page }) => {
    const panel = await openPanelForPrimaryButton(page);

    await stagePaddingXChange(panel, page);

    await panel.locator('button', { hasText: /[1-9]\d* draft/ }).first().click();
    await page.waitForTimeout(300);
    await expect(panel.getByText(/draft \(\d+\)/i)).toBeVisible({ timeout: 3000 });

    // Press Escape
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);

    await expect(panel.getByText(/draft \(\d+\)/i)).not.toBeVisible({ timeout: 2000 });

    await expect(panel.locator('button', { hasText: /\d+ draft/ }).first()).toBeVisible();
  });

  test('disabled counts (0) do not open a popover', async ({ page }) => {
    const panel = await openPanelForPrimaryButton(page);

    // "0 implementing" should always be disabled (no test triggers implementing state)
    const implementingBtn = panel.getByRole('button', { name: '0 implementing' });
    await expect(implementingBtn).toBeVisible({ timeout: 5000 });
    await expect(implementingBtn).toBeDisabled();
  });
});
