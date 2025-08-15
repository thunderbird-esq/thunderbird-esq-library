#!/bin/bash
# Starts the Next.js server for E2E tests.
# The environment is expected to be configured by global-setup.ts.
set -e
echo "🚀 Starting Next.js server for E2E tests..."
export NODE_ENV=test
exec npm run dev --turbopack