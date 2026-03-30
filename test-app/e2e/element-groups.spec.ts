import { test, expect, type Page } from '@playwright/test';
import {
  clickToggleButton,
  getPanelFrame,
  waitForPanelReady,
  clickSelectElementButton,
  getHighlightCount,
} from './helpers';

/** Click the "+ ▼" button in the overlay toolbar to open the group picker. */
async function clickAddGroupButton(page: Page) {
  await page.evaluate(() => {
    const host = document.querySelector('#tw-visual-editor-host') as HTMLElement;
    const btn = host.shadowRoot!.querySelector('.tb-adjunct') as HTMLButtonElement;
    if (!btn) throw new Error('.tb-adjunct not found');
    btn.click();
  });
}

/** Read the count from the combined "N +" button in the overlay toolbar. */
async function getCountBadgeText(page: Page): Promise<string> {
  return page.evaluate(() => {
    const host = document.querySelector('#tw-visual-editor-host') as HTMLElement;
    const btn = host.shadowRoot!.querySelector('.tb-adjunct') as HTMLElement;
    return btn?.textContent?.trim().replace(/\s+/g, ' ') ?? '';
  });
}

/** Return the number of group rows in the currently open group picker. */
async function getGroupRowCount(page: Page): Promise<number> {
  return page.evaluate(() => {
    const host = document.querySelector('#tw-visual-editor-host') as HTMLElement;
    return host.shadowRoot!.querySelectorAll('.el-group-row').length;
  });
}

/** Check or uncheck the group row at the given 0-based index. */
async function toggleGroupRow(page: Page, index: number) {
  await page.evaluate((idx) => {
    const host = document.querySelector('#tw-visual-editor-host') as HTMLElement;
    const rows = host.shadowRoot!.querySelectorAll('.el-group-row');
    const cb = rows[idx]?.querySelector('input[type=checkbox]') as HTMLInputElement;
    if (!cb) throw new Error(`Group row ${idx} checkbox not found`);
    cb.click();
  }, index);
}

/** Return the diff text for a group row at the given index. */
async function getGroupDiffText(page: Page, index: number): Promise<string> {
  return page.evaluate((idx) => {
    const host = document.querySelector('#tw-visual-editor-host') as HTMLElement;
    const rows = host.shadowRoot!.querySelectorAll('.el-group-row');
    const diff = rows[idx]?.querySelector('.el-group-diff') as HTMLElement;
    return diff?.textContent?.trim() ?? '';
  }, index);
}

/** Count .highlight-preview elements (hover preview outlines). */
async function getPreviewHighlightCount(page: Page): Promise<number> {
  return page.evaluate(() => {
    const host = document.querySelector('#tw-visual-editor-host') as HTMLElement;
    return host.shadowRoot!.querySelectorAll('.highlight-preview').length;
  });
}

/** Hover over a group row at the given index. */
async function hoverGroupRow(page: Page, index: number) {
  // We need to dispatch mouseenter via JS since the element is in shadow DOM
  await page.evaluate((idx) => {
    const host = document.querySelector('#tw-visual-editor-host') as HTMLElement;
    const rows = host.shadowRoot!.querySelectorAll('.el-group-row');
    const row = rows[idx] as HTMLElement;
    if (!row) throw new Error(`Group row ${idx} not found`);
    row.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false }));
  }, index);
}

/** Un-hover a group row (mouseleave). */
async function unhoverGroupRow(page: Page, index: number) {
  await page.evaluate((idx) => {
    const host = document.querySelector('#tw-visual-editor-host') as HTMLElement;
    const rows = host.shadowRoot!.querySelectorAll('.el-group-row');
    const row = rows[idx] as HTMLElement;
    if (!row) throw new Error(`Group row ${idx} not found`);
    row.dispatchEvent(new MouseEvent('mouseleave', { bubbles: false }));
  }, index);
}

