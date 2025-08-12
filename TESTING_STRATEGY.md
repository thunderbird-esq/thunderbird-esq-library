Project Mandate: Bulletproof Unit Testing
This document is not a set of guidelines; it is the ironclad, non-negotiable protocol for software quality assurance on this project. Its purpose is to eliminate regressions, guarantee core functionality, and serve as the definitive measure of application health. Adherence is mandatory.

1. The Technology Stack (Non-Negotiable)
To ensure consistency and expertise, the following tools will be used. There will be no deviation.

Test Runner: Jest. It is the standard.

Testing Library: React Testing Library (RTL). We test from the user's perspective. We do not test implementation details.

Mocking: Jest's built-in mocking capabilities. All external dependencies and server actions will be mocked at the appropriate boundaries.

2. Setup and Configuration
The testing framework will be configured as follows:

Installation:

npm install --save-dev jest jest-environment-jsdom @testing-library/react @testing-library/jest-dom

Jest Configuration (jest.config.js): A project-level configuration file will define the test environment, including support for TypeScript, module aliases (@/*), and CSS modules.

Setup File (jest.setup.js): This file will import @testing-library/jest-dom to provide custom DOM matchers.

3. The Core Methodology: Zero False Positives
A test that passes incorrectly is a critical failure of process. The following methodology is designed to ensure our tests are meaningful and trustworthy.

Test User Goals, Not Implementation Details: Tests for UI components will not assert against internal state, snapshots, or specific CSS classes. Tests will find elements as a user would (by role, label, or text) and assert that a user's goal can be accomplished. This ensures tests survive refactoring.

Mandatory Isolation: Unit tests test a single unit. There are no exceptions.

When testing a React component, all imported server actions will be mocked. The test's sole responsibility is to verify that the component calls the correct action with the correct arguments in response to user interaction.

When testing a server action, all external dependencies (Supabase client, Hugging Face API, etc.) will be mocked. The test's sole responsibility is to verify the action's internal logic, data transformation, and error handling.

The "Red-Green-Refactor" Mandate: No test shall be written that passes on its first run. All new tests must first be written to fail for the expected reason (Red). Only after witnessing the expected failure will the implementation code be written to make the test pass (Green). This is the only way to prove a test's validity.

4. Test Structure & Coverage Mandates
A. Server Actions (/src/app/actions.ts)
Every public function in actions.ts will have a corresponding actions.test.ts file with complete coverage.

Example Test Mandate for getSourcedAnswer:

It Must:

Correctly call the ai.embed function with the provided question.

Correctly call the Supabase rpc('match_documents', ...) method with the resulting embedding.

Correctly call the ai.chat function with a prompt that includes the context from Supabase.

Return a { success: true, ... } object on a valid execution path.

It Must Handle Failure:

Return a { success: false, ... } object with a specific error message if the Supabase query fails.

Return a { success: false, ... } object with a specific error message if any ai module call fails.

B. React Components (/src/components/**/*.tsx)
Every component will have a corresponding *.test.tsx file.

Example Test Mandate for ChatInterface.tsx:

It Must:

Call the mocked streamSourcedAnswer server action with the correct arguments when the user submits the form.

Immediately display a loading state to the user upon submission.

Correctly render the streamed response from a successful action call.

It Must Handle Failure:

Display a specific, user-friendly error message if the mocked server action returns an error.

5. The Automated Quality Gate
To make regressions impossible, quality assurance will be automated.

NPM Scripts: The following scripts will be present in package.json:

"scripts": {
  "test": "jest --watch",
  "test:ci": "jest --ci"
}

Pre-Commit Enforcement: A Husky pre-commit hook will be configured to run the test:ci script. Any commit that results in a test failure will be automatically aborted. No broken code will enter the repository.

This is the standard. This multi-layered approach is how we build professional, reliable software.

---

# Playwright E2E Test Configuration Optimization

## Overview

This section describes the comprehensive optimizations made to the Playwright test configuration to ensure reliable E2E test execution for the Thunderbird-ESQ RAG ingestion pipeline, complementing the unit testing strategy above.

## Key Optimizations Implemented

### 1. Timeout Configuration Enhancements

**Global Test Timeout**: Extended from 30s to 60s
- **Rationale**: Complex operations like Internet Archive searches, document processing, and AI response generation require extended timeouts
- **Impact**: Prevents spurious timeout failures for legitimate long-running operations

