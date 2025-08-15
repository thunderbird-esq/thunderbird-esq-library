#!/bin/bash

# Consolidated Test Server Startup Script for E2E Tests
# This script handles the entire setup process:
# 1. Validates Docker and Supabase CLI
# 2. Starts Supabase if not running
# 3. Performs a robust health check on the database
# 4. Sets up the test environment
# 5. Starts the Next.js server

set -e

# --- Color codes and print functions ---
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

print_header() {
    echo -e "${CYAN}================================================================${NC}"
    echo -e "${CYAN}🚀 $1${NC}"
    echo -e "${CYAN}================================================================${NC}"
}

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
    exit 1
}

# --- Setup Functions ---

validate_docker() {
    print_header "DOCKER VALIDATION"
    if ! command -v docker &> /dev/null; then
        print_error "Docker is not installed. Please install Docker."
    fi
    if ! docker ps &> /dev/null; then
        print_error "Docker daemon is not running. Please start Docker."
    fi
    print_success "Docker is installed and running."
}

validate_supabase() {
    print_header "SUPABASE VALIDATION"
    if ! command -v supabase &> /dev/null; then
        print_error "Supabase CLI is not installed. Please install it."
    fi
    
    if supabase status > /dev/null 2>&1; then
        print_success "Supabase is already running."
    else
        print_warning "Supabase is not running. Starting it now..."
        if ! supabase start; then
            print_error "Failed to start Supabase."
        fi
        print_success "Supabase started successfully."
    fi
}

run_health_check() {
    print_header "DATABASE HEALTH CHECK"
    if ! bash ./scripts/db-health-check.sh; then
        print_error "Database health check failed."
    fi
    print_success "Database is healthy and ready."
}

setup_environment() {
    print_header "ENVIRONMENT SETUP"
    if [ ! -f ".env.test.local" ]; then
        print_error "Test environment file (.env.test.local) not found!"
    fi

    if [ -f ".env.local" ]; then
        print_status "Backing up current .env.local to .env.local.backup"
        cp .env.local .env.local.backup
    fi

    print_status "Copying .env.test.local to .env.local for the test run."
    cp .env.test.local .env.local
    print_success "Test environment configured."
}

# --- Main Execution ---

print_header "E2E TEST ENVIRONMENT INITIALIZATION"

# 1. Validate Docker
validate_docker

# 2. Validate and start Supabase
validate_supabase

# 3. Run database health check
run_health_check

# 4. Set up .env file
setup_environment

# 5. Start the Next.js server
print_header "STARTING NEXT.JS SERVER"
print_status "All checks passed. Starting the application..."

# Use exec to replace the shell process with Next.js
# This ensures proper signal handling from Playwright.
exec npm run dev --turbopack