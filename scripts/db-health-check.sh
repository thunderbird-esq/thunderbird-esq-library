#!/bin/bash

# Database Health Check Script for Thunderbird ESQ Library
# This script verifies that Supabase local database is properly initialized
#
# Usage:
#   ./scripts/db-health-check.sh          # Standard health check
#   ./scripts/db-health-check.sh --extended  # Extended validation including vector functionality tests

set -e

echo "🔍 Database Health Check - Thunderbird ESQ Library"
echo "=================================================="

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if Supabase CLI is installed
print_status "Checking Supabase CLI installation..."
if ! command -v supabase &> /dev/null; then
    print_error "Supabase CLI is not installed."
    exit 1
fi
print_success "Supabase CLI is installed"

# Check if Docker is running
print_status "Checking Docker daemon status..."
if ! docker ps &> /dev/null; then
    print_error "Docker daemon is not running. Please start Docker."
    exit 1
fi
print_success "Docker daemon is running"

# Ensure Supabase is running
print_status "Checking Supabase local status..."
if ! supabase status > /dev/null; then
    print_status "Supabase is not running. Starting it now..."
    supabase start
fi
print_success "Supabase is running"

# Test database connection
print_status "Testing database connection..."
if ! supabase db ping &> /dev/null; then
    print_error "Database connection failed."
    exit 1
fi
print_success "Database connection successful"

# Check if vector extension is installed
print_status "Checking vector extension..."

# Get the container name dynamically - look for the main database container
CONTAINER_NAME=$(docker ps --format "{{.Names}}" | grep "supabase_db_" | head -1)

if [ -z "$CONTAINER_NAME" ]; then
    print_error "Could not find Supabase PostgreSQL container"
    exit 1
fi

# Execute the vector extension check directly via Docker
VECTOR_CHECK_RESULT=$(docker exec "$CONTAINER_NAME" psql -U postgres -d postgres -t -c "
DO \$\$
DECLARE
  extension_exists boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM pg_extension ext
    JOIN pg_namespace nsp ON ext.extnamespace = nsp.oid
    WHERE ext.extname = 'vector' AND nsp.nspname = 'extensions'
  ) INTO extension_exists;
  
  IF NOT extension_exists THEN
    RAISE EXCEPTION 'pgvector extension not found in extensions schema';
  END IF;
  
  -- Output success message
  RAISE NOTICE 'pgvector extension verified successfully';
END;
\$\$;" 2>&1)

if echo "$VECTOR_CHECK_RESULT" | grep -q "pgvector extension verified successfully"; then
    print_success "vector extension is installed and accessible"
    
    # Optional: Run comprehensive validation if --extended flag is provided
    if [[ "$1" == "--extended" ]]; then
        print_status "Running extended vector functionality validation..."
        EXTENDED_VALIDATION=$(cat scripts/validate-vector-functionality.sql | docker exec -i "$CONTAINER_NAME" psql -U postgres -d postgres 2>&1)
        
        if echo "$EXTENDED_VALIDATION" | grep -q "All checks passed"; then
            print_success "Extended vector validation completed successfully"
        else
            print_error "Extended vector validation failed. Details: $EXTENDED_VALIDATION"
            exit 1
        fi
    fi
else
    print_error "vector extension is not installed or accessible. Details: $VECTOR_CHECK_RESULT"
    exit 1
fi

print_success "🎉 All critical database health checks passed!"
echo "Database is ready for the application."
