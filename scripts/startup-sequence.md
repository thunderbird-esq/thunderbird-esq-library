# Database Startup Sequence - Thunderbird ESQ Library

## CRITICAL: Proper Database Initialization Protocol

This document outlines the mandatory startup sequence to ensure the Supabase local database is properly initialized before starting the Next.js application.

## Root Cause Analysis

The RAG ingestion failures are primarily caused by:
1. Docker daemon not running (required for Supabase local)
2. Supabase local database not started before Next.js
3. Missing database connection verification
4. No pgvector extension validation

## Prerequisites

### 1. Docker Desktop
- **macOS/Windows**: Install Docker Desktop and ensure it's running
- **Linux**: Install Docker Engine and start the daemon
- Verify with: `docker --version` and `docker ps`

### 2. Supabase CLI
- Install globally: `npm install -g supabase`
- Verify with: `supabase --version`

### 3. Environment Variables
Ensure `.env.local` contains:
```env
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_local_anon_key
HUGGING_FACE_API_KEY=your_hugging_face_token
```

## Mandatory Startup Sequence

### Terminal 1: Database Operations

```bash
# 1. Start Docker Desktop (GUI) or Docker daemon
# macOS/Windows: Open Docker Desktop application
# Linux: sudo systemctl start docker

# 2. Navigate to project directory
cd /Users/michaelraftery/thunderbird-esq-library

# 3. Run database health check
./scripts/db-health-check.sh

# 4. If health check passes, Supabase is running
# Keep this terminal open - DO NOT CLOSE
```

### Terminal 2: Application Development

```bash
# 1. Navigate to project directory (new terminal)
cd /Users/michaelraftery/thunderbird-esq-library

# 2. Start Next.js with Turbopack
npm run dev --turbopack

# 3. Access application at http://localhost:3000
```

## Database Health Verification

The health check script validates:

### ✅ Infrastructure
- Docker installation and daemon status
- Supabase CLI installation
- Local Supabase services status

### ✅ Database Schema
- pgvector extension (v0.8.0)
- documents table with embedding column (384-dimensional)
- match_documents function for similarity search

### ✅ Connectivity
- Database connection (port 54322)
- Vector operations functionality
- API endpoint availability (port 54321)

## Critical Service Ports

| Service | Port | Purpose |
|---------|------|---------|
| API Gateway | 54321 | Next.js connection |
| PostgreSQL | 54322 | Direct DB access |
| Studio | 54323 | Database management |
| Inbucket | 54324 | Email testing |

## Troubleshooting

### Docker Issues
```bash
# Check Docker status
docker --version
docker ps

# Restart Docker (macOS/Windows)
# Quit and restart Docker Desktop

# Restart Docker (Linux)
sudo systemctl restart docker
```

### Supabase Issues
```bash
# Reset corrupted database
supabase db reset

# Check migration status
supabase migration list

# Apply migrations manually
supabase db push
```

### Connection Issues
```bash
# Test database connection
supabase db ping

# Check all services
supabase status

# View logs
supabase logs
```

## Production Checklist

Before deploying or running ingestion:

- [ ] Docker daemon is running
- [ ] Supabase local is started and healthy
- [ ] All health checks pass
- [ ] pgvector extension is functional
- [ ] Documents table exists with proper schema
- [ ] match_documents function is available
- [ ] Vector operations are working

## Emergency Recovery

If database becomes corrupted:

```bash
# 1. Stop Supabase
supabase stop

# 2. Reset database (WARNING: destroys all data)
supabase db reset

# 3. Run health check
./scripts/db-health-check.sh
```

## Integration with RAG Pipeline

The RAG system requires:
- **Client-side fetching**: Internet Archive content fetched in browser
- **Server-side processing**: Text processing and embedding generation
- **Vector storage**: 384-dimensional embeddings in PostgreSQL with pgvector
- **Similarity search**: Cosine distance for document retrieval

This startup sequence ensures all components are properly initialized before any RAG operations begin.