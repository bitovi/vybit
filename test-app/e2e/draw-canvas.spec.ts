import { test, expect, type Page, type Frame } from '@playwright/test';

async function activateInspectMode(page: Page) {
  await page.evaluate(() => {
    const host = document.querySelector('#tw-visual-editor-host') as HTMLElement;
    const btn = host.shadowRoot!.querySelector('.toggle-btn') as HTMLButtonElement;
    btn.click();
  });
}

async function getPanelFrame(page: Page): Promise<Frame> {
  let frame: Frame | null = null;
  for (let i = 0; i < 20; i++) {
    frame = page.frames().find(f => f.url().includes('/panel') && !f.url().includes('mode=design')) ?? null;
    if (frame) break;
    await page.waitForTimeout(250);
  }
  if (!frame) throw new Error('Panel frame not found');
  return frame;
}

async function getDesignFrame(page: Page): Promise<Frame> {
  let frame: Frame | null = null;
  for (let i = 0; i < 30; i++) {
    frame = page.frames().find(f => f.url().includes('mode=design')) ?? null;
    if (frame) break;
    await page.waitForTimeout(250);
  }
  if (!frame) throw new Error('Design canvas frame not found');
  return frame;
}

async function clickDrawButton(page: Page) {
  await page.evaluate(() => {
    const host = document.querySelector('#tw-visual-editor-host') as HTMLElement;
    const btn = host.shadowRoot!.querySelector('.draw-btn') as HTMLButtonElement;
    btn.click();
  });
}

async function clickDrawPopoverItem(page: Page, label: string) {
  await page.evaluate((lbl) => {
    const host = document.querySelector('#tw-visual-editor-host') as HTMLElement;
    const items = host.shadowRoot!.querySelectorAll('.draw-popover-item');
    for (const item of items) {
      if (item.textContent?.includes(lbl)) {
        (item as HTMLButtonElement).click();
        return;
      }
    }
    throw new Error(`Popover item "${lbl}" not found`);
  }, label);
}

