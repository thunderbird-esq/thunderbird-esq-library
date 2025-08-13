-- scripts/verify-pgvector.sql
-- This script checks if the pgvector extension is installed in the 'extensions' schema.
-- It exits with a non-zero code if the extension is not found, which will cause the
-- calling shell script to fail.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_extension ext
    JOIN pg_namespace nsp ON ext.extnamespace = nsp.oid
    WHERE ext.extname = 'vector' AND nsp.nspname = 'extensions'
  ) THEN
    -- Raise an exception to return a non-zero exit code
    RAISE EXCEPTION 'pgvector extension not found in extensions schema';
  END IF;
END;
$$;
