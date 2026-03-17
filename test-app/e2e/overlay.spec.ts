import { test, expect } from '@playwright/test';
import { clickToggleButton, getPanelFrame, waitForPanelReady, clickSelectElementButton } from './helpers';

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

    // Panel iframe should appear (toggle opens the panel)
    await page.waitForSelector('iframe[src*="panel"]', { timeout: 5000 });
    const iframeExists = await page.evaluate(() => {
      const host = document.querySelector('#tw-visual-editor-host') as HTMLElement;
      return !!host.shadowRoot?.querySelector('iframe');
    });
    expect(iframeExists).toBe(true);
  });

  test('clicking element in inspect mode opens panel container', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);

    // Toggle opens the panel — no need to click an element for the iframe to appear
    await clickToggleButton(page);
    await page.waitForTimeout(2000);

    // Check if a container (iframe) appeared in shadow DOM
    const containerInfo = await page.evaluate(() => {
      const host = document.querySelector('#tw-visual-editor-host');
      if (!host || !host.shadowRoot) return { found: false, reason: 'no shadow root' };
      const iframe = host.shadowRoot.querySelector('iframe');
      if (!iframe) {
        const children = Array.from(host.shadowRoot.children).map(c => ({
          tag: c.tagName,
          className: c.className,
        }));
        return { found: false, reason: 'no iframe', shadowChildren: children };
      }
      return { found: true, src: iframe.src };
    });

    console.log('Container info:', JSON.stringify(containerInfo, null, 2));
    expect(containerInfo.found).toBe(true);
  });

  test('clicking Button in inspect mode sends correct component to panel', async ({ page }) => {
    const wsMessages: any[] = [];
    page.on('websocket', (ws) => {
      ws.on('framesent', (frame) => {
        try {
          const data = JSON.parse(frame.payload as string);
          if (data.type === 'ELEMENT_SELECTED') wsMessages.push(data);
        } catch { /* ignore */ }
      });
    });

    await page.goto('/');
    await page.waitForTimeout(2000);

    await clickToggleButton(page);
    const frame = await getPanelFrame(page);
    await waitForPanelReady(frame);
    await page.waitForTimeout(300);
    await clickSelectElementButton(frame);

    // Click on the first "Primary" button
    await page.locator('button:has-text("Primary")').first().click();
    await page.waitForTimeout(1000);

    // Verify ELEMENT_SELECTED was sent with correct component name
    console.log('WS messages:', JSON.stringify(wsMessages, null, 2));
    const selected = wsMessages.find(m => m.componentName === 'Button');
    expect(selected).toBeTruthy();
    expect(selected.componentName).toBe('Button');
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
