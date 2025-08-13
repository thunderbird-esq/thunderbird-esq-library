import { Page, Locator } from '@playwright/test';

/**
 * Page Object Model for the Internet Archive Search functionality
 * Encapsulates all interactions with the search interface
 */
export class SearchPage {
  readonly page: Page;
  readonly searchInput: Locator;
  readonly searchButton: Locator;
  readonly searchResults: Locator;
  readonly loadingIndicator: Locator;
  readonly errorMessage: Locator;

  constructor(page: Page) {
    this.page = page;
    
    // Primary selectors with fallbacks
    this.searchInput = page.locator('[data-testid="search-input"]')
      .or(page.locator('input[type="text"]'))
      .or(page.locator('input[placeholder*="search" i]'));
    
    this.searchButton = page.locator('[data-testid="search-button"]')
      .or(page.locator('button:has-text("Search")'))
      .or(page.locator('button[type="submit"]'));
    
    this.searchResults = page.locator('[data-testid="search-results"]')
      .or(page.locator('[class*="document"]'))
      .or(page.locator('[role="list"] > [role="listitem"]'));
    
    this.loadingIndicator = page.locator('[data-testid="loading"]')
      .or(page.locator('[class*="loading"]'))
      .or(page.locator('[class*="spinner"]'));
    
    this.errorMessage = page.locator('[data-testid="error"]')
      .or(page.locator('[class*="error"]'))
      .or(page.locator('[role="alert"]'));
  }

  /**
   * Navigate to the search page
   */
  async goto(): Promise<void> {
    await this.page.goto('/');
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Perform a search with the given query
   */
  async search(query: string): Promise<void> {
    await this.searchInput.fill(query);
    await this.searchButton.click();
  }

  /**
   * Wait for search results to appear
   */
  async waitForResults(timeout = 15000): Promise<void> {
    await this.searchResults.first().waitFor({ timeout });
  }

  /**
   * Wait for loading to complete
   */
  async waitForLoadingComplete(timeout = 30000): Promise<void> {
    // Wait for loading indicator to appear (if it exists)
    try {
      await this.loadingIndicator.waitFor({ timeout: 5000 });
      // Then wait for it to disappear
      await this.loadingIndicator.waitFor({ state: 'hidden', timeout });
    } catch (error) {
      // Loading indicator might not be present, continue
    }
  }

  /**
   * Get the count of search results
   */
  async getResultCount(): Promise<number> {
    return await this.searchResults.count();
  }

  /**
   * Get the text content of the first search result
   */
  async getFirstResultText(): Promise<string> {
    return await this.searchResults.first().textContent() || '';
  }

  /**
   * Click on a specific search result by index
   */
  async clickResult(index: number): Promise<void> {
    await this.searchResults.nth(index).click();
  }

  /**
   * Check if an error message is displayed
   */
  async hasError(): Promise<boolean> {
    return await this.errorMessage.isVisible();
  }

  /**
   * Get the error message text
   */
  async getErrorMessage(): Promise<string> {
    return await this.errorMessage.textContent() || '';
  }
}