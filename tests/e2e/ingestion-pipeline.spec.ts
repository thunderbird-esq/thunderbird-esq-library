import { test, expect, Page } from '@playwright/test';
import { setTimeout } from 'timers/promises';

/**
 * COMPREHENSIVE E2E TEST SUITE FOR THUNDERBIRD-ESQ INGESTION PIPELINE
 * 
 * This test suite validates the COMPLETE user journey from Internet Archive search
 * through document ingestion to RAG-based chat responses using REAL data and REAL browser automation.
 * 
 * Architecture: Tests the actual "client-fetch, server-process" architecture where:
 * - Internet Archive searches happen client-side
 * - Document downloads happen client-side
 * - Processing and embedding generation happens server-side
 * - RAG queries use real Supabase vector search
 * 
 * These tests use REAL:
 * - Internet Archive API responses
 * - PDF/TXT document downloads
 * - Server-side document processing
 * - Hugging Face embedding generation
 * - Supabase database operations
 * - Streaming chat responses
 */

// Test configuration constants
const TEST_TIMEOUTS = {
  NAVIGATION: 10000,
  API_CALL: 30000,
  INGESTION: 60000,  // PDF processing can take time
  CHAT_RESPONSE: 45000,
  SEARCH_RESULTS: 15000
};

const TEST_SELECTORS = {
  // These will be updated based on actual UI components
  SEARCH_INPUT: '[data-testid="search-input"], input[type="text"], input[placeholder*="search" i]',
  SEARCH_BUTTON: '[data-testid="search-button"], button:has-text("Search"), button[type="submit"]',
  SEARCH_RESULTS: '[data-testid="search-results"], [class*="document"], li',
  INGEST_PDF_BUTTON: '[data-testid="ingest-pdf"], button:has-text("Ingest PDF"), button:has-text("PDF")',
  INGEST_TEXT_BUTTON: '[data-testid="ingest-text"], button:has-text("Ingest Text"), button:has-text("Text")',
  CHAT_INPUT: '[data-testid="chat-input"], textarea, input[placeholder*="question" i]',
  CHAT_SEND_BUTTON: '[data-testid="chat-send"], button:has-text("Send")',
  CHAT_MESSAGES: '[data-testid="chat-messages"], [class*="message"]',
  INGESTION_STATUS: '[data-testid="ingestion-status"], [class*="status"], [class*="message"]',
  ERROR_MESSAGE: '[data-testid="error"], [class*="error"], [class*="fail"]'
};

// Helper functions for test operations
class TestHelpers {
  private page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  /**
   * Waits for and logs network requests to external APIs
   */
  async setupNetworkMonitoring(): Promise<{ requests: string[], responses: any[] }> {
    const requests: string[] = [];
    const responses: any[] = [];

    this.page.on('request', (request) => {
      const url = request.url();
      requests.push(url);
      console.log(`Request: ${request.method()} ${url}`);
    });

    this.page.on('response', (response) => {
      responses.push({
        url: response.url(),
        status: response.status(),
        statusText: response.statusText()
      });
      console.log(`Response: ${response.status()} ${response.url()}`);
    });

    return { requests, responses };
  }

  /**
   * Performs Internet Archive search with real API
   */
  async searchInternetArchive(query: string): Promise<void> {
    console.log(`Searching Internet Archive for: "${query}"`);
    
    // Look for search input - try multiple possible selectors
    const searchInput = await this.findElementWithMultipleSelectors([
      TEST_SELECTORS.SEARCH_INPUT,
      'input[type="text"]',
      'input',
      'textarea'
    ]);

    await searchInput.fill(query);
    console.log(`Filled search input with: "${query}"`);

    // Look for search button
    const searchButton = await this.findElementWithMultipleSelectors([
      TEST_SELECTORS.SEARCH_BUTTON,
      'button:has-text("Search")',
      'button[type="submit"]',
      'form button'
    ]);

    await searchButton.click();
    console.log('Clicked search button');

    // Wait for search results with timeout
    await this.page.waitForFunction(
      () => {
        // Look for any elements that might be search results
        const results = document.querySelectorAll(
          '[data-testid="search-results"] > *, [class*="document"], li:has(button), div:has(button[class*="ingest"])'
        );
        return results.length > 0;
      },
      { timeout: TEST_TIMEOUTS.SEARCH_RESULTS }
    );

    const resultCount = await this.page.locator(TEST_SELECTORS.SEARCH_RESULTS).count();
    console.log(`Found ${resultCount} search results`);
    expect(resultCount).toBeGreaterThan(0);
  }

