import { test, expect } from '@playwright/test';

/**
 * Verifies that blue highlight boxes disappear when the user clicks
 * a class chip in the panel after selecting an element.
 */
test.describe('Clear highlights on class chip click', () => {

  /** Helper: activate inspect mode by clicking the toggle button in shadow DOM. */
  async function activateInspectMode(page: import('@playwright/test').Page) {
    await page.evaluate(() => {
      const host = document.querySelector('#tw-visual-editor-host') as HTMLElement;
      const btn = host.shadowRoot!.querySelector('.toggle-btn') as HTMLButtonElement;
      btn.click();
    });
  }

  /** Helper: count .highlight-overlay elements in the shadow root. */
  async function getHighlightCount(page: import('@playwright/test').Page): Promise<number> {
    return page.evaluate(() => {
      const host = document.querySelector('#tw-visual-editor-host') as HTMLElement;
      return host.shadowRoot!.querySelectorAll('.highlight-overlay').length;
    });
  }

  /** Helper: get the panel iframe Frame object. */
  async function getPanelFrame(page: import('@playwright/test').Page) {
    // The iframe is inside shadow DOM, so we get its src and use page.frame()
    const iframeSrc = await page.evaluate(() => {
      const host = document.querySelector('#tw-visual-editor-host') as HTMLElement;
      const iframe = host.shadowRoot!.querySelector('iframe') as HTMLIFrameElement;
      return iframe?.src || null;
    });
    expect(iframeSrc).toBeTruthy();

    // Wait for the frame to be available
    let frame: import('@playwright/test').Frame | null = null;
    for (let i = 0; i < 20; i++) {
      frame = page.frames().find(f => f.url().includes('/panel')) || null;
      if (frame) break;
      await page.waitForTimeout(250);
    }
    expect(frame).toBeTruthy();
    return frame!;
  }

  test('highlights appear after clicking element in inspect mode', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);

    await activateInspectMode(page);

    // Click on a Button element
    await page.locator('button:has-text("Primary")').first().click();
    await page.waitForTimeout(1000);

    // Verify highlights are present
    const count = await getHighlightCount(page);
    expect(count).toBeGreaterThan(0);
  });

  test('highlights disappear when clicking a class chip in the panel', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);

    await activateInspectMode(page);

    // Click on a Button element to trigger element selection + highlights
    await page.locator('button:has-text("Primary")').first().click();
    await page.waitForTimeout(1500);

    // Verify highlights appeared
    const highlightsBefore = await getHighlightCount(page);
    expect(highlightsBefore).toBeGreaterThan(0);

    // Get the panel iframe and click a class chip (e.g. "px-4")
    const frame = await getPanelFrame(page);

    // Wait for the picker to render with class chips
    await frame.waitForSelector('div[style*="cursor: pointer"]', { timeout: 5000 });

    // Find and click the px-4 chip
    const chips = await frame.$$('div[style*="cursor: pointer"]');
    let chipClicked = false;
    for (const chip of chips) {
      const text = await chip.textContent();
      if (text?.trim() === 'px-4') {
        await chip.click();
        chipClicked = true;
        break;
      }
    }
    expect(chipClicked).toBe(true);

    // Wait for the CLEAR_HIGHLIGHTS message to be processed
    await page.waitForTimeout(500);

    // Verify highlights are gone
    const highlightsAfter = await getHighlightCount(page);
    expect(highlightsAfter).toBe(0);
  });

  test('CLEAR_HIGHLIGHTS message is sent via WebSocket when chip clicked', async ({ page }) => {
    const wsMessages: any[] = [];
    page.on('websocket', (ws) => {
      ws.on('framesent', (frame) => {
        try {
          const data = JSON.parse(frame.payload as string);
          wsMessages.push(data);
        } catch { /* ignore */ }
      });
    });

    await page.goto('/');
    await page.waitForTimeout(2000);

    await activateInspectMode(page);

    // Click on a Button element
    await page.locator('button:has-text("Primary")').first().click();
    await page.waitForTimeout(1500);

    // Get the panel iframe and click a class chip
    const frame = await getPanelFrame(page);
    await frame.waitForSelector('div[style*="cursor: pointer"]', { timeout: 5000 });

    const chips = await frame.$$('div[style*="cursor: pointer"]');
    for (const chip of chips) {
      const text = await chip.textContent();
      if (text?.trim() === 'px-4') {
        await chip.click();
        break;
      }
    }

    await page.waitForTimeout(500);

    // Check that CLEAR_HIGHLIGHTS message was sent
    const clearMsg = wsMessages.find(m => m.type === 'CLEAR_HIGHLIGHTS');
    expect(clearMsg).toBeTruthy();
    expect(clearMsg.to).toBe('overlay');
  });
});
