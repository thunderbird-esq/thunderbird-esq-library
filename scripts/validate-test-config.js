#!/usr/bin/env node

/**
 * Playwright Configuration Validation Script
 * 
 * This script validates that the Playwright configuration is properly set up
 * for reliable E2E test execution with appropriate timeouts and debugging.
 * 
 * Run with: node scripts/validate-test-config.js
 */

const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, '..', 'playwright.config.ts');

console.log('🔍 Validating Playwright Configuration...');
console.log('='.repeat(50));

// Check if config file exists
if (!fs.existsSync(CONFIG_PATH)) {
  console.error('❌ playwright.config.ts not found!');
  process.exit(1);
}

// Read and validate configuration
const configContent = fs.readFileSync(CONFIG_PATH, 'utf8');

const validations = [
  {
    name: 'Global test timeout is adequate (60s+)',
    check: () => configContent.includes('timeout: 60000') || configContent.match(/timeout:\s*[6-9]\d{4,}/),
    required: true
  },
  {
    name: 'WebServer timeout is sufficient (300s)',
    check: () => configContent.includes('timeout: 300000'),
    required: true
  },
  {
    name: 'Extended expect timeout configured',
    check: () => configContent.includes('timeout: 10000') && configContent.includes('expect:'),
    required: true
  },
  {
    name: 'Retry configuration for flaky tests',
    check: () => configContent.includes('retries:') && (configContent.includes('? 3 : 1') || configContent.includes('? 2 : 0')),
    required: true
  },
  {
    name: 'Enhanced debugging options enabled',
    check: () => configContent.includes('trace:') && configContent.includes('screenshot:') && configContent.includes('video:'),
    required: true
  },
  {
    name: 'Extended navigation timeout (20s)',
    check: () => configContent.includes('navigationTimeout: 20000'),
    required: true
  },
  {
    name: 'Extended action timeout (10s)',
    check: () => configContent.includes('actionTimeout: 10000'),
    required: true
  },
  {
    name: 'Conservative worker configuration',
    check: () => configContent.includes('workers:') && configContent.includes('? 1 : 2'),
    required: true
  },
  {
    name: 'Global timeout for entire test suite',
    check: () => configContent.includes('globalTimeout: 600000'),
    required: true
  },
  {
    name: 'Enhanced reporter configuration',
    check: () => configContent.includes('junit') && configContent.includes('line'),
    required: false
  }
];

let passed = 0;
let failed = 0;

validations.forEach(validation => {
  const result = validation.check();
  if (result) {
    console.log(`✅ ${validation.name}`);
    passed++;
  } else {
    const symbol = validation.required ? '❌' : '⚠️';
    console.log(`${symbol} ${validation.name}`);
    if (validation.required) failed++;
  }
});

console.log('\n' + '='.repeat(50));
console.log(`📊 Validation Results: ${passed} passed, ${failed} failed`);

if (failed === 0) {
  console.log('🎉 Configuration validation passed! Ready for reliable E2E testing.');
  
  // Additional recommendations
  console.log('\n💡 Recommendations for optimal test execution:');
  console.log('   • Ensure Supabase is running: supabase start');
  console.log('   • Clear previous test artifacts: rm -rf test-results/');
  console.log('   • Run tests with: npm run test:e2e');
  console.log('   • Monitor test server logs for issues');
  
  process.exit(0);
} else {
  console.log('❌ Configuration validation failed! Please review the failed checks.');
  process.exit(1);
}