import { FullConfig } from '@playwright/test';

/**
 * Playwright Global Setup for Thunderbird-ESQ E2E Tests
 *
 * This script's responsibilities have been significantly reduced.
 * The core setup logic (Docker, Supabase, health checks) has been moved to
 * `scripts/start-test-server.sh` to ensure it runs in the correct
 * execution context with proper permissions.
 *
 * This script now only provides logging hooks and a placeholder for any
 * future setup tasks that do not involve Docker.
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

async function globalSetup(config: FullConfig) {
  log('🚀 KICKING OFF PLAYWRIGHT GLOBAL SETUP', 'CYAN');
  log('='.repeat(80), 'CYAN');
  log('NOTE: Most setup logic now resides in `scripts/start-test-server.sh`', 'YELLOW');
  log('This script is now a lightweight placeholder.', 'YELLOW');
  log('='.repeat(80), 'CYAN');
  // All major setup tasks are now handled by the webServer command.
  // This ensures they run in the correct environment with Docker permissions.
}

export default globalSetup;