test.describe('Draw Canvas', () => {
  test('inserts a drawing canvas, draws a stroke, and queues as a change', async ({ page }) => {
    // Track WS messages to verify design submission
    const wsMessages: any[] = [];
    page.on('websocket', (ws) => {
      ws.on('framesent', (frame) => {
        try {
          const data = JSON.parse(frame.payload as string);
          wsMessages.push(data);
        } catch { /* ignore non-JSON frames */ }
      });
    });

    await page.goto('/');
    await page.waitForTimeout(2000);

    // Activate inspector
    await activateInspectMode(page);
    const panelFrame = await getPanelFrame(page);

    // Wait for panel WS to be ready
    await panelFrame.waitForFunction(
      () => !document.body.textContent?.includes('Waiting for connection'),
      { timeout: 10000 },
    );
    await page.waitForTimeout(300);

    // Click on the Active badge to select it
    await page.locator('text=Active').first().click();
    await page.waitForTimeout(1000);

    // Verify Badge is selected in the panel
    await expect(panelFrame.locator('text=Badge')).toBeVisible({ timeout: 5000 });

    // Verify the draw button appeared on the selected element (in shadow DOM)
    const drawBtnExists = await page.evaluate(() => {
      const host = document.querySelector('#tw-visual-editor-host') as HTMLElement;
      return !!host.shadowRoot!.querySelector('.draw-btn');
    });
    expect(drawBtnExists).toBe(true);

    // Click the draw button to open the insertion popover
    await clickDrawButton(page);
    await page.waitForTimeout(300);

    // Click "Before element" in the popover to insert the design canvas
    await clickDrawPopoverItem(page, 'Before element');

    // Wait for the design canvas wrapper to appear in the DOM
    await expect(page.locator('[data-tw-design-canvas]')).toBeVisible({ timeout: 5000 });

    // Get the design canvas iframe
    const designFrame = await getDesignFrame(page);

    // Verify the drawing toolbar is visible
    await expect(designFrame.getByRole('button', { name: '✎' })).toBeVisible({ timeout: 5000 });
    await expect(designFrame.getByRole('button', { name: '✓ Queue as Change' })).toBeVisible();

    // The freehand tool should be active by default — draw a stroke
    // We need to find the drawable area inside the design iframe.
    // The iframe's bounding box in the main page gives us the offset.
    const iframeEl = page.locator('[data-tw-design-canvas] iframe');
    const iframeBox = await iframeEl.boundingBox();
    expect(iframeBox).toBeTruthy();

    // Inside the iframe, the canvas container sits between toolbar (top) and footer (bottom).
    // Get the canvas container's position within the iframe via evaluate.
    const canvasBox = await designFrame.evaluate(() => {
      const container = document.querySelector('[data-testid="design-canvas"] .flex-1');
      if (!container) return null;
      const rect = container.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    });
    expect(canvasBox).toBeTruthy();

    // Convert iframe-relative coords to page coords
    const drawAreaLeft = iframeBox!.x + canvasBox!.x;
    const drawAreaTop = iframeBox!.y + canvasBox!.y;
    const drawAreaWidth = canvasBox!.width;
    const drawAreaHeight = canvasBox!.height;

    // Draw a diagonal line across the middle of the canvas area
    const startX = drawAreaLeft + drawAreaWidth * 0.15;
    const startY = drawAreaTop + drawAreaHeight * 0.3;
    const endX = drawAreaLeft + drawAreaWidth * 0.85;
    const endY = drawAreaTop + drawAreaHeight * 0.7;

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    // Add intermediate points for a more realistic stroke
    for (let i = 1; i <= 10; i++) {
      const t = i / 10;
      await page.mouse.move(
        startX + (endX - startX) * t,
        startY + (endY - startY) * t,
      );
    }
    await page.mouse.up();
    await page.waitForTimeout(500);

    // Verify undo button is now enabled (meaning a stroke was recorded)
    await expect(designFrame.getByRole('button', { name: '↶' })).toBeEnabled({ timeout: 3000 });

    // Click "Queue as Change" to submit the drawing
    await designFrame.getByRole('button', { name: '✓ Queue as Change' }).click();
    await page.waitForTimeout(1000);

    // Verify DESIGN_SUBMIT was sent via WebSocket
    const designSubmit = wsMessages.find(m => m.type === 'DESIGN_SUBMIT');
    expect(designSubmit).toBeTruthy();
    expect(designSubmit.image).toMatch(/^data:image\/png;base64,/);
    expect(designSubmit.insertMode).toBe('before');
    expect(designSubmit.canvasWidth).toBeGreaterThan(0);
    expect(designSubmit.canvasHeight).toBeGreaterThan(0);
    // componentName may be empty if ELEMENT_CONTEXT hasn't arrived yet (timing)
  });

  test('close button removes the drawing canvas', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);

    await activateInspectMode(page);
    const panelFrame = await getPanelFrame(page);

    await panelFrame.waitForFunction(
      () => !document.body.textContent?.includes('Waiting for connection'),
      { timeout: 10000 },
    );
    await page.waitForTimeout(300);

    // Click on a badge
    await page.locator('text=Active').first().click();
    await page.waitForTimeout(1000);

    // Verify Badge is selected
    await expect(panelFrame.locator('text=Badge')).toBeVisible({ timeout: 5000 });

    // Click the draw button and insert canvas via the popover
    await clickDrawButton(page);
    await page.waitForTimeout(300);
    await clickDrawPopoverItem(page, 'Before element');

    // Verify canvas appears
    await expect(page.locator('[data-tw-design-canvas]')).toBeVisible({ timeout: 5000 });

    // Get the design frame and click close
    const designFrame = await getDesignFrame(page);
    await designFrame.getByRole('button', { name: '✕ Close' }).click();

    // Verify canvas is removed from the page
    await expect(page.locator('[data-tw-design-canvas]')).toHaveCount(0, { timeout: 5000 });
  });
});
