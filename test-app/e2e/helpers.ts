import { type Page, type Frame, type Locator } from '@playwright/test';

/**
 * Clicks the overlay toggle button to open the inspector panel.
 * Does NOT activate select mode — use clickSelectElementButton() to do that.
 */
export async function clickToggleButton(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const host = document.querySelector('#tw-visual-editor-host') as HTMLElement;
    return !!(host?.shadowRoot?.querySelector('.toggle-btn'));
  }, { timeout: 5000 });
  await page.evaluate(() => {
    const host = document.querySelector('#tw-visual-editor-host') as HTMLElement;
    const btn = host.shadowRoot!.querySelector('.toggle-btn') as HTMLButtonElement;
    btn.click();
  });
}

/**
 * Returns the panel iframe Frame object, waiting up to 8s for it to appear.
 * Excludes the design canvas frame (mode=design).
 */
export async function getPanelFrame(page: Page): Promise<Frame> {
  // First ensure the iframe is in the shadow DOM
  await page.waitForFunction(() => {
    const host = document.querySelector('#tw-visual-editor-host') as HTMLElement;
    return !!(host?.shadowRoot?.querySelector('iframe'));
  }, { timeout: 8000 });
  let frame: Frame | null = null;
  for (let i = 0; i < 20; i++) {
    frame =
      page.frames().find(f => f.url().includes('/panel') && !f.url().includes('mode=design')) ??
      null;
    if (frame) break;
    await page.waitForTimeout(250);
  }
  if (!frame) throw new Error('Panel frame not found');
  return frame;
}

/**
 * Waits for the panel WebSocket to connect.
 */
export async function waitForPanelReady(frame: Frame): Promise<void> {
  await frame.waitForFunction(
    () => !document.body.textContent?.includes('Waiting for connection'),
    { timeout: 10000 },
  );
}

/**
 * Clicks the "Select an element" button in the panel header, activating crosshair mode.
 * Uses frame.evaluate to bypass Playwright pointer-event interception issues with
 * iframes nested inside shadow DOM.
 */
export async function clickSelectElementButton(frame: Frame): Promise<void> {
  await frame.waitForSelector('button[title*="Select an element"]', { timeout: 5000 });
  await frame.evaluate(() => {
    const btn = document.querySelector('button[title*="Select an element"]') as HTMLButtonElement | null;
    if (!btn) throw new Error('SelectElementButton not found');
    btn.click();
  });
}

/**
 * Counts .highlight-overlay elements in the shadow root.
 */
export async function getHighlightCount(page: Page): Promise<number> {
  return page.evaluate(() => {
    const host = document.querySelector('#tw-visual-editor-host') as HTMLElement;
    return host.shadowRoot!.querySelectorAll('.highlight-overlay').length;
  });
}

/**
 * Full 3-step flow: open inspector → wait for panel → activate select mode → click element.
 * Returns the panel Frame.
 */
export async function openAndSelectElement(page: Page, locator: Locator): Promise<Frame> {
  await clickToggleButton(page);
  const frame = await getPanelFrame(page);
  await waitForPanelReady(frame);
  await page.waitForTimeout(300);
  await clickSelectElementButton(frame);
  await locator.click();
  return frame;
}
