import { test, expect, type Frame, type Page } from '@playwright/test';

/** Get the panel iframe's bounding box in main-page coordinates. */
async function getIframePageBox(page: Page) {
  return page.evaluate(() => {
    const host = document.querySelector('#tw-visual-editor-host') as HTMLElement;
    const iframe = host.shadowRoot!.querySelector('iframe') as HTMLIFrameElement;
    const rect = iframe.getBoundingClientRect();
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  });
}

/** Wait for the panel iframe frame object. */
async function getPanelFrame(page: Page): Promise<Frame> {
  let frame: Frame | null = null;
  for (let i = 0; i < 20; i++) {
    frame = page.frames().find(f => f.url().includes('/panel')) || null;
    if (frame) break;
    await page.waitForTimeout(250);
  }
  if (!frame) throw new Error('Panel frame not found');
  return frame;
}

/** Count chips that visually appear highlighted (checks computed/animated colour). */
async function getVisuallyHighlightedChipCount(frame: Frame): Promise<number> {
  return frame.evaluate(() => {
    const PREVIEW_COLOR = 'rgb(166, 227, 161)';
    return Array.from(document.querySelectorAll('div'))
      .filter(el => window.getComputedStyle(el as HTMLElement).color === PREVIEW_COLOR)
      .length;
  });
}

/** Common setup: activate inspect, click Primary button, open scale row. */
async function setupScaleRow(page: Page): Promise<{ frame: Frame; iframeBox: { x: number; y: number; width: number; height: number } }> {
  await page.goto('/');
  await page.waitForTimeout(2000);

  await page.evaluate(() => {
    const host = document.querySelector('#tw-visual-editor-host') as HTMLElement;
    const btn = host.shadowRoot!.querySelector('.toggle-btn') as HTMLButtonElement;
    btn.click();
  });

  await page.locator('button:has-text("Primary")').first().click();
  await page.waitForTimeout(1500);

  const frame = await getPanelFrame(page);
  await frame.waitForSelector('div[style*="cursor: pointer"]', { timeout: 5000 });

  const chips = await frame.$$('div[style*="cursor: pointer"]');
  for (const chip of chips) {
    if ((await chip.textContent())?.trim() === 'px-4') {
      await chip.click();
      break;
    }
  }
  await page.waitForTimeout(500);

  const iframeBox = await getIframePageBox(page);
  return { frame, iframeBox };
}

test('no chips stay highlighted after the mouse sweeps across the scale row and leaves', async ({ page }) => {
  const { frame, iframeBox } = await setupScaleRow(page);

  const startChipBox = await frame.getByText('px-1', { exact: true }).boundingBox();
  expect(startChipBox).toBeTruthy();

  const startX = iframeBox.x + startChipBox!.x + startChipBox!.width / 2;
  const startY = iframeBox.y + startChipBox!.y + startChipBox!.height / 2;

  await page.mouse.move(startX, startY);
  await page.mouse.move(startX + 400, startY, { steps: 30 });

  // Move the mouse outside the panel entirely
  await page.mouse.move(200, 400, { steps: 10 });
  await page.waitForTimeout(300);

  expect(await getVisuallyHighlightedChipCount(frame)).toBe(0);
});

test('at most one chip appears visually highlighted (computed color) during mouse sweep', async ({ page }) => {
  const { frame, iframeBox } = await setupScaleRow(page);

  const startChipBox = await frame.getByText('px-1', { exact: true }).boundingBox();
  expect(startChipBox).toBeTruthy();

  const startX = iframeBox.x + startChipBox!.x + startChipBox!.width / 2;
  const startY = iframeBox.y + startChipBox!.y + startChipBox!.height / 2;

  // Move step-by-step and after each step wait one animation frame,
  // then count how many chips are VISUALLY green (catches CSS transition trails).
  const totalSteps = 30;
  let maxHighlighted = 0;
  for (let i = 0; i <= totalSteps; i++) {
    await page.mouse.move(startX + (i / totalSteps) * 400, startY);
    // Wait for one rAF so any CSS transition animation frame can run
    const count = await frame.evaluate(() => {
      return new Promise<number>((resolve) => {
        requestAnimationFrame(() => {
          const PREVIEW_COLOR = 'rgb(166, 227, 161)';
          const n = Array.from(document.querySelectorAll('div'))
            .filter(el => window.getComputedStyle(el as HTMLElement).color === PREVIEW_COLOR)
            .length;
          resolve(n);
        });
      });
    });
    if (count > maxHighlighted) maxHighlighted = count;
  }

  expect(maxHighlighted).toBeLessThanOrEqual(1);
});

test('no chips stay highlighted when mouse exits the iframe to the main page', async ({ page }) => {
  const { frame, iframeBox } = await setupScaleRow(page);

  const startChipBox = await frame.getByText('px-1', { exact: true }).boundingBox();
  expect(startChipBox).toBeTruthy();

  const chipX = iframeBox.x + startChipBox!.x + startChipBox!.width / 2;
  const chipY = iframeBox.y + startChipBox!.y + startChipBox!.height / 2;

  // Hover the chip via frame — Playwright correctly dispatches mouseenter inside the iframe
  await frame.getByText('px-1', { exact: true }).hover();
  await page.waitForTimeout(100);
  expect(await getVisuallyHighlightedChipCount(frame)).toBe(1);

  // Now use raw page mouse coordinates to exit the iframe to the main page.
  // This simulates the user's mouse leaving the iframe boundary without a
  // mouseleave event firing on any element inside the iframe.
  await page.mouse.move(chipX, chipY); // sync Playwright's mouse position
  await page.mouse.move(200, 400, { steps: 5 });
  await page.waitForTimeout(300);

  expect(await getVisuallyHighlightedChipCount(frame)).toBe(0);
});
