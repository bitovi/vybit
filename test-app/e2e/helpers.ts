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
 * Activates crosshair/select mode. Works in three scenarios:
 * 1. Empty state: clicks the "Select an element" content button in the panel
 * 2. Element selected: clicks ModeToggle's "Select" button (re-activates crosshair)
 * 3. Fallback: clicks the overlay toolbar's Select button
 * Uses evaluate to bypass Playwright pointer-event interception issues with
 * iframes nested inside shadow DOM.
 */
export async function clickSelectElementButton(frame: Frame): Promise<void> {
  const page = frame.page();

  // Retry a few times — UI may be briefly transitioning
  for (let attempt = 0; attempt < 10; attempt++) {
    // Try the panel's empty-state "Select an element" button
    const foundContentBtn = await frame.evaluate(() => {
      const btn =
        document.querySelector('button[title*="Select an element"]') as HTMLButtonElement | null ??
        Array.from(document.querySelectorAll('button')).find(b =>
          b.textContent?.includes('Select an element'),
        ) as HTMLButtonElement | null;
      if (btn) { btn.click(); return true; }
      return false;
    }).catch(() => false);

    if (foundContentBtn) return;

    // Try ModeToggle's "Select" button (aria-pressed, title-based match for icon-only buttons)
    const foundModeToggle = await frame.evaluate(() => {
      const btns = document.querySelectorAll('button[aria-pressed]');
      for (const b of btns) {
        if (b.textContent?.trim() === 'Select' || b.getAttribute('title')?.includes('Select')) {
          (b as HTMLButtonElement).click();
          return true;
        }
      }
      return false;
    }).catch(() => false);

    if (foundModeToggle) return;

    // Try overlay toolbar's Select button
    const foundInOverlay = await page.evaluate(() => {
      const host = document.querySelector('#tw-visual-editor-host') as HTMLElement;
      const btn = host?.shadowRoot?.querySelector('.tb-select') as HTMLButtonElement | null;
      if (btn) { btn.click(); return true; }
      return false;
    }).catch(() => false);

    if (foundInOverlay) return;

    await page.waitForTimeout(500);
  }

  throw new Error('No select button found in panel or overlay after retries');
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
