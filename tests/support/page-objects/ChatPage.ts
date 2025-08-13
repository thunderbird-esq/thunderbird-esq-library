import { Page, Locator } from '@playwright/test';

/**
 * Page Object Model for the RAG Chat Interface
 * Handles chat interactions and response validation
 */
export class ChatPage {
  readonly page: Page;
  readonly chatInput: Locator;
  readonly sendButton: Locator;
  readonly chatMessages: Locator;
  readonly latestMessage: Locator;
  readonly loadingIndicator: Locator;
  readonly errorMessage: Locator;
  readonly clearButton: Locator;

  constructor(page: Page) {
    this.page = page;
    
    this.chatInput = page.locator('[data-testid="chat-input"]')
      .or(page.locator('textarea[placeholder*="question" i]'))
      .or(page.locator('input[placeholder*="ask" i]'))
      .or(page.locator('textarea'));
    
    this.sendButton = page.locator('[data-testid="chat-send"]')
      .or(page.locator('button:has-text("Send")'))
      .or(page.locator('button[type="submit"]'))
      .or(page.locator('button:has(svg)').last()); // Often send buttons have icons
    
    this.chatMessages = page.locator('[data-testid="chat-messages"]')
      .or(page.locator('[class*="message"]'))
      .or(page.locator('[role="log"]'));
    
    this.latestMessage = page.locator('[data-testid="latest-message"]')
      .or(page.locator('[class*="message"]:last-child'))
      .or(this.chatMessages.last());
    
    this.loadingIndicator = page.locator('[data-testid="chat-loading"]')
      .or(page.locator('[class*="loading"]'))
      .or(page.locator('[class*="typing"]'))
      .or(page.locator('[class*="dots"]'));
    
    this.errorMessage = page.locator('[data-testid="chat-error"]')
      .or(page.locator('[class*="error"]'))
      .or(page.locator('[role="alert"]'));
    
    this.clearButton = page.locator('[data-testid="clear-chat"]')
      .or(page.locator('button:has-text("Clear")'));
  }

  /**
   * Navigate to the chat interface
   */
  async goto(): Promise<void> {
    await this.page.goto('/');
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Send a message in the chat
   */
  async sendMessage(message: string): Promise<void> {
    await this.chatInput.fill(message);
    await this.sendButton.click();
  }

  /**
   * Wait for a response to the chat message
   */
  async waitForResponse(timeout = 45000): Promise<void> {
    // First wait for loading to appear (if it exists)
    try {
      await this.loadingIndicator.waitFor({ timeout: 5000 });
    } catch {
      // Loading indicator might not appear immediately
    }

    // Then wait for loading to disappear or new message to appear
    try {
      await Promise.race([
        this.loadingIndicator.waitFor({ state: 'hidden', timeout }),
        this.latestMessage.waitFor({ timeout })
      ]);
    } catch (error) {
      // If neither works, wait for any new content in messages area
      const initialCount = await this.chatMessages.count();
      await this.page.waitForFunction(
        (selector, count) => {
          const elements = document.querySelectorAll(selector);
          return elements.length > count;
        },
        await this.chatMessages.first().getAttribute('class') || '[class*="message"]',
        initialCount,
        { timeout }
      );
    }
  }

  /**
   * Get the latest chat response
   */
  async getLatestResponse(): Promise<string> {
    return await this.latestMessage.textContent() || '';
  }

  /**
   * Get all chat messages
   */
  async getAllMessages(): Promise<string[]> {
    const messages = await this.chatMessages.all();
    const texts = await Promise.all(messages.map(msg => msg.textContent()));
    return texts.filter(text => text !== null) as string[];
  }

  /**
   * Check if there's a chat error
   */
  async hasChatError(): Promise<boolean> {
    return await this.errorMessage.isVisible();
  }

  /**
   * Get the chat error message
   */
  async getChatErrorMessage(): Promise<string> {
    return await this.errorMessage.textContent() || '';
  }

  /**
   * Check if chat is currently loading/processing
   */
  async isChatLoading(): Promise<boolean> {
    return await this.loadingIndicator.isVisible();
  }

  /**
   * Clear the chat history if possible
   */
  async clearChat(): Promise<void> {
    try {
      if (await this.clearButton.isVisible()) {
        await this.clearButton.click();
      }
    } catch {
      // Clear button might not exist
    }
  }

  /**
   * Send message and wait for response
   */
  async askQuestion(question: string, timeout = 45000): Promise<string> {
    const initialMessageCount = await this.chatMessages.count();
    
    await this.sendMessage(question);
    await this.waitForResponse(timeout);
    
    // Ensure we have a new message
    const finalMessageCount = await this.chatMessages.count();
    if (finalMessageCount <= initialMessageCount) {
      throw new Error('No new message received after sending question');
    }
    
    return await this.getLatestResponse();
  }

  /**
   * Verify response contains expected content
   */
  async verifyResponseContains(expectedContent: string[]): Promise<boolean> {
    const response = await this.getLatestResponse();
    const lowerResponse = response.toLowerCase();
    
    return expectedContent.some(content => 
      lowerResponse.includes(content.toLowerCase())
    );
  }

  /**
   * Get the count of chat messages
   */
  async getMessageCount(): Promise<number> {
    return await this.chatMessages.count();
  }

  /**
   * Wait for streaming response to complete
   */
  async waitForStreamingComplete(timeout = 60000): Promise<void> {
    // Wait for the response to stop updating (no changes for 2 seconds)
    let previousContent = '';
    let stableCount = 0;
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      const currentContent = await this.getLatestResponse();
      
      if (currentContent === previousContent) {
        stableCount++;
        if (stableCount >= 4) { // 2 seconds of stability (500ms * 4)
          break;
        }
      } else {
        stableCount = 0;
        previousContent = currentContent;
      }
      
      await this.page.waitForTimeout(500);
    }
  }
}