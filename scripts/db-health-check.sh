#!/bin/bash
# Robust Database Health Check for Thunderbird ESQ
#
# This script uses `docker exec` to directly query the Supabase PostgreSQL
# container and verify that the `pgvector` extension is installed and active.
# It is designed to be fast, reliable, and CI-friendly.
#
# Exits with status 0 on success, 1 on failure.

set -eo pipefail

# --- Configuration ---
DB_CONTAINER_NAME_PATTERN="supabase_db"
DB_USER="postgres"
DB_NAME="postgres"
REQUIRED_EXTENSION="vector"
MAX_RETRIES=10
RETRY_INTERVAL_SECONDS=3

# --- Logging ---
log() {
    echo "[$(date +'%Y-%m-%dT%H:%M:%S%z')] [HealthCheck] $1"
}

log_error() {
    log "ERROR: $1" >&2
}

# --- Main Logic ---
log "Starting database health check..."

# 1. Find the Supabase database container ID
log "Searching for database container matching pattern: '${DB_CONTAINER_NAME_PATTERN}'..."
CONTAINER_ID=$(sudo docker ps -q --filter "name=${DB_CONTAINER_NAME_PATTERN}")

if [[ -z "$CONTAINER_ID" ]]; then
    log_error "Supabase database container not found."
    log_error "Please ensure Supabase is running with 'supabase start'."
    exit 1
fi

if [[ $(echo "$CONTAINER_ID" | wc -l) -gt 1 ]]; then
    log_error "Multiple database containers found. Please ensure only one is running."
    exit 1
fi

log "Found database container ID: $CONTAINER_ID"

# 2. Poll the database until the pgvector extension is ready
log "Verifying '${REQUIRED_EXTENSION}' extension in database '${DB_NAME}'..."
for ((i=1; i<=MAX_RETRIES; i++)); do
    log "Attempt $i of $MAX_RETRIES..."

    # Execute the check command
    check_command_output=$(sudo docker exec "$CONTAINER_ID" psql -U "$DB_USER" -d "$DB_NAME" -tAc "SELECT 1 FROM pg_extension WHERE extname = '${REQUIRED_EXTENSION}';" 2>&1)
    
    # Check the exit code of the docker exec command
    if [[ $? -eq 0 ]] && [[ "$check_command_output" == "1" ]]; then
        log "SUCCESS: '${REQUIRED_EXTENSION}' extension is installed and active."
        log "Database is ready!"
        exit 0
    fi

    log "Health check failed on attempt $i. Details: ${check_command_output}"
    if (( i < MAX_RETRIES )); then
        log "Waiting ${RETRY_INTERVAL_SECONDS} seconds before next attempt..."
        sleep "$RETRY_INTERVAL_SECONDS"
    fi
done

log_error "Failed to confirm database health after $MAX_RETRIES attempts."
log_error "The '${REQUIRED_EXTENSION}' extension is not available."
exit 1
