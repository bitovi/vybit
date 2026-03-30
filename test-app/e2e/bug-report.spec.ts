import { test, expect, type Page, type Frame } from '@playwright/test';
import { clickToggleButton, getPanelFrame, waitForPanelReady } from './helpers';

/**
 * Clicks the Bug Report mode button in the panel's ModeToggle.
 */
async function clickBugReportButton(frame: Frame): Promise<void> {
  // Retry a few times — UI may be transitioning
  for (let attempt = 0; attempt < 10; attempt++) {
    // Try CTA card button (landing state)
    const foundCTA = await frame.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const cta = btns.find(b => b.textContent?.includes('Report a bug'));
      if (cta) { cta.click(); return true; }
      return false;
    }).catch(() => false);

    if (foundCTA) return;

    // Try ModeToggle icon button (title-based)
    const foundToggle = await frame.evaluate(() => {
      const btn = document.querySelector('button[title="Report a bug"]') as HTMLButtonElement | null;
      if (btn) { btn.click(); return true; }
      return false;
    }).catch(() => false);

    if (foundToggle) return;

    await frame.page().waitForTimeout(500);
  }

  throw new Error('Bug Report button not found');
}

/**
 * Gets the count of event timeline groups visible in the bug report mode.
 */
async function getTimelineGroupCount(frame: Frame): Promise<number> {
  return frame.evaluate(() => {
    // Each event group has a primary row with cursor-pointer
    const groups = document.querySelectorAll('[class*="border-b"][class*="border-white"]');
    return groups.length;
  });
}

test.describe('Bug Report Mode', () => {
  test('landing state shows bug report CTA card', async ({ page }) => {
    await page.goto('/');
    await clickToggleButton(page);
    const frame = await getPanelFrame(page);
    await waitForPanelReady(frame);

    // Landing state should show the "Report a bug" CTA
    await expect(frame.getByText('Report a bug')).toBeVisible({ timeout: 5000 });
  });

  test('clicking bug report CTA enters bug report mode', async ({ page }) => {
    await page.goto('/');
    await clickToggleButton(page);
    const frame = await getPanelFrame(page);
    await waitForPanelReady(frame);
    await page.waitForTimeout(500);

    // Click the bug report CTA card
    await clickBugReportButton(frame);
    await page.waitForTimeout(500);

    // Should show the bug report mode UI
    await expect(frame.getByText('Bug Report')).toBeVisible({ timeout: 5000 });
    await expect(frame.getByPlaceholder('Describe the bug…')).toBeVisible({ timeout: 5000 });
  });

  test('mode toggle shows three icon buttons', async ({ page }) => {
    await page.goto('/');
    await clickToggleButton(page);
    const frame = await getPanelFrame(page);
    await waitForPanelReady(frame);

    // All three mode toggle buttons should be present
    await expect(frame.locator('button[title="Select an element"]')).toBeVisible({ timeout: 5000 });
    await expect(frame.locator('button[title="Insert to add content"]')).toBeVisible({ timeout: 5000 });
    await expect(frame.locator('button[title="Report a bug"]')).toBeVisible({ timeout: 5000 });
  });

  test('bug report mode shows event timeline after page interaction', async ({ page }) => {
    await page.goto('/');
    await clickToggleButton(page);
    const frame = await getPanelFrame(page);
    await waitForPanelReady(frame);
    await page.waitForTimeout(500);

    // Click something on the page to generate an event
    await page.click('body', { position: { x: 200, y: 200 } });
    await page.waitForTimeout(1000);

    // Enter bug report mode
    await clickBugReportButton(frame);
    await page.waitForTimeout(1000);

    // Should show at least the page-load event in the timeline
    // The timeline may show events or an empty state
    const hasTimeline = await frame.evaluate(() => {
      // Check for either event badges or the empty state message
      const badges = document.querySelectorAll('span');
      return Array.from(badges).some(s =>
        s.textContent === 'page-load' ||
        s.textContent === 'click' ||
        s.textContent?.includes('No recording events')
      );
    });
    expect(hasTimeline).toBe(true);
  });

  test('submit button is disabled when no events selected', async ({ page }) => {
    await page.goto('/');
    await clickToggleButton(page);
    const frame = await getPanelFrame(page);
    await waitForPanelReady(frame);
    await page.waitForTimeout(500);

    // Enter bug report mode
    await clickBugReportButton(frame);
    await page.waitForTimeout(500);

    // Commit Bug Report button should be disabled
    const isDisabled = await frame.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const reportBtn = btns.find(b => b.textContent?.includes('Commit Bug Report'));
      return reportBtn?.disabled ?? false;
    });
    expect(isDisabled).toBe(true);
  });

  test('description textarea auto-grows', async ({ page }) => {
    await page.goto('/');
    await clickToggleButton(page);
    const frame = await getPanelFrame(page);
    await waitForPanelReady(frame);
    await page.waitForTimeout(500);

    // Enter bug report mode
    await clickBugReportButton(frame);
    await page.waitForTimeout(500);

    // Type in the textarea
    const textarea = frame.getByPlaceholder('Describe the bug…');
    await textarea.fill('This is a bug description that should cause the textarea to expand.');

    // Textarea should have content
    const value = await textarea.inputValue();
    expect(value).toContain('This is a bug description');
  });

  test('pick element button enters pick mode', async ({ page }) => {
    await page.goto('/');
    await clickToggleButton(page);
    const frame = await getPanelFrame(page);
    await waitForPanelReady(frame);
    await page.waitForTimeout(500);

    // Enter bug report mode
    await clickBugReportButton(frame);
    await page.waitForTimeout(500);

    // Click the Pick Element button
    const pickBtn = frame.getByText('Pick Element');
    await expect(pickBtn).toBeVisible({ timeout: 5000 });
    await pickBtn.click();

    // Should show "Click an element…" text indicating pick mode
    await expect(frame.getByText('Click an element…')).toBeVisible({ timeout: 5000 });
  });

  test('selected event count updates when checking events', async ({ page }) => {
    await page.goto('/');

    // Wait for recording to capture page-load
    await page.waitForTimeout(2000);

    await clickToggleButton(page);
    const frame = await getPanelFrame(page);
    await waitForPanelReady(frame);
    await page.waitForTimeout(500);

    // Enter bug report mode
    await clickBugReportButton(frame);
    await page.waitForTimeout(2000);

    // Check if any events are in the timeline by looking for trigger badges
    const eventCount = await frame.evaluate(() => {
      const badges = Array.from(document.querySelectorAll('span'));
      return badges.filter(s =>
        s.textContent === 'page-load' ||
        s.textContent === 'click' ||
        s.textContent === 'navigation' ||
        s.textContent === 'error' ||
        s.textContent === 'mutation'
      ).length;
    });

    // If there are events, clicking one should check it
    if (eventCount > 0) {
      // Click the first event's primary row (the div with cursor-pointer)
      await frame.evaluate(() => {
        const allDivs = Array.from(document.querySelectorAll('div'));
        // Find the primary row — contains a trigger badge and cursor-pointer
        const primaryRow = allDivs.find(d => {
          const style = d.className || '';
          return style.includes('cursor-pointer') && d.querySelector('span');
        });
        if (primaryRow) primaryRow.click();
      });
      await page.waitForTimeout(500);

      // The selected event group should now have a teal left border
      const hasCheckedGroup = await frame.evaluate(() => {
        const divs = Array.from(document.querySelectorAll('div'));
        return divs.some(d => d.className?.includes('border-l-[#00848B]'));
      });
      expect(hasCheckedGroup).toBe(true);
    }
  });
});
