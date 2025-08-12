#!/bin/bash

# Database Health Check Script for Thunderbird ESQ Library
# This script verifies that Supabase local database is properly initialized

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

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if Docker is installed
print_status "Checking Docker installation..."
if ! command -v docker &> /dev/null; then
    print_error "Docker is not installed. Please install Docker Desktop first."
    exit 1
fi
print_success "Docker is installed"

# Check if Docker daemon is running
print_status "Checking Docker daemon status..."
if ! docker ps &> /dev/null; then
    print_error "Docker daemon is not running. Please start Docker Desktop."
    echo "On macOS: Open Docker Desktop application"
    echo "On Windows: Start Docker Desktop from Start menu"
    echo "On Linux: sudo systemctl start docker"
    exit 1
fi
print_success "Docker daemon is running"

# Check if Supabase CLI is installed
print_status "Checking Supabase CLI installation..."
if ! command -v supabase &> /dev/null; then
    print_error "Supabase CLI is not installed. Install with: npm install -g supabase"
    exit 1
fi
print_success "Supabase CLI is installed"

# Check Supabase status
print_status "Checking Supabase local status..."
if supabase status &> /dev/null; then
    print_success "Supabase is running"
    echo ""
    supabase status
else
    print_warning "Supabase is not running"
    print_status "Starting Supabase..."
    if supabase start; then
        print_success "Supabase started successfully"
        echo ""
        supabase status
    else
        print_error "Failed to start Supabase"
        exit 1
    fi
fi

# Test database connection
print_status "Testing database connection..."
if supabase db ping &> /dev/null; then
    print_success "Database connection successful"
else
    print_error "Database connection failed"
    exit 1
fi

# Check if pgvector extension is installed
print_status "Checking pgvector extension..."
if psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "SELECT extname FROM pg_extension WHERE extname = 'vector';" 2>/dev/null | grep -q vector; then
    print_success "pgvector extension is installed"
else
    print_error "pgvector extension is not installed"
    exit 1
fi

# Check if documents table exists
print_status "Checking documents table..."
if psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "\d documents" &> /dev/null; then
    print_success "Documents table exists"
else
    print_error "Documents table does not exist"
    exit 1
fi

# Check if match_documents function exists
print_status "Checking match_documents function..."
if psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "\df match_documents" 2>/dev/null | grep -q match_documents; then
    print_success "match_documents function exists"
else
    print_error "match_documents function does not exist"
    exit 1
fi

# Test vector operations
print_status "Testing vector operations..."
test_result=$(psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -t -c "SELECT '[0.1, 0.2, 0.3]'::vector(3) <=> '[0.1, 0.2, 0.4]'::vector(3) AS distance;" 2>/dev/null | tr -d ' ')
if [[ "$test_result" =~ ^0\. ]]; then
    print_success "Vector operations working (distance: $test_result)"
else
    print_error "Vector operations failed"
    exit 1
fi

echo ""
print_success "🎉 All database health checks passed!"
print_success "Database is ready for Next.js application"
echo ""
echo "Next steps:"
echo "1. Keep this terminal open with Supabase running"
echo "2. Open a new terminal for the Next.js application"
echo "3. Run: npm run dev --turbopack"