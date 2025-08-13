# CI/CD Pipeline Setup

This document outlines the GitHub Actions CI/CD pipeline configuration for the Thunderbird-ESQ Library project.

## Required Secrets Configuration

To enable the CI/CD pipeline, configure the following secrets in your GitHub repository settings:

### Environment Variables
- `NEXT_PUBLIC_SUPABASE_URL` - Your Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Your Supabase anonymous key  
- `HUGGING_FACE_API_KEY` - Your Hugging Face API token

### Deployment Secrets (Optional - for Vercel deployment)
- `VERCEL_TOKEN` - Vercel deployment token
- `VERCEL_ORG_ID` - Your Vercel organization ID
- `VERCEL_PROJECT_ID` - Your Vercel project ID

## Pipeline Overview

The CI/CD pipeline consists of the following jobs:

### 1. Code Quality (`lint-and-typecheck`)
- Runs ESLint for code quality checks
- Performs TypeScript type checking
- Ensures code follows project standards

### 2. Security Scanning (`security-scan`)
- Runs `npm audit` for dependency vulnerabilities
- Performs container/dependency security scanning
- Fails on high-severity vulnerabilities

### 3. Unit Tests (`unit-tests`)
- Executes Vitest unit tests
- Provides test coverage reports
- Validates core functionality

### 4. Build (`build`)
- Builds the Next.js application
- Uploads build artifacts for downstream jobs
- Ensures production-ready code

### 5. E2E Tests (`e2e-tests`)
- Starts local Supabase instance with PostgreSQL
- Runs Playwright end-to-end tests
- Tests complete user workflows
- Uploads test reports and artifacts

### 6. Deployment
- **Staging**: Deploys `develop` branch to Vercel preview environment
- **Production**: Deploys `main` branch to Vercel production environment

## Local Development Integration

The pipeline is designed to work seamlessly with your local development environment:

- Uses the same test configurations as `npm run test` and `npm run test:e2e`
- Maintains consistency with local Supabase setup
- Respects the same environment variables and configurations

## Branch Strategy

- **`main`** - Production deployments
- **`develop`** - Staging deployments  
- **Feature branches** - CI validation only (no deployment)

## Monitoring and Debugging

- Playwright reports are uploaded for failed E2E tests
- Build artifacts are preserved for 1 day
- Test results are available in JUnit format
- All jobs include detailed logging for debugging

## Adding New Tests

To add new tests to the pipeline:

1. **Unit tests**: Add `.test.ts` files to `src/test/`
2. **E2E tests**: Add `.spec.ts` files to `tests/e2e/`
3. The pipeline will automatically detect and run new tests

## Performance Considerations

- Jobs run in parallel where possible to minimize execution time
- Build artifacts are cached between jobs
- Node.js dependencies are cached for faster installs
- E2E tests use optimized Playwright configuration for CI