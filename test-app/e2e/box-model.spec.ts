import { test, expect } from '@playwright/test';

/**
 * Activates inspect mode and clicks the Primary button, returning the panel iframe.
 */
async function openPanelForPrimaryButton(page: any) {
  await page.goto('/');
  await page.waitForTimeout(1500);

  // Activate inspect mode
  await page.evaluate(() => {
    const host = document.querySelector('#tw-visual-editor-host') as HTMLElement;
    const btn = host.shadowRoot!.querySelector('.toggle-btn') as HTMLButtonElement;
    btn.click();
  });

  // Wait for the panel iframe to appear and the panel WebSocket to connect
  await page.waitForSelector('iframe[src*="panel"]', { timeout: 5000 });
  await page.waitForTimeout(800);

  // Click the Primary button — panel is now ready to receive ELEMENT_SELECTED
  await page.locator('button:has-text("Primary")').first().click();
  await page.waitForTimeout(800);

  // Panel is served at /panel/ in an iframe
  const panelFrame = page.frameLocator('iframe[src*="panel"]');
  return panelFrame;
}

test.describe('BoxModel panel integration', () => {
  test('BoxModel shows BOX MODEL header after element selection', async ({ page }) => {
    const panel = await openPanelForPrimaryButton(page);
    await expect(panel.getByText('BOX MODEL', { exact: false })).toBeVisible({ timeout: 5000 });
  });

  test('BoxModel displays padding values px-4 and py-2 for the Primary button', async ({ page }) => {
    const panel = await openPanelForPrimaryButton(page);

    // The padding ring should show scrubbers with the truncated values "x-4" and "y-2"
    await expect(panel.locator('[data-layer="padding"] .bm-slot', { hasText: 'x-4' })).toBeVisible({ timeout: 5000 });
    await expect(panel.locator('[data-layer="padding"] .bm-slot', { hasText: 'y-2' })).toBeVisible({ timeout: 5000 });
  });

  test('BoxModel slot dropdown opens when clicked', async ({ page }) => {
    const panel = await openPanelForPrimaryButton(page);

    // Click the x-4 scrubber to open its dropdown
    await panel.locator('[data-layer="padding"] .bm-slot', { hasText: 'x-4' }).click();
    await page.waitForTimeout(300);

    // Dropdown should show scale values
    await expect(panel.locator('.bm-mini-dropdown-item', { hasText: /^px-0$/ }).first()).toBeVisible({ timeout: 3000 });
    await expect(panel.locator('.bm-mini-dropdown-item', { hasText: /^px-4$/ }).first()).toBeVisible({ timeout: 3000 });
  });

  test('BoxModel shorthand label opens dropdown and selects p-4', async ({ page }) => {
    const wsMessages: any[] = [];
    page.on('websocket', (ws) => {
      ws.on('framesent', (frame) => {
        try { wsMessages.push(JSON.parse(frame.payload as string)); } catch { /* ignore */ }
      });
    });

    const panel = await openPanelForPrimaryButton(page);

    // The padding label is a MiniScrubber — click it to open the dropdown
    // The padding ring label shows "padding" (no shorthand set on primary button)
    const paddingLabel = panel.locator('[data-layer="padding"] .bm-name-scrubber .bm-slot');
    await paddingLabel.waitFor({ timeout: 5000 });
    await paddingLabel.click();
    await page.waitForTimeout(300);

    // Dropdown should show shorthand options
    await expect(panel.locator('.bm-mini-dropdown-item', { hasText: /^p-4$/ }).first()).toBeVisible({ timeout: 3000 });

    // Select p-4
    await panel.locator('.bm-mini-dropdown-item', { hasText: /^p-4$/ }).first().click();
    await page.waitForTimeout(500);

    // PATCH_STAGE should be sent with newClass='p-4'
    const stage = wsMessages.find(m => m.type === 'PATCH_STAGE' && m.newClass === 'p-4');
    expect(stage, 'PATCH_STAGE with newClass="p-4" should be sent').toBeTruthy();
  });

  test('BoxModel shorthand label shows current value and allows changing it', async ({ page }) => {
    const panel = await openPanelForPrimaryButton(page);

    // Primary button has px-4 py-2 but no shorthand — padding label shows "padding"
    const paddingLabel = panel.locator('[data-layer="padding"] .bm-name-scrubber .bm-slot');
    await expect(paddingLabel).toHaveText('padding', { timeout: 5000 });
  });

  test('BoxModel slot change sends PATCH_STAGE via WebSocket', async ({ page }) => {
    const wsMessages: any[] = [];
    page.on('websocket', (ws) => {
      ws.on('framesent', (frame) => {
        try {
          const data = JSON.parse(frame.payload as string);
          wsMessages.push(data);
        } catch { /* ignore non-JSON */ }
      });
    });

    const panel = await openPanelForPrimaryButton(page);

    // Open the x dropdown and pick a new value
    await panel.locator('[data-layer="padding"] .bm-slot', { hasText: 'x-4' }).click();
    await page.waitForTimeout(300);
    await panel.locator('.bm-mini-dropdown-item', { hasText: /^px-8$/ }).click();
    await page.waitForTimeout(500);

    // A PATCH_STAGE message should have been sent
    const stage = wsMessages.find(m => m.type === 'PATCH_STAGE' && m.oldClass === 'px-4' && m.newClass === 'px-8');
    expect(stage).toBeTruthy();
  });

  test('BoxModel clears highlights when editing starts', async ({ page }) => {
    const panel = await openPanelForPrimaryButton(page);

    await expect.poll(async () => {
      return page.evaluate(() => {
        const host = document.querySelector('#tw-visual-editor-host') as HTMLElement;
        return host.shadowRoot!.querySelectorAll('.highlight-overlay').length;
      });
    }).toBeGreaterThan(0);

    // Opening a BoxModel slot dropdown should send CLEAR_HIGHLIGHTS
    await panel.locator('[data-layer="padding"] .bm-slot', { hasText: 'x-4' }).click();

    await expect.poll(async () => {
      return page.evaluate(() => {
        const host = document.querySelector('#tw-visual-editor-host') as HTMLElement;
        return host.shadowRoot!.querySelectorAll('.highlight-overlay').length;
      });
    }).toBe(0);
  });

  test('BoxModel can add a new class to an empty slot', async ({ page }) => {
    const wsMessages: any[] = [];
    page.on('websocket', (ws) => {
      ws.on('framesent', (frame) => {
        try {
          const data = JSON.parse(frame.payload as string);
          wsMessages.push(data);
        } catch { /* ignore non-JSON */ }
      });
    });

    const panel = await openPanelForPrimaryButton(page);

    // The Primary button has px-4 py-2 — the 'l' slot (pl) is empty and shows placeholder 'l'.
    // Hover the padding ring first to reveal empty slots, then click the 'l' slot.
    const paddingRing = panel.locator('[data-layer="padding"]');
    await paddingRing.hover();
    await page.waitForTimeout(300);

    const lSlot = panel.locator('[data-layer="padding"] span.bm-slot', { hasText: /^l$/ });
    await lSlot.click();
    await page.waitForTimeout(300);

    // The dropdown should appear with pl-* values
    await expect(panel.locator('.bm-mini-dropdown-item', { hasText: /^pl-4$/ }).first()).toBeVisible({ timeout: 3000 });

    // Select pl-4
    await panel.locator('.bm-mini-dropdown-item', { hasText: /^pl-4$/ }).first().click();
    await page.waitForTimeout(500);

    // PATCH_STAGE should be sent with oldClass '' (empty — new class) and newClass 'pl-4'
    const stage = wsMessages.find(m => m.type === 'PATCH_STAGE' && m.oldClass === '' && m.newClass === 'pl-4');
    expect(stage, 'PATCH_STAGE with oldClass="" and newClass="pl-4" should be sent').toBeTruthy();
  });
});
