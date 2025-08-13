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

# --- THE DEFINITIVE FIX IS HERE ---
# Check if vector extension is installed by executing the verified SQL script
print_status "Checking vector extension..."
if supabase db psql -f "scripts/verify-pgvector.sql" &> /dev/null; then
    print_success "vector extension is installed"
else
    print_error "vector extension is not installed or accessible. Migration may have failed."
    exit 1
fi
# --- END OF FIX ---

print_success "🎉 All critical database health checks passed!"
echo "Database is ready for the application."