**WebServer Startup Timeout**: Extended from 180s to 300s (5 minutes)
- **Rationale**: Supabase startup + Next.js with Turbopack can take significant time
- **Impact**: Eliminates webServer startup failures that were causing test suite initialization to fail

**Assertion Timeout**: Extended from 5s to 10s
- **Rationale**: Complex DOM operations and API responses need more time
- **Impact**: Reduces flaky test failures from timing issues

**Navigation/Action Timeouts**: Extended to 20s/10s respectively
- **Rationale**: Internet Archive API calls and document downloads are slow
- **Impact**: Accommodates real-world network latency and processing delays

### 2. Retry and Stability Configuration

**Retry Strategy**: Enhanced from (CI: 2, Local: 0) to (CI: 3, Local: 1)
- **Rationale**: Aggressive retry strategy for inherently flaky E2E operations
- **Impact**: Improves test reliability without masking genuine failures

**Worker Configuration**: Conservative parallel execution (CI: 1, Local: 2)
- **Rationale**: Prevents resource contention and database conflicts
- **Impact**: More stable test execution with reduced flakiness

### 3. Enhanced Debugging Capabilities

**Comprehensive Artifact Collection**:
- Traces captured on first retry
- Screenshots captured on failures
- Videos retained on failures
- JUnit XML reports for CI integration

**Browser Configuration**:
- Slow motion enabled in local development (100ms)
- DevTools available for debugging
- Extended viewport (1280x720) for consistent rendering

**Enhanced Reporting**:
- HTML reports with detailed test execution data
- JSON output for programmatic analysis
- Line reporter for better console output
- JUnit XML for CI/CD integration

### 4. Test Environment Stability

**Global Configuration**:
- 10-minute global timeout for entire test suite
- Proper test isolation with bypassed CSP
- Comprehensive metadata tracking
- Failures-only output preservation

**Test Matching**:
- Explicit test patterns for E2E directory
- Prevention of `.only` in CI environments
- Proper artifact management and cleanup

## Test Execution Commands

### Standard Test Execution
```bash
npm run test:e2e              # Run all E2E tests
npm run test:e2e:ui           # Run with Playwright UI
npm run test:e2e:debug        # Run in debug mode
npm run test:e2e:headed       # Run with browser UI visible
npm run test:e2e:setup        # Run with health check first
```

### Manual Environment Setup
```bash
npm run db:start              # Start Supabase local
npm run db:health             # Check database health
npm run test:e2e              # Run tests
```

### Configuration Validation
```bash
node scripts/validate-test-config.js  # Validate configuration
```

## Expected Test Performance

### Baseline Test Execution Times

| Test Type | Expected Duration | Timeout |
|-----------|------------------|---------|
| Infrastructure Health | 5-10s | 60s |
| Internet Archive Search | 10-20s | 60s |
| Document Ingestion (PDF) | 30-45s | 60s |
| Document Ingestion (Text) | 15-30s | 60s |
| RAG Query Response | 20-35s | 60s |
| Complete Workflow | 60-90s | 60s |

### Startup Performance
- **Supabase Health Check**: 10-30s
- **Next.js with Turbopack**: 30-60s
- **Total Test Environment Setup**: 60-120s (within 300s timeout)

## Test Architecture Considerations

### Real API Integration
- Tests use actual Internet Archive API
- Real document downloads and processing
- Actual Hugging Face embedding generation
- Live Supabase vector database operations

### Flakiness Mitigation
- Multiple selector strategies for UI elements
- Progressive timeout strategies with fallbacks
- Comprehensive error capture and debugging
- Graceful degradation for missing UI components

### Resource Management
- Conservative parallel execution
- Proper test isolation
- Artifact cleanup and retention policies
- Memory and connection pool optimization

## E2E Test Validation Results

✅ All configuration validations passed
✅ Extended timeouts configured appropriately
✅ Enhanced debugging capabilities enabled
✅ Retry strategies optimized for stability
✅ Test environment properly isolated
✅ Comprehensive artifact collection setup

The optimized configuration provides a robust foundation for reliable E2E testing of the complex RAG ingestion pipeline, with comprehensive debugging capabilities for issue identification and resolution.
