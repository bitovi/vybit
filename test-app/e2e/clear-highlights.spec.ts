import { test, expect } from '@playwright/test';
import { openAndSelectElement, getHighlightCount } from './helpers';

/**
 * Verifies that blue highlight boxes disappear when the user clicks
 * a class chip in the panel after selecting an element.
 */
test.describe('Clear highlights on class chip click', () => {
  test('highlights appear after clicking element in inspect mode', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);

    await openAndSelectElement(page, page.locator('button:has-text("Primary")').first());

    await expect.poll(() => getHighlightCount(page)).toBeGreaterThan(0);
  });

  test('highlights disappear when clicking a class chip in the panel', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);

    const frame = await openAndSelectElement(page, page.locator('button:has-text("Primary")').first());

    await expect.poll(() => getHighlightCount(page)).toBeGreaterThan(0);

    // Get the panel iframe and click a ScaleScrubber chip (e.g. "text-sm")
    const chip = frame.locator('.cursor-ew-resize').first();
    await chip.waitFor({ timeout: 5000 });
    await chip.click();

    // Wait for the CLEAR_HIGHLIGHTS message to be processed
    await page.waitForTimeout(500);

    // Verify highlights are gone
    await expect.poll(() => getHighlightCount(page)).toBe(0);
  });

  test('CLEAR_HIGHLIGHTS message is sent via WebSocket when chip clicked', async ({ page }) => {
    const wsMessages: any[] = [];
    page.on('websocket', (ws) => {
      ws.on('framesent', (frame) => {
        try {
          const data = JSON.parse(frame.payload as string);
          wsMessages.push(data);
        } catch { /* ignore */ }
      });
    });

    await page.goto('/');
    await page.waitForTimeout(2000);

    const frame = await openAndSelectElement(page, page.locator('button:has-text("Primary")').first());

    // Get the panel iframe and click a ScaleScrubber chip
    const chip = frame.locator('.cursor-ew-resize').first();
    await chip.waitFor({ timeout: 5000 });
    await chip.click();

    await page.waitForTimeout(500);

    // Check that CLEAR_HIGHLIGHTS message was sent
    const clearMsg = wsMessages.find(m => m.type === 'CLEAR_HIGHLIGHTS');
    expect(clearMsg).toBeTruthy();
    expect(clearMsg.to).toBe('overlay');
  });
});
