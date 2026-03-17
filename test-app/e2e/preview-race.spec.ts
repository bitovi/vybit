import { test, expect } from '@playwright/test';
import { clickToggleButton, getPanelFrame, waitForPanelReady, clickSelectElementButton } from './helpers';

/**
 * Verifies that hovering over scale chips and then leaving does NOT leave
 * a stale preview class on the page elements.
 *
 * Root cause: applyPreview does an async fetch, so PATCH_REVERT (synchronous)
 * could run and restore the DOM while the fetch is still in flight — then the
 * fetch resolves and re-applies the class with no way to clean up.
 * Fixed via a generation counter that invalidates stale in-flight previews.
 */
test('hovering then leaving scale chips reverts classes on the page', async ({ page }) => {
  await page.goto('/');
  await page.waitForTimeout(2000);

  // Record the original class of the Primary button
  const originalClass = await page.locator('button:has-text("Primary")').first().getAttribute('class');
  expect(originalClass).toContain('px-4');

  await clickToggleButton(page);
  const frame = await getPanelFrame(page);
  await waitForPanelReady(frame);
  await page.waitForTimeout(300);
  await clickSelectElementButton(frame);

  // Click the Primary button to select it
  await page.locator('button:has-text("Primary")').first().click();
  const scrubber = frame.locator('.cursor-ew-resize').filter({ hasText: 'text-sm' }).first();
  await scrubber.waitFor({ timeout: 8000 });
  await scrubber.click();
  await page.waitForTimeout(300);

  const optionTexts = ['text-xs', 'text-base', 'text-lg', 'text-xl', 'text-2xl', 'text-3xl'];
  for (const optionText of optionTexts) {
    await frame.getByText(optionText, { exact: true }).hover();
  }

  // Move the mouse out of the panel entirely
  await page.mouse.move(400, 400);

  // Wait enough time for any in-flight fetches to resolve (they should be ignored)
  await page.waitForTimeout(1500);

  // The Primary button should have its original class back — no stale preview class
  const classAfterHover = await page.locator('button:has-text("Primary")').first().getAttribute('class');
  expect(classAfterHover).toBe(originalClass);
});
