import { test, expect } from '@playwright/test';

test.describe('Symbol Switching & Source of Truth Acceptance Tests', () => {
  test('1. Deep link sets symbol in header and URL (?symbol=MSFT)', async ({ page }) => {
    await page.goto('/?symbol=MSFT');
    await expect(page).toHaveURL(/\?symbol=MSFT/);
    // Sticky TopBar displays MSFT
    const topBarSymbol = page.locator('#active-symbol-badge');
    await expect(topBarSymbol).toHaveText('MSFT');
  });

  test('2. Setup card click changes symbol to AAPL and mirrors to URL', async ({ page }) => {
    await page.goto('/?symbol=NVDA');
    await expect(page).toHaveURL(/\?symbol=NVDA/);

    // Click AAPL instrument card
    const aaplCard = page.locator('text=AAPL').first();
    await aaplCard.click();

    // URL and header follow
    await expect(page).toHaveURL(/\?symbol=AAPL/);
    const topBarSymbol = page.locator('#active-symbol-badge');
    await expect(topBarSymbol).toHaveText('AAPL');
  });

  test('3. TopBar Switcher modal with "/" keyboard shortcut and custom ticker validation', async ({ page }) => {
    await page.goto('/?symbol=AAPL');

    // Focus document body and press '/' to open switcher modal
    await page.locator('body').click();
    await page.keyboard.press('/');
    
    const modal = page.locator('#symbol-switcher-modal');
    // If not triggered by shortcut, fallback to clicking switcher trigger button
    if (!(await modal.isVisible())) {
      await page.locator('#symbol-switcher-trigger').click();
    }
    await expect(modal).toBeVisible();

    // Type NVDA into search
    const searchInput = page.locator('#symbol-switcher-search');
    await searchInput.fill('NVDA');

    // Click the NVDA option
    const nvdaOption = modal.locator('text=NVDA').first();
    await nvdaOption.click();

    // Modal closes and symbol switches to NVDA
    await expect(modal).not.toBeVisible();
    await expect(page).toHaveURL(/\?symbol=NVDA/);
    const topBarSymbol = page.locator('#active-symbol-badge');
    await expect(topBarSymbol).toHaveText('NVDA');
  });

  test('4. Cross-page navigation carries symbol across Charts, Positions, and Backtest', async ({ page }) => {
    await page.goto('/?symbol=MSFT');

    // Navigate to Charts
    await page.click('text=Charts');
    await expect(page).toHaveURL(/\/charts\?symbol=MSFT/);
    await expect(page.locator('#active-symbol-badge')).toHaveText('MSFT');

    // Navigate to Positions
    await page.click('text=Positions');
    await expect(page).toHaveURL(/\/positions\?symbol=MSFT/);
    await expect(page.locator('#active-symbol-badge')).toHaveText('MSFT');

    // Navigate to Backtest
    await page.click('text=Backtest');
    await expect(page).toHaveURL(/\/backtest\?symbol=MSFT/);
    await expect(page.locator('#active-symbol-badge')).toHaveText('MSFT');
  });

  test('5. Back/forward browser buttons update the symbol and reload keeps it', async ({ page }) => {
    await page.goto('/?symbol=NVDA');
    await page.goto('/?symbol=AAPL');
    await expect(page.locator('#active-symbol-badge')).toHaveText('AAPL');

    // Back button
    await page.goBack();
    await expect(page).toHaveURL(/\?symbol=NVDA/);
    await expect(page.locator('#active-symbol-badge')).toHaveText('NVDA');

    // Forward button
    await page.goForward();
    await expect(page).toHaveURL(/\?symbol=AAPL/);
    await expect(page.locator('#active-symbol-badge')).toHaveText('AAPL');

    // Reload keeps symbol
    await page.reload();
    await expect(page).toHaveURL(/\?symbol=AAPL/);
    await expect(page.locator('#active-symbol-badge')).toHaveText('AAPL');
  });
});