test.describe('Element Groups', () => {
  test('clicking a Tag highlights only the clicked element (single-select)', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);

    await clickToggleButton(page);
    const frame = await getPanelFrame(page);
    await waitForPanelReady(frame);
    await page.waitForTimeout(300);

    // Activate select mode and click the "Frontend" blue tag
    await clickSelectElementButton(frame);
    await page.locator('text=Frontend').first().click();
    await page.waitForTimeout(500);

    // Should see 1 highlight (only the clicked element)
    const highlights = await getHighlightCount(page);
    expect(highlights).toBe(1);

    // Count button should show "1 +"
    const badge = await getCountBadgeText(page);
    expect(badge).toBe('1 +');
  });

  test('checking "All exact matches" adds all identical elements', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);

    await clickToggleButton(page);
    const frame = await getPanelFrame(page);
    await waitForPanelReady(frame);
    await page.waitForTimeout(300);

    // Select a blue tag (single element)
    await clickSelectElementButton(frame);
    await page.locator('text=Frontend').first().click();
    await page.waitForTimeout(500);
    expect(await getHighlightCount(page)).toBe(1);

    // Open the group picker
    await clickAddGroupButton(page);
    await page.waitForTimeout(500);

    // Check the "All exact matches" checkbox (first row in the Add section)
    await toggleGroupRow(page, 0);
    await page.waitForTimeout(300);

    // Should now have 2 highlights (both blue tags)
    expect(await getHighlightCount(page)).toBe(2);
    expect(await getCountBadgeText(page)).toBe('2 +');
  });

  test('opening group picker shows near-groups for Tag variants', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);

    await clickToggleButton(page);
    const frame = await getPanelFrame(page);
    await waitForPanelReady(frame);
    await page.waitForTimeout(300);

    // Select a blue tag
    await clickSelectElementButton(frame);
    await page.locator('text=Frontend').first().click();
    await page.waitForTimeout(500);

    // Open the group picker via "+ ▼" button
    await clickAddGroupButton(page);
    await page.waitForTimeout(500);

    // Should have group rows in the Similar section (green tags and red tags)
    const rowCount = await getGroupRowCount(page);
    expect(rowCount).toBeGreaterThanOrEqual(2);
  });

  test('hovering a group row shows preview highlights', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);

    await clickToggleButton(page);
    const frame = await getPanelFrame(page);
    await waitForPanelReady(frame);
    await page.waitForTimeout(300);

    await clickSelectElementButton(frame);
    await page.locator('text=Frontend').first().click();
    await page.waitForTimeout(500);

    await clickAddGroupButton(page);
    await page.waitForTimeout(500);

    // No preview highlights initially
    expect(await getPreviewHighlightCount(page)).toBe(0);

    // Hover the first group row → should show preview highlights
    await hoverGroupRow(page, 0);
    await page.waitForTimeout(200);
    const previews = await getPreviewHighlightCount(page);
    expect(previews).toBeGreaterThan(0);

    // Un-hover → preview highlights should disappear
    await unhoverGroupRow(page, 0);
    await page.waitForTimeout(200);
    expect(await getPreviewHighlightCount(page)).toBe(0);
  });

  test('checking a group checkbox adds elements to selection', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);

    await clickToggleButton(page);
    const frame = await getPanelFrame(page);
    await waitForPanelReady(frame);
    await page.waitForTimeout(300);

    await clickSelectElementButton(frame);
    await page.locator('text=Frontend').first().click();
    await page.waitForTimeout(500);

    // Start with 1 highlight (single-select)
    expect(await getHighlightCount(page)).toBe(1);
    expect(await getCountBadgeText(page)).toBe('1 +');

    // Open group picker — first check "All exact matches" to get to 2
    await clickAddGroupButton(page);
    await page.waitForTimeout(500);
    await toggleGroupRow(page, 0); // All exact matches
    await page.waitForTimeout(300);
    expect(await getHighlightCount(page)).toBe(2);

    // Now check a Similar group row (index depends on how many "Add" rows exist)
    // Find the similar group rows — they come after the Add section
    const totalRows = await getGroupRowCount(page);
    if (totalRows > 1) {
      // Check the last group row (a Similar group)
      await toggleGroupRow(page, totalRows - 1);
      await page.waitForTimeout(300);
      const afterGroup = await getHighlightCount(page);
      expect(afterGroup).toBeGreaterThan(2);
    }
  });

  test('unchecking a group checkbox removes elements from selection', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);

    await clickToggleButton(page);
    const frame = await getPanelFrame(page);
    await waitForPanelReady(frame);
    await page.waitForTimeout(300);

    await clickSelectElementButton(frame);
    await page.locator('text=Frontend').first().click();
    await page.waitForTimeout(500);

    // Open picker, check "All exact matches"
    await clickAddGroupButton(page);
    await page.waitForTimeout(500);
    await toggleGroupRow(page, 0);
    await page.waitForTimeout(300);

    const afterCheck = await getHighlightCount(page);
    expect(afterCheck).toBe(2);

    // Uncheck
    await toggleGroupRow(page, 0);
    await page.waitForTimeout(300);

    // Should go back to 1 (single element)
    expect(await getHighlightCount(page)).toBe(1);
    expect(await getCountBadgeText(page)).toBe('1 +');
  });

  test('shift+click adds element to selection', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);

    await clickToggleButton(page);
    const frame = await getPanelFrame(page);
    await waitForPanelReady(frame);
    await page.waitForTimeout(300);

    await clickSelectElementButton(frame);
    await page.locator('text=Frontend').first().click();
    await page.waitForTimeout(500);
    expect(await getHighlightCount(page)).toBe(1);

    // Shift+click a different element
    await page.locator('text=Backend').first().click({ modifiers: ['Shift'] });
    await page.waitForTimeout(500);

    // Should now have 2 highlights
    expect(await getHighlightCount(page)).toBe(2);
    expect(await getCountBadgeText(page)).toBe('2 +');
  });

  test('shift+click a selected element removes it', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);

    await clickToggleButton(page);
    const frame = await getPanelFrame(page);
    await waitForPanelReady(frame);
    await page.waitForTimeout(300);

    await clickSelectElementButton(frame);
    await page.locator('text=Frontend').first().click();
    await page.waitForTimeout(500);

    // Add another element
    await page.locator('text=Backend').first().click({ modifiers: ['Shift'] });
    await page.waitForTimeout(500);
    expect(await getHighlightCount(page)).toBe(2);

    // Shift+click the second element to remove it
    await page.locator('text=Backend').first().click({ modifiers: ['Shift'] });
    await page.waitForTimeout(500);
    expect(await getHighlightCount(page)).toBe(1);
  });
});
