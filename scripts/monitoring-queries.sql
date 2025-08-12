-- Database Monitoring Queries for Thunderbird ESQ Library
-- These queries help monitor database performance and health

-- =============================================================================
-- CONNECTION MONITORING
-- =============================================================================

-- Active connections by state
SELECT 
    state,
    COUNT(*) as connection_count,
    MAX(EXTRACT(epoch FROM (now() - state_change))) as max_duration_seconds
FROM pg_stat_activity 
WHERE datname = current_database()
GROUP BY state
ORDER BY connection_count DESC;

-- Long-running queries (over 30 seconds)
SELECT 
    pid,
    now() - pg_stat_activity.query_start AS duration,
    query,
    state,
    wait_event_type,
    wait_event
FROM pg_stat_activity 
WHERE datname = current_database()
  AND now() - pg_stat_activity.query_start > interval '30 seconds'
  AND state != 'idle'
ORDER BY duration DESC;

-- Connection pool utilization
SELECT 
    COUNT(*) as total_connections,
    COUNT(*) FILTER (WHERE state = 'active') as active_connections,
    COUNT(*) FILTER (WHERE state = 'idle') as idle_connections,
    COUNT(*) FILTER (WHERE state = 'idle in transaction') as idle_in_transaction,
    ROUND(
        (COUNT(*) FILTER (WHERE state = 'active')::numeric / COUNT(*)::numeric) * 100, 
        2
    ) as utilization_percentage
FROM pg_stat_activity 
WHERE datname = current_database();

-- =============================================================================
-- VECTOR DATABASE PERFORMANCE
-- =============================================================================

-- Documents table statistics
SELECT 
    schemaname,
    tablename,
    n_tup_ins as inserts,
    n_tup_upd as updates,
    n_tup_del as deletes,
    n_live_tup as live_tuples,
    n_dead_tup as dead_tuples,
    last_vacuum,
    last_autovacuum,
    last_analyze,
    last_autoanalyze
FROM pg_stat_user_tables 
WHERE tablename = 'documents';

-- Index usage on documents table
SELECT 
    schemaname,
    tablename,
    indexname,
    idx_tup_read,
    idx_tup_fetch,
    CASE 
        WHEN idx_tup_read = 0 THEN 0
        ELSE ROUND((idx_tup_fetch::numeric / idx_tup_read::numeric) * 100, 2)
    END as hit_ratio_percentage
FROM pg_stat_user_indexes 
WHERE tablename = 'documents'
ORDER BY idx_tup_read DESC;

-- Table size and bloat analysis
SELECT 
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as total_size,
    pg_size_pretty(pg_relation_size(schemaname||'.'||tablename)) as table_size,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename) - pg_relation_size(schemaname||'.'||tablename)) as indexes_size
FROM pg_tables 
WHERE tablename = 'documents';

-- Vector operations performance
WITH vector_stats AS (
    SELECT 
        COUNT(*) as total_documents,
        AVG(array_length(embedding::float[], 1)) as avg_dimension,
        MIN(array_length(embedding::float[], 1)) as min_dimension,
        MAX(array_length(embedding::float[], 1)) as max_dimension
    FROM documents 
    WHERE embedding IS NOT NULL
)
SELECT 
    total_documents,
    avg_dimension,
    min_dimension,
    max_dimension,
    CASE 
        WHEN total_documents > 0 THEN 'Vector operations ready'
        ELSE 'No embeddings found'
    END as status
FROM vector_stats;

-- =============================================================================
-- LOCK MONITORING
-- =============================================================================

-- Current locks
SELECT 
    pg_class.relname as table_name,
    pg_locks.locktype,
    pg_locks.mode,
    pg_locks.granted,
    pg_stat_activity.pid,
    pg_stat_activity.query,
    pg_stat_activity.state,
    now() - pg_stat_activity.query_start as duration
FROM pg_locks
JOIN pg_class ON pg_locks.relation = pg_class.oid
JOIN pg_stat_activity ON pg_locks.pid = pg_stat_activity.pid
WHERE pg_class.relname = 'documents'
ORDER BY duration DESC;

