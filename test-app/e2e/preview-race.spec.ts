import { test, expect } from '@playwright/test';

/**
 * Verifies that hovering over scale chips and then leaving does NOT leave
 * a stale preview class on the page elements.
 *
 * Root cause: applyPreview does an async fetch, so CLASS_REVERT (synchronous)
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

  // Activate inspect mode
  await page.evaluate(() => {
    const host = document.querySelector('#tw-visual-editor-host') as HTMLElement;
    const btn = host.shadowRoot!.querySelector('.toggle-btn') as HTMLButtonElement;
    btn.click();
  });

  // Click the Primary button to select it
  await page.locator('button:has-text("Primary")').first().click();
  await page.waitForTimeout(1500);

  // Get the panel iframe
  let frame: import('@playwright/test').Frame | null = null;
  for (let i = 0; i < 20; i++) {
    frame = page.frames().find(f => f.url().includes('/panel')) || null;
    if (frame) break;
    await page.waitForTimeout(250);
  }
  expect(frame).toBeTruthy();

  // Wait for class chips to appear, then click the spacing chip to show scale row
  await frame!.waitForSelector('div[style*="cursor: pointer"]', { timeout: 5000 });
  const chips = await frame!.$$('div[style*="cursor: pointer"]');
  let px4Chip: import('@playwright/test').ElementHandle | null = null;
  for (const chip of chips) {
    const text = await chip.textContent();
    if (text?.trim() === 'px-4') {
      px4Chip = chip;
      break;
    }
  }
  expect(px4Chip).toBeTruthy();
  await px4Chip!.click();

  // Wait for scale row to render
  await page.waitForTimeout(500);

  // Hover over several scale chips rapidly, then leave — simulating the race condition scenario
  const scaleChips = await frame!.$$('div[style*="cursor: pointer"]');

  // Rapidly hover over a run of chips and then move away
  for (let i = 0; i < Math.min(scaleChips.length, 6); i++) {
    await scaleChips[i].hover();
    // No wait — move immediately to the next one
  }

  // Move the mouse out of the panel entirely
  await page.mouse.move(400, 400);

  // Wait enough time for any in-flight fetches to resolve (they should be ignored)
  await page.waitForTimeout(1500);

  // The Primary button should have its original class back — no stale preview class
  const classAfterHover = await page.locator('button:has-text("Primary")').first().getAttribute('class');
  expect(classAfterHover).toBe(originalClass);
});
