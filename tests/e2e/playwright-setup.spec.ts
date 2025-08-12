import { test, expect } from '@playwright/test';

/**
 * Playwright setup verification test
 * This test validates that Playwright is correctly installed and configured
 * without requiring the Next.js server to be running
 */
test.describe('Playwright Infrastructure Validation', () => {
  test('should initialize browser context successfully', async ({ browser, browserName }) => {
    // Create a new browser context
    const context = await browser.newContext();
    
    // Create a new page
    const page = await context.newPage();
    
    // Navigate to a simple data URL to test basic functionality
    await page.goto('data:text/html,<html><body><h1>Playwright Test</h1></body></html>');
    
    // Verify the page loads
    await expect(page.locator('h1')).toHaveText('Playwright Test');
    
    // Verify browser information
    expect(browserName).toBeTruthy();
    console.log(`Test running on: ${browserName}`);
    
    // Clean up
    await context.close();
  });

  test('should support basic DOM interactions', async ({ page }) => {
    // Navigate to a test HTML page with interactive elements
    await page.goto('data:text/html,' + encodeURIComponent(`
      <html>
        <body>
          <h1 id="title">Test Page</h1>
          <button id="clickMe" onclick="this.textContent='Clicked!'">Click Me</button>
          <input id="textInput" type="text" placeholder="Enter text" />
        </body>
      </html>
    `));
    
    // Test basic element interactions
    await expect(page.locator('#title')).toBeVisible();
    
    // Test button click
    const button = page.locator('#clickMe');
    await button.click();
    await expect(button).toHaveText('Clicked!');
    
    // Test text input
    const input = page.locator('#textInput');
    await input.fill('Playwright works!');
    await expect(input).toHaveValue('Playwright works!');
  });
});