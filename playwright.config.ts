import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for Thunderbird-ESQ project
 * Configured for Next.js integration with multi-browser support
 * Optimized for both local development and CI/CD pipeline execution
 */
export default defineConfig({
  // Test directory for E2E tests
  testDir: './tests/e2e',
  
  // Global test timeout (60 seconds per test for complex operations)
  timeout: 60000,
  
  // Expect timeout for assertions (10 seconds for slow operations)
  expect: {
    timeout: 10000,
  },
  
  // Fail fast on CI - stop after first failure
  fullyParallel: true,
  
  // Retry configuration - more aggressive for stability
  retries: process.env.CI ? 3 : 1,
  
  // Parallel workers - conservative for stability
  workers: process.env.CI ? 1 : 2,
  
  // Reporter configuration - enhanced for debugging
  reporter: [
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['json', { outputFile: 'test-results.json' }],
    ['junit', { outputFile: 'test-results/junit-results.xml' }],
    process.env.CI ? ['github'] : ['list'],
    // Add line reporter for better console output
    ['line']
  ],
  
  // Global test settings
  use: {
    // Base URL for tests - Next.js development server
    baseURL: 'http://localhost:3000',
    
    // Browser context options for comprehensive debugging
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    
    // Navigation timeout - extended for slow operations
    navigationTimeout: 20000,
    
    // Action timeout - extended for complex UI interactions
    actionTimeout: 10000,
    
    // Additional browser settings for stability
    launchOptions: {
      // Slow down operations for better reliability
      slowMo: process.env.CI ? 0 : 100,
      // Keep browser open on failure in local development
      devtools: !process.env.CI,
    },
    
    // Context options for better test isolation
    contextOptions: {
      // Ignore HTTPS errors for local development
      ignoreHTTPSErrors: true,
      // Set viewport for consistent rendering
      viewport: { width: 1280, height: 720 },
      // Disable web security for local testing
      bypassCSP: true,
    },
  },

  // Test projects for different browsers
  // Note: Limited to Firefox due to macOS 10.15 compatibility constraints
  projects: [
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    // Additional browsers can be added when running on newer macOS versions
    // Uncomment these when upgrading to macOS 11+ for broader browser coverage:
    // {
    //   name: 'chromium',
    //   use: { ...devices['Desktop Chrome'] },
    // },
    // {
    //   name: 'webkit',
    //   use: { ...devices['Desktop Safari'] },
    // },
  ],

  // Web server configuration for Next.js with test environment
  webServer: {
    // Use custom test server script that handles environment setup
    command: './scripts/start-test-server.sh',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 300000, // 5 minutes for complex startup (Supabase + Next.js)
    stdout: 'pipe',
    stderr: 'pipe',
    // Ensure server is fully ready before proceeding
    waitForUrl: {
      url: 'http://localhost:3000',
      timeout: 60000, // Extended to 60s for health check after server starts
    },
    // Environment variables for the server process
    env: {
      NODE_ENV: 'test',
      // Force Next.js to use test configuration
      NEXT_CONFIG_MODE: 'test',
    },
  },
  
  // Output directory for test artifacts
  outputDir: 'test-results/',
  
  // Global test configuration
  globalTimeout: 600000, // 10 minutes total timeout for all tests
  
  // Test directory configuration
  testMatch: [
    '**/tests/e2e/**/*.spec.ts',
    '**/tests/e2e/**/*.test.ts'
  ],
  
  // Global setup and teardown for database initialization
  globalSetup: require.resolve('./tests/global-setup.ts'),
  globalTeardown: require.resolve('./tests/global-teardown.ts'),
  
  // Additional configuration for test stability
  forbidOnly: !!process.env.CI, // Prevent .only in CI
  preserveOutput: 'failures-only', // Keep output only for failed tests
  
  // Metadata for better test reporting
  metadata: {
    testEnvironment: 'local-supabase',
    nodeVersion: process.version,
    os: process.platform,
  },
});