-- Lock waits
SELECT 
    blocked_locks.pid as blocked_pid,
    blocked_activity.usename as blocked_user,
    blocking_locks.pid as blocking_pid,
    blocking_activity.usename as blocking_user,
    blocked_activity.query as blocked_statement,
    blocking_activity.query as blocking_statement,
    blocked_activity.application_name as blocked_application,
    blocking_activity.application_name as blocking_application,
    blocked_locks.mode as blocked_mode,
    blocking_locks.mode as blocking_mode,
    now() - blocked_activity.query_start as blocked_duration
FROM pg_catalog.pg_locks blocked_locks
JOIN pg_catalog.pg_stat_activity blocked_activity ON blocked_activity.pid = blocked_locks.pid
JOIN pg_catalog.pg_locks blocking_locks ON blocking_locks.locktype = blocked_locks.locktype
    AND blocking_locks.DATABASE IS NOT DISTINCT FROM blocked_locks.DATABASE
    AND blocking_locks.relation IS NOT DISTINCT FROM blocked_locks.relation
    AND blocking_locks.page IS NOT DISTINCT FROM blocked_locks.page
    AND blocking_locks.tuple IS NOT DISTINCT FROM blocked_locks.tuple
    AND blocking_locks.virtualxid IS NOT DISTINCT FROM blocked_locks.virtualxid
    AND blocking_locks.transactionid IS NOT DISTINCT FROM blocked_locks.transactionid
    AND blocking_locks.classid IS NOT DISTINCT FROM blocked_locks.classid
    AND blocking_locks.objid IS NOT DISTINCT FROM blocked_locks.objid
    AND blocking_locks.objsubid IS NOT DISTINCT FROM blocked_locks.objsubid
    AND blocking_locks.pid != blocked_locks.pid
JOIN pg_catalog.pg_stat_activity blocking_activity ON blocking_activity.pid = blocking_locks.pid
WHERE NOT blocked_locks.GRANTED;

-- =============================================================================
-- REPLICATION MONITORING (if applicable)
-- =============================================================================

-- Replication lag (for production setups)
SELECT 
    client_addr,
    client_hostname,
    client_port,
    state,
    sent_lsn,
    write_lsn,
    flush_lsn,
    replay_lsn,
    write_lag,
    flush_lag,
    replay_lag,
    sync_state,
    sync_priority
FROM pg_stat_replication;

-- WAL generation rate
SELECT 
    (pg_current_wal_lsn() - pg_stat_reset) / 1024 / 1024 AS wal_mb_generated,
    pg_stat_reset
FROM (
    SELECT 
        '0/0'::pg_lsn as pg_stat_reset
) t;

-- =============================================================================
-- MAINTENANCE ALERTS
-- =============================================================================

-- Tables needing vacuum
SELECT 
    schemaname,
    tablename,
    n_dead_tup,
    n_live_tup,
    ROUND((n_dead_tup::numeric / NULLIF(n_live_tup + n_dead_tup, 0)::numeric) * 100, 2) as dead_tuple_percentage,
    last_vacuum,
    last_autovacuum
FROM pg_stat_user_tables 
WHERE n_dead_tup > 1000 
   OR (n_live_tup + n_dead_tup > 0 AND (n_dead_tup::numeric / (n_live_tup + n_dead_tup)::numeric) > 0.1)
ORDER BY dead_tuple_percentage DESC;

-- Tables needing analyze
SELECT 
    schemaname,
    tablename,
    n_mod_since_analyze,
    last_analyze,
    last_autoanalyze,
    CASE 
        WHEN last_analyze IS NULL AND last_autoanalyze IS NULL THEN 'Never analyzed'
        WHEN n_mod_since_analyze > 1000 THEN 'Needs analysis'
        ELSE 'OK'
    END as analysis_status
FROM pg_stat_user_tables 
WHERE n_mod_since_analyze > 1000 
   OR (last_analyze IS NULL AND last_autoanalyze IS NULL)
ORDER BY n_mod_since_analyze DESC;

-- =============================================================================
-- PERFORMANCE TUNING QUERIES
-- =============================================================================

