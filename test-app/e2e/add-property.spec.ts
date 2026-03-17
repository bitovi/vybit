import { test, expect } from '@playwright/test';
import { openAndSelectElement } from './helpers';

test.describe('Add property via + button', () => {
  test('clicking + shows available properties and selecting one shows a ghost scrubber', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);

    // Select a Card title which likely has text classes but no width
    const heading = page.locator('h1').first();
    const frame = await openAndSelectElement(page, heading);
    await frame.locator('text=SIZING').first().waitFor({ timeout: 8000 });

    // Find the Sizing section's + button
    const sizingSection = frame.locator('text=SIZING').first();
    await expect(sizingSection).toBeVisible();

    // Click the + button near the Sizing section header
    const addBtn = frame.locator('button[aria-label="Add Sizing property"]');
    await expect(addBtn).toBeVisible();
    await addBtn.click();

    // Dropdown should show available sizing properties
    const widthOption = frame.locator('button', { hasText: 'Width' });
    await expect(widthOption.first()).toBeVisible();

    // Select "Width"
    await widthOption.first().click();

    // A ghost-styled ScaleScrubber should appear (dashed border) - it's a chip you can click
    const ghostScrubber = frame.locator('.cursor-ew-resize').filter({ hasText: /w-/ });
    await expect(ghostScrubber.first()).toBeVisible({ timeout: 3000 });
  });

  test('clicking the ghost scrubber opens dropdown and committing retains the value', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);

    const heading = page.locator('h1').first();
    const frame = await openAndSelectElement(page, heading);
    await frame.locator('text=SIZING').first().waitFor({ timeout: 8000 });

    // Add width via + button
    const addBtn = frame.locator('button[aria-label="Add Sizing property"]');
    await addBtn.click();
    await frame.locator('button', { hasText: 'Width' }).first().click();

    // Ghost-styled ScaleScrubber should be visible
    const ghostScrubber = frame.locator('.cursor-ew-resize').filter({ hasText: /w-/ });
    await expect(ghostScrubber.first()).toBeVisible({ timeout: 3000 });

    // Click the ghost scrubber — dropdown should open immediately (one click)
    await ghostScrubber.first().click();
    await page.waitForTimeout(300);

    // The dropdown should now show values
    const dropdownItem = frame.locator('text=w-4').first();
    await expect(dropdownItem).toBeVisible({ timeout: 3000 });

    // Click w-4 to commit the value
    await dropdownItem.click();
    await page.waitForTimeout(1000);

    // The value should be retained as a visible chip showing w-4
    const committedChip = frame.locator('.cursor-ew-resize', { hasText: 'w-4' });
    await expect(committedChip).toBeVisible({ timeout: 5000 });
  });
});
