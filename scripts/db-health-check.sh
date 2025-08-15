#!/bin/bash

# Robust Database Health Check for Thunderbird ESQ
# This script directly verifies the Supabase container's health
# and the presence of the pgvector extension.

set -e

echo "🚀 Kicking off database health check..."

MAX_RETRIES=10
RETRY_INTERVAL=5

# Find the container name dynamically
DB_CONTAINER_NAME=$(docker ps --format '{{.Names}}' | grep 'supabase_db' | head -n 1)

if [ -z "$DB_CONTAINER_NAME" ]; then
    echo "❌ Could not find the Supabase database container."
    exit 1
fi

echo "🔎 Found database container: $DB_CONTAINER_NAME"
echo "⏳ Waiting for the database container to be healthy..."

for i in $(seq 1 $MAX_RETRIES); do
    # Check if the container is running and healthy
    HEALTH_STATUS=$(docker inspect --format '{{.State.Health.Status}}' "$DB_CONTAINER_NAME" 2>/dev/null)
    
    if [ "$HEALTH_STATUS" == "healthy" ]; then
        echo "✅ Database container is healthy."
        
        # Now, verify that pgvector is installed and enabled
        PGVECTOR_CHECK=$(docker exec "$DB_CONTAINER_NAME" psql -U postgres -d postgres -t -c "SELECT 1 FROM pg_extension WHERE extname = 'vector';" | xargs)

        if [ "$PGVECTOR_CHECK" == "1" ]; then
            echo "✅ pgvector extension is installed and enabled."
            echo "🎉 Database is ready for testing!"
            exit 0
        else
            echo "⚠️ pgvector extension not found. Retrying in $RETRY_INTERVAL seconds..."
        fi
    else
        echo "Container not healthy yet (Status: ${HEALTH_STATUS:-Not running}). Retrying in $RETRY_INTERVAL seconds..."
    fi

    sleep $RETRY_INTERVAL
done

echo "❌ Database health check failed after $max_retries attempts."
exit 1
