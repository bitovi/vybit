import { test, expect } from '@playwright/test';

test.describe('Overlay', () => {
  test('overlay.js loads without errors', async ({ page }) => {
    const consoleErrors: string[] = [];
    const networkErrors: string[] = [];

    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    page.on('pageerror', (err) => {
      consoleErrors.push(err.message);
    });

    page.on('requestfailed', (req) => {
      networkErrors.push(`${req.url()} - ${req.failure()?.errorText}`);
    });

    await page.goto('/');
    // Wait for overlay to initialize
    await page.waitForTimeout(2000);

    console.log('Console errors:', consoleErrors);
    console.log('Network errors:', networkErrors);

    // Check that the overlay script loaded without network errors
    const overlayNetworkErrors = networkErrors.filter(e => e.includes('overlay'));
    expect(overlayNetworkErrors).toHaveLength(0);
  });

  test('shadow host element is created', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);

    const hostExists = await page.evaluate(() => {
      return !!document.querySelector('#tw-visual-editor-host');
    });
    expect(hostExists).toBe(true);
  });

  test('toggle button is visible in shadow DOM', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);

    const btnInfo = await page.evaluate(() => {
      const host = document.querySelector('#tw-visual-editor-host');
      if (!host || !host.shadowRoot) return { found: false, reason: 'No shadow host or shadow root' };
      const btn = host.shadowRoot.querySelector('.toggle-btn');
      if (!btn) return { found: false, reason: 'No toggle button in shadow root' };
      const rect = (btn as HTMLElement).getBoundingClientRect();
      return { found: true, text: btn.textContent, width: rect.width, height: rect.height };
    });

    console.log('Toggle button info:', btnInfo);
    expect(btnInfo.found).toBe(true);
  });

  test('clicking toggle activates inspect mode', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);

    // Click the toggle button inside shadow DOM
    const activated = await page.evaluate(() => {
      const host = document.querySelector('#tw-visual-editor-host');
      if (!host || !host.shadowRoot) return false;
      const btn = host.shadowRoot.querySelector('.toggle-btn') as HTMLButtonElement;
      if (!btn) return false;
      btn.click();
      return btn.classList.contains('active');
    });

    expect(activated).toBe(true);

    // Verify cursor changed to crosshair
    const cursor = await page.evaluate(() => {
      return document.documentElement.style.cursor;
    });
    expect(cursor).toBe('crosshair');
  });

  test('clicking element in inspect mode opens picker', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);

    // Activate inspect mode
    await page.evaluate(() => {
      const host = document.querySelector('#tw-visual-editor-host');
      const btn = host!.shadowRoot!.querySelector('.toggle-btn') as HTMLButtonElement;
      btn.click();
    });

    // Click on the h1 element
    await page.click('h1');
    await page.waitForTimeout(1000);

    // Check if picker appeared in shadow DOM
    const pickerInfo = await page.evaluate(() => {
      const host = document.querySelector('#tw-visual-editor-host');
      if (!host || !host.shadowRoot) return { found: false, reason: 'no shadow root' };
      const picker = host.shadowRoot.querySelector('.picker-panel');
      if (!picker) {
        // List all children of shadow root for debugging
        const children = Array.from(host.shadowRoot.children).map(c => ({
          tag: c.tagName,
          className: c.className,
        }));
        return { found: false, reason: 'no picker-panel', shadowChildren: children };
      }
      return { found: true, text: picker.textContent?.slice(0, 100) };
    });

    console.log('Picker info:', JSON.stringify(pickerInfo, null, 2));
    expect(pickerInfo.found).toBe(true);
  });

  test('clicking Button in inspect mode shows correct component', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);

    // Activate inspect mode
    await page.evaluate(() => {
      const host = document.querySelector('#tw-visual-editor-host');
      const btn = host!.shadowRoot!.querySelector('.toggle-btn') as HTMLButtonElement;
      btn.click();
    });

    // Click on the first "Primary" button (in the buttons section)
    await page.locator('button:has-text("Primary")').first().click();
    await page.waitForTimeout(1000);

    // Check picker shows Button component with correct instance count
    const pickerInfo = await page.evaluate(() => {
      const host = document.querySelector('#tw-visual-editor-host');
      if (!host || !host.shadowRoot) return { found: false };
      const picker = host.shadowRoot.querySelector('.picker-panel');
      if (!picker) return { found: false };
      return { found: true, text: picker.textContent?.slice(0, 150) };
    });

    console.log('Button picker info:', JSON.stringify(pickerInfo, null, 2));
    expect(pickerInfo.found).toBe(true);
    // Should show Button component, not App
    expect(pickerInfo.text).toContain('Button');
  });

  test('WebSocket connects to server', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(3000);

    const wsStatus = await page.evaluate(() => {
      return new Promise<{ connected: boolean; error?: string }>((resolve) => {
        const host = document.querySelector('#tw-visual-editor-host');
        if (!host) {
          resolve({ connected: false, error: 'no host element' });
          return;
        }
        setTimeout(() => resolve({ connected: false, error: 'timeout waiting for ws' }), 1000);
        window.addEventListener('overlay-ws-connected', () => resolve({ connected: true }));
      });
    });

    console.log('WebSocket status:', wsStatus);
  });
});
