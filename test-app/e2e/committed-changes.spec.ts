import { test, expect, type Frame } from '@playwright/test';
import { openAndSelectElement, clickSelectElementButton } from './helpers';

async function getFooterCount(frame: Frame, label: string): Promise<number> {
  const button = frame.getByRole('button', { name: new RegExp(`\\d+ ${label}`) }).first();
  await button.waitFor({ timeout: 5000 });
  const text = (await button.textContent()) ?? '';
  return parseInt(text.match(/(\d+)/)?.[1] ?? '0', 10);
}

/**
 * Returns committed + implementing count. When the Mock MCP Client is running
 * it immediately transitions committed → implementing, so both states count as
 * "a commit is in-flight".
 */
async function getInFlightCount(frame: Frame): Promise<number> {
  return (await getFooterCount(frame, 'committed')) + (await getFooterCount(frame, 'implementing'));
}

async function stageBoxModelChange(frame: Frame, slotValue: string, newValue: string) {
  const slot = frame.locator('[data-layer="padding"] .bm-slot', { hasText: slotValue }).first();
  await slot.waitFor({ timeout: 5000 });
  await slot.click();

  const dropdownItem = frame.locator('.bm-mini-dropdown-item', { hasText: new RegExp(`^${newValue}$`) }).first();
  await dropdownItem.waitFor({ timeout: 3000 });
  await dropdownItem.click();
}

async function commitAllStaged(frame: Frame) {
  await expect.poll(async () => (await getFooterCount(frame, 'draft')) > 0).toBe(true);

  const draftButton = frame.getByRole('button', { name: /[1-9]\d* draft/ }).first();
  await draftButton.waitFor({ timeout: 5000 });
  await draftButton.click();

  const commitAllButton = frame.getByRole('button', { name: 'Commit All' });
  await commitAllButton.waitFor({ timeout: 3000 });
  await commitAllButton.click();
}

test.describe('committed changes counter', () => {
  test('committing px-4 → px-6 increments the committed count in the panel footer', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);

    const frame = await openAndSelectElement(
      page,
      page.locator('button:has-text("Primary")').first(),
    );
    await frame.locator('[data-layer="padding"] .bm-slot').first().waitFor({ timeout: 8000 });

    const implementedBefore = await getFooterCount(frame, 'implemented');

    await stageBoxModelChange(frame, 'x-4', 'px-6');
    await commitAllStaged(frame);

    // The Mock MCP Client (if running) immediately transitions committed → implementing.
    // Accept either committed > 0, implementing > 0, or implemented grew.
    await expect
      .poll(async () => {
        const inFlight = await getInFlightCount(frame);
        const implemented = await getFooterCount(frame, 'implemented');
        return inFlight > 0 || implemented > implementedBefore;
      }, { timeout: 10000 })
      .toBe(true);
  });

  test('committing two separate changes shows cumulative committed count', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);

    const frame = await openAndSelectElement(
      page,
      page.locator('button:has-text("Primary")').first(),
    );
    await frame.locator('[data-layer="padding"] .bm-slot').first().waitFor({ timeout: 8000 });

    const implementedBefore = await getFooterCount(frame, 'implemented');

    await stageBoxModelChange(frame, 'x-4', 'px-6');
    await commitAllStaged(frame);

    await clickSelectElementButton(frame);
    await page.locator('button:has-text("Primary")').first().click();
    await frame.locator('[data-layer="padding"] .bm-slot').first().waitFor({ timeout: 5000 });

    await stageBoxModelChange(frame, 'y-2', 'py-3');
    await commitAllStaged(frame);

    // Both commits should result in implemented count growing by at least 2
    await expect
      .poll(async () => (await getFooterCount(frame, 'implemented')) >= implementedBefore + 2, { timeout: 15000 })
      .toBe(true);
  });
});