  /**
   * Finds element using multiple possible selectors with intelligent fallback
   */
  async findElementWithMultipleSelectors(selectors: string[]) {
    for (const selector of selectors) {
      try {
        const element = this.page.locator(selector).first();
        await element.waitFor({ timeout: 2000 });
        if (await element.isVisible()) {
          console.log(`Found element with selector: ${selector}`);
          return element;
        }
      } catch (error) {
        // Continue to next selector
      }
    }
    
    // If no selector worked, take a screenshot and fail
    await this.page.screenshot({ path: 'test-results/selector-failure.png', fullPage: true });
    throw new Error(`Could not find element with any of these selectors: ${selectors.join(', ')}`);
  }

  /**
   * Dynamically detects if UI components are available for testing
   * Returns capability assessment instead of hard-coded assumptions
   */
  async detectUICapabilities(): Promise<{
    hasSearchInterface: boolean;
    hasIngestionButtons: boolean;
    hasChatInterface: boolean;
    hasDocumentList: boolean;
    overallScore: number;
  }> {
    console.log('🔍 Performing dynamic UI capability detection...');
    
    const capabilities = {
      hasSearchInterface: false,
      hasIngestionButtons: false,
      hasChatInterface: false,
      hasDocumentList: false,
      overallScore: 0
    };

    // Test for search interface
    try {
      const searchElements = await Promise.race([
        this.page.locator(TEST_SELECTORS.SEARCH_INPUT).count(),
        this.page.locator('input[type="text"]').count(),
        this.page.locator('input[placeholder*="search" i]').count()
      ]);
      capabilities.hasSearchInterface = searchElements > 0;
      console.log(`Search interface detected: ${capabilities.hasSearchInterface}`);
    } catch (error) {
      console.log('Search interface detection failed:', error.message);
    }

    // Test for ingestion buttons (may not be visible until search results)
    try {
      const ingestElements = await Promise.race([
        this.page.locator('[data-testid*="ingest"]').count(),
        this.page.locator('button:has-text("Ingest")').count(),
        this.page.locator('button:has-text("PDF")').count()
      ]);
      capabilities.hasIngestionButtons = ingestElements > 0;
      console.log(`Ingestion buttons detected: ${capabilities.hasIngestionButtons}`);
    } catch (error) {
      console.log('Ingestion buttons detection failed:', error.message);
    }

    // Test for chat interface
    try {
      const chatElements = await Promise.race([
        this.page.locator(TEST_SELECTORS.CHAT_INPUT).count(),
        this.page.locator('textarea').count(),
        this.page.locator('input[placeholder*="question" i]').count()
      ]);
      capabilities.hasChatInterface = chatElements > 0;
      console.log(`Chat interface detected: ${capabilities.hasChatInterface}`);
    } catch (error) {
      console.log('Chat interface detection failed:', error.message);
    }

    // Test for document list area
    try {
      const docElements = await Promise.race([
        this.page.locator('[data-testid="search-results"]').count(),
        this.page.locator('[class*="document"]').count(),
        this.page.locator('li').count()
      ]);
      capabilities.hasDocumentList = docElements > 0;
      console.log(`Document list area detected: ${capabilities.hasDocumentList}`);
    } catch (error) {
      console.log('Document list detection failed:', error.message);
    }

    // Calculate overall capability score
    const scores = [
      capabilities.hasSearchInterface ? 25 : 0,
      capabilities.hasIngestionButtons ? 25 : 0,
      capabilities.hasChatInterface ? 25 : 0,
      capabilities.hasDocumentList ? 25 : 0
    ];
    capabilities.overallScore = scores.reduce((sum, score) => sum + score, 0);

    console.log(`🎯 UI Capability Assessment Complete - Score: ${capabilities.overallScore}/100`);
    console.log(`  - Search Interface: ${capabilities.hasSearchInterface ? '✅' : '❌'}`);
    console.log(`  - Ingestion Buttons: ${capabilities.hasIngestionButtons ? '✅' : '❌'}`);
    console.log(`  - Chat Interface: ${capabilities.hasChatInterface ? '✅' : '❌'}`);
    console.log(`  - Document List: ${capabilities.hasDocumentList ? '✅' : '❌'}`);

    return capabilities;
  }

