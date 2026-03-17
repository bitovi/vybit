import { test, expect } from '@playwright/test';
import { clickToggleButton, getPanelFrame, waitForPanelReady, clickSelectElementButton } from './helpers';

/**
 * Verifies that selecting an element sends correct data through WS.
 * The picker UI lives in the Panel iframe; this test verifies
 * the ELEMENT_SELECTED WS flow.
 */
test('element selection sends correct class data via WS', async ({ page }) => {
  const wsMessages: any[] = [];
  page.on('websocket', (ws) => {
    ws.on('framesent', (frame) => {
      try {
        const data = JSON.parse(frame.payload as string);
        if (data.type === 'ELEMENT_SELECTED' || data.type === 'PATCH_STAGED') {
          wsMessages.push(data);
        }
      } catch { /* ignore non-JSON frames */ }
    });
  });

  await page.goto('/');
  await page.waitForTimeout(1500);

  await clickToggleButton(page);
  const frame = await getPanelFrame(page);
  await waitForPanelReady(frame);
  await page.waitForTimeout(300);
  await clickSelectElementButton(frame);

  // Click the Primary button to send ELEMENT_SELECTED
  await page.locator('button:has-text("Primary")').first().click();
  await page.waitForTimeout(1000);

  // Verify ELEMENT_SELECTED was sent with the correct classes
  const selected = wsMessages.find(m => m.type === 'ELEMENT_SELECTED');
  expect(selected).toBeTruthy();
  expect(selected.classes).toContain('px-4');
  expect(selected.componentName).toBe('Button');

  // Verify the button still has its original class in the DOM
  const originalClass = await page.locator('button:has-text("Primary")').first().getAttribute('class');
  expect(originalClass).toContain('px-4');
});
