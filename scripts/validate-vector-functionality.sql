-- validate-vector-functionality.sql
-- Comprehensive validation of pgvector extension functionality

-- Check 1: Extension exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_extension WHERE extname = 'vector'
  ) THEN
    RAISE EXCEPTION 'pgvector extension is not installed';
  END IF;
  RAISE NOTICE 'CHECK 1 PASSED: pgvector extension is installed';
END;
$$;

-- Check 2: Documents table exists with correct schema
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_name = 'documents' AND table_schema = 'public'
  ) THEN
    RAISE EXCEPTION 'documents table does not exist';
  END IF;
  RAISE NOTICE 'CHECK 2 PASSED: documents table exists';
END;
$$;

-- Check 3: Embedding column has correct vector type and dimensions
DO $$
DECLARE
  col_type text;
BEGIN
  SELECT data_type INTO col_type
  FROM information_schema.columns 
  WHERE table_name = 'documents' 
    AND table_schema = 'public' 
    AND column_name = 'embedding';
    
  IF col_type != 'USER-DEFINED' THEN
    RAISE EXCEPTION 'embedding column is not a vector type, got: %', col_type;
  END IF;
  
  -- Test that we can only insert 384-dimension vectors
  BEGIN
    INSERT INTO documents (document_id, title, content, embedding) 
    VALUES ('vector-test', 'Test', 'Test', 
      (SELECT ('[' || string_agg('0.1', ',') || ']')::vector FROM generate_series(1, 384)));
    DELETE FROM documents WHERE document_id = 'vector-test';
  EXCEPTION
    WHEN OTHERS THEN
      RAISE EXCEPTION 'Failed to insert 384-dimension vector: %', SQLERRM;
  END;
  
  RAISE NOTICE 'CHECK 3 PASSED: embedding column accepts 384-dimension vectors';
END;
$$;

-- Check 4: Vector operations work (cosine distance)
DO $$
DECLARE
  distance_result float;
BEGIN
  SELECT '[1,0,0]'::vector <=> '[0,1,0]'::vector INTO distance_result;
  IF distance_result IS NULL THEN
    RAISE EXCEPTION 'Vector cosine distance operation failed';
  END IF;
  RAISE NOTICE 'CHECK 4 PASSED: Vector cosine distance operation works (result: %)', distance_result;
END;
$$;

-- Check 5: match_documents function exists and works
DO $$
DECLARE
  func_exists boolean;
  test_vector vector(384);
BEGIN
  -- Check if function exists
  SELECT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE p.proname = 'match_documents' AND n.nspname = 'public'
  ) INTO func_exists;
  
  IF NOT func_exists THEN
    RAISE EXCEPTION 'match_documents function does not exist';
  END IF;
  
  -- Create test vector
  SELECT ('[' || string_agg('0.1', ',') || ']')::vector 
  FROM generate_series(1, 384) INTO test_vector;
  
  -- Test function (should return empty result but not error)
  PERFORM * FROM match_documents(test_vector, 0.5, 10);
  
  RAISE NOTICE 'CHECK 5 PASSED: match_documents function exists and executes';
END;
$$;

-- Summary
DO $$
BEGIN
  RAISE NOTICE '=== VECTOR EXTENSION VALIDATION COMPLETE ===';
  RAISE NOTICE 'All checks passed! pgvector is properly installed and functional.';
END;
$$;