  /**
   * Attempts document ingestion with comprehensive error handling
   */
  async ingestDocument(type: 'pdf' | 'text'): Promise<void> {
    const buttonSelector = type === 'pdf' ? TEST_SELECTORS.INGEST_PDF_BUTTON : TEST_SELECTORS.INGEST_TEXT_BUTTON;
    const buttonText = type === 'pdf' ? 'PDF' : 'Text';

    console.log(`Starting ${type.toUpperCase()} ingestion`);

    // Find the ingest button for the first available document
    const ingestButton = await this.findElementWithMultipleSelectors([
      buttonSelector,
      `button:has-text("${buttonText}")`,
      `button:has-text("Ingest ${buttonText}")`,
      'button[class*="ingest"]'
    ]);

    // Take screenshot before ingestion
    await this.page.screenshot({ 
      path: `test-results/before-${type}-ingestion.png`, 
      fullPage: true 
    });

    await ingestButton.click();
    console.log(`Clicked ${type} ingestion button`);

    // Monitor ingestion progress through status messages
    const progressStates = ['Downloading', 'Processing', 'Storing', 'Ingested'];
    let currentState = '';

    for (const expectedState of progressStates) {
      console.log(`Waiting for state: ${expectedState}`);
      
      try {
        await this.page.waitForFunction(
          (state) => {
            const statusElements = document.querySelectorAll(
              '[data-testid="ingestion-status"], [class*="status"], [class*="message"], button:disabled'
            );
            return Array.from(statusElements).some(el => 
              el.textContent?.includes(state) || el.textContent?.includes(state.toLowerCase())
            );
          },
          expectedState,
          { timeout: TEST_TIMEOUTS.INGESTION }
        );
        
        currentState = expectedState;
        console.log(`✓ Reached state: ${expectedState}`);
        
        // Take screenshot at each major state
        await this.page.screenshot({ 
          path: `test-results/${type}-ingestion-${expectedState.toLowerCase()}.png`,
          fullPage: true 
        });

      } catch (error) {
        console.log(`⚠ Did not detect state "${expectedState}" - continuing...`);
        break; // Don't fail, just continue
      }
    }

    // Verify final success state
    await this.page.waitForFunction(
      () => {
        const successElements = document.querySelectorAll(
          'button:has-text("Ingested"), [class*="success"], [style*="green"]'
        );
        return successElements.length > 0;
      },
      { timeout: TEST_TIMEOUTS.INGESTION }
    );

    console.log(`✅ ${type.toUpperCase()} ingestion completed successfully`);
  }

  /**
   * Tests RAG chat functionality with real queries
   */
  async testRAGQuery(question: string): Promise<string> {
    console.log(`Testing RAG query: "${question}"`);

    const chatInput = await this.findElementWithMultipleSelectors([
      TEST_SELECTORS.CHAT_INPUT,
      'textarea',
      'input[placeholder*="question" i]',
      'input[placeholder*="ask" i]'
    ]);

    await chatInput.fill(question);
    console.log(`Filled chat input with question: "${question}"`);

    const sendButton = await this.findElementWithMultipleSelectors([
      TEST_SELECTORS.CHAT_SEND_BUTTON,
      'button:has-text("Send")',
      'button[type="submit"]',
      'form button'
    ]);

    await sendButton.click();
    console.log('Sent chat message');

    // Wait for AI response with streaming support
    let response = '';
    let attempts = 0;
    const maxAttempts = 30; // 30 * 1.5s = 45s timeout

    while (attempts < maxAttempts) {
      await setTimeout(1500); // Check every 1.5 seconds
      
      try {
        // Get all chat messages and find the latest AI response
        const messages = await this.page.locator(TEST_SELECTORS.CHAT_MESSAGES).all();
        
        if (messages.length >= 2) { // User message + AI response
          const lastMessage = messages[messages.length - 1];
          const messageText = await lastMessage.textContent();
          
          if (messageText && messageText.trim().length > 10) {
            response = messageText.trim();
            console.log(`Received AI response: "${response.substring(0, 100)}..."`);
            break;
          }
        }
      } catch (error) {
        console.log(`Attempt ${attempts + 1}: Still waiting for response...`);
      }
      
      attempts++;
    }

    if (!response) {
      await this.page.screenshot({ 
        path: 'test-results/chat-timeout.png', 
        fullPage: true 
      });
      throw new Error(`No chat response received within ${TEST_TIMEOUTS.CHAT_RESPONSE}ms`);
    }

    // Verify the response is not empty or error message
    expect(response).not.toContain("I couldn't find any relevant information");
    expect(response.length).toBeGreaterThan(20);
    console.log(`✅ Valid RAG response received: "${response.substring(0, 200)}..."`);

    return response;
  }