-- Slow queries from pg_stat_statements (if extension is enabled)
-- Note: Requires pg_stat_statements extension
/*
SELECT 
    query,
    calls,
    total_time,
    mean_time,
    max_time,
    rows,
    100.0 * shared_blks_hit / nullif(shared_blks_hit + shared_blks_read, 0) AS hit_percent
FROM pg_stat_statements 
WHERE query LIKE '%documents%' 
   OR query LIKE '%embedding%'
   OR query LIKE '%match_documents%'
ORDER BY mean_time DESC
LIMIT 10;
*/

-- Cache hit ratio
SELECT 
    'Buffer Cache Hit Ratio' as metric,
    ROUND(
        (sum(heap_blks_hit) / (sum(heap_blks_hit) + sum(heap_blks_read))) * 100, 
        2
    ) as percentage
FROM pg_statio_user_tables
WHERE heap_blks_hit + heap_blks_read > 0

UNION ALL

SELECT 
    'Index Cache Hit Ratio' as metric,
    ROUND(
        (sum(idx_blks_hit) / (sum(idx_blks_hit) + sum(idx_blks_read))) * 100, 
        2
    ) as percentage
FROM pg_statio_user_indexes
WHERE idx_blks_hit + idx_blks_read > 0;

-- =============================================================================
-- VECTOR-SPECIFIC MONITORING
-- =============================================================================

-- Embedding quality check
SELECT 
    COUNT(*) as total_documents,
    COUNT(embedding) as documents_with_embeddings,
    COUNT(*) - COUNT(embedding) as documents_missing_embeddings,
    ROUND(
        (COUNT(embedding)::numeric / COUNT(*)::numeric) * 100, 
        2
    ) as embedding_coverage_percentage
FROM documents;

-- Vector similarity performance test
SELECT 
    'Vector Similarity Test' as test_name,
    COUNT(*) as sample_size,
    MIN(similarity) as min_similarity,
    MAX(similarity) as max_similarity,
    AVG(similarity) as avg_similarity,
    STDDEV(similarity) as stddev_similarity
FROM (
    SELECT 
        1 - (d1.embedding <=> d2.embedding) as similarity
    FROM documents d1
    CROSS JOIN documents d2
    WHERE d1.id != d2.id
      AND d1.embedding IS NOT NULL 
      AND d2.embedding IS NOT NULL
    LIMIT 1000
) similarity_sample;

-- =============================================================================
-- HEALTH CHECK SUMMARY
-- =============================================================================

-- Overall database health summary
WITH health_metrics AS (
    SELECT 
        'Total Connections' as metric,
        COUNT(*)::text as value,
        CASE WHEN COUNT(*) > 80 THEN 'WARNING' ELSE 'OK' END as status
    FROM pg_stat_activity 
    WHERE datname = current_database()
    
    UNION ALL
    
    SELECT 
        'Documents Count' as metric,
        COUNT(*)::text as value,
        'OK' as status
    FROM documents
    
    UNION ALL
    
    SELECT 
        'Embeddings Coverage' as metric,
        ROUND((COUNT(embedding)::numeric / COUNT(*)::numeric) * 100, 2)::text || '%' as value,
        CASE 
            WHEN COUNT(embedding)::numeric / COUNT(*)::numeric > 0.9 THEN 'OK'
            WHEN COUNT(embedding)::numeric / COUNT(*)::numeric > 0.5 THEN 'WARNING'
            ELSE 'CRITICAL'
        END as status
    FROM documents
    
    UNION ALL
    
    SELECT 
        'Vector Extension' as metric,
        CASE WHEN COUNT(*) > 0 THEN 'Installed' ELSE 'Missing' END as value,
        CASE WHEN COUNT(*) > 0 THEN 'OK' ELSE 'CRITICAL' END as status
    FROM pg_extension 
    WHERE extname = 'vector'
)
SELECT 
    metric,
    value,
    status,
    CASE status
        WHEN 'OK' THEN '✅'
        WHEN 'WARNING' THEN '⚠️'
        WHEN 'CRITICAL' THEN '❌'
    END as indicator
FROM health_metrics
ORDER BY 
    CASE status
        WHEN 'CRITICAL' THEN 1
        WHEN 'WARNING' THEN 2
        WHEN 'OK' THEN 3
    END;