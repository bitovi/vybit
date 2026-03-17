import { test, expect, type Frame } from '@playwright/test';
import { openAndSelectElement, getHighlightCount } from './helpers';

/** Find the ScaleScrubber chip (cursor-ew-resize) whose trimmed text matches the given class. */
async function findScrubberChip(frame: Frame, className: string) {
  const locator = frame.locator('.cursor-ew-resize').filter({ hasText: className });
  try {
    await locator.first().waitFor({ timeout: 5000 });
    return locator.first();
  } catch {
    return null;
  }
}

test.describe('ScaleScrubber clears highlights on interaction', () => {
  test('highlights are removed when the user pointer-downs a ScaleScrubber chip', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);

    const primaryBtn = page.locator('button:has-text("Primary")').first();
    const frame = await openAndSelectElement(page, primaryBtn);
    await frame.locator('.cursor-ew-resize').first().waitFor({ timeout: 8000 });

    const highlightsBefore = await getHighlightCount(page);
    expect(highlightsBefore, 'Highlights should appear after clicking an element').toBeGreaterThan(0);

    const chip = await findScrubberChip(frame, 'text-sm');
    expect(chip, 'text-sm ScaleScrubber chip should be present in the panel').not.toBeNull();

    await chip!.click();
    await page.waitForTimeout(500);

    const highlightsAfter = await getHighlightCount(page);
    expect(highlightsAfter, 'Highlights should be cleared after pointer-down on the scrubber chip').toBe(0);
  });

  test('highlights are removed when the user opens the ScaleScrubber dropdown and hovers an option', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);

    const primaryBtn = page.locator('button:has-text("Primary")').first();
    const frame = await openAndSelectElement(page, primaryBtn);
    await frame.locator('.cursor-ew-resize').first().waitFor({ timeout: 8000 });

    expect(await getHighlightCount(page)).toBeGreaterThan(0);

    const chip = await findScrubberChip(frame, 'text-sm');
    expect(chip).not.toBeNull();

    await chip!.click();
    await page.waitForTimeout(500);

    // Hover over a dropdown option to trigger a preview
    const option = frame.getByText('text-base', { exact: true });
    await option.hover();
    await page.waitForTimeout(300);

    const highlightsAfter = await getHighlightCount(page);
    expect(highlightsAfter, 'Highlights should be gone after opening scrubber dropdown and hovering an option').toBe(0);
  });
});