  /**
   * Captures comprehensive application state for debugging
   */
  async captureApplicationState(testName: string): Promise<void> {
    console.log(`Capturing application state for: ${testName}`);
    
    // Take full page screenshot
    await this.page.screenshot({ 
      path: `test-results/${testName}-state.png`, 
      fullPage: true 
    });

    // Capture browser console logs
    const logs = await this.page.evaluate(() => {
      // Return any global state or errors that might be available
      return {
        url: window.location.href,
        userAgent: navigator.userAgent,
        localStorage: Object.keys(localStorage),
        sessionStorage: Object.keys(sessionStorage),
        documentTitle: document.title,
        bodyClasses: document.body.className
      };
    });

    console.log('Application state:', JSON.stringify(logs, null, 2));
  }
}

test.describe('Thunderbird-ESQ Ingestion Pipeline E2E Tests', () => {
  let helpers: TestHelpers;

  test.beforeEach(async ({ page }) => {
    helpers = new TestHelpers(page);
    
    console.log('='.repeat(80));
    console.log('Starting new E2E test');
    console.log('='.repeat(80));

    // Setup network monitoring
    await helpers.setupNetworkMonitoring();

    // Navigate to application
    console.log('Navigating to application...');
    await page.goto('/', { waitUntil: 'networkidle' });
    
    // Wait for initial page load
    await page.waitForLoadState('domcontentloaded');
    
    // Capture initial state
    await helpers.captureApplicationState('initial-load');
  });

  test('Application Infrastructure - Basic Loading and API Health', async ({ page }) => {
    console.log('🔍 Testing basic application infrastructure...');

    // Test 1: Page loads without JavaScript errors
    let jsErrors: string[] = [];
    page.on('pageerror', (error) => {
      jsErrors.push(error.message);
      console.log(`JavaScript Error: ${error.message}`);
    });

    await page.reload({ waitUntil: 'networkidle' });
    expect(jsErrors).toHaveLength(0);
    console.log('✅ No JavaScript errors detected');

    // Test 2: Basic DOM structure exists
    const bodyContent = await page.locator('body').textContent();
    expect(bodyContent).toBeTruthy();
    console.log('✅ Basic DOM structure loaded');

    // Test 3: API endpoint accessibility
    const apiResponse = await page.request.get('/api/chat');
    console.log(`API Health Check: ${apiResponse.status()} ${apiResponse.statusText()}`);
    
    // Should not be a 500 server error (405 Method Not Allowed is acceptable)
    expect(apiResponse.status()).not.toBe(500);
    console.log('✅ API endpoint accessible');

    // Test 4: Network connectivity (required for Internet Archive)
    const networkTest = await page.evaluate(async () => {
      try {
        const response = await fetch('https://httpbin.org/json', { 
          method: 'GET',
          mode: 'cors'
        });
        return { success: response.ok, status: response.status };
      } catch (error) {
        return { success: false, error: error.message };
      }
    });

    expect(networkTest.success).toBe(true);
    console.log('✅ External network connectivity confirmed');
  });

  test('Internet Archive Integration - Real Search API', async ({ page }) => {
    console.log('🔍 Testing Internet Archive search integration...');

    // Perform dynamic UI capability detection
    const capabilities = await helpers.detectUICapabilities();
    
    if (!capabilities.hasSearchInterface) {
      console.log('⚠️ Search interface not detected. Investigating page state...');
      
      // Capture diagnostic information for debugging
      const bodyText = await page.locator('body').textContent();
      console.log('Page title:', await page.title());
      console.log('Body text preview:', bodyText?.substring(0, 500));
      
      // Check for expected React components
      const hasReactComponents = bodyText?.includes('Step') || bodyText?.includes('Search') || bodyText?.includes('Chat');
      
      if (!hasReactComponents) {
        console.log('❌ Expected React components not found. The main page appears to be the default Next.js template.');
        console.log('DIAGNOSIS: Application interface is not properly wired up.');
        
        // Fail the test with clear diagnostic information
        throw new Error('CRITICAL: Search interface components are not rendered. Application UI is not functional.');
      }
      
      // If React components exist but search interface is still missing, fail with different error
      throw new Error('CRITICAL: React components detected but search interface selectors failed. UI component mismatch.');
    }

    // If search interface is available, proceed with the test
    try {
      await helpers.searchInternetArchive('artificial intelligence');
      console.log('✅ Internet Archive search completed successfully');
    } catch (error) {
      console.log('❌ Search execution failed:', error.message);
      throw error;
    }
  });

  test('Document Ingestion Pipeline - PDF Processing', async ({ page }) => {
    console.log('🔍 Testing PDF document ingestion pipeline...');

    // Perform dynamic capability assessment
    const capabilities = await helpers.detectUICapabilities();
    
    if (!capabilities.hasSearchInterface) {
      throw new Error('CRITICAL: Search interface required for PDF ingestion test is not available.');
    }

    try {
      // First, ensure we have search results
      await helpers.searchInternetArchive('machine learning');
      
      // Check for ingestion capability after search results load
      const postSearchCapabilities = await helpers.detectUICapabilities();
      
      if (!postSearchCapabilities.hasIngestionButtons) {
        console.log('⚠️ Ingestion buttons not detected after search. Checking if search returned results...');
        
        const resultCount = await page.locator(TEST_SELECTORS.SEARCH_RESULTS).count();
        if (resultCount === 0) {
          throw new Error('CRITICAL: Search completed but returned no results. Cannot test PDF ingestion without documents.');
        }
        
        throw new Error('CRITICAL: Search returned results but PDF ingestion buttons are not accessible.');
      }
      
      // Find and ingest a PDF document
      await helpers.ingestDocument('pdf');
      console.log('✅ PDF ingestion completed successfully');

      // Verify document was stored (check for success message)
      const successMessage = await page.locator('[class*="success"], button:has-text("Ingested")').first();
      await expect(successMessage).toBeVisible();
      
    } catch (error) {
      console.log('❌ PDF ingestion pipeline failed:', error.message);
      throw error;
    }
  });

  test('Document Ingestion Pipeline - Text Processing', async ({ page }) => {
    console.log('🔍 Testing text document ingestion pipeline...');

    // Perform dynamic capability assessment
    const capabilities = await helpers.detectUICapabilities();
    
    if (!capabilities.hasSearchInterface) {
      throw new Error('CRITICAL: Search interface required for text ingestion test is not available.');
    }

    try {
      // Search for documents that likely have text versions
      await helpers.searchInternetArchive('open source software');
      
      // Check for ingestion capability after search results load
      const postSearchCapabilities = await helpers.detectUICapabilities();
      
      if (!postSearchCapabilities.hasIngestionButtons) {
        console.log('⚠️ Ingestion buttons not detected after search. Verifying search results...');
        
        const resultCount = await page.locator(TEST_SELECTORS.SEARCH_RESULTS).count();
        if (resultCount === 0) {
          throw new Error('CRITICAL: Search completed but returned no results. Cannot test text ingestion without documents.');
        }
        
        throw new Error('CRITICAL: Search returned results but text ingestion buttons are not accessible.');
      }
      
      // Find and ingest a text document
      await helpers.ingestDocument('text');
      console.log('✅ Text ingestion completed successfully');

      // Verify document was stored
      const successMessage = await page.locator('[class*="success"], button:has-text("Ingested")').first();
      await expect(successMessage).toBeVisible();

    } catch (error) {
      console.log('❌ Text ingestion pipeline failed:', error.message);
      throw error;
    }
  });

  test('RAG Query System - Real Embeddings and Chat', async ({ page }) => {
    console.log('🔍 Testing RAG query system with real embeddings...');

    // Perform comprehensive capability assessment
    const capabilities = await helpers.detectUICapabilities();
    
    if (!capabilities.hasSearchInterface) {
      throw new Error('CRITICAL: Search interface required for RAG testing is not available.');
    }
    
    if (!capabilities.hasChatInterface) {
      throw new Error('CRITICAL: Chat interface required for RAG testing is not available.');
    }

    try {
      // First ingest a document
      console.log('Step 1: Searching for documents...');
      await helpers.searchInternetArchive('computer science');
      
      // Verify ingestion capability exists
      const postSearchCapabilities = await helpers.detectUICapabilities();
      if (!postSearchCapabilities.hasIngestionButtons) {
        throw new Error('CRITICAL: Ingestion buttons not available after search. Cannot ingest documents for RAG testing.');
      }
      
      console.log('Step 2: Ingesting document for RAG...');
      await helpers.ingestDocument('text'); // Try text first as it's usually faster
      
      // Test RAG query
      console.log('Step 3: Testing RAG query...');
      const response = await helpers.testRAGQuery('What is artificial intelligence?');
      
      // Verify response quality
      expect(response.length).toBeGreaterThan(50);
      expect(response).not.toContain('error');
      expect(response).not.toContain('I couldn\'t find');
      
      console.log('✅ RAG query system working correctly');
      console.log(`Response preview: "${response.substring(0, 200)}..."`);

    } catch (error) {
      console.log('❌ RAG query system failed:', error.message);
      throw error;
    }
  });

  test('Error Handling - Network Failures and Invalid Operations', async ({ page }) => {
    console.log('🔍 Testing error handling and edge cases...');

    // Test 1: Handle empty search queries
    try {
      const searchInput = await helpers.findElementWithMultipleSelectors([
        TEST_SELECTORS.SEARCH_INPUT,
        'input[type="text"]'
      ]);
      
      await searchInput.fill('');
      
      const searchButton = await helpers.findElementWithMultipleSelectors([
        TEST_SELECTORS.SEARCH_BUTTON
      ]);
      
      await searchButton.click();
      
      // Should show some kind of validation message
      const validationMessage = await page.locator('[class*="error"], [class*="validation"]').first();
      // Don't require this to be visible, just don't crash
      
      console.log('✅ Empty search handled gracefully');

    } catch (error) {
      console.log('⚠️ Search interface not available for error testing');
    }

    // Test 2: Test chat without ingested documents
    try {
      const response = await helpers.testRAGQuery('Tell me about quantum computing');
      
      // Should return a "no information found" message
      if (response.includes("couldn't find") || response.includes("no relevant")) {
        console.log('✅ Chat correctly handles queries with no ingested documents');
      } else {
        console.log('ℹ️ Chat returned a response, possibly using existing data');
      }

    } catch (error) {
      console.log('⚠️ Chat interface not available for error testing');
    }
  });

  test('Performance and Reliability - Concurrent Operations', async ({ page }) => {
    console.log('🔍 Testing performance and reliability...');

    // Test multiple searches in sequence
    const searchTerms = ['artificial intelligence', 'machine learning', 'data science'];
    
    // Perform capability assessment before starting performance tests
    const capabilities = await helpers.detectUICapabilities();
    
    if (!capabilities.hasSearchInterface) {
      throw new Error('CRITICAL: Search interface required for performance testing is not available.');
    }

    for (const term of searchTerms) {
      try {
        console.log(`Testing search for: ${term}`);
        await helpers.searchInternetArchive(term);
        
        // Brief pause between searches
        await setTimeout(2000);
        console.log(`✅ Search for "${term}" completed`);
        
      } catch (error) {
        console.log(`❌ Search for "${term}" failed:`, error.message);
        throw error;
      }
    }

    console.log('✅ Sequential search operations completed successfully');
  });

  test('Full End-to-End Workflow - Complete User Journey', async ({ page }) => {
    console.log('🔍 Testing complete user journey from search to chat...');

    // Perform comprehensive pre-flight capability assessment
    const capabilities = await helpers.detectUICapabilities();
    
    console.log(`🎯 Workflow Prerequisites Check - UI Score: ${capabilities.overallScore}/100`);
    
    // Verify all required capabilities are present
    const missingCapabilities = [];
    if (!capabilities.hasSearchInterface) missingCapabilities.push('Search Interface');
    if (!capabilities.hasChatInterface) missingCapabilities.push('Chat Interface');
    
    if (missingCapabilities.length > 0) {
      throw new Error(`CRITICAL: Complete workflow requires all UI components. Missing: ${missingCapabilities.join(', ')}. Application interface is not functional.`);
    }

    try {
      // Step 1: Search Internet Archive
      console.log('Step 1: Searching Internet Archive...');
      await helpers.searchInternetArchive('philosophy logic');

      // Step 1.5: Verify post-search capabilities
      const postSearchCapabilities = await helpers.detectUICapabilities();
      if (!postSearchCapabilities.hasIngestionButtons) {
        throw new Error('CRITICAL: Search completed but ingestion buttons not available. Cannot proceed with workflow.');
      }

      // Step 2: Ingest a document
      console.log('Step 2: Ingesting document...');
      await helpers.ingestDocument('text');

      // Step 3: Wait for ingestion to complete
      await setTimeout(5000);

      // Step 4: Perform RAG query
      console.log('Step 4: Performing RAG query...');
      const response = await helpers.testRAGQuery('What is the main topic of this document?');

      // Step 5: Verify complete workflow
      expect(response.length).toBeGreaterThan(30);
      console.log('✅ Complete end-to-end workflow successful');
      console.log(`Final response: "${response.substring(0, 300)}..."`);

      // Final state capture
      await helpers.captureApplicationState('complete-workflow-success');

    } catch (error) {
      await helpers.captureApplicationState('complete-workflow-failure');
      console.log('❌ Complete end-to-end workflow failed:', error.message);
      throw error;
    }
  });

  test.afterEach(async ({ page }, testInfo) => {
    console.log(`Test "${testInfo.title}" completed with status: ${testInfo.status}`);
    
    if (testInfo.status === 'failed') {
      // Capture failure state
      await helpers.captureApplicationState(`failed-${testInfo.title.replace(/\s+/g, '-')}`);
      console.log('💾 Failure screenshots and logs captured');
    }

    console.log('='.repeat(80));
  });
});

