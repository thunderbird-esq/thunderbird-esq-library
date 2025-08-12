import { execSync } from 'child_process';
import { FullConfig } from '@playwright/test';

/**
 * Playwright Global Teardown for Thunderbird-ESQ E2E Tests
 * 
 * This script runs AFTER all tests complete and performs cleanup:
 * 1. Restores original environment configuration
 * 2. Optionally stops Supabase (if needed)
 * 3. Cleans up temporary test files
 * 
 * Note: We intentionally keep Supabase running for developer convenience
 */

const COLORS = {
  RESET: '\x1b[0m',
  RED: '\x1b[31m',
  GREEN: '\x1b[32m',
  YELLOW: '\x1b[33m',
  BLUE: '\x1b[34m',
  CYAN: '\x1b[36m',
} as const;

function log(message: string, color: keyof typeof COLORS = 'RESET'): void {
  console.log(`${COLORS[color]}${message}${COLORS.RESET}`);
}

function execCommand(command: string, description: string, required = false): void {
  try {
    log(`🔄 ${description}...`, 'BLUE');
    execSync(command, { 
      encoding: 'utf8', 
      stdio: 'pipe',
      timeout: 10000 // 10 second timeout per cleanup command
    });
    log(`✅ ${description} completed`, 'GREEN');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (required) {
      log(`❌ ${description} failed: ${errorMessage}`, 'RED');
      throw error;
    } else {
      log(`⚠️ ${description} failed (non-critical): ${errorMessage}`, 'YELLOW');
    }
  }
}

async function globalTeardown(config: FullConfig) {
  const startTime = Date.now();
  
  log('🧹 THUNDERBIRD-ESQ E2E TEST CLEANUP', 'YELLOW');
  log('='.repeat(60), 'YELLOW');
  log('Cleaning up test environment...', 'BLUE');
  log('='.repeat(60), 'YELLOW');

  try {
    // Restore original environment configuration
    log('📋 ENVIRONMENT RESTORATION', 'CYAN');
    log('-'.repeat(40), 'CYAN');
    
    execCommand(
      'test -f .env.local.backup && mv .env.local.backup .env.local || echo "No backup to restore"',
      'Restore original environment configuration'
    );

    // Clean up temporary test files (but preserve test results)
    log('🗄️ TEMPORARY FILE CLEANUP', 'CYAN');
    log('-'.repeat(40), 'CYAN');
    
    execCommand(
      'find test-results -name "*.tmp" -delete 2>/dev/null || true',
      'Remove temporary test files'
    );

    // Optional: Stop Supabase if running in CI environment
    if (process.env.CI) {
      log('🔌 CI ENVIRONMENT CLEANUP', 'CYAN');
      log('-'.repeat(40), 'CYAN');
      
      execCommand(
        'supabase stop',
        'Stop Supabase in CI environment'
      );
    } else {
      log('ℹ️ Keeping Supabase running for continued development', 'BLUE');
      log('   (Use "supabase stop" manually if you need to stop it)', 'BLUE');
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    
    log('='.repeat(60), 'GREEN');
    log(`✅ E2E TEST CLEANUP COMPLETED (${duration}s)`, 'GREEN');
    log('='.repeat(60), 'GREEN');
    log('Cleanup Summary:', 'GREEN');
    log('  ✅ Environment configuration restored', 'GREEN');
    log('  ✅ Temporary files cleaned', 'GREEN');
    if (process.env.CI) {
      log('  ✅ Supabase stopped (CI mode)', 'GREEN');
    } else {
      log('  ℹ️ Supabase left running (dev mode)', 'BLUE');
    }
    log('='.repeat(60), 'GREEN');

  } catch (error) {
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    
    log('='.repeat(60), 'YELLOW');
    log(`⚠️ E2E TEST CLEANUP COMPLETED WITH WARNINGS (${duration}s)`, 'YELLOW');
    log('='.repeat(60), 'YELLOW');
    
    if (error instanceof Error) {
      log(`Warning: ${error.message}`, 'YELLOW');
      log('This is usually not critical and can be ignored.', 'YELLOW');
    }
    
    // Don't throw - cleanup warnings shouldn't fail the test suite
  }
}

export default globalTeardown;