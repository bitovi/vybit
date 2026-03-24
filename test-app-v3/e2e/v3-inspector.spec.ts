import { test, expect, type Page, type Frame } from '@playwright/test';

/**
 * Shared E2E helpers for the Tailwind v3 test app.
 * The overlay runs over WS to localhost:3334 (the v3 server).
 */

async function activateInspectMode(page: Page) {
  await page.evaluate(() => {
    const host = document.querySelector('#tw-visual-editor-host') as HTMLElement;
    const btn = host.shadowRoot!.querySelector('.toggle-btn') as HTMLButtonElement;
    btn.click();
  });
}

async function getPanelFrame(page: Page): Promise<Frame> {
  let frame: Frame | null = null;
  for (let i = 0; i < 30; i++) {
    frame = page.frames().find(f => f.url().includes('/panel')) ?? null;
    if (frame) break;
    await page.waitForTimeout(250);
  }
  if (!frame) throw new Error('Panel frame not found');
  return frame;
}

async function selectElementAndWaitForPanel(
  page: Page,
  locator: import('@playwright/test').Locator,
): Promise<Frame> {
  const frame = await getPanelFrame(page);

  // Wait until the panel WS is connected
  await frame.waitForFunction(
    () => !document.body.textContent?.includes('Waiting for connection'),
    { timeout: 15000 },
  );

  // Small buffer for the REGISTER message to be processed
  await page.waitForTimeout(500);

  // Activate select mode in the panel before clicking the target element
  await frame.waitForSelector('button[title*="Select an element"]', { timeout: 5000 });
  await frame.evaluate(() => {
    const btn = document.querySelector('button[title*="Select an element"]') as HTMLButtonElement | null;
    if (!btn) throw new Error('SelectElementButton not found');
    btn.click();
  });

  await locator.click();

  // Wait for the panel to render box-model slots or scrubber chips
  await frame.locator('[data-layer="padding"] .bm-slot, .cursor-ew-resize').first().waitFor({ timeout: 10000 });
  return frame;
}

async function getFooterCount(frame: Frame, label: string): Promise<number> {
  const button = frame.getByRole('button', { name: new RegExp(`\\d+ ${label}`) }).first();
  await button.waitFor({ timeout: 5000 });
  const text = (await button.textContent()) ?? '';
  return parseInt(text.match(/(\d+)/)?.[1] ?? '0', 10);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Tailwind v3 — Inspector basics', () => {
  test('page loads with header', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1')).toContainText('Tailwind Visual Editor');
  });

  test('overlay toggle button appears', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);

    const hasToggle = await page.evaluate(() => {
      const host = document.querySelector('#tw-visual-editor-host') as HTMLElement;
      return !!host?.shadowRoot?.querySelector('.toggle-btn');
    });
    expect(hasToggle).toBe(true);
  });

  test('clicking inspector toggle then clicking an element opens the panel', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);

    await activateInspectMode(page);

    // Click a button element
    await page.locator('button:has-text("Primary")').first().click();
    await page.waitForTimeout(1000);

    // Panel iframe should appear
    const frame = await getPanelFrame(page);
    expect(frame).toBeTruthy();
  });

  test('selecting an element shows parsed classes in the panel', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);

    await activateInspectMode(page);

    const frame = await selectElementAndWaitForPanel(
      page,
      page.locator('button:has-text("Primary")').first(),
    );

    // The panel should show some class-related controls (box model, scrubbers, etc.)
    // For Button with `px-4 py-2 rounded-md text-sm font-medium`, expect padding slots
    const paddingSlots = frame.locator('[data-layer="padding"] .bm-slot');
    const count = await paddingSlots.count();
    expect(count).toBeGreaterThan(0);
  });
});

test.describe('Tailwind v3 — Value change and commit', () => {
  test('changing a box-model value stages a patch', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);

    await activateInspectMode(page);

    const frame = await selectElementAndWaitForPanel(
      page,
      page.locator('button:has-text("Primary")').first(),
    );

    // Check draft count starts at 0
    const draftBefore = await getFooterCount(frame, 'draft');
    expect(draftBefore).toBe(0);

    // Click a padding slot to open the mini-dropdown
    const slot = frame.locator('[data-layer="padding"] .bm-slot', { hasText: 'x-4' }).first();
    await slot.waitFor({ timeout: 5000 });
    await slot.click();

    // Select a different value
    const dropdownItem = frame.locator('.bm-mini-dropdown-item', { hasText: /^px-6$/ }).first();
    await dropdownItem.waitFor({ timeout: 3000 });
    await dropdownItem.click();

    // Draft count should now be 1
    await expect.poll(async () => getFooterCount(frame, 'draft')).toBeGreaterThan(0);
  });

  test('committing a staged change increments the committed count', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);

    await activateInspectMode(page);

    const frame = await selectElementAndWaitForPanel(
      page,
      page.locator('button:has-text("Primary")').first(),
    );

    const committedBefore = await getFooterCount(frame, 'committed');

    // Stage a change: px-4 → px-6
    const slot = frame.locator('[data-layer="padding"] .bm-slot', { hasText: 'x-4' }).first();
    await slot.waitFor({ timeout: 5000 });
    await slot.click();

    const dropdownItem = frame.locator('.bm-mini-dropdown-item', { hasText: /^px-6$/ }).first();
    await dropdownItem.waitFor({ timeout: 3000 });
    await dropdownItem.click();

    // Wait for draft count > 0
    await expect.poll(async () => getFooterCount(frame, 'draft')).toBeGreaterThan(0);

    // Click "draft" button to open popover, then "Commit All"
    const draftButton = frame.getByRole('button', { name: /[1-9]\d* draft/ }).first();
    await draftButton.waitFor({ timeout: 5000 });
    await draftButton.click();

    const commitAllButton = frame.getByRole('button', { name: 'Commit All' });
    await commitAllButton.waitFor({ timeout: 3000 });
    await commitAllButton.click();

    // Committed count should increase
    await expect
      .poll(async () => (await getFooterCount(frame, 'committed')) > committedBefore)
      .toBe(true);
  });
});

test.describe('Tailwind v3 — CSS preview injection', () => {
  test('server generates valid CSS for v3 utility classes', async ({ page }) => {
    // Directly test the /css endpoint to make sure v3 PostCSS pipeline works
    const response = await page.request.post('http://localhost:3334/css', {
      data: { classes: ['px-8', 'bg-red-500', 'text-lg', 'rounded-xl'] },
    });
    expect(response.ok()).toBe(true);
    const body = await response.json();
    expect(body.css).toContain('.px-8');
    expect(body.css).toContain('.bg-red-500');
    expect(body.css).toContain('.text-lg');
    expect(body.css).toContain('.rounded-xl');
  });

  test('server reports tailwind version 3', async ({ page }) => {
    const response = await page.request.get('http://localhost:3334/api/info');
    expect(response.ok()).toBe(true);
    const body = await response.json();
    expect(body.tailwindVersion).toBe(3);
  });
});
