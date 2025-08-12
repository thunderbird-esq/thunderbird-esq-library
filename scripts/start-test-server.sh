#!/bin/bash

# Test Server Startup Script for E2E Tests
# This script starts Next.js with test environment configuration

set -e

echo "🚀 Starting Next.js server for E2E tests..."
echo "================================================"

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Ensure we're in the project root
if [ ! -f "package.json" ]; then
    print_error "Not in project root directory. Please run from project root."
    exit 1
fi

# Check if test environment file exists
if [ ! -f ".env.test.local" ]; then
    print_error "Test environment file (.env.test.local) not found!"
    print_error "Run the global setup first or create the test environment file."
    exit 1
fi

# Backup current .env.local if it exists
if [ -f ".env.local" ]; then
    print_status "Backing up current .env.local..."
    cp .env.local .env.local.backup
    print_success "Environment backed up to .env.local.backup"
fi

# Copy test environment
print_status "Configuring test environment..."
cp .env.test.local .env.local
print_success "Test environment configured"

# Display configuration being used
print_status "Test environment configuration:"
echo "----------------------------------------"
grep -v '^#' .env.test.local | grep -v '^$' | while read line; do
    echo -e "${BLUE}  ${line}${NC}"
done
echo "----------------------------------------"

# Set NODE_ENV for the server process
export NODE_ENV=test

# Check if port 3000 is already in use
print_status "Checking port availability..."
if lsof -Pi :3000 -sTCP:LISTEN -t >/dev/null 2>&1; then
    print_warning "Port 3000 is already in use!"
    print_warning "Attempting to find and stop existing process..."
    
    # Try to gracefully stop existing process
    PID=$(lsof -ti :3000) 2>/dev/null || true
    if [ ! -z "$PID" ]; then
        print_status "Found process $PID using port 3000, stopping it..."
        kill -TERM $PID 2>/dev/null || true
        sleep 2
        
        # Force kill if still running
        if kill -0 $PID 2>/dev/null; then
            print_warning "Process still running, force killing..."
            kill -KILL $PID 2>/dev/null || true
        fi
        sleep 1
    fi
fi

# Wait a moment for port to be freed
sleep 2

# Verify Supabase is accessible before starting Next.js
print_status "Verifying Supabase connection..."
max_retries=5
retry_count=0

while [ $retry_count -lt $max_retries ]; do
    if curl -s -f http://127.0.0.1:54321/rest/v1/ -H "apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0" >/dev/null 2>&1; then
        print_success "Supabase API accessible"
        break
    else
        retry_count=$((retry_count + 1))
        print_warning "Supabase not accessible (attempt $retry_count/$max_retries)"
        if [ $retry_count -lt $max_retries ]; then
            print_status "Waiting 3 seconds before retry..."
            sleep 3
        fi
    fi
done

if [ $retry_count -eq $max_retries ]; then
    print_error "Could not connect to Supabase after $max_retries attempts"
    print_error "Ensure Supabase is running with: supabase start"
    exit 1
fi

# Start Next.js server with test configuration
print_status "Starting Next.js development server with Turbopack..."
print_status "Server will be available at: http://localhost:3000"
print_status "Environment: TEST (using local Supabase)"
print_status "Configuration: ${PWD}/.env.local (test mode)"

# Use exec to replace the shell process with Next.js
# This ensures proper signal handling for Playwright
exec npm run dev --turbopack