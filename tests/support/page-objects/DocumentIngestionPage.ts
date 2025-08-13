import { Page, Locator } from '@playwright/test';

/**
 * Page Object Model for Document Ingestion functionality
 * Handles PDF and text document processing workflows
 */
export class DocumentIngestionPage {
  readonly page: Page;
  readonly ingestPdfButton: Locator;
  readonly ingestTextButton: Locator;
  readonly fileUploadInput: Locator;
  readonly textAreaInput: Locator;
  readonly processButton: Locator;
  readonly ingestionStatus: Locator;
  readonly successMessage: Locator;
  readonly errorMessage: Locator;
  readonly progressIndicator: Locator;

  constructor(page: Page) {
    this.page = page;
    
    this.ingestPdfButton = page.locator('[data-testid="ingest-pdf"]')
      .or(page.locator('button:has-text("Ingest PDF")'))
      .or(page.locator('button:has-text("PDF")'));
    
    this.ingestTextButton = page.locator('[data-testid="ingest-text"]')
      .or(page.locator('button:has-text("Ingest Text")'))
      .or(page.locator('button:has-text("Text")'));
    
    this.fileUploadInput = page.locator('[data-testid="file-upload"]')
      .or(page.locator('input[type="file"]'));
    
    this.textAreaInput = page.locator('[data-testid="text-input"]')
      .or(page.locator('textarea'))
      .or(page.locator('input[type="text"]'));
    
    this.processButton = page.locator('[data-testid="process-button"]')
      .or(page.locator('button:has-text("Process")'))
      .or(page.locator('button:has-text("Submit")'));
    
    this.ingestionStatus = page.locator('[data-testid="ingestion-status"]')
      .or(page.locator('[class*="status"]'))
      .or(page.locator('[class*="message"]'));
    
    this.successMessage = page.locator('[data-testid="success"]')
      .or(page.locator('[class*="success"]'))
      .or(page.locator('[role="status"][class*="success"]'));
    
    this.errorMessage = page.locator('[data-testid="error"]')
      .or(page.locator('[class*="error"]'))
      .or(page.locator('[role="alert"]'));
    
    this.progressIndicator = page.locator('[data-testid="progress"]')
      .or(page.locator('[class*="progress"]'))
      .or(page.locator('[role="progressbar"]'));
  }

  /**
   * Initiate PDF ingestion workflow
   */
  async startPdfIngestion(): Promise<void> {
    await this.ingestPdfButton.click();
  }

  /**
   * Initiate text ingestion workflow
   */
  async startTextIngestion(): Promise<void> {
    await this.ingestTextButton.click();
  }

  /**
   * Upload a file for ingestion
   */
  async uploadFile(filePath: string): Promise<void> {
    await this.fileUploadInput.setInputFiles(filePath);
  }

  /**
   * Input text content for ingestion
   */
  async inputText(content: string): Promise<void> {
    await this.textAreaInput.fill(content);
  }

  /**
   * Start the document processing
   */
  async startProcessing(): Promise<void> {
    await this.processButton.click();
  }

  /**
   * Wait for ingestion to complete
   */
  async waitForIngestionComplete(timeout = 60000): Promise<void> {
    // Wait for either success or error state
    try {
      await Promise.race([
        this.successMessage.waitFor({ timeout }),
        this.errorMessage.waitFor({ timeout })
      ]);
    } catch (error) {
      // If neither appears, wait for progress to complete
      try {
        await this.progressIndicator.waitFor({ state: 'hidden', timeout: 10000 });
      } catch {
        // Progress indicator might not exist
      }
    }
  }

  /**
   * Get the current ingestion status
   */
  async getIngestionStatus(): Promise<string> {
    return await this.ingestionStatus.textContent() || '';
  }

  /**
   * Check if ingestion was successful
   */
  async wasIngestionSuccessful(): Promise<boolean> {
    return await this.successMessage.isVisible();
  }

  /**
   * Check if there was an ingestion error
   */
  async hasIngestionError(): Promise<boolean> {
    return await this.errorMessage.isVisible();
  }

  /**
   * Get the error message if present
   */
  async getErrorMessage(): Promise<string> {
    return await this.errorMessage.textContent() || '';
  }

  /**
   * Get success message if present
   */
  async getSuccessMessage(): Promise<string> {
    return await this.successMessage.textContent() || '';
  }

  /**
   * Check if processing is currently in progress
   */
  async isProcessing(): Promise<boolean> {
    return await this.progressIndicator.isVisible();
  }

  /**
   * Complete text ingestion workflow
   */
  async completeTextIngestion(content: string): Promise<void> {
    await this.startTextIngestion();
    await this.inputText(content);
    await this.startProcessing();
    await this.waitForIngestionComplete();
  }

  /**
   * Complete PDF ingestion workflow
   */
  async completePdfIngestion(filePath: string): Promise<void> {
    await this.startPdfIngestion();
    await this.uploadFile(filePath);
    await this.startProcessing();
    await this.waitForIngestionComplete();
  }
}