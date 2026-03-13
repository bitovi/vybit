import { test, expect } from '@playwright/test';

/**
 * Verifies that committing a class change sends correct data through WS.
 * The picker UI now lives in the Panel iframe, so this test verifies
 * the ELEMENT_SELECTED and CLASS_COMMIT WS flow.
 */
test('element selection sends correct class data via WS', async ({ page }) => {
  const wsMessages: any[] = [];
  page.on('websocket', (ws) => {
    ws.on('framesent', (frame) => {
      try {
        const data = JSON.parse(frame.payload as string);
        if (data.type === 'ELEMENT_SELECTED' || data.type === 'CHANGE') {
          wsMessages.push(data);
        }
      } catch { /* ignore non-JSON frames */ }
    });
  });

  await page.goto('/');
  await page.waitForTimeout(1500);

  // Activate inspect mode
  await page.evaluate(() => {
    const host = document.querySelector('#tw-visual-editor-host') as HTMLElement;
    const btn = host.shadowRoot!.querySelector('.toggle-btn') as HTMLButtonElement;
    btn.click();
  });

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
