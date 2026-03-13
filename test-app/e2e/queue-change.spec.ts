import { test, expect } from '@playwright/test';

/**
 * Verifies that queuing a padding change sends the ORIGINAL class string
 * (pre-preview) rather than the post-preview DOM state.
 */
test('queued change uses original classes, not preview state', async ({ page }) => {
  const sentMessages: any[] = [];
  page.on('websocket', (ws) => {
    ws.on('framesent', (frame) => {
      try {
        const data = JSON.parse(frame.payload as string);
        if (data.type === 'CHANGE') sentMessages.push(data);
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

  // Click the Primary button to open the picker
  await page.locator('button:has-text("Primary")').first().click();
  await page.waitForTimeout(500);

  const pickerText = await page.evaluate(() => {
    const host = document.querySelector('#tw-visual-editor-host') as HTMLElement;
    return host.shadowRoot!.querySelector('.picker-panel')?.textContent ?? '';
  });
  expect(pickerText).toContain('px-4');

  const originalClass = await page.locator('button:has-text("Primary")').first().getAttribute('class');
  expect(originalClass).toContain('px-4');

  // Click the px-4 chip to expand the spacing scale
  const px4ChipBox = await page.evaluate(() => {
    const host = document.querySelector('#tw-visual-editor-host') as HTMLElement;
    const chips = Array.from(host.shadowRoot!.querySelectorAll('.picker-class-chip')) as HTMLElement[];
    const chip = chips.find(c => c.textContent?.trim() === 'px-4');
    return chip?.getBoundingClientRect();
  });
  expect(px4ChipBox).toBeTruthy();
  await page.mouse.click(px4ChipBox!.x + px4ChipBox!.width / 2, px4ChipBox!.y + px4ChipBox!.height / 2);
  await page.waitForTimeout(300);

  const scaleVisible = await page.evaluate(() => {
    const host = document.querySelector('#tw-visual-editor-host') as HTMLElement;
    return !!host.shadowRoot!.querySelector('.picker-scale');
  });
  expect(scaleVisible).toBe(true);

  // Click px-10 — this applies the preview and locks the selection
  const px10ChipBox = await page.evaluate(() => {
    const host = document.querySelector('#tw-visual-editor-host') as HTMLElement;
    const chips = Array.from(host.shadowRoot!.querySelectorAll('.picker-scale-chip')) as HTMLElement[];
    const chip = chips.find(c => c.textContent?.trim() === 'px-10');
    return chip?.getBoundingClientRect();
  });
  expect(px10ChipBox).toBeTruthy();
  await page.mouse.click(px10ChipBox!.x + px10ChipBox!.width / 2, px10ChipBox!.y + px10ChipBox!.height / 2);
  await page.waitForTimeout(300);

  // Preview is now active: DOM shows px-10
  const classAfterPreview = await page.locator('button:has-text("Primary")').first().getAttribute('class');
  expect(classAfterPreview).toContain('px-10');
  expect(classAfterPreview).not.toContain('px-4');

  // Click "Queue Change"
  const queueBtnBox = await page.evaluate(() => {
    const host = document.querySelector('#tw-visual-editor-host') as HTMLElement;
    const btns = Array.from(host.shadowRoot!.querySelectorAll('.picker-btn')) as HTMLButtonElement[];
    const btn = btns.find(b => b.textContent?.includes('Queue Change'));
    return btn?.getBoundingClientRect();
  });
  expect(queueBtnBox).toBeTruthy();
  await page.mouse.click(queueBtnBox!.x + queueBtnBox!.width / 2, queueBtnBox!.y + queueBtnBox!.height / 2);
  await page.waitForTimeout(500);

  expect(sentMessages).toHaveLength(1);
  const msg = sentMessages[0];
  console.log('Queued change message:', JSON.stringify(msg, null, 2));

  // change.old/new must reflect the intended edit
  expect(msg.change.old).toBe('px-4');
  expect(msg.change.new).toBe('px-10');

  // target.classes must be the ORIGINAL (px-4), not the previewed (px-10)
  expect(msg.target.classes).toContain('px-4');
  expect(msg.target.classes).not.toContain('px-10');

  // No class="..." attribute in context HTML should contain px-10
  expect(msg.context).toContain('px-4');
  const classAttrMatches = [...msg.context.matchAll(/class="([^"]*)"/g)];
  const classValues = classAttrMatches.map((m: RegExpMatchArray) => m[1]);
  console.log('Class attribute values in context:', classValues);
  for (const val of classValues) {
    expect(val).not.toContain('px-10');
  }
});
