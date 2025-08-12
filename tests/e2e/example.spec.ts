import { test, expect } from '@playwright/test';

/**
 * Basic Playwright setup validation test
 * This test ensures the test infrastructure is working correctly
 */
test.describe('Playwright Setup Validation', () => {
  test('should load the application homepage', async ({ page }) => {
    // Navigate to the homepage
    await page.goto('/');
    
    // Wait for the page to load
    await page.waitForLoadState('networkidle');
    
    // Verify the page loads successfully
    expect(await page.title()).toBeTruthy();
    
    // Verify we can interact with the page
    const body = page.locator('body');
    await expect(body).toBeVisible();
  });

  test('should have proper Next.js hydration', async ({ page }) => {
    // Navigate to the homepage
    await page.goto('/');
    
    // Wait for React hydration to complete
    await page.waitForLoadState('networkidle');
    
    // Verify the page is interactive (React has loaded)
    await page.waitForFunction(() => {
      return window.React !== undefined || document.querySelector('[data-reactroot]') !== null;
    }, { timeout: 10000 });
    
    // Basic interaction test - if there are any buttons, try clicking one
    const buttons = await page.locator('button').count();
    if (buttons > 0) {
      const firstButton = page.locator('button').first();
      await expect(firstButton).toBeVisible();
    }
  });
});