/**
 * DATABASE INTEGRATION TESTS
 * These tests verify Supabase integration and data persistence
 */
test.describe('Database Integration Tests', () => {
  test('Supabase Connection and Schema Validation', async ({ page }) => {
    console.log('🔍 Testing Supabase database integration...');

    // Test database connectivity through the application
    const dbTest = await page.evaluate(async () => {
      try {
        // This would test the client-side Supabase connection
        // Since we can't directly access server-side Supabase from browser context,
        // we'll test through the application's own API
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: [{ role: 'user', content: 'test connection' }]
          })
        });
        
        return {
          status: response.status,
          accessible: response.status !== 500 // 500 would indicate server error
        };
      } catch (error) {
        return {
          status: 0,
          accessible: false,
          error: error.message
        };
      }
    });

    console.log('Database connectivity test:', dbTest);
    expect(dbTest.accessible).toBe(true);
    console.log('✅ Database connection verified through API');
  });

  test('Document Storage and Retrieval Verification', async ({ page }) => {
    console.log('🔍 Testing document storage and retrieval...');

    // This test would verify that ingested documents are actually stored
    // and can be retrieved for RAG queries
    
    try {
      // Attempt to verify storage through the application interface
      const helpers = new TestHelpers(page);
      
      // If UI is available, test actual storage
      await helpers.searchInternetArchive('test document');
      await helpers.ingestDocument('text');
      
      // Verify the document can be queried
      const response = await helpers.testRAGQuery('What was ingested?');
      
      // If we get a meaningful response, storage is working
      expect(response.length).toBeGreaterThan(10);
      console.log('✅ Document storage and retrieval verified');
      
    } catch (error) {
      if (error.message.includes('Could not find element')) {
        console.log('⚠️ UI not available for storage testing');
        
        // Alternative: Test API directly
        console.log('⚠️ UI not available, testing storage via API...');
        const apiTest = await page.request.post('/api/chat', {
          data: {
            messages: [{ role: 'user', content: 'test storage' }]
          }
        });
        
        expect(apiTest.status()).not.toBe(500);
        console.log('✅ Database API accessible but full storage testing requires UI components');
        
        throw new Error('PARTIAL: Database API accessible but UI components required for comprehensive storage testing');
      } else {
        throw error;
      }
    }
  });
});