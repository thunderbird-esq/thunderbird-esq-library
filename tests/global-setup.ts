import { execSync } from 'child_process';
import { FullConfig } from '@playwright/test';
import path from 'path';
import fs from 'fs';

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

function execCommand(command: string, description: string): string {
  try {
    log(`🔄 ${description}...`, 'BLUE');
    const result = execSync(command, {
      encoding: 'utf8',
      stdio: 'inherit', // Use 'inherit' to see command output in real-time
      timeout: 900000, // 15 minute timeout for long commands like supabase start
    });
    log(`✅ ${description} completed successfully`, 'GREEN');
    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log(`❌ ${description} failed: ${errorMessage}`, 'RED');
    throw new Error(`Setup failed at: ${description}\nCommand: ${command}\nError: ${errorMessage}`);
  }
}

async function globalSetup(config: FullConfig) {
  const startTime = Date.now();
  log('🚀 THUNDERBIRD-ESQ E2E TEST SETUP', 'CYAN');
  log('='.repeat(80), 'CYAN');
  log('Initializing test environment...', 'BLUE');

  try {
    // Step 1: Create .env.local for the test run
    const envContent = `
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0
HUGGING_FACE_API_KEY=your_new_hugging_face_token_here
NODE_ENV=test
`;
    fs.writeFileSync('.env.local', envContent);
    log('✅ Created .env.local for test run', 'GREEN');

    // Step 2: Start Supabase
    // This command will ensure the Docker containers are up and running.
    execCommand('sudo npx supabase start', 'Start Supabase local development stack');

    // Step 2: Run the robust database health check script
    // This script will wait until the database is fully initialized and pgvector is ready.
    const healthCheckScriptPath = path.resolve(__dirname, '../../scripts/db-health-check.sh');
    execCommand(`bash ${healthCheckScriptPath}`, 'Run database health check');

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    log('='.repeat(80), 'GREEN');
    log(`🎉 E2E TEST ENVIRONMENT READY (${duration}s)`, 'GREEN');
    log('='.repeat(80), 'GREEN');
    log('Next.js development server will now start...', 'BLUE');

  } catch (error) {
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    log('='.repeat(80), 'RED');
    log(`💥 E2E TEST SETUP FAILED (${duration}s)`, 'RED');
    log('='.repeat(80), 'RED');

    if (error instanceof Error) {
      log(`Error: ${error.message}`, 'RED');
    }
    
    log('TROUBLESHOOTING STEPS:', 'YELLOW');
    log('1. Ensure Docker Desktop is running.', 'YELLOW');
    log('2. Check for conflicting processes on required ports (54321, 54322, etc.).', 'YELLOW');
    log('3. Manually run `supabase start` and `./scripts/db-health-check.sh` to debug.', 'YELLOW');
    
    // Re-throw the error to abort the test run
    throw error;
  }
}

export default globalSetup;