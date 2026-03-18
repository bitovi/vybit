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
    const btn = host.shadowRoot!.querySelector('.el-add-btn') as HTMLButtonElement;
    if (!btn) throw new Error('.el-add-btn not found');
    btn.click();
  });
}

/** Read the count from the combined "N +" button in the overlay toolbar. */
async function getCountBadgeText(page: Page): Promise<string> {
  return page.evaluate(() => {
    const host = document.querySelector('#tw-visual-editor-host') as HTMLElement;
    const btn = host.shadowRoot!.querySelector('.el-add-btn') as HTMLElement;
    return btn?.textContent?.trim() ?? '';
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
  test('clicking a Tag highlights exact matches and shows toolbar with count', async ({ page }) => {
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

    // Should see 2 highlights (Frontend + Backend — both blue tags)
    const highlights = await getHighlightCount(page);
    expect(highlights).toBe(2);

    // Count button should show "2 +"
    const badge = await getCountBadgeText(page);
    expect(badge).toBe('2 +');
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

    // Should have 2 group rows: green tags (2 elements) and red tags (1 element)
    const rowCount = await getGroupRowCount(page);
    expect(rowCount).toBe(2);

    // Each row should contain diff tokens (added/removed classes)
    const diff0 = await getGroupDiffText(page, 0);
    const diff1 = await getGroupDiffText(page, 1);
    // Both groups differ by 1 added + 1 removed color class
    expect(diff0).toContain('+');
    expect(diff0).toContain('-');
    expect(diff1).toContain('+');
    expect(diff1).toContain('-');
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

    // Start with 2 highlights (2 blue tags)
    expect(await getHighlightCount(page)).toBe(2);
    expect(await getCountBadgeText(page)).toBe('2 +');

    // Open group picker and check the first group
    await clickAddGroupButton(page);
    await page.waitForTimeout(500);

    // Find which group has 2 elements (green) vs 1 element (red)
    // Groups are sorted by diff size (equal), then by element count descending
    // So green group (2 elements) should be first
    await toggleGroupRow(page, 0);
    await page.waitForTimeout(300);

    // 2 blue + 2 green = 4 highlights
    const afterFirst = await getHighlightCount(page);
    expect(afterFirst).toBe(4);
    expect(await getCountBadgeText(page)).toBe('4 +');

    // Check the second group (red, 1 element)
    await toggleGroupRow(page, 1);
    await page.waitForTimeout(300);

    // 2 blue + 2 green + 1 red = 5 highlights
    expect(await getHighlightCount(page)).toBe(5);
    expect(await getCountBadgeText(page)).toBe('5 +');
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

    // Open picker, check first group
    await clickAddGroupButton(page);
    await page.waitForTimeout(500);
    await toggleGroupRow(page, 0);
    await page.waitForTimeout(300);

    const afterCheck = await getHighlightCount(page);
    expect(afterCheck).toBeGreaterThan(2);

    // Uncheck the group
    await toggleGroupRow(page, 0);
    await page.waitForTimeout(300);

    // Should go back to 2 (exact matches only)
    expect(await getHighlightCount(page)).toBe(2);
    expect(await getCountBadgeText(page)).toBe('2 +');
  });
});
